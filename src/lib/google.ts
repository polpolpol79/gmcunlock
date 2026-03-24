import axios from "axios";
import crypto from "crypto";
import {
  deleteConnectedAccount,
  getConnectedAccount,
  upsertConnectedAccount,
} from "@/lib/connection-store";

export const GOOGLE_OAUTH_STATE_COOKIE = "gmc_google_oauth_state";
export const GOOGLE_TOKENS_COOKIE = "gmc_google_tokens";
export const GOOGLE_OAUTH_RETURN_TO_COOKIE = "gmc_google_oauth_return_to";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_GOOGLE_REDIRECT_URI = "http://localhost:3000/api/google/oauth/callback";

/**
 * Google Content API and Google Ads API each have only ONE scope (no readonly variant).
 * The app only performs read operations in practice — no data is ever written or deleted.
 */
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/content",
  "https://www.googleapis.com/auth/adwords",
];

export type GoogleOAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  token_type?: string;
  scope?: string;
};

export type McAccountIssue = {
  id?: string;
  title?: string;
  severity?: string;
  detail?: string;
  documentation?: string;
  destination?: string;
  country?: string;
};

export type McProductStatus = {
  productId?: string;
  title?: string;
  link?: string;
  destinationStatuses?: Array<{
    destination?: string;
    status?: string;
    approvedCountries?: string[];
    disapprovedCountries?: string[];
    pendingCountries?: string[];
  }>;
  itemLevelIssues?: Array<{
    code?: string;
    severity?: string;
    description?: string;
    detail?: string;
    documentation?: string;
    servability?: string;
    attributeName?: string;
    resolution?: string;
  }>;
};

export type McProductSample = {
  id?: string;
  title?: string;
  description?: string;
  link?: string;
  price?: { value?: string; currency?: string };
  gtin?: string;
  brand?: string;
  imageLink?: string;
  availability?: string;
  condition?: string;
};

export type MerchantCenterData = {
  auth_method?: string;
  account_identifiers?: Array<{
    merchant_id?: string;
    aggregator_id?: string;
  }>;
  account_issues?: McAccountIssue[];
  product_statuses?: McProductStatus[];
  products_sample?: McProductSample[];
  raw?: unknown;
  error?: string;
};

export type GoogleAdsData = {
  accessible_customers?: string[];
  raw?: unknown;
  error?: string;
};

export type GoogleBusinessProfileData = {
  accounts?: Array<{
    name?: string;
    accountName?: string;
    type?: string;
  }>;
  raw?: unknown;
  error?: string;
  /** True when we do not call mybusinessaccountmanagement.googleapis.com */
  public_presence_only?: boolean;
  note?: string;
};

export type GoogleConnectedData = {
  merchant_center: MerchantCenterData;
  google_ads: GoogleAdsData;
  gmb: GoogleBusinessProfileData;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function getGoogleClientConfig() {
  return {
    clientId: getRequiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
  };
}

export function getRequestBaseUrl(req?: Request): string {
  if (req) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    if (host) {
      const normalizedHost = host.toLowerCase();
      const requestBase = `${proto}://${host}`;
      const isLocalHost =
        normalizedHost.startsWith("localhost:") ||
        normalizedHost.startsWith("127.0.0.1:") ||
        normalizedHost.startsWith("[::1]:");
      if (isLocalHost) return requestBase;
    }
  }
  const explicit = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (req) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    if (host) return `${proto}://${host}`;
  }
  return DEFAULT_GOOGLE_REDIRECT_URI.replace(/\/api\/google\/oauth\/callback$/, "");
}

export function getGoogleRedirectUri(req?: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return `${getRequestBaseUrl(req)}/api/google/oauth/callback`;
}

export function createGoogleOAuthState(returnTo?: string): string {
  const nonce = crypto.randomBytes(24).toString("hex");
  if (!returnTo) return nonce;
  // Encode returnTo inside the state so it survives the full OAuth round-trip
  // (cookies on 307 redirects are unreliable across browsers)
  return `${nonce}|${encodeURIComponent(returnTo)}`;
}

export function parseGoogleOAuthState(state: string): { nonce: string; returnTo: string } {
  const pipeIdx = state.indexOf("|");
  if (pipeIdx === -1) return { nonce: state, returnTo: "/report" };
  const nonce = state.slice(0, pipeIdx);
  const returnTo = decodeURIComponent(state.slice(pipeIdx + 1));
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return { nonce, returnTo: "/report" };
  return { nonce, returnTo };
}

export function buildGoogleOAuthUrl(params: {
  state: string;
  redirectUri: string;
}): string {
  const { clientId } = getGoogleClientConfig();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: SCOPES.join(" "),
    state: params.state,
  });
  return `${GOOGLE_AUTH_URL}?${query.toString()}`;
}

export async function exchangeCodeForGoogleTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<GoogleOAuthTokens> {
  const { clientId, clientSecret } = getGoogleClientConfig();
  const tokenRes = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20000,
    }
  );

  const data = tokenRes.data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Math.max(10, data.expires_in - 30) * 1000,
    token_type: data.token_type,
    scope: data.scope,
  };
}

export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<GoogleOAuthTokens> {
  const { clientId, clientSecret } = getGoogleClientConfig();
  const tokenRes = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20000,
    }
  );

  const data = tokenRes.data as {
    access_token: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() + Math.max(10, data.expires_in - 30) * 1000,
    token_type: data.token_type,
    scope: data.scope,
  };
}

export function serializeGoogleTokens(tokens: GoogleOAuthTokens): string {
  return Buffer.from(JSON.stringify(tokens), "utf8").toString("base64url");
}

export function parseGoogleTokensCookie(cookieValue: string): GoogleOAuthTokens | null {
  try {
    const json = Buffer.from(cookieValue, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as GoogleOAuthTokens;
    if (!parsed?.access_token || !parsed?.expires_at) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readCookieValueFromHeader(
  cookieHeader: string | null,
  name: string
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  const matched = parts.find((p) => p.startsWith(`${name}=`));
  if (!matched) return null;
  return matched.slice(name.length + 1);
}

export function readGoogleTokensFromRequest(req: Request): GoogleOAuthTokens | null {
  const raw = readCookieValueFromHeader(req.headers.get("cookie"), GOOGLE_TOKENS_COOKIE);
  if (!raw) return null;
  return parseGoogleTokensCookie(raw);
}

async function getJson<T>(url: string, accessToken: string, headers?: Record<string, string>) {
  const res = await axios.get<T>(url, {
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(headers ?? {}),
    },
  });
  return res.data;
}

async function fetchMcAccountStatuses(
  accessToken: string,
  merchantId: string
): Promise<McAccountIssue[]> {
  const url = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/accountstatuses/${merchantId}`;
  const raw = await getJson<{
    accountLevelIssues?: Array<{
      id?: string;
      title?: string;
      severity?: string;
      detail?: string;
      documentation?: string;
      destination?: string;
      country?: string;
    }>;
  }>(url, accessToken);
  return (raw.accountLevelIssues ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    severity: i.severity,
    detail: i.detail,
    documentation: i.documentation,
    destination: i.destination,
    country: i.country,
  }));
}

async function fetchMcProductStatuses(
  accessToken: string,
  merchantId: string,
  maxResults = 50
): Promise<McProductStatus[]> {
  const url = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/productstatuses?maxResults=${maxResults}`;
  const raw = await getJson<{
    resources?: Array<{
      productId?: string;
      title?: string;
      link?: string;
      destinationStatuses?: Array<{
        destination?: string;
        status?: string;
        approvedCountries?: string[];
        disapprovedCountries?: string[];
        pendingCountries?: string[];
      }>;
      itemLevelIssues?: Array<{
        code?: string;
        severity?: string;
        description?: string;
        detail?: string;
        documentation?: string;
        servability?: string;
        attributeName?: string;
        resolution?: string;
      }>;
    }>;
  }>(url, accessToken);
  return (raw.resources ?? []).map((p) => ({
    productId: p.productId,
    title: p.title,
    link: p.link,
    destinationStatuses: p.destinationStatuses,
    itemLevelIssues: p.itemLevelIssues,
  }));
}

async function fetchMcProducts(
  accessToken: string,
  merchantId: string,
  maxResults = 25
): Promise<McProductSample[]> {
  const url = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products?maxResults=${maxResults}`;
  const raw = await getJson<{
    resources?: Array<{
      id?: string;
      title?: string;
      description?: string;
      link?: string;
      price?: { value?: string; currency?: string };
      gtin?: string;
      brand?: string;
      imageLink?: string;
      availability?: string;
      condition?: string;
    }>;
  }>(url, accessToken);
  return (raw.resources ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    link: p.link,
    price: p.price,
    gtin: p.gtin,
    brand: p.brand,
    imageLink: p.imageLink,
    availability: p.availability,
    condition: p.condition,
  }));
}

export async function fetchMerchantCenterData(
  accessToken: string
): Promise<MerchantCenterData> {
  try {
    const authinfo = await getJson<{
      kind?: string;
      accountIdentifiers?: Array<{ merchantId?: string; aggregatorId?: string }>;
      authMethod?: string;
    }>("https://shoppingcontent.googleapis.com/content/v2.1/accounts/authinfo", accessToken);

    const identifiers = authinfo.accountIdentifiers?.map((item) => ({
      merchant_id: item.merchantId,
      aggregator_id: item.aggregatorId,
    }));

    const merchantId = identifiers?.[0]?.merchant_id;
    if (!merchantId) {
      return {
        auth_method: authinfo.authMethod,
        account_identifiers: identifiers,
        raw: authinfo,
      };
    }

    const [accountIssues, productStatuses, productsSample] = await Promise.allSettled([
      fetchMcAccountStatuses(accessToken, merchantId),
      fetchMcProductStatuses(accessToken, merchantId, 50),
      fetchMcProducts(accessToken, merchantId, 25),
    ]);

    return {
      auth_method: authinfo.authMethod,
      account_identifiers: identifiers,
      account_issues:
        accountIssues.status === "fulfilled" ? accountIssues.value : undefined,
      product_statuses:
        productStatuses.status === "fulfilled" ? productStatuses.value : undefined,
      products_sample:
        productsSample.status === "fulfilled" ? productsSample.value : undefined,
      raw: authinfo,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to fetch Merchant Center data",
    };
  }
}

export async function fetchGoogleAdsData(accessToken: string): Promise<GoogleAdsData> {
  try {
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!developerToken) {
      return { error: "Missing GOOGLE_ADS_DEVELOPER_TOKEN" };
    }

    const res = await axios.post<{
      resourceNames?: string[];
    }>(
      "https://googleads.googleapis.com/v16/customers:listAccessibleCustomers",
      {},
      {
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
        },
      }
    );

    return {
      accessible_customers: res.data.resourceNames ?? [],
      raw: res.data,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to fetch Google Ads data",
    };
  }
}

export async function fetchAllGoogleConnectedData(
  accessToken: string
): Promise<GoogleConnectedData> {
  const [merchant_center, google_ads] = await Promise.all([
    fetchMerchantCenterData(accessToken),
    fetchGoogleAdsData(accessToken),
  ]);

  const gmb: GoogleBusinessProfileData = {
    public_presence_only: true,
    note:
      "Google Business Profile Management API is not used (no business.manage scope). Use OSINT / public search signals in this prompt and the website crawl for how the business appears on Google Search & Maps.",
  };

  return { merchant_center, google_ads, gmb };
}

const GOOGLE_ACCOUNT_IDENTIFIER = "primary";

export async function upsertGoogleTokensForUser(
  userId: string,
  tokens: GoogleOAuthTokens
): Promise<boolean> {
  return upsertConnectedAccount({
    user_id: userId,
    provider: "google",
    account_identifier: GOOGLE_ACCOUNT_IDENTIFIER,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    token_expires_at: new Date(tokens.expires_at).toISOString(),
    metadata: {
      token_type: tokens.token_type ?? null,
      scope: tokens.scope ?? null,
    },
  });
}

export async function getGoogleTokensForUser(userId: string): Promise<GoogleOAuthTokens | null> {
  const row = await getConnectedAccount(userId, "google", GOOGLE_ACCOUNT_IDENTIFIER);
  if (!row?.access_token || !row.token_expires_at) return null;
  const metadata = row.metadata ?? {};
  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token ?? undefined,
    expires_at: new Date(row.token_expires_at).getTime(),
    token_type: typeof metadata.token_type === "string" ? metadata.token_type : undefined,
    scope: typeof metadata.scope === "string" ? metadata.scope : undefined,
  };
}

export async function deleteGoogleConnectionForUser(userId: string): Promise<boolean> {
  return deleteConnectedAccount(userId, "google", GOOGLE_ACCOUNT_IDENTIFIER);
}

export async function fetchAllGoogleConnectedDataForUser(userId: string): Promise<{
  connected: boolean;
  tokens: GoogleOAuthTokens | null;
  data: GoogleConnectedData | null;
}> {
  let tokens = await getGoogleTokensForUser(userId);
  if (!tokens?.access_token) {
    return { connected: false, tokens: null, data: null };
  }

  if (Date.now() >= tokens.expires_at) {
    if (!tokens.refresh_token) {
      return { connected: false, tokens: null, data: null };
    }
    tokens = await refreshGoogleAccessToken(tokens.refresh_token);
    await upsertGoogleTokensForUser(userId, tokens);
  }

  const data = await fetchAllGoogleConnectedData(tokens.access_token);
  return { connected: true, tokens, data };
}

