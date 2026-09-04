import { cookies } from "next/headers";
import { adminCookieName, readAdminSession } from "./auth";
import { sql } from "./db";

export async function currentAdmin() {
  const cookieStore = await cookies();
  return readAdminSession(cookieStore.get(adminCookieName())?.value);
}

export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) throw Object.assign(new Error("관리자 로그인이 필요합니다."), { status: 401 });
  return admin;
}

export async function requireMaster() {
  const admin = await requireAdmin();
  if (admin.role !== "master") throw Object.assign(new Error("마스터 관리자만 사용할 수 있습니다."), { status: 403 });
  return admin;
}

export async function teacherForAdmin(admin, requestedTeacherCode = "") {
  const code = admin.role === "master"
    ? String(requestedTeacherCode || "master").trim() || "master"
    : admin.teacherCode;
  const db = await sql();
  const rows = await db`select id, code, name from teachers where code = ${code} limit 1`;
  if (!rows[0]) throw Object.assign(new Error("강사 계정을 찾지 못했습니다."), { status: 404 });
  return rows[0];
}

export function adminErrorResponse(error, NextResponse) {
  console.error("admin request failed", error);
  const message = error?.message || "관리자 요청을 처리하지 못했습니다.";
  return NextResponse.json(
    {
      ok: false,
      message,
      detail: process.env.DEBUG_ADMIN_ERRORS === "1" ? message : undefined,
      code: process.env.DEBUG_ADMIN_ERRORS === "1" ? error?.code : undefined
    },
    { status: error?.status || 500 }
  );
}
