"use client";

import Image from "next/image";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AdsIcon,
  BrandBadge,
  MerchantIcon,
  PageSpeedIcon,
  ShopifyIcon,
  TrustIcon,
} from "@/components/product-badges";
import { CHECKLIST } from "@/lib/gmc-checklist";

type HasGmb = true | false | null;
type ChecklistResultValue = "pass" | "fail" | "warning" | "unknown";
type ScanType = "free" | "paid";

type UserProfile = {
  business_type: "ecommerce" | "service_provider" | "leads_only" | "other";
  platform: "shopify" | "woocommerce" | "wix" | "other";
  blocked_where: "merchant_center" | "google_ads" | "both" | "proactive";
  has_gmb: HasGmb;
};

type PageSpeedData = {
  performance: number;
  lcp: string;
  cls: string;
  fid: string;
  fcp: string;
  ttfb: string;
  opportunities: string[];
  source?: "live" | "cached" | "unavailable";
  strategy?: "mobile" | "desktop" | "unknown";
  collectedAt?: string | null;
  note?: string | null;
};

type SiteFingerprint = {
  businessName: string | null;
  email: string | null;
  phone: string | null;
  emails?: string[];
  phones?: string[];
  address: string | null;
  platform: "shopify" | "woocommerce" | "wix" | "other" | null;
  siteType: "ecommerce" | "service" | "leads" | "other" | null;
  currency: string | null;
  country: string | null;
  language: string | null;
};

type CrawlResult = {
  url?: string;
  hasSSL: boolean;
  responseTimeMs?: number;
  robotsTxt?: string | null;
  pages?: Array<{ url: string; text: string }>;
  allLinksFound?: string[];
  fingerprint?: SiteFingerprint;
};

type CriticalIssue = {
  item_id: number;
  section: string;
  title: string;
  problem: string;
  why_it_matters?: string;
  evidence: string;
  fix: string;
  effort: "quick" | "medium" | "hard";
};

type Recommendation = {
  item_id: number;
  title: string;
  why: string;
  benefit: string;
};

type ConsistencyIssue = {
  field: string;
  website: string;
  gmc: string;
  gmb: string;
  shopify: string;
  status: "match" | "mismatch" | "unknown";
};

type ClaudeAnalysisResult = {
  risk_score: number;
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  headline: string;
  critical_issues: CriticalIssue[];
  recommendations: Recommendation[];
  consistency_issues: ConsistencyIssue[];
  checklist_results: Record<string, ChecklistResultValue>;
  suspension_reason?: string;
  appeal_tip: string;
};

type ScanPayload = {
  scan_id?: string | null;
  scan_type: ScanType;
  google_connected: boolean;
  url?: string;
  profile?: unknown;
  fingerprint?: SiteFingerprint | null;
  pagespeed: PageSpeedData;
  crawl: CrawlResult;
  analysis: ClaudeAnalysisResult;
};

type ScanAcceptedPayload = {
  pending: true;
  scan_id: string;
  scan_type: ScanType;
  google_connected: boolean;
};

type ScanResponse =
  | { ok: true; data: ScanPayload | ScanAcceptedPayload }
  | { ok: false; error?: string; details?: string };

type ScanStatusApiResponse =
  | {
      ok: true;
      data: {
        scan_id: string;
        status: string;
        phase: string;
        phase_label: string;
        detail: string;
        error: string | null;
        scan_type: ScanType;
      };
    }
  | { ok: false; error?: string };
type PaymentTokenResponse =
  | { ok: true; data: { payment_token: string } }
  | { ok: false; error?: string };
type ConnectionStatusResponse =
  | { ok: true; connected?: boolean; shop?: string | null }
  | { ok: false; error?: string };

type StoredScanResponse =
  | {
      ok: true;
      data: {
        scan_id: string;
        scan_type: ScanType;
        google_connected: boolean;
        url: string;
        profile: unknown;
        pagespeed: PageSpeedData;
        crawl: CrawlResult;
        fingerprint?: SiteFingerprint | null;
        analysis: ClaudeAnalysisResult;
      };
    }
  | { ok: false; error?: string };

/** Fetch was cancelled (navigation, Strict Mode remount, or deps changed) — not a user-facing error. */
function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return name === "AbortError";
}

function phaseStepIndex(phase: string, scanType: ScanType): number {
  const paid = ["queued", "pagespeed_crawl", "google_shopify", "analysis", "persist", "done"];
  const free = ["queued", "pagespeed_crawl", "analysis", "persist", "done"];
  const order = scanType === "paid" ? paid : free;
  const i = order.indexOf(phase);
  return i === -1 ? Math.max(0, order.length - 2) : i;
}

function visualProgressPercent(currentIdx: number, stepCount: number, elapsedSec: number): number {
  if (stepCount <= 1) return 0;
  if (currentIdx >= stepCount - 1) return 100;
  const base = Math.round((currentIdx / (stepCount - 1)) * 100);
  const next = Math.round(((currentIdx + 1) / (stepCount - 1)) * 100);
  const segment = Math.max(6, next - base);
  // Creep forward smoothly without looping back.
  const drift = Math.min(segment * 0.78, Math.max(2, elapsedSec * 0.9));
  return Math.min(next - 2, Math.round(base + drift));
}

function rotatingMessage(messages: string[], tick: number): string {
  if (messages.length === 0) return "";
  return messages[Math.floor(tick / 3) % messages.length];
}

function ScanProgressPanel({
  pollState,
  scanUrl,
}: {
  pollState: {
    scanId: string;
    scanType: ScanType;
    phase: string;
    phaseLabel: string;
    detail: string;
    startedAt: number;
  };
  scanUrl: string;
}) {
  const [tick, setTick] = useState(0);
  const [maxProgress, setMaxProgress] = useState(10);
  useEffect(() => {
    const i = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(i);
  }, []);
  useEffect(() => {
    setMaxProgress(10);
  }, [pollState.scanId]);

  const elapsed = Math.floor((Date.now() - pollState.startedAt) / 1000);
  const steps =
    pollState.scanType === "paid"
      ? [
          { key: "queued", label: "Starting" },
          { key: "pagespeed_crawl", label: "Website crawl" },
          { key: "google_shopify", label: "Google & Shopify" },
          { key: "analysis", label: "AI compliance review" },
          { key: "persist", label: "Saving report" },
          { key: "done", label: "Done" },
        ]
      : [
          { key: "queued", label: "Starting" },
          { key: "pagespeed_crawl", label: "Website crawl" },
          { key: "analysis", label: "AI compliance review" },
          { key: "persist", label: "Saving report" },
          { key: "done", label: "Done" },
        ];

  const currentIdx = phaseStepIndex(pollState.phase, pollState.scanType);
  const progressPercent = visualProgressPercent(currentIdx, steps.length, elapsed);
  useEffect(() => {
    setMaxProgress((curr) => Math.max(curr, progressPercent));
  }, [progressPercent]);
  const phaseMessages =
    pollState.scanType === "paid"
      ? {
          queued: [
            "Starting the scan environment and validating the target site",
            "Preparing the report shell so results can appear as soon as they are ready",
          ],
          pagespeed_crawl: [
            "Opening the live site and mapping important pages",
            "Reading public policies, contact details, and storefront trust signals",
            "Collecting business identity evidence from the live website",
          ],
          google_shopify: [
            "Checking connected Google data for account-side evidence",
            "Loading Shopify store-side data where it is connected",
            "Preparing cross-source comparisons before analysis",
          ],
          analysis: [
            "Turning raw evidence into clear findings and next steps",
            "Checking the collected data against the relevant compliance logic",
            "Preparing a clean report instead of generic warnings",
          ],
          persist: [
            "Saving the report so it can be reopened and shared",
            "Finalizing the report payload and response state",
          ],
          done: ["Your report is ready."],
        }
      : {
          queued: [
            "Starting the scan environment and validating the target site",
            "Preparing the report shell so results can appear quickly",
          ],
          pagespeed_crawl: [
            "Opening the live site and mapping important pages",
            "Checking trust signals, policies, and business identity",
            "Collecting public evidence for a useful recommendation-first report",
          ],
          analysis: [
            "Turning raw storefront data into clear findings and quick wins",
            "Filtering the evidence into a simple public-facing report",
            "Preparing recommendations that strengthen trust before traffic",
          ],
          persist: [
            "Saving the report so you can reopen it instantly",
            "Finalizing the scan result and handoff to the report page",
          ],
          done: ["Your report is ready."],
        };
  const currentMessage = rotatingMessage(
    phaseMessages[pollState.phase as keyof typeof phaseMessages] ?? ["Processing your scan"],
    tick
  );
  const currentMessageIndex = Math.floor(
    tick / 3
  ) % (phaseMessages[pollState.phase as keyof typeof phaseMessages]?.length || 1);

  return (
    <div dir="ltr" className="app-shell">
      <div className="app-container max-w-2xl py-16 sm:py-24">
        <div className="app-panel-strong app-soft-gradient rounded-[34px] p-8 sm:p-10">
          <div className="flex items-center gap-4">
            <Image src="/logo-clean.png" alt="GMC Unlock" width={360} height={90} unoptimized className="h-9 w-auto" />
            <div>
              <h1 className="app-title text-2xl font-semibold tracking-[-0.03em]">
                {pollState.scanType === "paid" ? "Full scan" : "Free scan"} in progress
              </h1>
              <p className="mt-1 text-sm app-muted">GMC Unlock is actively analyzing the live storefront.</p>
            </div>
          </div>
          <p className="mt-2 text-sm app-muted">
            <span className="sr-only" aria-live="polite">
              {tick}
            </span>
            Elapsed {elapsed}s — you can keep this tab open; we update live as each stage finishes.
          </p>
          {scanUrl ? (
            <p className="mt-3 break-all text-sm text-slate-600">
              <span className="text-slate-400">Target: </span>
              {scanUrl}
            </p>
          ) : null}

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#466bff,#8ea4ff)] transition-all duration-700"
                style={{ width: `${Math.max(18, maxProgress)}%` }}
              />
            </div>
          </div>

          <div className="mt-8 rounded-[24px] border border-slate-200 bg-white/85 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current step</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{pollState.phaseLabel}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{pollState.detail}</p>
          </div>

          <div className="mt-5 rounded-[24px] border border-blue-200 bg-blue-50/80 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">Live activity</p>
            <p className="mt-2 text-base font-semibold text-slate-900">{currentMessage}</p>
            <div className="mt-3 flex gap-2">
              {(phaseMessages[pollState.phase as keyof typeof phaseMessages] ?? ["Processing your scan"]).map((_, idx) => (
                <span
                  key={idx}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentMessageIndex ? "w-6 bg-blue-500" : "w-2 bg-blue-200"
                  }`}
                />
              ))}
            </div>
          </div>

          <ol className="mt-8 space-y-3">
            {steps.map((step, idx) => {
              const done = idx < currentIdx;
              const active = idx === currentIdx;
              return (
                <li
                  key={step.key}
                  className={`flex items-start gap-3 rounded-[20px] border px-4 py-3 text-sm ${
                    active
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                          ? "bg-blue-500 text-white"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done ? "✓" : idx + 1}
                  </span>
                  <span className="font-medium">{step.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function parseHasGmb(raw: string | null): HasGmb {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function parseProfileFromQuery(searchParams: URLSearchParams): UserProfile {
  const business = searchParams.get("business_type");
  const platform = searchParams.get("platform");
  const blocked = searchParams.get("blocked_where");
  const hasGmb = parseHasGmb(searchParams.get("has_gmb"));

  return {
    business_type:
      business === "ecommerce" || business === "service_provider" || business === "leads_only" || business === "other"
        ? business
        : "other",
    platform:
      platform === "shopify" || platform === "woocommerce" || platform === "wix" || platform === "other"
        ? platform
        : "other",
    blocked_where:
      blocked === "merchant_center" || blocked === "google_ads" || blocked === "both" || blocked === "proactive"
        ? blocked
        : "proactive",
    has_gmb: hasGmb,
  };
}

function parseProfileFromUnknown(raw: unknown, fallback: UserProfile): UserProfile {
  if (!raw || typeof raw !== "object") return fallback;
  const input = raw as Partial<UserProfile>;
  return {
    business_type:
      input.business_type === "ecommerce" ||
      input.business_type === "service_provider" ||
      input.business_type === "leads_only" ||
      input.business_type === "other"
        ? input.business_type
        : fallback.business_type,
    platform:
      input.platform === "shopify" ||
      input.platform === "woocommerce" ||
      input.platform === "wix" ||
      input.platform === "other"
        ? input.platform
        : fallback.platform,
    blocked_where:
      input.blocked_where === "merchant_center" ||
      input.blocked_where === "google_ads" ||
      input.blocked_where === "both" ||
      input.blocked_where === "proactive"
        ? input.blocked_where
        : fallback.blocked_where,
    has_gmb:
      input.has_gmb === true || input.has_gmb === false || input.has_gmb === null
        ? input.has_gmb
        : fallback.has_gmb,
  };
}

function scoreToColor(score: number) {
  if (score < 50) return "red";
  if (score <= 89) return "yellow";
  return "green";
}

function colorClasses(color: "red" | "yellow" | "green") {
  switch (color) {
    case "red":
      return { ring: "ring-red-100", border: "border-red-200", bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400" };
    case "yellow":
      return { ring: "ring-amber-100", border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-400" };
    case "green":
      return { ring: "ring-emerald-100", border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-400" };
  }
}

function parseMetricNumber(input: string): number | null {
  const match = input.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function metricColor(label: "Performance" | "LCP" | "CLS" | "FID", value: string | number) {
  if (label === "Performance") {
    const score = typeof value === "number" ? value : parseMetricNumber(String(value)) ?? 0;
    return scoreToColor(score);
  }
  const numeric = typeof value === "number" ? value : parseMetricNumber(String(value));
  if (numeric == null) return "yellow";
  if (label === "LCP") return numeric < 2.5 ? "green" : numeric <= 4 ? "yellow" : "red";
  if (label === "CLS") return numeric < 0.1 ? "green" : numeric <= 0.25 ? "yellow" : "red";
  return numeric < 100 ? "green" : numeric <= 300 ? "yellow" : "red";
}

function SemiCircleGauge({ score }: { score: number }) {
  const radius = 80;
  const stroke = 10;
  const arcLength = Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const filled = (clamped / 100) * arcLength;
  const remaining = arcLength - filled;

  return (
    <div className="w-56 sm:w-64">
      <div className="flex items-center justify-center">
        <svg width="100%" height="110" viewBox="0 0 200 110" role="img" aria-label="Compliance gauge">
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#466bff" />
              <stop offset="1" stopColor="#9aaeff" />
            </linearGradient>
          </defs>
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth={stroke} strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#scoreGrad)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${filled} ${remaining}`} />
          <text x="100" y="95" textAnchor="middle" fill="#111827" fontSize="26" fontWeight="800">{score}</text>
          <text x="100" y="106" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700">score</text>
        </svg>
      </div>
    </div>
  );
}

function LoadingState({ scanType }: { scanType: ScanType }) {
  const [tick, setTick] = useState(0);
  const [startedAt] = useState(() => Date.now());
  useEffect(() => {
    const i = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(i);
  }, []);

  const messages =
    scanType === "paid"
      ? [
          "Opening the live site and checking public trust signals",
          "Preparing connected Google and Shopify checks where available",
          "Building a full report you can actually use with clients",
        ]
      : [
          "Opening the live site and mapping important pages",
          "Checking trust signals, policies, and business identity",
          "Preparing clear public findings while PageSpeed loads later in the report",
        ];
  const currentMessage = rotatingMessage(messages, tick);
  const currentMessageIndex = Math.floor(tick / 3) % messages.length;
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const progressPercent = Math.min(92, 14 + elapsed * 2);

  return (
    <div dir="ltr" className="app-shell">
      <div className="app-container max-w-3xl py-20">
        <div className="app-panel-strong app-soft-gradient rounded-[34px] p-8 sm:p-10">
          <div className="flex items-center gap-4">
            <Image src="/logo-clean.png" alt="GMC Unlock" width={360} height={90} unoptimized className="h-9 w-auto" />
            <div>
              <h1 className="app-title text-2xl font-semibold tracking-[-0.03em]">
                Running {scanType === "paid" ? "full" : "free"} scan...
              </h1>
              <p className="mt-1 text-sm app-muted">GMC Unlock is preparing the scan pipeline.</p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-base leading-7 app-muted">
            {scanType === "paid"
              ? "We are collecting live storefront evidence first, then the report will fill in deeper connected signals."
              : "We are collecting live storefront evidence first so the report appears quickly and stays easy to understand."}
          </p>
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Preparing</span>
              <span>Live</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#466bff,#8ea4ff)] transition-all duration-700"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="mt-6 rounded-[24px] border border-blue-200 bg-blue-50/80 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">Live activity</p>
            <p className="mt-2 text-base font-semibold text-slate-900">{currentMessage}</p>
            <div className="mt-3 flex gap-2">
              {messages.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentMessageIndex ? "w-6 bg-blue-500" : "w-2 bg-blue-200"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<ScanPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollState, setPollState] = useState<{
    scanId: string;
    scanType: ScanType;
    phase: string;
    phaseLabel: string;
    detail: string;
    startedAt: number;
  } | null>(null);
  const [expandedCriticalId, setExpandedCriticalId] = useState<string>("");
  const [scanUrl, setScanUrl] = useState("");
  const [pagespeedRefreshState, setPagespeedRefreshState] = useState<"idle" | "refreshing" | "loaded">("idle");

  const scanId = useMemo(() => searchParams.get("scan_id")?.trim() ?? "", [searchParams]);
  const url = useMemo(() => searchParams.get("url")?.trim() ?? "", [searchParams]);
  const queryScanType = useMemo<ScanType>(
    () => (searchParams.get("scan_type") === "paid" ? "paid" : "free"),
    [searchParams]
  );
  const googleConnectedParam = useMemo(
    () => searchParams.get("google_connected") === "1",
    [searchParams]
  );
  const shopifyConnectedParam = useMemo(
    () => searchParams.get("shopify_connected") === "1",
    [searchParams]
  );
  const googleErrorParam = useMemo(
    () => searchParams.get("google_error")?.trim() ?? "",
    [searchParams]
  );
  const shopifyErrorParam = useMemo(
    () => searchParams.get("shopify_error")?.trim() ?? "",
    [searchParams]
  );
  const queryProfile = useMemo(() => parseProfileFromQuery(searchParams), [searchParams]);
  const [shopDomain, setShopDomain] = useState(searchParams.get("shop")?.trim() ?? "");
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [connectError, setConnectError] = useState("");
  const pagespeedSource =
    data?.pagespeed.source ?? ((data?.pagespeed.performance ?? 0) > 0 ? "live" : "unavailable");
  const currentProfileKey = JSON.stringify(data?.profile ?? null) + JSON.stringify(queryProfile);
  const currentProfile = useMemo(
    () => parseProfileFromUnknown(data?.profile, queryProfile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentProfileKey]
  );

  function buildPaidReturnToPath() {
    const qs = new URLSearchParams();
    if (scanId) qs.set("scan_id", scanId);
    const chosenUrl = url || scanUrl || data?.url || "";
    if (chosenUrl) qs.set("url", chosenUrl);
    qs.set("scan_type", "paid");
    qs.set("business_type", currentProfile.business_type);
    qs.set("platform", currentProfile.platform);
    qs.set("blocked_where", currentProfile.blocked_where);
    qs.set("has_gmb", String(currentProfile.has_gmb));
    if (shopDomain.trim()) qs.set("shop", shopDomain.trim());
    return `/report?${qs.toString()}`;
  }

  function buildCurrentReturnPath() {
    const qs = new URLSearchParams();
    if (scanId) qs.set("scan_id", scanId);
    const chosenUrl = url || scanUrl || data?.url || "";
    if (chosenUrl) qs.set("url", chosenUrl);
    qs.set("scan_type", queryScanType);
    qs.set("business_type", currentProfile.business_type);
    qs.set("platform", currentProfile.platform);
    qs.set("blocked_where", currentProfile.blocked_where);
    qs.set("has_gmb", String(currentProfile.has_gmb));
    if (shopDomain.trim()) qs.set("shop", shopDomain.trim());
    return `/report?${qs.toString()}`;
  }

  function onConnectGoogle() {
    const returnTo = buildCurrentReturnPath();
    window.location.href = `/api/google/oauth/start?return_to=${encodeURIComponent(returnTo)}`;
  }

  function onConnectShopify() {
    const normalized = shopDomain.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
      setConnectError("Enter a valid Shopify domain like store.myshopify.com");
      return;
    }
    const returnTo = buildCurrentReturnPath();
    window.location.href = `/api/shopify/oauth/start?shop=${encodeURIComponent(normalized)}&return_to=${encodeURIComponent(returnTo)}`;
  }

  function onStartFullScan() {
    router.push(buildPaidReturnToPath());
  }

  function retryCurrentScan() {
    if (url) {
      const qs = new URLSearchParams();
      qs.set("url", url);
      qs.set("scan_type", queryScanType);
      qs.set("business_type", currentProfile.business_type);
      qs.set("platform", currentProfile.platform);
      qs.set("blocked_where", currentProfile.blocked_where);
      qs.set("has_gmb", String(currentProfile.has_gmb));
      if (shopDomain.trim()) qs.set("shop", shopDomain.trim());
      router.push(`/report?${qs.toString()}`);
      return;
    }
    window.location.reload();
  }

  useEffect(() => {
    const ac = new AbortController();
    async function loadConnections() {
      try {
        const res = await fetch("/api/shopify", { signal: ac.signal });
        const json = (await res.json()) as ConnectionStatusResponse;
        if (ac.signal.aborted) return;
        setShopifyConnected(Boolean(json.ok && json.connected));
        if (json.ok && typeof json.shop === "string" && json.shop) {
          setShopDomain(json.shop);
        }
      } catch {
        if (!ac.signal.aborted) setShopifyConnected(false);
      }
    }
    void loadConnections();
    return () => { try { ac.abort(); } catch { /* cleanup */ } };
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function fetchFullReportData(currentScanId: string) {
      setPollState(null);
      const res = await fetch(`/api/scan/results/${encodeURIComponent(currentScanId)}`, {
        method: "GET",
        signal: controller.signal,
      });
      const json = (await res.json()) as StoredScanResponse;
      if (!res.ok || !json.ok) {
        throw new Error(!json.ok && json.error ? json.error : "Failed to load stored scan");
      }
      if (!mounted) return;
      setScanUrl(json.data.url);
      setData({
        scan_id: json.data.scan_id,
        scan_type: json.data.scan_type ?? "free",
        google_connected: json.data.google_connected ?? false,
        url: json.data.url,
        profile: json.data.profile,
        fingerprint: json.data.fingerprint ?? json.data.crawl?.fingerprint ?? null,
        pagespeed: json.data.pagespeed,
        crawl: json.data.crawl,
        analysis: json.data.analysis,
      });
      setExpandedCriticalId(json.data.analysis.critical_issues[0]?.item_id?.toString() ?? "");
    }

    async function loadStoredScan(currentScanId: string) {
      const statusRes = await fetch(`/api/scan/status/${encodeURIComponent(currentScanId)}`, {
        method: "GET",
        signal: controller.signal,
      });
      const statusJson = (await statusRes.json()) as ScanStatusApiResponse;
      if (!statusRes.ok || !statusJson.ok) {
        const errMsg =
          statusJson.ok === false ? statusJson.error : undefined;
        throw new Error(errMsg ?? "Failed to load scan status");
      }
      if (!mounted) return;
      if (statusJson.data.status === "running" || statusJson.data.status === "queued") {
        setPollState({
          scanId: currentScanId,
          scanType: statusJson.data.scan_type === "paid" ? "paid" : "free",
          phase: statusJson.data.phase,
          phaseLabel: statusJson.data.phase_label,
          detail: statusJson.data.detail || "Working…",
          startedAt: Date.now(),
        });
        return;
      }
      if (statusJson.data.status === "error") {
        setPollState(null);
        throw new Error(statusJson.data.error || "Scan failed");
      }
      await fetchFullReportData(currentScanId);
    }

    async function runScan() {
      if (!url) throw new Error("Missing URL in query params.");
      const endpoint = queryScanType === "paid" ? "/api/scan/full" : "/api/scan/free";
      let body: Record<string, unknown> = { url, profile: currentProfile };
      if (queryScanType === "paid") {
        const paymentTokenRes = await fetch("/api/scan/payment-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        });
        const paymentTokenJson = (await paymentTokenRes.json()) as PaymentTokenResponse;
        if (!paymentTokenRes.ok || !paymentTokenJson.ok) {
          throw new Error(
            !paymentTokenJson.ok && paymentTokenJson.error
              ? paymentTokenJson.error
              : "Could not verify paid scan access."
          );
        }
        body = { ...body, payment_token: paymentTokenJson.data.payment_token };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = (await res.json()) as ScanResponse;
      if (!res.ok || !json.ok) {
        throw new Error(!json.ok && json.error ? json.error : "Failed to run scan");
      }
      if (!mounted) return;
      const payload = json.data;
      if ("pending" in payload && payload.pending) {
        setScanUrl(url);
        setPollState({
          scanId: payload.scan_id,
          scanType: payload.scan_type,
          phase: "queued",
          phaseLabel: "Starting scan",
          detail: "Your scan is running on the server. This page will update automatically.",
          startedAt: Date.now(),
        });
        const u = new URL(window.location.href);
        u.searchParams.set("scan_id", payload.scan_id);
        window.history.replaceState(null, "", u.toString());
        return;
      }
      const complete = payload as ScanPayload;
      setScanUrl(url);
      setData(complete);
      setExpandedCriticalId(complete.analysis.critical_issues[0]?.item_id?.toString() ?? "");
      if (complete.scan_id) {
        const u = new URL(window.location.href);
        u.searchParams.set("scan_id", complete.scan_id);
        window.history.replaceState(null, "", u.toString());
      }
    }

    async function init() {
      setLoading(true);
      setError(null);
      try {
        if (scanId) await loadStoredScan(scanId);
        else {
          setPollState(null);
          await runScan();
        }
      } catch (e) {
        if (isAbortError(e)) return;
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Unexpected scan error");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void init().catch((e) => {
      if (isAbortError(e)) return;
      if (!mounted) return;
      setError(e instanceof Error ? e.message : "Unexpected scan error");
    });

    return () => {
      mounted = false;
      try { if (!controller.signal.aborted) controller.abort(); } catch { /* cleanup */ }
    };
    // currentProfile and router are intentionally excluded — currentProfile derives from data
    // which is set inside this effect (would create infinite loop), router is only used for
    // navigation buttons, not for the init logic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, url, queryScanType]);

  useEffect(() => {
    if (!pollState?.scanId) return;
    const id = pollState.scanId;
    const startedAt = pollState.startedAt;
    const scanType = pollState.scanType;
    const ac = new AbortController();
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let consecutiveFailures = 0;
    /** Full scans (crawl + PageSpeed + Google/Shopify + Claude) often exceed a few minutes. */
    const maxPollMs = scanType === "paid" ? 900_000 : 210_000;

    async function tick() {
      try {
        const st = await fetch(`/api/scan/status/${encodeURIComponent(id)}`, { signal: ac.signal });
        const sj = (await st.json()) as ScanStatusApiResponse;
        if (ac.signal.aborted) return;
        if (!st.ok || !sj.ok) {
          consecutiveFailures += 1;
          if (consecutiveFailures >= 3) {
            if (intervalId) clearInterval(intervalId);
            setPollState(null);
            setError(
              !sj.ok && sj.error
                ? sj.error
                : "Could not read scan status. Please retry the scan."
            );
          }
          return;
        }
        consecutiveFailures = 0;

        if (Date.now() - startedAt > maxPollMs) {
          if (intervalId) clearInterval(intervalId);
          setPollState(null);
          setError(
            scanType === "paid"
              ? "This full scan is taking longer than the page waits for. It may still finish in the background — open this report link again in a few minutes, or use Retry."
              : "Scan is taking longer than expected. Please retry."
          );
          return;
        }

        setPollState((prev) =>
          prev && prev.scanId === id
            ? {
                ...prev,
                phase: sj.data.phase,
                phaseLabel: sj.data.phase_label,
                detail: sj.data.detail || prev.detail,
                scanType: sj.data.scan_type === "paid" ? "paid" : "free",
              }
            : prev
        );

        if (sj.data.status === "done") {
          if (intervalId) clearInterval(intervalId);
          const full = await fetch(`/api/scan/results/${encodeURIComponent(id)}`, { signal: ac.signal });
          const fj = (await full.json()) as StoredScanResponse;
          if (ac.signal.aborted) return;
          if (!full.ok || !fj.ok) {
            setPollState(null);
            setError(!fj.ok && fj.error ? fj.error : "Scan completed but result could not be loaded.");
            return;
          }
          setPollState(null);
          setScanUrl(fj.data.url);
          setData({
            scan_id: fj.data.scan_id,
            scan_type: fj.data.scan_type ?? "free",
            google_connected: fj.data.google_connected ?? false,
            url: fj.data.url,
            profile: fj.data.profile,
            fingerprint: fj.data.fingerprint ?? fj.data.crawl?.fingerprint ?? null,
            pagespeed: fj.data.pagespeed,
            crawl: fj.data.crawl,
            analysis: fj.data.analysis,
          });
          setExpandedCriticalId(fj.data.analysis.critical_issues[0]?.item_id?.toString() ?? "");
          const pu = new URL(window.location.href);
          pu.searchParams.set("scan_id", fj.data.scan_id);
          window.history.replaceState(null, "", pu.toString());
        }

        if (sj.data.status === "error") {
          if (intervalId) clearInterval(intervalId);
          setPollState(null);
          setError(sj.data.error || "Scan failed");
        }
      } catch (e) {
        if (isAbortError(e)) return;
      }
    }

    intervalId = setInterval(() => void tick(), 1500);
    void tick();
    return () => {
      try { ac.abort(); } catch { /* cleanup */ }
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollState?.scanId, pollState?.startedAt, pollState?.scanType]);

  useEffect(() => {
    if (!data?.url || pagespeedSource === "live" || pagespeedSource === "cached" || pagespeedRefreshState !== "idle") return;
    let cancelled = false;
    setPagespeedRefreshState("refreshing");

    fetch("/api/scan/pagespeed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: data.url }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.ok && json?.data) {
          setData((prev) => prev ? { ...prev, pagespeed: json.data } : prev);
        }
        setPagespeedRefreshState("loaded");
      })
      .catch(() => {
        if (!cancelled) setPagespeedRefreshState("loaded");
      });

    return () => { cancelled = true; };
  }, [data?.url, pagespeedRefreshState, pagespeedSource]);

  if (pollState) {
    return <ScanProgressPanel pollState={pollState} scanUrl={scanUrl} />;
  }

  if (loading) return <LoadingState scanType={queryScanType} />;

  if (error || !data) {
    return (
      <div dir="ltr" className="app-shell">
        <div className="app-container py-20">
          <div className="app-panel rounded-[32px] border-red-200 bg-red-50 p-8">
            <h1 className="text-2xl font-semibold text-red-700">Scan failed</h1>
            <p className="mt-2 text-red-600">{error ?? "No data returned from scan."}</p>
            <button type="button" onClick={retryCurrentScan} className="app-button-secondary mt-6 h-11 px-5 text-sm font-semibold">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isFree = data.scan_type === "free";
  const findings = isFree ? data.analysis.critical_issues.slice(0, 3) : data.analysis.critical_issues;
  const score = Math.max(0, Math.min(100, data.analysis.risk_score ?? 0));
  const checklistEntries = Object.entries(data.analysis.checklist_results ?? {});
  const pagespeedCards = [
    { label: "Performance" as const, valueLabel: String(data.pagespeed.performance), rawValue: data.pagespeed.performance, hint: data.pagespeed.performance >= 90 ? "Excellent" : data.pagespeed.performance >= 65 ? "Acceptable — but room for improvement" : data.pagespeed.performance > 0 ? "Poor — impacts user trust and GMC reviews" : "" },
    { label: "LCP" as const, valueLabel: data.pagespeed.lcp, rawValue: data.pagespeed.lcp, hint: (() => { const n = parseMetricNumber(data.pagespeed.lcp); if (n == null) return ""; return n < 2.5 ? "Good (under 2.5s)" : n <= 4 ? "Needs improvement (2.5–4s)" : `Slow (${n}s) — should be under 2.5s`; })() },
    { label: "CLS" as const, valueLabel: data.pagespeed.cls, rawValue: data.pagespeed.cls, hint: (() => { const n = parseMetricNumber(data.pagespeed.cls); if (n == null) return ""; return n < 0.1 ? "Good (under 0.1)" : n <= 0.25 ? "Needs improvement" : "Poor — layout shifts hurt user experience"; })() },
    { label: "FID" as const, valueLabel: data.pagespeed.fid, rawValue: data.pagespeed.fid, hint: (() => { const n = parseMetricNumber(data.pagespeed.fid); if (n == null) return ""; return n < 100 ? "Good (under 100ms)" : n <= 300 ? "Needs improvement (100–300ms)" : `Slow (${n}ms) — users feel lag on interactions`; })() },
  ];

  const businessFingerprint = data.fingerprint ?? data.crawl.fingerprint ?? null;
  const displaySiteType = (() => {
    const bt = currentProfile.business_type;
    if (bt === "ecommerce") return "eCommerce";
    if (bt === "service_provider") return "Service provider";
    if (bt === "leads_only") return "Lead generation";
    return businessFingerprint?.siteType ?? "other";
  })();
  const showBusinessIdentity =
    businessFingerprint &&
    Object.values(businessFingerprint).some((v) => v != null && String(v).trim() !== "");
  const pagesScanned = data.crawl.pages?.length ?? 0;
  const internalLinksFound = data.crawl.allLinksFound?.length ?? 0;
  const quickWins = data.analysis.recommendations
    .filter(
      (item) =>
        !(
          item.item_id === 7 &&
          /retry pagespeed/i.test(item.title) &&
          pagespeedSource !== "unavailable"
        )
    )
    .slice(0, isFree ? 5 : 3);
  const summaryHeadline =
    pagespeedSource !== "unavailable"
      ? data.analysis.headline.replace(
          "PageSpeed unavailable in this run",
          pagespeedSource === "cached"
            ? `PageSpeed ${data.pagespeed.performance}/100 (cached snapshot)`
            : `PageSpeed ${data.pagespeed.performance}/100`
        )
      : data.analysis.headline;
  const crawlEvidenceBundle = [
    data.crawl.pages?.map((page) => `${page.url}\n${page.text}`).join("\n") ?? "",
    data.crawl.allLinksFound?.join(" ") ?? "",
    data.crawl.robotsTxt ?? "",
  ].join("\n");
  const trustSignals = (() => {
    const bt = currentProfile.business_type;
    const e = crawlEvidenceBundle;
    const shared: { label: string; found: boolean }[] = [
      { label: "Privacy policy", found: /privacy|פרטיות|privacy-policy/i.test(e) },
      { label: "Terms", found: /terms|תקנון|תנאי|terms-of-service/i.test(e) },
      { label: "About page", found: /\/about\b|\/pages\/about\b|אודות|עלינו/i.test(e) },
    ];
    if (bt === "ecommerce" || bt === "other") {
      return [
        ...shared,
        { label: "Returns", found: /refund|return|החזר|החזרות|refund-policy/i.test(e) },
        { label: "Shipping", found: /shipping|delivery|משלוח|shipping-policy/i.test(e) },
        { label: "Product path", found: /\/products?\//i.test(e) },
      ];
    }
    if (bt === "service_provider") {
      return [
        ...shared,
        { label: "Contact page", found: /contact|צור.{0,3}קשר|טלפון|phone/i.test(e) },
        { label: "Service descriptions", found: /שירות|service|what-we-do|our-services/i.test(e) },
        { label: "Pricing / packages", found: /pricing|price|מחיר|חבילות|packages|תעריף/i.test(e) },
      ];
    }
    // leads_only
    return [
      ...shared,
      { label: "Contact page", found: /contact|צור.{0,3}קשר|טלפון|phone/i.test(e) },
      { label: "Pricing / packages", found: /pricing|price|מחיר|חבילות|packages|תעריף/i.test(e) },
    ];
  })();
  const pagespeedUnavailable = pagespeedSource === "unavailable";
  const pagespeedCached = pagespeedSource === "cached";
  const pagespeedSnapshotLabel = pagespeedUnavailable
    ? "Unavailable snapshot"
    : pagespeedCached
    ? "Cached snapshot"
    : "Live snapshot";
  const coverageCards = [
    {
      label: "Pages scanned",
      value: String(pagesScanned),
      hint: pagesScanned > 0 ? "Homepage, policies, contact, and product-related pages where available." : "No readable pages captured.",
    },
    {
      label: "Internal links found",
      value: String(internalLinksFound),
      hint: internalLinksFound > 0 ? "Used to discover policies, contact, and product paths." : "Very few internal links were visible to the crawler.",
    },
    {
      label: "HTTPS",
      value: data.crawl.hasSSL ? "Yes" : "No",
      hint: data.crawl.hasSSL ? "Secure transport detected." : "No secure HTTPS signal detected on the scanned URL.",
    },
    {
      label: "Public identity fields",
      value: String(
        [
          businessFingerprint?.businessName,
          businessFingerprint?.email,
          businessFingerprint?.phone,
          businessFingerprint?.address,
        ].filter(Boolean).length
      ),
      hint: "Business name, email, phone, and address detected from public pages.",
    },
  ];

  return (
    <div dir="ltr" className="app-shell">
      <div className="app-container py-8 sm:py-10">
        <div className="app-frame rounded-[36px] p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-center lg:justify-between">
            <div>
              <p className="app-section-label">Scanned URL</p>
              <h1 className="app-title mt-2 break-all text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                {scanUrl || data.url || "—"}
              </h1>
              <div className="mt-4 flex flex-wrap gap-3">
                <BrandBadge
                  label={isFree ? "Free public scan" : "Paid full scan"}
                  tone="slate"
                  icon={<TrustIcon />}
                />
                <BrandBadge
                  label={`PageSpeed: ${pagespeedSnapshotLabel}`}
                  tone={pagespeedUnavailable ? "amber" : pagespeedCached ? "blue" : "emerald"}
                  icon={<PageSpeedIcon />}
                />
                {!isFree ? (
                  <BrandBadge
                    label={`Google: ${data.google_connected ? "Connected" : "Not connected"}`}
                    tone={data.google_connected ? "emerald" : "slate"}
                    icon={<MerchantIcon />}
                  />
                ) : null}
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-7 app-muted">
                A polished storefront report that combines public trust evidence, business identity,
                recommendation logic, and connected sources when available.
              </p>
            </div>
            <SemiCircleGauge score={score} />
          </div>
        </div>

        {pagesScanned === 0 && (
          <div className="mt-6 rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm font-semibold text-amber-800">This website could not be fully scanned</p>
            <p className="mt-2 text-sm text-amber-700">
              The site returned no readable content. This usually means it is built with JavaScript rendering (React, Angular, Vue) or actively blocks automated crawlers. The findings below are based on very limited data and may not reflect the actual state of the site.
            </p>
            <p className="mt-2 text-sm text-amber-700">
              Try the full scan with Google connection for deeper analysis, or contact support if this seems incorrect.
            </p>
          </div>
        )}

        {showBusinessIdentity && businessFingerprint ? (
          <div className="mt-7 app-frame rounded-[32px] p-6 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="app-section-label">Business identity</p>
                <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-slate-900 sm:text-xl">Live storefront fingerprint</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <BrandBadge label={businessFingerprint.platform ?? "Platform unknown"} tone="emerald" icon={<ShopifyIcon />} />
                <BrandBadge label={displaySiteType} tone="blue" icon={<TrustIcon />} />
              </div>
            </div>
            <p className="mt-2 text-sm app-muted">
              This is what we scanned — detected from your live website before analysis. Use it to confirm we hit the right business.
            </p>
            <div className="mt-5 divide-y divide-slate-100 rounded-[24px] border border-slate-200 bg-white px-4">
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs uppercase tracking-wide font-semibold text-slate-400">Business name</span>
                <span className="text-sm break-all text-slate-900 sm:text-right">{businessFingerprint.businessName ?? "—"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs uppercase tracking-wide font-semibold text-slate-400">Email found</span>
                <span className="text-sm break-all text-slate-900 sm:text-right">{businessFingerprint.email ?? "—"}</span>
              </div>
              {(businessFingerprint.emails?.length ?? 0) > 1 && (
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                  <span className="text-xs uppercase tracking-wide font-semibold text-slate-400">All emails</span>
                  <span className="text-sm break-all text-slate-900 sm:text-right">{businessFingerprint.emails!.join(", ")}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs uppercase tracking-wide font-semibold text-slate-400">Phone found</span>
                <span className="text-sm break-all text-slate-900 sm:text-right">{businessFingerprint.phone ?? "—"}</span>
              </div>
              {(businessFingerprint.phones?.length ?? 0) > 1 && (
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                  <span className="text-xs uppercase tracking-wide font-semibold text-slate-400">All phones</span>
                  <span className="text-sm break-all text-slate-900 sm:text-right">{businessFingerprint.phones!.join(", ")}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs uppercase tracking-wide font-semibold text-slate-400">Platform detected</span>
                <span className="text-sm text-slate-900 sm:text-right">{businessFingerprint.platform ?? "—"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs uppercase tracking-wide font-semibold text-slate-400">Site type</span>
                <span className="text-sm text-slate-900 sm:text-right">{displaySiteType}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs uppercase tracking-wide font-semibold text-slate-400">Address hint</span>
                <span className="text-sm break-all text-slate-900 sm:text-right">{businessFingerprint.address ?? "—"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs uppercase tracking-wide font-semibold text-slate-400">Language / country / currency</span>
                <span className="text-sm text-slate-900 sm:text-right">
                  {[businessFingerprint.language, businessFingerprint.country, businessFingerprint.currency]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {isFree ? (
          <div className="mt-6 app-frame rounded-[32px] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="app-section-label">Upgrade to full scan</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-900">$99 connected diagnosis</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <BrandBadge
                  label={`Google ${data.google_connected || googleConnectedParam ? "Connected" : "Required"}`}
                  tone={data.google_connected || googleConnectedParam ? "emerald" : "slate"}
                  icon={<MerchantIcon />}
                />
                <BrandBadge
                  label={`Shopify ${shopifyConnected ? "Connected" : "Optional"}`}
                  tone={shopifyConnected ? "emerald" : "slate"}
                  icon={<ShopifyIcon />}
                />
                <BrandBadge label="Google Ads" tone="amber" icon={<AdsIcon />} />
              </div>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-7 app-muted">
              Move from public warning signs into the connected recovery workflow: real Google evidence, optional Shopify store data, and deeper consistency analysis before the next review or appeal.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                "See what Google data says, not just what the public site shows",
                "Compare website signals against connected store and account data",
                "Turn the scan into a serious repair workflow for blocked or risky stores",
              ].map((item) => (
                <div key={item} className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={onConnectGoogle}
                className="app-button-primary h-11 px-5 text-sm font-semibold"
              >
                {data.google_connected || googleConnectedParam ? "Reconnect Google" : "Connect Google"}
              </button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  placeholder="store.myshopify.com"
                  className="app-input h-11 flex-1 px-4 text-sm outline-none focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={onConnectShopify}
                  className="app-button-secondary h-11 px-5 text-sm font-semibold"
                >
                  {shopifyConnected ? "Reconnect Shopify" : "Connect Shopify"}
                </button>
              </div>
              <button
                type="button"
                onClick={onStartFullScan}
                disabled={!data.google_connected && !googleConnectedParam}
                className={[
                  "h-11 rounded-[18px] px-5 font-semibold transition-colors",
                  !data.google_connected && !googleConnectedParam
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "app-button-primary",
                ].join(" ")}
              >
                Start Full Scan
              </button>
              {connectError ? <p className="text-sm text-red-500">{connectError}</p> : null}
            </div>
          </div>
        ) : null}

        {googleConnectedParam ? (
          <div className="mt-6 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Google connected successfully. Continuing with paid scan data sources.
          </div>
        ) : null}
        {googleErrorParam ? (
          <div className="mt-6 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Google connection warning: {googleErrorParam}
          </div>
        ) : null}
        {shopifyConnectedParam ? (
          <div className="mt-6 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Shopify connected successfully. Full scan can now include store-side data.
          </div>
        ) : null}
        {shopifyErrorParam ? (
          <div className="mt-6 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Shopify connection warning: {shopifyErrorParam}
          </div>
        ) : null}

        <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7">
          <h2 className="app-title text-lg font-semibold tracking-[-0.02em] sm:text-xl">
            {isFree ? "Public Scan Summary" : "Executive Summary"}
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{summaryHeadline}</p>
        </div>

        {isFree ? (
          <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="app-title text-lg font-semibold tracking-[-0.02em] sm:text-xl">Public Scan Coverage</h2>
                <p className="mt-2 text-sm app-muted">
                  What the free scanner actually collected before generating recommendations.
                </p>
              </div>
              <span className="app-chip text-xs font-semibold">
                Crawl + PageSpeed
              </span>
            </div>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {coverageCards.map((card) => (
                <div key={card.label} className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">{card.hint}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isFree && (data.crawl.pages?.length ?? 0) > 0 ? (
          <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="app-title text-lg font-semibold tracking-[-0.02em] sm:text-xl">Pages We Scanned</h2>
                <p className="mt-2 text-sm app-muted">
                  These are the public pages we actually read before generating the report.
                </p>
              </div>
              <span className="app-chip text-xs font-semibold">
                {data.crawl.pages?.length ?? 0} pages
              </span>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3">
              {(data.crawl.pages ?? []).map((pageItem) => (
                <div key={pageItem.url} className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900 break-all">{pageItem.url}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    {pageItem.text.slice(0, 180)}
                    {pageItem.text.length > 180 ? "..." : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isFree ? (
          <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="app-title text-lg font-semibold tracking-[-0.02em] sm:text-xl">Detected Trust Signals</h2>
                <p className="mt-2 text-sm app-muted">
                  A quick view of which public trust pages and storefront signals were visibly detected.
                </p>
              </div>
              <span className="app-chip text-xs font-semibold">Public evidence</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {trustSignals.map((signal) => (
                <div
                  key={signal.label}
                  className={[
                    "rounded-[20px] border px-4 py-4",
                    signal.found ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
                  ].join(" ")}
                >
                  <p className="text-sm font-semibold text-slate-900">{signal.label}</p>
                  <p className={`mt-2 text-xs font-semibold ${signal.found ? "text-emerald-700" : "text-amber-700"}`}>
                    {signal.found ? "Detected" : "Not clearly detected"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7">
          <div className="flex items-center justify-between">
            <h2 className="app-title text-lg font-semibold tracking-[-0.02em] sm:text-xl">
              {isFree ? "Top Public Findings" : "Critical Findings"}
            </h2>
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
              {findings.length} items
            </span>
          </div>
          <div className="mt-4 space-y-4">
            {findings.length === 0 ? (
              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-900">No confirmed public issues were flagged in this pass.</p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  The public-facing basics look reasonably complete from the evidence collected here. The full scan is where we validate deeper account-level and cross-platform risks.
                </p>
              </div>
            ) : findings.map((item) => (
              <div key={item.item_id} className="rounded-[24px] border border-red-200 bg-red-50/70">
                <button type="button" onClick={() => setExpandedCriticalId((curr) => (curr === String(item.item_id) ? "" : String(item.item_id)))} className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left">
                  <div>
                    <div className="text-sm font-semibold text-red-700">
                      {item.title} <span className="opacity-70">• Rule {item.item_id}</span>
                    </div>
                    <p className="mt-2 text-sm text-red-600/90">{item.problem}</p>
                  </div>
                  <span className="font-bold text-red-500">{expandedCriticalId === String(item.item_id) ? "—" : "+"}</span>
                </button>
                {expandedCriticalId === String(item.item_id) ? (
                  <div className="px-4 pb-4 pt-1 text-sm text-slate-700">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Evidence</p>
                    <p className="mt-1">{item.evidence}</p>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Fix</p>
                    <p className="mt-1">{item.fix}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {quickWins.length > 0 ? (
          <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="app-title text-lg font-semibold tracking-[-0.02em] sm:text-xl">
                  {isFree ? "Recommended Quick Wins" : "Priority Recommendations"}
                </h2>
                <p className="mt-2 text-sm app-muted">
                  {isFree
                    ? "These are the highest-leverage improvements based on public site signals."
                    : "Next steps to reduce risk and improve account readiness."}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {quickWins.map((item) => (
                <div key={`${item.item_id}-${item.title}`} className="rounded-[24px] border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.why}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Benefit</p>
                  <p className="mt-1 text-sm text-slate-600">{item.benefit}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isFree ? (
          <div className="mt-7 grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="relative app-panel rounded-[32px] overflow-hidden p-6 sm:p-7">
              <div className="blur-[2px] pointer-events-none select-none opacity-60">
                <h2 className="app-title text-lg font-semibold sm:text-xl">Google Consistency Matrix</h2>
                <p className="mt-2 text-sm app-muted">Website vs GMC vs public Google signals vs Shopify mismatch analysis.</p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-white/75">
                <span className="app-chip text-sm font-semibold">
                  Locked in free scan
                </span>
              </div>
            </div>
            <div className="relative app-panel rounded-[32px] overflow-hidden p-6 sm:p-7">
              <div className="blur-[2px] pointer-events-none select-none opacity-60">
                <h2 className="app-title text-lg font-semibold sm:text-xl">77-Rule Compliance Breakdown</h2>
                <p className="mt-2 text-sm app-muted">Full pass/fail/warning mapping for every checklist rule.</p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-white/75">
                <span className="app-chip text-sm font-semibold">
                  Upgrade required
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {(() => {
              const ci = data.analysis.consistency_issues;
              const isNa = (v: string) => !v || v === "N/A" || /^N\/A/i.test(v);
              const allNa = ci.length === 0 || ci.every(
                (r) => isNa(r.gmc) && isNa(r.gmb) && isNa(r.shopify) && r.status === "unknown"
              );
              const renderCell = (val: string) => {
                if (isNa(val)) return <span className="text-slate-400 italic text-xs">Not connected</span>;
                return val;
              };

              return (
                <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7">
                  <h2 className="app-title text-lg font-semibold tracking-[-0.02em] sm:text-xl">Consistency Issues</h2>
                  {allNa ? (
                    <p className="mt-4 text-sm text-slate-500">
                      No cross-source comparison available. Connect Google Merchant Center or Shopify to compare business details across platforms and detect mismatches.
                    </p>
                  ) : (
                    <div className="mt-5 overflow-auto">
                      <table className="w-full min-w-[720px] border-separate border-spacing-0">
                        <thead>
                          <tr className="text-left">
                            <th className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Field</th>
                            <th className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Website</th>
                            <th className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">GMC</th>
                            <th className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Public / OSINT</th>
                            <th className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">Shopify</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ci.map((row, idx) => {
                            const cellClass =
                              row.status === "match"
                                ? "bg-emerald-50 text-emerald-700"
                                : row.status === "mismatch"
                                ? "bg-red-50 text-red-700"
                                : "bg-slate-50 text-slate-600";
                            return (
                              <tr key={`${row.field}-${idx}`}>
                                <td className="px-3 py-2 align-top text-sm font-semibold text-slate-900">{row.field}</td>
                                <td className={`px-3 py-2 text-sm rounded-lg ${cellClass}`}>{renderCell(row.website)}</td>
                                <td className={`px-3 py-2 text-sm rounded-lg ${cellClass}`}>{renderCell(row.gmc)}</td>
                                <td className={`px-3 py-2 text-sm rounded-lg ${cellClass}`}>{renderCell(row.gmb)}</td>
                                <td className={`px-3 py-2 text-sm rounded-lg ${cellClass}`}>{renderCell(row.shopify)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {(() => {
              // Build flat rule-text lookup: { [id]: { text, sectionTitle } }
              const ruleMap: Record<number, { text: string; sectionTitle: string }> = {};
              for (const section of CHECKLIST) {
                for (const item of section.items) {
                  ruleMap[item.id] = { text: item.text, sectionTitle: section.title };
                }
              }
              // Build critical_issues lookup by item_id
              const issueMap: Record<number, typeof data.analysis.critical_issues[number]> = {};
              for (const issue of data.analysis.critical_issues) {
                if (issue.item_id) issueMap[issue.item_id] = issue;
              }
              // Separate entries
              const failEntries = checklistEntries.filter(([, r]) => r === "fail" || r === "warning");
              const passCount = checklistEntries.filter(([, r]) => r === "pass").length;
              const unknownCount = checklistEntries.filter(([, r]) => r === "unknown").length;

              if (failEntries.length === 0 && passCount === 0) return null;

              return (
                <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="app-section-label">Compliance Findings</p>
                      <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-900 sm:text-xl">
                        {failEntries.length > 0
                          ? `${failEntries.length} rule${failEntries.length !== 1 ? "s" : ""} need attention`
                          : "All checked rules passed"}
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {failEntries.filter(([,r]) => r === "fail").length > 0 && (
                        <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">
                          {failEntries.filter(([,r]) => r === "fail").length} failed
                        </span>
                      )}
                      {failEntries.filter(([,r]) => r === "warning").length > 0 && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
                          {failEntries.filter(([,r]) => r === "warning").length} warnings
                        </span>
                      )}
                      {passCount > 0 && (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
                          {passCount} passed
                        </span>
                      )}
                      {unknownCount > 0 && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-500" title="Rules that could not be verified — insufficient data or disconnected source">
                          {unknownCount} unknown
                        </span>
                      )}
                    </div>
                  </div>

                  {failEntries.length > 0 ? (
                    <div className="mt-5 flex flex-col gap-4">
                      {failEntries.map(([idStr, result]) => {
                        const id = Number(idStr);
                        const rule = ruleMap[id];
                        const issue = issueMap[id];
                        const isFail = result === "fail";
                        return (
                          <div
                            key={idStr}
                            className={`rounded-[22px] border p-4 ${
                              isFail
                                ? "border-red-200 bg-red-50"
                                : "border-amber-200 bg-amber-50"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${isFail ? "bg-red-200 text-red-700" : "bg-amber-200 text-amber-700"}`}>
                                {isFail ? "✗" : "!"}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${isFail ? "text-red-800" : "text-amber-800"}`}>
                                  {rule ? rule.text : `Rule ${id}`}
                                </p>
                                {rule && (
                                  <p className="mt-0.5 text-xs text-slate-500">{rule.sectionTitle}</p>
                                )}
                                {issue && (
                                  <>
                                    <p className="mt-2 text-sm text-slate-700">{issue.problem}</p>
                                    {issue.why_it_matters && (
                                      <p className={`mt-2 rounded-[10px] px-3 py-2 text-xs font-medium ${isFail ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                                        <span className="font-bold">Why this matters: </span>{issue.why_it_matters}
                                      </p>
                                    )}
                                    <blockquote className="mt-2 rounded-[10px] border-l-4 border-slate-300 bg-white px-3 py-2 text-xs italic text-slate-600">
                                      <span className="not-italic font-semibold text-slate-500 block mb-1">Evidence:</span>
                                      {issue.evidence}
                                    </blockquote>
                                    <p className="mt-2 rounded-[10px] bg-white px-3 py-2 text-xs text-slate-700">
                                      <span className="font-semibold">Fix: </span>{issue.fix}
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-emerald-700">All checked compliance rules passed for this scan.</p>
                  )}
                </div>
              );
            })()}

            {data.analysis.suspension_reason && (
              <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7 border border-red-200 bg-red-50">
                <p className="app-section-label text-red-600">Primary Suspension Diagnosis</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-red-900 sm:text-xl">
                  Most Likely Cause of Suspension
                </h2>
                <p className="mt-3 text-sm leading-7 text-red-800">
                  {data.analysis.suspension_reason}
                </p>
              </div>
            )}

            {data.analysis.appeal_tip ? (
              <div className="mt-7 app-panel rounded-[32px] p-6 sm:p-7">
                <p className="app-section-label">Next Steps</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-900 sm:text-xl">
                  Your Appeal Strategy
                </h2>
                <p className="mt-2 text-sm app-muted">
                  A tailored, step-by-step strategy for submitting your appeal or compliance review to Google — based on the evidence found in this scan.
                </p>
                <div className="mt-5 rounded-[22px] border border-blue-200 bg-blue-50 px-5 py-4 text-sm leading-7 text-blue-900 whitespace-pre-line">
                  {data.analysis.appeal_tip}
                </div>
              </div>
            ) : null}
          </>
        )}

        <div className="mt-7 app-frame rounded-[32px] p-6 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="app-title text-lg font-semibold tracking-[-0.02em] sm:text-xl">PageSpeed</h2>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                pagespeedUnavailable
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : pagespeedCached
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {pagespeedSnapshotLabel}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pagespeedCards.map((m) => {
              const color = metricColor(m.label, m.rawValue);
              const cls = colorClasses(color);
              return (
                <div key={m.label} className={["rounded-2xl border px-4 py-4", cls.border, cls.bg, "ring-1", cls.ring].join(" ")}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{m.label}</p>
                    <span className={`h-2 w-2 rounded-full ${cls.dot}`} />
                  </div>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">{m.valueLabel}</p>
                  {m.hint ? <p className={`mt-2 text-xs ${cls.text} leading-relaxed`}>{m.hint}</p> : null}
                </div>
              );
            })}
          </div>
          {pagespeedRefreshState === "refreshing" ? (
            <p className="mt-4 text-sm text-blue-700">Loading PageSpeed data...</p>
          ) : pagespeedUnavailable ? (
            <p className="mt-4 text-sm text-amber-700">
              PageSpeed data could not be collected for this site. Performance metrics are not available.
            </p>
          ) : pagespeedCached ? (
            <p className="mt-4 text-sm text-blue-700">
              Showing a recent cached PageSpeed snapshot.
            </p>
          ) : null}
          {data.pagespeed.opportunities && data.pagespeed.opportunities.length > 0 && data.pagespeed.opportunities[0] !== "No major optimization opportunities detected." ? (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Top Optimization Opportunities</p>
              <ul className="mt-2 space-y-1.5">
                {data.pagespeed.opportunities.map((opp, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                    {opp}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<LoadingState scanType="free" />}>
      <ReportPageClient />
    </Suspense>
  );
}

