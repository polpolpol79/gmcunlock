import { NextResponse } from "next/server";

type Json = Record<string, unknown>;

export async function GET(): Promise<NextResponse<Json>> {
  return NextResponse.json({
    ok: true,
    route: "auth",
    message: "Auth API is not implemented yet.",
  });
}

export async function POST(): Promise<NextResponse<Json>> {
  return NextResponse.json(
    {
      ok: false,
      route: "auth",
      error: "Not implemented",
    },
    { status: 501 }
  );
}

