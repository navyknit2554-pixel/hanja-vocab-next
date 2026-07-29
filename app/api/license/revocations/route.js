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
  state.licenseRecords ||= [];
  state.licenseRevocations ||= [];

  const licenseHash = inspected.description.licenseHash;
  const recordIndex = state.licenseRecords.findIndex((item) => item.licenseHash === licenseHash);
  const existingRecord = recordIndex >= 0 ? state.licenseRecords[recordIndex] : null;
  const revocationIndex = state.licenseRevocations.findIndex((item) => item.licenseHash === licenseHash);
  const existingRevocation = revocationIndex >= 0 ? state.licenseRevocations[revocationIndex] : null;

  if (action === "update") {
    const record = makeRecord(inspected, body, existingRecord);
    if (recordIndex >= 0) state.licenseRecords[recordIndex] = record;
    else state.licenseRecords.unshift(record);
    await setState(state, "main");
    return NextResponse.json({
      ok: true,
      license: makeLicenseView(inspected, existingRevocation, record),
      message: recordIndex >= 0 ? "라이선스 관리 기록을 수정했습니다." : "라이선스를 관리 목록에 추가했습니다."
    });
  }

  if (action === "revoke") {
    const revoked = {
      licenseHash,
      teacherCode: inspected.description.teacherCode,
      expiresAt: effectiveExpiresAt(inspected, existingRecord),
      status: "revoked",
      reason: String(body.reason || existingRevocation?.reason || "").trim(),
      revokedAt: new Date().toISOString()
    };
    if (revocationIndex >= 0) state.licenseRevocations[revocationIndex] = { ...existingRevocation, ...revoked };
    else state.licenseRevocations.unshift(revoked);
    await setState(state, "main");
    return NextResponse.json({ ok: true, license: makeLicenseView(inspected, revoked, existingRecord), message: "라이선스를 폐기했습니다." });
  }

  if (action === "restore") {
    if (revocationIndex >= 0) {
      state.licenseRevocations[revocationIndex] = {
        ...existingRevocation,
        status: "restored",
        restoredAt: new Date().toISOString()
      };
      await setState(state, "main");
    }
    return NextResponse.json({
      ok: true,
      license: makeLicenseView(inspected, state.licenseRevocations[revocationIndex] || null, existingRecord),
      message: "라이선스 폐기를 해제했습니다."
    });
  }

  return NextResponse.json({
    ok: true,
    license: makeLicenseView(inspected, existingRevocation, existingRecord),
    message: existingRevocation?.status === "revoked" ? "폐기된 라이선스입니다." : "사용 가능한 라이선스입니다."
  });
}

function makeRecord(inspected, body, existingRecord) {
  const expiresAt = parseExpiresAt(body.expiresAt) || existingRecord?.expiresAt || inspected.description.expiresAt;
  return {
    ...existingRecord,
    licenseHash: inspected.description.licenseHash,
    teacherCode: inspected.description.teacherCode,
    originalExpiresAt: inspected.description.expiresAt,
    expiresAt,
    owner: String(body.owner || existingRecord?.owner || "").trim(),
    note: String(body.note || existingRecord?.note || "").trim(),
    updatedAt: new Date().toISOString(),
    createdAt: existingRecord?.createdAt || new Date().toISOString()
  };
}

function makeLicenseView(inspected, revocation, record) {
  const expiresAt = effectiveExpiresAt(inspected, record);
  const expiresDate = new Date(expiresAt);
  return {
    valid: Boolean(inspected.ok),
    active: !Number.isNaN(expiresDate.getTime()) && expiresDate.getTime() >= Date.now(),
    expiresAt,
    originalExpiresAt: inspected.description?.expiresAt || "",
    licenseHash: inspected.description?.licenseHash || "",
    teacherCode: inspected.description?.teacherCode || "",
    owner: record?.owner || "",
    note: record?.note || "",
    managed: Boolean(record),
    revoked: Boolean(revocation && revocation.status !== "restored"),
    revokedAt: revocation?.revokedAt || "",
    restoredAt: revocation?.restoredAt || "",
    reason: revocation?.reason || ""
  };
}

function effectiveExpiresAt(inspected, record) {
  return record?.expiresAt || inspected.description?.expiresAt || "";
}

function parseExpiresAt(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T23:59:59+09:00`) : new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function licenseErrorMessage(reason) {
  if (reason === "format") return "라이선스 키 형식이 올바르지 않습니다.";
  if (reason === "signature") return "라이선스 서명이 맞지 않습니다. 발급 비밀값을 확인해 주세요.";
  if (reason === "date") return "라이선스 만료 날짜를 읽을 수 없습니다.";
  if (reason === "expired") return "만료된 라이선스입니다. 폐기하거나 만료일 수정은 가능합니다.";
  return "라이선스 키를 확인해 주세요.";
}
