import { NextResponse } from "next/server";
import { applyAppSessionCookie, ensureAppUserSession } from "@/lib/app-session";
import { FullScanRequestSchema } from "@/lib/scan-schemas";
import {
  completeScanResult,
  createPendingScanResult,
  failScanResult,
  getScanResultForUser,
  saveScanResult,
  scheduleScanBackground,
  type StoredScanRow,
} from "@/lib/scan-store";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import {
  ScanTimeoutError,
  scanTimeoutResponse,
  withScanTimeBudget,
} from "@/lib/scan-route-timeout";
import {
  defaultCrawlDataForFree,
  defaultPageSpeedDataForFree,
  normalizeFreeScanInputUrl,
  runFreeScanPipeline,
} from "@/lib/scan-execute-free";
import { toSiteFingerprint, type CrawlResult } from "@/lib/crawler";
import { phaseDetailFor, SCAN_PHASES } from "@/lib/scan-progress-phases";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mapRowToFreePayload(row: StoredScanRow) {
  const crawl = row.crawl as CrawlResult | null;
  return {
    scan_id: row.id,
    scan_type: "free" as const,
    google_connected: false,
    fingerprint: crawl ? toSiteFingerprint(crawl) : null,
    pagespeed: row.pagespeed,
    crawl: row.crawl,
    analysis: row.analysis,
  };
}

export async function POST(req: Request) {
  try {
    const rate = consumeRateLimit({
      key: getClientKey(req),
      bucket: "scan_free",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many free scan requests. Please retry in a minute." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as unknown;
    const parsedReq = FullScanRequestSchema.safeParse(body);
    if (!parsedReq.success) {
      const firstIssue = parsedReq.error.issues[0];
      return NextResponse.json(
        { ok: false, error: firstIssue?.message ?? "Invalid request body" },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const url = normalizeFreeScanInputUrl(parsedReq.data.url);
    const profile = parsedReq.data.profile;
    const session = await ensureAppUserSession(req);

    const pendingId = await createPendingScanResult({
      user_id: session.userId,
      url,
      scan_type: "free",
      google_connected: false,
      profile,
      pagespeed: defaultPageSpeedDataForFree("Pending"),
      crawl: defaultCrawlDataForFree(url),
      phaseDetail: phaseDetailFor(SCAN_PHASES.queued),
    });

    const runJob = async (scanId: string) => {
      try {
        const result = await runFreeScanPipeline(url, profile, scanId);
        const ok = await completeScanResult(scanId, {
          pagespeed: result.pagespeed,
          crawl: result.crawl,
          analysis: result.analysis,
        });
        if (!ok) {
          await failScanResult(scanId, "Could not save scan results.");
        } else {
          console.info("[scan/free] completed", { scan_id: scanId, url });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Free scan failed";
        await failScanResult(scanId, msg);
        console.error("[scan/free] job error", { scanId, msg });
      }
    };

    if (pendingId) {
      const deferred = await scheduleScanBackground(() => runJob(pendingId));
      if (deferred) {
        const res = NextResponse.json(
          {
            ok: true,
            data: {
              pending: true,
              scan_id: pendingId,
              scan_type: "free",
              google_connected: false,
            },
          },
          { status: 202 }
        );
        applyAppSessionCookie(res, req, session);
        return res;
      }

      await runJob(pendingId);
      const row = await getScanResultForUser(pendingId, session.userId);
      if (!row) {
        return NextResponse.json({ ok: false, error: "Scan finished but result not found." }, { status: 500 });
      }
      if (row.scan_status === "error") {
        return NextResponse.json(
          { ok: false, error: row.scan_error ?? "Scan failed" },
          { status: 500 }
        );
      }
      const res = NextResponse.json({ ok: true, data: mapRowToFreePayload(row) });
      applyAppSessionCookie(res, req, session);
      return res;
    }

    /** Free sync scan: 45s budget (PageSpeed + crawl in parallel + Claude). */
    const FREE_SYNC_SCAN_BUDGET_MS = 45_000;

    try {
      return await withScanTimeBudget(FREE_SYNC_SCAN_BUDGET_MS, async () => {
        const result = await runFreeScanPipeline(url, profile, null);
        const scan_id = await saveScanResult({
          user_id: session.userId,
          url,
          scan_type: "free",
          google_connected: false,
          profile,
          pagespeed: result.pagespeed,
          crawl: result.crawl,
          analysis: result.analysis,
        });
        if (!scan_id) {
          console.warn("[scan/free] persisted without scan_id", { url });
        } else {
          console.info("[scan/free] completed", { scan_id, url });
        }

        const res = NextResponse.json({
          ok: true,
          data: {
            scan_id,
            scan_type: "free",
            google_connected: false,
            fingerprint: toSiteFingerprint(result.crawl),
            pagespeed: result.pagespeed,
            crawl: result.crawl,
            analysis: result.analysis,
          },
        });
        applyAppSessionCookie(res, req, session);
        return res;
      });
    } catch (inner) {
      if (inner instanceof ScanTimeoutError) {
        return scanTimeoutResponse(FREE_SYNC_SCAN_BUDGET_MS);
      }
      throw inner;
    }
  } catch (error) {
    if (error instanceof ScanTimeoutError) {
      return scanTimeoutResponse();
    }
    const message = error instanceof Error ? error.message : "Free scan failed unexpectedly";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
