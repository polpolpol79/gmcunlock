import Anthropic from "@anthropic-ai/sdk";
import { getPageSpeedData, pageSpeedUnavailable, type PageSpeedData } from "@/lib/pagespeed";
import {
  crawlWebsite,
  emptyCrawlResult,
  toSiteFingerprint,
  type CrawlResult,
} from "@/lib/crawler";
import {
  buildAnalysisPrompt,
  getRelevantItems,
  mapScanProfileToUserProfile,
} from "@/lib/gmc-checklist";
import { tryParseJsonFromClaudeText } from "@/lib/claude-json-extract";
import { gatherOsint, formatOsintBlock } from "@/lib/osint";
import { updateScanProgress } from "@/lib/scan-store";
import { SCAN_PHASES, phaseDetailFor } from "@/lib/scan-progress-phases";
import {
  ClaudeAnalysisSchema,
  type ClaudeAnalysisOutput,
  type UserProfileInput,
} from "@/lib/scan-schemas";

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-5";
const FALLBACK_CLAUDE_MODEL = "claude-opus-4-5";

type ChecklistResultValue = ClaudeAnalysisOutput["checklist_results"][string];

export function normalizeFreeScanInputUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function defaultPageSpeedDataForFree(reason: string): PageSpeedData {
  return pageSpeedUnavailable(reason);
}

export function defaultCrawlDataForFree(url: string): CrawlResult {
  return emptyCrawlResult(url);
}

function normalizeChecklistValue(value: unknown): ChecklistResultValue {
  if (typeof value !== "string") return "unknown";
  const lower = value.toLowerCase();
  if (lower === "pass" || lower === "fail" || lower === "warning" || lower === "unknown") {
    return lower;
  }
  return "unknown";
}

const SPECULATIVE_RE =
  /\b(likely|probably|may\s|might\s|could\s|appears?\s+to|seems?\s+to|possibly|presumably|it\s+is\s+possible)\b/i;

function sanitizeEvidence(evidence: string): string {
  if (!SPECULATIVE_RE.test(evidence)) return evidence;
  return evidence.replace(SPECULATIVE_RE, "[note: unconfirmed]") +
    " [warning: speculative language detected — verify manually]";
}

function parseClaudeJson(raw: string): ClaudeAnalysisOutput {
  const parsedObj = tryParseJsonFromClaudeText(raw);
  if (!parsedObj || typeof parsedObj !== "object") {
    throw new Error("Claude returned non-JSON response");
  }
  const parsed = parsedObj as Record<string, unknown>;

  const checklistResultsInput =
    parsed.checklist_results && typeof parsed.checklist_results === "object"
      ? (parsed.checklist_results as Record<string, unknown>)
      : {};

  const rawIssues = Array.isArray(parsed.critical_issues) ? parsed.critical_issues : [];
  const sanitizedIssues = rawIssues.map((issue: unknown) => {
    if (!issue || typeof issue !== "object") return issue;
    const obj = issue as Record<string, unknown>;
    if (typeof obj.evidence === "string") {
      return { ...obj, evidence: sanitizeEvidence(obj.evidence) };
    }
    return obj;
  });

  const normalized = {
    risk_score: typeof parsed.risk_score === "number" ? parsed.risk_score : 0,
    risk_level:
      parsed.risk_level === "CRITICAL" ||
      parsed.risk_level === "HIGH" ||
      parsed.risk_level === "MEDIUM" ||
      parsed.risk_level === "LOW"
        ? parsed.risk_level
        : "MEDIUM",
    headline:
      typeof parsed.headline === "string"
        ? parsed.headline
        : "Limited scan completed with available data.",
    critical_issues: sanitizedIssues,
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    consistency_issues: Array.isArray(parsed.consistency_issues) ? parsed.consistency_issues : [],
    checklist_results: Object.fromEntries(
      Object.entries(checklistResultsInput).map(([key, value]) => [
        key,
        normalizeChecklistValue(value),
      ])
    ) as Record<string, ChecklistResultValue>,
    appeal_tip:
      typeof parsed.appeal_tip === "string"
        ? parsed.appeal_tip
        : "Fix critical issues first, then submit a concise factual appeal.",
  };

  return ClaudeAnalysisSchema.parse(normalized);
}

type ClaudeIssue = ClaudeAnalysisOutput["critical_issues"][number];

function buildDataDrivenFallback(
  crawl: CrawlResult,
  pagespeed: PageSpeedData,
  businessType?: string
): ClaudeAnalysisOutput {
  const isEcommerce = !businessType || businessType.startsWith("ecommerce");
  const issues: ClaudeIssue[] = [];
  const recommendations: ClaudeAnalysisOutput["recommendations"] = [];
  const fp = crawl.fingerprint;
  const pagesScanned = crawl.pages.length;
  const bundle =
    crawl.pages.map((p) => `${p.url}\n${p.text}`).join("\n") +
    crawl.allLinksFound.join(" ");
  const scannedUrlsList = crawl.pages.map((p) => p.url).join(", ") || "none";

  const FREE_EMAIL_RE = /@(gmail|yahoo|hotmail|outlook|aol|live|icloud)\./i;
  const hasEmail = Boolean(fp.email?.trim());
  const emailIsBranded = hasEmail && !FREE_EMAIL_RE.test(fp.email!);
  const hasPrivacyPolicy = /privacy|פרטיות|מדיניות.{0,5}פרטיות/i.test(bundle);
  const hasTerms = /terms|conditions|תנאי|תקנון|מדיניות/i.test(bundle);
  const hasReturns = /return|refund|החזר|החזרות/i.test(bundle);
  const hasShipping = /shipping|delivery|משלוח|הובלה/i.test(bundle);
  const hasContactPage = /contact|צור.{0,3}קשר/i.test(bundle);
  const hasTranslationLeak = /translation missing:/i.test(bundle);

  if (!crawl.hasSSL) {
    issues.push({
      item_id: 21,
      section: "Checkout & Security",
      title: "Website is not using HTTPS",
      problem: "The website URL does not enforce SSL/HTTPS.",
      evidence: `Final URL: ${crawl.url} — no HTTPS detected.`,
      fix: "Enable SSL certificate and force HTTPS redirect on all pages.",
      effort: "quick",
    });
    recommendations.push({
      item_id: 21,
      title: "Enable HTTPS across the whole site",
      why: "A secure site is a basic trust signal for users and ad review systems.",
      benefit: "Improves trust, conversion confidence, and technical readiness.",
    });
  }

  if (!hasEmail) {
    issues.push({
      item_id: 8,
      section: "Contact Details",
      title: "No email address found on the website",
      problem: "No email address was detected on any scanned page.",
      evidence: `Scanned ${pagesScanned} pages (${scannedUrlsList}). No email address pattern found in any page text.`,
      fix: "Add a branded email address (e.g. info@yourdomain.com) to the footer and contact page.",
      effort: "quick",
    });
    recommendations.push({
      item_id: 8,
      title: "Add a visible branded email address",
      why: "Visitors and reviewers expect a clear support channel on the site.",
      benefit: "Improves transparency and makes the business look more established.",
    });
  } else if (!emailIsBranded) {
    issues.push({
      item_id: 8,
      section: "Contact Details",
      title: "Email is from a free provider, not branded",
      problem: "The email found uses a free provider instead of the business domain.",
      evidence: `Found email: ${fp.email} — this is a free email provider, not a branded domain email.`,
      fix: "Use a branded email address (info@yourdomain.com) instead of a free provider.",
      effort: "quick",
    });
  }

  if (!hasPrivacyPolicy) {
    issues.push({
      item_id: 16,
      section: "Policy Pages",
      title: "No privacy policy page found",
      problem: "No privacy policy page was detected among scanned pages or internal links.",
      evidence: `Scanned ${pagesScanned} pages and ${crawl.allLinksFound.length} internal links. None match 'privacy' or 'פרטיות'.`,
      fix: "Create a privacy policy page and link to it from the footer navigation.",
      effort: "quick",
    });
    recommendations.push({
      item_id: 16,
      title: "Publish a privacy policy in the footer",
      why: "Privacy transparency is a standard trust signal for ecommerce and lead-gen sites.",
      benefit: "Reduces friction for visitors and improves overall site credibility.",
    });
  }

  if (isEcommerce && !hasReturns) {
    issues.push({
      item_id: 18,
      section: "Policy Pages",
      title: "No returns/refund policy found",
      problem: "No returns or refund policy was found on the website.",
      evidence: `Scanned ${pagesScanned} pages. No URL or text matching 'returns', 'refund', 'החזר' found.`,
      fix: "Add a clear returns & refund policy page with return period, conditions, and process.",
      effort: "quick",
    });
  }

  if (isEcommerce && !hasShipping) {
    issues.push({
      item_id: 19,
      section: "Policy Pages",
      title: "No shipping policy found",
      problem: "No shipping/delivery policy was found on the website.",
      evidence: `Scanned ${pagesScanned} pages. No URL or text matching 'shipping', 'delivery', 'משלוח' found.`,
      fix: "Add a shipping policy page with delivery times, costs, and carrier information.",
      effort: "quick",
    });
  }

  if (!fp.phone && !hasContactPage) {
    issues.push({
      item_id: 9,
      section: "Contact Details",
      title: "No phone number or contact page found",
      problem: "No phone number and no contact page were found.",
      evidence: `Scanned ${pagesScanned} pages. No phone pattern and no URL matching 'contact' or 'צור קשר' found.`,
      fix: "Add a contact page with phone number, email, and physical address.",
      effort: "quick",
    });
    recommendations.push({
      item_id: 9,
      title: "Add a complete contact page",
      why: "A visible contact page makes the business look real and reachable.",
      benefit: "Improves trust and helps users take the next step confidently.",
    });
  }

  if (!fp.address) {
    recommendations.push({
      item_id: 10,
      title: "Add a visible business or returns address",
      why: "A public address strengthens trust and helps customers understand who is behind the site.",
      benefit: "Improves transparency and reduces friction around support, returns, and legitimacy.",
    });
  }

  if (hasTranslationLeak) {
    issues.push({
      item_id: 73,
      section: "UX & Trust",
      title: "Visible untranslated placeholder text appears on the site",
      problem: "Visitors can see raw translation placeholder text instead of polished UI copy.",
      evidence: `Detected repeated text like 'Translation missing:' in scanned pages (${scannedUrlsList}).`,
      fix: "Fix missing localization keys or remove untranslated placeholders from the live theme.",
      effort: "quick",
    });
    recommendations.push({
      item_id: 73,
      title: "Fix visible translation placeholder text",
      why: "Broken UI copy makes the site feel unfinished and harms trust immediately.",
      benefit: "Creates a cleaner premium experience and reduces buyer hesitation.",
    });
  }

  if (pagespeed.performance > 0 && pagespeed.performance < 50) {
    issues.push({
      item_id: 7,
      section: "Performance",
      title: "Low PageSpeed performance score",
      problem: "Website performance is below acceptable thresholds.",
      evidence: `PageSpeed score: ${pagespeed.performance}/100. LCP: ${pagespeed.lcp}. TTFB: ${pagespeed.ttfb}.`,
      fix: "Optimize images, reduce JavaScript bundle size, and improve server response time.",
      effort: "medium",
    });
    recommendations.push({
      item_id: 7,
      title: "Improve speed before sending more paid traffic",
      why: "Slow sites waste traffic and make the business feel less reliable.",
      benefit: "Better conversion rate, better user experience, and better ad readiness.",
    });
  } else if (pagespeed.performance === 0) {
    recommendations.push({
      item_id: 7,
      title: "Retry PageSpeed and review real loading bottlenecks",
      why: "Performance data could not be collected, so speed risk is still partially unknown.",
      benefit: "Gives you a clearer picture of mobile friction before sending more paid traffic.",
    });
  }

  const headlineParts: string[] = [];
  headlineParts.push(`Scanned ${pagesScanned} page${pagesScanned !== 1 ? "s" : ""}`);
  if (issues.length > 0)
    headlineParts.push(`found ${issues.length} issue${issues.length !== 1 ? "s" : ""}`);
  else headlineParts.push("no critical issues detected from available data");
  if (pagespeed.performance > 0) {
    headlineParts.push(
      pagespeed.source === "cached"
        ? `PageSpeed ${pagespeed.performance}/100 (cached snapshot)`
        : `PageSpeed ${pagespeed.performance}/100`
    );
  } else {
    headlineParts.push("PageSpeed unavailable in this run");
  }

  const riskScore = Math.min(
    95,
    Math.max(20, 30 + issues.length * 12 + (pagespeed.performance < 50 ? 10 : 0))
  );

  return ClaudeAnalysisSchema.parse({
    risk_score: riskScore,
    risk_level: riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW",
    headline: headlineParts.join(". ") + ".",
    critical_issues: issues.slice(0, 3),
    recommendations: recommendations.slice(0, 5),
    consistency_issues: [],
    checklist_results: {},
    appeal_tip:
      "This free scan is based on public website and performance signals only. Upgrade for connected Google + Shopify diagnosis and full compliance analysis.",
  });
}

function enrichAnalysisIfThin(
  analysis: ClaudeAnalysisOutput,
  crawl: CrawlResult,
  pagespeed: PageSpeedData,
  businessType?: string
): ClaudeAnalysisOutput {
  const fallback = buildDataDrivenFallback(crawl, pagespeed, businessType);
  const hasIssues = analysis.critical_issues.length > 0;
  const hasRecommendations = analysis.recommendations.length > 0;
  if (hasIssues && hasRecommendations) return analysis;

  return {
    ...analysis,
    critical_issues: hasIssues ? analysis.critical_issues : fallback.critical_issues,
    recommendations: hasRecommendations ? analysis.recommendations : fallback.recommendations,
    headline:
      analysis.headline && analysis.headline !== "Limited scan completed with available data."
        ? analysis.headline
        : fallback.headline,
    risk_score:
      analysis.risk_score > 0
        ? Math.max(analysis.risk_score, fallback.risk_score)
        : fallback.risk_score,
    risk_level:
      analysis.risk_level === "CRITICAL" || analysis.risk_level === "HIGH" || analysis.risk_level === "MEDIUM"
        ? analysis.risk_level
        : fallback.risk_level,
  };
}

async function maybeProgress(scanId: string | null, phase: string, detail: string) {
  if (!scanId) return;
  await updateScanProgress(scanId, { phase, detail, status: "running" });
}

export type FreeScanPipelineResult = {
  pagespeed: PageSpeedData;
  crawl: CrawlResult;
  analysis: ClaudeAnalysisOutput;
};

/**
 * Core free scan: PageSpeed + crawl + Claude. Optional `scanId` enables DB progress updates.
 */
export async function runFreeScanPipeline(
  url: string,
  profile: UserProfileInput,
  scanId: string | null
): Promise<FreeScanPipelineResult> {
  await maybeProgress(
    scanId,
    SCAN_PHASES.pagespeed_crawl,
    phaseDetailFor(SCAN_PHASES.pagespeed_crawl)
  );

  let t0 = Date.now();
  console.log("[TIMING] crawl + osint + pagespeed (parallel) start");
  const [crawlSettled, osintSettled, pagespeedSettled] = await Promise.allSettled([
    crawlWebsite(url),
    gatherOsint(url, null),
    getPageSpeedData(url, "fast"),
  ]);

  let pagespeed: PageSpeedData;
  if (pagespeedSettled.status === "fulfilled") {
    pagespeed = pagespeedSettled.value;
    console.log("[TIMING] pagespeed OK, score:", pagespeed.performance);
  } else {
    const reason = pagespeedSettled.reason instanceof Error
      ? pagespeedSettled.reason.message
      : String(pagespeedSettled.reason);
    console.warn("[TIMING] pagespeed failed inline:", reason);
    pagespeed = defaultPageSpeedDataForFree(reason);
  }

  let crawl: CrawlResult;
  if (crawlSettled.status === "fulfilled") {
    crawl = crawlSettled.value;
  } else {
    console.warn(
      "[TIMING] crawl error",
      crawlSettled.reason instanceof Error
        ? crawlSettled.reason.message
        : String(crawlSettled.reason)
    );
    crawl = defaultCrawlDataForFree(url);
  }
  const osintData = osintSettled.status === "fulfilled" ? osintSettled.value : null;
  const osintBlock = osintData ? formatOsintBlock(osintData) : "";

  console.log("[TIMING] crawl + osint + pagespeed done", Date.now() - t0, "ms");

  await maybeProgress(scanId, SCAN_PHASES.analysis, phaseDetailFor(SCAN_PHASES.analysis));

  const gmcUser = mapScanProfileToUserProfile(profile);
  const applicableItems = getRelevantItems(gmcUser).filter(
    (item) => item.source === "crawl" || item.source === "pagespeed"
  );

  const businessTypeNotes: Record<string, string> = {
    ecommerce_shopify: "This is a Shopify e-commerce store. Check product pages, checkout trust, shipping/returns/refund policies, payment icons, and storefront legitimacy. Report issues specific to online selling.",
    ecommerce_other: "This is an e-commerce store. Check product pages, checkout trust, shipping/returns/refund policies, payment icons, and storefront legitimacy.",
    service_provider: "This is a service provider (e.g. law firm, consultant, agency). Do NOT flag missing shipping/returns policies — they are irrelevant. Instead focus on: professional credibility, credentials/licensing, clear service descriptions, office details, trust signals, and client testimonials.",
    leads_only: "This is a landing page / lead generation site. Do NOT flag missing shipping/returns policies — they are irrelevant. Focus on: clarity of offer, CTA quality, no misleading claims, social proof, trust signals, and transparent pricing/value proposition.",
    other: "This is a general business website. Focus on trust, contact info, transparency, and basic web quality.",
  };

  const typeNote = businessTypeNotes[gmcUser.business_type] || businessTypeNotes.other;

  const prompt = buildAnalysisPrompt(
    url,
    gmcUser,
    crawl,
    pagespeed,
    "",
    "",
    "",
    "",
    {
      applicableItems,
      mode: "free",
      osintBlock,
      extraUserNotes:
        `FREE SCAN MODE: Return at most 3 public findings in critical_issues and up to 5 practical recommendations. Do not diagnose suspension causes. Focus on public-site trust, clarity, usability, and readiness improvements only. Google Merchant Center, Google Ads, Shopify, and GMB are not connected in free mode.\n\n${typeNote}`,
    }
  );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  let analysis: ClaudeAnalysisOutput;
  t0 = Date.now();
  console.log("[TIMING] claude start");
  try {
    const client = new Anthropic({ apiKey });
    const preferredModel = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
    let response: Anthropic.Messages.Message;
    try {
      response = await client.messages.create({
        model: preferredModel,
        max_tokens: 2200,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (modelErr) {
      if (preferredModel === FALLBACK_CLAUDE_MODEL) throw modelErr;
      response = await client.messages.create({
        model: FALLBACK_CLAUDE_MODEL,
        max_tokens: 2200,
        messages: [{ role: "user", content: prompt }],
      });
    }
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) {
      analysis = buildDataDrivenFallback(crawl, pagespeed, gmcUser.business_type);
    } else {
      analysis = enrichAnalysisIfThin(parseClaudeJson(text), crawl, pagespeed, gmcUser.business_type);
    }
  } catch {
    analysis = buildDataDrivenFallback(crawl, pagespeed, gmcUser.business_type);
  }
  console.log("[TIMING] claude done", Date.now() - t0, "ms");

  analysis = {
    ...analysis,
    critical_issues: analysis.critical_issues.slice(0, 3),
  };

  await maybeProgress(scanId, SCAN_PHASES.persist, phaseDetailFor(SCAN_PHASES.persist));

  return { pagespeed, crawl, analysis };
}
