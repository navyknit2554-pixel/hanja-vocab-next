import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { gunzipSync } from "zlib";
import { adminCookieName, readAdminSession } from "../../../src/lib/adminAuth";
import { upsertLesson } from "../../../src/lib/curriculum";
import { buildSeedCurriculum } from "../../../src/lib/data";
import { getState, resetState, setState } from "../../../src/lib/serverStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireAdmin();
    if (access.denied) return access.denied;
    return NextResponse.json(await withTimeout(getState(access.scopeKey), "학습 데이터 조회 시간이 초과되었습니다.", 55000));
  } catch (error) {
    return stateErrorResponse(error, "학습 데이터를 불러오지 못했습니다.");
  }
}

export async function PUT(request) {
  try {
    const access = await requireAdmin();
    if (access.denied) return access.denied;
    const payload = await readStatePayload(request);
    const state = await expandStatePayload(payload, access.scopeKey);
    const saved = await withTimeout(setState(state, access.scopeKey), "학습 데이터 저장 시간이 초과되었습니다.");
    if (payload?.__omitCurriculum) {
      return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
    }
    return NextResponse.json(saved);
  } catch (error) {
    return stateErrorResponse(error, "학습 데이터를 저장하지 못했습니다.");
  }
}

export async function DELETE() {
  try {
    const access = await requireAdmin();
    if (access.denied) return access.denied;
    return NextResponse.json(await withTimeout(resetState(access.scopeKey), "학습 데이터 초기화 시간이 초과되었습니다."));
  } catch (error) {
    return stateErrorResponse(error, "학습 데이터를 초기화하지 못했습니다.");
  }
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore.get(adminCookieName)?.value);
  if (session.authenticated) return session;
  return { denied: NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 }) };
}

async function readStatePayload(request) {
  if (request.headers.get("x-hanja-content-encoding") === "gzip") {
    const buffer = Buffer.from(await request.arrayBuffer());
    return JSON.parse(gunzipSync(buffer).toString("utf8"));
  }
  return request.json();
}

async function expandStatePayload(payload, scopeKey) {
  if (!payload?.__omitCurriculum) return payload;
  const current = await getState(scopeKey);
  const { __omitCurriculum, __omitProgress, __curriculumPatch, __dataPatch, ...nextPayload } = payload;
  const merged = applyDataPatch({ ...current, ...nextPayload }, __dataPatch);
  return {
    ...merged,
    curriculum: applyCurriculumPatch(current.curriculum, __curriculumPatch)
  };
}

function applyDataPatch(state, patch) {
  if (!patch) return state;
  const next = { ...state };
  if (Array.isArray(patch.students)) next.students = patch.students;
  if (patch.progressByStudent && typeof patch.progressByStudent === "object") {
    next.progress = { ...(next.progress || {}) };
    Object.entries(patch.progressByStudent).forEach(([studentId, record]) => {
      next.progress[studentId] = record;
    });
  }
  if (Array.isArray(patch.removeProgressStudentIds)) {
    next.progress = { ...(next.progress || {}) };
    patch.removeProgressStudentIds.forEach((studentId) => {
      delete next.progress[studentId];
    });
  }
  if (patch.clearProgressDay) {
    const day = String(Number(patch.clearProgressDay));
    next.progress = { ...(next.progress || {}) };
    Object.values(next.progress).forEach((record) => {
      if (!record || typeof record !== "object") return;
      delete record.completed?.[day];
      delete record.quiz?.[day];
    });
  }
  return next;
}

function applyCurriculumPatch(curriculum, patch) {
  if (!patch) return curriculum;
  if (patch.type === "replaceSeed") return buildSeedCurriculum();
  if (patch.type === "upsertLessons") {
    return (Array.isArray(patch.lessons) ? patch.lessons : []).reduce((next, lesson) => upsertLesson(next, lesson), curriculum);
  }
  if (patch.type === "deleteLesson") {
    const day = Number(patch.day);
    const level = String(patch.level || "").trim();
    return curriculum.filter((lesson) => !(Number(lesson.day) === day && String(lesson.level || "").trim() === level));
  }
  return curriculum;
}

function withTimeout(promise, message, timeoutMs = 20000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function stateErrorResponse(error, fallback) {
  const message = normalizeStateError(error, fallback);
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

function normalizeStateError(error, fallback) {
  const message = String(error?.message || "").trim();
  if (!message) return fallback;
  if (/data transfer quota|quota exceeded|exceeded the data transfer quota/i.test(message)) {
    return `${fallback} Neon 데이터베이스의 무료 데이터 전송량 한도를 초과했습니다. Neon 요금제 업그레이드, 한도 초기화 대기, 또는 새 DB 연결이 필요합니다.`;
  }
  if (/database|postgres|neon|connection|timeout|fetch failed|ECONN|ENOTFOUND|password|authentication/i.test(message)) {
    return `${fallback} 데이터베이스 연결 또는 Vercel 환경변수를 확인해 주세요.`;
  }
  return `${fallback} ${message}`;
}
