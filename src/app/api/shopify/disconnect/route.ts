import { NextResponse } from "next/server";
import { getAppUserIdFromRequest } from "@/lib/app-session";
import { deleteShopifyConnectionForUser } from "@/lib/shopify";

export async function POST(req: Request) {
  const userId = getAppUserIdFromRequest(req);
  if (userId) {
    await deleteShopifyConnectionForUser(userId);
  }
  return NextResponse.json({ ok: true });
}
