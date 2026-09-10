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
  const leaderboard = await getLeaderboards(student, db);

  const currentLessonRows = await db`
    select id
    from curriculum_days
    where level = ${student.level}
      and day = ${student.current_day}
    limit 1
  `;
  const currentLesson = currentLessonRows[0];
  const lockUntil = nextKoreaMidnight();
  if (currentLesson) {
    const progressRows = await db`
      select status, unlocked_at, completed_at
      from student_progress
      where student_id = ${student.id}
        and curriculum_day_id = ${currentLesson.id}
      limit 1
    `;
    const progress = progressRows[0];
    const unlockedAt = progress?.unlocked_at ? new Date(progress.unlocked_at) : null;
    if (unlockedAt && unlockedAt.getTime() > Date.now()) {
      return {
        student,
        lesson: null,
        hanja: [],
        leaderboard,
        lock: {
          day: Number(student.current_day),
          availableAt: unlockedAt.toISOString(),
          previousDay: Math.max(1, Number(student.current_day) - 1)
        }
      };
    }
  }
  if (!currentLesson && Number(student.current_day) > 1) {
    const dayStart = koreaTodayStart();
    const recentCompletionRows = await db`
      select p.completed_at
      from student_progress p
      join curriculum_days c on c.id = p.curriculum_day_id
      where p.student_id = ${student.id}
        and c.level = ${student.level}
        and c.day = ${Number(student.current_day) - 1}
        and p.status = 'completed'
        and p.completed_at >= ${dayStart.toISOString()}
        and p.completed_at < ${lockUntil.toISOString()}
      limit 1
    `;
    if (recentCompletionRows[0]) {
      return {
        student,
        lesson: null,
        hanja: [],
        leaderboard,
        lock: {
          day: Number(student.current_day),
          availableAt: lockUntil.toISOString(),
          previousDay: Number(student.current_day) - 1
        }
      };
    }
  }

  const lessonDetail = await getLessonDetail({ level: student.level, day: student.current_day }, db);
  if (!lessonDetail) return { student, lesson: null, hanja: [], leaderboard };

  return {
    student,
    lesson: lessonDetail.lesson,
    hanja: lessonDetail.hanja,
    leaderboard
  };
}

async function getLeaderboards(student, db) {
  const rows = await db`
    select
      s.id,
      s.name,
      s.grade,
      s.level,
      s.current_day,
      count(p.id) filter (where p.status = 'completed')::int as completed_count,
      coalesce(sum(p.correct_count), 0)::int as correct_count,
      coalesce(sum(p.total_count), 0)::int as total_count,
      max(p.completed_at) as last_completed_at
    from students s
    left join student_progress p on p.student_id = s.id
    where s.teacher_id = ${student.teacher_id}
    group by s.id
  `;

  const rankedRows = rows.map((row) => ({
    ...row,
    accuracy: Number(row.total_count) > 0 ? Math.round((Number(row.correct_count) / Number(row.total_count)) * 100) : 0
  }));
  const scopes = [
    { key: "all", label: "전체", title: "전체 랭킹", rows: rankedRows },
    { key: "elementary", label: "초등부", title: "초등부 랭킹", rows: rankedRows.filter((row) => /^초[1-6]$/.test(String(row.grade || ""))) },
    { key: "middle", label: "중등부", title: "중등부 랭킹", rows: rankedRows.filter((row) => /^중[1-3]$/.test(String(row.grade || ""))) },
    { key: "high", label: "고등부", title: "고등부 랭킹", rows: rankedRows.filter((row) => /^고[1-3]$/.test(String(row.grade || ""))) }
  ];

  return {
    currentStudentId: student.id,
    scopes: scopes.map((scope) => rankLeaderboardScope(scope, student.id))
  };
}

function rankLeaderboardScope(scope, currentStudentId) {
  const ranked = [...scope.rows]
    .sort(compareLeaderboardRows)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  return {
    key: scope.key,
    label: scope.label,
    title: scope.title,
    top: ranked.slice(0, 3),
    mine: ranked.find((row) => row.id === currentStudentId) || null
  };
}

function compareLeaderboardRows(left, right) {
  return Number(right.completed_count) - Number(left.completed_count)
    || Number(right.current_day) - Number(left.current_day)
    || Number(right.total_count) - Number(left.total_count)
    || compareNullableDates(left.last_completed_at, right.last_completed_at)
    || String(left.name || "").localeCompare(String(right.name || ""), "ko");
}

function compareNullableDates(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return new Date(left).getTime() - new Date(right).getTime();
}

export function nextKoreaMidnight(date = new Date()) {
  const values = koreaDateParts(date);
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1, -9, 0, 0));
}

function koreaTodayStart(date = new Date()) {
  const values = koreaDateParts(date);
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), -9, 0, 0));
}

function koreaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
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
