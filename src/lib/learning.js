import { sql } from "./db";

export async function findStudentForLogin({ teacherCode, loginId, password }) {
  const db = await sql();
  const teacherRows = await db`
    select id
    from teachers
    where code = ${String(teacherCode || "master").trim() || "master"}
    limit 1
  `;
  const teacher = teacherRows[0];
  if (!teacher) return null;
  const rows = await db`
    select id, teacher_id, name, login_id, grade, level, current_day, parent_token
    from students
    where teacher_id = ${teacher.id}
      and login_id = ${String(loginId || "").trim()}
      and password = ${String(password || "").trim()}
    limit 1
  `;
  return rows[0] || null;
}

export async function getStudentToday(studentId) {
  const db = await sql();
  const studentRows = await db`
    select id, teacher_id, name, login_id, grade, level, current_day, parent_token
    from students
    where id = ${studentId}
    limit 1
  `;
  const student = studentRows[0];
  if (!student) return null;

  const lessonDetail = await getLessonDetail({ level: student.level, day: student.current_day }, db);
  if (!lessonDetail) return { student, lesson: null, hanja: [] };

  return {
    student,
    lesson: lessonDetail.lesson,
    hanja: lessonDetail.hanja
  };
}

export async function getLessonDetail({ level, day }, existingDb) {
  const db = existingDb || await sql();
  const lessonRows = await db`
    select id, level, day, title, daily_count, review_after
    from curriculum_days
    where level = ${level}
      and day = ${day}
    limit 1
  `;
  const lesson = lessonRows[0];
  if (!lesson) return null;

  const hanjaRows = await db`
    select id, position, character, sound, meaning, radical, origin_note, relation_note, relation_role
    from hanja_items
    where curriculum_day_id = ${lesson.id}
    order by position asc
  `;
  if (!hanjaRows.length) return { lesson, hanja: [] };

  const vocabRows = await db`
    select
      v.id,
      v.hanja_item_id,
      v.position,
      v.hanja_word,
      v.word,
      v.meaning,
      v.source,
      v.needs_review,
      coalesce(
        json_agg(
          json_build_object('id', e.id, 'position', e.position, 'text', e.example_text, 'source', e.source)
          order by e.position
        ) filter (where e.id is not null),
        '[]'
      ) as examples
    from vocab_items v
    left join vocab_examples e on e.vocab_item_id = v.id
    where v.hanja_item_id in ${db(hanjaRows.map((item) => item.id))}
    group by v.id
    order by v.hanja_item_id, v.position
  `;
  const vocabByHanjaId = new Map();
  vocabRows.forEach((item) => {
    const list = vocabByHanjaId.get(item.hanja_item_id) || [];
    list.push(item);
    vocabByHanjaId.set(item.hanja_item_id, list);
  });

  return {
    lesson,
    hanja: hanjaRows.map((item) => ({ ...item, vocab: vocabByHanjaId.get(item.id) || [] }))
  };
}
