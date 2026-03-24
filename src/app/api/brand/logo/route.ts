import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGO_PATH = path.resolve(
  "C:/Users/User/.cursor/projects/c-Users-User-GMCunlock/assets/c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_7777b13d0515326ef385094f1f47c320_images_Logo_maker_project__2_-removebg-preview-80a62759-e675-4946-99f7-d35a81214347.png"
);

export async function GET() {
  try {
    const file = await fs.readFile(LOGO_PATH);
    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logo not found";
    return NextResponse.json({ ok: false, error: message }, { status: 404 });
  }
}
