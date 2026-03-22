import { NextResponse } from "next/server";
import { getAppUserIdFromRequest } from "@/lib/app-session";
import {
  GOOGLE_TOKENS_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  deleteGoogleConnectionForUser,
} from "@/lib/google";

export async function POST(req: Request) {
  const userId = getAppUserIdFromRequest(req);
  if (userId) {
    await deleteGoogleConnectionForUser(userId);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GOOGLE_TOKENS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

