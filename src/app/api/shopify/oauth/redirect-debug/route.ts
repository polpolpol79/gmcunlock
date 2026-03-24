import { NextResponse } from "next/server";
import { getShopifyRedirectUri } from "@/lib/shopify";

export const dynamic = "force-dynamic";

/**
 * Open this URL in the browser (same domain you use for GMC Unlock) to see the exact
 * redirect_uri sent to Shopify. Paste that string into Partners → Allowed redirection URLs.
 */
export async function GET(req: Request) {
  const envOverride = process.env.SHOPIFY_REDIRECT_URI?.trim() || "";
  const redirectUri = getShopifyRedirectUri(req);
  const hostRaw = req.headers.get("x-forwarded-host") ?? req.headers.get("host");

  return NextResponse.json({
    ok: true,
    redirect_uri: redirectUri,
    /** If set, this value overrides the host — must match Partners exactly */
    SHOPIFY_REDIRECT_URI_set: Boolean(envOverride),
    SHOPIFY_REDIRECT_URI_value: envOverride || null,
    forwarded_host: req.headers.get("x-forwarded-host"),
    host: req.headers.get("host"),
    proto: req.headers.get("x-forwarded-proto"),
    hint_he:
      "העתק את redirect_uri למעלה ל-Shopify Partners → Allowed redirection URLs (בדיוק אותו טקסט). אם יש www וגם בלי www — הוסף שני שורות. אם יש SHOPIFY_REDIRECT_URI ב-Vercel והוא שגוי — מחק או תקן.",
  });
}
