import { NextResponse } from "next/server";
import { applyAppSessionCookie, ensureAppUserSession } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await ensureAppUserSession(req);
  const res = NextResponse.json({
    ok: true,
    data: {
      user_id: session.userId,
      session_created: session.isNew,
    },
  });
  applyAppSessionCookie(res, req, session);
  return res;
}

export async function POST(req: Request) {
  return GET(req);
}

