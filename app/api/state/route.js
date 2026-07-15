import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminCookieName, isValidAdminSession } from "../../../src/lib/adminAuth";
import { getState, resetState, setState } from "../../../src/lib/serverStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await getState());
}

export async function PUT(request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const state = await request.json();
  return NextResponse.json(await setState(state));
}

export async function DELETE() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await resetState());
}

async function requireAdmin() {
  const cookieStore = await cookies();
  if (isValidAdminSession(cookieStore.get(adminCookieName)?.value)) return null;
  return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
}
