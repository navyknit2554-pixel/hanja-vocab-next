import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readStudentSession, studentCookieName } from "../../../../src/lib/auth";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request) {
  try {
    const context = await getStudentContext();
    if (context.error) return context.error;
    const { db, student } = context;
    const { searchParams } = new URL(request.url);
    const level = String(searchParams.get("level") || student.level || "").trim();
    const day = Number(searchParams.get("day") || student.current_day || 0);
    if (!level || !day) return NextResponse.json({ ok: false, message: "게임 범위를 확인해 주세요." }, { status: 400 });

    const leaderboard = await getGameLeaderboard(db, student, level, day);
    return NextResponse.json({ ok: true, leaderboard });
  } catch (error) {
    console.error("student game leaderboard failed", error);
    return NextResponse.json({ ok: false, message: "게임 랭킹을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const context = await getStudentContext();
    if (context.error) return context.error;
    const { db, student } = context;
    const body = await request.json().catch(() => ({}));
    const level = String(body.level || student.level || "").trim();
    const day = Number(body.day || student.current_day || 0);
    const score = clampInteger(body.score, 0, 999999);
    const clearedWords = clampInteger(body.clearedWords, 0, 9999);
    if (!level || !day) return NextResponse.json({ ok: false, message: "게임 범위를 확인해 주세요." }, { status: 400 });

    await db`
      insert into student_game_scores (student_id, level, day, score, cleared_words)
      values (${student.id}, ${level}, ${day}, ${score}, ${clearedWords})
    `;

    const leaderboard = await getGameLeaderboard(db, student, level, day);
    return NextResponse.json({ ok: true, leaderboard });
  } catch (error) {
    console.error("student game score save failed", error);
    return NextResponse.json({ ok: false, message: "게임 점수를 저장하지 못했습니다." }, { status: 500 });
  }
}

async function getStudentContext() {
  const cookieStore = await cookies();
  const session = readStudentSession(cookieStore.get(studentCookieName())?.value);
  if (!session?.studentId) return { error: NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 }) };
  const db = await sql();
  const rows = await db`
    select id, teacher_id, name, grade, level, current_day
    from students
    where id = ${session.studentId}
    limit 1
  `;
  const student = rows[0];
  if (!student) return { error: NextResponse.json({ ok: false, message: "학생 계정을 찾지 못했습니다." }, { status: 404 }) };
  return { db, student };
}

async function getGameLeaderboard(db, student, level, day) {
  const rows = await db`
    with best_scores as (
      select
        s.id,
        s.name,
        s.grade,
        max(g.score)::int as best_score,
        max(g.cleared_words)::int as cleared_words,
        max(g.created_at) as last_played_at
      from students s
      join student_game_scores g on g.student_id = s.id
      where s.teacher_id = ${student.teacher_id}
        and s.level = ${level}
        and g.level = ${level}
        and g.day = ${day}
      group by s.id
    )
    select *
    from best_scores
    order by best_score desc, cleared_words desc, last_played_at asc, name asc
    limit 10
  `;
  const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  return {
    currentStudentId: student.id,
    level,
    day,
    top: ranked.slice(0, 3),
    mine: ranked.find((row) => row.id === student.id) || null
  };
}

function clampInteger(value, min, max) {
  const number = Math.floor(Number(value || 0));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}
