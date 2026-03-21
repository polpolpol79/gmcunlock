import { NextResponse } from "next/server";

type Json = Record<string, unknown>;

export async function GET(): Promise<NextResponse<Json>> {
  return NextResponse.json({
    ok: true,
    route: "shopify",
    message: "Shopify API is ready (not implemented yet).",
  });
}

export async function POST(): Promise<NextResponse<Json>> {
  return NextResponse.json(
    {
      ok: false,
      route: "shopify",
      error: "Not implemented",
    },
    { status: 501 }
  );
}

