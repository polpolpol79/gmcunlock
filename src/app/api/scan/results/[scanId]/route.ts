import { NextResponse } from "next/server";
import { getAppUserIdFromRequest } from "@/lib/app-session";
import { getScanResultById, getScanResultForUser } from "@/lib/scan-store";
import { toSiteFingerprint, type CrawlResult } from "@/lib/crawler";

export async function GET(
  _req: Request,
  context: { params: { scanId: string } }
) {
  try {
    const scanId = context.params.scanId?.trim();
    if (!scanId) {
      return NextResponse.json(
        { ok: false, error: "Missing scanId param" },
        { status: 400 }
      );
    }

    const userId = getAppUserIdFromRequest(_req);
    const row = userId
      ? await getScanResultForUser(scanId, userId)
      : await getScanResultById(scanId);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Scan not found" },
        { status: 404 }
      );
    }

    const crawl = row.crawl as CrawlResult | null;

    return NextResponse.json({
      ok: true,
      data: {
        scan_id: row.id,
        url: row.url,
        scan_type: row.scan_type ?? "free",
        google_connected: row.google_connected ?? false,
        profile: row.profile,
        fingerprint: crawl ? toSiteFingerprint(crawl) : null,
        pagespeed: row.pagespeed,
        crawl: row.crawl,
        analysis: row.analysis,
        created_at: row.created_at ?? null,
        scan_status: row.scan_status ?? "done",
        scan_phase: row.scan_phase ?? null,
        scan_phase_detail: row.scan_phase_detail ?? null,
        scan_error: row.scan_error ?? null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load scan";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

