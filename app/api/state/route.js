import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminCookieName, readAdminSession } from "../../../src/lib/adminAuth";
import { getState, resetState, setState } from "../../../src/lib/serverStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireAdmin();
  if (access.denied) return access.denied;
  return NextResponse.json(await getState(access.scopeKey));
}

export async function PUT(request) {
  const access = await requireAdmin();
  if (access.denied) return access.denied;
  const state = await request.json();
  return NextResponse.json(await setState(state, access.scopeKey));
}

export async function DELETE() {
  const access = await requireAdmin();
  if (access.denied) return access.denied;
  return NextResponse.json(await resetState(access.scopeKey));
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore.get(adminCookieName)?.value);
  if (session.authenticated) return session;
  return { denied: NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 }) };
}
