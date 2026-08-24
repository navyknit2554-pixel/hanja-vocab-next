import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStudentSessionPayload } from "../../../../src/lib/serverStore";
import { readStudentSession, studentConfigError, studentCookieName } from "../../../../src/lib/studentAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const configError = studentConfigError();
  if (configError) return NextResponse.json({ authenticated: false, configError });

  const cookieStore = await cookies();
  const session = readStudentSession(cookieStore.get(studentCookieName)?.value);
  if (!session?.studentId) return NextResponse.json({ authenticated: false });
  try {
    const payload = await withTimeout(getStudentSessionPayload(session.scopeKey, session.studentId));
    if (!payload?.student) return NextResponse.json({ authenticated: false });
    return NextResponse.json({ ok: true, ...payload, authenticated: true });
  } catch {
    return NextResponse.json({ authenticated: false, message: "세션 확인 시간이 초과되었습니다. 다시 로그인해 주세요." });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete(studentCookieName);
  return response;
}

function withTimeout(promise, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
  ]);
}
