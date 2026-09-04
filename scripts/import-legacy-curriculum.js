const postgres = require("postgres");

const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.OLD_DATABASE_URL || process.env.NEON_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const sourceScopeKey = process.env.SOURCE_SCOPE_KEY || "main";
const write = process.argv.includes("--write");

if (!sourceUrl || !targetUrl) {
  console.error("기존 앱 DB 주소와 새 v2 DB 주소가 모두 필요합니다.");
  console.error("$env:SOURCE_DATABASE_URL=\"기존 앱 app_state가 있는 DB 연결 문자열\"");
  console.error("$env:SUPABASE_DATABASE_URL=\"새 v2 Supabase 연결 문자열\"");
  console.error("npm.cmd run import:legacy-curriculum");
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
    console.error("\n기존 한자 구성 가져오기에 실패했습니다.");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.end({ timeout: 5 }).catch(() => {});
    await target.end({ timeout: 5 }).catch(() => {});
  });

async function main() {
  await withConnectionLabel("SOURCE_DATABASE_URL", assertSourceHasAppState);
  await withConnectionLabel("SUPABASE_DATABASE_URL", ensureTargetSchema);

  const rows = await source`select key, data, updated_at from app_state where key = ${sourceScopeKey} limit 1`;
  if (!rows.length) {
    throw new Error(`SOURCE_SCOPE_KEY=${sourceScopeKey} app_state를 찾지 못했습니다.`);
  }

  const data = normalizeJsonData(rows[0].data);
  const lessons = normalizeLessons(data?.curriculum);
  const hanjaCount = lessons.reduce((total, lesson) => total + lesson.hanja.length, 0);

  console.log(`${sourceScopeKey} 커리큘럼에서 ${lessons.length}개 일차, 한자 ${hanjaCount}개를 찾았습니다.`);
  console.table(summaryByLevel(lessons));
  console.log("\n미리보기 12개 일차:");
  console.table(lessons.slice(0, 12).map((lesson) => ({
    level: lesson.level,
    day: lesson.day,
    dailyCount: lesson.dailyCount,
    hanja: lesson.hanja.map((item) => `${item.character}(${item.sound}/${item.meaning})`).join(" ")
  })));

  if (!write) {
    console.log("\n아직 DB에 반영하지 않았습니다. 실제 반영하려면:");
    console.log("npm.cmd run import:legacy-curriculum -- --write");
    return;
  }

  let savedLessons = 0;
  let savedHanja = 0;
  let clearedVocab = 0;
  for (const lesson of lessons) {
    const lessonId = await upsertLesson(lesson);
    const result = await upsertHanjaItems(lessonId, lesson.hanja);
    savedLessons += 1;
    savedHanja += result.saved;
    clearedVocab += result.clearedVocab;
  }

  console.log(`\n완료: 일차 ${savedLessons}개, 한자 ${savedHanja}개를 v2 커리큘럼 테이블에 반영했습니다.`);
  if (clearedVocab) console.log(`한자가 바뀐 자리의 기존 v2 어휘 ${clearedVocab}묶음은 지웠습니다.`);
  console.log("기존 앱의 어휘, 뜻, 용례는 가져오지 않았습니다.");
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
  const rows = await source`select to_regclass('public.app_state') as table_name`;
  if (!rows[0]?.table_name) {
    throw new Error("SOURCE_DATABASE_URL DB에 app_state 테이블이 없습니다. 기존 앱 DB 연결 문자열을 넣어 주세요.");
  }
}

async function upsertLesson(lesson) {
  const rows = await target`
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
    const existingRows = await target`
      select id, character
      from hanja_items
      where curriculum_day_id = ${lessonId}
        and position = ${position}
      limit 1
    `;
    const existing = existingRows[0];
    if (existing?.id && existing.character !== item.character) {
      await target`delete from vocab_items where hanja_item_id = ${existing.id}`;
      clearedVocab += 1;
    }
    await target`
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
  await target`
    delete from hanja_items
    where curriculum_day_id = ${lessonId}
      and position > ${hanjaItems.length}
  `;
  return { saved, clearedVocab };
}

async function ensureTargetSchema() {
  await target`create extension if not exists pgcrypto`;
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
  await target`
    create table if not exists vocab_items (
      id uuid primary key default gen_random_uuid(),
      hanja_item_id uuid not null references hanja_items(id) on delete cascade,
      position integer not null,
      hanja_word text not null,
      word text not null,
      meaning text not null,
      source text not null default '',
      source_target_code text not null default '',
      needs_review boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (hanja_item_id, position)
    )
  `;
  await target`create index if not exists curriculum_level_day_idx on curriculum_days (level, day)`;
}

function normalizeLessons(curriculum) {
  return (Array.isArray(curriculum) ? curriculum : [])
    .map(normalizeLesson)
    .filter(Boolean)
    .sort((left, right) => levelOrder(left.level) - levelOrder(right.level) || left.day - right.day);
}

function normalizeLesson(lesson) {
  const level = normalizeLevel(lesson?.level);
  const day = clampDay(lesson?.day);
  const hanja = (Array.isArray(lesson?.hanjaSet) ? lesson.hanjaSet : [])
    .slice(0, Number(lesson?.dailyCount || lesson?.hanjaSet?.length || 4))
    .map(normalizeHanja)
    .filter(Boolean);
  if (!level || !day || !hanja.length) return null;
  return {
    level,
    day,
    title: clean(lesson?.title) || `${level} ${day}일차`,
    dailyCount: Math.max(1, Number(lesson?.dailyCount || hanja.length || 4)),
    reviewAfter: Boolean(lesson?.reviewAfter),
    hanja
  };
}

function normalizeHanja(item) {
  const character = clean(item?.character);
  const sound = clean(item?.sound);
  const meaning = clean(item?.meaning);
  if (!character || !sound || !meaning) return null;
  return {
    character,
    sound,
    meaning,
    radical: clean(item?.radical) || character
  };
}

function summaryByLevel(lessons) {
  const map = new Map();
  lessons.forEach((lesson) => {
    const current = map.get(lesson.level) || { level: lesson.level, lessons: 0, hanja: 0, firstDay: lesson.day, lastDay: lesson.day };
    current.lessons += 1;
    current.hanja += lesson.hanja.length;
    current.firstDay = Math.min(current.firstDay, lesson.day);
    current.lastDay = Math.max(current.lastDay, lesson.day);
    map.set(lesson.level, current);
  });
  return [...map.values()];
}

function normalizeJsonData(data) {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function normalizeLevel(level) {
  const value = clean(level);
  return ["초급", "중급", "고급"].includes(value) ? value : "";
}

function clampDay(day) {
  const value = Number(day || 0);
  if (!Number.isFinite(value) || value < 1 || value > 100) return 0;
  return Math.round(value);
}

function levelOrder(level) {
  return { "초급": 1, "중급": 2, "고급": 3 }[level] || 99;
}

function clean(value) {
  return String(value || "").trim();
}
