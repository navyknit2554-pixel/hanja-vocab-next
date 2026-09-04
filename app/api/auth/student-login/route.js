import { NextResponse } from "next/server";
import { createStudentSession, studentCookieName } from "../../../../src/lib/auth";
import { findStudentForLogin } from "../../../../src/lib/learning";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  let student;
  try {
    student = await findStudentForLogin({
      teacherCode: body.teacherCode,
      loginId: body.loginId,
      password: body.password
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error.message || "DB 연결 설정을 확인해 주세요." },
      { status: 500 }
    );
  }
  if (!student) {
    return NextResponse.json({ ok: false, message: "강사 코드, 아이디, 비밀번호를 확인해 주세요." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, student });
  response.cookies.set(studentCookieName(), createStudentSession(student.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}
