// ============================================================
// lib/gmc-checklist.ts
// קובץ החוקים הרשמי של GMC Analyzer
// 77 סעיפים — הלב של המוצר
// גרסה 2.0 — תמיכה בפרופילים + עקביות בין מקורות
// ============================================================

import type { CrawlResult, SiteFingerprint } from "@/lib/crawler";
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
  crawl: CrawlResult,
  pagespeed: PageSpeedData,
  extras: {
    gmcJson?: string;
    adsJson?: string;
    shopifyJson?: string;
    gmbJson?: string;
  } = {}
): AvailableDataSources {
  const crawlOk =
    (crawl.allText?.length ?? 0) >= 40 ||
    (crawl.pageTitle?.trim().length ?? 0) > 0 ||
    (crawl.metaTitle?.trim().length ?? 0) > 0;

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
  crawlData: CrawlResult,
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
  /** JSON string of SiteFingerprint */
  businessIdentityJson?: string;
  /** If set, only these checklist rows are sent to the model */
  applicableItems?: ChecklistItem[];
  /** Appended after strict rules (e.g. FREE SCAN MODE) */
  extraUserNotes?: string;
};

const STRICT_AI_RULES = `
CRITICAL RULES (must follow):
- NEVER invent or assume data. Only report what appears in the provided payloads.
- If you cannot find evidence for a rule → checklist_results for that rule_id must be "unknown", NOT "fail".
- Only use "fail" when there is DIRECT evidence in the data contradicting the rule.
- Reserve "critical" severity / highest risk only for issues that can directly cause Google Merchant Center or Ads suspension.
- Do not treat minor styling or subjective design preferences as critical.
- In every critical_issues[].evidence field, quote or paste the exact snippet/value from the data. Do not use "likely", "probably", or speculation.
- If a data section is empty or says "not connected" / unavailable → skip checklist evaluation for all rules whose source depends on that channel; output "unknown" for those rule IDs only if they were still listed — prefer omitting those IDs from checklist_results if they were not in the applicable list.
`.trim();

// ─── PROMPT BUILDER ──────────────────────────────────────
export function buildAnalysisPrompt(
  websiteUrl: string,
  userProfile: UserProfile,
  crawlData: string,
  pageSpeedData: string,
  shopData: string,
  gmcData: string,
  adsData: string,
  gmbData: string,
  options?: AnalysisPromptOptions
): string {

  const relevantItems =
    options?.applicableItems && options.applicableItems.length > 0
      ? options.applicableItems
      : getRelevantItems(userProfile);
  const relevantUrgent = relevantItems.filter(i => i.priority === "urgent");
  const relevantRec    = relevantItems.filter(i => i.priority === "rec");

  const urgentList = relevantUrgent.map(i => `[${i.id}] ${i.text}`).join("\n");
  const recList    = relevantRec.map(i => `[${i.id}] ${i.text}`).join("\n");

  const businessIdentityBlock =
    options?.businessIdentityJson?.trim() && options.businessIdentityJson.trim() !== "{}"
      ? options.businessIdentityJson
      : "Not available (no fingerprint extracted).";

  const extraNotes = options?.extraUserNotes?.trim() ? `\n\n${options.extraUserNotes.trim()}` : "";

  const profileLabel: Record<BusinessType, string> = {
    ecommerce_shopify: "חנות איקומרס על Shopify",
    ecommerce_other:   "חנות איקומרס (לא Shopify)",
    service_provider:  "נותן שירות",
    leads_only:        "פרסום לידים בלבד",
  };

  const blockedLabel: Record<BlockedWhere, string> = {
    merchant_center: "חסום ב-Merchant Center בלבד",
    google_ads:      "חסום ב-Google Ads בלבד",
    both:            "חסום גם ב-Merchant Center וגם ב-Google Ads",
    not_blocked:     "לא חסום — בדיקה מניעתית",
  };

  return `
אתה מומחה ל-Google Merchant Center ו-Google Ads Compliance עם ניסיון של 10 שנים.
קיבלת נתונים מלאים על עסק. עבור על הסעיפים הרלוונטיים ובדוק כל אחד לפי הנתונים.

${STRICT_AI_RULES}

═══ BUSINESS IDENTITY (automated fingerprint — ground truth for what was scanned) ═══
${businessIdentityBlock}

═══ פרופיל המשתמש ═══
סוג עסק: ${profileLabel[userProfile.business_type]}
פלטפורמה: ${userProfile.platform}
מצב חסימה: ${blockedLabel[userProfile.blocked_where]}
Google Business Profile: ${userProfile.has_gmb ? "קיים" : "לא קיים / לא ידוע"}

═══ כתובת האתר ═══
${websiteUrl}

═══ נתוני Crawl (סריקת האתר) ═══
${crawlData || "לא בוצע crawl"}

═══ נתוני PageSpeed ═══
${pageSpeedData || "לא זמין"}

═══ נתוני Shopify ═══
${shopData || "לא מחובר"}

═══ נתוני Google Merchant Center ═══
${gmcData || "לא מחובר"}

═══ נתוני Google Ads ═══
${adsData || "לא מחובר"}

═══ נתוני Google Business Profile ═══
${gmbData || "לא מחובר"}

═══ בדיקת עקביות בין מקורות ═══
השווה את השדות הבאים בין כל המקורות הזמינים (אתר, GMC, Ads, GMB, Shopify):
- שם העסק / המותג
- כתובת פיזית
- מספר טלפון
- אימייל תמיכה
- שעות פעילות (אם רלוונטי)
לכל אי-התאמה — ציין את הערך בכל מקור.

═══ סעיפים URGENT — גורמים ישירים לחסימה (רשימה מסוננת לפי מקורות זמינים + סוג אתר) ═══
${urgentList || "(none in applicable set)"}

═══ סעיפים המלצה — שיפור ומניעה עתידית ═══
${recList || "(none in applicable set)"}

הוראות:
- בדוק **רק** את מזהי הסעיפים שהופיעו למעלה (רשימת applicable). אל תוסיף מזהים אחרים ל-checklist_results.
- בדוק רק סעיפים שרלוונטיים לפרופיל המשתמש (כבר סוננו עבורך)
- אם מקור נתונים חסר — ציין "לא ניתן לבדוק" ואל תנחש
- חפש את 2-3 הבעיות הראשיות שגרמו לחסימה
- כתוב בשפה פשוטה שמשתמש לא טכני יבין
- לכל בעיה — ציין ראיה מדויקת מהנתונים
- אל תמציא נתונים שאינם בחומר
${extraNotes}

החזר JSON בלבד, ללא backticks, ללא טקסט נוסף:
{
  "risk_score": <0-100>,
  "risk_level": "CRITICAL|HIGH|MEDIUM|LOW",
  "headline": "<משפט אחד: הסיבה העיקרית לחסימה>",
  "profile_detected": "<סוג הפרופיל שזוהה>",
  "consistency_issues": [
    {
      "field": "<שם השדה>",
      "site_value": "<ערך באתר>",
      "gmc_value": "<ערך ב-GMC>",
      "gmb_value": "<ערך ב-GMB>",
      "shopify_value": "<ערך ב-Shopify>",
      "ads_value": "<ערך ב-Google Ads>",
      "issue": "<תיאור אי-ההתאמה>"
    }
  ],
  "critical_issues": [
    {
      "item_id": <מספר הסעיף>,
      "section": "<שם הקטגוריה>",
      "title": "<כותרת קצרה>",
      "problem": "<מה הבעיה המדויקת>",
      "evidence": "<איפה בדיוק מצאת את זה בנתונים>",
      "fix": "<פעולה ספציפית לתיקון>",
      "effort": "quick|medium|hard"
    }
  ],
  "urgent_fixes": [
    {
      "order": <1-10>,
      "title": "<כותרת>",
      "action": "<מה לעשות בדיוק, step by step>",
      "time_estimate": "<כמה זמן>"
    }
  ],
  "recommendations": [
    {
      "item_id": <מספר הסעיף>,
      "title": "<כותרת>",
      "why": "<למה זה חשוב>",
      "benefit": "<מה הרווח>"
    }
  ],
  "checklist_results": {
    "<item_id>": "pass|fail|warning|unknown"
  },
  "appeal_tip": "<טיפ ספציפי לכתיבת ערעור מוצלח>",
  "resolution_time": "<זמן משוער לפתרון>"
}
`.trim();
}
