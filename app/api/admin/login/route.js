import { NextResponse } from "next/server";
import { adminConfigError, adminCookieName, adminSessionValue, isValidAdminPassword, licenseAdminSessionValue } from "../../../../src/lib/adminAuth";
import { getLicenseAccess } from "../../../../src/lib/licenseAuth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const configError = adminConfigError();
  if (configError) return NextResponse.json({ ok: false, message: configError }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "").trim();
  const licenseKey = String(body.licenseKey || "").trim();
  const licenseAccess = licenseKey ? getLicenseAccess(licenseKey) : null;
  const isMaster = password ? isValidAdminPassword(password) : false;

  if (!isMaster && !licenseAccess?.allowed) {
    const message = licenseKey ? "라이선스 키가 올바르지 않거나 만료되었습니다." : "라이선스 키를 입력해 주세요.";
    return NextResponse.json({ ok: false, message }, { status: 401 });
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
