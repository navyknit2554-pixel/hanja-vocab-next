import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "../../../../src/lib/adminAccess";
import { createLicenseKey, inspectLicenseKey } from "../../../../src/lib/auth";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const db = await sql();
    const teacherCode = resolveTeacherCode(admin, searchParams.get("teacherCode"));
    const license = await getLicense(db, teacherCode);
    if (!license) {
      return NextResponse.json({ ok: false, message: "강사 계정을 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, license });
  } catch (error) {
    return adminErrorResponse(error, NextResponse);
  }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (admin.role !== "master") {
      return NextResponse.json({ ok: false, message: "마스터 관리자만 라이선스를 발급하거나 수정할 수 있습니다." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const db = await sql();
    const expiresAt = normalizeDate(body.expiresAt) || oneYearLaterIso();
    const issueNewKey = Boolean(body.issueNewKey);
    const issuedKey = issueNewKey ? createLicenseKey(expiresAt) : "";
    const inspected = issuedKey ? inspectLicenseKey(issuedKey) : null;
    const teacherCode = String(body.teacherCode || inspected?.description?.teacherCode || "").trim();
    if (!teacherCode) {
      return NextResponse.json({ ok: false, message: "강사 코드를 입력하거나 새 라이선스를 발급해 주세요." }, { status: 400 });
    }

    const studentLimit = normalizeStudentLimit(body.studentLimit);
    const status = normalizeLicenseStatus(body.status);
    const owner = String(body.owner || "").trim();
    const note = String(body.note || "").trim();
    const licenseHash = inspected?.description?.licenseHash || null;

    await db`
      insert into teachers (
        name,
        code,
        license_key,
        license_hash,
        license_status,
        license_expires_at,
        license_original_expires_at,
        license_owner,
        license_note,
        license_student_limit,
        license_revoked_at,
        license_restored_at
      )
      values (
        ${owner || teacherCode},
        ${teacherCode},
        ${issuedKey || null},
        ${licenseHash},
        ${status},
        ${expiresAt},
        ${expiresAt},
        ${owner},
        ${note},
        ${studentLimit},
        ${status === "revoked" ? new Date().toISOString() : null},
        ${status === "active" ? new Date().toISOString() : null}
      )
      on conflict (code)
      do update set
        name = coalesce(nullif(excluded.license_owner, ''), teachers.name),
        license_key = coalesce(excluded.license_key, teachers.license_key),
        license_hash = coalesce(excluded.license_hash, teachers.license_hash),
        license_status = excluded.license_status,
        license_expires_at = excluded.license_expires_at,
        license_original_expires_at = coalesce(teachers.license_original_expires_at, excluded.license_original_expires_at),
        license_owner = excluded.license_owner,
        license_note = excluded.license_note,
        license_student_limit = excluded.license_student_limit,
        license_revoked_at = case when excluded.license_status = 'revoked' then now() else null end,
        license_restored_at = case when excluded.license_status = 'active' then now() else teachers.license_restored_at end
    `;

    const license = await getLicense(db, teacherCode);
    return NextResponse.json({ ok: true, license, issuedKey });
  } catch (error) {
    return adminErrorResponse(error, NextResponse);
  }
}

async function getLicense(db, teacherCode) {
  const rows = await db`
    select
      t.id,
      t.code,
      t.name,
      t.license_key,
      t.license_status,
      t.license_expires_at,
      t.license_original_expires_at,
      t.license_owner,
      t.license_note,
      t.license_student_limit,
      coalesce(count(s.id), 0)::int as student_count
    from teachers t
    left join students s on s.teacher_id = t.id
    where t.code = ${teacherCode}
    group by t.id
    limit 1
  `;
  return rows[0] || null;
}

function resolveTeacherCode(admin, requestedTeacherCode) {
  if (admin.role === "master") return String(requestedTeacherCode || admin.teacherCode || "master").trim() || "master";
  return admin.teacherCode;
}

function normalizeStudentLimit(value) {
  const limit = Number(value || 0);
  if (!Number.isFinite(limit)) return 0;
  return Math.max(0, Math.min(99999, Math.floor(limit)));
}

function normalizeLicenseStatus(status) {
  const value = String(status || "active").trim();
  return ["active", "revoked", "expired"].includes(value) ? value : "active";
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function oneYearLaterIso() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString();
}
