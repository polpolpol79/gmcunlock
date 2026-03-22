"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
};

type SiteFingerprint = {
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
  appeal_tip: string;
};

type ScanPayload = {
  scan_id?: string | null;
  scan_type: ScanType;
  google_connected: boolean;
  url?: string;
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
  useEffect(() => {
    const i = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(i);
  }, []);

  const elapsed = Math.floor((Date.now() - pollState.startedAt) / 1000);
  const steps =
    pollState.scanType === "paid"
      ? [
          { key: "queued", label: "Starting" },
          { key: "pagespeed_crawl", label: "PageSpeed & site crawl" },
          { key: "google_shopify", label: "Google & Shopify" },
          { key: "analysis", label: "AI compliance review" },
          { key: "persist", label: "Saving report" },
          { key: "done", label: "Done" },
        ]
      : [
          { key: "queued", label: "Starting" },
          { key: "pagespeed_crawl", label: "PageSpeed & site crawl" },
          { key: "analysis", label: "AI compliance review" },
          { key: "persist", label: "Saving report" },
          { key: "done", label: "Done" },
        ];

  const currentIdx = phaseStepIndex(pollState.phase, pollState.scanType);

  return (
    <div dir="ltr" className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="rounded-3xl border border-indigo-500/30 bg-indigo-500/[0.07] p-8 sm:p-10">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-40" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-400" />
            </span>
            <h1 className="text-2xl font-bold text-indigo-100">
              {pollState.scanType === "paid" ? "Full scan" : "Free scan"} in progress
            </h1>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            <span className="sr-only" aria-live="polite">
              {tick}
            </span>
            Elapsed {elapsed}s — you can keep this tab open; we update live as each stage finishes.
          </p>
          {scanUrl ? (
            <p className="mt-3 text-sm text-zinc-300 break-all">
              <span className="text-zinc-500">Target: </span>
              {scanUrl}
            </p>
          ) : null}

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current step</p>
            <p className="mt-1 text-lg font-semibold text-white">{pollState.phaseLabel}</p>
            <p className="mt-2 text-sm text-zinc-300 leading-relaxed">{pollState.detail}</p>
          </div>

          <ol className="mt-8 space-y-3">
            {steps.map((step, idx) => {
              const done = idx < currentIdx;
              const active = idx === currentIdx;
              return (
                <li
                  key={step.key}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                    active
                      ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-100"
                      : done
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100/90"
                        : "border-white/5 bg-white/[0.02] text-zinc-500"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-emerald-500/30 text-emerald-100"
                        : active
                          ? "bg-indigo-500/40 text-white"
                          : "bg-white/10 text-zinc-500"
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

function scoreToColor(score: number) {
  if (score < 50) return "red";
  if (score <= 89) return "yellow";
  return "green";
}

function colorClasses(color: "red" | "yellow" | "green") {
  switch (color) {
    case "red":
      return { ring: "ring-red-500/30", border: "border-red-500/30", bg: "bg-red-500/10", text: "text-red-200", dot: "bg-red-400" };
    case "yellow":
      return { ring: "ring-yellow-500/30", border: "border-yellow-500/30", bg: "bg-yellow-500/10", text: "text-yellow-200", dot: "bg-yellow-400" };
    case "green":
      return { ring: "ring-emerald-500/30", border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-200", dot: "bg-emerald-400" };
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
            <linearGradient id="dangerGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ef4444" />
              <stop offset="1" stopColor="#fb7185" />
            </linearGradient>
          </defs>
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#dangerGrad)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${filled} ${remaining}`} />
          <text x="100" y="95" textAnchor="middle" fill="white" fontSize="26" fontWeight="800">{score}</text>
          <text x="100" y="106" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="10" fontWeight="700">score</text>
        </svg>
      </div>
    </div>
  );
}

function LoadingState({ scanType }: { scanType: ScanType }) {
  return (
    <div dir="ltr" className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <h1 className="text-2xl font-bold">
            Running {scanType === "paid" ? "full" : "free"} scan...
          </h1>
          <p className="mt-2 text-zinc-300">
            {scanType === "paid"
              ? "Collecting PageSpeed, crawl, Google, and Shopify signals."
              : "Collecting PageSpeed + basic crawl signals for a quick risk snapshot."}
          </p>
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
  const profile = useMemo(() => parseProfileFromQuery(searchParams), [searchParams]);
  const [shopDomain, setShopDomain] = useState(searchParams.get("shop")?.trim() ?? "");
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [connectError, setConnectError] = useState("");

  function buildPaidReturnToPath() {
    const qs = new URLSearchParams();
    if (scanId) qs.set("scan_id", scanId);
    const chosenUrl = url || scanUrl || data?.url || "";
    if (chosenUrl) qs.set("url", chosenUrl);
    qs.set("scan_type", "paid");
    qs.set("business_type", profile.business_type);
    qs.set("platform", profile.platform);
    qs.set("blocked_where", profile.blocked_where);
    qs.set("has_gmb", String(profile.has_gmb));
    if (shopDomain.trim()) qs.set("shop", shopDomain.trim());
    return `/report?${qs.toString()}`;
  }

  function buildCurrentReturnPath() {
    const qs = new URLSearchParams();
    if (scanId) qs.set("scan_id", scanId);
    const chosenUrl = url || scanUrl || data?.url || "";
    if (chosenUrl) qs.set("url", chosenUrl);
    qs.set("scan_type", queryScanType);
    qs.set("business_type", profile.business_type);
    qs.set("platform", profile.platform);
    qs.set("blocked_where", profile.blocked_where);
    qs.set("has_gmb", String(profile.has_gmb));
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
    return () => ac.abort();
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
      let body: Record<string, unknown> = { url, profile };
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
        router.replace(`/report/${payload.scan_id}`);
        return;
      }
      const complete = payload as ScanPayload;
      setScanUrl(url);
      setData(complete);
      setExpandedCriticalId(complete.analysis.critical_issues[0]?.item_id?.toString() ?? "");
      if (complete.scan_id) {
        router.replace(`/report/${complete.scan_id}`);
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
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };
  }, [scanId, url, queryScanType, profile, router]);

  useEffect(() => {
    if (!pollState?.scanId) return;
    const id = pollState.scanId;
    const ac = new AbortController();
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function tick() {
      try {
        const st = await fetch(`/api/scan/status/${encodeURIComponent(id)}`, { signal: ac.signal });
        const sj = (await st.json()) as ScanStatusApiResponse;
        if (ac.signal.aborted) return;
        if (!st.ok || !sj.ok) return;

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
          if (!full.ok || !fj.ok) return;
          setPollState(null);
          setScanUrl(fj.data.url);
          setData({
            scan_id: fj.data.scan_id,
            scan_type: fj.data.scan_type ?? "free",
            google_connected: fj.data.google_connected ?? false,
            url: fj.data.url,
            fingerprint: fj.data.fingerprint ?? fj.data.crawl?.fingerprint ?? null,
            pagespeed: fj.data.pagespeed,
            crawl: fj.data.crawl,
            analysis: fj.data.analysis,
          });
          setExpandedCriticalId(fj.data.analysis.critical_issues[0]?.item_id?.toString() ?? "");
          router.replace(`/report/${fj.data.scan_id}`);
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
      ac.abort();
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollState?.scanId, router]);

  if (pollState) {
    return <ScanProgressPanel pollState={pollState} scanUrl={scanUrl} />;
  }

  if (loading) return <LoadingState scanType={queryScanType} />;

  if (error || !data) {
    return (
      <div dir="ltr" className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-8">
            <h1 className="text-2xl font-bold text-red-200">Scan failed</h1>
            <p className="mt-2 text-red-100/90">{error ?? "No data returned from scan."}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 h-11 px-5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 transition-colors">
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
  const showBusinessIdentity =
    businessFingerprint &&
    Object.values(businessFingerprint).some((v) => v != null && String(v).trim() !== "");
  const pagesScanned = data.crawl.pages?.length ?? 0;
  const internalLinksFound = data.crawl.allLinksFound?.length ?? 0;
  const quickWins = data.analysis.recommendations.slice(0, isFree ? 5 : 3);
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
    <div dir="ltr" className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-zinc-400">Scanned URL</p>
              <h1 className="mt-2 break-all text-xl sm:text-2xl font-bold">{scanUrl || data.url || "—"}</h1>
              <div className="mt-4 flex flex-wrap gap-3">
                <span className="inline-flex items-center rounded-full border border-indigo-500/25 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200">
                  {isFree ? "FREE PUBLIC SCAN" : "PAID FULL SCAN"}
                </span>
                {!isFree ? (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300">
                    Google: {data.google_connected ? "Connected" : "Not connected"}
                  </span>
                ) : null}
              </div>
            </div>
            <SemiCircleGauge score={score} />
          </div>
        </div>

        {showBusinessIdentity && businessFingerprint ? (
          <div className="mt-7 rounded-3xl border border-emerald-500/25 bg-emerald-500/[0.07] p-6 sm:p-7">
            <h2 className="text-lg sm:text-xl font-bold text-emerald-100">Business Identity</h2>
            <p className="mt-2 text-sm text-zinc-300">
              This is what we scanned — detected from your live website before analysis. Use it to confirm we hit the right business.
            </p>
            <div className="mt-5 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.03] px-4">
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Business name</span>
                <span className="text-sm text-zinc-100 break-all sm:text-right">{businessFingerprint.businessName ?? "—"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Email found</span>
                <span className="text-sm text-zinc-100 break-all sm:text-right">{businessFingerprint.email ?? "—"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Phone found</span>
                <span className="text-sm text-zinc-100 break-all sm:text-right">{businessFingerprint.phone ?? "—"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Platform detected</span>
                <span className="text-sm text-zinc-100 sm:text-right">{businessFingerprint.platform ?? "—"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Site type detected</span>
                <span className="text-sm text-zinc-100 sm:text-right">{businessFingerprint.siteType ?? "—"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Address hint</span>
                <span className="text-sm text-zinc-100 break-all sm:text-right">{businessFingerprint.address ?? "—"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Language / country / currency</span>
                <span className="text-sm text-zinc-100 sm:text-right">
                  {[businessFingerprint.language, businessFingerprint.country, businessFingerprint.currency]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {isFree ? (
          <div className="mt-6 rounded-3xl border border-indigo-500/25 bg-indigo-500/10 p-6">
            <h2 className="text-xl font-bold text-indigo-100">Upgrade to Full Scan — $99</h2>
            <p className="mt-2 text-zinc-200/90">
              Unlock real Google evidence, optional Shopify store data, the full 77-rule engine, and cross-source consistency diagnostics.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-3 py-1 ${data.google_connected || googleConnectedParam ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-zinc-300"}`}>
                Google: {data.google_connected || googleConnectedParam ? "Connected" : "Required"}
              </span>
              <span className={`rounded-full border px-3 py-1 ${shopifyConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-zinc-300"}`}>
                Shopify: {shopifyConnected ? "Connected" : "Optional"}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={onConnectGoogle}
                className="h-11 px-5 rounded-xl font-semibold bg-indigo-500 hover:bg-indigo-400 text-zinc-950 transition-colors"
              >
                {data.google_connected || googleConnectedParam ? "Reconnect Google" : "Connect Google"}
              </button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  placeholder="store.myshopify.com"
                  className="h-11 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
                />
                <button
                  type="button"
                  onClick={onConnectShopify}
                  className="h-11 rounded-xl border border-white/15 bg-white/[0.05] px-5 font-semibold text-zinc-100 hover:bg-white/[0.1] transition-colors"
                >
                  {shopifyConnected ? "Reconnect Shopify" : "Connect Shopify"}
                </button>
              </div>
              <button
                type="button"
                onClick={onStartFullScan}
                disabled={!data.google_connected && !googleConnectedParam}
                className={[
                  "h-11 rounded-xl px-5 font-semibold transition-colors",
                  !data.google_connected && !googleConnectedParam
                    ? "bg-white/10 text-zinc-400 cursor-not-allowed"
                    : "bg-white text-zinc-950 hover:bg-zinc-200",
                ].join(" ")}
              >
                Start Full Scan
              </button>
              {connectError ? <p className="text-sm text-red-300">{connectError}</p> : null}
            </div>
          </div>
        ) : null}

        {googleConnectedParam ? (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Google connected successfully. Continuing with paid scan data sources.
          </div>
        ) : null}
        {googleErrorParam ? (
          <div className="mt-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
            Google connection warning: {googleErrorParam}
          </div>
        ) : null}
        {shopifyConnectedParam ? (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Shopify connected successfully. Full scan can now include store-side data.
          </div>
        ) : null}
        {shopifyErrorParam ? (
          <div className="mt-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
            Shopify connection warning: {shopifyErrorParam}
          </div>
        ) : null}

        <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-7">
          <h2 className="text-lg sm:text-xl font-bold">
            {isFree ? "Public Scan Summary" : "Executive Summary"}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-100/90">{data.analysis.headline}</p>
        </div>

        {isFree ? (
          <div className="mt-7 rounded-3xl border border-cyan-500/25 bg-cyan-500/[0.06] p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-cyan-100">Public Scan Coverage</h2>
                <p className="mt-2 text-sm text-zinc-300">
                  What the free scanner actually collected before generating recommendations.
                </p>
              </div>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                Crawl + PageSpeed
              </span>
            </div>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {coverageCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-extrabold text-white">{card.value}</p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-300">{card.hint}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-7">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-bold text-red-200">
              {isFree ? "Top Public Findings" : "Critical Findings"}
            </h2>
            <span className="text-xs text-red-300 border border-red-500/30 bg-red-500/10 rounded-full px-3 py-1 font-semibold">
              {findings.length} items
            </span>
          </div>
          <div className="mt-4 space-y-4">
            {findings.map((item) => (
              <div key={item.item_id} className="rounded-2xl border border-red-500/25 bg-red-500/10">
                <button type="button" onClick={() => setExpandedCriticalId((curr) => (curr === String(item.item_id) ? "" : String(item.item_id)))} className="w-full text-left px-4 py-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-red-100">
                      {item.title} <span className="opacity-70">• Rule {item.item_id}</span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-100/90">{item.problem}</p>
                  </div>
                  <span className="text-zinc-200/80 font-bold">{expandedCriticalId === String(item.item_id) ? "—" : "+"}</span>
                </button>
                {expandedCriticalId === String(item.item_id) ? (
                  <div className="px-4 pb-4 pt-1 text-sm text-zinc-100/90">
                    <p className="text-xs text-zinc-300 uppercase tracking-wide font-bold">Evidence</p>
                    <p className="mt-1">{item.evidence}</p>
                    <p className="mt-3 text-xs text-zinc-300 uppercase tracking-wide font-bold">Fix</p>
                    <p className="mt-1">{item.fix}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {quickWins.length > 0 ? (
          <div className="mt-7 rounded-3xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-emerald-100">
                  {isFree ? "Recommended Quick Wins" : "Priority Recommendations"}
                </h2>
                <p className="mt-2 text-sm text-zinc-300">
                  {isFree
                    ? "These are the highest-leverage improvements based on public site signals."
                    : "Next steps to reduce risk and improve account readiness."}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {quickWins.map((item) => (
                <div key={`${item.item_id}-${item.title}`} className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <p className="text-sm font-semibold text-emerald-100">{item.title}</p>
                  <p className="mt-3 text-sm text-zinc-200/90">{item.why}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Benefit</p>
                  <p className="mt-1 text-sm text-zinc-300">{item.benefit}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isFree ? (
          <div className="mt-7 grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-7 overflow-hidden">
              <div className="blur-[2px] pointer-events-none select-none opacity-60">
                <h2 className="text-lg sm:text-xl font-bold">Google Consistency Matrix</h2>
                <p className="mt-2 text-sm text-zinc-300">Website vs GMC vs GMB vs Shopify mismatch analysis.</p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60">
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-200">
                  Locked in free scan
                </span>
              </div>
            </div>
            <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-7 overflow-hidden">
              <div className="blur-[2px] pointer-events-none select-none opacity-60">
                <h2 className="text-lg sm:text-xl font-bold">77-Rule Compliance Breakdown</h2>
                <p className="mt-2 text-sm text-zinc-300">Full pass/fail/warning mapping for every checklist rule.</p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60">
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-200">
                  Upgrade required
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-7">
              <h2 className="text-lg sm:text-xl font-bold">Consistency Issues</h2>
              <div className="mt-5 overflow-auto">
                <table className="w-full min-w-[720px] border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left">
                      <th className="text-xs uppercase tracking-wide text-zinc-400 font-bold px-3 py-3">Field</th>
                      <th className="text-xs uppercase tracking-wide text-zinc-400 font-bold px-3 py-3">Website</th>
                      <th className="text-xs uppercase tracking-wide text-zinc-400 font-bold px-3 py-3">GMC</th>
                      <th className="text-xs uppercase tracking-wide text-zinc-400 font-bold px-3 py-3">GMB</th>
                      <th className="text-xs uppercase tracking-wide text-zinc-400 font-bold px-3 py-3">Shopify</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.analysis.consistency_issues.map((row, idx) => {
                      const cellClass =
                        row.status === "match"
                          ? "bg-emerald-500/10 text-emerald-200"
                          : row.status === "mismatch"
                          ? "bg-red-500/10 text-red-200"
                          : "bg-white/5 text-zinc-300";
                      return (
                        <tr key={`${row.field}-${idx}`}>
                          <td className="px-3 py-2 text-sm font-semibold text-zinc-100/90 align-top">{row.field}</td>
                          <td className={`px-3 py-2 text-sm rounded-lg ${cellClass}`}>{row.website}</td>
                          <td className={`px-3 py-2 text-sm rounded-lg ${cellClass}`}>{row.gmc}</td>
                          <td className={`px-3 py-2 text-sm rounded-lg ${cellClass}`}>{row.gmb}</td>
                          <td className={`px-3 py-2 text-sm rounded-lg ${cellClass}`}>{row.shopify}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-7">
              <h2 className="text-lg sm:text-xl font-bold">Checklist Results (All 77 Rules)</h2>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {checklistEntries.slice(0, 77).map(([id, result]) => (
                  <div key={id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div className="text-xs text-zinc-400">Rule {id}</div>
                    <div className="mt-1 text-sm font-semibold">{result}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-7">
          <h2 className="text-lg sm:text-xl font-bold">PageSpeed</h2>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pagespeedCards.map((m) => {
              const color = metricColor(m.label, m.rawValue);
              const cls = colorClasses(color);
              return (
                <div key={m.label} className={["rounded-2xl border px-4 py-4", cls.border, cls.bg, "ring-1", cls.ring].join(" ")}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-zinc-100/90">{m.label}</p>
                    <span className={`h-2 w-2 rounded-full ${cls.dot}`} />
                  </div>
                  <p className="mt-3 text-3xl font-extrabold text-zinc-100">{m.valueLabel}</p>
                  {m.hint ? <p className={`mt-2 text-xs ${cls.text} leading-relaxed`}>{m.hint}</p> : null}
                </div>
              );
            })}
          </div>
          {data.pagespeed.opportunities && data.pagespeed.opportunities.length > 0 && data.pagespeed.opportunities[0] !== "No major optimization opportunities detected." ? (
            <div className="mt-5">
              <p className="text-xs text-zinc-400 uppercase tracking-wide font-bold">Top Optimization Opportunities</p>
              <ul className="mt-2 space-y-1.5">
                {data.pagespeed.opportunities.map((opp, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-200/90">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" />
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

