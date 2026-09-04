import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readStudentSession, studentCookieName } from "../../../../src/lib/auth";
import { getStudentToday } from "../../../../src/lib/learning";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  const cookieStore = await cookies();
  const session = readStudentSession(cookieStore.get(studentCookieName())?.value);
  if (!session?.studentId) return NextResponse.json({ authenticated: false });
  const payload = await getStudentToday(session.studentId);
  if (!payload?.student) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ ok: true, authenticated: true, ...payload });
}
