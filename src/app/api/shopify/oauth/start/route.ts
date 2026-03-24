import { NextResponse } from "next/server";
import { applyAppSessionCookie, ensureAppUserSession } from "@/lib/app-session";
import {
  SHOPIFY_OAUTH_RETURN_TO_COOKIE,
  SHOPIFY_OAUTH_SHOP_COOKIE,
  SHOPIFY_OAUTH_STATE_COOKIE,
  buildShopifyOAuthUrl,
  createShopifyOAuthState,
  getShopifyRedirectUri,
  isValidShopDomain,
  normalizeShopDomain,
} from "@/lib/shopify";

function safeReturnTo(input: string | null): string {
  if (!input) return "/report";
  if (!input.startsWith("/") || input.startsWith("//")) return "/report";
  return input;
}

export async function GET(req: Request) {
  try {
    const session = await ensureAppUserSession(req);
    const url = new URL(req.url);
    const shop = normalizeShopDomain(url.searchParams.get("shop") ?? "");
    if (!isValidShopDomain(shop)) {
      return NextResponse.json(
        { ok: false, error: "Valid Shopify shop domain is required (example.myshopify.com)." },
        { status: 400 }
      );
    }

    const returnTo = safeReturnTo(url.searchParams.get("return_to"));
    // Embed returnTo in state so it survives the full OAuth round-trip
    const state = createShopifyOAuthState(returnTo);
    const nonce = state.split("|")[0];
    const redirectUri = getShopifyRedirectUri();
    const oauthUrl = buildShopifyOAuthUrl({ shop, state, redirectUri });
    const res = NextResponse.redirect(oauthUrl);
    // Store only the nonce for CSRF validation
    res.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https://"),
      path: "/",
      maxAge: 60 * 10,
    });
    // Keep return_to cookie as fallback
    res.cookies.set(SHOPIFY_OAUTH_RETURN_TO_COOKIE, encodeURIComponent(returnTo), {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https://"),
      path: "/",
      maxAge: 60 * 10,
    });
    res.cookies.set(SHOPIFY_OAUTH_SHOP_COOKIE, shop, {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https://"),
      path: "/",
      maxAge: 60 * 10,
    });
    applyAppSessionCookie(res, req, session);
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start Shopify OAuth";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
