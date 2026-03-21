import { NextResponse } from "next/server";

const envBudget = Number(process.env.SCAN_ROUTE_BUDGET_MS);

/**
 * Synchronous-scan safety margin under `export const maxDuration` (see scan routes + vercel.json).
 * Async scans use `waitUntil` on Vercel and are limited by platform maxDuration instead.
 */
export const SCAN_ROUTE_BUDGET_MS =
  Number.isFinite(envBudget) && envBudget > 0 ? envBudget : 295_000;

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
