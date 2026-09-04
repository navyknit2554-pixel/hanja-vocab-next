import { NextResponse } from "next/server";
import { adminCookieName, createAdminSession, inspectLicenseKey, isMasterPassword } from "../../../../src/lib/auth";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = String(body.password || "").trim();
    const licenseKey = String(body.licenseKey || "").trim();

    let admin = null;
    if (password && isMasterPassword(password)) {
      admin = { role: "master", teacherCode: "master" };
    } else if (licenseKey) {
      admin = await getLicenseAdmin(licenseKey);
    }

    if (!admin) {
      return NextResponse.json({ ok: false, message: "관리자 비밀번호 또는 라이선스 키를 확인해 주세요." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, admin });
    response.cookies.set(adminCookieName(), createAdminSession(admin), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
    return response;
  } catch (error) {
    console.error("admin login failed", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "관리자 로그인 중 문제가 생겼습니다." },
      { status: 500 }
    );
  }
}

async function getLicenseAdmin(licenseKey) {
  const inspected = inspectLicenseKey(licenseKey);
  if (!inspected.description?.licenseHash) return null;

  const db = await sql();
  const rows = await db`
    select code, license_hash, license_status, license_expires_at
    from teachers
    where license_hash = ${inspected.description.licenseHash}
       or code = ${inspected.description.teacherCode}
    limit 1
  `;
  let teacher = rows[0];
  if (!teacher) {
    const inserted = await db`
      insert into teachers (name, code, license_hash, license_status, license_expires_at, license_original_expires_at)
      values (
        ${inspected.description.teacherCode},
        ${inspected.description.teacherCode},
        ${inspected.description.licenseHash},
        'active',
        ${inspected.description.expiresAt},
        ${inspected.description.expiresAt}
      )
      on conflict (code)
      do update set
        license_hash = excluded.license_hash,
        license_status = 'active',
        license_expires_at = excluded.license_expires_at,
        license_original_expires_at = excluded.license_original_expires_at
      returning code, license_status, license_expires_at
    `;
    teacher = inserted[0];
  } else if (!teacher.license_hash) {
    const updated = await db`
      update teachers
      set license_hash = ${inspected.description.licenseHash},
          license_expires_at = coalesce(license_expires_at, ${inspected.description.expiresAt}),
          license_original_expires_at = coalesce(license_original_expires_at, ${inspected.description.expiresAt})
      where code = ${teacher.code}
      returning code, license_status, license_expires_at
    `;
    teacher = updated[0];
  }
  if (teacher.license_status === "revoked") throw new Error("폐기된 라이선스입니다.");
  const expiresAt = teacher.license_expires_at || inspected.description.expiresAt;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) throw new Error("만료된 라이선스입니다.");
  if (!inspected.ok) throw new Error("만료된 라이선스입니다.");

  return {
    role: "license",
    teacherCode: teacher.code,
    licenseHash: inspected.description.licenseHash
  };
}
