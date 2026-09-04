const postgres = require("postgres");

const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.OLD_DATABASE_URL || process.env.NEON_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const write = process.argv.includes("--write");

if (!sourceUrl || !targetUrl) {
  console.error("기존 앱 DB 주소와 새 v2 DB 주소가 모두 필요합니다.");
  console.error("미리보기:");
  console.error("$env:SOURCE_DATABASE_URL=\"기존 앱 app_state가 있는 DB 연결 문자열\"");
  console.error("$env:SUPABASE_DATABASE_URL=\"새 v2 Supabase 연결 문자열\"");
  console.error("npm.cmd run import:legacy-students");
  console.error("\n실제 반영:");
  console.error("npm.cmd run import:legacy-students -- --write");
  process.exit(1);
}

const source = postgres(sourceUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
  idle_timeout: 20,
  connect_timeout: 20
});

const target = postgres(targetUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
  idle_timeout: 20,
  connect_timeout: 20
});

main()
  .catch((error) => {
    console.error("\n기존 학생 가져오기에 실패했습니다.");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.end({ timeout: 5 }).catch(() => {});
    await target.end({ timeout: 5 }).catch(() => {});
  });

async function main() {
  await withConnectionLabel("SUPABASE_DATABASE_URL", ensureTargetSchema);
  await withConnectionLabel("SOURCE_DATABASE_URL", assertSourceHasAppState);
  const rows = await source`select key, data, updated_at from app_state order by updated_at desc`;
  const plans = rows.flatMap((row) => buildImportPlans(row));

  console.log(`app_state ${rows.length}개에서 학생 ${plans.length}명을 찾았습니다.`);
  const byTeacher = plans.reduce((map, item) => {
    const current = map.get(item.teacherCode) || 0;
    map.set(item.teacherCode, current + 1);
    return map;
  }, new Map());
  console.table([...byTeacher.entries()].map(([teacherCode, students]) => ({ teacherCode, students })));

  if (!plans.length) return;
  console.log("\n미리보기 10명:");
  console.table(plans.slice(0, 10).map((item) => ({
    teacherCode: item.teacherCode,
    name: item.student.name,
    loginId: item.student.loginId,
    grade: item.student.grade,
    level: item.student.level,
    currentDay: item.student.currentDay,
    legacyId: item.student.legacyId
  })));

  if (!write) {
    console.log("\n아직 DB에 반영하지 않았습니다. 실제 반영하려면:");
    console.log("npm.cmd run import:legacy-students -- --write");
    return;
  }

  let insertedOrUpdated = 0;
  let progressCount = 0;
  let skippedProgressCount = 0;
  for (const plan of plans) {
    const teacherId = await upsertTeacher(plan.teacherCode);
    const studentId = await upsertStudent(teacherId, plan.student);
    const result = await upsertProgress(studentId, plan.student, plan.progress);
    progressCount += result.saved;
    skippedProgressCount += result.skipped;
    insertedOrUpdated += 1;
  }

  console.log(`\n완료: 학생 ${insertedOrUpdated}명을 v2 students 테이블에 반영했습니다.`);
  console.log(`진도 ${progressCount}건을 student_progress 테이블에 반영했습니다.`);
  if (skippedProgressCount) console.log(`v2에 아직 없는 커리큘럼 일차 진도 ${skippedProgressCount}건은 건너뛰었습니다.`);
  const countRows = await target`
    select t.code as teacher_code, count(s.id)::int as students
    from teachers t
    left join students s on s.teacher_id = t.id
    group by t.code
    order by t.code
  `;
  console.table(countRows);
}

async function withConnectionLabel(label, task) {
  try {
    return await task();
  } catch (error) {
    const message = error?.message || String(error);
    throw new Error(`${label} 확인 실패: ${message}`);
  }
}

async function assertSourceHasAppState() {
  const rows = await source`
    select to_regclass('public.app_state') as table_name
  `;
  if (!rows[0]?.table_name) {
    throw new Error([
      "SOURCE_DATABASE_URL DB에 app_state 테이블이 없습니다.",
      "기존 앱이 쓰던 DB 연결 문자열을 SOURCE_DATABASE_URL에 넣어야 합니다.",
      "새 v2 Supabase 연결 문자열은 SUPABASE_DATABASE_URL에 넣어 주세요."
    ].join("\n"));
  }
}

function buildImportPlans(row) {
  const data = normalizeJsonData(row.data);
  const students = Array.isArray(data?.students) ? data.students : [];
  const progressByStudent = data?.progress && typeof data.progress === "object" ? data.progress : {};
  const teacherCode = teacherCodeFromScopeKey(row.key);
  return students
    .map((student, index) => normalizeLegacyStudent(student, index))
    .filter(Boolean)
    .map((student) => ({ teacherCode, student, progress: progressByStudent[student.legacyId] || {} }));
}

function normalizeLegacyStudent(student, index) {
  const name = clean(student?.name) || `학생 ${index + 1}`;
  const loginId = clean(student?.loginId) || name;
  const password = clean(student?.password);
  if (!loginId || !password) return null;
  return {
    legacyId: clean(student?.id) || `${loginId}-${index}`,
    name,
    loginId,
    password,
    phone: clean(student?.phone),
    grade: normalizeGrade(student?.grade),
    level: normalizeLevel(student?.level),
    currentDay: clampDay(student?.day || student?.currentDay),
    parentToken: clean(student?.parentToken)
  };
}

async function upsertTeacher(code) {
  const name = code === "master" ? "마스터" : code;
  const rows = await target`
    insert into teachers (name, code)
    values (${name}, ${code})
    on conflict (code)
    do update set name = excluded.name
    returning id
  `;
  return rows[0].id;
}

async function upsertStudent(teacherId, student) {
  const legacyRows = student.legacyId ? await target`
    select id from students where teacher_id = ${teacherId} and legacy_id = ${student.legacyId} limit 1
  ` : [];

  if (legacyRows[0]?.id) {
    await target`
      update students
      set name = ${student.name},
          login_id = ${student.loginId},
          password = ${student.password},
          phone = ${student.phone},
          grade = ${student.grade},
          level = ${student.level},
          current_day = ${student.currentDay},
          parent_token = coalesce(nullif(${student.parentToken}, ''), parent_token),
          updated_at = now()
      where id = ${legacyRows[0].id}
    `;
    return legacyRows[0].id;
  }

  const rows = await target`
    insert into students (teacher_id, name, login_id, password, phone, grade, level, current_day, parent_token, legacy_id)
    values (
      ${teacherId},
      ${student.name},
      ${student.loginId},
      ${student.password},
      ${student.phone},
      ${student.grade},
      ${student.level},
      ${student.currentDay},
      coalesce(nullif(${student.parentToken}, ''), encode(gen_random_bytes(18), 'hex')),
      ${student.legacyId}
    )
    on conflict (teacher_id, login_id)
    do update set
      name = excluded.name,
      password = excluded.password,
      phone = excluded.phone,
      grade = excluded.grade,
      level = excluded.level,
      current_day = excluded.current_day,
      parent_token = excluded.parent_token,
      legacy_id = excluded.legacy_id,
      updated_at = now()
    returning id
  `;
  return rows[0].id;
}

async function upsertProgress(studentId, student, progress) {
  const records = buildProgressRecords(student, progress);
  let saved = 0;
  let skipped = 0;
  for (const record of records) {
    const lessonRows = await target`
      select id
      from curriculum_days
      where level = ${student.level}
        and day = ${record.day}
      limit 1
    `;
    const lesson = lessonRows[0];
    if (!lesson) {
      skipped += 1;
      continue;
    }
    await target`
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
        ${studentId},
        ${lesson.id},
        ${record.status},
        ${record.unlockedAt},
        ${record.startedAt},
        ${record.completedAt},
        ${record.correctCount},
        ${record.totalCount},
        ${record.attempts}
      )
      on conflict (student_id, curriculum_day_id)
      do update set
        status = excluded.status,
        unlocked_at = excluded.unlocked_at,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        correct_count = excluded.correct_count,
        total_count = excluded.total_count,
        attempts = excluded.attempts
    `;
    saved += 1;
  }
  return { saved, skipped };
}

async function ensureTargetSchema() {
  await target`create extension if not exists pgcrypto`;
  await target`
    create table if not exists teachers (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      code text not null unique,
      license_key text unique,
      license_expires_at timestamptz,
      created_at timestamptz not null default now(),
      last_login_at timestamptz
    )
  `;
  await target`
    create table if not exists students (
      id uuid primary key default gen_random_uuid(),
      teacher_id uuid not null references teachers(id) on delete cascade,
      name text not null,
      login_id text not null,
      password text not null,
      phone text not null default '',
      grade text not null,
      level text not null check (level in ('초급', '중급', '고급')),
      current_day integer not null default 1,
      start_date date not null default current_date,
      parent_token text not null default encode(gen_random_bytes(18), 'hex'),
      legacy_id text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (teacher_id, login_id)
    )
  `;
  await target`alter table students add column if not exists legacy_id text not null default ''`;
  await target`create index if not exists students_teacher_login_idx on students (teacher_id, login_id, password)`;
  await target`create unique index if not exists students_teacher_legacy_idx on students (teacher_id, legacy_id) where legacy_id <> ''`;
  await target`
    create table if not exists curriculum_days (
      id uuid primary key default gen_random_uuid(),
      level text not null check (level in ('초급', '중급', '고급')),
      day integer not null check (day between 1 and 100),
      title text not null default '',
      daily_count integer not null default 4,
      review_after boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (level, day)
    )
  `;
  await target`
    create table if not exists student_progress (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references students(id) on delete cascade,
      curriculum_day_id uuid not null references curriculum_days(id) on delete cascade,
      status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'needs_review')),
      unlocked_at timestamptz,
      started_at timestamptz,
      completed_at timestamptz,
      correct_count integer not null default 0,
      total_count integer not null default 0,
      attempts integer not null default 0,
      unique (student_id, curriculum_day_id)
    )
  `;
  await target`create index if not exists progress_student_day_idx on student_progress (student_id, curriculum_day_id)`;
}

function buildProgressRecords(student, progress) {
  const completed = progress?.completed && typeof progress.completed === "object" ? progress.completed : {};
  const quiz = progress?.quiz && typeof progress.quiz === "object" ? progress.quiz : {};
  const unlocks = progress?.unlocks && typeof progress.unlocks === "object" ? progress.unlocks : {};
  const days = new Set([
    ...Object.keys(completed),
    ...Object.keys(quiz),
    ...Object.keys(unlocks),
    String(student.currentDay)
  ]);

  return [...days]
    .map((dayKey) => Number(dayKey))
    .filter((day) => Number.isFinite(day) && day >= 1 && day <= 100)
    .sort((left, right) => left - right)
    .map((day) => {
      const record = quiz[String(day)] || quiz[day] || {};
      const wasCompleted = Boolean(completed[String(day)] ?? completed[day]);
      const wrong = Array.isArray(record.wrong) ? record.wrong : [];
      const status = wasCompleted && !wrong.length
        ? "completed"
        : wrong.length
          ? "needs_review"
          : Number(record.total || 0) > 0
            ? "in_progress"
            : day === student.currentDay
              ? "in_progress"
              : "not_started";
      const finishedAt = validDateOrNull(record.finishedAt);
      const unlockAt = validDateOrNull(unlocks[String(day)] || unlocks[day]);
      return {
        day,
        status,
        unlockedAt: unlockAt || (day <= student.currentDay ? new Date(0).toISOString() : null),
        startedAt: Number(record.total || 0) > 0 ? finishedAt : null,
        completedAt: status === "completed" ? finishedAt : null,
        correctCount: Math.max(0, Number(record.correct || 0)),
        totalCount: Math.max(0, Number(record.total || 0)),
        attempts: Math.max(0, Number(record.attempts || (record.total ? 1 : 0)))
      };
    });
}

function validDateOrNull(value) {
  const text = clean(value);
  if (!text || text === "open") return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function teacherCodeFromScopeKey(key) {
  const value = clean(key);
  if (!value || value === "main") return "master";
  return value.startsWith("teacher:") ? value.slice("teacher:".length) : value;
}

function normalizeJsonData(data) {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function normalizeGrade(grade) {
  const value = clean(grade);
  return value || "초1";
}

function normalizeLevel(level) {
  const value = clean(level);
  return ["초급", "중급", "고급"].includes(value) ? value : "초급";
}

function clampDay(day) {
  const value = Number(day || 1);
  if (!Number.isFinite(value)) return 1;
  return Math.min(100, Math.max(1, Math.round(value)));
}

function clean(value) {
  return String(value || "").trim();
}
