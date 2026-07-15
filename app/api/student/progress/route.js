import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getState, setState } from "../../../../src/lib/serverStore";
import { readStudentSession, studentCookieName } from "../../../../src/lib/studentAuth";

export const dynamic = "force-dynamic";

export async function PUT(request) {
  const cookieStore = await cookies();
  const studentId = readStudentSession(cookieStore.get(studentCookieName)?.value);
  if (!studentId) return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const lessonDay = Number(body.lessonDay);
  if (!lessonDay || !body.stats) return NextResponse.json({ ok: false, message: "학습 결과 형식이 올바르지 않습니다." }, { status: 400 });

  const state = await getState();
  const student = state.students.find((item) => item.id === studentId);
  if (!student) return NextResponse.json({ ok: false, message: "학생 계정을 찾을 수 없습니다." }, { status: 404 });

  const mastered = Array.isArray(body.stats.wrong) ? body.stats.wrong.length === 0 : Boolean(body.stats.mastered);
  state.progress[studentId] ||= { completed: {}, quiz: {} };
  const previousRecord = state.progress[studentId].quiz?.[lessonDay] || {};
  state.progress[studentId].completed[lessonDay] = mastered;
  state.progress[studentId].quiz[lessonDay] = {
    correct: Number(body.stats.correct || 0),
    total: Number(body.stats.total || 0),
    wrong: Array.isArray(body.stats.wrong) ? body.stats.wrong : [],
    wrongHistory: Array.isArray(body.stats.wrongHistory) ? body.stats.wrongHistory : [],
    attempts: Number(previousRecord.attempts || 0) + 1,
    mastered,
    finishedAt: new Date().toISOString()
  };

  await setState(state);
  return NextResponse.json({ ok: true, progress: state.progress[studentId] });
}
