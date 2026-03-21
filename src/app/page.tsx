"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [attempted, setAttempted] = useState(false);

  const trimmedUrl = useMemo(() => url.trim(), [url]);
  const hasError = attempted && trimmedUrl.length === 0;

  function onScanFree() {
    setAttempted(true);
    if (!trimmedUrl) return;
    router.push(`/scan?url=${encodeURIComponent(trimmedUrl)}`);
  }

  return (
    <div dir="ltr" className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900/80 to-zinc-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(120,113,255,0.25),transparent_55%)]" />
          <div className="relative p-6 sm:p-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight">
                  Find Out Why Google Banned You — And Fix It
                </h1>
                <p className="mt-4 text-zinc-300 text-lg sm:text-xl leading-relaxed">
                  Smart scan of 77 Google Merchant Center &amp; Google Ads compliance rules
                </p>

                <div className="mt-7 flex flex-col sm:flex-row gap-3 sm:items-stretch">
                  <div className="flex-1">
                    <label className="sr-only" htmlFor="url">
                      Store URL to scan
                    </label>
                    <input
                      id="url"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      placeholder="https://your-store.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className={[
                        "w-full h-12 px-4 rounded-xl",
                        "bg-zinc-900/70 border transition-colors",
                        "border-zinc-800 focus:border-indigo-500/70 focus:outline-none",
                        hasError ? "border-red-500/80" : "",
                      ].join(" ")}
                    />
                    {hasError ? (
                      <p className="mt-2 text-sm text-red-400">Please enter a URL to scan for free.</p>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-400">Get basic results in minutes.</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onScanFree}
                    className={[
                      "h-12 px-6 rounded-xl font-semibold",
                      "bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600",
                      "text-zinc-950 transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-indigo-400/60",
                    ].join(" ")}
                  >
                    Scan for Free
                  </button>
                </div>

                <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-300">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    PageSpeed check
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    Basic crawl
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    3 findings
                  </span>
                </div>
              </div>

              <div className="lg:w-80 shrink-0">
                <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5">
                  <p className="text-sm text-zinc-400">What you get with a free scan</p>
                  <ul className="mt-3 space-y-2 text-zinc-100">
                    <li className="flex gap-3">
                      <span className="mt-0.5 h-5 w-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center text-xs">
                        ✓
                      </span>
                      <span>PageSpeed + fix tips</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-0.5 h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 flex items-center justify-center text-xs">
                        ✓
                      </span>
                      <span>Basic crawl for common issues</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-0.5 h-5 w-5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-200 flex items-center justify-center text-xs">
                        ✓
                      </span>
                      <span>3 accurate findings with next steps</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="mt-10 sm:mt-14">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl sm:text-2xl font-bold">Pricing</h2>
            <p className="text-sm text-zinc-400">Choose the analysis level that fits you.</p>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Free */}
            <div className="rounded-3xl border border-white/10 bg-zinc-900/30 p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-400">Plan</p>
                  <h3 className="text-2xl font-bold mt-1">Free</h3>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-extrabold">$0</p>
                  <p className="text-sm text-zinc-400 mt-1">per scan</p>
                </div>
              </div>

              <ul className="mt-5 space-y-3 text-zinc-200">
                <li className="flex gap-3">
                  <span className="mt-0.5 h-6 w-6 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                  <span>PageSpeed + basic crawl</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 h-6 w-6 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                  <span>3 accurate findings</span>
                </li>
              </ul>

              <button
                type="button"
                onClick={onScanFree}
                className={[
                  "mt-6 w-full h-12 rounded-xl font-semibold",
                  "bg-white text-zinc-950 hover:bg-zinc-200",
                  "transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-white/40",
                ].join(" ")}
              >
                Scan for Free
              </button>
              <p className="mt-3 text-center text-xs text-zinc-500">
                You will be redirected to the results page with your `url`.
              </p>
            </div>

            {/* Paid */}
            <div className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-indigo-500/15 to-zinc-900/40 p-6 sm:p-7 overflow-hidden">
              <div className="absolute -top-10 -left-10 h-28 w-28 rounded-full bg-indigo-500/20 blur-2xl" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-zinc-400">Plan</p>
                    <h3 className="text-2xl font-bold mt-1">Pro</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-extrabold">$99</p>
                    <p className="text-sm text-zinc-400 mt-1">one-time</p>
                  </div>
                </div>

                <ul className="mt-5 space-y-3 text-zinc-200">
                  <li className="flex gap-3">
                    <span className="mt-0.5 h-6 w-6 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 flex items-center justify-center text-xs font-bold">
                      ✓
                    </span>
                    <span>Full 77-rule compliance analysis</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 h-6 w-6 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 flex items-center justify-center text-xs font-bold">
                      ✓
                    </span>
                    <span>AI-powered report + recommendations</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 h-6 w-6 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 flex items-center justify-center text-xs font-bold">
                      ✓
                    </span>
                    <span>Downloadable PDF report</span>
                  </li>
                </ul>

                <button
                  type="button"
                  disabled
                  className={[
                    "mt-6 w-full h-12 rounded-xl font-semibold",
                    "bg-white/10 text-zinc-200",
                    "border border-white/15",
                    "cursor-not-allowed",
                  ].join(" ")}
                >
                  Coming Soon: Full Scan
                </button>
                <p className="mt-3 text-center text-xs text-zinc-500">
                  For now, only the free scan is available.
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-10 sm:mt-14 text-xs text-zinc-500 text-center">
          Built with Tailwind CSS only. No external UI libraries.
        </footer>
      </div>
    </div>
  );
}
