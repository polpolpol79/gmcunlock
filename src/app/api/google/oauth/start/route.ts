import { NextResponse } from "next/server";
import { applyAppSessionCookie, ensureAppUserSession } from "@/lib/app-session";
import {
  GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  buildGoogleOAuthUrl,
  createGoogleOAuthState,
  getGoogleRedirectUri,
} from "@/lib/google";


function safeReturnTo(input: string | null): string {
  if (!input) return "/report";
  if (!input.startsWith("/") || input.startsWith("//")) return "/report";
  return input;
}

export async function GET(req: Request) {
  try {
    const session = await ensureAppUserSession(req);
    const url = new URL(req.url);
    const returnTo = safeReturnTo(url.searchParams.get("return_to"));
    // Embed returnTo inside the state so it survives the full OAuth round-trip
    const state = createGoogleOAuthState(returnTo);
    const redirectUri = getGoogleRedirectUri(req);
    const oauthUrl = buildGoogleOAuthUrl({ state, redirectUri });

    const res = NextResponse.redirect(oauthUrl);
    // Store only the nonce part in the cookie for CSRF validation
    const nonce = state.split("|")[0];
    res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https://"),
      path: "/",
      maxAge: 60 * 10,
    });
    // Keep return_to cookie as fallback for older sessions
    res.cookies.set(GOOGLE_OAUTH_RETURN_TO_COOKIE, encodeURIComponent(returnTo), {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https://"),
      path: "/",
      maxAge: 60 * 10,
    });
    applyAppSessionCookie(res, req, session);
    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start Google OAuth";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

