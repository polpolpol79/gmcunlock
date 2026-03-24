import axios from "axios";

const OSINT_TIMEOUT_MS = 8000;

export type OsintData = {
  googleSearchSnippets: string[];
  trustpilotRating: string | null;
  publicGbp: {
    name: string | null;
    rating: number | null;
    reviewCount: number | null;
    address: string | null;
    phone: string | null;
    businessStatus: string | null;
  } | null;
  domainAge: string | null;
  warnings: string[];
};

function emptyOsint(): OsintData {
  return {
    googleSearchSnippets: [],
    trustpilotRating: null,
    publicGbp: null,
    domainAge: null,
    warnings: [],
  };
}

/**
 * Google Custom Search API: search for domain-related info.
 * Requires GOOGLE_CUSTOM_SEARCH_KEY and GOOGLE_CUSTOM_SEARCH_CX env vars.
 */
async function fetchGoogleSearchSnippets(
  domain: string,
  businessName: string | null
): Promise<string[]> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (!apiKey || !cx) return [];

  const query = businessName
    ? `"${businessName}" site:${domain} OR "${domain}"`
    : `"${domain}" reviews OR scam OR legit`;

  try {
    const res = await axios.get<{
      items?: { title?: string; snippet?: string; link?: string }[];
    }>("https://www.googleapis.com/customsearch/v1", {
      params: { key: apiKey, cx, q: query, num: 5 },
      timeout: OSINT_TIMEOUT_MS,
    });

    return (res.data.items ?? [])
      .filter((i) => i.snippet)
      .map((i) => `${i.title ?? ""}: ${i.snippet} (${i.link})`)
      .slice(0, 5);
  } catch (err) {
    console.warn("[osint] Google Custom Search failed:", (err as Error).message);
    return [];
  }
}

type PlacesResult = {
  name: string | null;
  rating: number | null;
  reviewCount: number | null;
  address: string | null;
  phone: string | null;
  businessStatus: string | null;
};

/**
 * Google Places Text Search: find the public business profile.
 * Requires GOOGLE_PLACES_API_KEY env var.
 */
async function fetchPublicGbp(
  businessName: string | null,
  domain: string
): Promise<PlacesResult | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.PAGESPEED_API_KEY;
  if (!apiKey) return null;

  const query = businessName ? `${businessName} ${domain}` : domain;

  try {
    const res = await axios.get<{
      results?: {
        name?: string;
        rating?: number;
        user_ratings_total?: number;
        formatted_address?: string;
        formatted_phone_number?: string;
        business_status?: string;
      }[];
    }>("https://maps.googleapis.com/maps/api/place/textsearch/json", {
      params: { key: apiKey, query, fields: "name,rating,user_ratings_total,formatted_address,business_status" },
      timeout: OSINT_TIMEOUT_MS,
    });

    const first = res.data.results?.[0];
    if (!first) return null;

    return {
      name: first.name ?? null,
      rating: first.rating ?? null,
      reviewCount: first.user_ratings_total ?? null,
      address: first.formatted_address ?? null,
      phone: first.formatted_phone_number ?? null,
      businessStatus: first.business_status ?? null,
    };
  } catch (err) {
    console.warn("[osint] Places API failed:", (err as Error).message);
    return null;
  }
}

/**
 * Scrape Trustpilot public rating for a domain (no API key needed).
 */
async function fetchTrustpilotRating(domain: string): Promise<string | null> {
  try {
    const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const res = await axios.get<string>(
      `https://www.trustpilot.com/review/${clean}`,
      {
        timeout: OSINT_TIMEOUT_MS,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return null;

    const html = typeof res.data === "string" ? res.data : "";
    const ratingMatch = html.match(/"ratingValue"\s*:\s*"?(\d+\.?\d*)"?/);
    const countMatch = html.match(/"reviewCount"\s*:\s*"?(\d+)"?/);
    if (ratingMatch) {
      const rating = ratingMatch[1];
      const count = countMatch?.[1] ?? "?";
      return `${rating}/5 (${count} reviews)`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Gather public intelligence about the business in parallel.
 * Called during scan alongside PageSpeed + crawl.
 */
export async function gatherOsint(
  url: string,
  businessName: string | null
): Promise<OsintData> {
  let domain: string;
  try {
    domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return emptyOsint();
  }

  const warnings: string[] = [];
  const [snippets, gbp, trustpilot] = await Promise.allSettled([
    fetchGoogleSearchSnippets(domain, businessName),
    fetchPublicGbp(businessName, domain),
    fetchTrustpilotRating(domain),
  ]);

  const result = emptyOsint();

  if (snippets.status === "fulfilled") {
    result.googleSearchSnippets = snippets.value;
  } else {
    warnings.push("Google search data unavailable");
  }

  if (gbp.status === "fulfilled" && gbp.value) {
    result.publicGbp = gbp.value;
  }

  if (trustpilot.status === "fulfilled" && trustpilot.value) {
    result.trustpilotRating = trustpilot.value;
  }

  result.warnings = warnings;
  return result;
}

/**
 * Format OSINT data as plain text for the Claude prompt.
 */
export function formatOsintBlock(osint: OsintData): string {
  const lines: string[] = [];

  if (osint.publicGbp) {
    const g = osint.publicGbp;
    lines.push("Google Business Profile (public):");
    if (g.name) lines.push(`  Name: ${g.name}`);
    if (g.rating != null) lines.push(`  Rating: ${g.rating}/5 (${g.reviewCount ?? "?"} reviews)`);
    if (g.address) lines.push(`  Address: ${g.address}`);
    if (g.phone) lines.push(`  Phone: ${g.phone}`);
    if (g.businessStatus) lines.push(`  Status: ${g.businessStatus}`);
  } else {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.PAGESPEED_API_KEY;
    lines.push(
      apiKey
        ? "Google Business Profile (public): not found via Places API (this does NOT mean the business is absent from Google — the automated search may have missed it)"
        : "Google Business Profile (public): not checked (Places API key not configured)"
    );
  }

  if (osint.trustpilotRating) {
    lines.push(`Trustpilot: ${osint.trustpilotRating}`);
  }

  if (osint.googleSearchSnippets.length > 0) {
    lines.push("Google Search snippets about this business:");
    for (const s of osint.googleSearchSnippets) {
      lines.push(`  - ${s}`);
    }
  }

  if (osint.warnings.length > 0) {
    lines.push(`OSINT warnings: ${osint.warnings.join("; ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : "No OSINT data collected";
}
