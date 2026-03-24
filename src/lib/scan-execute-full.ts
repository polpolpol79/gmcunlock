import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getAppUserIdFromRequest } from "@/lib/app-session";
import { pageSpeedUnavailable, getPageSpeedData, type PageSpeedData } from "@/lib/pagespeed";
import {
  crawlWebsite,
  emptyCrawlResult,
  toSiteFingerprint,
  type CrawlResult,
} from "@/lib/crawler";
import {
  buildAnalysisPrompt,
  getApplicableRules,
  inferAvailableDataSources,
  mapScanProfileToUserProfile,
  type ChecklistItem,
} from "@/lib/gmc-checklist";
import {
  completeScanResult,
  failScanResult,
  getScanResultById,
  persistScanIntermediateState,
  updateScanProgress,
} from "@/lib/scan-store";
import { SCAN_PHASES, phaseDetailFor } from "@/lib/scan-progress-phases";
import {
  fetchAllGoogleConnectedDataForUser,
} from "@/lib/google";
import { fetchShopifyConnectedDataForUser } from "@/lib/shopify";
import { gatherOsint, formatOsintBlock } from "@/lib/osint";
import { tryParseJsonFromClaudeText } from "@/lib/claude-json-extract";
import {
  ClaudeAnalysisSchema,
  type ClaudeAnalysisOutput,
  type UserProfileInput,
} from "@/lib/scan-schemas";

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-5";
const FALLBACK_CLAUDE_MODEL = "claude-3-5-sonnet-20241022";
const LAST_RESORT_CLAUDE_MODEL = "claude-3-5-haiku-20241022";

type ClaudeIssue = ClaudeAnalysisOutput["critical_issues"][number];
type ClaudeRecommendation = ClaudeAnalysisOutput["recommendations"][number];
type ClaudeConsistencyIssue = ClaudeAnalysisOutput["consistency_issues"][number];
type ChecklistResultValue = ClaudeAnalysisOutput["checklist_results"][string];

export type ClaudeAnalysisResult = ClaudeAnalysisOutput;

export type FullPipelineResult =
  | {
      kind: "success";
      googleConnected: boolean;
      pageSpeedData: PageSpeedData;
      crawlData: CrawlResult;
      analysis: ClaudeAnalysisResult;
    }
  | { kind: "fatal"; status: number; json: Record<string, unknown> }
  | { kind: "job_failed" }
  /** Crawl/data collection finished; Claude runs in a second serverless invocation (see /api/scan/full/analyze). */
  | { kind: "deferred" };

// ─── Normalizers ─────────────────────────────────────────

function normalizeRiskLevel(value: unknown): ClaudeAnalysisResult["risk_level"] {
  if (typeof value !== "string") return "MEDIUM";
  const upper = value.toUpperCase();
  if (upper === "CRITICAL" || upper === "HIGH" || upper === "MEDIUM" || upper === "LOW") {
    return upper;
  }
  return "MEDIUM";
}

function normalizeEffort(value: unknown): ClaudeIssue["effort"] {
  if (typeof value !== "string") return "medium";
  const lower = value.toLowerCase();
  if (lower === "quick" || lower === "medium" || lower === "hard") return lower;
  return "medium";
}

function normalizeChecklistValue(value: unknown): ChecklistResultValue {
  if (typeof value !== "string") return "unknown";
  const lower = value.toLowerCase();
  if (lower === "pass" || lower === "fail" || lower === "warning" || lower === "unknown") {
    return lower;
  }
  return "unknown";
}

function normalizeConsistencyStatus(value: unknown): ClaudeConsistencyIssue["status"] {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "match" || lower === "mismatch" || lower === "unknown") return lower;
  }
  return "unknown";
}

function normalizeConsistencyIssue(issue: unknown): ClaudeConsistencyIssue {
  const row = issue && typeof issue === "object" ? (issue as Record<string, unknown>) : {};
  return {
    field:
      typeof row.field === "string"
        ? row.field
        : typeof row.issue === "string"
        ? row.issue
        : "Unknown field",
    website:
      typeof row.website === "string"
        ? row.website
        : typeof row.site_value === "string"
        ? row.site_value
        : "N/A",
    gmc:
      typeof row.gmc === "string"
        ? row.gmc
        : typeof row.gmc_value === "string"
        ? row.gmc_value
        : "N/A",
    gmb:
      typeof row.gmb === "string"
        ? row.gmb
        : typeof row.gmb_value === "string"
        ? row.gmb_value
        : "N/A",
    shopify:
      typeof row.shopify === "string"
        ? row.shopify
        : typeof row.shopify_value === "string"
        ? row.shopify_value
        : "N/A",
    status: normalizeConsistencyStatus(row.status),
  };
}

const SPECULATIVE_RE =
  /\b(likely|probably|may\s|might\s|could\s|appears?\s+to|seems?\s+to|possibly|presumably|it\s+is\s+possible)\b/i;

function sanitizeEvidence(evidence: string): string {
  if (!SPECULATIVE_RE.test(evidence)) return evidence;
  return evidence.replace(SPECULATIVE_RE, "[note: unconfirmed]") +
    " [warning: speculative language detected — verify manually]";
}

function normalizeCriticalIssue(issue: unknown, index: number): ClaudeIssue {
  const row = issue && typeof issue === "object" ? (issue as Record<string, unknown>) : {};
  const rawEvidence = typeof row.evidence === "string" ? row.evidence : "No evidence provided";
  return {
    item_id:
      typeof row.item_id === "number" && Number.isFinite(row.item_id)
        ? row.item_id
        : index + 1,
    section: typeof row.section === "string" ? row.section : "General",
    title: typeof row.title === "string" ? row.title : "Critical issue",
    problem: typeof row.problem === "string" ? row.problem : "No details provided",
    evidence: sanitizeEvidence(rawEvidence),
    fix: typeof row.fix === "string" ? row.fix : "Investigate and align policy signals",
    effort: normalizeEffort(row.effort),
  };
}

function normalizeRecommendation(item: unknown, index: number): ClaudeRecommendation {
  const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    item_id:
      typeof row.item_id === "number" && Number.isFinite(row.item_id)
        ? row.item_id
        : index + 1,
    title: typeof row.title === "string" ? row.title : "Recommendation",
    why: typeof row.why === "string" ? row.why : "No explanation provided",
    benefit:
      typeof row.benefit === "string"
        ? row.benefit
        : typeof row.action === "string"
        ? row.action
        : "Improves compliance confidence",
  };
}

// ─── Claude response parsing ─────────────────────────────

function extractClaudeText(content: Anthropic.Messages.Message["content"]): string {
  const blocks = content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text");
  return blocks.map((b) => b.text).join("\n").trim();
}

export function parseClaudeJson(raw: string): ClaudeAnalysisResult {
  const parsed = tryParseJsonFromClaudeText(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Claude returned non-JSON response");
  }

  const obj = parsed as Record<string, unknown>;
  const checklistResultsInput =
    obj.checklist_results && typeof obj.checklist_results === "object"
      ? (obj.checklist_results as Record<string, unknown>)
      : {};

  const normalizedCandidate: ClaudeAnalysisResult = {
    risk_score: typeof obj.risk_score === "number" ? obj.risk_score : 0,
    risk_level: normalizeRiskLevel(obj.risk_level),
    headline: typeof obj.headline === "string" ? obj.headline : "Analysis completed.",
    critical_issues: Array.isArray(obj.critical_issues)
      ? obj.critical_issues.map((item, index) => normalizeCriticalIssue(item, index))
      : [],
    recommendations: Array.isArray(obj.recommendations)
      ? obj.recommendations.map((item, index) => normalizeRecommendation(item, index))
      : [],
    consistency_issues: Array.isArray(obj.consistency_issues)
      ? obj.consistency_issues.map((item) => normalizeConsistencyIssue(item))
      : [],
    checklist_results: Object.fromEntries(
      Object.entries(checklistResultsInput).map(([key, value]) => [
        key,
        normalizeChecklistValue(value),
      ])
    ) as Record<string, ChecklistResultValue>,
    appeal_tip:
      typeof obj.appeal_tip === "string"
        ? obj.appeal_tip
        : "Keep the appeal factual and specific.",
  };

  return ClaudeAnalysisSchema.parse(normalizedCandidate);
}

// ─── Error helpers ───────────────────────────────────────

export function isTlsOrNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { message?: string; code?: string };
  const message = (maybe.message ?? "").toLowerCase();
  const code = (maybe.code ?? "").toUpperCase();
  return (
    message.includes("unable to get local issuer certificate") ||
    message.includes("self signed certificate") ||
    message.includes("certificate") ||
    message.includes("network") ||
    code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT"
  );
}

function buildFallbackAnalysis(params: {
  url: string;
  profile: UserProfileInput;
  pagespeed: PageSpeedData;
  crawl: CrawlResult;
  reason: string;
  googleConnected?: boolean;
}): ClaudeAnalysisResult {
  const issues: ClaudeIssue[] = [];
  const recommendations: ClaudeRecommendation[] = [];
  const fp = params.crawl.fingerprint;
  const pagesScanned = params.crawl.pages.length;
  const email = fp.email?.trim() ?? "";
  const hasEmail = email.length > 0;
  const FREE_EMAIL_RE = /@(gmail|yahoo|hotmail|outlook|aol|live|icloud)\./i;
  const emailIsBranded = hasEmail && !FREE_EMAIL_RE.test(email);
  const bundle =
    params.crawl.pages.map((p) => `${p.url}\n${p.text}`).join("\n") +
    params.crawl.allLinksFound.join(" ");
  const scannedUrlsList = params.crawl.pages.map((p) => p.url).join(", ") || "none";

  const isEcommerce = !params.profile?.business_type || params.profile.business_type.startsWith("ecommerce");
  const hasPrivacyPolicy = /privacy|פרטיות|מדיניות.{0,5}פרטיות/i.test(bundle);
  const hasTerms = /terms|conditions|תנאי|תקנון|מדיניות/i.test(bundle);
  const hasReturns = /return|refund|החזר|החזרות/i.test(bundle);
  const hasShipping = /shipping|delivery|משלוח|הובלה/i.test(bundle);
  const hasContactPage = /contact|צור.{0,3}קשר/i.test(bundle);
  const hasTranslationLeak = /translation missing:/i.test(bundle);

  const isHe = fp.language === "he";
  const t = {
    ssl_title: isHe ? "האתר לא משתמש ב-HTTPS" : "Website is not using HTTPS",
    ssl_problem: isHe ? "כתובת האתר לא מאובטחת ב-SSL/HTTPS." : "The website URL does not enforce SSL/HTTPS.",
    ssl_fix: isHe ? "הפעל תעודת SSL ואלץ הפניה ל-HTTPS בכל הדפים." : "Enable SSL certificate and force HTTPS redirect on all pages.",
    ssl_rec: isHe ? "הפעל HTTPS בכל האתר" : "Enable HTTPS across the whole site",
    ssl_why: isHe ? "אתר מאובטח הוא סימן אמון בסיסי למשתמשים ולמערכות סקירה." : "A secure site is a basic trust signal for users and ad review systems.",
    ssl_benefit: isHe ? "משפר אמון, ביטחון בקנייה ומוכנות טכנית." : "Improves trust, conversion confidence, and technical readiness.",
    no_email_title: isHe ? "לא נמצאה כתובת מייל באתר" : "No email address found on the website",
    no_email_problem: isHe ? "לא זוהתה כתובת מייל באף דף שנסרק." : "No email address was detected on any scanned page.",
    no_email_fix: isHe ? "הוסף כתובת מייל ממותגת (כמו info@yourdomain.com) לפוטר ולדף יצירת קשר." : "Add a branded email address (e.g. info@yourdomain.com) to the footer and contact page.",
    no_email_rec: isHe ? "הוסף כתובת מייל ממותגת גלויה" : "Add a visible branded email address",
    no_email_why: isHe ? "מבקרים וסוקרים מצפים לערוץ תמיכה ברור באתר." : "Visitors and reviewers expect a clear support channel on the site.",
    no_email_benefit: isHe ? "משפר שקיפות וגורם לעסק להיראות מבוסס יותר." : "Improves transparency and makes the business look more established.",
    free_email_title: isHe ? "מייל חינמי במקום ממותג" : "Email is from a free provider, not branded",
    free_email_problem: isHe ? "המייל שנמצא משתמש בספק חינמי במקום דומיין העסק." : "The email found uses a free provider instead of the business domain.",
    free_email_fix: isHe ? "השתמש בכתובת מייל ממותגת (info@yourdomain.com) במקום ספק חינמי." : "Use a branded email address (info@yourdomain.com) instead of a free provider.",
    no_privacy_title: isHe ? "לא נמצא דף מדיניות פרטיות" : "No privacy policy page found",
    no_privacy_problem: isHe ? "לא זוהה דף מדיניות פרטיות בין הדפים שנסרקו." : "No privacy policy page was detected among scanned pages.",
    no_privacy_fix: isHe ? "צור דף מדיניות פרטיות וקשר אליו מתפריט הפוטר." : "Create a privacy policy page and link to it from the footer navigation.",
    no_privacy_rec: isHe ? "פרסם מדיניות פרטיות בפוטר" : "Publish a privacy policy in the footer",
    no_privacy_why: isHe ? "שקיפות בפרטיות היא סימן אמון סטנדרטי לאתרי מסחר." : "Privacy transparency is a standard trust signal for ecommerce sites.",
    no_privacy_benefit: isHe ? "מפחית חיכוך למבקרים ומשפר אמינות כללית." : "Reduces friction for visitors and improves overall site credibility.",
    no_returns_title: isHe ? "לא נמצאה מדיניות החזרות/החזרים" : "No returns/refund policy found",
    no_returns_problem: isHe ? "לא נמצאה מדיניות החזרות או החזרים באתר." : "No returns or refund policy was found on the website.",
    no_returns_fix: isHe ? "הוסף דף מדיניות החזרות ברור עם תקופת החזרה, תנאים ותהליך." : "Add a clear returns & refund policy page with return period, conditions, and process.",
    no_shipping_title: isHe ? "לא נמצאה מדיניות משלוחים" : "No shipping policy found",
    no_shipping_problem: isHe ? "לא נמצאה מדיניות משלוחים באתר." : "No shipping/delivery policy was found on the website.",
    no_shipping_fix: isHe ? "הוסף דף מדיניות משלוחים עם זמני אספקה, עלויות ומידע על חברת שילוח." : "Add a shipping policy page with delivery times, costs, and carrier information.",
    no_phone_title: isHe ? "לא נמצא מספר טלפון או דף יצירת קשר" : "No phone number or contact page found",
    no_phone_problem: isHe ? "לא נמצאו מספר טלפון ודף יצירת קשר." : "No phone number and no contact page were found.",
    no_phone_fix: isHe ? "הוסף דף יצירת קשר עם מספר טלפון, מייל וכתובת פיזית." : "Add a contact page with phone number, email, and physical address.",
    no_phone_rec: isHe ? "הוסף דף יצירת קשר מלא" : "Add a complete contact page",
    no_phone_why: isHe ? "דף קשר גלוי גורם לעסק להיראות אמיתי ונגיש." : "A visible contact page makes the business look real and reachable.",
    no_phone_benefit: isHe ? "משפר אמון ועוזר למשתמשים לפעול בביטחון." : "Improves trust and helps users take the next step confidently.",
    no_address_rec: isHe ? "הוסף כתובת עסקית או כתובת להחזרות" : "Add a visible business or returns address",
    no_address_why: isHe ? "כתובת ציבורית מחזקת אמון ועוזרת ללקוחות להבין מי מאחורי האתר." : "A public address strengthens trust and helps customers understand who is behind the site.",
    no_address_benefit: isHe ? "משפר שקיפות ומפחית חיכוך סביב תמיכה, החזרות ולגיטימיות." : "Improves transparency and reduces friction around support, returns, and legitimacy.",
    translation_title: isHe ? "טקסט תרגום חסר מופיע באתר" : "Visible untranslated placeholder text appears on the site",
    translation_problem: isHe ? "מבקרים רואים טקסט placeholder גולמי במקום ממשק מלוטש." : "Visitors can see raw translation placeholder text instead of polished UI copy.",
    translation_fix: isHe ? "תקן מפתחות תרגום חסרים או הסר placeholders לא מתורגמים מהתמה." : "Fix missing localization keys or remove untranslated placeholders from the live theme.",
    translation_rec: isHe ? "תקן טקסט תרגום חסר" : "Fix visible translation placeholder text",
    translation_why: isHe ? "טקסט שבור גורם לאתר להיראות לא גמור ופוגע באמון מיידית." : "Broken UI copy makes the site feel unfinished and harms trust immediately.",
    translation_benefit: isHe ? "יוצר חוויה נקייה ומקצועית יותר ומפחית היסוס בקנייה." : "Creates a cleaner premium experience and reduces buyer hesitation.",
    perf_title: isHe ? "ציון PageSpeed נמוך" : "Low PageSpeed performance score",
    perf_problem: isHe ? "ביצועי האתר מתחת לסף מקובל." : "Website performance is below acceptable thresholds.",
    perf_fix: isHe ? "בצע אופטימיזציה לתמונות, הקטן חבילות JavaScript ושפר זמן תגובת שרת." : "Optimize images, reduce JavaScript bundle size, and improve server response time.",
    perf_rec: isHe ? "שפר מהירות לפני שליחת תנועה ממומנת" : "Improve speed before sending more paid traffic",
    perf_why: isHe ? "אתרים איטיים מבזבזים תנועה וגורמים לעסק להיראות פחות אמין." : "Slow sites waste traffic and make the business feel less reliable.",
    perf_benefit: isHe ? "שיעור המרה טוב יותר, חוויית משתמש טובה יותר ומוכנות למודעות." : "Better conversion rate, better user experience, and better ad readiness.",
    perf_retry_rec: isHe ? "בצע PageSpeed מחדש ובדוק צווארי בקבוק" : "Retry PageSpeed and review real loading bottlenecks",
    perf_retry_why: isHe ? "נתוני ביצועים לא נאספו, כך שסיכון המהירות עדיין לא ידוע." : "Performance data could not be collected, so speed risk is still partially unknown.",
    perf_retry_benefit: isHe ? "מספק תמונה ברורה יותר של חיכוך במובייל." : "Gives you a clearer picture of mobile friction before sending more paid traffic.",
    google_rec: isHe ? "חבר חשבון Google לאבחון מעמיק" : "Connect Google account for deeper diagnosis",
    google_why: isHe ? "ללא נתוני Google מחוברים, הסריקה מסתמכת רק על אותות ציבוריים." : "Without connected Google data, the scan relies only on public website signals.",
    google_benefit: isHe ? "פותח גישה לסטטוס Merchant Center, בעיות פיד מוצרים ואזהרות ברמת החשבון." : "Unlocks real Merchant Center status, product feed issues, and account-level warnings.",
    identity_rec: isHe ? "יישר זהות עסקית בכל הערוצים" : "Align business identity across channels",
    identity_why: isHe ? "פרטי קשר/עסק לא עקביים הם טריגר שכיח להשעיה." : "Inconsistent contact/business details are a frequent suspension trigger.",
    identity_benefit: isHe ? "משפר אותות אמון לסקירות Merchant Center." : "Improves trust signals for Merchant Center reviews.",
    appeal_tip: isHe
      ? "כשמגישים ערעור, פרט את השינויים המדויקים שבוצעו והיכן הם מופיעים באתר. ניתוח AI לא היה זמין זמנית — נסה שוב לאבחון מלא מבוסס Claude."
      : "When submitting an appeal, list exact changes made and where they appear publicly on your website. AI analysis was temporarily unavailable — retry for full Claude-powered diagnosis.",
  };

  if (!params.crawl.hasSSL) {
    issues.push({
      item_id: 21, section: "Checkout & Security", title: t.ssl_title,
      problem: t.ssl_problem,
      evidence: `Final URL: ${params.crawl.url} — no HTTPS detected.`,
      fix: t.ssl_fix, effort: "quick",
    });
    recommendations.push({ item_id: 21, title: t.ssl_rec, why: t.ssl_why, benefit: t.ssl_benefit });
  }

  if (!hasEmail) {
    issues.push({
      item_id: 8, section: isHe ? "פרטי קשר" : "Contact Details", title: t.no_email_title,
      problem: t.no_email_problem,
      evidence: `Scanned ${pagesScanned} pages (${scannedUrlsList}). No email address pattern found.`,
      fix: t.no_email_fix, effort: "quick",
    });
    recommendations.push({ item_id: 8, title: t.no_email_rec, why: t.no_email_why, benefit: t.no_email_benefit });
  } else if (!emailIsBranded) {
    issues.push({
      item_id: 8, section: isHe ? "פרטי קשר" : "Contact Details", title: t.free_email_title,
      problem: t.free_email_problem,
      evidence: `Found email: ${email} — free email provider.`,
      fix: t.free_email_fix, effort: "quick",
    });
  }

  if (!hasPrivacyPolicy) {
    issues.push({
      item_id: 16, section: isHe ? "עמודי מדיניות" : "Policy Pages", title: t.no_privacy_title,
      problem: t.no_privacy_problem,
      evidence: `Scanned ${pagesScanned} pages and ${params.crawl.allLinksFound.length} internal links. None match 'privacy' or 'פרטיות'.`,
      fix: t.no_privacy_fix, effort: "quick",
    });
    recommendations.push({ item_id: 16, title: t.no_privacy_rec, why: t.no_privacy_why, benefit: t.no_privacy_benefit });
  }

  if (isEcommerce && !hasReturns) {
    issues.push({
      item_id: 18, section: isHe ? "עמודי מדיניות" : "Policy Pages", title: t.no_returns_title,
      problem: t.no_returns_problem,
      evidence: `Scanned ${pagesScanned} pages. No URL or text matching 'returns', 'refund', 'החזר' found.`,
      fix: t.no_returns_fix, effort: "quick",
    });
  }

  if (isEcommerce && !hasShipping) {
    issues.push({
      item_id: 19, section: isHe ? "עמודי מדיניות" : "Policy Pages", title: t.no_shipping_title,
      problem: t.no_shipping_problem,
      evidence: `Scanned ${pagesScanned} pages. No URL or text matching 'shipping', 'delivery', 'משלוח' found.`,
      fix: t.no_shipping_fix, effort: "quick",
    });
  }

  if (!fp.phone && !hasContactPage) {
    issues.push({
      item_id: 9, section: isHe ? "פרטי קשר" : "Contact Details", title: t.no_phone_title,
      problem: t.no_phone_problem,
      evidence: `Scanned ${pagesScanned} pages. No phone pattern and no URL matching 'contact' or 'צור קשר' found.`,
      fix: t.no_phone_fix, effort: "quick",
    });
    recommendations.push({ item_id: 9, title: t.no_phone_rec, why: t.no_phone_why, benefit: t.no_phone_benefit });
  }

  if (!fp.address) {
    recommendations.push({ item_id: 10, title: t.no_address_rec, why: t.no_address_why, benefit: t.no_address_benefit });
  }

  if (hasTranslationLeak) {
    issues.push({
      item_id: 73, section: isHe ? "UX ואמון" : "UX & Trust", title: t.translation_title,
      problem: t.translation_problem,
      evidence: `Detected repeated text like 'Translation missing:' in scanned pages (${scannedUrlsList}).`,
      fix: t.translation_fix, effort: "quick",
    });
    recommendations.push({ item_id: 73, title: t.translation_rec, why: t.translation_why, benefit: t.translation_benefit });
  }

  if (params.pagespeed.performance > 0 && params.pagespeed.performance < 50) {
    issues.push({
      item_id: 7, section: isHe ? "ביצועים" : "Performance", title: t.perf_title,
      problem: t.perf_problem,
      evidence: `PageSpeed score: ${params.pagespeed.performance}/100. LCP: ${params.pagespeed.lcp}. TTFB: ${params.pagespeed.ttfb}.`,
      fix: t.perf_fix, effort: "medium",
    });
    recommendations.push({ item_id: 7, title: t.perf_rec, why: t.perf_why, benefit: t.perf_benefit });
  } else if (params.pagespeed.performance === 0) {
    recommendations.push({ item_id: 7, title: t.perf_retry_rec, why: t.perf_retry_why, benefit: t.perf_retry_benefit });
  }

  if (!params.googleConnected) {
    recommendations.push({ item_id: 99, title: t.google_rec, why: t.google_why, benefit: t.google_benefit });
  }

  if (recommendations.length < 2) {
    recommendations.push({ item_id: 13, title: t.identity_rec, why: t.identity_why, benefit: t.identity_benefit });
  }

  const headlineParts: string[] = [];
  if (isHe) {
    headlineParts.push(`נסרקו ${pagesScanned} דפים`);
    if (issues.length > 0) headlineParts.push(`נמצאו ${issues.length} בעיות`);
    else headlineParts.push("לא זוהו בעיות קריטיות");
    if (params.pagespeed.performance > 0) headlineParts.push(`PageSpeed ${params.pagespeed.performance}/100`);
    else headlineParts.push("PageSpeed לא זמין");
  } else {
    headlineParts.push(`Scanned ${pagesScanned} page${pagesScanned !== 1 ? "s" : ""}`);
    if (issues.length > 0) headlineParts.push(`found ${issues.length} issue${issues.length !== 1 ? "s" : ""}`);
    else headlineParts.push("no critical issues detected from available data");
    if (params.pagespeed.performance > 0) headlineParts.push(`PageSpeed ${params.pagespeed.performance}/100`);
    else headlineParts.push("PageSpeed unavailable in this run");
  }

  const riskScore = Math.min(
    95,
    Math.max(20, 30 + issues.length * 12 + (params.pagespeed.performance < 50 ? 10 : 0))
  );

  return ClaudeAnalysisSchema.parse({
    risk_score: riskScore,
    risk_level: riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW",
    headline: headlineParts.join(". ") + ".",
    critical_issues: issues.slice(0, 5),
    recommendations: recommendations.slice(0, 6),
    consistency_issues: [],
    checklist_results: {} as Record<string, ChecklistResultValue>,
    appeal_tip: t.appeal_tip,
  });
}

export function defaultPageSpeedData(reason: string): PageSpeedData {
  return pageSpeedUnavailable(reason);
}

export function defaultCrawlData(url: string): CrawlResult {
  return emptyCrawlResult(url);
}

// ─── Pipeline ────────────────────────────────────────────

async function touchFullProgress(scanId: string | null, phase: string, detail: string) {
  if (!scanId) return;
  await updateScanProgress(scanId, { phase, detail, status: "running" });
}

/** Internal HMAC for server→server continuation; optional dedicated env, else NEXTAUTH_SECRET. */
export function getScanJobContinueSecret(): string | undefined {
  return process.env.SCAN_JOB_CONTINUE_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
}

export function triggerAnalyzeContinuationScan(scanId: string): void {
  const secret = getScanJobContinueSecret();
  if (!secret) return;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  const base = origin.replace(/\/$/, "");
  void fetch(`${base}/api/scan/full/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-scan-continue-secret": secret },
    body: JSON.stringify({ scan_id: scanId }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.error("[scan/full] analyze continuation failed", res.status, t.slice(0, 400));
      } else {
        console.info("[scan/full] analyze continuation accepted", { scanId });
      }
    })
    .catch((err) => console.error("[scan/full] analyze continuation error", err));
}

async function runClaudeAnalysisAndPersistScan(
  scanId: string | null,
  url: string,
  profile: UserProfileInput,
  crawlData: CrawlResult,
  pageSpeedData: PageSpeedData,
  collectionIssue: string,
  applicableItems: ChecklistItem[],
  osintBlock: string,
  shopifyJson: string,
  gmcJsonForRules: string,
  adsJsonForRules: string,
  gmbData: string,
  googleConnected: boolean
): Promise<
  | {
      kind: "success";
      googleConnected: boolean;
      pageSpeedData: PageSpeedData;
      crawlData: CrawlResult;
      analysis: ClaudeAnalysisResult;
    }
  | { kind: "job_failed" }
  | { kind: "fatal"; status: number; json: Record<string, unknown> }
> {
  await touchFullProgress(scanId, SCAN_PHASES.analysis, phaseDetailFor(SCAN_PHASES.analysis));

  const prompt = buildAnalysisPrompt(
    url,
    mapScanProfileToUserProfile(profile),
    crawlData,
    pageSpeedData,
    shopifyJson,
    gmcJsonForRules,
    adsJsonForRules,
    gmbData,
    { applicableItems, osintBlock }
  );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (scanId) {
      await failScanResult(scanId, "Missing ANTHROPIC_API_KEY");
      return { kind: "job_failed" };
    }
    return { kind: "fatal", status: 500, json: { ok: false, error: "Missing ANTHROPIC_API_KEY" } };
  }

  let analysis: ClaudeAnalysisResult;

  try {
    const client = new Anthropic({ apiKey });
    const preferredModel = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
    const modelsToTry = [
      preferredModel,
      ...(preferredModel !== FALLBACK_CLAUDE_MODEL ? [FALLBACK_CLAUDE_MODEL] : []),
      LAST_RESORT_CLAUDE_MODEL,
    ];

    let response: Anthropic.Messages.Message | null = null;
    let lastModelErr: unknown = null;

    for (const model of modelsToTry) {
      try {
        response = await client.messages.create({
          model,
          max_tokens: 16000,
          temperature: 0,
          messages: [{ role: "user", content: prompt }],
        });
        console.info("[scan/full] Claude responded", {
          model,
          stop_reason: response.stop_reason,
          output_tokens: response.usage?.output_tokens,
        });
        break;
      } catch (err) {
        lastModelErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[scan/full] Claude model ${model} failed: ${msg}`);
      }
    }

    if (!response) {
      throw lastModelErr ?? new Error("All Claude models failed");
    }

    let text = extractClaudeText(response.content);
    if (!text) {
      throw new Error("Claude returned an empty response");
    }

    if (response.stop_reason === "max_tokens") {
      console.warn("[scan/full] Claude output truncated – retrying with compact prompt");
      try {
        const retryResponse = await client.messages.create({
          model: modelsToTry[0],
          max_tokens: 16000,
          temperature: 0,
          messages: [
            { role: "user", content: prompt },
            { role: "assistant", content: text },
            {
              role: "user",
              content:
                "Your previous response was cut off. Return the COMPLETE JSON object again — shorter strings, no markdown, just the JSON.",
            },
          ],
        });
        const retryText = extractClaudeText(retryResponse.content);
        if (retryText) text = retryText;
      } catch {
        // keep original truncated text and try to parse it
      }
    }

    console.info("[scan/full] Claude raw text preview:", text.slice(0, 200));
    analysis = parseClaudeJson(text);
  } catch (error) {
    const reason =
      error instanceof z.ZodError
        ? "Invalid Claude JSON schema"
        : error instanceof Error
          ? error.message
          : "Unknown Claude error";

    console.error("[scan/full] Claude analysis failed, using fallback", {
      reason,
      errorType: error?.constructor?.name,
      scanId,
    });

    analysis = buildFallbackAnalysis({
      url,
      profile,
      pagespeed: pageSpeedData,
      crawl: crawlData,
      reason: collectionIssue ? `${collectionIssue}; ${reason}` : reason,
      googleConnected,
    });
  }

  await touchFullProgress(scanId, SCAN_PHASES.persist, phaseDetailFor(SCAN_PHASES.persist));

  return {
    kind: "success",
    googleConnected,
    pageSpeedData,
    crawlData,
    analysis,
  };
}

export async function executeFullScanAnalyzeContinuation(scanId: string): Promise<void> {
  const row = await getScanResultById(scanId);
  if (!row || row.scan_type !== "paid") {
    console.warn("[scan/full/analyze] missing row or not paid", scanId);
    return;
  }
  if (row.scan_status === "done" || row.scan_status === "error") {
    return;
  }

  const url = row.url;
  const profile = row.profile as UserProfileInput;
  const crawlData = row.crawl as CrawlResult;
  const pageSpeedData = row.pagespeed as PageSpeedData;
  const userId = row.user_id ?? null;

  let gmbData = "";
  let gmcJsonForRules = "";
  let adsJsonForRules = "";
  let googleConnected = false;
  const googlePromise = (async () => {
    try {
      if (userId) {
        const googleResult = await fetchAllGoogleConnectedDataForUser(userId);
        if (googleResult.connected) {
          return googleResult.data;
        }
      }
    } catch {
      /* non-blocking */
    }
    return null;
  })();

  const shopifyPromise = fetchShopifyConnectedDataForUser(userId);

  const [googleResult, shopifyData] = await Promise.all([googlePromise, shopifyPromise]);

  if (googleResult) {
    const mc = googleResult.merchant_center as Record<string, unknown> | undefined;
    const hasGmcError = mc && typeof mc.error === "string";
    gmbData = JSON.stringify(googleResult.gmb ?? {}, null, 2);
    gmcJsonForRules = hasGmcError ? "{}" : JSON.stringify(mc ?? {}, null, 2);
    adsJsonForRules = JSON.stringify(googleResult.google_ads ?? {});
    googleConnected = !hasGmcError;
  }

  const shopifyJson = JSON.stringify(shopifyData, null, 2);

  const siteFp = toSiteFingerprint(crawlData);
  let osintData: Awaited<ReturnType<typeof gatherOsint>> | null = null;
  try {
    osintData = await gatherOsint(url, siteFp.businessName ?? null);
  } catch {
    osintData = null;
  }
  const osintBlock = osintData ? formatOsintBlock(osintData) : "";

  const availableSources = inferAvailableDataSources(crawlData, pageSpeedData, {
    gmcJson: gmcJsonForRules,
    adsJson: adsJsonForRules,
    shopifyJson,
    gmbJson: gmbData,
  });
  const applicableItems = getApplicableRules(siteFp, availableSources);

  const result = await runClaudeAnalysisAndPersistScan(
    scanId,
    url,
    profile,
    crawlData,
    pageSpeedData,
    "",
    applicableItems,
    osintBlock,
    shopifyJson,
    gmcJsonForRules,
    adsJsonForRules,
    gmbData,
    googleConnected
  );

  if (result.kind === "job_failed") return;
  if (result.kind === "fatal") {
    await failScanResult(
      scanId,
      typeof result.json.error === "string" ? result.json.error : "Analysis failed"
    );
    return;
  }

  const ok = await completeScanResult(scanId, {
    pagespeed: result.pageSpeedData,
    crawl: result.crawlData,
    analysis: result.analysis,
    google_connected: result.googleConnected,
  });
  if (!ok) {
    await failScanResult(scanId, "Could not save scan results.");
    return;
  }
  console.info("[scan/full] completed via continuation", { scan_id: scanId, url });
}

export async function executeFullScanPipeline(
  req: Request,
  url: string,
  profile: UserProfileInput,
  scanId: string | null
): Promise<FullPipelineResult> {
  await touchFullProgress(
    scanId,
    SCAN_PHASES.pagespeed_crawl,
    phaseDetailFor(SCAN_PHASES.pagespeed_crawl)
  );

  let pageSpeedData: PageSpeedData;
  let crawlData: CrawlResult;
  let collectionIssue = "";

  const [crawlResult, pagespeedResult] = await Promise.allSettled([
    crawlWebsite(url),
    getPageSpeedData(url, "fast"),
  ]);

  if (pagespeedResult.status === "fulfilled") {
    pageSpeedData = pagespeedResult.value;
  } else {
    const psReason = pagespeedResult.reason instanceof Error
      ? pagespeedResult.reason.message
      : "PageSpeed unavailable during scan";
    pageSpeedData = defaultPageSpeedData(psReason);
  }

  if (crawlResult.status === "fulfilled") {
    crawlData = crawlResult.value;
  } else {
    const error = crawlResult.reason;
    const reason = error instanceof Error ? error.message : "Unknown crawl error";
    if (!isTlsOrNetworkError(error)) throw error;
    crawlData = defaultCrawlData(url);
    collectionIssue = collectionIssue
      ? `${collectionIssue}; Crawl unavailable`
      : "Crawl unavailable";
    const msg = "Website crawl data collection failed due to network or certificate issues.";
    if (scanId) {
      await failScanResult(scanId, `${msg} ${reason}`);
      return { kind: "job_failed" };
    }
    return {
      kind: "fatal",
      status: 502,
      json: { ok: false, error: msg, details: reason },
    };
  }

  await touchFullProgress(
    scanId,
    SCAN_PHASES.google_shopify,
    phaseDetailFor(SCAN_PHASES.google_shopify)
  );

  const fp = toSiteFingerprint(crawlData);

  let gmbData = "";
  let gmcJsonForRules = "";
  let adsJsonForRules = "";
  let googleConnected = false;
  const userId = getAppUserIdFromRequest(req);

  const googlePromise = (async () => {
    try {
      if (userId) {
        const googleResult = await fetchAllGoogleConnectedDataForUser(userId);
        if (googleResult.connected) {
          return googleResult.data;
        }
      }
    } catch { /* non-blocking */ }
    return null;
  })();

  const shopifyPromise = fetchShopifyConnectedDataForUser(userId);

  const osintPromise = gatherOsint(url, fp.businessName ?? null).catch(() => null);

  const [googleResult, shopifyData, osintData] = await Promise.all([
    googlePromise,
    shopifyPromise,
    osintPromise,
  ]);

  if (googleResult) {
    const mc = googleResult.merchant_center as Record<string, unknown> | undefined;
    const hasGmcError = mc && typeof mc.error === "string";
    gmbData = JSON.stringify(googleResult.gmb ?? {}, null, 2);
    gmcJsonForRules = hasGmcError ? "{}" : JSON.stringify(mc ?? {}, null, 2);
    adsJsonForRules = JSON.stringify(googleResult.google_ads ?? {});
    googleConnected = !hasGmcError;
    if (hasGmcError) {
      collectionIssue = collectionIssue
        ? `${collectionIssue}; GMC API error: ${mc.error}`
        : `GMC API error: ${mc.error}`;
    }
  }

  const shopifyJson = JSON.stringify(shopifyData, null, 2);
  const osintBlock = osintData ? formatOsintBlock(osintData) : "";

  const availableSources = inferAvailableDataSources(crawlData, pageSpeedData, {
    gmcJson: gmcJsonForRules,
    adsJson: adsJsonForRules,
    shopifyJson,
    gmbJson: gmbData,
  });
  const applicableItems = getApplicableRules(fp, availableSources);

  if (scanId && process.env.SCAN_ENABLE_SPLIT === "1" && getScanJobContinueSecret()) {
    await persistScanIntermediateState(scanId, {
      crawl: crawlData,
      pagespeed: pageSpeedData,
      google_connected: googleConnected,
    });
    await touchFullProgress(
      scanId,
      SCAN_PHASES.analysis,
      "Preparing AI compliance review…"
    );
    triggerAnalyzeContinuationScan(scanId);
    return { kind: "deferred" };
  }

  const analysisResult = await runClaudeAnalysisAndPersistScan(
    scanId,
    url,
    profile,
    crawlData,
    pageSpeedData,
    collectionIssue,
    applicableItems,
    osintBlock,
    shopifyJson,
    gmcJsonForRules,
    adsJsonForRules,
    gmbData,
    googleConnected
  );

  if (analysisResult.kind === "job_failed") return { kind: "job_failed" };
  if (analysisResult.kind === "fatal") return analysisResult;
  return {
    kind: "success",
    googleConnected: analysisResult.googleConnected,
    pageSpeedData: analysisResult.pageSpeedData,
    crawlData: analysisResult.crawlData,
    analysis: analysisResult.analysis,
  };
}
