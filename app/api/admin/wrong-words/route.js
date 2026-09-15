import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin, teacherForAdmin } from "../../../../src/lib/adminAccess";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const teacher = await teacherForAdmin(admin, searchParams.get("teacherCode") || "");
    const db = await sql();
    const rows = await db`
      select
        w.id,
        w.word,
        w.hanja_word,
        w.meaning,
        w.question_type,
        w.wrong_count,
        w.first_wrong_at,
        w.last_wrong_at,
        s.id as student_id,
        s.name as student_name,
        s.grade,
        s.level,
        c.day
      from student_wrong_words w
      join students s on s.id = w.student_id
      join curriculum_days c on c.id = w.curriculum_day_id
      where s.teacher_id = ${teacher.id}
      order by w.last_wrong_at desc, c.day desc, s.name asc, w.word asc
    `;
    return NextResponse.json({ ok: true, teacher, wrongWords: rows });
  } catch (error) {
    return adminErrorResponse(error, NextResponse);
  }
}
