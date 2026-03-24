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

type BusinessType = "ecommerce" | "service_provider" | "leads_only" | "other";
type Platform = "shopify" | "woocommerce" | "wix" | "other";
type BlockedWhere = "merchant_center" | "google_ads" | "both" | "proactive";
type HasGmb = true | false | null;
type ConnectionStatusResponse =
  | { ok: true; connected?: boolean; shop?: string | null }
  | { ok: false; error?: string };

type Answers = {
  business_type: BusinessType | "";
  platform: Platform | "";
  blocked_where: BlockedWhere | "";
  has_gmb: HasGmb | undefined;
};

type OptionCardProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function OptionCard({ label, active, onClick }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left rounded-[24px] border px-5 py-5 transition-all duration-200",
        "bg-white border-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(15,23,42,0.08)]",
        active
          ? "border-blue-300 bg-[linear-gradient(180deg,#f8fbff,#eef4ff)] shadow-[0_22px_50px_rgba(37,99,235,0.12)]"
          : "",
        "focus:outline-none focus:ring-4 focus:ring-blue-100",
      ].join(" ")}
    >
      <span className="block text-base font-semibold text-slate-900">{label}</span>
    </button>
  );
}

function buildReportQuery(params: {
  url: string;
  scanType: "free" | "paid";
  answers: {
    business_type: BusinessType;
    platform: Platform;
    blocked_where: BlockedWhere;
    has_gmb: HasGmb;
  };
}) {
  const qs = new URLSearchParams();
  qs.set("url", params.url);
  qs.set("scan_type", params.scanType);
  qs.set("business_type", params.answers.business_type);
  qs.set("platform", params.answers.platform);
  qs.set("blocked_where", params.answers.blocked_where);
  qs.set("has_gmb", String(params.answers.has_gmb));
  return qs.toString();
}

function ScanPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlParam = useMemo(() => searchParams.get("url")?.trim() ?? "", [searchParams]);
  const queryAnswers = useMemo<Answers>(
    () => ({
      business_type:
        searchParams.get("business_type") === "ecommerce" ||
        searchParams.get("business_type") === "service_provider" ||
        searchParams.get("business_type") === "leads_only" ||
        searchParams.get("business_type") === "other"
          ? (searchParams.get("business_type") as BusinessType)
          : "",
      platform:
        searchParams.get("platform") === "shopify" ||
        searchParams.get("platform") === "woocommerce" ||
        searchParams.get("platform") === "wix" ||
        searchParams.get("platform") === "other"
          ? (searchParams.get("platform") as Platform)
          : "",
      blocked_where:
        searchParams.get("blocked_where") === "merchant_center" ||
        searchParams.get("blocked_where") === "google_ads" ||
        searchParams.get("blocked_where") === "both" ||
        searchParams.get("blocked_where") === "proactive"
          ? (searchParams.get("blocked_where") as BlockedWhere)
          : "",
      has_gmb:
        searchParams.get("has_gmb") === "true"
          ? true
          : searchParams.get("has_gmb") === "false"
            ? false
            : searchParams.get("has_gmb") === "null"
              ? null
              : undefined,
    }),
    [searchParams]
  );
  const hasFullProfile =
    queryAnswers.business_type !== "" &&
    queryAnswers.platform !== "" &&
    queryAnswers.blocked_where !== "" &&
    queryAnswers.has_gmb !== undefined;

  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3 | 4>(1);
  const [phase, setPhase] = useState<"onboarding" | "plan">(hasFullProfile ? "plan" : "onboarding");
  const [attemptedContinue, setAttemptedContinue] = useState(false);

  const [answers, setAnswers] = useState<Answers>(queryAnswers);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopDomain, setShopDomain] = useState(searchParams.get("shop")?.trim() ?? "");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    setAnswers(queryAnswers);
    if (hasFullProfile) setPhase("plan");
  }, [queryAnswers, hasFullProfile]);

  useEffect(() => {
    const ac = new AbortController();
    async function loadConnections() {
      try {
        const [googleRes, shopifyRes] = await Promise.all([
          fetch("/api/google", { signal: ac.signal }),
          fetch("/api/shopify", { signal: ac.signal }),
        ]);
        const googleJson = (await googleRes.json()) as ConnectionStatusResponse;
        const shopifyJson = (await shopifyRes.json()) as ConnectionStatusResponse;
        if (ac.signal.aborted) return;
        setGoogleConnected(Boolean(googleJson.ok && googleJson.connected));
        setShopifyConnected(Boolean(shopifyJson.ok && shopifyJson.connected));
        if (shopifyJson.ok && typeof shopifyJson.shop === "string" && shopifyJson.shop) {
          setShopDomain(shopifyJson.shop);
        }
      } catch {
        if (!ac.signal.aborted) {
          setGoogleConnected(false);
          setShopifyConnected(false);
        }
      }
    }
    void loadConnections();
    return () => ac.abort();
  }, []);

  function canContinueForStep(step: typeof onboardingStep) {
    if (step === 1) return answers.business_type !== "";
    if (step === 2) return answers.platform !== "";
    if (step === 3) return answers.blocked_where !== "";
    if (step === 4) return answers.has_gmb !== undefined;
    return false;
  }

  function onContinueQuestion() {
    setAttemptedContinue(true);
    if (!canContinueForStep(onboardingStep)) return;
    if (onboardingStep < 4) {
      setAttemptedContinue(false);
      setOnboardingStep((s) => (s + 1) as 2 | 3 | 4);
      return;
    }
    setAttemptedContinue(false);
    setPhase("plan");
  }

  function startFreeScan() {
    if (!urlParam) return;
    const query = buildReportQuery({
      url: urlParam,
      scanType: "free",
      answers: {
        business_type: (answers.business_type || "other") as BusinessType,
        platform: (answers.platform || "other") as Platform,
        blocked_where: (answers.blocked_where || "proactive") as BlockedWhere,
        has_gmb: (answers.has_gmb ?? null) as HasGmb,
      },
    });
    router.push(`/report?${query}`);
  }

  function buildSetupQuery(scanType: "free" | "paid") {
    const qs = new URLSearchParams();
    qs.set("url", urlParam);
    qs.set("scan_type", scanType);
    qs.set("business_type", String(answers.business_type || "other"));
    qs.set("platform", String(answers.platform || "other"));
    qs.set("blocked_where", String(answers.blocked_where || "proactive"));
    qs.set("has_gmb", String(answers.has_gmb ?? null));
    if (shopDomain.trim()) qs.set("shop", shopDomain.trim());
    qs.set("phase", "plan");
    return qs.toString();
  }

  function connectGoogle() {
    window.location.href = `/api/google/oauth/start?return_to=${encodeURIComponent(`/scan?${buildSetupQuery("paid")}`)}`;
  }

  function connectShopify() {
    const normalized = shopDomain.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
      setSetupError("Enter a valid Shopify domain like store.myshopify.com");
      return;
    }
    window.location.href = `/api/shopify/oauth/start?shop=${encodeURIComponent(normalized)}&return_to=${encodeURIComponent(`/scan?${buildSetupQuery("paid")}`)}`;
  }

  async function startPaidScan() {
    setSetupBusy(true);
    setSetupError("");
    try {
      if (!googleConnected) {
        throw new Error("Connect Google before starting the full scan.");
      }
      router.push(`/report?${buildReportQuery({
        url: urlParam,
        scanType: "paid",
        answers: {
          business_type: (answers.business_type || "other") as BusinessType,
          platform: (answers.platform || "other") as Platform,
          blocked_where: (answers.blocked_where || "proactive") as BlockedWhere,
          has_gmb: (answers.has_gmb ?? null) as HasGmb,
        },
      })}${shopDomain.trim() ? `&shop=${encodeURIComponent(shopDomain.trim())}` : ""}`);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : "Could not start full scan.");
    } finally {
      setSetupBusy(false);
    }
  }

  const onboardingProgressPct = onboardingStep * 25;

  return (
    <div dir="ltr" className="app-shell">
      <div className="app-container py-8 sm:py-10">
        <div className="app-frame rounded-[28px] px-5 py-4 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Image src="/logo-clean.png" alt="GMC Unlock" width={360} height={90} unoptimized className="h-9 w-auto" />
              <div>
                <p className="app-section-label">Scan setup</p>
                <h1 className="app-title mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                  Configure the scan like a premium client-ready audit
                </h1>
                <p className="mt-1 text-sm app-muted">Start with the public scan, then step into connected Google and Shopify evidence only when needed.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <BrandBadge label="Merchant" tone="blue" icon={<MerchantIcon />} />
              <BrandBadge label="Ads" tone="amber" icon={<AdsIcon />} />
              <BrandBadge label="Shopify" tone="emerald" icon={<ShopifyIcon />} />
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_38px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Target website</p>
              <p className="mt-1 break-all text-lg font-semibold text-slate-900">{urlParam || "—"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BrandBadge label="Public trust scan" tone="slate" icon={<TrustIcon />} />
              <BrandBadge label="Background PageSpeed" tone="blue" icon={<PageSpeedIcon />} />
            </div>
          </div>
        </div>

        {phase === "onboarding" ? (
          <>
            <div className="mt-7 app-frame rounded-[34px] p-6 sm:p-8">
              <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="app-section-label">Step {onboardingStep} of 4</p>
                  <h2 className="app-title mt-1 text-3xl font-semibold tracking-[-0.03em]">
                    Tell us a bit about the business
                  </h2>
                </div>
                <p className="text-sm app-muted">This helps us frame the free scan and the paid diagnosis correctly.</p>
              </div>
              <div className="h-3 rounded-full bg-slate-100 shadow-inner">
                <div
                  className="h-3 rounded-full bg-[linear-gradient(90deg,#2563eb,#60a5fa)]"
                  style={{ width: `${onboardingProgressPct}%` }}
                />
              </div>

              {onboardingStep === 1 && (
                <div className="mt-7 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] sm:p-7">
                <h2 className="text-2xl font-bold">What type of business do you have?</h2>
                <p className="mt-2 text-sm app-muted">Choose the business model we should optimize the experience for.</p>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <OptionCard
                    label="E-commerce store"
                    active={answers.business_type === "ecommerce"}
                    onClick={() => setAnswers((a) => ({ ...a, business_type: "ecommerce" }))}
                  />
                  <OptionCard
                    label="Service provider"
                    active={answers.business_type === "service_provider"}
                    onClick={() => setAnswers((a) => ({ ...a, business_type: "service_provider" }))}
                  />
                  <OptionCard
                    label="Leads / landing page only"
                    active={answers.business_type === "leads_only"}
                    onClick={() => setAnswers((a) => ({ ...a, business_type: "leads_only" }))}
                  />
                  <OptionCard
                    label="Other"
                    active={answers.business_type === "other"}
                    onClick={() => setAnswers((a) => ({ ...a, business_type: "other" }))}
                  />
                </div>
                {attemptedContinue && answers.business_type === "" ? (
                  <p className="mt-4 text-sm text-red-500">Please select an option to continue.</p>
                ) : null}
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="mt-7 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] sm:p-7">
                <h2 className="text-2xl font-bold">What platform is your website built on?</h2>
                <p className="mt-2 text-sm app-muted">We use this to set expectations for public crawling and the paid scan flow.</p>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <OptionCard
                    label="Shopify"
                    active={answers.platform === "shopify"}
                    onClick={() => setAnswers((a) => ({ ...a, platform: "shopify" }))}
                  />
                  <OptionCard
                    label="WooCommerce"
                    active={answers.platform === "woocommerce"}
                    onClick={() => setAnswers((a) => ({ ...a, platform: "woocommerce" }))}
                  />
                  <OptionCard
                    label="Wix / Squarespace"
                    active={answers.platform === "wix"}
                    onClick={() => setAnswers((a) => ({ ...a, platform: "wix" }))}
                  />
                  <OptionCard
                    label="Other / Not sure"
                    active={answers.platform === "other"}
                    onClick={() => setAnswers((a) => ({ ...a, platform: "other" }))}
                  />
                </div>
                {attemptedContinue && answers.platform === "" ? (
                  <p className="mt-4 text-sm text-red-500">Please select an option to continue.</p>
                ) : null}
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="mt-7 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] sm:p-7">
                <h2 className="text-2xl font-bold">What problem are you facing?</h2>
                <p className="mt-2 text-sm app-muted">This changes the framing of the report and the upgrade path.</p>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <OptionCard
                    label="Suspended in Merchant Center"
                    active={answers.blocked_where === "merchant_center"}
                    onClick={() => setAnswers((a) => ({ ...a, blocked_where: "merchant_center" }))}
                  />
                  <OptionCard
                    label="Suspended in Google Ads"
                    active={answers.blocked_where === "google_ads"}
                    onClick={() => setAnswers((a) => ({ ...a, blocked_where: "google_ads" }))}
                  />
                  <OptionCard
                    label="Both"
                    active={answers.blocked_where === "both"}
                    onClick={() => setAnswers((a) => ({ ...a, blocked_where: "both" }))}
                  />
                  <OptionCard
                    label="Just checking proactively"
                    active={answers.blocked_where === "proactive"}
                    onClick={() => setAnswers((a) => ({ ...a, blocked_where: "proactive" }))}
                  />
                </div>
                {attemptedContinue && answers.blocked_where === "" ? (
                  <p className="mt-4 text-sm text-red-500">Please select an option to continue.</p>
                ) : null}
              </div>
            )}

            {onboardingStep === 4 && (
              <div className="mt-7 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] sm:p-7">
                <h2 className="text-2xl font-bold">Do you have a Google Business Profile?</h2>
                <p className="mt-2 text-sm app-muted">Useful for consistency checks later in the connected full scan.</p>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <OptionCard
                    label="Yes"
                    active={answers.has_gmb === true}
                    onClick={() => setAnswers((a) => ({ ...a, has_gmb: true }))}
                  />
                  <OptionCard
                    label="No"
                    active={answers.has_gmb === false}
                    onClick={() => setAnswers((a) => ({ ...a, has_gmb: false }))}
                  />
                  <OptionCard
                    label="Not sure"
                    active={answers.has_gmb === null}
                    onClick={() => setAnswers((a) => ({ ...a, has_gmb: null }))}
                  />
                </div>
                {attemptedContinue && answers.has_gmb === undefined ? (
                  <p className="mt-4 text-sm text-red-500">Please select an option to continue.</p>
                ) : null}
              </div>
            )}

            <div className="mt-7 flex justify-end">
              <button
                type="button"
                onClick={onContinueQuestion}
                disabled={!canContinueForStep(onboardingStep)}
                className={[
                  "h-12 px-6 rounded-[18px] font-semibold transition-colors",
                  !canContinueForStep(onboardingStep)
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "app-button-primary",
                  "focus:outline-none focus:ring-4 focus:ring-blue-100",
                ].join(" ")}
              >
                Continue
              </button>
            </div>
            </div>
          </>
        ) : (
          <div className="mt-7 app-frame rounded-[34px] p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="app-section-label">Choose the experience</p>
                <h2 className="app-title mt-1 text-3xl font-semibold tracking-[-0.03em]">Free scan first or full connected diagnosis</h2>
              </div>
              <div className="app-chip text-sm">Same product. Two levels of depth.</div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-7 app-muted">
              The free scan helps you surface public trust gaps fast. The full scan is the connected recovery product for stores that need deeper Google and Shopify evidence.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                "Use free scan to spot weak public signals before traffic is wasted",
                "Use full scan when approvals, suspensions, or inconsistencies already hurt growth",
                "Move into connected diagnosis only when the client is serious",
              ].map((item) => (
                <div key={item} className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm">
                  {item}
                </div>
              ))}
            </div>
            {!urlParam ? (
              <p className="mt-4 text-sm text-red-500">
                Missing target URL. Go back to homepage and enter a valid website URL.
              </p>
            ) : null}

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={startFreeScan}
                disabled={!urlParam}
                className={[
                  "rounded-[28px] border p-6 text-left transition-all",
                  urlParam
                    ? "border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.05)] hover:-translate-y-1"
                    : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed",
                ].join(" ")}
              >
                <p className="text-sm font-medium text-emerald-600">Free scan</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">Impress first</p>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Run a public scan with crawl coverage, trust signals, site identity, PageSpeed, and practical quick wins.
                </p>
                <div className="mt-5 space-y-2 text-sm text-slate-600">
                  <p>• Public site identity and storefront trust review</p>
                  <p>• Policy, contact, and quality coverage</p>
                  <p>• Recommendations that make the site look stronger before traffic</p>
                </div>
                <div className="mt-6 flex items-center justify-between rounded-[18px] border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <span className="text-sm font-semibold text-emerald-700">Use free public scan</span>
                  <span className="text-lg font-semibold text-emerald-600">→</span>
                </div>
              </button>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-left shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-blue-600">Full diagnosis</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">Connected and serious</p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      Connect the real Google account and Shopify store when you need evidence strong enough to guide real recovery work.
                    </p>
                  </div>
                  <span className="app-chip text-xs">
                    Launch mode
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <BrandBadge
                      label={`Google: ${googleConnected ? "Connected" : "Not connected"}`}
                      tone={googleConnected ? "emerald" : "slate"}
                      icon={<MerchantIcon />}
                    />
                    <BrandBadge
                      label={`Shopify: ${shopifyConnected ? "Connected" : "Optional"}`}
                      tone={shopifyConnected ? "emerald" : "slate"}
                      icon={<ShopifyIcon />}
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={connectGoogle}
                      className="app-button-primary h-11 rounded-[18px] px-4 text-sm font-semibold"
                    >
                      {googleConnected ? "Reconnect Google" : "Connect Google"}
                    </button>
                    <div className="flex-1 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={shopDomain}
                        onChange={(e) => setShopDomain(e.target.value)}
                        placeholder="store.myshopify.com"
                        className="app-input h-11 flex-1 px-4 text-sm outline-none focus:ring-4 focus:ring-blue-100"
                      />
                      <button
                        type="button"
                        onClick={connectShopify}
                        className="app-button-secondary h-11 rounded-[18px] px-4 text-sm font-semibold"
                      >
                        {shopifyConnected ? "Reconnect Shopify" : "Connect Shopify"}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={startPaidScan}
                    disabled={!urlParam || !googleConnected || setupBusy}
                    className={[
                      "h-12 rounded-[18px] font-semibold transition-colors",
                      !urlParam || !googleConnected || setupBusy
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "app-button-primary",
                    ].join(" ")}
                  >
                    {setupBusy ? "Preparing..." : "Start Full Scan"}
                  </button>
                  {setupError ? <p className="text-sm text-red-500">{setupError}</p> : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div dir="ltr" className="app-shell">
          <div className="app-container py-14 sm:py-20">
            <div className="app-panel-strong rounded-[32px] p-6 sm:p-8">
              <p className="text-sm app-muted">Loading scan flow...</p>
            </div>
          </div>
        </div>
      }
    >
      <ScanPageClient />
    </Suspense>
  );
}

