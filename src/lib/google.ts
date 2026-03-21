import axios from "axios";
import crypto from "crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "gmc_google_oauth_state";
export const GOOGLE_TOKENS_COOKIE = "gmc_google_tokens";
export const GOOGLE_OAUTH_RETURN_TO_COOKIE = "gmc_google_oauth_return_to";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_GOOGLE_REDIRECT_URI = "http://localhost:3006/api/google/oauth/callback";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/content",
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/business.manage",
];

export type GoogleOAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  token_type?: string;
  scope?: string;
};

export type MerchantCenterData = {
  auth_method?: string;
  account_identifiers?: Array<{
    merchant_id?: string;
    aggregator_id?: string;
  }>;
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

export function getGoogleRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || DEFAULT_GOOGLE_REDIRECT_URI;
}

export function createGoogleOAuthState(): string {
  return crypto.randomBytes(24).toString("hex");
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

export async function fetchMerchantCenterData(
  accessToken: string
): Promise<MerchantCenterData> {
  try {
    const raw = await getJson<{
      kind?: string;
      accountIdentifiers?: Array<{ merchantId?: string; aggregatorId?: string }>;
      authMethod?: string;
    }>("https://shoppingcontent.googleapis.com/content/v2.1/accounts/authinfo", accessToken);

    return {
      auth_method: raw.authMethod,
      account_identifiers: raw.accountIdentifiers?.map((item) => ({
        merchant_id: item.merchantId,
        aggregator_id: item.aggregatorId,
      })),
      raw,
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

export async function fetchGoogleBusinessProfileData(
  accessToken: string
): Promise<GoogleBusinessProfileData> {
  try {
    const raw = await getJson<{
      accounts?: Array<{ name?: string; accountName?: string; type?: string }>;
    }>("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", accessToken);

    return {
      accounts: raw.accounts ?? [],
      raw,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to fetch Business Profile data",
    };
  }
}

export async function fetchAllGoogleConnectedData(
  accessToken: string
): Promise<GoogleConnectedData> {
  const [merchant_center, google_ads, gmb] = await Promise.all([
    fetchMerchantCenterData(accessToken),
    fetchGoogleAdsData(accessToken),
    fetchGoogleBusinessProfileData(accessToken),
  ]);

  return { merchant_center, google_ads, gmb };
}

