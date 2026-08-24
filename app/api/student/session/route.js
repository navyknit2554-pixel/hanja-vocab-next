import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getState } from "../../../../src/lib/serverStore";
import { readStudentSession, studentConfigError, studentCookieName } from "../../../../src/lib/studentAuth";
import { studentPayload } from "../../../../src/lib/studentPayload";

export const dynamic = "force-dynamic";

export async function GET() {
  const configError = studentConfigError();
  if (configError) return NextResponse.json({ authenticated: false, configError });

  const cookieStore = await cookies();
  const session = readStudentSession(cookieStore.get(studentCookieName)?.value);
  if (!session?.studentId) return NextResponse.json({ authenticated: false });
  const state = await getState(session.scopeKey);
  const student = state.students.find((item) => item.id === session.studentId);
  if (!student) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ ...studentPayload(state, student), authenticated: true });
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete(studentCookieName);
  return response;
}
