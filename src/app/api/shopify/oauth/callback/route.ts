import { NextResponse } from "next/server";
import { getAppUserIdFromRequest, readCookieValue } from "@/lib/app-session";
import {
  SHOPIFY_OAUTH_RETURN_TO_COOKIE,
  SHOPIFY_OAUTH_SHOP_COOKIE,
  SHOPIFY_OAUTH_STATE_COOKIE,
  exchangeCodeForShopifyToken,
  getShopifyRedirectUri,
  isValidShopDomain,
  normalizeShopDomain,
  parseShopifyOAuthState,
  upsertShopifyConnectionForUser,
  verifyShopifyCallback,
} from "@/lib/shopify";

function getAppBaseUrl(req: Request): string {
  const explicit = process.env.NEXTAUTH_URL || process.env.APP_URL;
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
  const baseUrl = getAppBaseUrl(req);
  const stateParam = url.searchParams.get("state") ?? "";

  // Extract returnTo from state (primary) or cookie (fallback)
  const { nonce: stateNonce, returnTo: returnToFromState } = stateParam
    ? parseShopifyOAuthState(stateParam)
    : { nonce: "", returnTo: "/report" };
  const returnToCookie = readCookieValue(req.headers.get("cookie"), SHOPIFY_OAUTH_RETURN_TO_COOKIE);
  const returnTo = returnToFromState !== "/report"
    ? returnToFromState
    : safeReturnTo(returnToCookie);
  const separator = returnTo.includes("?") ? "&" : "?";

  try {
    const userId = getAppUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.redirect(
        `${baseUrl}${returnTo}${separator}shopify_error=${encodeURIComponent("missing_app_session")}`
      );
    }

    if (!verifyShopifyCallback(url)) {
      return NextResponse.redirect(
        `${baseUrl}${returnTo}${separator}shopify_error=${encodeURIComponent("invalid_hmac")}`
      );
    }

    const code = url.searchParams.get("code");
    const shop = normalizeShopDomain(
      url.searchParams.get("shop") ??
        readCookieValue(req.headers.get("cookie"), SHOPIFY_OAUTH_SHOP_COOKIE) ??
        ""
    );
    // Validate CSRF: compare stored nonce with state nonce
    const storedNonce = readCookieValue(req.headers.get("cookie"), SHOPIFY_OAUTH_STATE_COOKIE);

    if (!code || !stateParam || !storedNonce || stateNonce !== storedNonce) {
      return NextResponse.redirect(
        `${baseUrl}${returnTo}${separator}shopify_error=${encodeURIComponent("invalid_state")}`
      );
    }
    if (!isValidShopDomain(shop)) {
      return NextResponse.redirect(
        `${baseUrl}${returnTo}${separator}shopify_error=${encodeURIComponent("invalid_shop")}`
      );
    }

    void getShopifyRedirectUri();
    const accessToken = await exchangeCodeForShopifyToken({ shop, code });
    await upsertShopifyConnectionForUser(userId, shop, accessToken);

    const res = NextResponse.redirect(
      `${baseUrl}${returnTo}${separator}shopify_connected=1&shop=${encodeURIComponent(shop)}`
    );
    res.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set(SHOPIFY_OAUTH_RETURN_TO_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set(SHOPIFY_OAUTH_SHOP_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (error) {
    return NextResponse.redirect(
      `${baseUrl}${returnTo}${separator}shopify_error=${encodeURIComponent(
        error instanceof Error ? error.message : "oauth_failed"
      )}`
    );
  }
}
