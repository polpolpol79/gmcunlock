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

export type BusinessType = "ecommerce_shopify" | "ecommerce_other" | "service_provider" | "leads_only";

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

// ─── הצ'ק-ליסט המלא ─────────────────────────────────────
export const CHECKLIST: ChecklistSection[] = [
  {
    id: "s1",
    title: "מבנה האתר ומותג",
    items: [
      { id: 1,  priority: "urgent", text: "מותג נוכח ובולט בדף הבית — לא רק גריד מוצרים",     applies_to: ["all"],                                   source: "crawl"      },
      { id: 2,  priority: "urgent", text: "URL ושם חנות לגיטימיים — לא ספאם/התחזות",           applies_to: ["all"],                                   source: "crawl"      },
      { id: 3,  priority: "urgent", text: "לוגו איכותי ולא מטושטש",                             applies_to: ["all"],                                   source: "crawl"      },
      { id: 4,  priority: "urgent", text: "ללא Popups פולשניים / סרטונים עם קול אוטומטי",      applies_to: ["all"],                                   source: "crawl"      },
      { id: 5,  priority: "rec",    text: "עמוד About Us גלוי",                                 applies_to: ["all"],                                   source: "crawl"      },
      { id: 6,  priority: "rec",    text: "ניווט כולל אודות + צור קשר",                         applies_to: ["all"],                                   source: "crawl"      },
      { id: 7,  priority: "rec",    text: "ציון מהירות >65 ב-PageSpeed",                        applies_to: ["all"],                                   source: "pagespeed"  },
    ]
  },
  {
    id: "s2",
    title: "פרטי קשר ושקיפות",
    items: [
      { id: 8,  priority: "urgent", text: "אימייל ממותג — לא gmail/yahoo",                      applies_to: ["all"],                                   source: "crawl"      },
      { id: 9,  priority: "urgent", text: "עמוד צור קשר עם אימייל + טלפון + כתובת",            applies_to: ["all"],                                   source: "crawl"      },
      { id: 10, priority: "urgent", text: "כתובת פיזית ברורה באתר",                             applies_to: ["all"],                                   source: "crawl"      },
      { id: 11, priority: "urgent", text: "מספר טלפון אמיתי ופעיל",                             applies_to: ["all"],                                   source: "crawl"      },
      { id: 12, priority: "urgent", text: "פוטר כולל אימייל + טלפון + כתובת",                  applies_to: ["all"],                                   source: "crawl"      },
      { id: 13, priority: "urgent", text: "פרטי קשר זהים באתר, GMC, Ads ו-GMB",                applies_to: ["all"],                                   source: "crawl"      },
      { id: 14, priority: "rec",    text: "טופס יצירת קשר",                                     applies_to: ["all"],                                   source: "crawl"      },
      { id: 15, priority: "rec",    text: "שעות פעילות וזמן מענה",                              applies_to: ["all"],                                   source: "crawl"      },
    ]
  },
  {
    id: "s3",
    title: "עמודי מדיניות",
    items: [
      { id: 16, priority: "urgent", text: "Privacy Policy תקין",                                applies_to: ["all"],                                   source: "crawl"      },
      { id: 17, priority: "urgent", text: "Terms ייחודי ללא אזכור מותגים אחרים",                applies_to: ["all"],                                   source: "crawl"      },
      { id: 18, priority: "urgent", text: "Returns & Refunds מפורט",                            applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 19, priority: "urgent", text: "Shipping Policy מפורט",                              applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 20, priority: "rec",    text: "לינקים למדיניות מדפי מוצר",                          applies_to: ["ecommerce"],                             source: "crawl"      },
    ]
  },
  {
    id: "s4",
    title: "קופה ותשלומים",
    items: [
      { id: 21, priority: "urgent", text: "Checkout מאובטח SSL",                                applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 22, priority: "urgent", text: "אייקוני תשלום תואמים בדיוק לקופה",                  applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 23, priority: "urgent", text: "אין חיובים נסתרים",                                  applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 24, priority: "urgent", text: "אין הנחות מוגזמות לא מוכחות",                        applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 25, priority: "urgent", text: "כל ההנחות עובדות בפועל",                             applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 26, priority: "rec",    text: "מספר אמצעי תשלום זמינים",                            applies_to: ["ecommerce"],                             source: "crawl"      },
    ]
  },
  {
    id: "s5",
    title: "דפי מוצר ותוכן",
    items: [
      { id: 27, priority: "urgent", text: "תיאורי מוצר מקוריים",                                applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 28, priority: "urgent", text: "תמונות מקוריות",                                     applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 29, priority: "urgent", text: "ללא תמונות Stock",                                   applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 30, priority: "urgent", text: "ללא טקסט על תמונות ל-GMC",                           applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 31, priority: "urgent", text: "ללא Collage כתמונה ראשית",                           applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 32, priority: "urgent", text: "מחיר וזמינות מדויקים",                               applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 33, priority: "urgent", text: "ללא Fake Urgency",                                   applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 34, priority: "urgent", text: "אין ביקורות מזויפות/מיובאות",                        applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 35, priority: "urgent", text: "ללא שגיאות כתיב",                                    applies_to: ["all"],                                   source: "crawl"      },
      { id: 36, priority: "rec",    text: "כותרות מוצר מותאמות Brand",                          applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 37, priority: "rec",    text: "ללא תמונות כפולות",                                  applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 38, priority: "rec",    text: "Features & Benefits ברורים",                         applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 39, priority: "rec",    text: "מיקס טקסט + תמונות",                                 applies_to: ["all"],                                   source: "crawl"      },
    ]
  },
  {
    id: "s6",
    title: "מדיניות החזרות",
    items: [
      { id: 40, priority: "urgent", text: "תקופת החזרה ברורה",                                  applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 41, priority: "urgent", text: "פירוט מקרים שונים להחזרה",                           applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 42, priority: "urgent", text: "התאמה מלאה בין GMC לאתר",                            applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 43, priority: "rec",    text: "תהליך בקשת החזר מוסבר",                              applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 44, priority: "rec",    text: "זמן קבלת החזר מצוין",                                applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 45, priority: "rec",    text: "אמצעי ההחזר מצוין",                                  applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 46, priority: "rec",    text: "שפה תואמת קהל יעד",                                  applies_to: ["ecommerce"],                             source: "crawl"      },
    ]
  },
  {
    id: "s7",
    title: "מדיניות משלוחים",
    items: [
      { id: 47, priority: "urgent", text: "עלות משלוח ברורה",                                   applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 48, priority: "urgent", text: "זמני אספקה מצוינים",                                 applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 49, priority: "urgent", text: "Shipping ב-GMC תואם לאתר",                           applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 50, priority: "urgent", text: "מדיניות תואמת בפועל",                                applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 51, priority: "rec",    text: "חברות שילוח מצוינות",                                applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 52, priority: "rec",    text: "מעקב הזמנה ברור",                                    applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 53, priority: "rec",    text: "טיפול בפריטים חסרים מוסבר",                          applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 54, priority: "rec",    text: "לינק Track Order גלוי",                              applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 55, priority: "rec",    text: "Brand Voice במדיניות",                               applies_to: ["ecommerce"],                             source: "crawl"      },
    ]
  },
  {
    id: "s8",
    title: "תוכן מטעה ואמינות",
    items: [
      { id: 56, priority: "urgent", text: "אין טענות Official/Certified לא אמיתיות",           applies_to: ["all"],                                   source: "crawl"      },
      { id: 57, priority: "urgent", text: "אין Trust Stamps מזויפים",                           applies_to: ["all"],                                   source: "crawl"      },
      { id: 58, priority: "urgent", text: "אין שימוש לא חוקי ב-™/©",                           applies_to: ["all"],                                   source: "crawl"      },
      { id: 59, priority: "urgent", text: "אין הפרת סימני מסחר",                                applies_to: ["all"],                                   source: "crawl"      },
      { id: 60, priority: "urgent", text: "אין טענות רפואיות ללא הוכחה",                        applies_to: ["all"],                                   source: "crawl"      },
      { id: 61, priority: "urgent", text: "אין מוצרים מסוכנים",                                 applies_to: ["ecommerce"],                             source: "crawl"      },
      { id: 62, priority: "rec",    text: "אין טענות מוגזמות (#1 וכו')",                        applies_to: ["all"],                                   source: "crawl"      },
      { id: 63, priority: "rec",    text: "אין Award/As seen ללא הוכחה",                        applies_to: ["all"],                                   source: "crawl"      },
    ]
  },
  {
    id: "s9",
    title: "תקינות טכנית",
    items: [
      { id: 64, priority: "urgent", text: "אין קישורים שבורים 404",                             applies_to: ["all"],                                   source: "crawl"      },
      { id: 65, priority: "urgent", text: "אפליקציות פועלות תקין",                              applies_to: ["all"],                                   source: "crawl"      },
      { id: 66, priority: "rec",    text: "עיצוב מקצועי ואמין",                                 applies_to: ["all"],                                   source: "crawl"      },
      { id: 67, priority: "rec",    text: "שפה תואמת קהל יעד",                                  applies_to: ["all"],                                   source: "crawl"      },
    ]
  },
  {
    id: "s10",
    title: "הגדרות Google Merchant Center",
    items: [
      { id: 68, priority: "urgent", text: "דומיין מותאם אישית (לא myshopify)",                 applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 69, priority: "urgent", text: "Domain Claimed & Verified",                          applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 70, priority: "urgent", text: "אימייל ממותג ב-GMC",                                 applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 71, priority: "urgent", text: "כתובת + טלפון אמיתיים ב-GMC",                       applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 72, priority: "urgent", text: "Customer Support Section הושלם",                     applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 73, priority: "urgent", text: "הגדרות Tax נכונות",                                  applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 74, priority: "urgent", text: "אין Disapprovals פתוחים לתיקון",                     applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 75, priority: "rec",    text: "שני לוגואים הועלו",                                  applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 76, priority: "rec",    text: "צבעי מותג הוגדרו",                                   applies_to: ["ecommerce"],                             source: "gmc"        },
      { id: 77, priority: "rec",    text: "התאמה מלאה בין GMC לאתר",                            applies_to: ["ecommerce"],                             source: "gmc"        },
    ]
  },
];

// ─── HELPERS ─────────────────────────────────────────────
export const allItems = CHECKLIST.flatMap(s => s.items);
export const urgentItems = allItems.filter(i => i.priority === "urgent");
export const recItems = allItems.filter(i => i.priority === "rec");

/** מחזיר רק את הסעיפים הרלוונטיים לפרופיל המשתמש */
export function getRelevantItems(profile: UserProfile): ChecklistItem[] {
  const type = profile.business_type.startsWith("ecommerce") ? "ecommerce" : profile.business_type;
  return allItems.filter(item =>
    item.applies_to.includes("all") || item.applies_to.includes(type as ProfileType)
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

  return {
    crawl: crawlOk,
    pagespeed: psOk,
    gmc: nonEmpty(extras.gmcJson),
    gads: nonEmpty(extras.adsJson),
    shopify: nonEmpty(extras.shopifyJson),
    gmb: nonEmpty(extras.gmbJson),
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
    business_type = "ecommerce_other";
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
  return `Performance: ${ps.performance} | LCP: ${ps.lcp} | CLS: ${ps.cls} | FID: ${ps.fid} | FCP: ${ps.fcp} | TTFB: ${ps.ttfb}`;
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
- If a data section is "Not connected" or unavailable → use "unknown" for rules that depend solely on that source; do not fail those rules from missing data.

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

  const systemRole = isFreeMode
    ? "You are a website quality, trust, and public-intelligence analyst."
    : "You are a Google Merchant Center and Google Ads compliance expert.";
  const mission = isFreeMode
    ? "You MUST analyze the public data below and return evidence-backed findings and practical recommendations only."
    : "You MUST check every applicable rule against the ACTUAL DATA below.";
  const instructionBlock = isFreeMode
    ? `CLAUDE INSTRUCTIONS:
- Focus on public-site quality, clarity, trust, and readiness improvements.
- Do NOT diagnose exact suspension causes in free mode.
- Do NOT claim a finding caused a Google suspension unless directly proven by connected account data.
- Use critical_issues as "top public findings" only.
- Use recommendations for the best improvements and quick wins.
- Quote the EXACT text or value from the data that proves the finding.
- Point to the EXACT page URL or section where it was found.
- Never say "likely", "probably", or speculate.
- checklist_results may ONLY include the rule IDs listed under "PUBLIC WEBSITE IMPROVEMENTS TO CHECK" below.`
    : `CLAUDE INSTRUCTIONS:
- For each issue found: quote the EXACT text or value from the data that proves the problem.
- Point to the EXACT page URL or section where it was found.
- Never say "likely", "probably", or speculate — only report confirmed issues with quoted evidence.
- If data is missing for a rule → checklist_results must be "unknown" for that rule, not "fail".
- Evaluate ONLY checklist rule IDs listed under "COMPLIANCE RULES TO CHECK" below. Do not add other IDs to checklist_results.
- Compare business identity fields across all connected sources when data is present (website text, GMC, Ads, GMB, Shopify).`;
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
- Google Business Profile: ${userProfile.has_gmb ? "declared yes" : "declared no / unknown"}

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

${connectedPayloadBlock("═══ GOOGLE BUSINESS PROFILE ═══", gmbData)}

═══ OSINT / PUBLIC REPUTATION ═══
${options?.osintBlock?.trim() || "No OSINT data collected (API keys not configured or data unavailable)"}

═══ CONSISTENCY CHECK ═══
When multiple sources are connected, compare: business/brand name, physical address, phone, support email, hours (if present). List mismatches with exact values from each source.

${rulesSection}
${extraNotes}

Return JSON only — no markdown fences, no commentary. Use this shape:
{
  "risk_score": <0-100>,
  "risk_level": "CRITICAL|HIGH|MEDIUM|LOW",
  "headline": "<one sentence>",
  "profile_detected": "<profile type you infer from data>",
  "consistency_issues": [
    {
      "field": "<field name>",
      "site_value": "<value from website/crawl>",
      "gmc_value": "<value from GMC or N/A>",
      "gmb_value": "<value from GMB or N/A>",
      "shopify_value": "<value from Shopify or N/A>",
      "ads_value": "<value from Google Ads or N/A>",
      "issue": "<description>"
    }
  ],
  "critical_issues": [
    {
      "item_id": <checklist rule number>,
      "section": "<category>",
      "title": "<short title>",
      "problem": "<precise problem>",
      "evidence": "<exact quote from the data above + page URL>",
      "fix": "<specific fix>",
      "effort": "quick|medium|hard"
    }
  ],
  "urgent_fixes": [
    {
      "order": <1-10>,
      "title": "<title>",
      "action": "<steps>",
      "time_estimate": "<estimate>"
    }
  ],
  "recommendations": [
    {
      "item_id": <rule number>,
      "title": "<title>",
      "why": "<why it matters>",
      "benefit": "<benefit>"
    }
  ],
  "checklist_results": {
    "<item_id>": "pass|fail|warning|unknown"
  },
  "appeal_tip": "<tip>",
  "resolution_time": "<estimated time to resolve>"
}
`.trim();
}
