import { NextResponse } from "next/server";
import { FullScanRequestSchema } from "@/lib/scan-schemas";
import {
  completeScanResult,
  createPendingScanResult,
  failScanResult,
  getScanResultById,
  saveScanResult,
  scheduleScanBackground,
} from "@/lib/scan-store";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import {
  SCAN_ROUTE_BUDGET_MS,
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
import { phaseDetailFor, SCAN_PHASES } from "@/lib/scan-progress-phases";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mapRowToFreePayload(row: NonNullable<Awaited<ReturnType<typeof getScanResultById>>>) {
  const crawl = row.crawl as { fingerprint?: unknown };
  return {
    scan_id: row.id,
    scan_type: "free" as const,
    google_connected: false,
    fingerprint: crawl?.fingerprint ?? null,
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

    const pendingId = await createPendingScanResult({
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
        return NextResponse.json(
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
      }

      await runJob(pendingId);
      const row = await getScanResultById(pendingId);
      if (!row) {
        return NextResponse.json({ ok: false, error: "Scan finished but result not found." }, { status: 500 });
      }
      if (row.scan_status === "error") {
        return NextResponse.json(
          { ok: false, error: row.scan_error ?? "Scan failed" },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, data: mapRowToFreePayload(row) });
    }

    return await withScanTimeBudget(SCAN_ROUTE_BUDGET_MS, async () => {
      const result = await runFreeScanPipeline(url, profile, null);
      const scan_id = await saveScanResult({
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

      return NextResponse.json({
        ok: true,
        data: {
          scan_id,
          scan_type: "free",
          google_connected: false,
          fingerprint: result.crawl.fingerprint,
          pagespeed: result.pagespeed,
          crawl: result.crawl,
          analysis: result.analysis,
        },
      });
    });
  } catch (error) {
    if (error instanceof ScanTimeoutError) {
      return scanTimeoutResponse();
    }
    const message = error instanceof Error ? error.message : "Free scan failed unexpectedly";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
