import { NextResponse } from "next/server";
import { currentAdmin } from "../../../../src/lib/adminAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await currentAdmin();
  return NextResponse.json({ ok: true, authenticated: Boolean(admin), admin });
}
