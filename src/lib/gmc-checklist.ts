// ============================================================
// lib/gmc-checklist.ts
// קובץ החוקים הרשמי של GMC Analyzer
// 77 סעיפים — הלב של המוצר
// גרסה 2.0 — תמיכה בפרופילים + עקביות בין מקורות
// ============================================================

import {
  toSiteFingerprint,
  type SiteFingerprint,
  type WebsiteScanData,
} from "@/lib/crawler";
import type { PageSpeedData } from "@/lib/pagespeed";
import type { UserProfileInput } from "@/lib/scan-schemas";

export type Priority = "urgent" | "rec";

export type ProfileType = "all" | "ecommerce" | "service_provider" | "leads_only";

export type DataSource = "crawl" | "gmc" | "gads" | "shopify" | "gmb" | "pagespeed";

export type BusinessType = "ecommerce_shopify" | "ecommerce_other" | "service_provider" | "leads_only" | "other";

export type Platform = "shopify" | "woocommerce" | "wix" | "other";

export type BlockedWhere = "merchant_center" | "google_ads" | "both" | "not_blocked";

// ─── פרופיל המשתמש (מ-4 השאלות) ──────────────────────────
export interface UserProfile {
  business_type: BusinessType;
  platform: Platform;
  blocked_where: BlockedWhere;
  has_gmb: boolean;
}

// ─── מבנה סעיף ────────────────────────────────────────────
export interface ChecklistItem {
  id: number;
  priority: Priority;
  text: string;
  applies_to: ProfileType[];
  source: DataSource;
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

// ─── FULL CHECKLIST (85 items) ──────────────────────────
export const CHECKLIST: ChecklistSection[] = [
  {
    id: "s1",
    title: "Site Structure & Branding",
    items: [
      { id: 1,  priority: "urgent", text: "Brand is visible and prominent on homepage — not just a product grid",   applies_to: ["all"],                                   source: "crawl"      },
      { id: 2,  priority: "urgent", text: "URL and store name are legitimate — no spam or impersonation",           applies_to: ["all"],                                   source: "crawl"      },
      { id: 3,  priority: "urgent", text: "High-quality logo that is not blurry or pixelated",                      applies_to: ["all"],                                   source: "crawl"      },
      { id: 4,  priority: "urgent", text: "No intrusive popups or auto-playing videos with sound",                  applies_to: ["all"],                                   source: "crawl"      },
      { id: 5,  priority: "rec",    text: "Visible About Us page",                                                 applies_to: ["all"],                                   source: "crawl"      },
      { id: 6,  priority: "rec",    text: "Navigation includes About and Contact links",                           applies_to: ["all"],                                   source: "crawl"      },
      { id: 7,  priority: "rec",    text: "PageSpeed performance score above 65",                                  applies_to: ["all"],                                   source: "pagespeed"  },
    ]
  },
  {
    id: "s2",
    title: "Contact Details & Transparency",
    items: [
      { id: 8,  priority: "urgent", text: "Branded email address — not gmail/yahoo/hotmail",                       applies_to: ["all"],                                   source: "crawl"      },
      { id: 9,  priority: "urgent", text: "Contact page with email + phone + physical address",                    applies_to: ["all"],                                   source: "crawl"      },
      { id: 10, priority: "urgent", text: "Clear physical business address on the website",                        applies_to: ["all"],                                   source: "crawl"      },
      { id: 11, priority: "urgent", text: "Real and working phone number",                                         applies_to: ["all"],                                   source: "crawl"      },
      { id: 12, priority: "urgent", text: "Footer includes email + phone + address",                               applies_to: ["all"],                                   source: "crawl"      },
      { id: 13, priority: "urgent", text: "Contact details match across website, GMC, Ads, and public Google (OSINT)", applies_to: ["all"],                               source: "crawl"      },
      { id: 14, priority: "rec",    text: "Contact form available",                                                applies_to: ["all"],                                   source: "crawl"      },
      { id: 15, priority: "rec",    text: "Business hours and response time stated",                               applies_to: ["all"],                                   source: "crawl"      },
      { id: 80, priority: "urgent", text: "Professional license or certification displayed (lawyer, doctor, etc.)", applies_to: ["service_provider"],                      source: "crawl"      },
      { id: 81, priority: "urgent", text: "Clear office/business details — name, address, phone",                  applies_to: ["service_provider"],                      source: "crawl"      },
    ]
  },
  {
    id: "s3",
    title: "Policy Pages",
    items: [
      { id: 16, priority: "urgent", text: "Valid Privacy Policy page",                                             applies_to: ["all"],                                   source: "crawl"      },
      { id: 17, priority: "urgent", text: "Unique Terms of Service — no references to other brands",               applies_to: ["all"],                                   source: "crawl"      },
      { id: 18, priority: "urgent", text: "Detailed Returns & Refunds policy",                                     applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 19, priority: "urgent", text: "Detailed Shipping Policy",                                              applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 20, priority: "rec",    text: "Policy links from product pages",                                       applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 78, priority: "rec",    text: "Service description or process explanation page",                       applies_to: ["service_provider"],                      source: "crawl"      },
      { id: 79, priority: "rec",    text: "FAQ / frequently asked questions page",                                 applies_to: ["service_provider", "leads_only"],        source: "crawl"      },
    ]
  },
  {
    id: "s4",
    title: "Checkout & Payments",
    items: [
      { id: 21, priority: "urgent", text: "Secure SSL checkout",                                                   applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 22, priority: "urgent", text: "Payment icons match actual checkout options",                            applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 23, priority: "urgent", text: "No hidden charges or fees",                                             applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 24, priority: "urgent", text: "No exaggerated unproven discounts",                                     applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 25, priority: "urgent", text: "All discounts work correctly in practice",                              applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 26, priority: "rec",    text: "Multiple payment methods available",                                    applies_to: ["ecommerce"],                             source: "crawl"      },
    ]
  },
  {
    id: "s5",
    title: "Product Pages & Content",
    items: [
      { id: 27, priority: "urgent", text: "Original product descriptions",                                         applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 28, priority: "urgent", text: "Original product images",                                               applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 29, priority: "urgent", text: "No stock photos used as product images",                                applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 30, priority: "urgent", text: "No text overlays on product images for GMC feed",                       applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 31, priority: "urgent", text: "No collage as primary product image",                                   applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 32, priority: "urgent", text: "Accurate price and availability",                                       applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 33, priority: "urgent", text: "No fake urgency tactics (countdown timers, fake stock limits)",          applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 34, priority: "urgent", text: "No fake or imported reviews",                                           applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 35, priority: "urgent", text: "No spelling errors",                                                    applies_to: ["all"],                                   source: "crawl"      },
      { id: 36, priority: "rec",    text: "Product titles include brand name",                                     applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 37, priority: "rec",    text: "No duplicate product images",                                           applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 38, priority: "rec",    text: "Clear features and benefits listed",                                    applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 39, priority: "rec",    text: "Good mix of text and images on pages",                                  applies_to: ["all"],                                   source: "crawl"      },
      { id: 82, priority: "urgent", text: "Clear landing page with single CTA and focused message",                applies_to: ["leads_only"],                            source: "crawl"      },
      { id: 83, priority: "rec",    text: "Social proof — testimonials, client logos, numbers",                    applies_to: ["leads_only", "service_provider"],        source: "crawl"      },
      { id: 84, priority: "rec",    text: "Clear explanation of what the customer gets for their money/inquiry",    applies_to: ["leads_only"],                            source: "crawl"      },
      { id: 85, priority: "urgent", text: "No exaggerated promises or misleading claims",                          applies_to: ["leads_only"],                            source: "crawl"      },
    ]
  },
  {
    id: "s6",
    title: "Returns Policy",
    items: [
      { id: 40, priority: "urgent", text: "Clear return period stated",                                            applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 41, priority: "urgent", text: "Different return scenarios detailed",                                    applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 42, priority: "urgent", text: "GMC return settings match website policy",                              applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 43, priority: "rec",    text: "Return request process explained",                                      applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 44, priority: "rec",    text: "Refund timeline stated",                                                applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 45, priority: "rec",    text: "Refund method specified",                                               applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 46, priority: "rec",    text: "Policy language matches target audience",                                applies_to: ["ecommerce"],                             source: "crawl"      },
    ]
  },
  {
    id: "s7",
    title: "Shipping Policy",
    items: [
      { id: 47, priority: "urgent", text: "Shipping cost clearly stated",                                          applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 48, priority: "urgent", text: "Delivery times specified",                                              applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 49, priority: "urgent", text: "GMC shipping settings match website policy",                            applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 50, priority: "urgent", text: "Shipping policy matches actual practice",                               applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 51, priority: "rec",    text: "Shipping carriers named",                                               applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 52, priority: "rec",    text: "Clear order tracking information",                                      applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 53, priority: "rec",    text: "Missing items handling explained",                                      applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 54, priority: "rec",    text: "Visible Track Order link",                                              applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 55, priority: "rec",    text: "Consistent brand voice in policies",                                    applies_to: ["ecommerce"],                             source: "crawl"      },
    ]
  },
  {
    id: "s8",
    title: "Misleading Content & Trust",
    items: [
      { id: 56, priority: "urgent", text: "No false Official/Certified claims",                                    applies_to: ["all"],                                   source: "crawl"      },
      { id: 57, priority: "urgent", text: "No fake trust badges or seals",                                         applies_to: ["all"],                                   source: "crawl"      },
      { id: 58, priority: "urgent", text: "No unauthorized use of ™/© symbols",                                   applies_to: ["all"],                                   source: "crawl"      },
      { id: 59, priority: "urgent", text: "No trademark infringement",                                             applies_to: ["all"],                                   source: "crawl"      },
      { id: 60, priority: "urgent", text: "No unsubstantiated medical/health claims",                              applies_to: ["all"],                                   source: "crawl"      },
      { id: 61, priority: "urgent", text: "No dangerous or prohibited products",                                   applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 62, priority: "rec",    text: "No exaggerated superlative claims (#1, best ever, etc.)",               applies_to: ["all"],                                   source: "crawl"      },
      { id: 63, priority: "rec",    text: "No unproven Award/As Seen In claims",                                   applies_to: ["all"],                                   source: "crawl"      },
    ]
  },
  {
    id: "s9",
    title: "Technical Health",
    items: [
      { id: 64, priority: "urgent", text: "No broken links (404 errors)",                                          applies_to: ["all"],                                   source: "crawl"      },
      { id: 65, priority: "urgent", text: "All apps and widgets function correctly",                               applies_to: ["all"],                                   source: "crawl"      },
      { id: 66, priority: "rec",    text: "Professional and trustworthy design",                                   applies_to: ["all"],                                   source: "crawl"      },
      { id: 67, priority: "rec",    text: "Content language matches target audience",                               applies_to: ["all"],                                   source: "crawl"      },
    ]
  },
  {
    id: "s10",
    title: "Google Merchant Center Settings",
    items: [
      { id: 68, priority: "urgent", text: "Custom domain (not myshopify.com)",                                     applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 69, priority: "urgent", text: "Domain claimed and verified in GMC",                                    applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 70, priority: "urgent", text: "Branded email address in GMC settings",                                 applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 71, priority: "urgent", text: "Real address and phone in GMC",                                         applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 72, priority: "urgent", text: "Customer Support section completed in GMC",                             applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 73, priority: "urgent", text: "Tax settings configured correctly",                                     applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 74, priority: "urgent", text: "No open disapprovals pending fix",                                      applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 75, priority: "rec",    text: "Both logos uploaded to GMC",                                            applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 76, priority: "rec",    text: "Brand colors configured in GMC",                                        applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 77, priority: "rec",    text: "Full consistency between GMC settings and website",                     applies_to: ["ecommerce"],                             source: "gmc"        },
    ]
  },
];

// ─── HELPERS ─────────────────────────────────────────────
export const allItems = CHECKLIST.flatMap(s => s.items);
export const urgentItems = allItems.filter(i => i.priority === "urgent");
export const recItems = allItems.filter(i => i.priority === "rec");

/** מחזיר רק את הסעיפים הרלוונטיים לפרופיל המשתמש */
export function getRelevantItems(profile: UserProfile): ChecklistItem[] {
  const bt = profile.business_type;
  const type: ProfileType = bt.startsWith("ecommerce")
    ? "ecommerce"
    : bt === "service_provider" || bt === "leads_only"
      ? bt
      : "all";
  return allItems.filter(item =>
    item.applies_to.includes("all") || item.applies_to.includes(type)
  );
}

/** Which data sources have non-empty, usable payloads for rule evaluation. */
export type AvailableDataSources = Record<DataSource, boolean>;

export function inferAvailableDataSources(
  crawl: WebsiteScanData,
  pagespeed: PageSpeedData,
  extras: {
    gmcJson?: string;
    adsJson?: string;
    shopifyJson?: string;
    gmbJson?: string;
  } = {}
): AvailableDataSources {
  const textLen = crawl.pages.reduce((n, p) => n + (p.text?.length ?? 0), 0);
  const crawlOk =
    textLen >= 40 ||
    (crawl.allLinksFound?.length ?? 0) > 0 ||
    Boolean(crawl.robotsTxt && crawl.robotsTxt.trim().length > 0);

  const psOk =
    typeof pagespeed.performance === "number" &&
    pagespeed.performance > 0 &&
    !String(pagespeed.ttfb).startsWith("Unavailable");

  const nonEmpty = (s?: string) =>
    Boolean(s && s.trim().length > 3 && s.trim() !== "{}" && s.trim() !== "null");

  const gmbJson = extras.gmbJson ?? "";
  const gmbApiConnected =
    nonEmpty(gmbJson) && !gmbJson.includes('"public_presence_only":true');

  return {
    crawl: crawlOk,
    pagespeed: psOk,
    gmc: nonEmpty(extras.gmcJson),
    gads: nonEmpty(extras.adsJson),
    shopify: nonEmpty(extras.shopifyJson),
    gmb: gmbApiConnected,
  };
}

/** Map automated fingerprint site class to checklist profile tags. */
export function mapFingerprintToProfileTypes(fingerprint: SiteFingerprint): ProfileType[] {
  const types: ProfileType[] = ["all"];
  switch (fingerprint.siteType) {
    case "ecommerce":
      types.push("ecommerce");
      break;
    case "service":
      types.push("service_provider");
      break;
    case "leads":
      types.push("leads_only");
      break;
    case "other":
    default:
      break;
  }
  return types;
}

/**
 * Rules we can actually evaluate: applies_to matches fingerprint site type AND source has data.
 */
export function getApplicableRules(
  fingerprint: SiteFingerprint,
  availableSources: AvailableDataSources
): ChecklistItem[] {
  const profileTypes = mapFingerprintToProfileTypes(fingerprint);

  const filtered = allItems.filter((item) => {
    if (!availableSources[item.source]) return false;
    const applies = item.applies_to.some((a) => profileTypes.includes(a));
    return applies;
  });

  if (filtered.length > 0) return filtered;

  // Fallback: at least evaluate "all" rules for sources we still have
  return allItems.filter(
    (item) => availableSources[item.source] && item.applies_to.includes("all")
  );
}

export function mapScanProfileToUserProfile(input: UserProfileInput): UserProfile {
  const bt = input.business_type;
  let business_type: BusinessType;
  if (bt === "ecommerce") {
    business_type = input.platform === "shopify" ? "ecommerce_shopify" : "ecommerce_other";
  } else if (bt === "service_provider") {
    business_type = "service_provider";
  } else if (bt === "leads_only") {
    business_type = "leads_only";
  } else {
    business_type = "other";
  }

  let blocked_where: BlockedWhere;
  switch (input.blocked_where) {
    case "proactive":
      blocked_where = "not_blocked";
      break;
    case "merchant_center":
      blocked_where = "merchant_center";
      break;
    case "google_ads":
      blocked_where = "google_ads";
      break;
    case "both":
      blocked_where = "both";
      break;
    default:
      blocked_where = "not_blocked";
  }

  return {
    business_type,
    platform: input.platform,
    blocked_where,
    has_gmb: input.has_gmb === true,
  };
}

export type AnalysisPromptOptions = {
  /** Override JSON for extended SiteFingerprint (default: derived from website scan) */
  businessIdentityJson?: string;
  /** If set, only these checklist rows are sent to the model */
  applicableItems?: ChecklistItem[];
  /** Appended after CLAUDE INSTRUCTIONS (e.g. FREE SCAN MODE) */
  extraUserNotes?: string;
  /** Pre-formatted OSINT block (from formatOsintBlock) */
  osintBlock?: string;
  /** Free is public-intel and recommendations; paid is full compliance diagnosis. */
  mode?: "free" | "paid";
};

function normalizeUrlLoose(u: string): string {
  try {
    return new URL(u).href.replace(/\/$/, "");
  } catch {
    return u.replace(/\/$/, "");
  }
}

function connectedPayloadBlock(title: string, raw: string): string {
  const t = raw?.trim() ?? "";
  if (!t || t === "{}" || t === "null") return `${title}\nNot connected`;
  return `${title}\n${t}`;
}

function formatPageSpeedLine(ps: PageSpeedData): string {
  const snapshotLabel =
    ps.source === "cached"
      ? "Cached snapshot"
      : ps.source === "unavailable"
      ? "Unavailable snapshot"
      : "Live snapshot";
  const strategyLabel = ps.strategy && ps.strategy !== "unknown" ? ` | Strategy: ${ps.strategy}` : "";
  const noteLabel = ps.note ? ` | Note: ${ps.note}` : "";
  return `Snapshot: ${snapshotLabel}${strategyLabel} | Performance: ${ps.performance} | LCP: ${ps.lcp} | CLS: ${ps.cls} | FID: ${ps.fid} | FCP: ${ps.fcp} | TTFB: ${ps.ttfb}${noteLabel}`;
}

function languageLabel(code: string | null): string {
  if (!code) return "unknown";
  const map: Record<string, string> = {
    he: "Hebrew",
    en: "English",
    ar: "Arabic",
    ru: "Russian",
    es: "Spanish",
    fr: "French",
    de: "German",
  };
  return map[code.toLowerCase()] ?? code;
}

function pageHeading(scan: WebsiteScanData, pageUrl: string, index: number): string {
  const home = normalizeUrlLoose(scan.url);
  const cur = normalizeUrlLoose(pageUrl);
  if (index === 0 || cur === home) return "Homepage";
  let path = "";
  try {
    path = new URL(pageUrl).pathname.toLowerCase();
  } catch {
    path = pageUrl.toLowerCase();
  }
  if (/contact|צור|קשר/.test(path)) return "Contact";
  if (/return|refund|החזר/.test(path)) return "Returns";
  if (/ship|משלוח/.test(path)) return "Shipping";
  if (/privacy|פרטיות/.test(path)) return "Privacy";
  if (/terms|policy|legal|תנאי|תקנון|מדיניות/.test(path)) return "Policy / Terms";
  if (/about|אודות|עלינו/.test(path)) return "About";
  if (/\/products?\//i.test(path) || /\/collections\//i.test(path)) return "Product / collection";
  return "Page";
}

const STRICT_AI_RULES = `
CRITICAL RULES (must follow):
- NEVER invent or assume data. Only report what appears in the payloads above.
- If you cannot find evidence for a rule → checklist_results for that rule_id must be "unknown", NOT "fail".
- Only use "fail" when there is DIRECT evidence in the data contradicting the rule.
- Reserve highest severity only for issues that can directly cause Google Merchant Center or Ads suspension.
- Do not treat minor styling or subjective design preferences as critical.
- If a data section is "Not connected", unavailable, or shows an API error → use "unknown" for ALL rules that depend solely on that source. Do NOT speculate about what that source might contain.
- NEVER fabricate problems from missing data. If you could not access GMC data, do NOT write that "the account may be suspended" or "product feed compliance cannot be verified" as critical issues. Simply mark those rules as "unknown".
- Only include items in critical_issues that have CONCRETE, VERIFIED evidence from the data. If you have no evidence, it is NOT a critical issue — at most it is a recommendation.

EVIDENCE QUALITY — EXAMPLES:

GOOD evidence (references exact data):
  "Contact page (https://example.co.il/contact) contains email info@example.co.il but NO phone number was found on any of the 6 scanned pages."
  "Privacy policy page was not found. None of the 8 scanned pages contain a URL with 'privacy' or 'פרטיות'. Internal links list also has no policy-related link."
  "Homepage text includes 'משלוח חינם' but no shipping policy page was found. Scanned URLs: /about, /contact, /terms — none is a shipping policy."
  "PageSpeed performance score is 42/100; LCP is 7.6s (threshold: 2.5s). This directly impacts user experience."
  "The footer on the homepage (https://example.com) shows email support@gmail.com — this is a free email provider, not a branded domain email."

BAD evidence (vague, speculative — DO NOT USE):
  "The website likely has contact issues."
  "Privacy policy may be missing or incomplete."
  "The site probably doesn't have proper shipping information."
  "Based on the general structure, the store appears to lack transparency."
  "Contact information could be improved."
  "GMC API returned 403 — the account may be suspended." ← NEVER speculate from API errors
  "Unable to verify product images — high risk for violations." ← Do NOT create issues from missing data

For EVERY critical_issues[].evidence field you write, you MUST include:
1. The EXACT quoted text or value from the data
2. The page URL where you found it (or "not found on any scanned page")
3. NO hedging words: never use "likely", "probably", "may", "might", "could", "appears to", "seems"
`.trim();

// ─── PROMPT BUILDER ──────────────────────────────────────
export function buildAnalysisPrompt(
  websiteUrl: string,
  userProfile: UserProfile,
  websiteScan: WebsiteScanData,
  pageSpeed: PageSpeedData,
  shopData: string,
  gmcData: string,
  adsData: string,
  gmbData: string,
  options?: AnalysisPromptOptions
): string {
  const isFreeMode = (options?.mode ?? "paid") === "free";
  const relevantItems =
    options?.applicableItems && options.applicableItems.length > 0
      ? options.applicableItems
      : getRelevantItems(userProfile);
  const relevantUrgent = relevantItems.filter((i) => i.priority === "urgent");
  const relevantRec = relevantItems.filter((i) => i.priority === "rec");

  const urgentList = relevantUrgent.map((i) => `[${i.id}] ${i.text}`).join("\n");
  const recList = relevantRec.map((i) => `[${i.id}] ${i.text}`).join("\n");

  const fullFp = toSiteFingerprint(websiteScan);
  const businessIdentityBlock =
    options?.businessIdentityJson?.trim() && options.businessIdentityJson.trim() !== "{}"
      ? options.businessIdentityJson.trim()
      : JSON.stringify(fullFp, null, 2);

  const extraNotes = options?.extraUserNotes?.trim()
    ? `\n\nADDITIONAL NOTES:\n${options.extraUserNotes.trim()}`
    : "";

  const fp = websiteScan.fingerprint;
  const profileLabel: Record<BusinessType, string> = {
    ecommerce_shopify: "E-commerce (Shopify)",
    ecommerce_other: "E-commerce (non-Shopify)",
    service_provider: "Service provider",
    leads_only: "Leads / ads only",
    other: "Other / general",
  };

  const blockedLabel: Record<BlockedWhere, string> = {
    merchant_center: "Blocked in Merchant Center",
    google_ads: "Blocked in Google Ads",
    both: "Blocked in Merchant Center and Google Ads",
    not_blocked: "Not blocked (proactive audit)",
  };

  const pageBlocks = websiteScan.pages
    .map((p, i) => {
      const h = pageHeading(websiteScan, p.url, i);
      const body = (p.text ?? "").trim() || "(empty or unreadable)";
      return `═══ PAGE: ${h} (${p.url}) ═══\n${body}`;
    })
    .join("\n\n");

  const linksSample = (websiteScan.allLinksFound ?? [])
    .slice(0, 120)
    .join("\n");
  const linksBlock =
    linksSample.length > 0
      ? `═══ DISCOVERED INTERNAL LINKS (first ${Math.min(120, websiteScan.allLinksFound.length)}, max 120) ═══\n${linksSample}`
      : "═══ DISCOVERED INTERNAL LINKS ═══\n(none)";

  const robotsBlock =
    websiteScan.robotsTxt && websiteScan.robotsTxt.trim().length > 0
      ? websiteScan.robotsTxt.trim()
      : "not found";

  const businessContext: Record<BusinessType, string> = {
    ecommerce_shopify: "This is an e-commerce store on Shopify. Focus on product quality, checkout trust, shipping/returns policies, and store legitimacy.",
    ecommerce_other: "This is an e-commerce store. Focus on product quality, checkout trust, shipping/returns policies, and store legitimacy.",
    service_provider: "This is a service provider website (law firm, consultant, agency, etc.). Do NOT check ecommerce rules like shipping/returns. Focus on professional credibility, contact details, service clarity, qualifications, and trust signals.",
    leads_only: "This is a landing page or lead generation site. Do NOT check ecommerce rules like shipping/returns/checkout. Focus on clarity of offer, CTA quality, trust signals, social proof, and avoiding misleading claims.",
    other: "This is a general website. Focus on overall trust, contact information, transparency, and basic compliance.",
  };

  const systemRole = isFreeMode
    ? "You are a website quality, trust, and public-intelligence analyst."
    : "You are a senior Google Merchant Center compliance consultant with 10+ years of experience recovering suspended merchant accounts. You write reports for business owners who need to understand exactly what went wrong and how to fix it to get their ads and shopping listings reinstated.";
  const mission = isFreeMode
    ? `You MUST analyze the public data below and return evidence-backed findings and practical recommendations only.\n\nBUSINESS CONTEXT: ${businessContext[userProfile.business_type]}`
    : `You MUST perform a comprehensive compliance audit against the ACTUAL DATA below. The business owner is ${userProfile.blocked_where === "not_blocked" ? "proactively checking for compliance risks" : "dealing with a Google suspension or policy violation"} and needs a professional, evidence-backed diagnosis they can act on immediately.\n\nBUSINESS CONTEXT: ${businessContext[userProfile.business_type]}`;
  const detectedLang = fp.language ?? null;
  const langName = languageLabel(detectedLang);
  const langInstruction = detectedLang && detectedLang !== "en"
    ? `- OUTPUT LANGUAGE: The website is in ${langName}. Write ALL user-facing text (headline, problem, evidence, fix, why, benefit, appeal_tip, title, issue descriptions) in ${langName}. Only keep JSON keys and enum values (pass/fail/warning/unknown, effort levels, risk_level) in English.`
    : `- OUTPUT LANGUAGE: Write all user-facing text in English.`;

  const instructionBlock = isFreeMode
    ? `CLAUDE INSTRUCTIONS:
${langInstruction}
- Focus on public-site quality, clarity, trust, and readiness improvements.
- Do NOT diagnose exact suspension causes in free mode.
- Do NOT claim a finding caused a Google suspension unless directly proven by connected account data.
- Use critical_issues as "top public findings" only.
- Use recommendations for the best improvements and quick wins.
- Quote the EXACT text or value from the data that proves the finding.
- Point to the EXACT page URL or section where it was found.
- Never say "likely", "probably", or speculate.
- checklist_results may ONLY include the rule IDs listed under "PUBLIC WEBSITE IMPROVEMENTS TO CHECK" below.`
    : `CLAUDE INSTRUCTIONS — PAID COMPLIANCE AUDIT:
${langInstruction}
- You are writing for a business owner, NOT a technical developer. Use clear language they can understand.
- For EVERY critical issue found: explain WHY this specific problem triggers a Google suspension or policy violation — not just that it violates a rule.
- Quote the EXACT text, value, or absence of data that proves the problem. Include the page URL.
- Never say "likely", "probably", or speculate — only report confirmed issues with quoted evidence.
- If data is missing for a rule → checklist_results must be "unknown", not "fail".
- Evaluate ONLY checklist rule IDs listed under "COMPLIANCE RULES TO CHECK" below.
- When multiple data sources are connected (website, GMC, Ads, Shopify) plus OSINT/public search signals: actively compare them and flag any mismatches in business name, address, phone, email, or product data. We do NOT use the Google Business Profile Management API; for Maps/Search visibility use the OSINT section and the website crawl only.
- IMPORTANT about OSINT data: If the OSINT section says "not found via Places API" — this DOES NOT mean the business is not on Google. The automated search has limited accuracy. Do NOT list "no Google Business Profile" as a critical issue unless you have strong independent evidence.
- IMPORTANT about GMC data: If the GMC section shows an error or "Not connected" — do NOT speculate about suspension reasons, account status, or product feed issues. Mark all GMC-dependent rules as "unknown" and recommend the user verify their GMC account directly.
- For appeal_tip: write a DETAILED, structured appeal strategy — not a single sentence. Include: (1) what the business owner should fix BEFORE submitting the appeal, (2) what to write in the appeal explanation, (3) what evidence/screenshots to attach, (4) what tone to use. Make it ready to copy-paste.
- risk_score: 0=perfect compliance, 100=almost certain suspension. Be accurate — do NOT inflate risk based on data you could not access.`;
  const rulesSection = isFreeMode
    ? `═══ PUBLIC WEBSITE IMPROVEMENTS TO CHECK ═══
${recList || "(none in applicable set)"}`
    : `═══ COMPLIANCE RULES TO CHECK (URGENT) ═══
${urgentList || "(none in applicable set)"}

═══ COMPLIANCE RULES TO CHECK (RECOMMENDED) ═══
${recList || "(none in applicable set)"}`;

  return `
${systemRole}
${mission}

${STRICT_AI_RULES}

${instructionBlock}

═══ WEBSITE SCAN DATA ═══
URL: ${websiteScan.url}
Platform (detected): ${websiteScan.platform ?? "unknown"} | SSL: ${websiteScan.hasSSL ? "Yes" : "No"} | Language: ${languageLabel(fp.language)} (${fp.language ?? "n/a"})
Response time (crawl): ${websiteScan.responseTimeMs} ms

User-declared profile:
- Business type: ${profileLabel[userProfile.business_type]}
- Platform: ${userProfile.platform}
- Block / appeal context: ${blockedLabel[userProfile.blocked_where]}
- User says they have a Google Business Profile (Maps): ${userProfile.has_gmb ? "declared yes" : "declared no / unknown"} (public presence is verified via OSINT + crawl, not GMB API)

Original input URL: ${websiteUrl}

═══ BUSINESS IDENTITY (structured fingerprint + site class) ═══
${businessIdentityBlock}

═══ BUSINESS IDENTITY (quick fields from crawl) ═══
Name: ${fp.businessName ?? "[none]"}
Email: ${fp.email ?? "[none]"}
Phone: ${fp.phone ?? "[none]"}
Address: ${fp.address ?? "[none]"}
Currency: ${fp.currency ?? "[none]"}
HTML lang: ${fp.language ?? "[none]"}

═══ ROBOTS.TXT ═══
${robotsBlock}

${pageBlocks ? `${pageBlocks}\n\n` : ""}${linksBlock}

═══ PAGESPEED DATA ═══
${formatPageSpeedLine(pageSpeed)}
Top opportunities: ${pageSpeed.opportunities?.join(" | ") || "n/a"}

${connectedPayloadBlock("═══ GOOGLE MERCHANT CENTER ═══", gmcData)}

${connectedPayloadBlock("═══ GOOGLE ADS ═══", adsData)}

${connectedPayloadBlock("═══ SHOPIFY DATA ═══", shopData)}

${connectedPayloadBlock("═══ PUBLIC GOOGLE PRESENCE (NO GMB API — use OSINT block below) ═══", gmbData)}

═══ OSINT / PUBLIC REPUTATION ═══
${options?.osintBlock?.trim() || "No OSINT data collected (API keys not configured or data unavailable)"}

═══ CONSISTENCY CHECK ═══
When multiple sources are connected, compare: business/brand name, physical address, phone, support email, hours (if present). For how the business appears on Google Search/Maps, use OSINT + crawl — there is no authenticated GMB API payload. List mismatches with exact values from each source.

${rulesSection}
${extraNotes}

Return JSON only — no markdown fences, no commentary. Use this EXACT shape (no extra keys):
{
  "risk_score": <0-100>,
  "risk_level": "CRITICAL|HIGH|MEDIUM|LOW",
  "headline": "<one sentence summarizing the most important finding>",
  "consistency_issues": [
    {
      "field": "<field name, e.g. business_name, phone, email, address>",
      "website": "<exact value from website/crawl>",
      "gmc": "<exact value from GMC or N/A>",
      "gmb": "<exact value from public OSINT/search or N/A>",
      "shopify": "<exact value from Shopify or N/A>",
      "status": "match|mismatch|unknown"
    }
  ],
  "critical_issues": [
    {
      "item_id": <checklist rule number>,
      "section": "<category>",
      "title": "<short title>",
      "problem": "<precise problem description — explain in plain language what is wrong AND why it matters for Google compliance>",
      "evidence": "<EXACT quote, value, or observation from the scan data — include page URL. If absent: state exactly what was missing and where it should be>",
      "fix": "<specific, actionable fix steps — be concrete, not generic>",
      "effort": "quick|medium|hard"
    }
  ],
  "recommendations": [
    {
      "item_id": <rule number>,
      "title": "<title>",
      "why": "<why it matters for compliance or trust>",
      "benefit": "<specific benefit>"
    }
  ],
  "checklist_results": {
    "<item_id>": "pass|fail|warning|unknown"
  },
  "appeal_tip": "<DETAILED appeal strategy — write 4-6 sentences minimum. Structure: (1) What to fix BEFORE submitting (specific items). (2) What to write in the appeal text (tone, key points to mention, what to admit vs. what to dispute). (3) What evidence/screenshots to attach. (4) Timeline expectations. This should be ready for the business owner to act on immediately.>"
}
`.trim();
}
