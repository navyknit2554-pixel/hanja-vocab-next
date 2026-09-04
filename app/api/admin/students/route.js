import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin, teacherForAdmin } from "../../../../src/lib/adminAccess";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const db = await sql();
    const teacherCode = searchParams.get("teacherCode") || "";
    const teacher = await teacherForAdmin(admin, teacherCode);
    const students = await db`
      select
        s.id,
        s.name,
        s.login_id,
        s.password,
        s.phone,
        s.grade,
        s.level,
        s.current_day,
        s.created_at,
        s.updated_at,
        t.code as teacher_code,
        coalesce(count(p.id), 0)::int as progress_count,
        coalesce(count(p.id) filter (where p.status = 'completed'), 0)::int as completed_count,
        coalesce(count(p.id) filter (where p.status = 'needs_review'), 0)::int as review_count
      from students s
      join teachers t on t.id = s.teacher_id
      left join student_progress p on p.student_id = s.id
      where s.teacher_id = ${teacher.id}
      group by s.id, t.code
      order by s.current_day desc, s.name asc
    `;
    return NextResponse.json({ ok: true, teacher, students });
  } catch (error) {
    return adminErrorResponse(error, NextResponse);
  }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const teacher = await teacherForAdmin(admin, body.teacherCode);
    const student = normalizeStudent(body);
    if (!student.name || !student.loginId || !student.password) {
      return NextResponse.json({ ok: false, message: "이름, 아이디, 비밀번호를 입력해 주세요." }, { status: 400 });
    }
    const db = await sql();
    await db`
      insert into students (teacher_id, name, login_id, password, phone, grade, level, current_day)
      values (${teacher.id}, ${student.name}, ${student.loginId}, ${student.password}, ${student.phone}, ${student.grade}, ${student.level}, ${student.currentDay})
      on conflict (teacher_id, login_id)
      do update set
        name = excluded.name,
        password = excluded.password,
        phone = excluded.phone,
        grade = excluded.grade,
        level = excluded.level,
        current_day = excluded.current_day,
        updated_at = now()
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error, NextResponse);
  }
}

export async function PATCH(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const student = normalizeStudent(body);
    if (!id || !student.name || !student.loginId || !student.password) {
      return NextResponse.json({ ok: false, message: "학생 정보를 확인해 주세요." }, { status: 400 });
    }
    const db = await sql();
    const existing = await studentForAdmin(db, admin, id);
    await db`
      update students
      set name = ${student.name},
          login_id = ${student.loginId},
          password = ${student.password},
          phone = ${student.phone},
          grade = ${student.grade},
          level = ${student.level},
          current_day = ${student.currentDay},
          updated_at = now()
      where id = ${existing.id}
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error, NextResponse);
  }
}

export async function DELETE(request) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ ok: false, message: "삭제할 학생을 찾지 못했습니다." }, { status: 400 });
    const db = await sql();
    const existing = await studentForAdmin(db, admin, id);
    await db`delete from students where id = ${existing.id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error, NextResponse);
  }
}

async function studentForAdmin(db, admin, studentId) {
  const rows = await db`
    select s.id, t.code as teacher_code
    from students s
    join teachers t on t.id = s.teacher_id
    where s.id = ${studentId}
    limit 1
  `;
  const student = rows[0];
  if (!student) throw Object.assign(new Error("학생을 찾지 못했습니다."), { status: 404 });
  if (admin.role !== "master" && student.teacher_code !== admin.teacherCode) {
    throw Object.assign(new Error("자기 학생만 관리할 수 있습니다."), { status: 403 });
  }
  return student;
}

function normalizeStudent(body) {
  const level = String(body.level || "초급").trim();
  const phone = String(body.phone || "").trim();
  return {
    name: String(body.name || "").trim(),
    loginId: String(body.loginId || body.login_id || "").trim(),
    password: String(body.password || passwordFromPhone(phone)).trim(),
    phone,
    grade: String(body.grade || "초1").trim(),
    level: ["초급", "중급", "고급"].includes(level) ? level : "초급",
    currentDay: Math.min(100, Math.max(1, Number(body.currentDay || body.current_day || 1)))
  };
}

function passwordFromPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.startsWith("010") ? digits.slice(3) : digits;
}
