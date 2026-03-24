import axios from "axios";

const PAGESPEED_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PAGESPEED_CACHE_TTL_MS = 10 * 60 * 1000;

export type PageSpeedSource = "live" | "cached" | "unavailable";
export type PageSpeedStrategy = "mobile" | "desktop" | "unknown";

export type PageSpeedData = {
  performance: number;
  lcp: string;
  cls: string;
  fid: string;
  fcp: string;
  ttfb: string;
  opportunities: string[];
  source: PageSpeedSource;
  strategy: PageSpeedStrategy;
  collectedAt: string | null;
  note: string | null;
};

type PageSpeedMode = "fast" | "background";

const pageSpeedCache = new Map<string, { data: PageSpeedData; updatedAt: number }>();
const pageSpeedInFlight = new Map<string, Promise<PageSpeedData>>();

type PageSpeedApiResponse = {
  lighthouseResult?: {
    categories?: {
      performance?: {
        score?: number | null;
      };
    };
    audits?: Record<
      string,
      {
        title?: string;
        displayValue?: string;
        scoreDisplayMode?: string;
        details?: {
          type?: string;
          overallSavingsMs?: number;
        };
      }
    >;
    categoriesRefs?: unknown;
  };
};

function getDisplayValue(
  audits: NonNullable<NonNullable<PageSpeedApiResponse["lighthouseResult"]>["audits"]>,
  key: string
): string {
  return audits[key]?.displayValue ?? "N/A";
}

function getTopOpportunities(
  audits: NonNullable<NonNullable<PageSpeedApiResponse["lighthouseResult"]>["audits"]>
): string[] {
  const entries = Object.values(audits)
    .filter((audit) => audit.details?.type === "opportunity")
    .map((audit) => ({
      title: audit.title ?? "Optimization opportunity",
      savingsMs: audit.details?.overallSavingsMs ?? 0,
    }))
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, 3)
    .map((item) =>
      item.savingsMs > 0
        ? `${item.title} (~${Math.round(item.savingsMs)}ms savings)`
        : item.title
    );

  if (entries.length === 0) {
    return ["No major optimization opportunities detected."];
  }

  return entries;
}

function buildInFlightKey(url: string, mode: PageSpeedMode): string {
  return `${mode}:${normalizeCacheKey(url)}`;
}

function withSnapshotSource(
  data: PageSpeedData,
  source: PageSpeedSource,
  note: string | null
): PageSpeedData {
  return {
    ...data,
    source,
    note,
  };
}

function formatPageSpeedError(error: unknown, strategy: "mobile" | "desktop"): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 429) return `PageSpeed quota reached (${strategy})`;
    if (typeof status === "number") return `PageSpeed API returned ${status} (${strategy})`;
    if (error.code === "ECONNABORTED") return `PageSpeed timeout (${strategy})`;
    if (error.code === "ERR_CANCELED") return `PageSpeed request canceled (${strategy})`;
    if (typeof error.message === "string" && error.message.trim()) {
      return `${error.message} (${strategy})`;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return `${error.message} (${strategy})`;
  }
  return `PageSpeed request failed (${strategy})`;
}

export function pageSpeedUnavailable(reason: string): PageSpeedData {
  return {
    performance: 0,
    lcp: "N/A",
    cls: "N/A",
    fid: "N/A",
    fcp: "N/A",
    ttfb: `Unavailable (${reason})`,
    opportunities: ["PageSpeed data unavailable - retry later."],
    source: "unavailable",
    strategy: "unknown",
    collectedAt: null,
    note: reason,
  };
}

function normalizeCacheKey(url: string): string {
  return url.trim().toLowerCase();
}

function getFreshCachedPageSpeed(url: string): PageSpeedData | null {
  const cached = pageSpeedCache.get(normalizeCacheKey(url));
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > PAGESPEED_CACHE_TTL_MS) return null;
  return withSnapshotSource(
    cached.data,
    "cached",
    "Using a recent cached PageSpeed snapshot from an earlier successful request."
  );
}

function getAnyCachedPageSpeed(url: string): PageSpeedData | null {
  const cached = pageSpeedCache.get(normalizeCacheKey(url))?.data ?? null;
  return cached
    ? withSnapshotSource(
        cached,
        "cached",
        "Using the last successful PageSpeed snapshot because the live request did not finish in time."
      )
    : null;
}

function setCachedPageSpeed(url: string, data: PageSpeedData): void {
  if (data.source === "unavailable") return;
  pageSpeedCache.set(normalizeCacheKey(url), {
    data: withSnapshotSource(data, "live", null),
    updatedAt: Date.now(),
  });
}

async function requestPageSpeed(
  targetUrl: string,
  apiKey: string,
  strategy: "mobile" | "desktop",
  timeoutMs: number,
  signal?: AbortSignal
): Promise<PageSpeedData> {
  let response;
  try {
    response = await axios.get<PageSpeedApiResponse>(PAGESPEED_API_URL, {
      params: {
        url: targetUrl,
        key: apiKey,
        strategy,
        category: "performance",
      },
      timeout: timeoutMs,
      signal,
    });
  } catch (error) {
    throw new Error(formatPageSpeedError(error, strategy));
  }

  const lighthouse = response.data.lighthouseResult;
  const audits = lighthouse?.audits;
  if (!lighthouse || !audits) {
    throw new Error(`Invalid PageSpeed API response (${strategy})`);
  }

  const performance = Math.round((lighthouse.categories?.performance?.score ?? 0) * 100);

  return {
    performance,
    lcp: getDisplayValue(audits, "largest-contentful-paint"),
    cls: getDisplayValue(audits, "cumulative-layout-shift"),
    fid:
      getDisplayValue(audits, "max-potential-fid") !== "N/A"
        ? getDisplayValue(audits, "max-potential-fid")
        : getDisplayValue(audits, "interactive"),
    fcp: getDisplayValue(audits, "first-contentful-paint"),
    ttfb: getDisplayValue(audits, "server-response-time"),
    opportunities: getTopOpportunities(audits),
    source: "live",
    strategy,
    collectedAt: new Date().toISOString(),
    note: null,
  };
}

export async function getPageSpeedData(
  url: string,
  mode: PageSpeedMode = "fast"
): Promise<PageSpeedData> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PAGESPEED_API_KEY");
  }

  const targetUrl = url.trim();
  if (!targetUrl) {
    throw new Error("URL is required");
  }

  const freshCached = getFreshCachedPageSpeed(targetUrl);
  if (freshCached) {
    return freshCached;
  }

  const inFlightKey = buildInFlightKey(targetUrl, mode);
  const existing = pageSpeedInFlight.get(inFlightKey);
  if (existing) {
    return existing;
  }

  const requestPromise = (async () => {
    let lastError: Error | null = null;
    const attempts: Array<{ strategy: "mobile" | "desktop"; timeoutMs: number }> =
      mode === "background"
        ? [
            { strategy: "mobile", timeoutMs: 35000 },
            { strategy: "desktop", timeoutMs: 25000 },
          ]
        : [
            { strategy: "mobile", timeoutMs: 25000 },
            { strategy: "desktop", timeoutMs: 20000 },
          ];

    const controllers = attempts.map(() => new AbortController());
    const requests = attempts.map((attempt, index) =>
      requestPageSpeed(
        targetUrl,
        apiKey,
        attempt.strategy,
        attempt.timeoutMs,
        controllers[index].signal
      )
    );

    try {
      const data = await Promise.any(requests);
      controllers.forEach((controller) => controller.abort());
      setCachedPageSpeed(targetUrl, data);
      return data;
    } catch (error) {
      controllers.forEach((controller) => controller.abort());
      if (error instanceof AggregateError && Array.isArray(error.errors)) {
        const messages = error.errors.map((item) =>
          item instanceof Error ? item.message : String(item)
        );
        lastError = new Error(messages.join(" | "));
      } else {
        lastError = error instanceof Error ? error : new Error("PageSpeed request failed");
      }
    }

    const staleCached = getAnyCachedPageSpeed(targetUrl);
    if (staleCached) {
      return {
        ...staleCached,
        opportunities: [
          "Showing the last successful PageSpeed snapshot because the live request was slow or unavailable.",
          ...staleCached.opportunities,
        ].slice(0, 4),
      };
    }

    throw lastError ?? new Error("PageSpeed request failed");
  })().finally(() => {
    pageSpeedInFlight.delete(inFlightKey);
  });

  pageSpeedInFlight.set(inFlightKey, requestPromise);
  return requestPromise;
}

