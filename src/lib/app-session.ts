import crypto from "crypto";
import type { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";

export const APP_SESSION_COOKIE = "gmc_app_session";
const APP_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function getSessionSecret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "local-dev-session-secret";
}

function signUserId(userId: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(userId).digest("base64url");
}

function serializeSessionValue(userId: string): string {
  return `${userId}.${signUserId(userId)}`;
}

function parseSessionValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lastDot = raw.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const userId = raw.slice(0, lastDot);
  const sig = raw.slice(lastDot + 1);
  const expected = signUserId(userId);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return userId;
  } catch {
    return null;
  }
}

export function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const matched = parts.find((part) => part.startsWith(`${name}=`));
  return matched ? matched.slice(name.length + 1) : null;
}

export function getAppUserIdFromRequest(req: Request): string | null {
  return parseSessionValue(readCookieValue(req.headers.get("cookie"), APP_SESSION_COOKIE));
}

async function ensureAppUserRow(userId: string): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    const tableClient = admin.from("app_users" as never) as any;
    await tableClient.upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: false });
  } catch {
    // Build/runtime can continue without Supabase configured yet.
  }
}

export async function ensureAppUserSession(req: Request): Promise<{
  userId: string;
  isNew: boolean;
}> {
  const existing = getAppUserIdFromRequest(req);
  if (existing) {
    await ensureAppUserRow(existing);
    return { userId: existing, isNew: false };
  }

  const userId = crypto.randomUUID();
  await ensureAppUserRow(userId);
  return { userId, isNew: true };
}

function shouldUseSecureCookie(req: Request): boolean {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  const isLocalHost =
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host.startsWith("[::1]:");
  if (isLocalHost) return false;

  const explicit = process.env.NEXTAUTH_URL || process.env.APP_URL;
  if (explicit) return explicit.startsWith("https://");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return proto === "https";
}

export function applyAppSessionCookie(
  res: NextResponse,
  req: Request,
  session: { userId: string; isNew: boolean }
): void {
  if (!session.isNew) return;
  res.cookies.set(APP_SESSION_COOKIE, serializeSessionValue(session.userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(req),
    path: "/",
    maxAge: APP_SESSION_MAX_AGE,
  });
}
