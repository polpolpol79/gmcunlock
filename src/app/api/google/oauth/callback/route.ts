import { NextResponse } from "next/server";
import {
  GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_TOKENS_COOKIE,
  exchangeCodeForGoogleTokens,
  getGoogleRedirectUri,
  parseGoogleTokensCookie,
  readCookieValueFromHeader,
  refreshGoogleAccessToken,
  serializeGoogleTokens,
} from "@/lib/google";

function getAppBaseUrl(req: Request): string {
  const explicit = process.env.NEXTAUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

function safeReturnTo(input: string | null | undefined): string {
  if (!input) return "/report";
  const decoded = decodeURIComponent(input);
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/report";
  return decoded;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const baseUrl = getAppBaseUrl(req);
  const returnToCookie = readCookieValueFromHeader(
    req.headers.get("cookie"),
    GOOGLE_OAUTH_RETURN_TO_COOKIE
  );
  const returnTo = safeReturnTo(returnToCookie);
  const separator = returnTo.includes("?") ? "&" : "?";

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}${returnTo}${separator}google_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}${returnTo}${separator}google_error=${encodeURIComponent("missing_code_or_state")}`
    );
  }

  try {
    const storedState = readCookieValueFromHeader(
      req.headers.get("cookie"),
      GOOGLE_OAUTH_STATE_COOKIE
    );
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(
        `${baseUrl}${returnTo}${separator}google_error=${encodeURIComponent("invalid_oauth_state")}`
      );
    }

    const redirectUri = getGoogleRedirectUri();
    const tokens = await exchangeCodeForGoogleTokens({ code, redirectUri });

    const res = NextResponse.redirect(
      `${baseUrl}${returnTo}${separator}google_connected=1`
    );
    res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
      path: "/",
      maxAge: 0,
    });
    res.cookies.set(GOOGLE_OAUTH_RETURN_TO_COOKIE, "", {
      path: "/",
      maxAge: 0,
    });
    res.cookies.set(GOOGLE_TOKENS_COOKIE, serializeGoogleTokens(tokens), {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https://"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (oauthError) {
    return NextResponse.redirect(
      `${baseUrl}${returnTo}${separator}google_error=${encodeURIComponent(
        oauthError instanceof Error ? oauthError.message : "oauth_failed"
      )}`
    );
  }
}

export async function POST(req: Request) {
  try {
    const raw = readCookieValueFromHeader(req.headers.get("cookie"), GOOGLE_TOKENS_COOKIE);
    if (!raw) {
      return NextResponse.json({ ok: false, error: "Not connected" }, { status: 401 });
    }

    const parsed = parseGoogleTokensCookie(raw);
    if (!parsed?.refresh_token) {
      return NextResponse.json(
        { ok: false, error: "No refresh token available" },
        { status: 400 }
      );
    }

    const refreshed = await refreshGoogleAccessToken(parsed.refresh_token);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(GOOGLE_TOKENS_COOKIE, serializeGoogleTokens(refreshed), {
      httpOnly: true,
      sameSite: "lax",
      secure: getGoogleRedirectUri().startsWith("https://"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Token refresh failed",
      },
      { status: 500 }
    );
  }
}

