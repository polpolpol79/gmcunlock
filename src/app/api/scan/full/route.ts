import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPageSpeedData, type PageSpeedData } from "@/lib/pagespeed";
import { crawlWebsite, emptySiteFingerprint, type CrawlResult } from "@/lib/crawler";
import {
  CHECKLIST,
  buildAnalysisPrompt,
  getApplicableRules,
  inferAvailableDataSources,
  mapScanProfileToUserProfile,
} from "@/lib/gmc-checklist";
import { saveScanResult } from "@/lib/scan-store";
import {
  fetchAllGoogleConnectedData,
  readGoogleTokensFromRequest,
} from "@/lib/google";
import { fetchShopifyConnectedData } from "@/lib/shopify";
import { verifyPaidScanToken } from "@/lib/payment-gate";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import {
  SCAN_ROUTE_BUDGET_MS,
  ScanTimeoutError,
  scanTimeoutResponse,
  withScanTimeBudget,
} from "@/lib/scan-route-timeout";
import {
  ClaudeAnalysisSchema,
  FullScanRequestSchema,
  type ClaudeAnalysisOutput,
  type UserProfileInput,
} from "@/lib/scan-schemas";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClaudeIssue = ClaudeAnalysisOutput["critical_issues"][number];
type ClaudeRecommendation = ClaudeAnalysisOutput["recommendations"][number];
type ClaudeConsistencyIssue = ClaudeAnalysisOutput["consistency_issues"][number];
type ChecklistResultValue = ClaudeAnalysisOutput["checklist_results"][string];

export type ClaudeAnalysisResult = ClaudeAnalysisOutput;

function normalizeInputUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

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

function normalizeCriticalIssue(issue: unknown, index: number): ClaudeIssue {
  const row = issue && typeof issue === "object" ? (issue as Record<string, unknown>) : {};
  return {
    item_id:
      typeof row.item_id === "number" && Number.isFinite(row.item_id)
        ? row.item_id
        : index + 1,
    section: typeof row.section === "string" ? row.section : "General",
    title: typeof row.title === "string" ? row.title : "Critical issue",
    problem: typeof row.problem === "string" ? row.problem : "No details provided",
    evidence: typeof row.evidence === "string" ? row.evidence : "No evidence provided",
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

function extractClaudeText(content: Anthropic.Messages.Message["content"]): string {
  const blocks = content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text");
  return blocks.map((b) => b.text).join("\n").trim();
}

function parseClaudeJson(raw: string): ClaudeAnalysisResult {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const direct = (() => {
    try {
      return JSON.parse(cleaned) as unknown;
    } catch {
      return null;
    }
  })();

  const parsed = direct ?? (() => {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return null;
    const maybeJson = cleaned.slice(first, last + 1);
    try {
      return JSON.parse(maybeJson) as unknown;
    } catch {
      return null;
    }
  })();

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

function isTlsOrNetworkError(error: unknown): boolean {
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
}): ClaudeAnalysisResult {
  const issues: ClaudeIssue[] = [];

  if (!params.crawl.hasSSL) {
    issues.push({
      item_id: 21,
      section: "Checkout & security",
      title: "Missing HTTPS",
      problem: "The website does not appear to enforce HTTPS.",
      evidence: `Final URL resolved as non-HTTPS for ${params.url}`,
      fix: "Enable SSL and force HTTPS redirect on all pages.",
      effort: "quick",
    });
  }
  if (!params.crawl.hasEmail || !params.crawl.emailIsBranded) {
    issues.push({
      item_id: 8,
      section: "Contact details",
      title: "Contact email quality",
      problem: "Email is missing or not branded.",
      evidence: `hasEmail=${params.crawl.hasEmail}, emailIsBranded=${params.crawl.emailIsBranded}`,
      fix: "Use a branded domain email in footer and contact page.",
      effort: "quick",
    });
  }
  if (params.pagespeed.performance < 50) {
    issues.push({
      item_id: 7,
      section: "Performance",
      title: "Low performance score",
      problem: "PageSpeed performance is low.",
      evidence: `Performance score=${params.pagespeed.performance}`,
      fix: "Prioritize JS/CSS optimization and improve LCP/TTFB.",
      effort: "medium",
    });
  }

  const fallback = {
    risk_score: Math.max(
      20,
      Math.min(
        95,
        40 +
          (params.pagespeed.performance < 50 ? 20 : 0) +
          (!params.crawl.hasEmail || !params.crawl.emailIsBranded ? 15 : 0) +
          (!params.crawl.hasPrivacyPolicy || !params.crawl.hasTerms ? 10 : 0)
      )
    ),
    risk_level: "HIGH" as const,
    headline:
      "Automated fallback analysis used due to temporary AI network/certificate issue.",
    critical_issues: issues.slice(0, 3),
    recommendations: [
      {
        item_id: 13,
        title: "Align business identity across channels",
        why: "Inconsistent contact/business details are a frequent suspension trigger.",
        benefit: "Improves trust signals for Merchant Center reviews.",
      },
      {
        item_id: 16,
        title: "Strengthen policy visibility",
        why: "Missing or weak policy pages reduce transparency.",
        benefit: "Reduces compliance ambiguity and review friction.",
      },
    ],
    consistency_issues: [],
    checklist_results: {} as Record<string, ChecklistResultValue>,
    appeal_tip:
      "When submitting appeal, list exact changes made and where they appear publicly on your website.",
  };

  const parsed = ClaudeAnalysisSchema.parse(fallback);
  return {
    ...parsed,
    headline: `${parsed.headline} (${params.reason})`,
  };
}

function defaultPageSpeedData(reason: string): PageSpeedData {
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

function defaultCrawlData(url: string): CrawlResult {
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

export async function POST(req: Request) {
  try {
    const rate = consumeRateLimit({
      key: getClientKey(req),
      bucket: "scan_paid",
      limit: 6,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many full scan requests. Please retry in a minute." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as unknown;
    const parsedReq = FullScanRequestSchema.safeParse(body);
    if (!parsedReq.success) {
      const firstIssue = parsedReq.error.issues[0];
      return NextResponse.json(
        { ok: false, error: firstIssue?.message ?? "Invalid request body" },
        { status: 400 }
      );
    }
    const paymentToken =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).payment_token
        : null;
    if (!verifyPaidScanToken(paymentToken)) {
      return NextResponse.json(
        { ok: false, error: "Valid payment token is required for full scan." },
        { status: 402 }
      );
    }

    return await withScanTimeBudget(SCAN_ROUTE_BUDGET_MS, async () => {
      const url = normalizeInputUrl(parsedReq.data.url);
      const profile = parsedReq.data.profile;

      // a+b) PageSpeed + Crawl (resilient for SSL/network issues)
      let pageSpeedData: PageSpeedData;
      let crawlData: CrawlResult;
      let collectionIssue = "";

      try {
        pageSpeedData = await getPageSpeedData(url);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown PageSpeed error";
        if (!isTlsOrNetworkError(error)) throw error;
        pageSpeedData = defaultPageSpeedData(reason);
        collectionIssue = collectionIssue
          ? `${collectionIssue}; PageSpeed unavailable`
          : "PageSpeed unavailable";
      }

      try {
        crawlData = await crawlWebsite(url);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown crawl error";
        if (!isTlsOrNetworkError(error)) throw error;
        crawlData = defaultCrawlData(url);
        collectionIssue = collectionIssue
          ? `${collectionIssue}; Crawl unavailable`
          : "Crawl unavailable";
        if (pageSpeedData.performance === 0 && pageSpeedData.ttfb.startsWith("Unavailable")) {
          // Both collection methods failed for network/cert causes.
          return NextResponse.json(
            {
              ok: false,
              error:
                "Both PageSpeed and Crawl data collection failed due to network/certificate issues.",
              details: reason,
            },
            { status: 502 }
          );
        }
      }

      // c) Checklist + prompt builder
      void CHECKLIST;
      let googleAccountData = "";
      let gmbData = "";
      let gmcJsonForRules = "";
      let adsJsonForRules = "";
      let googleConnected = false;
      try {
        const googleTokens = readGoogleTokensFromRequest(req);
        if (googleTokens?.access_token) {
          const googleData = await fetchAllGoogleConnectedData(googleTokens.access_token);
          googleAccountData = JSON.stringify(googleData, null, 2);
          gmbData = JSON.stringify(googleData.gmb ?? {}, null, 2);
          gmcJsonForRules = JSON.stringify(googleData.merchant_center ?? {});
          adsJsonForRules = JSON.stringify(googleData.google_ads ?? {});
          googleConnected = true;
        }
      } catch {
        // Non-blocking: continue full scan without Google-connected data.
      }

      const shopifyData = await fetchShopifyConnectedData();
      const shopifyJson = JSON.stringify(shopifyData, null, 2);

      const availableSources = inferAvailableDataSources(crawlData, pageSpeedData, {
        gmcJson: gmcJsonForRules,
        adsJson: adsJsonForRules,
        shopifyJson,
        gmbJson: gmbData,
      });
      const applicableItems = getApplicableRules(crawlData.fingerprint, crawlData, availableSources);

      const prompt = buildAnalysisPrompt(
        url,
        mapScanProfileToUserProfile(profile),
        JSON.stringify(crawlData, null, 2),
        JSON.stringify(pageSpeedData, null, 2),
        shopifyJson,
        gmcJsonForRules,
        adsJsonForRules,
        gmbData,
        {
          businessIdentityJson: JSON.stringify(crawlData.fingerprint, null, 2),
          applicableItems,
        }
      );

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { ok: false, error: "Missing ANTHROPIC_API_KEY" },
          { status: 500 }
        );
      }

      let analysis: ClaudeAnalysisResult;

      try {
        // d) Claude call
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: "claude-opus-4-5",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        });

        const text = extractClaudeText(response.content);
        if (!text) {
          throw new Error("Claude returned an empty response");
        }

        // e) Parse JSON safely
        analysis = parseClaudeJson(text);
      } catch (error) {
        const reason =
          error instanceof z.ZodError
            ? "Invalid Claude JSON schema"
            : error instanceof Error
            ? error.message
            : "Unknown Claude error";

        if (isTlsOrNetworkError(error) || error instanceof z.ZodError) {
          analysis = buildFallbackAnalysis({
            url,
            profile,
            pagespeed: pageSpeedData,
            crawl: crawlData,
            reason: collectionIssue ? `${collectionIssue}; ${reason}` : reason,
          });
        } else {
          return NextResponse.json(
            {
              ok: false,
              error: reason,
              details: "Claude response was not valid JSON.",
            },
            { status: 502 }
          );
        }
      }

      // f) Persist scan result (best effort)
      const scan_id = await saveScanResult({
        url,
        scan_type: "paid",
        google_connected: googleConnected,
        profile,
        pagespeed: pageSpeedData,
        crawl: crawlData,
        analysis,
      });
      if (!scan_id) {
        console.warn("[scan/full] persisted without scan_id", { url, googleConnected });
      } else {
        console.info("[scan/full] completed", { scan_id, url, googleConnected });
      }

      // g) Combined result
    return NextResponse.json({
      ok: true,
      data: {
        scan_id,
        scan_type: "paid",
        google_connected: googleConnected,
        fingerprint: crawlData.fingerprint,
        pagespeed: pageSpeedData,
        crawl: crawlData,
        analysis,
      },
    });
    });
  } catch (error) {
    if (error instanceof ScanTimeoutError) {
      return scanTimeoutResponse();
    }
    const message =
      error instanceof Error ? error.message : "Full scan failed unexpectedly";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

