import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin, teacherForAdmin } from "../../../../src/lib/adminAccess";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const level = normalizeLevel(searchParams.get("level") || "초급");
    const teacher = await teacherForAdmin(admin, searchParams.get("teacherCode") || "");
    const db = await sql();

    const days = await db`
      select id, day, title
      from curriculum_days
      where level = ${level}
      order by day asc
    `;
    const students = await db`
      select id, name, login_id, grade, level, current_day
      from students
      where teacher_id = ${teacher.id}
        and level = ${level}
      order by current_day desc, name asc
    `;
    const progress = students.length && days.length ? await db`
      select
        p.student_id,
        c.day,
        p.status,
        p.correct_count,
        p.total_count,
        p.attempts,
        p.completed_at
      from student_progress p
      join curriculum_days c on c.id = p.curriculum_day_id
      where p.student_id in ${db(students.map((student) => student.id))}
        and c.level = ${level}
      order by p.student_id, c.day
    ` : [];

    return NextResponse.json({ ok: true, level, teacher, days, students, progress });
  } catch (error) {
    return adminErrorResponse(error, NextResponse);
  }
}

function normalizeLevel(level) {
  const value = String(level || "").trim();
  return ["초급", "중급", "고급"].includes(value) ? value : "초급";
}
