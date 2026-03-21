import { NextResponse } from "next/server";
import { GOOGLE_TOKENS_COOKIE, GOOGLE_OAUTH_STATE_COOKIE } from "@/lib/google";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GOOGLE_TOKENS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

