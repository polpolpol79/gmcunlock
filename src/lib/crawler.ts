import axios from "axios";
import * as cheerio from "cheerio";

/** Googlebot-style fetch — how we treat the homepage. */
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1)";

const PAGE_TIMEOUT_MS = 8000;
const PHASE1_BUDGET_MS = 2000;
const PHASE3_BUDGET_MS = 15000;
const PHASE4_BUDGET_MS = 10000;
const PHASE5_BUDGET_MS = 5000;
const HOMEPAGE_BUDGET_MS = 8000;
const ALLTEXT_MAX = 3000;
const MAX_REDIRECTS = 8;

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
]);

export type SiteFingerprint = {
  businessName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  platform: "shopify" | "woocommerce" | "wix" | "other" | null;
  siteType: "ecommerce" | "service" | "leads" | "other" | null;
  currency: string | null;
  country: string | null;
  language: string | null;
};

/** Alias for clarity in docs / prompts */
export type BusinessFingerprint = SiteFingerprint;

export function emptySiteFingerprint(): SiteFingerprint {
  return {
    businessName: null,
    email: null,
    phone: null,
    address: null,
    platform: null,
    siteType: null,
    currency: null,
    country: null,
    language: null,
  };
}

export type CrawlResult = {
  hasSSL: boolean;
  isGooglebotBlocked: boolean;
  responseTime: number;
  redirectCount: number;
  httpStatus: number;

  businessName: string | null;
  email: string | null;
  emailIsBranded: boolean;
  phone: string | null;
  address: string | null;
  platform: "shopify" | "woocommerce" | "wix" | "other" | null;
  currency: string | null;
  language: string | null;

  hasLogo: boolean;
  hasPopup: boolean;
  hasAutoPlayVideo: boolean;
  hasFakeUrgency: boolean;
  hasFakeCountdown: boolean;
  hasTrustBadges: boolean;
  hasMedicalClaims: boolean;

  hasContactPage: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  hasContactForm: boolean;

  hasReturnPolicy: boolean;
  returnPeriodDays: number | null;
  hasRefundProcess: boolean;
  hasReturnCases: boolean;
  returnPolicyWordCount: number;

  hasShippingPolicy: boolean;
  hasFreeShipping: boolean;
  hasDeliveryTime: boolean;
  hasShippingCost: boolean;
  shippingPolicyWordCount: number;

  hasPrivacyPolicy: boolean;
  privacyWordCount: number;
  hasDataCollection: boolean;
  hasThirdParty: boolean;

  hasTerms: boolean;
  termsWordCount: number;
  termsHasBrandName: boolean;

  footerHasEmail: boolean;
  footerHasPhone: boolean;
  footerHasAddress: boolean;
  footerHasPolicyLinks: boolean;

  productsChecked: number;
  hasRealPrices: boolean;
  hasProductDescriptions: boolean;
  hasFakeReviews: boolean;
  productHasUrgency: boolean;

  hasAboutPage: boolean;
  aboutWordCount: number;
  hasBrandStory: boolean;
  hasTeam: boolean;
  hasFoundedDate: boolean;

  emailConsistent: boolean;
  phoneConsistent: boolean;
  nameConsistent: boolean;

  navLinks: string[];
  policyLinks: string[];
  allText: string;
  fingerprint: SiteFingerprint;

  /** @deprecated use hasPopup — kept for JSON consumers */
  hasPopups: boolean;
  hasBrandName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  metaTitle: string;
  metaDescription: string;
  pageTitle: string;
  allLinks: string[];
  hasBrokenLinks: boolean;
  hasSpellingIssues: boolean;
  hasFakeTrustBadges: boolean;
  footerHasContact: boolean;
  footerHasPrivacy: boolean;
};

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), ms)
    ),
  ]);
}

function parseOrigin(url: string): string {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return "";
  }
}

function resolveHref(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function normalizeUrlInput(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** GET/HEAD with no redirect following — returns status + location. */
async function fetchNoRedirect(
  url: string,
  method: "GET" | "HEAD",
  timeoutMs: number,
  userAgent: string
): Promise<{ status: number; location: string | null; data: string }> {
  const res = await axios({
    url,
    method,
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: timeoutMs,
    responseType: method === "GET" ? "text" : "text",
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
    transformResponse: [(d) => (typeof d === "string" ? d.slice(0, 500_000) : d)],
  });
  const loc = res.headers["location"] ?? res.headers["Location"];
  return {
    status: res.status,
    location: typeof loc === "string" ? loc : Array.isArray(loc) ? loc[0] ?? null : null,
    data: typeof res.data === "string" ? res.data : "",
  };
}

async function measureRedirectChain(
  startUrl: string,
  budgetMs: number
): Promise<{ finalUrl: string; redirectCount: number; status: number; responseTime: number }> {
  const t0 = performance.now();
  let current = normalizeUrlInput(startUrl);
  let redirects = 0;
  let lastStatus = 0;

  while (performance.now() - t0 < budgetMs && redirects <= MAX_REDIRECTS) {
    const remaining = Math.max(400, budgetMs - (performance.now() - t0));
    let r: { status: number; location: string | null; data: string };
    try {
      r = await fetchNoRedirect(current, "HEAD", Math.min(remaining, 1500), GOOGLEBOT_UA);
    } catch {
      try {
        r = await fetchNoRedirect(current, "GET", Math.min(remaining, 1500), GOOGLEBOT_UA);
      } catch {
        break;
      }
    }
    lastStatus = r.status;
    if (r.status >= 300 && r.status < 400 && r.location) {
      const next = resolveHref(r.location, current);
      if (!next || next === current) break;
      current = next;
      redirects++;
      continue;
    }
    break;
  }

  return {
    finalUrl: current,
    redirectCount: redirects,
    status: lastStatus,
    responseTime: Math.round(performance.now() - t0),
  };
}

function parseRobotsGooglebotBlocked(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let agent: string | null = null;
  let googlebotDisallowRoot = false;
  let starDisallowRoot = false;
  let googlebotSection = false;
  let starSection = false;

  for (const raw of lines) {
    const line = raw.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const mUa = /^user-agent:\s*(.+)$/i.exec(line);
    if (mUa) {
      agent = mUa[1].trim().toLowerCase();
      googlebotSection = agent.includes("googlebot");
      starSection = agent === "*";
      continue;
    }
    const mDis = /^disallow:\s*(.*)$/i.exec(line);
    if (mDis && agent) {
      const path = mDis[1].trim();
      if (path === "/" || path === "/*") {
        if (googlebotSection) googlebotDisallowRoot = true;
        if (starSection) starDisallowRoot = true;
      }
    }
  }

  if (googlebotDisallowRoot) return true;
  if (starDisallowRoot) return true;
  return false;
}

async function fetchRobotsTxt(origin: string, budgetMs: number): Promise<{
  blocked: boolean;
  status: number;
  protected: boolean;
}> {
  const url = `${origin}/robots.txt`;
  try {
    const res = await withTimeout(
      axios.get<string>(url, {
        timeout: budgetMs,
        validateStatus: () => true,
        responseType: "text",
        headers: { "User-Agent": GOOGLEBOT_UA, Accept: "text/plain,*/*" },
      }),
      budgetMs,
      "robots"
    );
    if (res.status === 403 || res.status === 429) {
      return { blocked: false, status: res.status, protected: true };
    }
    if (res.status === 404) {
      return { blocked: false, status: 404, protected: false };
    }
    if (res.status >= 400) {
      return { blocked: false, status: res.status, protected: false };
    }
    const blocked = parseRobotsGooglebotBlocked(res.data ?? "");
    return { blocked, status: res.status, protected: false };
  } catch {
    return { blocked: false, status: 0, protected: false };
  }
}

async function fetchHtml(
  url: string,
  timeoutMs: number,
  userAgent: string
): Promise<{
  ok: boolean;
  status: number;
  finalUrl: string;
  html: string;
  protected: boolean;
  error?: string;
}> {
  const t0 = performance.now();
  try {
    const res = await axios.get<string>(url, {
      timeout: timeoutMs,
      maxRedirects: MAX_REDIRECTS,
      responseType: "text",
      validateStatus: () => true,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      transformResponse: [(d) => (typeof d === "string" ? d.slice(0, 1_500_000) : d)],
    });
    const finalUrl =
      (res.request?.res?.responseUrl as string | undefined) ??
      (res.request as { path?: string })?.path ??
      url;
    const ms = Math.round(performance.now() - t0);
    void ms;
    if (res.status === 403 || res.status === 429) {
      return {
        ok: false,
        status: res.status,
        finalUrl: typeof finalUrl === "string" ? finalUrl : url,
        html: typeof res.data === "string" ? res.data : "",
        protected: true,
      };
    }
    if (res.status >= 400) {
      return {
        ok: false,
        status: res.status,
        finalUrl: typeof finalUrl === "string" ? finalUrl : url,
        html: "",
        protected: false,
      };
    }
    return {
      ok: true,
      status: res.status,
      finalUrl: typeof finalUrl === "string" ? finalUrl : url,
      html: typeof res.data === "string" ? res.data : "",
      protected: false,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      html: "",
      protected: false,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}

function getAllEmails(html: string): string[] {
  const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

function isBrandedEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return !FREE_EMAIL_DOMAINS.has(domain);
}

function extractPhones(text: string): string[] {
  const patterns: RegExp[] = [
    /\+972[\s\-]?\d{1,2}[\s\-]?\d{3}[\s\-]?\d{4}/g,
    /0?5[0-9][\s\-]?\d{3}[\s\-]?\d{4}/g,
    /\+?\d{1,3}[\s.\-]?\(?\d{2,4}\)?[\s.\-]?\d{2,4}[\s.\-]?\d{2,6}/g,
  ];
  const out = new Set<string>();
  for (const re of patterns) {
    const m = text.match(re) ?? [];
    for (const raw of m) {
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 9 && digits.length <= 15) out.add(normalizeText(raw));
    }
  }
  return [...out];
}

function extractFirstBrandedEmail(html: string): string | null {
  for (const e of getAllEmails(html)) {
    if (isBrandedEmail(e)) return e;
  }
  return null;
}

function walkJsonNodes(node: unknown, visit: (o: Record<string, unknown>) => void): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) walkJsonNodes(n, visit);
    return;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    visit(o);
    for (const v of Object.values(o)) walkJsonNodes(v, visit);
  }
}

function extractFromJsonLd($: cheerio.CheerioAPI): {
  address: string | null;
  currency: string | null;
  country: string | null;
} {
  let address: string | null = null;
  let currency: string | null = null;
  let country: string | null = null;

  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw?.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    walkJsonNodes(parsed, (o) => {
      const t = o["@type"];
      const types = Array.isArray(t) ? t.map(String) : t != null ? [String(t)] : [];
      const isLocal =
        types.some((x) => /LocalBusiness|Organization|Store|Restaurant/i.test(x)) ||
        o.address != null ||
        o.streetAddress != null;

      const addrObj = o.address;
      if (addrObj && typeof addrObj === "object") {
        const a = addrObj as Record<string, unknown>;
        const parts = [
          a.streetAddress,
          a.addressLocality,
          a.addressRegion,
          a.postalCode,
          a.addressCountry,
        ]
          .filter((x) => typeof x === "string" && x.trim())
          .join(", ");
        if (parts.length > 8) address ??= parts;
        if (typeof a.addressCountry === "string" && a.addressCountry.trim())
          country ??= String(a.addressCountry).trim();
      }
      if (isLocal && typeof o.streetAddress === "string" && o.streetAddress.trim().length > 4) {
        address ??= String(o.streetAddress).trim();
      }
      if (typeof o.addressCountry === "string" && o.addressCountry.trim())
        country ??= String(o.addressCountry).trim();

      const offers = o.offers;
      if (offers && typeof offers === "object") {
        const off = offers as Record<string, unknown>;
        if (typeof off.priceCurrency === "string") currency ??= off.priceCurrency.trim();
      }
      if (typeof o.priceCurrency === "string") currency ??= o.priceCurrency.trim();
    });
  });

  return { address, currency, country };
}

function detectPlatform(html: string): CrawlResult["platform"] {
  const h = html.toLowerCase();
  if (h.includes("cdn.shopify.com") || /shopify\.com\/s\/files/i.test(h)) return "shopify";
  if (h.includes("woocommerce") || h.includes("wp-content/plugins/woocommerce")) return "woocommerce";
  if (h.includes("wix.com") || h.includes("wixstatic.com")) return "wix";
  if (html.length > 200) return "other";
  return null;
}

function detectSiteType(
  html: string,
  lowerText: string,
  allLinks: string[]
): SiteFingerprint["siteType"] {
  const links = allLinks.join(" ").toLowerCase();
  const bundle = `${lowerText}\n${links}\n${html.toLowerCase()}`.slice(0, 80_000);

  let ecom = 0;
  if (/(add\s*to\s*cart|buy\s*now|checkout|\/cart\b|\/checkout\b|shopping\s*bag|your\s*cart)/i.test(bundle))
    ecom += 3;
  if (/woocommerce|shopify|\/products?\//i.test(bundle)) ecom += 2;
  if (/[\$€£₪]\s*\d+|\bprice\b|\beur\b|\bgbp\b|ils\b/i.test(bundle)) ecom += 1;

  let svc = 0;
  if (/(book\s+(online|now)|schedule\s+(an?\s+)?appointment|our\s+services\b|\/services?\b)/i.test(bundle))
    svc += 2;
  if (/(dentist|clinic|law\s*firm|consultation|therapy)/i.test(bundle)) svc += 1;

  let leads = 0;
  if (/(get\s+(a\s+)?quote|request\s+(a\s+)?quote|free\s+consultation|sign\s*up\s*for)/i.test(bundle))
    leads += 2;
  if (/(contact\s+us|lead\s+form|newsletter)/i.test(bundle)) leads += 1;

  if (ecom >= 2 && ecom >= svc) return "ecommerce";
  if (svc >= 2 && svc > ecom) return "service";
  if (leads >= 2 && ecom < 2) return "leads";
  if (ecom === 1) return "ecommerce";
  if (html.length > 300) return "other";
  return null;
}

function extractBusinessName($: cheerio.CheerioAPI): string | null {
  const ogSite = normalizeText($('meta[property="og:site_name"]').attr("content") ?? "");
  if (ogSite.length > 1) return ogSite;
  const t = normalizeText($("title").first().text());
  if (t.length > 1) return t.split(/[|\-–]/)[0]?.trim() ?? t;
  const h1 = normalizeText($("h1").first().text());
  if (h1.length > 1 && h1.length < 120) return h1;
  return null;
}

function extractCurrencySymbols(text: string): string | null {
  if (/₪/.test(text)) return "ILS";
  if (/\$\d/.test(text) || text.includes("$")) return "USD";
  if (/€/.test(text)) return "EUR";
  if (/£/.test(text)) return "GBP";
  return null;
}

function extractVisibleText($: cheerio.CheerioAPI, maxLen: number): string {
  const clone = $.root().clone();
  clone.find("script, style, noscript, svg").remove();
  return normalizeText(clone.text()).slice(0, maxLen);
}

function wordCountHtml(html: string): number {
  const $ = cheerio.load(html);
  const t = extractVisibleText($, 500_000);
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

function collectAbsoluteLinks($: cheerio.CheerioAPI, base: string): string[] {
  const hrefs = $("a[href]")
    .map((_, el) => $(el).attr("href") ?? "")
    .get()
    .filter(Boolean);
  const out = new Set<string>();
  for (const href of hrefs) {
    const abs = resolveHref(href, base);
    if (abs) out.add(abs);
  }
  return [...out];
}

function pickNavLinks($: cheerio.CheerioAPI, base: string): string[] {
  const sel = $("nav a[href], header a[href], [role='navigation'] a[href]");
  const out: string[] = [];
  sel.each((_, el) => {
    const h = $(el).attr("href");
    if (!h) return;
    const abs = resolveHref(h, base);
    if (abs) out.push(abs);
  });
  return [...new Set(out)].slice(0, 80);
}

function pickPolicyLinks(allLinks: string[]): string[] {
  return allLinks.filter((l) =>
    /privacy|return|refund|shipping|delivery|terms|tos|conditions/i.test(l)
  );
}

function findBestUrl(allLinks: string[], patterns: RegExp[], fallbackUrls: string[]): string | null {
  for (const link of allLinks) {
    const lower = link.toLowerCase();
    if (patterns.some((p) => p.test(lower))) return link;
  }
  return fallbackUrls[0] ?? null;
}

function hasSpellingRedFlags(text: string): boolean {
  const lower = text.toLowerCase();
  const mistakes = [
    "recieve",
    "seperate",
    "definately",
    "occured",
    "untill",
    "adress",
    "guarentee",
    "enviroment",
  ];
  return mistakes.some((m) => lower.includes(m)) || (lower.match(/([a-z])\1{2,}/g) ?? []).length >= 3;
}

export function extractSiteFingerprint(
  $: cheerio.CheerioAPI,
  html: string,
  _finalUrl: string,
  allText: string,
  allLinks: string[]
): SiteFingerprint {
  const lowerText = allText.toLowerCase();
  const ld = extractFromJsonLd($);
  const langFull = ($("html").attr("lang") ?? "").trim();
  const language = langFull ? langFull.split(/[-_]/)[0]?.toLowerCase() ?? null : null;
  const countryFromLang = langFull.includes("-")
    ? langFull.split(/[-_]/)[1]?.toUpperCase() ?? null
    : null;
  const ogLocale = normalizeText($('meta[property="og:locale"]').attr("content") ?? "");
  const currMeta = normalizeText(
    $('meta[property="product:price:currency"]').attr("content") ?? ""
  );
  const currency =
    ld.currency ?? (currMeta || extractCurrencySymbols(allText) || null);

  let address = ld.address;
  if (!address && /כתובת|address/i.test(allText)) {
    const block = allText.match(/(?:כתובת|address)\s*[:\s]+([^\n]{10,120})/i);
    if (block) address = normalizeText(block[1]);
  }

  const country =
    ld.country ??
    countryFromLang ??
    (ogLocale.includes("_") ? ogLocale.split("_")[1]?.toUpperCase() ?? null : null) ??
    (/\+972/.test(allText) ? "IL" : null);

  return {
    businessName: extractBusinessName($),
    email: extractFirstBrandedEmail(html),
    phone: extractPhones(`${allText}\n${html}`)[0] ?? null,
    address,
    platform: detectPlatform(html),
    siteType: detectSiteType(html, lowerText, allLinks),
    currency,
    country,
    language: language ?? null,
  };
}

type ContactScan = {
  exists: boolean;
  protected: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  hasForm: boolean;
  emailValue: string | null;
  phoneValue: string | null;
  addressValue: string | null;
};

type SimplePageScan = {
  exists: boolean;
  protected: boolean;
  wordCount: number;
  html: string;
};

async function scanContactPage(url: string | null): Promise<ContactScan> {
  if (!url) {
    return {
      exists: false,
      protected: false,
      hasEmail: false,
      hasPhone: false,
      hasAddress: false,
      hasForm: false,
      emailValue: null,
      phoneValue: null,
      addressValue: null,
    };
  }
  const f = await fetchHtml(url, PAGE_TIMEOUT_MS, GOOGLEBOT_UA);
  if (f.protected || !f.ok) {
    return {
      exists: false,
      protected: f.protected,
      hasEmail: false,
      hasPhone: false,
      hasAddress: false,
      hasForm: false,
      emailValue: null,
      phoneValue: null,
      addressValue: null,
    };
  }
  const $ = cheerio.load(f.html);
  const text = extractVisibleText($, 50_000);
  const emails = getAllEmails(f.html);
  const phones = extractPhones(text);
  const hasForm =
    $("form").length > 0 &&
    ($('form input[type="email"], form input[type="tel"], form textarea, form input[name*="phone" i]')
      .length > 0 ||
      $('form button[type="submit"], form input[type="submit"]').length > 0);
  const hasAddr =
    $("address").length > 0 ||
    /\d{1,5}\s+[\w.\s]{2,40}(street|st|road|rd|avenue|ave|blvd|דרך|רחוב)/i.test(text);

  return {
    exists: true,
    protected: false,
    hasEmail: emails.length > 0,
    hasPhone: phones.length > 0,
    hasAddress: hasAddr,
    hasForm,
    emailValue: emails[0] ?? null,
    phoneValue: phones[0] ?? null,
    addressValue: $("address").first().text().trim() || null,
  };
}

async function scanSimplePolicy(url: string | null): Promise<SimplePageScan> {
  if (!url) return { exists: false, protected: false, wordCount: 0, html: "" };
  const f = await fetchHtml(url, PAGE_TIMEOUT_MS, GOOGLEBOT_UA);
  if (f.protected) return { exists: false, protected: true, wordCount: 0, html: f.html };
  if (!f.ok) return { exists: false, protected: false, wordCount: 0, html: "" };
  return {
    exists: true,
    protected: false,
    wordCount: wordCountHtml(f.html),
    html: f.html,
  };
}

function analyzeReturns(html: string, wordCount: number) {
  const lower = html.toLowerCase();
  const period =
    html.match(/(\d+)\s*(?:day|days|יום|ימים)/i) ??
    html.match(/within\s+(\d+)\s*(?:day|days)/i);
  const returnPeriodDays = period ? parseInt(period[1], 10) : null;
  const hasRefundProcess =
    /refund|החזר|money\s*back|החזרת\s*כסף/i.test(lower) && /process|within|policy|תהליך/i.test(lower);
  const hasCases =
    /damaged|defective|wrong\s*item|not\s*as\s*described|פגום|שבור|לא\s*תואם/i.test(lower);
  return { returnPeriodDays, hasRefundProcess, hasCases, wordCount };
}

function analyzeShipping(html: string, wordCount: number) {
  const lower = html.toLowerCase();
  return {
    hasFreeShipping: /free\s*shipping|משלוח\s*חינם|shipping\s*is\s*free/i.test(lower),
    hasDeliveryTime: /(\d+)\s*(?:business\s*)?(?:day|days|hours)|משלוח\s*תוך|delivery\s*time/i.test(
      lower
    ),
    hasShippingCost: /shipping\s*(?:cost|fee|rate)|עלות\s*משלוח|\$\s*\d+|₪\s*\d+/i.test(lower),
    wordCount,
  };
}

function analyzePrivacy(html: string, wordCount: number) {
  const lower = html.toLowerCase();
  return {
    hasDataCollection: /collect|personal\s*data|מידע\s*אישי|cookies/i.test(lower),
    hasThirdParty: /third\s*party|שותפים|google\s*analytics|facebook|meta\s*pixel/i.test(lower),
    wordCount,
  };
}

function analyzeTerms(html: string, wordCount: number, brandName: string | null) {
  const lower = html.toLowerCase();
  const genericOnly =
    /lorem\s+ipsum|insert\s+your\s+company|\[company\s*name\]|template/i.test(lower);
  const hasBrandName =
    brandName != null &&
    brandName.length > 2 &&
    lower.includes(brandName.toLowerCase().slice(0, Math.min(20, brandName.length)));
  return {
    termsHasBrandName: hasBrandName && !genericOnly,
    wordCount,
  };
}

const STOCK_IMG_RE =
  /unsplash|shutterstock|gettyimages|istockphoto|pexels|pixabay|placeholder|via\.placeholder|dummyimage|placehold\.it/i;

function analyzeProductPage(html: string): {
  hasPrice: boolean;
  priceValue: string | null;
  hasDescription: boolean;
  hasOriginalImages: boolean;
  hasTextOnImage: boolean;
  hasCollage: boolean;
  hasFakeReviews: boolean;
  hasUrgency: boolean;
} {
  const $ = cheerio.load(html);
  const text = extractVisibleText($, 80_000);
  const lower = text.toLowerCase();

  const priceEl = $(
    "[itemprop=price], .price, [class*='price'], [data-product-price], .woocommerce-Price-amount"
  ).first();
  const priceText = normalizeText(priceEl.text() || priceEl.attr("content") || "");
  const hasPrice = priceText.length > 0 && /[\d₪$€£]/.test(priceText);
  const priceValue = hasPrice ? priceText.slice(0, 80) : null;

  const desc =
    $("[itemprop=description], .product-description, .product__description, #product-description")
      .first()
      .text() || text;
  const hasDescription = normalizeText(desc).length > 100;

  let stockLike = 0;
  let totalImg = 0;
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    totalImg++;
    if (STOCK_IMG_RE.test(src)) stockLike++;
  });
  const hasOriginalImages = totalImg > 0 && stockLike < totalImg;

  const hasTextOnImage = $(".image-with-text, .banner__text, [class*='overlay']").length > 0;

  const gallery = $(".product-gallery, .product__media, [class*='gallery']").first();
  const hasCollage = gallery.find("img").length >= 3;

  const hasFakeReviews =
    /imported\s+from\s+aliexpress|amazon\s+reviews|reviews\s+from\s+etsy|loox|judge\.me\s+import/i.test(
      lower
    );

  const hasUrgency =
    /limited\s+stock|only\s+\d+\s+left|ends\s+in|countdown|hurry|עוד\s*\d+\s*במלאי/i.test(lower);

  return {
    hasPrice,
    priceValue,
    hasDescription,
    hasOriginalImages,
    hasTextOnImage,
    hasCollage,
    hasFakeReviews,
    hasUrgency,
  };
}

function analyzeAbout(html: string, wordCount: number) {
  const lower = html.toLowerCase();
  return {
    hasBrandStory: /our\s+story|מי\s*אנחנו|founded|נוסד|vision|ערכים/i.test(lower),
    hasTeam: /our\s+team|הצוות|meet\s+the\s+team|management/i.test(lower),
    hasFoundedDate: /\b(19|20)\d{2}\b/.test(lower) && /founded|since|established|נוסד/i.test(lower),
    wordCount,
  };
}

function pickProductUrls(allLinks: string[], baseOrigin: string, max: number): string[] {
  const patterns = [
    /\/products?\//i,
    /\/product\//i,
    /\/collections\/[^/]+\/products\//i,
    /\/item\//i,
    /\/p\//i,
  ];
  const out: string[] = [];
  for (const l of allLinks) {
    if (!l.startsWith(baseOrigin)) continue;
    if (patterns.some((p) => p.test(l)) && !/cart|checkout|account|policy|contact/i.test(l)) {
      out.push(l);
    }
    if (out.length >= max) break;
  }
  return [...new Set(out)].slice(0, max);
}

function consistencySet<T>(values: (T | null | undefined)[]): boolean {
  const normalized = values
    .filter((v): v is T => v != null && String(v).trim() !== "")
    .map((v) => String(v).trim().toLowerCase());
  if (normalized.length <= 1) return true;
  const s = new Set(normalized);
  return s.size <= 1;
}

function nameConsistency(primary: string | null, others: (string | null)[]): boolean {
  if (!primary || primary.length < 2) return true;
  const p = primary.toLowerCase().slice(0, 40);
  for (const o of others) {
    if (!o || o.length < 2) continue;
    const ol = o.toLowerCase();
    if (!ol.includes(p.slice(0, Math.min(12, p.length))) && !p.includes(ol.slice(0, 12))) {
      return false;
    }
  }
  return true;
}

export function emptyCrawlResult(url: string): CrawlResult {
  const fp = emptySiteFingerprint();
  const u = normalizeUrlInput(url);
  return {
    hasSSL: /^https:\/\//i.test(u),
    isGooglebotBlocked: false,
    responseTime: 0,
    redirectCount: 0,
    httpStatus: 0,
    businessName: null,
    email: null,
    emailIsBranded: false,
    phone: null,
    address: null,
    platform: null,
    currency: null,
    language: null,
    hasLogo: false,
    hasPopup: false,
    hasAutoPlayVideo: false,
    hasFakeUrgency: false,
    hasFakeCountdown: false,
    hasTrustBadges: false,
    hasMedicalClaims: false,
    hasContactPage: false,
    contactEmail: null,
    contactPhone: null,
    contactAddress: null,
    hasContactForm: false,
    hasReturnPolicy: false,
    returnPeriodDays: null,
    hasRefundProcess: false,
    hasReturnCases: false,
    returnPolicyWordCount: 0,
    hasShippingPolicy: false,
    hasFreeShipping: false,
    hasDeliveryTime: false,
    hasShippingCost: false,
    shippingPolicyWordCount: 0,
    hasPrivacyPolicy: false,
    privacyWordCount: 0,
    hasDataCollection: false,
    hasThirdParty: false,
    hasTerms: false,
    termsWordCount: 0,
    termsHasBrandName: false,
    footerHasEmail: false,
    footerHasPhone: false,
    footerHasAddress: false,
    footerHasPolicyLinks: false,
    productsChecked: 0,
    hasRealPrices: false,
    hasProductDescriptions: false,
    hasFakeReviews: false,
    productHasUrgency: false,
    hasAboutPage: false,
    aboutWordCount: 0,
    hasBrandStory: false,
    hasTeam: false,
    hasFoundedDate: false,
    emailConsistent: true,
    phoneConsistent: true,
    nameConsistent: true,
    navLinks: [],
    policyLinks: [],
    allText: "",
    fingerprint: fp,
    hasPopups: false,
    hasBrandName: false,
    hasEmail: false,
    hasPhone: false,
    hasAddress: false,
    metaTitle: "",
    metaDescription: "",
    pageTitle: "",
    allLinks: [],
    hasBrokenLinks: false,
    hasSpellingIssues: false,
    hasFakeTrustBadges: false,
    footerHasContact: false,
    footerHasPrivacy: false,
  };
}

export async function crawlWebsite(url: string): Promise<CrawlResult> {
  const targetUrl = normalizeUrlInput(url.trim());
  if (!targetUrl) throw new Error("URL is required");

  const empty = emptyCrawlResult(targetUrl);

  const phase1Start = performance.now();
  const origin = parseOrigin(targetUrl);

  const [robotsSettled, chainSettled] = await Promise.allSettled([
    origin ? fetchRobotsTxt(origin, PHASE1_BUDGET_MS) : Promise.resolve({ blocked: false, status: 0, protected: false }),
    withTimeout(measureRedirectChain(targetUrl, PHASE1_BUDGET_MS), PHASE1_BUDGET_MS, "phase1-chain"),
  ]);

  const robots =
    robotsSettled.status === "fulfilled"
      ? robotsSettled.value
      : { blocked: false, status: 0, protected: false };
  const chain =
    chainSettled.status === "fulfilled"
      ? chainSettled.value
      : { finalUrl: targetUrl, redirectCount: 0, status: 0, responseTime: 0 };

  const phase1Ms = Math.round(performance.now() - phase1Start);
  const crawlUrl = chain.finalUrl;
  const hasSSL = /^https:\/\//i.test(crawlUrl);

  const homeStart = performance.now();
  const home = await fetchHtml(crawlUrl, HOMEPAGE_BUDGET_MS, GOOGLEBOT_UA);
  const homeElapsed = Math.round(performance.now() - homeStart);
  const responseTime = phase1Ms + homeElapsed;

  if (!home.ok || !home.html) {
    return {
      ...empty,
      hasSSL,
      isGooglebotBlocked: robots.blocked,
      responseTime,
      redirectCount: chain.redirectCount,
      httpStatus: home.status || chain.status,
      fingerprint: emptySiteFingerprint(),
    };
  }

  const $ = cheerio.load(home.html);
  const finalUrl = home.finalUrl;
  const allLinks = collectAbsoluteLinks($, finalUrl);
  const navLinks = pickNavLinks($, finalUrl);
  const policyLinkList = pickPolicyLinks(allLinks);
  const allText = extractVisibleText($, ALLTEXT_MAX);
  const textLower = allText.toLowerCase();

  const businessName = extractBusinessName($);
  const emailsHome = getAllEmails(home.html);
  const phonesHome = extractPhones(`${allText}\n${home.html}`);
  const ld = extractFromJsonLd($);
  const metaDesc = normalizeText(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      ""
  );
  const metaTitle =
    normalizeText($('meta[property="og:title"]').attr("content") ?? "") ||
    normalizeText($("title").first().text());
  const pageTitle = normalizeText($("title").first().text());

  const primaryEmail = extractFirstBrandedEmail(home.html) ?? emailsHome[0] ?? null;
  const primaryPhone = phonesHome[0] ?? null;
  let address = ld.address;
  if (!address && /כתובת|address/i.test(allText)) {
    const m = allText.match(/(?:כתובת|address)\s*[:\s]+([^\n]{10,120})/i);
    if (m) address = normalizeText(m[1]);
  }

  const platform = detectPlatform(home.html);
  const currency =
    ld.currency ||
    normalizeText($('meta[property="product:price:currency"]').attr("content") ?? "") ||
    extractCurrencySymbols(allText) ||
    null;
  const langAttr = ($("html").attr("lang") ?? "").trim();
  const language = langAttr ? langAttr.split(/[-_]/)[0]?.toLowerCase() ?? null : null;

  const hasLogo =
    $('img[alt*="logo" i], img[src*="logo" i], img[class*="logo" i], .logo img, #logo img, header img[class*="brand" i]')
      .length > 0;

  const hasPopup =
    $(".modal, .popup, [class*='interstitial'], [id*='popup'], [role='dialog']").length > 0;

  const hasAutoPlayVideo = $("video[autoplay]").length > 0;

  const hasFakeUrgency =
    /limited\s*time|only\s+\d+\s+left|ends\s+in|hurry|while\s+supplies\s+last|נשארו\s+רק/i.test(
      textLower
    );

  const hasFakeCountdown =
    /countdown|timer|\d{1,2}:\d{2}:\d{2}|ends?\s+in\s+\d+/i.test(textLower) &&
    /sale|offer|deal|מבצע/i.test(textLower);

  const hasTrustBadges =
    /\bcertified\b|\bofficial\b|as\s+seen\s+on|featured\s+in|verified\s+badge|תו\s*תקן/i.test(
      textLower
    );

  const hasMedicalClaims =
    /\bcures\b|\btreats\b|\bheals\b|\bfda\b|miracle|clinical(?:ly)?\s*proven|ריפוי|מרפא/i.test(
      textLower
    );

  const footer = $("footer");
  const footerHtml = footer.html() ?? "";
  const footerText = footer.text();
  const footerEmails = getAllEmails(footerHtml);
  const footerPhones = extractPhones(footerText);
  const footerHasEmail = footerEmails.length > 0;
  const footerHasPhone = footerPhones.length > 0;
  const footerHasAddress =
    footer.find("address").length > 0 ||
    /\d{1,5}\s+[\w.\s]{4,}(street|st|road|rd|ave)/i.test(footerText);
  const footerPolicyText = footer.find("a").toArray().map((el) => $(el).attr("href") ?? "").join(" ");
  const footerHasPolicyLinks = /privacy|return|terms|shipping|policy/i.test(
    `${footerPolicyText} ${footer.text()}`.toLowerCase()
  );

  const originFinal = parseOrigin(finalUrl);
  const contactCandidates = [
    `${originFinal}/contact`,
    `${originFinal}/contact-us`,
    `${originFinal}/pages/contact`,
    `${originFinal}/en/contact`,
  ];
  const contactUrl =
    findBestUrl(allLinks, [/contact(?!er)/i, /pages\/contact/i, /contact-us/i], contactCandidates) ??
    null;

  const returnCandidates = [
    `${originFinal}/returns`,
    `${originFinal}/return-policy`,
    `${originFinal}/refund-policy`,
    `${originFinal}/pages/returns`,
    `${originFinal}/policies/refund-policy`,
  ];
  const returnUrl =
    findBestUrl(allLinks, [/return/i, /refund/i, /cancellation/i], returnCandidates) ?? null;

  const shipCandidates = [
    `${originFinal}/shipping`,
    `${originFinal}/shipping-policy`,
    `${originFinal}/pages/shipping`,
    `${originFinal}/policies/shipping-policy`,
  ];
  const shipUrl =
    findBestUrl(allLinks, [/shipping/i, /delivery/i], shipCandidates) ?? null;

  const privacyCandidates = [
    `${originFinal}/privacy-policy`,
    `${originFinal}/privacy`,
    `${originFinal}/pages/privacy`,
    `${originFinal}/policies/privacy-policy`,
  ];
  const privacyUrl = findBestUrl(allLinks, [/privacy/i], privacyCandidates) ?? null;

  const termsCandidates = [
    `${originFinal}/terms`,
    `${originFinal}/terms-of-service`,
    `${originFinal}/pages/terms`,
    `${originFinal}/policies/terms-of-service`,
  ];
  const termsUrl =
    findBestUrl(allLinks, [/terms/i, /tos/i, /conditions/i], termsCandidates) ?? null;

  const aboutCandidates = [
    `${originFinal}/about`,
    `${originFinal}/about-us`,
    `${originFinal}/pages/about`,
  ];
  const aboutUrl =
    findBestUrl(allLinks, [/about(?!out)/i, /our-story/i], aboutCandidates) ?? null;

  const productUrls = pickProductUrls(allLinks, originFinal, 3);

  const phase3Fn = async () => {
    const settled = await Promise.allSettled([
      scanContactPage(contactUrl),
      scanSimplePolicy(returnUrl),
      scanSimplePolicy(shipUrl),
      scanSimplePolicy(privacyUrl),
      scanSimplePolicy(termsUrl),
    ]);
    return settled;
  };

  const phase4Fn = async () => {
    const settled = await Promise.allSettled(
      productUrls.map((u) => fetchHtml(u, PAGE_TIMEOUT_MS, GOOGLEBOT_UA))
    );
    return settled;
  };

  const phase5Fn = async () => scanSimplePolicy(aboutUrl);

  const [r3, r4, r5] = await Promise.allSettled([
    withTimeout(phase3Fn(), PHASE3_BUDGET_MS, "phase3"),
    withTimeout(phase4Fn(), PHASE4_BUDGET_MS, "phase4"),
    withTimeout(phase5Fn(), PHASE5_BUDGET_MS, "phase5"),
  ]);

  const p3: PromiseSettledResult<unknown>[] =
    r3.status === "fulfilled" && Array.isArray(r3.value) ? r3.value : [];
  const p4: PromiseSettledResult<unknown>[] =
    r4.status === "fulfilled" && Array.isArray(r4.value) ? r4.value : [];
  const p5: SimplePageScan =
    r5.status === "fulfilled" && r5.value && typeof r5.value === "object"
      ? (r5.value as SimplePageScan)
      : { exists: false, protected: false, wordCount: 0, html: "" };

  let contact: ContactScan = {
    exists: false,
    protected: false,
    hasEmail: false,
    hasPhone: false,
    hasAddress: false,
    hasForm: false,
    emailValue: null,
    phoneValue: null,
    addressValue: null,
  };
  let returnsP: SimplePageScan = { exists: false, protected: false, wordCount: 0, html: "" };
  let shipP: SimplePageScan = { exists: false, protected: false, wordCount: 0, html: "" };
  let privacyP: SimplePageScan = { exists: false, protected: false, wordCount: 0, html: "" };
  let termsP: SimplePageScan = { exists: false, protected: false, wordCount: 0, html: "" };

  {
    const s0 = p3[0];
    const s1 = p3[1];
    const s2 = p3[2];
    const s3 = p3[3];
    const s4 = p3[4];
    if (s0?.status === "fulfilled") contact = s0.value as ContactScan;
    if (s1?.status === "fulfilled") returnsP = s1.value as SimplePageScan;
    if (s2?.status === "fulfilled") shipP = s2.value as SimplePageScan;
    if (s3?.status === "fulfilled") privacyP = s3.value as SimplePageScan;
    if (s4?.status === "fulfilled") termsP = s4.value as SimplePageScan;
  }

  const retAnalysis = returnsP.exists ? analyzeReturns(returnsP.html, returnsP.wordCount) : null;
  const shipAnalysis = shipP.exists ? analyzeShipping(shipP.html, shipP.wordCount) : null;
  const privAnalysis = privacyP.exists ? analyzePrivacy(privacyP.html, privacyP.wordCount) : null;
  const termsAnalysis = termsP.exists
    ? analyzeTerms(termsP.html, termsP.wordCount, businessName)
    : null;

  const aboutP = p5;
  const aboutA = aboutP.exists ? analyzeAbout(aboutP.html, aboutP.wordCount) : null;

  let productsChecked = 0;
  let hasRealPrices = false;
  let hasProductDescriptions = false;
  let hasFakeReviews = false;
  let productHasUrgency = false;

  for (const r of p4) {
    if (r.status !== "fulfilled") continue;
    const fr = r.value as Awaited<ReturnType<typeof fetchHtml>>;
    if (!fr.ok || !fr.html) continue;
    productsChecked++;
    const a = analyzeProductPage(fr.html);
    if (a.hasPrice) hasRealPrices = true;
    if (a.hasDescription) hasProductDescriptions = true;
    if (a.hasFakeReviews) hasFakeReviews = true;
    if (a.hasUrgency) productHasUrgency = true;
  }

  const hasContactPage =
    contact.exists ||
    allLinks.some((l) => /contact(?!er)/i.test(l)) ||
    /\/contact/i.test(navLinks.join(" "));

  const emailConsistent = consistencySet([
    primaryEmail,
    contact.emailValue,
    footerEmails[0] ?? null,
  ]);
  const phoneConsistent = consistencySet([
    primaryPhone,
    contact.phoneValue,
    footerPhones[0] ?? null,
  ]);
  const nameConsistent = nameConsistency(businessName, [
    pageTitle,
    metaTitle,
    contact.addressValue ? businessName : null,
  ]);

  const fingerprint = extractSiteFingerprint($, home.html, finalUrl, allText, allLinks);
  if (primaryEmail) fingerprint.email = primaryEmail;
  if (primaryPhone) fingerprint.phone = primaryPhone;
  if (address) fingerprint.address = address;
  if (platform) fingerprint.platform = platform;
  if (currency) fingerprint.currency = currency;
  if (language) fingerprint.language = language;

  const hasEmail =
    emailsHome.length > 0 ||
    !!contact.emailValue ||
    footerHasEmail;
  const emailIsBranded =
    emailsHome.some(isBrandedEmail) ||
    (contact.emailValue != null && isBrandedEmail(contact.emailValue)) ||
    (footerEmails.length > 0 && footerEmails.some(isBrandedEmail));

  const hasPhone = phonesHome.length > 0 || contact.hasPhone || footerHasPhone;
  const hasAddress =
    !!address ||
    contact.hasAddress ||
    footerHasAddress ||
    /\d{1,5}\s+[\w.\s]{4,}(street|st|road|rd)/i.test(allText);

  const result: CrawlResult = {
    hasSSL,
    isGooglebotBlocked: robots.blocked,
    responseTime,
    redirectCount: chain.redirectCount,
    httpStatus: home.status,

    businessName,
    email: primaryEmail,
    emailIsBranded,
    phone: primaryPhone,
    address,
    platform,
    currency,
    language: language ?? fingerprint.language,

    hasLogo,
    hasPopup,
    hasAutoPlayVideo,
    hasFakeUrgency,
    hasFakeCountdown,
    hasTrustBadges,
    hasMedicalClaims,

    hasContactPage,
    contactEmail: contact.emailValue,
    contactPhone: contact.phoneValue,
    contactAddress: contact.addressValue,
    hasContactForm: contact.hasForm,

    hasReturnPolicy: returnsP.exists,
    returnPeriodDays: retAnalysis?.returnPeriodDays ?? null,
    hasRefundProcess: retAnalysis?.hasRefundProcess ?? false,
    hasReturnCases: retAnalysis?.hasCases ?? false,
    returnPolicyWordCount: returnsP.wordCount,

    hasShippingPolicy: shipP.exists,
    hasFreeShipping: shipAnalysis?.hasFreeShipping ?? false,
    hasDeliveryTime: shipAnalysis?.hasDeliveryTime ?? false,
    hasShippingCost: shipAnalysis?.hasShippingCost ?? false,
    shippingPolicyWordCount: shipP.wordCount,

    hasPrivacyPolicy: privacyP.exists || policyLinkList.some((l) => /privacy/i.test(l)),
    privacyWordCount: privacyP.wordCount,
    hasDataCollection: privAnalysis?.hasDataCollection ?? false,
    hasThirdParty: privAnalysis?.hasThirdParty ?? false,

    hasTerms: termsP.exists,
    termsWordCount: termsP.wordCount,
    termsHasBrandName: termsAnalysis?.termsHasBrandName ?? false,

    footerHasEmail,
    footerHasPhone,
    footerHasAddress,
    footerHasPolicyLinks,

    productsChecked,
    hasRealPrices: productsChecked > 0 ? hasRealPrices : false,
    hasProductDescriptions: productsChecked > 0 ? hasProductDescriptions : false,
    hasFakeReviews,
    productHasUrgency,

    hasAboutPage: aboutP.exists || allLinks.some((l) => /\/about/i.test(l)),
    aboutWordCount: aboutP.wordCount,
    hasBrandStory: aboutA?.hasBrandStory ?? false,
    hasTeam: aboutA?.hasTeam ?? false,
    hasFoundedDate: aboutA?.hasFoundedDate ?? false,

    emailConsistent,
    phoneConsistent,
    nameConsistent,

    navLinks,
    policyLinks: policyLinkList,
    allText,
    fingerprint,

    hasPopups: hasPopup,
    hasBrandName: !!businessName,
    hasEmail,
    hasPhone,
    hasAddress,
    metaTitle,
    metaDescription: metaDesc,
    pageTitle,
    allLinks,
    hasBrokenLinks: false,
    hasSpellingIssues: hasSpellingRedFlags(allText),
    hasFakeTrustBadges: hasTrustBadges,
    footerHasContact: footerHasEmail || footerHasPhone || footerHasAddress,
    footerHasPrivacy: footerHasPolicyLinks || /privacy/i.test(footer.text()),
  };

  return result;
}
