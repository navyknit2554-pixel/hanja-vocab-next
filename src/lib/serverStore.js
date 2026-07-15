import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { cloneSeed } from "./data";

const statePath = join(process.cwd(), ".data", "app-state.json");
const stateKey = "main";

export async function getState() {
  if (usesPostgres()) return getPostgresState();
  return getFileState();
}

export async function setState(state) {
  const next = normalizeState(state);
  if (usesPostgres()) return setPostgresState(next);
  return setFileState(next);
}

export async function resetState() {
  return setState(cloneSeed());
}

export function storageMode() {
  return usesPostgres() ? "postgres" : "local-file";
}

function usesPostgres() {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL);
}

async function getFileState() {
  try {
    const raw = await readFile(statePath, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    const seed = normalizeState(cloneSeed());
    await setFileState(seed);
    return seed;
  }
}

async function setFileState(state) {
  const next = normalizeState(state);
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function getPostgresState() {
  const sql = await getSql();
  await ensurePostgresSchema(sql);
  const rows = await sql`select data from app_state where key = ${stateKey}`;
  if (!rows.length) {
    const seed = normalizeState(cloneSeed());
    await setPostgresState(seed);
    return seed;
  }
  return normalizeState(rows[0].data);
}

async function setPostgresState(state) {
  const sql = await getSql();
  const next = normalizeState(state);
  await ensurePostgresSchema(sql);
  await sql`
    insert into app_state (key, data, updated_at)
    values (${stateKey}, ${JSON.stringify(next)}::jsonb, now())
    on conflict (key)
    do update set data = excluded.data, updated_at = now()
  `;
  return next;
}

async function ensurePostgresSchema(sql) {
  await sql`
    create table if not exists app_state (
      key text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
}

async function getSql() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
  const { neon } = await import("@neondatabase/serverless");
  return neon(connectionString);
}

function normalizeState(state) {
  const next = { ...cloneSeed(), ...state };
  next.students = Array.isArray(next.students) ? next.students : [];
  next.curriculum = Array.isArray(next.curriculum) ? next.curriculum : [];
  next.progress = next.progress || {};
  next.students.forEach((student, index) => {
    student.id ||= `s${index + 1}`;
    student.loginId ||= student.id;
    student.password ||= "1234";
    student.name ||= `학생 ${index + 1}`;
    student.grade ||= "3학년";
    student.level ||= "초급";
    student.day ||= 1;
    next.progress[student.id] ||= { completed: {}, quiz: {} };
  });
  next.curriculum.sort((a, b) => Number(a.day) - Number(b.day));
  return next;
}
