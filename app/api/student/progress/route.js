import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readStudentSession, studentCookieName } from "../../../../src/lib/auth";
import { sql } from "../../../../src/lib/db";
import { getStudentToday } from "../../../../src/lib/learning";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function PUT(request) {
  try {
    const cookieStore = await cookies();
    const session = readStudentSession(cookieStore.get(studentCookieName())?.value);
    if (!session?.studentId) return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const lessonDay = Number(body.lessonDay || 0);
    const stats = body.stats || {};
    if (!lessonDay) return NextResponse.json({ ok: false, message: "학습 일차를 확인해 주세요." }, { status: 400 });

    const db = await sql();
    const studentRows = await db`
      select id, level, current_day
      from students
      where id = ${session.studentId}
      limit 1
    `;
    const student = studentRows[0];
    if (!student) return NextResponse.json({ ok: false, message: "학생 계정을 찾지 못했습니다." }, { status: 404 });

    const lessonRows = await db`
      select id
      from curriculum_days
      where level = ${student.level}
        and day = ${lessonDay}
      limit 1
    `;
    const lesson = lessonRows[0];
    if (!lesson) return NextResponse.json({ ok: false, message: "학습 일차를 찾지 못했습니다." }, { status: 404 });

    const wrong = Array.isArray(stats.wrong) ? stats.wrong : [];
    const total = Math.max(0, Number(stats.total || 0));
    const correct = Math.max(0, Number(stats.correct || 0));
    const completed = total > 0 && wrong.length === 0;
    const status = completed ? "completed" : wrong.length ? "needs_review" : total ? "in_progress" : "not_started";

    const previous = await db`
      select attempts
      from student_progress
      where student_id = ${student.id}
        and curriculum_day_id = ${lesson.id}
      limit 1
    `;
    const attempts = Math.max(1, Number(previous[0]?.attempts || 0) + 1);

    await db`
      insert into student_progress (
        student_id,
        curriculum_day_id,
        status,
        unlocked_at,
        started_at,
        completed_at,
        correct_count,
        total_count,
        attempts
      )
      values (
        ${student.id},
        ${lesson.id},
        ${status},
        coalesce((select unlocked_at from student_progress where student_id = ${student.id} and curriculum_day_id = ${lesson.id}), now()),
        coalesce((select started_at from student_progress where student_id = ${student.id} and curriculum_day_id = ${lesson.id}), now()),
        ${completed ? new Date().toISOString() : null},
        ${correct},
        ${total},
        ${attempts}
      )
      on conflict (student_id, curriculum_day_id)
      do update set
        status = excluded.status,
        started_at = coalesce(student_progress.started_at, excluded.started_at),
        completed_at = excluded.completed_at,
        correct_count = excluded.correct_count,
        total_count = excluded.total_count,
        attempts = excluded.attempts
    `;

    if (completed && Number(student.current_day) <= lessonDay) {
      const nextRows = await db`
        select id
        from curriculum_days
        where level = ${student.level}
          and day = ${lessonDay + 1}
        limit 1
      `;
      if (nextRows[0]) {
        await db`
          update students
          set current_day = ${lessonDay + 1},
              updated_at = now()
          where id = ${student.id}
        `;
      }
    }

    const payload = await getStudentToday(student.id);
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    console.error("student progress save failed", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "학습 결과를 저장하지 못했습니다." },
      { status: 500 }
    );
  }
}
