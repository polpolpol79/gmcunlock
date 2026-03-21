import { NextResponse } from "next/server";
import {
  GOOGLE_TOKENS_COOKIE,
  fetchAllGoogleConnectedData,
  parseGoogleTokensCookie,
  readCookieValueFromHeader,
  refreshGoogleAccessToken,
  serializeGoogleTokens,
} from "@/lib/google";

function isExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}

function shouldUseSecureCookie(req: Request): boolean {
  const explicit = process.env.NEXTAUTH_URL;
  if (explicit) return explicit.startsWith("https://");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return proto === "https";
}

export async function GET(req: Request) {
  try {
    const raw = readCookieValueFromHeader(req.headers.get("cookie"), GOOGLE_TOKENS_COOKIE);
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Google is not connected" },
        { status: 401 }
      );
    }

    let tokens = parseGoogleTokensCookie(raw);
    if (!tokens) {
      return NextResponse.json(
        { ok: false, error: "Invalid Google session" },
        { status: 401 }
      );
    }

    let didRefresh = false;
    if (isExpired(tokens.expires_at)) {
      if (!tokens.refresh_token) {
        return NextResponse.json(
          { ok: false, error: "Google token expired, reconnect required" },
          { status: 401 }
        );
      }
      tokens = await refreshGoogleAccessToken(tokens.refresh_token);
      didRefresh = true;
    }

    const data = await fetchAllGoogleConnectedData(tokens.access_token);
    const res = NextResponse.json({ ok: true, data });

    if (didRefresh) {
      res.cookies.set(GOOGLE_TOKENS_COOKIE, serializeGoogleTokens(tokens), {
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureCookie(req),
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Google data";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

