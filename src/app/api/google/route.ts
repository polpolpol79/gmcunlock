import { NextResponse } from "next/server";
import { getAppUserIdFromRequest } from "@/lib/app-session";
import { getGoogleTokensForUser } from "@/lib/google";

type Json = Record<string, unknown>;

export async function GET(req: Request): Promise<NextResponse<Json>> {
  const userId = getAppUserIdFromRequest(req);
  const connected = userId ? Boolean(await getGoogleTokensForUser(userId)) : false;
  return NextResponse.json({
    ok: true,
    route: "google",
    connected,
    oauth_start: "/api/google/oauth/start",
    oauth_callback: "/api/google/oauth/callback",
    data_endpoint: "/api/google/data",
    disconnect_endpoint: "/api/google/disconnect",
  });
}

export async function POST(): Promise<NextResponse<Json>> {
  return NextResponse.json({ ok: true, route: "google" });
}

