import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getPageSpeedData, type PageSpeedData } from "@/lib/pagespeed";
import { crawlWebsite, emptySiteFingerprint, type CrawlResult } from "@/lib/crawler";
import {
  buildAnalysisPrompt,
  getApplicableRules,
  inferAvailableDataSources,
  mapScanProfileToUserProfile,
} from "@/lib/gmc-checklist";
import { saveScanResult } from "@/lib/scan-store";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import {
  ClaudeAnalysisSchema,
  FullScanRequestSchema,
  type ClaudeAnalysisOutput,
} from "@/lib/scan-schemas";
import {
  SCAN_ROUTE_BUDGET_MS,
  ScanTimeoutError,
  scanTimeoutResponse,
  withScanTimeBudget,
} from "@/lib/scan-route-timeout";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChecklistResultValue = ClaudeAnalysisOutput["checklist_results"][string];

function normalizeInputUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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

export async function POST(req: Request) {
  try {
    const rate = consumeRateLimit({
      key: getClientKey(req),
      bucket: "scan_free",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many free scan requests. Please retry in a minute." },
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

    return await withScanTimeBudget(SCAN_ROUTE_BUDGET_MS, async () => {
      const url = normalizeInputUrl(parsedReq.data.url);
      const profile = parsedReq.data.profile;

      const [pagespeedSettled, crawlSettled] = await Promise.allSettled([
        getPageSpeedData(url),
        crawlWebsite(url),
      ]);

      const pagespeed =
        pagespeedSettled.status === "fulfilled"
          ? pagespeedSettled.value
          : defaultPageSpeedData(
              pagespeedSettled.reason instanceof Error
                ? pagespeedSettled.reason.message
                : "Unknown error"
            );
      const crawl =
        crawlSettled.status === "fulfilled"
          ? crawlSettled.value
          : defaultCrawlData(url);

      const gmcUser = mapScanProfileToUserProfile(parsedReq.data.profile);
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
        return NextResponse.json({ ok: false, error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
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

      const scan_id = await saveScanResult({
        url,
        scan_type: "free",
        google_connected: false,
        profile,
        pagespeed,
        crawl,
        analysis,
      });
      if (!scan_id) {
        console.warn("[scan/free] persisted without scan_id", { url });
      } else {
        console.info("[scan/free] completed", { scan_id, url });
      }

      return NextResponse.json({
        ok: true,
        data: {
          scan_id,
          scan_type: "free",
          google_connected: false,
          fingerprint: crawl.fingerprint,
          pagespeed,
          crawl,
          analysis,
        },
      });
    });
  } catch (error) {
    if (error instanceof ScanTimeoutError) {
      return scanTimeoutResponse();
    }
    const message = error instanceof Error ? error.message : "Free scan failed unexpectedly";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

