import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getState, setState } from "../../../../src/lib/serverStore";
import { readStudentSession, studentCookieName } from "../../../../src/lib/studentAuth";

export const dynamic = "force-dynamic";

export async function PUT(request) {
  const cookieStore = await cookies();
  const session = readStudentSession(cookieStore.get(studentCookieName)?.value);
  if (!session?.studentId) return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const lessonDay = Number(body.lessonDay);
  if (!lessonDay || (!body.stats && !body.game)) return NextResponse.json({ ok: false, message: "학습 결과 형식이 올바르지 않습니다." }, { status: 400 });

  const state = await getState(session.scopeKey);
  const student = state.students.find((item) => item.id === session.studentId);
  if (!student) return NextResponse.json({ ok: false, message: "학생 계정을 찾을 수 없습니다." }, { status: 404 });

  state.progress[student.id] ||= { completed: {}, quiz: {} };
  state.progress[student.id].games ||= {};
  if (body.game) {
    const game = body.game || {};
    const key = String(game.key || `${game.type || "game"}:${lessonDay}`);
    state.progress[student.id].games[key] = {
      type: String(game.type || "archery"),
      rangeStart: Number(game.rangeStart || lessonDay),
      rangeEnd: Number(game.rangeEnd || lessonDay),
      level: String(game.level || student.level || ""),
      score: Number(game.score || 0),
      hits: Number(game.hits || 0),
      total: Number(game.total || 0),
      missed: Number(game.missed || 0),
      accuracy: Number(game.accuracy || 0),
      cleared: Boolean(game.cleared),
      finishedAt: new Date().toISOString()
    };
    await setState(state, session.scopeKey);
    return NextResponse.json({ ok: true, student: withoutPassword(student), progress: state.progress[student.id] });
  }

  const mastered = Array.isArray(body.stats.wrong) ? body.stats.wrong.length === 0 : Boolean(body.stats.mastered);
  const previousRecord = state.progress[student.id].quiz?.[lessonDay] || {};
  state.progress[student.id].completed[lessonDay] = mastered;
  state.progress[student.id].unlocks ||= {};
  state.progress[student.id].quiz[lessonDay] = {
    correct: Number(body.stats.correct || 0),
    total: Number(body.stats.total || 0),
    wrong: Array.isArray(body.stats.wrong) ? body.stats.wrong : [],
    wrongHistory: Array.isArray(body.stats.wrongHistory) ? body.stats.wrongHistory : [],
    attempts: Number(previousRecord.attempts || 0) + 1,
    mastered,
    finishedAt: new Date().toISOString()
  };
  if (mastered) {
    const nextDay = lessonDay + 1;
    const hasNextLesson = state.curriculum.some((lesson) => Number(lesson.day) === nextDay && String(lesson.level || "").trim() === String(student.level || "").trim());
    if (hasNextLesson) {
      state.progress[student.id].unlocks[nextDay] ||= nextKoreanMidnightIso();
      if (Number(student.day || 1) <= lessonDay) student.day = nextDay;
    }
  }

  await setState(state, session.scopeKey);
  return NextResponse.json({ ok: true, student: withoutPassword(student), progress: state.progress[student.id] });
}

function nextKoreanMidnightIso() {
  const now = new Date();
  const koreanNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const nextMidnightUtcMs = Date.UTC(koreanNow.getUTCFullYear(), koreanNow.getUTCMonth(), koreanNow.getUTCDate() + 1, -9, 0, 0, 0);
  return new Date(nextMidnightUtcMs).toISOString();
}

function withoutPassword(student) {
  const { password, ...safeStudent } = student;
  return safeStudent;
}
