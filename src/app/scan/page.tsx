"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type BusinessType = "ecommerce" | "service_provider" | "leads_only" | "other";
type Platform = "shopify" | "woocommerce" | "wix" | "other";
type BlockedWhere = "merchant_center" | "google_ads" | "both" | "proactive";
type HasGmb = true | false | null;

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

  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3 | 4>(1);
  const [phase, setPhase] = useState<"onboarding" | "plan">("onboarding");
  const [attemptedContinue, setAttemptedContinue] = useState(false);

  const [answers, setAnswers] = useState<Answers>({
    business_type: "",
    platform: "",
    blocked_where: "",
    has_gmb: undefined,
  });

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
              Free scan includes PageSpeed + basic crawl + top 3 critical findings.
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
                  Run a limited compliance check and get the top risks instantly.
                </p>
              </button>

              <button
                type="button"
                disabled
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left opacity-70 cursor-not-allowed"
              >
                <p className="text-lg font-bold text-zinc-200">Full Scan — $99</p>
                <p className="mt-2 text-sm text-zinc-400">
                  Includes Google OAuth + Shopify + full 77-rule analysis.
                </p>
                <span className="mt-4 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-300">
                  Coming soon
                </span>
              </button>
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

