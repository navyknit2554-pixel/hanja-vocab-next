const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

loadLocalEnv();

const write = process.argv.includes("--write");
const planPath = path.join(__dirname, "..", "data", "beginner-curriculum-21-100.js");
const targetUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const level = "초급";
const startDay = 21;

if (!targetUrl) {
  console.error("SUPABASE_DATABASE_URL 또는 DATABASE_URL이 필요합니다.");
  process.exit(1);
}

const db = postgres(targetUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
  idle_timeout: 20,
  connect_timeout: 20
});

main()
  .catch((error) => {
    console.error("\n커리큘럼 확장 반영에 실패했습니다.");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });

async function main() {
  const plan = require(planPath).map((line, index) => parseLessonLine(line, startDay + index));
  validatePlan(plan);
  await ensureTargetSchema();

  const previousRows = await db`
    select c.day, string_agg(h.character, '' order by h.position) as hanja
    from curriculum_days c
    join hanja_items h on h.curriculum_day_id = c.id
    where c.level = ${level}
    group by c.day
    order by c.day
  `;
  const previousByDay = new Map(previousRows.map((row) => [Number(row.day), row.hanja]));

  console.log(`${level} ${startDay}~${startDay + plan.length - 1}일차 구성안: ${plan.length}일차, 한자 ${plan.length * 4}개`);
  console.table(plan.slice(0, 12).map((lesson) => ({
    day: lesson.day,
    hanja: lesson.hanja.map((item) => item.character).join(""),
    reading: lesson.hanja.map((item) => `${item.meaning} ${item.sound}`).join(" / "),
    before: previousByDay.get(lesson.day) || ""
  })));

  const changed = plan.filter((lesson) => previousByDay.get(lesson.day) !== lesson.hanja.map((item) => item.character).join(""));
  console.log(`\n변경 예정: ${changed.length}일차`);
  if (!write) {
    console.log("아직 DB에 반영하지 않았습니다. 실제 반영하려면:");
    console.log("npm.cmd run curriculum:extend -- --write");
    return;
  }

  let savedLessons = 0;
  let savedHanja = 0;
  let clearedVocab = 0;
  for (const lesson of plan) {
    const lessonId = await upsertLesson(lesson);
    const result = await upsertHanjaItems(lessonId, lesson.hanja);
    savedLessons += 1;
    savedHanja += result.saved;
    clearedVocab += result.clearedVocab;
  }

  console.log(`\n완료: ${savedLessons}일차, 한자 ${savedHanja}개를 반영했습니다.`);
  if (clearedVocab) {
    console.log(`한자가 바뀐 자리의 기존 어휘 ${clearedVocab}묶음은 지웠습니다. 새 한자별 어휘는 관리자 화면에서 국어원 가져오기로 채우면 됩니다.`);
  }
}

function parseLessonLine(line, day) {
  const hanja = String(line || "").trim().split(/\s+/).map((token) => {
    const [character, sound, meaning] = token.split(":");
    return {
      character: clean(character),
      sound: clean(sound),
      meaning: clean(meaning),
      radical: clean(character)
    };
  });
  return {
    level,
    day,
    title: `${level} ${day}일차`,
    dailyCount: 4,
    reviewAfter: false,
    hanja
  };
}

function validatePlan(plan) {
  if (plan.length !== 80) throw new Error(`구성안은 80일차여야 합니다. 현재 ${plan.length}일차입니다.`);
  const seenDay = new Set();
  const seenCharacter = new Map();
  const invalid = [];

  for (const lesson of plan) {
    if (seenDay.has(lesson.day)) invalid.push(`${lesson.day}일차가 중복되었습니다.`);
    seenDay.add(lesson.day);
    if (lesson.hanja.length !== 4) invalid.push(`${lesson.day}일차 한자가 4개가 아닙니다.`);
    lesson.hanja.forEach((item, index) => {
      if (!/^[\u3400-\u9fff]$/.test(item.character)) {
        invalid.push(`${lesson.day}일차 ${index + 1}번째 '${item.character}'는 한 글자 한자가 아닙니다.`);
      }
      if (!item.sound || !item.meaning) {
        invalid.push(`${lesson.day}일차 ${item.character}의 음/뜻이 비었습니다.`);
      }
      const existing = seenCharacter.get(item.character);
      if (existing) {
        invalid.push(`${item.character} 중복: ${existing}일차와 ${lesson.day}일차`);
      } else {
        seenCharacter.set(item.character, lesson.day);
      }
    });
  }

  if (invalid.length) throw new Error(invalid.slice(0, 30).join("\n"));
}

async function upsertLesson(lesson) {
  const rows = await db`
    insert into curriculum_days (level, day, title, daily_count, review_after)
    values (${lesson.level}, ${lesson.day}, ${lesson.title}, ${lesson.dailyCount}, ${lesson.reviewAfter})
    on conflict (level, day)
    do update set
      title = excluded.title,
      daily_count = excluded.daily_count,
      review_after = excluded.review_after,
      updated_at = now()
    returning id
  `;
  return rows[0].id;
}

async function upsertHanjaItems(lessonId, hanjaItems) {
  let saved = 0;
  let clearedVocab = 0;
  for (let index = 0; index < hanjaItems.length; index += 1) {
    const item = hanjaItems[index];
    const position = index + 1;
    const existingRows = await db`
      select id, character
      from hanja_items
      where curriculum_day_id = ${lessonId}
        and position = ${position}
      limit 1
    `;
    const existing = existingRows[0];
    if (existing?.id && existing.character !== item.character) {
      await db`delete from vocab_items where hanja_item_id = ${existing.id}`;
      clearedVocab += 1;
    }
    await db`
      insert into hanja_items (curriculum_day_id, position, character, sound, meaning, radical, origin_note, relation_note, relation_role)
      values (${lessonId}, ${position}, ${item.character}, ${item.sound}, ${item.meaning}, ${item.radical}, '', '', '')
      on conflict (curriculum_day_id, position)
      do update set
        character = excluded.character,
        sound = excluded.sound,
        meaning = excluded.meaning,
        radical = excluded.radical,
        origin_note = '',
        relation_note = '',
        relation_role = '',
        updated_at = now()
    `;
    saved += 1;
  }
  return { saved, clearedVocab };
}

async function ensureTargetSchema() {
  await db`create extension if not exists pgcrypto`;
  await db`
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
  await db`
    create table if not exists hanja_items (
      id uuid primary key default gen_random_uuid(),
      curriculum_day_id uuid not null references curriculum_days(id) on delete cascade,
      position integer not null,
      character text not null,
      sound text not null,
      meaning text not null,
      radical text not null default '',
      origin_note text not null default '',
      relation_note text not null default '',
      relation_role text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (curriculum_day_id, position)
    )
  `;
  await db`create index if not exists curriculum_level_day_idx on curriculum_days (level, day)`;
}

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function clean(value) {
  return String(value || "").trim();
}
