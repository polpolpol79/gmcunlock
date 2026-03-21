import { NextResponse } from "next/server";
import {
  GOOGLE_TOKENS_COOKIE,
  parseGoogleTokensCookie,
  readCookieValueFromHeader,
} from "@/lib/google";

type Json = Record<string, unknown>;

export async function GET(req: Request): Promise<NextResponse<Json>> {
  const raw = readCookieValueFromHeader(req.headers.get("cookie"), GOOGLE_TOKENS_COOKIE);
  const connected = !!(raw && parseGoogleTokensCookie(raw));
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

