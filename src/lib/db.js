import postgres from "postgres";

let client;

export function hasDatabase() {
  return Boolean(getConnectionString());
}

export function getDatabaseTarget() {
  const connectionString = getConnectionString();
  if (!connectionString) return { host: "", projectRef: "" };

  try {
    const url = new URL(connectionString);
    const username = decodeURIComponent(url.username || "");
    const host = url.hostname || "";
    const match = username.match(/^postgres[.:]([^.@:/?]+)$/);
    return {
      host,
      projectRef: match?.[1] || ""
    };
  } catch {
    return { host: "invalid-url", projectRef: "" };
  }
}

export async function sql() {
  if (client) return client;
  const connectionString = getConnectionString();
  if (!connectionString) throw new Error("DATABASE_URL 또는 SUPABASE_DATABASE_URL이 필요합니다.");
  client = postgres(connectionString, {
    max: 1,
    prepare: false,
    ssl: "require",
    idle_timeout: 20,
    connect_timeout: 10
  });
  await ensureSchema(client);
  return client;
}

function getConnectionString() {
  return process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

async function ensureSchema(db) {
  await db`create extension if not exists pgcrypto`;
  await db`
    create table if not exists teachers (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      code text not null unique,
      license_key text unique,
      license_hash text unique,
      license_status text not null default 'active' check (license_status in ('active', 'revoked', 'expired')),
      license_expires_at timestamptz,
      license_original_expires_at timestamptz,
      license_owner text not null default '',
      license_note text not null default '',
      license_revoked_at timestamptz,
      license_restored_at timestamptz,
      created_at timestamptz not null default now(),
      last_login_at timestamptz
    )
  `;
  await db`alter table teachers add column if not exists license_hash text unique`;
  await db`alter table teachers add column if not exists license_status text not null default 'active'`;
  await db`alter table teachers add column if not exists license_original_expires_at timestamptz`;
  await db`alter table teachers add column if not exists license_owner text not null default ''`;
  await db`alter table teachers add column if not exists license_note text not null default ''`;
  await db`alter table teachers add column if not exists license_revoked_at timestamptz`;
  await db`alter table teachers add column if not exists license_restored_at timestamptz`;
  await db`
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
  await db`alter table students add column if not exists legacy_id text not null default ''`;
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
  await db`
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
  await db`
    create table if not exists vocab_examples (
      id uuid primary key default gen_random_uuid(),
      vocab_item_id uuid not null references vocab_items(id) on delete cascade,
      position integer not null,
      example_text text not null,
      source text not null default '',
      created_at timestamptz not null default now(),
      unique (vocab_item_id, position)
    )
  `;
  await db`
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
  await db`create index if not exists students_teacher_login_idx on students (teacher_id, login_id, password)`;
  await db`create unique index if not exists students_teacher_legacy_idx on students (teacher_id, legacy_id) where legacy_id <> ''`;
  await db`create index if not exists curriculum_level_day_idx on curriculum_days (level, day)`;
}
