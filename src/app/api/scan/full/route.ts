import { NextResponse } from "next/server";
import { applyAppSessionCookie, ensureAppUserSession } from "@/lib/app-session";
import { toSiteFingerprint, type CrawlResult } from "@/lib/crawler";
import { FullScanRequestSchema } from "@/lib/scan-schemas";
import {
  completeScanResult,
  createPendingScanResult,
  failScanResult,
  getScanResultForUser,
  saveScanResult,
  scheduleScanBackground,
} from "@/lib/scan-store";
import { SCAN_PHASES, phaseDetailFor } from "@/lib/scan-progress-phases";
import { verifyPaidScanToken } from "@/lib/payment-gate";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import {
  SCAN_ROUTE_BUDGET_MS,
  ScanTimeoutError,
  scanTimeoutResponse,
  withScanTimeBudget,
} from "@/lib/scan-route-timeout";
import {
  defaultCrawlData,
  defaultPageSpeedData,
  executeFullScanPipeline,
} from "@/lib/scan-execute-full";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeInputUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function POST(req: Request) {
  try {
    const rate = consumeRateLimit({
      key: getClientKey(req),
      bucket: "scan_paid",
      limit: 6,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many full scan requests. Please retry in a minute." },
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
    const paymentToken =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).payment_token
        : null;
    if (!verifyPaidScanToken(paymentToken)) {
      return NextResponse.json(
        { ok: false, error: "Valid payment token is required for full scan." },
        { status: 402 }
      );
    }

    const url = normalizeInputUrl(parsedReq.data.url);
    const profile = parsedReq.data.profile;
    const session = await ensureAppUserSession(req);

    const pendingId = await createPendingScanResult({
      user_id: session.userId,
      url,
      scan_type: "paid",
      google_connected: false,
      profile,
      pagespeed: defaultPageSpeedData("Pending"),
      crawl: defaultCrawlData(url),
      phaseDetail: phaseDetailFor(SCAN_PHASES.queued),
    });

    const runPaidJob = async (scanId: string) => {
      try {
        const result = await executeFullScanPipeline(req, url, profile, scanId);
        if (result.kind === "job_failed") return;
        if (result.kind === "fatal") {
          await failScanResult(
            scanId,
            typeof result.json.error === "string" ? result.json.error : "Full scan failed"
          );
          return;
        }
        const ok = await completeScanResult(scanId, {
          pagespeed: result.pageSpeedData,
          crawl: result.crawlData,
          analysis: result.analysis,
          google_connected: result.googleConnected,
        });
        if (!ok) {
          await failScanResult(scanId, "Could not save scan results.");
        } else {
          console.info("[scan/full] completed", {
            scan_id: scanId,
            url,
            googleConnected: result.googleConnected,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Full scan failed";
        await failScanResult(scanId, msg);
        console.error("[scan/full] job error", { scanId, msg });
      }
    };

    if (pendingId) {
      const deferred = await scheduleScanBackground(() => runPaidJob(pendingId));
      if (deferred) {
        const res = NextResponse.json(
          {
            ok: true,
            data: {
              pending: true,
              scan_id: pendingId,
              scan_type: "paid",
              google_connected: false,
            },
          },
          { status: 202 }
        );
        applyAppSessionCookie(res, req, session);
        return res;
      }

      await runPaidJob(pendingId);
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
      if (row.scan_status !== "done") {
        const res = NextResponse.json(
          {
            ok: true,
            data: {
              pending: true,
              scan_id: pendingId,
              scan_type: "paid",
              google_connected: row.google_connected ?? false,
            },
          },
          { status: 202 }
        );
        applyAppSessionCookie(res, req, session);
        return res;
      }
      const crawl = row.crawl as CrawlResult;
      const res = NextResponse.json({
        ok: true,
        data: {
          scan_id: row.id,
          scan_type: "paid" as const,
          google_connected: row.google_connected ?? false,
          fingerprint: toSiteFingerprint(crawl),
          pagespeed: row.pagespeed,
          crawl: row.crawl,
          analysis: row.analysis,
        },
      });
      applyAppSessionCookie(res, req, session);
      return res;
    }

    return await withScanTimeBudget(SCAN_ROUTE_BUDGET_MS, async () => {
      const result = await executeFullScanPipeline(req, url, profile, null);
      if (result.kind === "job_failed") {
        return NextResponse.json({ ok: false, error: "Unexpected scan state." }, { status: 500 });
      }
      if (result.kind === "fatal") {
        return NextResponse.json(result.json, { status: result.status });
      }

      const scan_id = await saveScanResult({
        user_id: session.userId,
        url,
        scan_type: "paid",
        google_connected: result.googleConnected,
        profile,
        pagespeed: result.pageSpeedData,
        crawl: result.crawlData,
        analysis: result.analysis,
      });
      if (!scan_id) {
        console.warn("[scan/full] persisted without scan_id", { url, googleConnected: result.googleConnected });
      } else {
        console.info("[scan/full] completed", { scan_id, url, googleConnected: result.googleConnected });
      }

      const res = NextResponse.json({
        ok: true,
        data: {
          scan_id,
          scan_type: "paid",
          google_connected: result.googleConnected,
          fingerprint: toSiteFingerprint(result.crawlData),
          pagespeed: result.pageSpeedData,
          crawl: result.crawlData,
          analysis: result.analysis,
        },
      });
      applyAppSessionCookie(res, req, session);
      return res;
    });
  } catch (error) {
    if (error instanceof ScanTimeoutError) {
      return scanTimeoutResponse();
    }
    const message =
      error instanceof Error ? error.message : "Full scan failed unexpectedly";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
