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
  "read_shopify_payments_payouts",
  "read_orders",
  "read_products",
  "read_content",
];

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

export function getShopifyRedirectUri(): string {
  if (process.env.SHOPIFY_REDIRECT_URI) return process.env.SHOPIFY_REDIRECT_URI;
  const base = (process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
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

    const [shopRes, privacyRes, refundRes, termsRes, shippingRes] = await Promise.all([
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
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Failed to fetch Shopify data",
    };
  }
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

