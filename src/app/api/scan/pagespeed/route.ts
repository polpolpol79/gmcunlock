import { NextResponse } from "next/server";
import { getPageSpeedData } from "@/lib/pagespeed";

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

    const data = await getPageSpeedData(url);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch PageSpeed data";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

