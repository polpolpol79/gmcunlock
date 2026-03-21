import { getSupabaseAdminClient } from "@/lib/supabase";

export type StoredScanRow = {
  id: string;
  url: string;
  scan_type?: "free" | "paid";
  google_connected?: boolean;
  profile: unknown;
  pagespeed: unknown;
  crawl: unknown;
  analysis: unknown;
  created_at?: string;
};

const TABLE_CANDIDATES = ["scan_results", "scans"] as const;

export async function saveScanResult(input: {
  url: string;
  scan_type: "free" | "paid";
  google_connected?: boolean;
  profile: unknown;
  pagespeed: unknown;
  crawl: unknown;
  analysis: unknown;
}): Promise<string | null> {
  const client = getSupabaseAdminClient();

  for (const table of TABLE_CANDIDATES) {
    const tableClient = client.from(table as never) as any;

    // Try with extended columns first.
    const primaryAttempt = await tableClient
      .insert({
        url: input.url,
        scan_type: input.scan_type,
        google_connected: input.google_connected ?? false,
        profile: input.profile,
        pagespeed: input.pagespeed,
        crawl: input.crawl,
        analysis: input.analysis,
      })
      .select("id")
      .single();

    if (!primaryAttempt.error && primaryAttempt.data?.id) {
      return primaryAttempt.data.id as string;
    }

    // Backward-compatible fallback when columns don't exist yet.
    const fallbackAttempt = await tableClient
      .insert({
        url: input.url,
        profile: input.profile,
        pagespeed: input.pagespeed,
        crawl: input.crawl,
        analysis: input.analysis,
      })
      .select("id")
      .single();

    if (!fallbackAttempt.error && fallbackAttempt.data?.id) {
      return fallbackAttempt.data.id as string;
    }
  }

  return null;
}

export async function getScanResultById(scanId: string): Promise<StoredScanRow | null> {
  const client = getSupabaseAdminClient();

  for (const table of TABLE_CANDIDATES) {
    const tableClient = client.from(table as never) as any;

    const primarySelect = await tableClient
      .select("id,url,scan_type,google_connected,profile,pagespeed,crawl,analysis,created_at")
      .eq("id", scanId)
      .single();

    if (!primarySelect.error && primarySelect.data) {
      return primarySelect.data as StoredScanRow;
    }

    const fallbackSelect = await tableClient
      .select("id,url,profile,pagespeed,crawl,analysis,created_at")
      .eq("id", scanId)
      .single();

    if (!fallbackSelect.error && fallbackSelect.data) {
      return fallbackSelect.data as StoredScanRow;
    }
  }

  return null;
}

