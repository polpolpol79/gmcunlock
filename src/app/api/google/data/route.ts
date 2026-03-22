import { NextResponse } from "next/server";
import {
  fetchAllGoogleConnectedDataForUser,
} from "@/lib/google";
import { getAppUserIdFromRequest } from "@/lib/app-session";

export async function GET(req: Request) {
  try {
    const userId = getAppUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const result = await fetchAllGoogleConnectedDataForUser(userId);
    if (!result.connected || !result.data) {
      return NextResponse.json(
        { ok: false, error: "Google is not connected" },
        { status: 401 }
      );
    }
    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Google data";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

