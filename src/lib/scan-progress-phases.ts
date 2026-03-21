/**
 * Stable phase keys for DB + UI. Detail strings are user-facing (English for product consistency).
 */
export const SCAN_PHASES = {
  queued: "queued",
  pagespeed_crawl: "pagespeed_crawl",
  google_shopify: "google_shopify",
  analysis: "analysis",
  persist: "persist",
  done: "done",
  error: "error",
} as const;

export type ScanPhaseKey = (typeof SCAN_PHASES)[keyof typeof SCAN_PHASES];

export const SCAN_PHASE_LABELS: Record<ScanPhaseKey, string> = {
  queued: "Starting scan",
  pagespeed_crawl: "PageSpeed & website crawl",
  google_shopify: "Google & Shopify data",
  analysis: "AI compliance review",
  persist: "Saving report",
  done: "Complete",
  error: "Failed",
};

export function phaseDetailFor(key: ScanPhaseKey, extra?: string): string {
  const base: Record<ScanPhaseKey, string> = {
    queued: "Preparing your scan…",
    pagespeed_crawl: "Fetching PageSpeed metrics and crawling your live site.",
    google_shopify: "Loading connected Google and Shopify signals (if configured).",
    analysis: "Analyzing policies, trust signals, and GMC-style risks with Claude.",
    persist: "Writing results so you can share and revisit this report.",
    done: "Your report is ready.",
    error: extra ?? "Something went wrong.",
  };
  return base[key];
}
