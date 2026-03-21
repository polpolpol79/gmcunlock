import axios from "axios";
import * as cheerio from "cheerio";

const USER_AGENT = "Mozilla/5.0 (compatible; GMCUnlock/1.0)";
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
]);

/** Detected from HTML before / alongside full crawl heuristics. */
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
  // Brand & Structure
  hasLogo: boolean;
  hasBrandName: boolean;
  hasAboutPage: boolean;
  hasContactPage: boolean;

  // Contact Info
  hasEmail: boolean;
  emailIsBranded: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  hasContactForm: boolean;

  // Policy Pages
  hasPrivacyPolicy: boolean;
  hasReturnPolicy: boolean;
  hasShippingPolicy: boolean;
  hasTerms: boolean;

  // Technical
  hasSSL: boolean;
  hasBrokenLinks: boolean;
  hasPopups: boolean;
  metaTitle: string;
  metaDescription: string;

  // Content Quality
  hasSpellingIssues: boolean;
  hasFakeUrgency: boolean;
  hasFakeTrustBadges: boolean;
  hasMedicalClaims: boolean;

  // Footer
  footerHasContact: boolean;
  footerHasPrivacy: boolean;

  // Raw
  pageTitle: string;
  allLinks: string[];
  allText: string;

  /** Business / tech signals extracted early from the page */
  fingerprint: SiteFingerprint;
};

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
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

function extractFirstBrandedEmail(html: string): string | null {
  for (const e of getAllEmails(html)) {
    if (isBrandedEmail(e)) return e;
  }
  return null;
}

/** First plausible phone (international / local patterns). */
function extractFirstPhone(text: string): string | null {
  const candidates =
    text.match(
      /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,6}\b/g
    ) ?? [];
  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return normalizeText(raw);
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

function detectPlatform(html: string): SiteFingerprint["platform"] {
  const h = html.toLowerCase();
  if (h.includes("cdn.shopify.com") || /shopify\.com\/s\/files/i.test(h) || /"Shopify"/i.test(html))
    return "shopify";
  if (h.includes("woocommerce") || h.includes("wp-content/plugins/woocommerce")) return "woocommerce";
  if (h.includes("wix.com") || h.includes("wixstatic.com") || /wix site/i.test(h)) return "wix";
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
  if (/\$\d+|\beur\b|\bgbp\b|price\s*:/i.test(bundle)) ecom += 1;

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
  const ogTitle = normalizeText($('meta[property="og:title"]').attr("content") ?? "");
  if (ogTitle.length > 1) return ogTitle;
  const t = normalizeText($("title").first().text());
  if (t.length > 1) return t.split(/[|\-–]/)[0]?.trim() ?? t;
  const h1 = normalizeText($("h1").first().text());
  if (h1.length > 1 && h1.length < 120) return h1;
  return null;
}

function extractStreetAddressHeuristic(text: string): string | null {
  const m = text.match(
    /\d{1,5}\s+[\w.\- ]{2,40}\s+(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr)\b[^.]{0,80}/i
  );
  return m ? normalizeText(m[0]) : null;
}

/**
 * Run on loaded DOM + HTML string (cheap) before expensive network checks (e.g. broken links).
 */
export function extractSiteFingerprint(
  $: cheerio.CheerioAPI,
  html: string,
  _finalUrl: string,
  allText: string,
  allLinks: string[]
): SiteFingerprint {
  const lowerText = allText.toLowerCase();
  const ld = extractFromJsonLd($);

  let address = ld.address;
  if (!address && ($("address").length > 0 || hasAddressLikeContent($, allText))) {
    const fromDom = normalizeText($("address").first().text());
    address = fromDom.length > 8 ? fromDom : extractStreetAddressHeuristic(allText);
  }

  const langFull = ($("html").attr("lang") ?? "").trim();
  const language = langFull ? langFull.split(/[-_]/)[0]?.toLowerCase() ?? null : null;
  const countryFromLang = langFull.includes("-")
    ? langFull.split(/[-_]/)[1]?.toUpperCase() ?? null
    : null;

  const ogLocale = normalizeText($('meta[property="og:locale"]').attr("content") ?? "");
  const country =
    ld.country ??
    countryFromLang ??
    (ogLocale.includes("_") ? ogLocale.split("_")[1]?.toUpperCase() ?? null : null);

  const currMeta = normalizeText(
    $('meta[property="product:price:currency"]').attr("content") ?? ""
  );

  return {
    businessName: extractBusinessName($),
    email: extractFirstBrandedEmail(html),
    phone: extractFirstPhone(`${allText}\n${html}`),
    address,
    platform: detectPlatform(html),
    siteType: detectSiteType(html, lowerText, allLinks),
    currency: ld.currency ?? (currMeta || null),
    country,
    language: language ?? null,
  };
}

function hasPhoneNumber(text: string): boolean {
  // Basic international phone heuristic.
  return /(?:\+?\d[\d\s().-]{7,}\d)/.test(text);
}

function hasAddressLikeContent($: cheerio.CheerioAPI, text: string): boolean {
  if ($("address").length > 0) return true;

  const addressRegex =
    /\b\d{1,5}\s+[A-Za-z0-9.\- ]{2,}\s(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|way)\b/i;
  if (addressRegex.test(text)) return true;

  const cityZipRegex = /\b[A-Za-z ]+,\s?[A-Z]{2}\s?\d{4,6}\b/;
  return cityZipRegex.test(text);
}

function linkMatches(link: string, terms: string[]): boolean {
  const target = link.toLowerCase();
  return terms.some((term) => target.includes(term));
}

function hasSpellingRedFlags(text: string): boolean {
  const lower = text.toLowerCase();
  const commonMistakes = [
    "recieve",
    "seperate",
    "definately",
    "occured",
    "untill",
    "adress",
    "guarentee",
    "enviroment",
  ];
  const mistakesCount = commonMistakes.reduce((acc, term) => {
    return acc + (lower.includes(term) ? 1 : 0);
  }, 0);

  const repeatedChars = (lower.match(/([a-z])\1{2,}/g) ?? []).length;
  return mistakesCount >= 1 || repeatedChars >= 3;
}

function extractVisibleText($: cheerio.CheerioAPI): string {
  const clone = $.root().clone();
  clone.find("script, style, noscript, svg").remove();
  const text = normalizeText(clone.text());
  return text.slice(0, 5000);
}

async function detectBrokenLinks(allLinks: string[]): Promise<boolean> {
  const httpLinks = allLinks
    .filter((l) => l.startsWith("http://") || l.startsWith("https://"))
    .slice(0, 20);

  for (const link of httpLinks) {
    try {
      const res = await axios.get(link, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.status >= 400) {
        return true;
      }
    } catch {
      return true;
    }
  }

  return false;
}

export async function crawlWebsite(url: string): Promise<CrawlResult> {
  const targetUrl = url.trim();
  if (!targetUrl) {
    throw new Error("URL is required");
  }

  const response = await axios.get<string>(targetUrl, {
    timeout: 15000,
    maxRedirects: 5,
    responseType: "text",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const finalUrl = response.request?.res?.responseUrl ?? targetUrl;
  const html = response.data ?? "";
  const $ = cheerio.load(html);

  const pageTitle = normalizeText($("title").first().text());
  const metaTitle =
    normalizeText($('meta[property="og:title"]').attr("content") ?? "") || pageTitle;
  const metaDescription = normalizeText(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      ""
  );

  const hrefs = $("a[href]")
    .map((_, el) => $(el).attr("href") ?? "")
    .get()
    .filter(Boolean);

  const allLinks = [
    ...new Set(
      hrefs
        .map((href) => {
          try {
            return new URL(href, finalUrl).toString();
          } catch {
            return "";
          }
        })
        .filter(Boolean)
    ),
  ];
  const allText = extractVisibleText($);
  const fingerprint = extractSiteFingerprint($, html, finalUrl, allText, allLinks);
  const lowerText = allText.toLowerCase();

  const emails = getAllEmails(html);
  const hasEmail = emails.length > 0;
  const emailIsBranded = emails.some(isBrandedEmail);

  const footerText = normalizeText($("footer").text()).toLowerCase();
  const footerLinks = $("footer a[href]")
    .map((_, el) => ($(el).attr("href") ?? "") + " " + normalizeText($(el).text()))
    .get()
    .join(" ")
    .toLowerCase();

  const hasBrokenLinks = await detectBrokenLinks(allLinks);

  const hasFakeUrgency = /limited time|only\s+\d+\s+left|hurry|ends tonight|countdown|flash sale/i.test(
    lowerText
  );
  const hasFakeTrustBadges =
    /(official|certified|verified|guaranteed secure)/i.test(lowerText) &&
    !/(iso|fda|ssl|pci|gdpr|certificate id|registration number)/i.test(lowerText);

  return {
    // Brand & Structure
    hasLogo:
      $('img[alt*="logo" i], .logo, #logo, [class*="brand" i][class*="logo" i]').length > 0,
    hasBrandName:
      pageTitle.length > 0 ||
      normalizeText($('meta[property="og:site_name"]').attr("content") ?? "").length > 0,
    hasAboutPage: allLinks.some((l) => linkMatches(l, ["/about", "about-us", "our-story"])),
    hasContactPage: allLinks.some((l) =>
      linkMatches(l, ["/contact", "contact-us", "support"])
    ),

    // Contact Info
    hasEmail,
    emailIsBranded,
    hasPhone: hasPhoneNumber(allText),
    hasAddress: hasAddressLikeContent($, allText),
    hasContactForm:
      $("form").length > 0 &&
      $('form input[type="email"], form input[type="tel"], form textarea').length > 0,

    // Policy Pages
    hasPrivacyPolicy: allLinks.some((l) => linkMatches(l, ["privacy"])),
    hasReturnPolicy: allLinks.some((l) => linkMatches(l, ["return", "refund"])),
    hasShippingPolicy: allLinks.some((l) => linkMatches(l, ["shipping", "delivery"])),
    hasTerms: allLinks.some((l) => linkMatches(l, ["terms", "conditions", "tos"])),

    // Technical
    hasSSL: finalUrl.startsWith("https://"),
    hasBrokenLinks,
    hasPopups:
      $('[class*="popup" i], [id*="popup" i], [class*="modal" i], [id*="modal" i]').length > 0 ||
      /subscribe|cookie consent|join our newsletter/i.test(lowerText),
    metaTitle,
    metaDescription,

    // Content Quality
    hasSpellingIssues: hasSpellingRedFlags(allText),
    hasFakeUrgency,
    hasFakeTrustBadges,
    hasMedicalClaims:
      /cure|treats|prevents disease|clinically proven|miracle|guaranteed results/i.test(lowerText),

    // Footer
    footerHasContact: /contact|email|phone|address/i.test(`${footerText} ${footerLinks}`),
    footerHasPrivacy: /privacy/i.test(`${footerText} ${footerLinks}`),

    // Raw
    pageTitle,
    allLinks,
    allText,

    fingerprint,
  };
}

