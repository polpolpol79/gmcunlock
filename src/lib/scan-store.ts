import { getSupabaseAdminClient } from "@/lib/supabase";
import { PENDING_ANALYSIS_PLACEHOLDER } from "@/lib/scan-placeholders";

export type ScanJobStatus = "queued" | "running" | "done" | "error";

export type StoredScanRow = {
  id: string;
  user_id?: string | null;
  url: string;
  scan_type?: "free" | "paid";
  google_connected?: boolean;
  profile: unknown;
  pagespeed: unknown;
  crawl: unknown;
  analysis: unknown;
  created_at?: string;
  /** Async job + progress (requires DB columns — see docs/supabase-scan-progress.sql) */
  scan_status?: ScanJobStatus | string | null;
  scan_phase?: string | null;
  scan_phase_detail?: string | null;
  scan_error?: string | null;
  progress_updated_at?: string | null;
};

const TABLE_CANDIDATES = ["scan_results", "scans"] as const;

function isMissingEnvError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Missing required env var:");
}

async function findTableForScanId(scanId: string): Promise<(typeof TABLE_CANDIDATES)[number] | null> {
  try {
    const client = getSupabaseAdminClient();
    for (const table of TABLE_CANDIDATES) {
      const tableClient = client.from(table as never) as any;
      const { data, error } = await tableClient.select("id").eq("id", scanId).maybeSingle();
      if (!error && data?.id) return table;
    }
  } catch (e) {
    if (!isMissingEnvError(e)) console.warn("[scan-store] findTableForScanId", e);
  }
  return null;
}

/** True when running on Vercel and background work can be scheduled after the HTTP response. */
export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

/**
 * Schedule work to continue after the response (Vercel). Returns false if not supported — caller should await work.
 */
export async function scheduleScanBackground(work: () => Promise<void>): Promise<boolean> {
  if (process.env.SCAN_SYNC_ONLY === "1") return false;
  if (!isVercelRuntime()) return false;
  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(
      work().catch((err) => {
        console.error("[scan-store] background scan failed", err);
      })
    );
    return true;
  } catch (e) {
    console.warn("[scan-store] waitUntil unavailable, falling back to sync scan", e);
    return false;
  }
}

function getAdminClientSafe(): ReturnType<typeof getSupabaseAdminClient> | null {
  try {
    return getSupabaseAdminClient();
  } catch {
    return null;
  }
}

/**
 * Insert a row marked `running` for async scans. Returns null if Supabase is unavailable
 * or progress columns are missing (use synchronous saveScanResult instead).
 */
export async function createPendingScanResult(input: {
  user_id?: string | null;
  url: string;
  scan_type: "free" | "paid";
  google_connected?: boolean;
  profile: unknown;
  pagespeed: unknown;
  crawl: unknown;
  phaseDetail?: string;
}): Promise<string | null> {
  const client = getAdminClientSafe();
  if (!client) return null;

  const now = new Date().toISOString();
  const row = {
    user_id: input.user_id ?? null,
    url: input.url,
    scan_type: input.scan_type,
    google_connected: input.google_connected ?? false,
    profile: input.profile,
    pagespeed: input.pagespeed,
    crawl: input.crawl,
    analysis: PENDING_ANALYSIS_PLACEHOLDER,
    scan_status: "running" as const,
    scan_phase: "queued",
    scan_phase_detail: input.phaseDetail ?? "Preparing your scan…",
    scan_error: null,
    progress_updated_at: now,
  };

  for (const table of TABLE_CANDIDATES) {
    const tableClient = client.from(table as never) as any;
    const attemptWithUser = await tableClient.insert(row).select("id").single();
    if (!attemptWithUser.error && attemptWithUser.data?.id) {
      return attemptWithUser.data.id as string;
    }

    const legacyRow = { ...row };
    delete (legacyRow as Record<string, unknown>).user_id;
    const attemptLegacy = await tableClient.insert(legacyRow).select("id").single();
    if (!attemptLegacy.error && attemptLegacy.data?.id) {
      return attemptLegacy.data.id as string;
    }
  }

  return null;
}

/** Persist crawl/pagespeed mid-job so a follow-up serverless invocation can run Claude (Vercel 300s limit). */
export async function persistScanIntermediateState(
  scanId: string,
  payload: { crawl: unknown; pagespeed: unknown; google_connected: boolean }
): Promise<void> {
  const table = await findTableForScanId(scanId);
  const client = getAdminClientSafe();
  if (!table || !client) return;

  const tableClient = client.from(table as never) as any;
  const { error } = await tableClient
    .update({
      crawl: payload.crawl,
      pagespeed: payload.pagespeed,
      google_connected: payload.google_connected,
      progress_updated_at: new Date().toISOString(),
    })
    .eq("id", scanId);

  if (error) {
    console.warn("[scan-store] persistScanIntermediateState failed", { scanId, error: error.message });
  }
}

export async function updateScanProgress(
  scanId: string,
  input: { phase: string; detail: string; status?: ScanJobStatus }
): Promise<void> {
  const table = await findTableForScanId(scanId);
  const client = getAdminClientSafe();
  if (!table || !client) return;

  const tableClient = client.from(table as never) as any;
  const { error } = await tableClient
    .update({
      scan_status: input.status ?? "running",
      scan_phase: input.phase,
      scan_phase_detail: input.detail,
      progress_updated_at: new Date().toISOString(),
    })
    .eq("id", scanId);

  if (error) {
    console.warn("[scan-store] updateScanProgress failed", { scanId, error: error.message });
  }
}

export async function completeScanResult(
  scanId: string,
  payload: { pagespeed: unknown; crawl: unknown; analysis: unknown; google_connected?: boolean }
): Promise<boolean> {
  const table = await findTableForScanId(scanId);
  const client = getAdminClientSafe();
  if (!table || !client) return false;

  const tableClient = client.from(table as never) as any;
  const updateRow: Record<string, unknown> = {
    pagespeed: payload.pagespeed,
    crawl: payload.crawl,
    analysis: payload.analysis,
    scan_status: "done",
    scan_phase: "done",
    scan_phase_detail: "Your report is ready.",
    scan_error: null,
    progress_updated_at: new Date().toISOString(),
  };
  if (payload.google_connected !== undefined) {
    updateRow.google_connected = payload.google_connected;
  }

  const { error } = await tableClient.update(updateRow).eq("id", scanId);

  if (error) {
    console.warn("[scan-store] completeScanResult failed", { scanId, error: error.message });
    return false;
  }
  return true;
}

export async function failScanResult(scanId: string, message: string): Promise<void> {
  const table = await findTableForScanId(scanId);
  const client = getAdminClientSafe();
  if (!table || !client) return;

  const tableClient = client.from(table as never) as any;
  const { error } = await tableClient
    .update({
      scan_status: "error",
      scan_phase: "error",
      scan_phase_detail: message,
      scan_error: message,
      progress_updated_at: new Date().toISOString(),
    })
    .eq("id", scanId);

  if (error) {
    console.warn("[scan-store] failScanResult failed", { scanId, error: error.message });
  }
}

export async function saveScanResult(input: {
  user_id?: string | null;
  url: string;
  scan_type: "free" | "paid";
  google_connected?: boolean;
  profile: unknown;
  pagespeed: unknown;
  crawl: unknown;
  analysis: unknown;
}): Promise<string | null> {
  const client = getAdminClientSafe();
  if (!client) return null;

  for (const table of TABLE_CANDIDATES) {
    const tableClient = client.from(table as never) as any;

    // Try with extended columns first.
    const primaryAttempt = await tableClient
      .insert({
        user_id: input.user_id ?? null,
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

    const legacyPrimaryAttempt = await tableClient
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

    if (!legacyPrimaryAttempt.error && legacyPrimaryAttempt.data?.id) {
      return legacyPrimaryAttempt.data.id as string;
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
  const client = getAdminClientSafe();
  if (!client) return null;

  for (const table of TABLE_CANDIDATES) {
    const tableClient = client.from(table as never) as any;

    const extendedSelect = await tableClient
      .select(
        "id,user_id,url,scan_type,google_connected,profile,pagespeed,crawl,analysis,created_at,scan_status,scan_phase,scan_phase_detail,scan_error,progress_updated_at"
      )
      .eq("id", scanId)
      .single();

    if (!extendedSelect.error && extendedSelect.data) {
      return extendedSelect.data as StoredScanRow;
    }

    const legacyExtendedSelect = await tableClient
      .select(
        "id,url,scan_type,google_connected,profile,pagespeed,crawl,analysis,created_at,scan_status,scan_phase,scan_phase_detail,scan_error,progress_updated_at"
      )
      .eq("id", scanId)
      .single();

    if (!legacyExtendedSelect.error && legacyExtendedSelect.data) {
      return legacyExtendedSelect.data as StoredScanRow;
    }

    const primarySelect = await tableClient
      .select("id,user_id,url,scan_type,google_connected,profile,pagespeed,crawl,analysis,created_at")
      .eq("id", scanId)
      .single();

    if (!primarySelect.error && primarySelect.data) {
      return primarySelect.data as StoredScanRow;
    }

    const legacyPrimarySelect = await tableClient
      .select("id,url,scan_type,google_connected,profile,pagespeed,crawl,analysis,created_at")
      .eq("id", scanId)
      .single();

    if (!legacyPrimarySelect.error && legacyPrimarySelect.data) {
      return legacyPrimarySelect.data as StoredScanRow;
    }

    const fallbackSelect = await tableClient
      .select("id,user_id,url,profile,pagespeed,crawl,analysis,created_at")
      .eq("id", scanId)
      .single();

    if (!fallbackSelect.error && fallbackSelect.data) {
      return fallbackSelect.data as StoredScanRow;
    }
  }

  return null;
}

export async function getScanResultForUser(
  scanId: string,
  userId: string
): Promise<StoredScanRow | null> {
  const row = await getScanResultById(scanId);
  if (!row) return null;
  if (row.user_id && row.user_id !== userId) return null;
  return row;
}

