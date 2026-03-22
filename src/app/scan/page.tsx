"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
        "w-full text-left rounded-2xl border px-4 py-4 transition-colors",
        "bg-white/[0.03] border-white/10 hover:bg-white/[0.05]",
        active ? "border-indigo-400/70 bg-indigo-500/15" : "border-white/10",
        "focus:outline-none focus:ring-2 focus:ring-indigo-400/50",
      ].join(" ")}
    >
      <span className="block text-zinc-100 font-medium">{label}</span>
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
    <div dir="ltr" className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="mb-8">
          <p className="text-sm text-zinc-400">
            Target URL: <span className="text-zinc-100 font-medium">{urlParam || "—"}</span>
          </p>
        </div>

        {phase === "onboarding" ? (
          <>
            <div className="mb-7">
              <div className="flex items-center justify-between gap-4 mb-3">
                <p className="text-sm text-zinc-300">Step {onboardingStep} of 4</p>
                <p className="text-xs text-zinc-500">Answer to continue</p>
              </div>
              <div className="h-2 rounded-full bg-white/5 border border-white/10">
                <div
                  className="h-2 rounded-full bg-indigo-500/70"
                  style={{ width: `${onboardingProgressPct}%` }}
                />
              </div>
            </div>

            {onboardingStep === 1 && (
              <div className="rounded-3xl border border-white/10 bg-zinc-900/30 p-6 sm:p-7">
                <h2 className="text-2xl font-bold">What type of business do you have?</h2>
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
                  <p className="mt-4 text-sm text-red-400">Please select an option to continue.</p>
                ) : null}
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="rounded-3xl border border-white/10 bg-zinc-900/30 p-6 sm:p-7">
                <h2 className="text-2xl font-bold">What platform is your website built on?</h2>
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
                  <p className="mt-4 text-sm text-red-400">Please select an option to continue.</p>
                ) : null}
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="rounded-3xl border border-white/10 bg-zinc-900/30 p-6 sm:p-7">
                <h2 className="text-2xl font-bold">What problem are you facing?</h2>
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
                  <p className="mt-4 text-sm text-red-400">Please select an option to continue.</p>
                ) : null}
              </div>
            )}

            {onboardingStep === 4 && (
              <div className="rounded-3xl border border-white/10 bg-zinc-900/30 p-6 sm:p-7">
                <h2 className="text-2xl font-bold">Do you have a Google Business Profile?</h2>
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
                  <p className="mt-4 text-sm text-red-400">Please select an option to continue.</p>
                ) : null}
              </div>
            )}

            <div className="mt-7 flex justify-end">
              <button
                type="button"
                onClick={onContinueQuestion}
                disabled={!canContinueForStep(onboardingStep)}
                className={[
                  "h-12 px-6 rounded-xl font-semibold transition-colors",
                  !canContinueForStep(onboardingStep)
                    ? "bg-white/10 text-zinc-300 cursor-not-allowed"
                    : "bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600 text-zinc-950",
                  "focus:outline-none focus:ring-2 focus:ring-indigo-400/50",
                ].join(" ")}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-zinc-900/30 p-6 sm:p-8">
            <h2 className="text-2xl font-bold">Choose your scan type</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Free scan gives public-site intelligence. Full scan adds real Google + Shopify data and the full 77-rule engine.
            </p>
            {!urlParam ? (
              <p className="mt-3 text-sm text-red-300">
                Missing target URL. Go back to homepage and enter a valid website URL.
              </p>
            ) : null}

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={startFreeScan}
                disabled={!urlParam}
                className={[
                  "rounded-2xl border p-5 text-left transition-colors",
                  urlParam
                    ? "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15"
                    : "border-white/10 bg-white/[0.03] text-zinc-500 cursor-not-allowed",
                ].join(" ")}
              >
                <p className="text-lg font-bold text-emerald-200">Scan for Free</p>
                <p className="mt-2 text-sm text-zinc-200/90">
                  Run a public scan with crawl coverage, PageSpeed, evidence-backed findings, and quick wins.
                </p>
              </button>

              <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/10 p-5 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-indigo-100">Full Scan — $99</p>
                    <p className="mt-2 text-sm text-zinc-200/90">
                      Connect the real Google account and Shopify store for the serious compliance diagnosis.
                    </p>
                  </div>
                  <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs text-zinc-200">
                    Launch mode
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full border px-3 py-1 ${googleConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-zinc-300"}`}>
                      Google: {googleConnected ? "Connected" : "Not connected"}
                    </span>
                    <span className={`rounded-full border px-3 py-1 ${shopifyConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-zinc-300"}`}>
                      Shopify: {shopifyConnected ? "Connected" : "Optional"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={connectGoogle}
                      className="h-11 rounded-xl bg-white text-zinc-950 px-4 font-semibold hover:bg-zinc-200 transition-colors"
                    >
                      {googleConnected ? "Reconnect Google" : "Connect Google"}
                    </button>
                    <div className="flex-1 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={shopDomain}
                        onChange={(e) => setShopDomain(e.target.value)}
                        placeholder="store.myshopify.com"
                        className="h-11 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
                      />
                      <button
                        type="button"
                        onClick={connectShopify}
                        className="h-11 rounded-xl border border-white/15 bg-white/[0.05] px-4 font-semibold text-zinc-100 hover:bg-white/[0.09] transition-colors"
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
                      "h-12 rounded-xl font-semibold transition-colors",
                      !urlParam || !googleConnected || setupBusy
                        ? "bg-white/10 text-zinc-400 cursor-not-allowed"
                        : "bg-indigo-500 text-zinc-950 hover:bg-indigo-400",
                    ].join(" ")}
                  >
                    {setupBusy ? "Preparing..." : "Start Full Scan"}
                  </button>
                  {setupError ? <p className="text-sm text-red-300">{setupError}</p> : null}
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
        <div dir="ltr" className="min-h-screen bg-zinc-950 text-zinc-100">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
            <div className="rounded-3xl border border-white/10 bg-zinc-900/30 p-6 sm:p-8">
              <p className="text-sm text-zinc-300">Loading scan flow...</p>
            </div>
          </div>
        </div>
      }
    >
      <ScanPageClient />
    </Suspense>
  );
}

