import axios from "axios";
import { inferCountryFromHostname } from "@/lib/crawler";

const OSINT_TIMEOUT_MS = 8000;
/** Max Places Text Search candidates to score (each may trigger a Details request). */
const MAX_PLACE_CANDIDATES = 8;

export type OsintLocationHints = {
  /** ISO 3166-1 alpha-2 from crawl fingerprint, e.g. IL, US */
  countryCode?: string | null;
  /** HTML document language from crawl, e.g. he, en */
  language?: string | null;
};

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
    /** How we chose this listing (for prompt transparency). */
    matchBasis?: "website" | "region_filtered" | "region_bias_only";
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

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/** True if Places `website` URL is the same registrable site as the scanned domain. */
function websiteMatchesScannedDomain(website: string | undefined, scannedDomain: string): boolean {
  if (!website) return false;
  try {
    const w = new URL(website.startsWith("http") ? website : `https://${website}`);
    return normalizeHost(w.hostname) === normalizeHost(scannedDomain);
  } catch {
    return false;
  }
}

/** Map ISO country (IL, US) to Places API `region` ccTLD (il, us). UK → uk. */
function countryCodeToPlacesRegion(code: string | null | undefined): string | null {
  if (!code || typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  if (c === "UK" || c === "GB") return "uk";
  if (c.length === 2) return c.toLowerCase();
  return null;
}

function resolvePlacesRegion(scannedDomain: string, hints?: OsintLocationHints | null): string | null {
  const fromFingerprint = countryCodeToPlacesRegion(hints?.countryCode ?? undefined);
  const fromTld = countryCodeToPlacesRegion(inferCountryFromHostname(scannedDomain));
  return fromFingerprint ?? fromTld ?? null;
}

function resolvePlacesLanguage(hints?: OsintLocationHints | null): string {
  const lang = hints?.language?.trim().toLowerCase();
  if (lang && /^[a-z]{2}(-[a-z]{2})?$/i.test(lang)) {
    return lang.split("-")[0]!;
  }
  return "en";
}

/**
 * When biasing to `region` (e.g. il), skip obvious US listings that cannot be the same entity as an IL site.
 */
function addressConflictsWithRegionBias(
  address: string | undefined,
  region: string | null
): boolean {
  if (!address || !region) return false;
  const a = address;
  if (region === "il") {
    const looksUs =
      /\b(United States|USA)\b/i.test(a) ||
      /\bFL\s+\d{5}\b/.test(a) ||
      /\bLongwood\b/i.test(a);
    const looksIl = /Israel|ישראל|ישראל,/i.test(a) || /\bIL\b(?![A-Za-z])/i.test(a);
    if (looksUs && !looksIl) return true;
  }
  return false;
}

type PlacesResult = NonNullable<OsintData["publicGbp"]>;

type PlaceDetailsResult = {
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  formatted_address?: string;
  formatted_phone_number?: string;
  business_status?: string;
  website?: string;
};

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
  language: string
): Promise<PlaceDetailsResult | null> {
  try {
    const res = await axios.get<{
      status?: string;
      result?: PlaceDetailsResult;
    }>("https://maps.googleapis.com/maps/api/place/details/json", {
      params: {
        place_id: placeId,
        key: apiKey,
        language,
        fields:
          "name,rating,user_ratings_total,formatted_address,formatted_phone_number,business_status,website",
      },
      timeout: OSINT_TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (res.data?.status !== "OK" || !res.data?.result) return null;
    return res.data.result;
  } catch (err) {
    console.warn("[osint] Place Details failed:", (err as Error).message);
    return null;
  }
}

function mapDetailsToPublicGbp(
  d: PlaceDetailsResult,
  basis: PlacesResult["matchBasis"]
): PlacesResult {
  return {
    name: d.name ?? null,
    rating: d.rating ?? null,
    reviewCount: d.user_ratings_total ?? null,
    address: d.formatted_address ?? null,
    phone: d.formatted_phone_number ?? null,
    businessStatus: d.business_status ?? null,
    matchBasis: basis,
  };
}

/**
 * Google Custom Search API: search for domain-related info.
 * Requires GOOGLE_CUSTOM_SEARCH_KEY and GOOGLE_CUSTOM_SEARCH_CX env vars.
 */
async function fetchGoogleSearchSnippets(
  domain: string,
  businessName: string | null,
  hints?: OsintLocationHints | null
): Promise<string[]> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (!apiKey || !cx) return [];

  const query = businessName
    ? `"${businessName}" site:${domain} OR "${domain}"`
    : `"${domain}" reviews OR scam OR legit`;

  const region = resolvePlacesRegion(domain, hints);
  const hl = resolvePlacesLanguage(hints);

  try {
    const params: Record<string, string | number> = {
      key: apiKey,
      cx,
      q: query,
      num: 5,
    };
    if (region) params.gl = region;
    params.hl = hl;

    const res = await axios.get<{
      items?: { title?: string; snippet?: string; link?: string }[];
    }>("https://www.googleapis.com/customsearch/v1", {
      params,
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

type TextSearchHit = {
  place_id?: string;
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  formatted_address?: string;
};

/**
 * Google Places Text Search + Place Details: find a public listing tied to this domain when possible.
 */
async function fetchPublicGbp(
  businessName: string | null,
  domain: string,
  hints: OsintLocationHints | undefined,
  warningSink: string[]
): Promise<PlacesResult | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.PAGESPEED_API_KEY;
  if (!apiKey) return null;

  const query = businessName ? `${businessName} ${domain}` : domain;
  const region = resolvePlacesRegion(domain, hints);
  const language = resolvePlacesLanguage(hints);

  let results: TextSearchHit[] = [];
  try {
    const params: Record<string, string> = {
      key: apiKey,
      query,
      language,
    };
    if (region) params.region = region;

    const res = await axios.get<{
      status?: string;
      results?: TextSearchHit[];
    }>("https://maps.googleapis.com/maps/api/place/textsearch/json", {
      params,
      timeout: OSINT_TIMEOUT_MS,
      validateStatus: () => true,
    });

    if (res.data?.status !== "OK" && res.data?.status !== "ZERO_RESULTS") {
      console.warn("[osint] Places Text Search status:", res.data?.status);
    }
    results = (res.data?.results ?? []).slice(0, MAX_PLACE_CANDIDATES);
  } catch (err) {
    console.warn("[osint] Places Text Search failed:", (err as Error).message);
    return null;
  }

  if (results.length === 0) return null;

  // 1) Prefer listing whose Place Details website matches scanned domain
  for (const hit of results) {
    if (!hit.place_id) continue;
    const details = await fetchPlaceDetails(hit.place_id, apiKey, language);
    if (details && websiteMatchesScannedDomain(details.website, domain)) {
      warningSink.push(
        "Google Places: public listing matched to your website domain (verified)."
      );
      return mapDetailsToPublicGbp(details, "website");
    }
  }

  // 2) Prefer first Text Search row that is not an obvious wrong country vs region bias
  const filtered = region
    ? results.filter((r) => !addressConflictsWithRegionBias(r.formatted_address, region))
    : results;

  const ordered = filtered.length > 0 ? filtered : results;
  if (filtered.length < results.length) {
    warningSink.push(
      "Google Places: skipped at least one result whose address did not match the regional bias (avoid mixing businesses)."
    );
  }

  const primary = ordered[0];
  if (!primary?.place_id) return null;

  const details = await fetchPlaceDetails(primary.place_id, apiKey, language);
  if (!details) return null;

  const basis: PlacesResult["matchBasis"] =
    filtered.length > 0 && region ? "region_filtered" : "region_bias_only";

  warningSink.push(
    "Google Places: listing not verified to your domain — confirm in Google Maps / Business Profile manually."
  );

  return mapDetailsToPublicGbp(details, basis);
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
  businessName: string | null,
  hints?: OsintLocationHints | null
): Promise<OsintData> {
  let domain: string;
  try {
    domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return emptyOsint();
  }

  const gbpWarnings: string[] = [];
  const [snippets, gbp, trustpilot] = await Promise.allSettled([
    fetchGoogleSearchSnippets(domain, businessName, hints),
    fetchPublicGbp(businessName, domain, hints ?? undefined, gbpWarnings),
    fetchTrustpilotRating(domain),
  ]);

  const result = emptyOsint();
  const warnings: string[] = [...gbpWarnings];

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
    lines.push("Google Business Profile (public, via Places API):");
    if (g.matchBasis) {
      lines.push(
        `  Match: ${g.matchBasis === "website" ? "website URL matched scanned domain" : g.matchBasis === "region_filtered" ? "regional filter applied (not domain-verified)" : "region/language bias only — not domain-verified"}`
      );
    }
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
