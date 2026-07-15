import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { cloneSeed } from "./data";

const statePath = join(process.cwd(), ".data", "app-state.json");
const stateKey = "main";

export async function getState(scopeKey = stateKey) {
  if (usesPostgres()) return getPostgresState(scopeKey);
  return getFileState(scopeKey);
}

export async function setState(state, scopeKey = stateKey) {
  const next = normalizeState(state, scopeKey);
  if (usesPostgres()) return setPostgresState(next, scopeKey);
  return setFileState(next, scopeKey);
}

export async function resetState(scopeKey = stateKey) {
  return setState(seedForScope(scopeKey), scopeKey);
}

export function storageMode() {
  return usesPostgres() ? "postgres" : "local-file";
}

function usesPostgres() {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL);
}

async function getFileState(scopeKey = stateKey) {
  const targetPath = scopeKey === stateKey ? statePath : join(process.cwd(), ".data", `${safeFileKey(scopeKey)}.json`);
  try {
    const raw = await readFile(targetPath, "utf8");
    return normalizeState(JSON.parse(raw), scopeKey);
  } catch {
    const seed = normalizeState(seedForScope(scopeKey), scopeKey);
    await setFileState(seed, scopeKey);
    return seed;
  }
}

async function setFileState(state, scopeKey = stateKey) {
  const targetPath = scopeKey === stateKey ? statePath : join(process.cwd(), ".data", `${safeFileKey(scopeKey)}.json`);
  const next = normalizeState(state, scopeKey);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function getPostgresState(scopeKey = stateKey) {
  const sql = await getSql();
  await ensurePostgresSchema(sql);
  const rows = await sql`select data from app_state where key = ${scopeKey}`;
  if (!rows.length) {
    const seed = normalizeState(seedForScope(scopeKey), scopeKey);
    await setPostgresState(seed, scopeKey);
    return seed;
  }
  return normalizeState(rows[0].data, scopeKey);
}

async function setPostgresState(state, scopeKey = stateKey) {
  const sql = await getSql();
  const next = normalizeState(state, scopeKey);
  await ensurePostgresSchema(sql);
  await sql`
    insert into app_state (key, data, updated_at)
    values (${scopeKey}, ${JSON.stringify(next)}::jsonb, now())
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

export function seedForScope(scopeKey = stateKey) {
  const seed = cloneSeed();
  if (scopeKey === stateKey) return seed;
  return { ...seed, students: [], progress: {} };
}

function safeFileKey(scopeKey) {
  return String(scopeKey || stateKey).replace(/[^a-z0-9_-]/gi, "_");
}

function normalizeState(state, scopeKey = stateKey) {
  const next = { ...seedForScope(scopeKey), ...state };
  next.students = Array.isArray(next.students) ? next.students : [];
  next.curriculum = Array.isArray(next.curriculum) ? next.curriculum : [];
  next.progress = next.progress || {};
  next.students.forEach((student, index) => {
    student.id ||= `s${index + 1}`;
    student.loginId ||= student.id;
    student.password ||= "1234";
    student.phone ||= "";
    student.name ||= `학생 ${index + 1}`;
    student.grade = normalizeGradeLabel(student.grade);
    student.level ||= "초급";
    student.day ||= 1;
    next.progress[student.id] ||= { completed: {}, quiz: {} };
  });
  next.curriculum.sort((a, b) => levelOrder(a.level) - levelOrder(b.level) || Number(a.day) - Number(b.day));
  return next;
}

function normalizeGradeLabel(grade) {
  const value = String(grade || "").trim();
  const elementaryMatch = value.match(/^([1-6])학년$/);
  if (elementaryMatch) return `초${elementaryMatch[1]}`;
  return ["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"].includes(value) ? value : "초1";
}

function levelOrder(level) {
  const order = { 초급: 1, 중급: 2, 고급: 3 };
  return order[String(level || "").trim()] || 99;
}
