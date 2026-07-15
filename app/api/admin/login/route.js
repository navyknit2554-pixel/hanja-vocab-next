import { NextResponse } from "next/server";
import { adminConfigError, adminCookieName, adminSessionValue, isValidAdminPassword, licenseAdminSessionValue } from "../../../../src/lib/adminAuth";
import { getLicenseAccess } from "../../../../src/lib/licenseAuth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const configError = adminConfigError();
  if (configError) return NextResponse.json({ ok: false, message: configError }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const licenseKey = String(body.licenseKey || "").trim();
  const licenseAccess = licenseKey ? getLicenseAccess(licenseKey) : null;
  const isMaster = isValidAdminPassword(body.password);
  if (!isMaster && !licenseAccess?.allowed) {
    return NextResponse.json({ ok: false, message: "관리자 비밀번호를 확인해 주세요." }, { status: 401 });
  }
  const response = NextResponse.json({
    ok: true,
    role: isMaster ? "master" : "license",
    teacherCode: isMaster ? "master" : licenseAccess.teacherCode
  });
  response.cookies.set(adminCookieName, isMaster ? adminSessionValue() : licenseAdminSessionValue(licenseAccess), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
