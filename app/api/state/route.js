import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminCookieName, readAdminSession } from "../../../src/lib/adminAuth";
import { getState, resetState, setState } from "../../../src/lib/serverStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireAdmin();
    if (access.denied) return access.denied;
    return NextResponse.json(await getState(access.scopeKey));
  } catch (error) {
    return stateErrorResponse(error, "학습 데이터를 불러오지 못했습니다.");
  }
}

export async function PUT(request) {
  try {
    const access = await requireAdmin();
    if (access.denied) return access.denied;
    const state = await request.json();
    return NextResponse.json(await setState(state, access.scopeKey));
  } catch (error) {
    return stateErrorResponse(error, "학습 데이터를 저장하지 못했습니다.");
  }
}

export async function DELETE() {
  try {
    const access = await requireAdmin();
    if (access.denied) return access.denied;
    return NextResponse.json(await resetState(access.scopeKey));
  } catch (error) {
    return stateErrorResponse(error, "학습 데이터를 초기화하지 못했습니다.");
  }
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore.get(adminCookieName)?.value);
  if (session.authenticated) return session;
  return { denied: NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 }) };
}

function stateErrorResponse(error, fallback) {
  const message = normalizeStateError(error, fallback);
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

function normalizeStateError(error, fallback) {
  const message = String(error?.message || "").trim();
  if (!message) return fallback;
  if (/database|postgres|neon|connection|timeout|fetch failed|ECONN|ENOTFOUND|password|authentication/i.test(message)) {
    return `${fallback} 데이터베이스 연결 또는 Vercel 환경변수를 확인해 주세요. (${message})`;
  }
  return `${fallback} ${message}`;
}
