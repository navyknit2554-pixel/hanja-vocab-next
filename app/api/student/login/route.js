import { NextResponse } from "next/server";
import { getStudentLoginPayload } from "../../../../src/lib/serverStore";
import { createStudentSession, studentConfigError, studentCookieName } from "../../../../src/lib/studentAuth";
import { scopeKeyFromTeacherCode } from "../../../../src/lib/licenseAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  const configError = studentConfigError();
  if (configError) return NextResponse.json({ ok: false, message: configError }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const teacherCode = String(body.teacherCode || "").trim();
  const loginId = String(body.loginId || "").trim();
  const password = String(body.password || "").trim();
  const scopeKey = scopeKeyFromTeacherCode(teacherCode || "master");
  let payload;
  try {
    payload = await withTimeout(getStudentLoginPayload(scopeKey, loginId, password), 25000);
  } catch {
    return NextResponse.json({ ok: false, message: "로그인 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요." }, { status: 504 });
  }
  if (!payload?.student) {
    return NextResponse.json({ ok: false, message: "아이디 또는 비밀번호를 확인해 주세요." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, ...payload });
  response.cookies.set(studentCookieName, createStudentSession(payload.student.id, payload.scopeKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}

function withTimeout(promise, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
  ]);
}
