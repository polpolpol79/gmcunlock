import axios from "axios";

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

function getShopifyEnv() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  return { domain, token };
}

export async function fetchShopifyConnectedData(): Promise<ShopifyConnectedData> {
  const { domain, token } = getShopifyEnv();
  if (!domain || !token) {
    return {
      connected: false,
      error: "Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN",
    };
  }

  const normalizedDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
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
        privacy: Array.isArray(privacyRes.data?.policies)
          ? privacyRes.data.policies.length
          : 0,
        refund: Array.isArray(refundRes.data?.policies)
          ? refundRes.data.policies.length
          : 0,
        terms: Array.isArray(termsRes.data?.policies) ? termsRes.data.policies.length : 0,
        shipping: Array.isArray(shippingRes.data?.policies)
          ? shippingRes.data.policies.length
          : 0,
      },
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Failed to fetch Shopify data",
    };
  }
}

