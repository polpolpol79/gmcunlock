import { NextResponse } from "next/server";

type Json = Record<string, unknown>;

export async function GET(): Promise<NextResponse<Json>> {
  return NextResponse.json({
    ok: true,
    route: "scan",
    message: "Scan API is ready (not implemented yet).",
  });
}

export async function POST(req: Request): Promise<NextResponse<Json>> {
  // Keep the API contract simple for now; implement scanning in a follow-up step.
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // ignore invalid json; will be handled below
  }

  if (body == null) {
    return NextResponse.json(
      { ok: false, route: "scan", error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { ok: false, route: "scan", error: "Not implemented" },
    { status: 501 }
  );
}

