import { NextResponse } from "next/server";
import { getAppUserIdFromRequest } from "@/lib/app-session";
import {
  GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_TOKENS_COOKIE,
  deleteGoogleConnectionForUser,
  exchangeCodeForGoogleTokens,
  getGoogleRedirectUri,
  readCookieValueFromHeader,
  upsertGoogleTokensForUser,
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
    const userId = getAppUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.redirect(
        `${baseUrl}${returnTo}${separator}google_error=${encodeURIComponent("missing_app_session")}`
      );
    }

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
    await deleteGoogleConnectionForUser(userId);
    await upsertGoogleTokensForUser(userId, tokens);

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
    res.cookies.set(GOOGLE_TOKENS_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (oauthError) {
    return NextResponse.redirect(
      `${baseUrl}${returnTo}${separator}google_error=${encodeURIComponent(
        oauthError instanceof Error ? oauthError.message : "oauth_failed"
      )}`
    );
  }
}

