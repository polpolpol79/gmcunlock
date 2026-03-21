import { NextResponse } from "next/server";
import { getScanResultById } from "@/lib/scan-store";

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

    const row = await getScanResultById(scanId);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Scan not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        scan_id: row.id,
        url: row.url,
        scan_type: row.scan_type ?? "free",
        google_connected: row.google_connected ?? false,
        profile: row.profile,
        pagespeed: row.pagespeed,
        crawl: row.crawl,
        analysis: row.analysis,
        created_at: row.created_at ?? null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load scan";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

