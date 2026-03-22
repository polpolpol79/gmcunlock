import axios from "axios";

const PAGESPEED_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type PageSpeedData = {
  performance: number;
  lcp: string;
  cls: string;
  fid: string;
  fcp: string;
  ttfb: string;
  opportunities: string[];
};

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

export async function getPageSpeedData(url: string): Promise<PageSpeedData> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PAGESPEED_API_KEY");
  }

  const targetUrl = url.trim();
  if (!targetUrl) {
    throw new Error("URL is required");
  }

  const response = await axios.get<PageSpeedApiResponse>(PAGESPEED_API_URL, {
    params: {
      url: targetUrl,
      key: apiKey,
      strategy: "mobile",
    },
    timeout: 15000,
  });

  const lighthouse = response.data.lighthouseResult;
  const audits = lighthouse?.audits;
  if (!lighthouse || !audits) {
    throw new Error("Invalid PageSpeed API response");
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
  };
}

