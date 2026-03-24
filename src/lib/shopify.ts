import axios from "axios";
import crypto from "crypto";
import {
  deleteConnectedAccount,
  getConnectedAccount,
  upsertConnectedAccount,
} from "@/lib/connection-store";

export const SHOPIFY_OAUTH_STATE_COOKIE = "gmc_shopify_oauth_state";
export const SHOPIFY_OAUTH_RETURN_TO_COOKIE = "gmc_shopify_oauth_return_to";
export const SHOPIFY_OAUTH_SHOP_COOKIE = "gmc_shopify_oauth_shop";

const SHOPIFY_SCOPES = [
  "read_products",
  "read_content",
];

export type ShopifyProductSample = {
  title?: string;
  price?: string;
  currency?: string;
  image_url?: string;
  status?: string;
  product_type?: string;
  vendor?: string;
};

export type ShopifyConnectedData = {
  connected: boolean;
  shop?: {
    id?: number;
    name?: string;
    email?: string;
    domain?: string;
    myshopify_domain?: string;
    plan_name?: string;
    country?: string;
    currency?: string;
  };
  policy_counts?: {
    privacy?: number;
    refund?: number;
    terms?: number;
    shipping?: number;
  };
  products?: ShopifyProductSample[];
  error?: string;
};

export function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function isValidShopDomain(shop: string): boolean {
  const normalized = normalizeShopDomain(shop);
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized);
}

function getShopifyOAuthConfig() {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET");
  }
  return { clientId, clientSecret };
}

/**
 * Must match **exactly** one "Allowed redirection URL" in Shopify Partners (same scheme, host, path — no trailing slash).
 * Prefer deriving from the incoming request on Vercel so it matches the domain the user opened (avoids www/apex mismatches).
 * Override with SHOPIFY_REDIRECT_URI if you need a single fixed URL.
 */
export function getShopifyRedirectUri(req?: Request): string {
  const explicit = process.env.SHOPIFY_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  if (req) {
    const hostRaw = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const host = hostRaw?.split(",")[0]?.trim();
    const proto =
      req.headers.get("x-forwarded-proto") ??
      (host && /localhost|127\.0\.0\.1|\[::1\]/i.test(host) ? "http" : "https");
    if (host) {
      const base = `${proto}://${host}`.replace(/\/$/, "");
      return `${base}/api/shopify/oauth/callback`;
    }
  }

  const base = (process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  return `${base}/api/shopify/oauth/callback`;
}

export function createShopifyOAuthState(returnTo?: string): string {
  const nonce = crypto.randomBytes(24).toString("hex");
  if (!returnTo) return nonce;
  return `${nonce}|${encodeURIComponent(returnTo)}`;
}

export function parseShopifyOAuthState(state: string): { nonce: string; returnTo: string } {
  const pipeIdx = state.indexOf("|");
  if (pipeIdx === -1) return { nonce: state, returnTo: "/report" };
  const nonce = state.slice(0, pipeIdx);
  const returnTo = decodeURIComponent(state.slice(pipeIdx + 1));
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return { nonce, returnTo: "/report" };
  return { nonce, returnTo };
}

export function buildShopifyOAuthUrl(params: {
  shop: string;
  state: string;
  redirectUri: string;
}): string {
  const { clientId } = getShopifyOAuthConfig();
  const shop = normalizeShopDomain(params.shop);
  const query = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_SCOPES.join(","),
    redirect_uri: params.redirectUri,
    state: params.state,
  });
  return `https://${shop}/admin/oauth/authorize?${query.toString()}`;
}

export function verifyShopifyCallback(url: URL): boolean {
  const { clientSecret } = getShopifyOAuthConfig();
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;
  const entries = [...url.searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b));
  const message = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const digest = crypto.createHmac("sha256", clientSecret).update(message).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

export async function exchangeCodeForShopifyToken(params: {
  shop: string;
  code: string;
}): Promise<string> {
  const { clientId, clientSecret } = getShopifyOAuthConfig();
  const shop = normalizeShopDomain(params.shop);
  const res = await axios.post<{ access_token: string }>(
    `https://${shop}/admin/oauth/access_token`,
    {
      client_id: clientId,
      client_secret: clientSecret,
      code: params.code,
    },
    { timeout: 20000 }
  );
  if (!res.data.access_token) throw new Error("Missing Shopify access token");
  return res.data.access_token;
}

function getLegacyShopifyEnv() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  return { domain, token };
}

async function fetchShopifyProducts(
  domain: string,
  token: string,
  limit = 10
): Promise<ShopifyProductSample[]> {
  const base = `https://${normalizeShopDomain(domain)}/admin/api/2024-10`;
  try {
    const res = await axios.get<{
      products?: Array<{
        title?: string;
        product_type?: string;
        vendor?: string;
        status?: string;
        variants?: Array<{ price?: string }>;
        images?: Array<{ src?: string }>;
      }>;
    }>(`${base}/products.json?limit=${limit}&fields=title,product_type,vendor,status,variants,images`, {
      timeout: 20000,
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      validateStatus: () => true,
    });

    return (res.data?.products ?? []).map((p) => ({
      title: p.title,
      price: p.variants?.[0]?.price,
      image_url: p.images?.[0]?.src,
      status: p.status,
      product_type: p.product_type || undefined,
      vendor: p.vendor || undefined,
    }));
  } catch {
    return [];
  }
}

async function fetchShopifyConnectedDataFromCredentials(
  domain: string,
  token: string
): Promise<ShopifyConnectedData> {
  const normalizedDomain = normalizeShopDomain(domain);
  const base = `https://${normalizedDomain}/admin/api/2024-10`;

  try {
    const headers = {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    };

    const [shopRes, privacyRes, refundRes, termsRes, shippingRes, products] = await Promise.all([
      axios.get<{ shop: ShopifyConnectedData["shop"] }>(`${base}/shop.json`, {
        timeout: 20000,
        headers,
      }),
      axios.get<{ policies?: unknown[] }>(`${base}/policies/privacy.json`, {
        timeout: 20000,
        headers,
        validateStatus: () => true,
      }),
      axios.get<{ policies?: unknown[] }>(`${base}/policies/refund.json`, {
        timeout: 20000,
        headers,
        validateStatus: () => true,
      }),
      axios.get<{ policies?: unknown[] }>(`${base}/policies/terms_of_service.json`, {
        timeout: 20000,
        headers,
        validateStatus: () => true,
      }),
      axios.get<{ policies?: unknown[] }>(`${base}/policies/shipping.json`, {
        timeout: 20000,
        headers,
        validateStatus: () => true,
      }),
      fetchShopifyProducts(normalizedDomain, token),
    ]);

    return {
      connected: true,
      shop: shopRes.data.shop,
      policy_counts: {
        privacy: Array.isArray(privacyRes.data?.policies) ? privacyRes.data.policies.length : 0,
        refund: Array.isArray(refundRes.data?.policies) ? refundRes.data.policies.length : 0,
        terms: Array.isArray(termsRes.data?.policies) ? termsRes.data.policies.length : 0,
        shipping: Array.isArray(shippingRes.data?.policies) ? shippingRes.data.policies.length : 0,
      },
      products,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Failed to fetch Shopify data",
    };
  }
}

/**
 * Produce a human-readable text summary of Shopify data for Claude.
 */
export function summarizeShopifyData(data: ShopifyConnectedData): string {
  if (!data.connected) return "Shopify: not connected";
  if (data.error) return `Shopify: connection error — ${data.error}`;

  const lines: string[] = ["SHOPIFY STORE:"];

  if (data.shop) {
    const s = data.shop;
    const parts = [
      s.name ? `Name: ${s.name}` : null,
      s.email ? `Email: ${s.email}` : null,
      s.domain ? `Domain: ${s.domain}` : null,
      s.myshopify_domain ? `Shopify domain: ${s.myshopify_domain}` : null,
      s.country ? `Country: ${s.country}` : null,
      s.currency ? `Currency: ${s.currency}` : null,
      s.plan_name ? `Plan: ${s.plan_name}` : null,
    ].filter(Boolean);
    lines.push(parts.join(" | "));
  }

  if (data.policy_counts) {
    const pc = data.policy_counts;
    const yn = (n?: number) => (n && n > 0 ? "Yes" : "No");
    lines.push(`\nPolicies: Privacy: ${yn(pc.privacy)} | Refund: ${yn(pc.refund)} | Terms: ${yn(pc.terms)} | Shipping: ${yn(pc.shipping)}`);
  }

  if (data.products && data.products.length > 0) {
    lines.push(`\nSample products (${data.products.length}):`);
    for (let i = 0; i < data.products.length; i++) {
      const p = data.products[i];
      const price = p.price ? `${p.price} ${p.currency ?? ""}`.trim() : "no price";
      const type = p.product_type ? `Type: ${p.product_type}` : "";
      const vendor = p.vendor ? `Vendor: ${p.vendor}` : "";
      const status = p.status ?? "unknown";
      const extras = [type, vendor].filter(Boolean).join(" | ");
      lines.push(`  ${i + 1}. "${p.title ?? "untitled"}" | ${price} | ${status}${extras ? ` | ${extras}` : ""}`);
    }
  }

  return lines.join("\n");
}

export async function upsertShopifyConnectionForUser(
  userId: string,
  shop: string,
  accessToken: string
): Promise<boolean> {
  const normalizedShop = normalizeShopDomain(shop);
  return upsertConnectedAccount({
    user_id: userId,
    provider: "shopify",
    account_identifier: normalizedShop,
    access_token: accessToken,
    refresh_token: null,
    token_expires_at: null,
    metadata: { shop: normalizedShop },
  });
}

export async function getShopifyConnectionForUser(userId: string): Promise<{
  shop: string;
  accessToken: string;
} | null> {
  const row = await getConnectedAccount(userId, "shopify");
  if (!row?.account_identifier || !row.access_token) return null;
  return { shop: row.account_identifier, accessToken: row.access_token };
}

export async function deleteShopifyConnectionForUser(userId: string): Promise<boolean> {
  return deleteConnectedAccount(userId, "shopify");
}

export async function fetchShopifyConnectedDataForUser(
  userId?: string | null
): Promise<ShopifyConnectedData> {
  if (userId) {
    const connection = await getShopifyConnectionForUser(userId);
    if (connection) {
      return fetchShopifyConnectedDataFromCredentials(connection.shop, connection.accessToken);
    }
  }

  const { domain, token } = getLegacyShopifyEnv();
  if (!domain || !token) {
    return {
      connected: false,
      error: "Shopify is not connected",
    };
  }

  return fetchShopifyConnectedDataFromCredentials(domain, token);
}

