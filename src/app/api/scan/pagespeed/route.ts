import { NextResponse } from "next/server";
import { getPageSpeedData, pageSpeedUnavailable } from "@/lib/pagespeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RequestBody = {
  url?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const url = body?.url?.trim();

    if (!url) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: url" },
        { status: 400 }
      );
    }

    const data = await getPageSpeedData(url, "background");
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch PageSpeed data";
    return NextResponse.json({
      ok: true,
      warning: message,
      data: pageSpeedUnavailable(message),
    });
  }
}

