import { NextResponse } from "next/server";
import { getState } from "../../../../src/lib/serverStore";
import { createStudentSession, studentConfigError, studentCookieName } from "../../../../src/lib/studentAuth";
import { scopeKeyFromTeacherCode } from "../../../../src/lib/licenseAuth";
import { studentPayload } from "../../../../src/lib/studentPayload";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const configError = studentConfigError();
  if (configError) return NextResponse.json({ ok: false, message: configError }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const scopeKey = scopeKeyFromTeacherCode(body.teacherCode || "master");
  const state = await getState(scopeKey);
  const student = state.students.find((item) => item.loginId === String(body.loginId || "").trim() && item.password === String(body.password || "").trim());
  if (!student) {
    return NextResponse.json({ ok: false, message: "아이디 또는 비밀번호를 확인해 주세요." }, { status: 401 });
  }
  const response = NextResponse.json(studentPayload(state, student));
  response.cookies.set(studentCookieName, createStudentSession(student.id, scopeKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}
