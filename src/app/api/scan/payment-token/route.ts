import { NextResponse } from "next/server";
import { getAppUserIdFromRequest } from "@/lib/app-session";
import { createPaidScanToken } from "@/lib/payment-gate";
import { getGoogleTokensForUser } from "@/lib/google";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const rate = consumeRateLimit({
      key: getClientKey(req),
      bucket: "scan_paid_token",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Please retry shortly." },
        { status: 429 }
      );
    }

    const userId = getAppUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const googleTokens = await getGoogleTokensForUser(userId);
    if (!googleTokens?.access_token) {
      return NextResponse.json(
        { ok: false, error: "Google connection required before paid scan." },
        { status: 401 }
      );
    }

    const token = createPaidScanToken();
    return NextResponse.json({ ok: true, data: { payment_token: token } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create paid token";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

