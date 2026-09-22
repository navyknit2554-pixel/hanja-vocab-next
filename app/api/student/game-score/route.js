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
    const gameType = normalizeGameType(searchParams.get("gameType"));
    if (!level || !day) return NextResponse.json({ ok: false, message: "게임 범위를 확인해 주세요." }, { status: 400 });

    const leaderboard = await getGameLeaderboard(db, student, gameType);
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
    const gameType = normalizeGameType(body.gameType);
    const score = clampInteger(body.score, 0, 999999);
    const clearedWords = clampInteger(body.clearedWords, 0, 9999);
    if (!level || !day) return NextResponse.json({ ok: false, message: "게임 범위를 확인해 주세요." }, { status: 400 });

    await db`
      insert into student_game_scores (student_id, game_type, level, day, score, cleared_words)
      values (${student.id}, ${gameType}, ${level}, ${day}, ${score}, ${clearedWords})
    `;

    const leaderboard = await getGameLeaderboard(db, student, gameType);
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

async function getGameLeaderboard(db, student, gameType) {
  const rows = await db`
    with ranked_scores as (
      select
        s.id,
        s.name,
        s.grade,
        s.level,
        g.day,
        g.score::int as best_score,
        g.cleared_words::int as cleared_words,
        g.created_at as last_played_at,
        row_number() over (
          partition by s.id
          order by g.score desc, g.cleared_words desc, g.created_at asc
        ) as score_rank
      from students s
      join student_game_scores g on g.student_id = s.id
      where s.teacher_id = ${student.teacher_id}
        and g.game_type = ${gameType}
    )
    select *
    from ranked_scores
    where score_rank = 1
    order by best_score desc, cleared_words desc, last_played_at asc, name asc
  `;
  const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  const scopes = [
    { key: "all", label: "전체", title: "전체 게임 랭킹", rows: ranked },
    { key: "elementary", label: "초등부", title: "초등부 게임 랭킹", rows: ranked.filter((row) => /^초[1-6]$/.test(String(row.grade || ""))) },
    { key: "middle", label: "중등부", title: "중등부 게임 랭킹", rows: ranked.filter((row) => /^중[1-3]$/.test(String(row.grade || ""))) },
    { key: "high", label: "고등부", title: "고등부 게임 랭킹", rows: ranked.filter((row) => /^고[1-3]$/.test(String(row.grade || ""))) }
  ];
  return {
    currentStudentId: student.id,
    gameType,
    scopes: scopes.map((scope) => rankGameScope(scope, student.id))
  };
}

function normalizeGameType(value) {
  const type = String(value || "block").trim();
  if (type === "runner" || type === "chain") return type;
  return "block";
}

function rankGameScope(scope, currentStudentId) {
  const ranked = scope.rows.map((row, index) => ({ ...row, rank: index + 1 }));
  return {
    key: scope.key,
    label: scope.label,
    title: scope.title,
    top: ranked.slice(0, 3),
    mine: ranked.find((row) => row.id === currentStudentId) || null
  };
}

function clampInteger(value, min, max) {
  const number = Math.floor(Number(value || 0));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}
