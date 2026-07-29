import { NextResponse } from "next/server";
import { adminConfigError, adminCookieName, adminSessionValue, isValidAdminPassword, licenseAdminSessionValue } from "../../../../src/lib/adminAuth";
import { getLicenseAccess } from "../../../../src/lib/licenseAuth";
import { getState } from "../../../../src/lib/serverStore";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const configError = adminConfigError();
  if (configError) return NextResponse.json({ ok: false, message: configError }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "").trim();
  const licenseKey = String(body.licenseKey || "").trim();
  const isMaster = password ? isValidAdminPassword(password) : false;
  let licenseAccess = licenseKey ? getLicenseAccess(licenseKey) : null;

  if (!isMaster && licenseAccess?.licenseHash) {
    const mainState = await getState("main");
    const revoked = (mainState.licenseRevocations || []).some((item) => item.licenseHash === licenseAccess.licenseHash && item.status !== "restored");
    if (revoked) {
      return NextResponse.json({ ok: false, message: "폐기된 라이선스입니다. 관리자에게 문의해 주세요." }, { status: 401 });
    }

    const record = (mainState.licenseRecords || []).find((item) => item.licenseHash === licenseAccess.licenseHash);
    const overrideExpiresAt = record?.expiresAt ? new Date(record.expiresAt) : null;
    if (overrideExpiresAt && !Number.isNaN(overrideExpiresAt.getTime())) {
      licenseAccess = {
        ...licenseAccess,
        allowed: overrideExpiresAt.getTime() >= Date.now(),
        active: overrideExpiresAt.getTime() >= Date.now(),
        reason: overrideExpiresAt.getTime() >= Date.now() ? undefined : "expired",
        expiresAt: overrideExpiresAt.toISOString()
      };
    }
  }

  if (!isMaster && !licenseAccess?.allowed) {
    const message = licenseErrorMessage(licenseAccess?.reason, licenseKey);
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

function licenseErrorMessage(reason, licenseKey) {
  if (!licenseKey) return "라이선스 키를 입력해 주세요.";
  if (reason === "format") return "라이선스 키 형식이 올바르지 않습니다. 복사한 키가 중간에 잘리지 않았는지 확인해 주세요.";
  if (reason === "signature") return "라이선스 키의 서명이 맞지 않습니다. 발급 페이지의 HANJA_LICENSE_SECRET 값과 Vercel 환경변수가 같은지 확인해 주세요.";
  if (reason === "expired") return "만료된 라이선스입니다. 새 라이선스를 발급하거나 만료일을 수정해 주세요.";
  if (reason === "date") return "라이선스 만료 날짜 정보를 읽을 수 없습니다. 키를 다시 발급해 주세요.";
  return "라이선스 키가 올바르지 않거나 만료되었습니다.";
}
