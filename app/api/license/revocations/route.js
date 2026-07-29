import { NextResponse } from "next/server";
import { adminConfigError, isValidAdminPassword } from "../../../../src/lib/adminAuth";
import { inspectLicenseKey } from "../../../../src/lib/licenseAuth";
import { getState, setState } from "../../../../src/lib/serverStore";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const configError = adminConfigError();
  if (configError) return NextResponse.json({ ok: false, message: configError }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const password = String(body.password || "").trim();
  const licenseKey = String(body.licenseKey || "").trim();
  const action = String(body.action || "lookup").trim();

  if (!isValidAdminPassword(password)) {
    return NextResponse.json({ ok: false, message: "소유자 관리자 비밀번호를 확인해 주세요." }, { status: 401 });
  }

  const inspected = inspectLicenseKey(licenseKey);
  if (!inspected.description?.licenseHash) {
    return NextResponse.json({ ok: false, message: licenseErrorMessage(inspected.reason) }, { status: 400 });
  }

  const state = await getState("main");
  state.licenseRevocations ||= [];
  const licenseHash = inspected.description.licenseHash;
  const existingIndex = state.licenseRevocations.findIndex((item) => item.licenseHash === licenseHash);
  const existing = existingIndex >= 0 ? state.licenseRevocations[existingIndex] : null;

  if (action === "revoke") {
    const revoked = {
      licenseHash,
      teacherCode: inspected.description.teacherCode,
      expiresAt: inspected.description.expiresAt,
      status: "revoked",
      reason: String(body.reason || "").trim(),
      revokedAt: new Date().toISOString()
    };
    if (existingIndex >= 0) state.licenseRevocations[existingIndex] = { ...existing, ...revoked };
    else state.licenseRevocations.unshift(revoked);
    await setState(state, "main");
    return NextResponse.json({ ok: true, license: makeLicenseView(inspected, revoked), message: "라이선스를 폐기했습니다." });
  }

  if (action === "restore") {
    if (existingIndex >= 0) {
      state.licenseRevocations[existingIndex] = {
        ...existing,
        status: "restored",
        restoredAt: new Date().toISOString()
      };
      await setState(state, "main");
    }
    return NextResponse.json({ ok: true, license: makeLicenseView(inspected, state.licenseRevocations[existingIndex] || null), message: "라이선스 폐기를 해제했습니다." });
  }

  return NextResponse.json({
    ok: true,
    license: makeLicenseView(inspected, existing),
    message: existing?.status === "revoked" ? "폐기된 라이선스입니다." : "사용 가능한 라이선스입니다."
  });
}

function makeLicenseView(inspected, revocation) {
  return {
    valid: Boolean(inspected.ok),
    active: Boolean(inspected.description?.active),
    expiresAt: inspected.description?.expiresAt || "",
    licenseHash: inspected.description?.licenseHash || "",
    teacherCode: inspected.description?.teacherCode || "",
    revoked: Boolean(revocation && revocation.status !== "restored"),
    revokedAt: revocation?.revokedAt || "",
    restoredAt: revocation?.restoredAt || "",
    reason: revocation?.reason || ""
  };
}

function licenseErrorMessage(reason) {
  if (reason === "format") return "라이선스 키 형식이 올바르지 않습니다.";
  if (reason === "signature") return "라이선스 서명이 맞지 않습니다. 발급 비밀값을 확인해 주세요.";
  if (reason === "date") return "라이선스 만료 날짜를 읽을 수 없습니다.";
  if (reason === "expired") return "만료된 라이선스입니다. 폐기 목록에는 추가할 수 있습니다.";
  return "라이선스 키를 확인해 주세요.";
}
