import { NextResponse } from "next/server";
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
    const url = new URL(req.url);
    const returnTo = safeReturnTo(url.searchParams.get("return_to"));
    const state = createGoogleOAuthState();
    const redirectUri = getGoogleRedirectUri();
    const oauthUrl = buildGoogleOAuthUrl({ state, redirectUri });

    const res = NextResponse.redirect(oauthUrl);
    res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https://"),
      path: "/",
      maxAge: 60 * 10,
    });
    res.cookies.set(GOOGLE_OAUTH_RETURN_TO_COOKIE, encodeURIComponent(returnTo), {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https://"),
      path: "/",
      maxAge: 60 * 10,
    });
    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start Google OAuth";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

