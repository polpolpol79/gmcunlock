import { NextResponse } from "next/server";
import { getScanResultById } from "@/lib/scan-store";
import { SCAN_PHASE_LABELS, type ScanPhaseKey } from "@/lib/scan-progress-phases";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: { scanId: string } }
) {
  const scanId = context.params.scanId?.trim();
  if (!scanId) {
    return NextResponse.json({ ok: false, error: "Missing scanId" }, { status: 400 });
  }

  const row = await getScanResultById(scanId);
  if (!row) {
    return NextResponse.json({ ok: false, error: "Scan not found" }, { status: 404 });
  }

  const rawStatus = (row.scan_status as string | undefined) ?? "done";
  const phase = row.scan_phase ?? (rawStatus === "done" ? "done" : "queued");
  const phaseLabel =
    phase && phase in SCAN_PHASE_LABELS
      ? SCAN_PHASE_LABELS[phase as ScanPhaseKey]
      : phase
        ? phase.replace(/_/g, " ")
        : "Progress";

  return NextResponse.json({
    ok: true,
    data: {
      scan_id: row.id,
      status: rawStatus,
      phase,
      phase_label: phaseLabel,
      detail: row.scan_phase_detail ?? "",
      error: row.scan_error ?? null,
      scan_type: row.scan_type ?? "free",
    },
  });
}
