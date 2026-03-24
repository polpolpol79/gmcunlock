import axios from "axios";
import * as cheerio from "cheerio";
import https from "https";

const UA_GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PARALLEL_FETCH_MS = 6000;
const KEYWORD_PAGE_MS = 3000;
const MAX_KEYWORD_PAGES = 5;
const MAX_TEXT_PER_PAGE = 4000;

const FREE_EMAIL = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "live.com",
  "icloud.com",
]);

/** Checklist / fingerprint (extended beyond raw crawl fingerprint). */
export type SiteFingerprint = {
  businessName: string | null;
  email: string | null;
  phone: string | null;
  emails: string[];
  phones: string[];
  address: string | null;
  currency: string | null;
  language: string | null;
  siteType: "ecommerce" | "service" | "leads" | "other" | null;
  platform: "shopify" | "woocommerce" | "wix" | "other" | null;
  country: string | null;
};

export type WebsiteScanData = {
  url: string;
  hasSSL: boolean;
  platform: string | null;
  responseTimeMs: number;
  robotsTxt: string | null;
  pages: { url: string; text: string }[];
  allLinksFound: string[];
  fingerprint: {
    businessName: string | null;
    email: string | null;
    phone: string | null;
    emails: string[];
    phones: string[];
    address: string | null;
    currency: string | null;
    language: string | null;
  };
};

/** @deprecated use WebsiteScanData */
export type CrawlResult = WebsiteScanData;

const KEYWORD_RE =
  /policy|terms|privacy|contact|about|returns|shipping|refund|legal|faq|guarantee|warranty|תנאי|פרטיות|החזר|משלוח|קשר|אודות|עלינו|תקנון|מדיניות|שאלות|אחריות|החזרות|הובלה|צור[-\s]?קשר|מדיניות[-\s]?פרטיות|תנאי[-\s]?שימוש|תנאי[-\s]?שירות/i;

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function visibleText(html: string, maxLen: number): string {
  const $ = cheerio.load(html);
  const clone = $.root().clone();
  clone.find("script, style, noscript, svg").remove();
  const t = clone.text().replace(/\s+/g, " ").trim();
  return t.slice(0, maxLen);
}

async function httpGet(
  url: string,
  timeoutMs: number,
  ua: string = UA_GOOGLEBOT,
  insecureTls = false
): Promise<{ ok: boolean; status: number; body: string; finalUrl: string }> {
  try {
    const res = await axios.get<string>(url, {
      timeout: timeoutMs,
      maxRedirects: 8,
      responseType: "text",
      validateStatus: () => true,
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: !insecureTls }),
      transformResponse: [(d) => (typeof d === "string" ? d.slice(0, 1_200_000) : d)],
    });
    const finalUrl =
      (res.request?.res?.responseUrl as string | undefined) ?? url;
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      body: typeof res.data === "string" ? res.data : "",
      finalUrl,
    };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    const isTimeout = code === "ECONNABORTED" || code === "ETIMEDOUT";
    const isTlsChainError = [
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ].includes(code);
    if (!insecureTls && isTlsChainError && /^https:\/\//i.test(url)) {
      console.warn(`[crawler] retrying with relaxed TLS validation: ${url}`);
      return httpGet(url, timeoutMs, ua, true);
    }
    console.warn(`[crawler] httpGet failed: ${url} ${isTimeout ? "(timeout)" : `(${code})`}`);
    return { ok: false, status: 0, body: "", finalUrl: url };
  }
}

/** Try Googlebot UA first; if it returns 403/blocking, retry with Chrome UA. */
async function httpGetWithFallbackUA(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; body: string; finalUrl: string }> {
  const first = await httpGet(url, timeoutMs, UA_GOOGLEBOT);
  if (first.ok && first.body.length > 200) return first;
  if (first.status === 403 || first.status === 406 || (first.status === 0 && !first.body)) {
    console.warn(`[crawler] retrying with Chrome UA: ${url}`);
    return httpGet(url, timeoutMs, UA_CHROME);
  }
  return first;
}

function internalLinksFromHtml(
  html: string,
  baseUrl: string
): { href: string; text: string }[] {
  const $ = cheerio.load(html);
  const origin = originOf(baseUrl);
  const out: { href: string; text: string }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    const abs = resolveUrl(href, baseUrl);
    if (!abs) return;
    try {
      if (new URL(abs).origin !== origin) return;
    } catch {
      return;
    }
    const text = $(el).text().replace(/\s+/g, " ").trim();
    out.push({ href: abs, text });
  });
  return out;
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function safeDecodeUri(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

function pickKeywordUrls(
  anchors: { href: string; text: string }[],
  max: number
): string[] {
  const picked: string[] = [];
  for (const { href, text } of anchors) {
    if (picked.length >= max) break;
    if (KEYWORD_RE.test(safeDecodeUri(href)) || KEYWORD_RE.test(text)) {
      if (!picked.includes(href)) picked.push(href);
    }
  }
  return picked;
}

const MAX_PRODUCT_PAGES = 4;

function pickProductUrls(anchors: { href: string; text: string }[]): string[] {
  const picked: string[] = [];
  for (const { href } of anchors) {
    if (picked.length >= MAX_PRODUCT_PAGES) break;
    if (
      /\/products?\//i.test(href) ||
      /\/collections\/[^/]+\/products\//i.test(href)
    ) {
      if (!picked.includes(href)) picked.push(href);
    }
  }
  if (picked.length < MAX_PRODUCT_PAGES) {
    for (const { href } of anchors) {
      if (picked.length >= MAX_PRODUCT_PAGES) break;
      if (/\/collections\/[^/?#]+/i.test(href)) {
        if (!picked.includes(href)) picked.push(href);
      }
    }
  }
  return picked;
}

function parseSitemapUrls(xml: string, origin: string, max = 200): string[] {
  const urls: string[] = [];
  const locs = xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi);
  for (const m of locs) {
    const u = m[1]?.trim();
    if (u && u.startsWith("http")) {
      try {
        if (new URL(u).origin === origin) urls.push(u);
      } catch {
        /* skip */
      }
    }
    if (urls.length >= max) break;
  }
  return uniqueUrls(urls);
}

const ASSET_EXT_RE = /\.(png|jpe?g|gif|webp|svg|css|js|woff2?|ttf|eot|ico|mp[34]|pdf|zip)$/i;

function isPlausibleEmail(candidate: string): boolean {
  const atIdx = candidate.indexOf("@");
  if (atIdx < 1) return false;
  const domain = candidate.slice(atIdx + 1);
  if (ASSET_EXT_RE.test(candidate)) return false;
  const domainLabel = domain.split(".")[0];
  if (!domainLabel || domainLabel.length < 2) return false;
  if (/^\d+[a-z]?$/i.test(domainLabel)) return false;
  if (!/[a-z]/i.test(domainLabel)) return false;
  return true;
}

function extractEmails(html: string): string[] {
  const m = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(
    m.map((e) => e.toLowerCase()).filter(isPlausibleEmail)
  )];
}

function firstBrandedEmail(html: string): string | null {
  for (const e of extractEmails(html)) {
    const d = e.split("@")[1];
    if (d && !FREE_EMAIL.has(d)) return e;
  }
  return extractEmails(html)[0] ?? null;
}

function extractPhones(text: string): string[] {
  const re =
    /\+?\d[\d\s().-]{8,}\d|\b05\d[\d-]{7,}\b|\+972[\d\s-]{9,}/g;
  const m = text.match(re) ?? [];
  return [...new Set(
    m.map((s) => s.replace(/\s+/g, " ").trim())
     .filter((s) => s.replace(/\D/g, "").length <= 15)
  )];
}

function extractBusinessName($: cheerio.CheerioAPI): string | null {
  const og = $("meta[property='og:site_name']").attr("content")?.trim();
  if (og && og.length > 1) return og;
  const t = $("title").first().text().replace(/\s+/g, " ").trim();
  if (t.length > 1) return t.split(/[|\-–]/)[0]?.trim() ?? t;
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (h1.length > 1 && h1.length < 120) return h1;
  return null;
}

function extractAddressFromJsonLd(html: string): string | null {
  const $ = cheerio.load(html);
  let best: string | null = null;
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw?.trim()) return;
    try {
      const walk = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        const o = node as Record<string, unknown>;
        const t = String(o["@type"] ?? "");
        if (/LocalBusiness|Organization|Store/i.test(t)) {
          const a = o.address;
          if (a && typeof a === "object") {
            const ad = a as Record<string, unknown>;
            const parts = [ad.streetAddress, ad.addressLocality, ad.addressCountry]
              .filter((x) => typeof x === "string" && x.trim())
              .join(", ");
            if (parts.length > 8) best ??= parts;
          }
          if (typeof o.streetAddress === "string" && o.streetAddress.length > 4) {
            best ??= o.streetAddress;
          }
        }
        if (Array.isArray(node)) node.forEach(walk);
        else Object.values(o).forEach(walk);
      };
      walk(JSON.parse(raw));
    } catch {
      /* skip */
    }
  });
  return best;
}

const HE_CITIES =
  /תל[-\s]?אביב|ירושלים|חיפה|באר[-\s]?שבע|ראשון[-\s]?לציון|פתח[-\s]?תקווה|נתניה|אשדוד|הרצליה|רמת[-\s]?גן|גבעתיים|רחובות|כפר[-\s]?סבא|הוד[-\s]?השרון|רעננה|מודיעין|אשקלון|בני[-\s]?ברק|חולון|בת[-\s]?ים|נס[-\s]?ציונה|לוד|רמלה|עפולה|טבריה|אילת|קריית[-\s]?\S+/;
const HE_ZIP = /\b\d{7}\b/;
const HE_STREET =
  /(?:רח(?:וב)?['׳]?\s+\S.{2,35}\s*\d{1,4}|(?:שד(?:רות)?['׳]?|סמטת?|דרך)\s+\S.{2,25}\s*\d{1,4})/;
const HE_POBOX = /ת\.?ד\.?\s*\d+/;

/**
 * Extract address from visible page text using Hebrew and English patterns.
 * visibleText() collapses HTML to one line, so we split on common delimiters.
 */
function extractAddressFromText(text: string): string | null {
  const genericHeStreetCity = /([א-ת"'׳\-\s]{2,30}\s+\d{1,4}\s*,\s*(?:תל[-\s]?אביב|ירושלים|חיפה|באר[-\s]?שבע|ראשון[-\s]?לציון|פתח[-\s]?תקווה|נתניה|אשדוד|הרצליה|רמת[-\s]?גן|גבעתיים|רחובות|כפר[-\s]?סבא|הוד[-\s]?השרון|רעננה|מודיעין|אשקלון|בני[-\s]?ברק|חולון|בת[-\s]?ים|נס[-\s]?ציונה|לוד|רמלה|עפולה|טבריה|אילת|קריית[-\s]?\S+))/;
  const genericMatch = text.match(genericHeStreetCity)?.[1]?.trim();
  if (genericMatch) return genericMatch.slice(0, 80);

  // Split the collapsed text into segments using stronger delimiters first.
  const segments = text
    .split(/[|·•\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5 && s.length < 120);

  // Pass 1: street pattern (high confidence)
  for (const seg of segments) {
    if (HE_STREET.test(seg) && (HE_CITIES.test(seg) || HE_ZIP.test(seg))) {
      return seg.slice(0, 80);
    }
  }
  for (const seg of segments) {
    if (HE_STREET.test(seg)) return seg.slice(0, 80);
  }

  // Pass 2: P.O. Box with a city
  for (const seg of segments) {
    if (HE_POBOX.test(seg) && HE_CITIES.test(seg)) return seg.slice(0, 80);
  }

  // Pass 3: keyword + city + zip in same segment
  const addrKw = /כתובת|address|הכתובת/i;
  for (const seg of segments) {
    if (addrKw.test(seg) && HE_CITIES.test(seg)) return seg.replace(addrKw, "").trim().slice(0, 80);
  }

  // Pass 4: city + zip in same segment (no keyword required, but both must be present)
  for (const seg of segments) {
    if (HE_CITIES.test(seg) && HE_ZIP.test(seg) && seg.length < 80) return seg;
  }

  return null;
}

function detectPlatformString(html: string): string | null {
  const h = html.toLowerCase();
  if (h.includes("cdn.shopify.com") || /shopify\.com\/s\/files/i.test(h)) return "Shopify";
  if (h.includes("woocommerce") || h.includes("wp-content/plugins/woocommerce")) return "WooCommerce";
  if (h.includes("wix.com") || h.includes("wixstatic.com")) return "Wix";
  if (h.includes("magento") || h.includes("/static/version")) return "Magento";
  if (h.includes("bigcommerce") || h.includes("cdn11.bigcommerce.com")) return "BigCommerce";
  if (h.includes("ecwid.com") || h.includes("app.ecwid.com")) return "Ecwid";
  if (h.includes("prestashop") || h.includes("modules/ps_")) return "PrestaShop";
  if (h.includes("opencart")) return "OpenCart";

  const $ = cheerio.load(html);
  const generator = $("meta[name='generator']").attr("content")?.toLowerCase() ?? "";
  if (generator.includes("shopify")) return "Shopify";
  if (generator.includes("woocommerce") || generator.includes("wordpress")) return "WooCommerce";
  if (generator.includes("wix")) return "Wix";
  if (generator.includes("magento")) return "Magento";
  if (generator.includes("prestashop")) return "PrestaShop";

  return null;
}

function detectCurrency(text: string): string | null {
  if (/₪/.test(text)) return "ILS";
  if (/\$\d/.test(text)) return "USD";
  if (/€/.test(text)) return "EUR";
  if (/£/.test(text)) return "GBP";
  return null;
}

function inferSiteType(bundle: string): SiteFingerprint["siteType"] {
  const b = bundle.toLowerCase();
  let ecom = 0;
  if (/(add\s*to\s*cart|checkout|\/cart\b|\/products?\b)/i.test(b)) ecom += 2;
  if (/shopify|woocommerce|price|₪|\$|€/.test(b)) ecom += 1;
  if (/הוסף\s*לסל|קנה\s*עכשיו|עגלת\s*קניות|סל\s*קניות|מחיר/.test(b)) ecom += 2;
  if (/משלוח|החזרות|מדיניות\s*החזרה/.test(b)) ecom += 1;
  if (ecom >= 2) return "ecommerce";
  if (/(appointment|book\s+now|clinic|service|תור|שירות|מרפאה|טיפול)/i.test(b)) return "service";
  if (/(quote|contact\s+us|lead|בקשת\s*הצעה|פנייה)/i.test(b)) return "leads";
  if (bundle.length > 200) return "other";
  return null;
}

function normalizePlatformEnum(p: string | null): SiteFingerprint["platform"] {
  if (!p) return null;
  const x = p.toLowerCase();
  if (x.includes("shopify")) return "shopify";
  if (x.includes("woo")) return "woocommerce";
  if (x.includes("wix")) return "wix";
  return "other";
}

export function emptySiteFingerprint(): SiteFingerprint {
  return {
    businessName: null,
    email: null,
    phone: null,
    emails: [],
    phones: [],
    address: null,
    currency: null,
    language: null,
    siteType: null,
    platform: null,
    country: null,
  };
}

export function emptyWebsiteScan(url: string): WebsiteScanData {
  const u = normalizeUrl(url);
  return {
    url: u,
    hasSSL: /^https:\/\//i.test(u),
    platform: null,
    responseTimeMs: 0,
    robotsTxt: null,
    pages: [],
    allLinksFound: [],
    fingerprint: {
      businessName: null,
      email: null,
      phone: null,
      emails: [],
      phones: [],
      address: null,
      currency: null,
      language: null,
    },
  };
}

/** @deprecated */
export const emptyCrawlResult = emptyWebsiteScan;

/**
 * Collect raw site text and links; policy/contact pages; sitemap; robots; one product page.
 */
export async function crawlWebsite(url: string): Promise<WebsiteScanData> {
  const start = Date.now();
  const target = normalizeUrl(url);
  if (!target) throw new Error("URL is required");

  const empty = emptyWebsiteScan(target);

  const runHome = async () => httpGetWithFallbackUA(target, PARALLEL_FETCH_MS);
  const runSitemap = async () => {
    const o = originOf(target);
    if (!o) return { ok: false, status: 0, body: "", finalUrl: "" };
    return httpGet(`${o}/sitemap.xml`, PARALLEL_FETCH_MS);
  };
  const runRobots = async () => {
    const o = originOf(target);
    if (!o) return { ok: false, status: 0, body: "", finalUrl: "" };
    return httpGet(`${o}/robots.txt`, PARALLEL_FETCH_MS);
  };

  const [homeSettled, sitemapSettled, robotsSettled] = await Promise.allSettled([
    runHome(),
    runSitemap(),
    runRobots(),
  ]);

  const home =
    homeSettled.status === "fulfilled"
      ? homeSettled.value
      : { ok: false, status: 0, body: "", finalUrl: target };

  const sitemapBody =
    sitemapSettled.status === "fulfilled" && sitemapSettled.value.ok
      ? sitemapSettled.value.body
      : "";

  let robotsTxt: string | null = null;
  if (robotsSettled.status === "fulfilled" && robotsSettled.value.ok && robotsSettled.value.body) {
    robotsTxt = robotsSettled.value.body.slice(0, 50_000);
  } else if (robotsSettled.status === "fulfilled" && robotsSettled.value.status === 404) {
    robotsTxt = null;
  }

  const finalBase = home.finalUrl || target;
  const hasSSL = /^https:\/\//i.test(finalBase);
  const platformStr = home.body ? detectPlatformString(home.body) : null;

  const anchors = home.body ? internalLinksFromHtml(home.body, finalBase) : [];
  const allLinksFound = uniqueUrls(anchors.map((a) => a.href));

  const sitemapUrls = sitemapBody
    ? parseSitemapUrls(sitemapBody, originOf(finalBase), 150)
    : [];

  const keywordCandidates = pickKeywordUrls(anchors, MAX_KEYWORD_PAGES);
  const fromSitemap = sitemapUrls.filter((u) => KEYWORD_RE.test(safeDecodeUri(u))).slice(0, MAX_KEYWORD_PAGES);
  const keywordUrls = uniqueUrls([...keywordCandidates, ...fromSitemap]).slice(0, MAX_KEYWORD_PAGES);

  let productUrls = pickProductUrls(anchors);
  if (productUrls.length < MAX_PRODUCT_PAGES && sitemapUrls.length > 0) {
    const fromSitemapProducts = sitemapUrls
      .filter((u) => /\/products?\//i.test(u) && !productUrls.includes(u))
      .slice(0, MAX_PRODUCT_PAGES - productUrls.length);
    productUrls = [...productUrls, ...fromSitemapProducts];
  }

  const extraUrls = uniqueUrls([
    ...keywordUrls,
    ...productUrls,
  ]);

  const pageFetches = await Promise.allSettled(
    extraUrls.map((u) => httpGetWithFallbackUA(u, KEYWORD_PAGE_MS))
  );

  const pages: { url: string; text: string }[] = [];

  const seenPageUrls = new Set<string>();

  if (home.body && home.ok) {
    pages.push({
      url: finalBase,
      text: visibleText(home.body, MAX_TEXT_PER_PAGE),
    });
    seenPageUrls.add(finalBase);
  }

  for (let i = 0; i < extraUrls.length; i++) {
    const u = extraUrls[i];
    if (seenPageUrls.has(u)) continue;
    const settled = pageFetches[i];
    if (settled?.status !== "fulfilled") continue;
    const r = settled.value;
    if (!r.ok || !r.body) continue;
    seenPageUrls.add(u);
    pages.push({
      url: u,
      text: visibleText(r.body, MAX_TEXT_PER_PAGE),
    });
  }

  // Collect all raw HTML bodies for fingerprint extraction (homepage + fetched pages)
  const allBodies: { url: string; html: string }[] = [];
  if (home.body && home.ok) {
    allBodies.push({ url: finalBase, html: home.body });
  }
  for (let i = 0; i < extraUrls.length; i++) {
    const settled = pageFetches[i];
    if (settled?.status === "fulfilled" && settled.value.ok && settled.value.body) {
      allBodies.push({ url: extraUrls[i], html: settled.value.body });
    }
  }

  const $home = home.body ? cheerio.load(home.body) : null;
  const businessName = $home ? extractBusinessName($home) : null;
  const lang = $home?.("html").attr("lang")?.split(/[-_]/)[0]?.toLowerCase() ?? null;

  // Search ALL pages for email, phone, address, currency — not just homepage
  const allEmails: string[] = [];
  const allPhones: string[] = [];
  let address: string | null = null;
  let currency: string | null = null;

  // Priority order: contact page, homepage, about page, then any page
  const contactFirst = [...allBodies].sort((a, b) => {
    const scoreUrl = (u: string) => {
      const lower = u.toLowerCase();
      if (/contact|קשר/.test(lower)) return 0;
      if (u === finalBase) return 1;
      if (/about|אודות/.test(lower)) return 2;
      return 3;
    };
    return scoreUrl(a.url) - scoreUrl(b.url);
  });

  for (const { html } of contactFirst) {
    for (const e of extractEmails(html)) {
      if (!allEmails.includes(e)) allEmails.push(e);
    }
    const txt = visibleText(html, 30_000);
    for (const p of extractPhones(txt)) {
      if (!allPhones.includes(p)) allPhones.push(p);
    }
    if (!address) address = extractAddressFromJsonLd(html);
    if (!address) address = extractAddressFromText(txt);
    if (!currency) currency = detectCurrency(txt);
  }

  // Primary: first branded email (or first overall), first phone
  const email = firstBrandedEmail(allBodies.map((b) => b.html).join("\n")) ?? allEmails[0] ?? null;
  const phone = allPhones[0] ?? null;

  const responseTimeMs = Date.now() - start;

  return {
    url: finalBase,
    hasSSL,
    platform: platformStr,
    responseTimeMs,
    robotsTxt,
    pages,
    allLinksFound,
    fingerprint: {
      businessName,
      email,
      phone,
      emails: allEmails,
      phones: allPhones,
      address,
      currency,
      language: lang,
    },
  };
}

/** Full SiteFingerprint for checklist (adds siteType / platform enum / country). */
export function toSiteFingerprint(scan: WebsiteScanData): SiteFingerprint {
  const bundle = scan.pages.map((p) => p.text).join("\n") + scan.allLinksFound.join(" ");
  const country =
    /\+972|ישראל|israel/i.test(bundle) ? "IL" : null;
  return {
    ...scan.fingerprint,
    siteType: inferSiteType(bundle + (scan.platform ?? "")),
    platform: normalizePlatformEnum(scan.platform),
    country,
  };
}

