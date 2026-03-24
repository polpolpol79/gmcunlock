import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Split scan mode has been removed. Use /api/scan/full directly." },
    { status: 410 }
  );
}
