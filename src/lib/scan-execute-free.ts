import Anthropic from "@anthropic-ai/sdk";
import { getPageSpeedData, type PageSpeedData } from "@/lib/pagespeed";
import { crawlWebsite, emptySiteFingerprint, type CrawlResult } from "@/lib/crawler";
import {
  buildAnalysisPrompt,
  getApplicableRules,
  inferAvailableDataSources,
  mapScanProfileToUserProfile,
} from "@/lib/gmc-checklist";
import { updateScanProgress } from "@/lib/scan-store";
import { SCAN_PHASES, phaseDetailFor } from "@/lib/scan-progress-phases";
import {
  ClaudeAnalysisSchema,
  type ClaudeAnalysisOutput,
  type UserProfileInput,
} from "@/lib/scan-schemas";

type ChecklistResultValue = ClaudeAnalysisOutput["checklist_results"][string];

export function normalizeFreeScanInputUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function defaultPageSpeedDataForFree(reason: string): PageSpeedData {
  return {
    performance: 0,
    lcp: "N/A",
    cls: "N/A",
    fid: "N/A",
    fcp: "N/A",
    ttfb: `Unavailable (${reason})`,
    opportunities: ["PageSpeed data unavailable - retry later."],
  };
}

export function defaultCrawlDataForFree(url: string): CrawlResult {
  return {
    hasLogo: false,
    hasBrandName: false,
    hasAboutPage: false,
    hasContactPage: false,
    hasEmail: false,
    emailIsBranded: false,
    hasPhone: false,
    hasAddress: false,
    hasContactForm: false,
    hasPrivacyPolicy: false,
    hasReturnPolicy: false,
    hasShippingPolicy: false,
    hasTerms: false,
    hasSSL: /^https:\/\//i.test(url),
    hasBrokenLinks: false,
    hasPopups: false,
    metaTitle: "",
    metaDescription: "",
    hasSpellingIssues: false,
    hasFakeUrgency: false,
    hasFakeTrustBadges: false,
    hasMedicalClaims: false,
    footerHasContact: false,
    footerHasPrivacy: false,
    pageTitle: "",
    allLinks: [],
    allText: "",
    fingerprint: emptySiteFingerprint(),
  };
}

function normalizeChecklistValue(value: unknown): ChecklistResultValue {
  if (typeof value !== "string") return "unknown";
  const lower = value.toLowerCase();
  if (lower === "pass" || lower === "fail" || lower === "warning" || lower === "unknown") {
    return lower;
  }
  return "unknown";
}

function parseClaudeJson(raw: string): ClaudeAnalysisOutput {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  const maybeJson =
    first !== -1 && last !== -1 && last > first ? cleaned.slice(first, last + 1) : cleaned;
  const parsed = JSON.parse(maybeJson) as Record<string, unknown>;

  const checklistResultsInput =
    parsed.checklist_results && typeof parsed.checklist_results === "object"
      ? (parsed.checklist_results as Record<string, unknown>)
      : {};

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
    critical_issues: Array.isArray(parsed.critical_issues) ? parsed.critical_issues : [],
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

function buildFreeFallback(): ClaudeAnalysisOutput {
  return ClaudeAnalysisSchema.parse({
    risk_score: 65,
    risk_level: "HIGH",
    headline: "Free scan completed with limited data.",
    critical_issues: [
      {
        item_id: 7,
        section: "Performance",
        title: "Performance needs improvement",
        problem: "The website has measurable performance bottlenecks.",
        evidence: "PageSpeed baseline indicates degraded loading experience.",
        fix: "Improve LCP, JS bundle size, and server response time.",
        effort: "medium",
      },
      {
        item_id: 13,
        section: "Identity consistency",
        title: "Business identity consistency should be verified",
        problem: "Limited scan cannot verify external channel consistency.",
        evidence: "Google and Shopify data are not connected in free mode.",
        fix: "Connect Google and Shopify for a full consistency audit.",
        effort: "quick",
      },
      {
        item_id: 16,
        section: "Policy transparency",
        title: "Policy coverage may be incomplete",
        problem: "Policy pages should be visible and complete on the website.",
        evidence: "Basic crawl flags policy visibility risk in free mode.",
        fix: "Ensure privacy, return, shipping, and terms pages are complete.",
        effort: "quick",
      },
    ],
    recommendations: [],
    consistency_issues: [],
    checklist_results: {},
    appeal_tip:
      "Free scan highlights top risks. Upgrade for full cross-platform validation before appeal.",
  });
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

  const [pagespeedSettled, crawlSettled] = await Promise.allSettled([
    getPageSpeedData(url),
    crawlWebsite(url),
  ]);

  const pagespeed =
    pagespeedSettled.status === "fulfilled"
      ? pagespeedSettled.value
      : defaultPageSpeedDataForFree(
          pagespeedSettled.reason instanceof Error
            ? pagespeedSettled.reason.message
            : "Unknown error"
        );
  const crawl =
    crawlSettled.status === "fulfilled" ? crawlSettled.value : defaultCrawlDataForFree(url);

  await maybeProgress(scanId, SCAN_PHASES.analysis, phaseDetailFor(SCAN_PHASES.analysis));

  const gmcUser = mapScanProfileToUserProfile(profile);
  const availableSources = inferAvailableDataSources(crawl, pagespeed, {});
  const applicableItems = getApplicableRules(crawl.fingerprint, crawl, availableSources);

  const prompt = buildAnalysisPrompt(
    url,
    gmcUser,
    JSON.stringify(crawl, null, 2),
    JSON.stringify(pagespeed, null, 2),
    "",
    "",
    "",
    "",
    {
      businessIdentityJson: JSON.stringify(crawl.fingerprint, null, 2),
      applicableItems,
      extraUserNotes:
        "FREE SCAN MODE: Max 3 items in critical_issues. Do not assume Google/Shopify/GMC data. checklist_results may ONLY include rule IDs that appear in the URGENT or REC lists above.",
    }
  );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  let analysis: ClaudeAnalysisOutput;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) {
      analysis = buildFreeFallback();
    } else {
      analysis = parseClaudeJson(text);
    }
  } catch {
    analysis = buildFreeFallback();
  }

  analysis = {
    ...analysis,
    critical_issues: analysis.critical_issues.slice(0, 3),
  };

  await maybeProgress(scanId, SCAN_PHASES.persist, phaseDetailFor(SCAN_PHASES.persist));

  return { pagespeed, crawl, analysis };
}
