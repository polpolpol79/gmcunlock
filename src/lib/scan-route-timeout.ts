import { NextResponse } from "next/server";

/** Stay under Vercel maxDuration (e.g. 60s) with safety margin. */
export const SCAN_ROUTE_BUDGET_MS = 55_000;

export class ScanTimeoutError extends Error {
  override name = "ScanTimeoutError";
  constructor() {
    super(
      `Scan exceeded maximum time budget (${SCAN_ROUTE_BUDGET_MS / 1000}s). Please try again.`
    );
  }
}

/**
 * Runs async work; rejects with {@link ScanTimeoutError} if it exceeds `maxMs`.
 * Clears the timer when `fn` settles first.
 */
export async function withScanTimeBudget<T>(maxMs: number, fn: () => Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new ScanTimeoutError()), maxMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export function scanTimeoutResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: `Scan exceeded maximum time budget (${SCAN_ROUTE_BUDGET_MS / 1000}s). Please try again.`,
    },
    { status: 504 }
  );
}
