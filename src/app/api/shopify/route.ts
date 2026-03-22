import { NextResponse } from "next/server";
import { getAppUserIdFromRequest } from "@/lib/app-session";
import { getShopifyConnectionForUser } from "@/lib/shopify";

type Json = Record<string, unknown>;

export async function GET(req: Request): Promise<NextResponse<Json>> {
  const userId = getAppUserIdFromRequest(req);
  const connection = userId ? await getShopifyConnectionForUser(userId) : null;
  return NextResponse.json({
    ok: true,
    route: "shopify",
    connected: Boolean(connection),
    shop: connection?.shop ?? null,
    oauth_start: "/api/shopify/oauth/start",
    oauth_callback: "/api/shopify/oauth/callback",
    disconnect_endpoint: "/api/shopify/disconnect",
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

