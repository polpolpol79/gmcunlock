import { NextResponse } from "next/server";
import {
  executeFullScanAnalyzeContinuation,
  getScanJobContinueSecret,
} from "@/lib/scan-execute-full";

/** Second serverless invocation: Claude + save (avoids single 300s Vercel cap on full pipeline). */
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = req.headers.get("x-scan-continue-secret");
  const expected = getScanJobContinueSecret();
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { scan_id?: string };
  try {
    body = (await req.json()) as { scan_id?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const scanId = body.scan_id?.trim();
  if (!scanId) {
    return NextResponse.json({ ok: false, error: "Missing scan_id" }, { status: 400 });
  }

  try {
    await executeFullScanAnalyzeContinuation(scanId);
  } catch (e) {
    console.error("[scan/full/analyze]", e);
    return NextResponse.json({ ok: false, error: "Analyze step failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
