import { createHash, timingSafeEqual } from "crypto";

export const adminCookieName = "hanja_admin_session";
export const masterScopeKey = "main";

export function adminPassword() {
  return process.env.ADMIN_PASSWORD || "1234";
}

export function adminConfigError() {
  if (process.env.NODE_ENV !== "production") return "";
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "1234") {
    return "배포 환경에서는 ADMIN_PASSWORD를 기본값이 아닌 값으로 설정해야 합니다.";
  }
  if (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET === "change-this-before-deploy") {
    return "배포 환경에서는 ADMIN_SESSION_SECRET을 긴 무작위 문자열로 설정해야 합니다.";
  }
  return "";
}

export function adminSessionValue() {
  const secret = process.env.ADMIN_SESSION_SECRET || adminPassword();
  return createHash("sha256").update(`hanja-admin:${secret}`).digest("hex");
}

export function licenseAdminSessionValue(access) {
  const payload = Buffer.from(JSON.stringify({
    role: "license",
    scopeKey: access.scopeKey,
    teacherCode: access.teacherCode,
    licenseHash: access.licenseHash
  }), "utf8").toString("base64url");
  const secret = process.env.ADMIN_SESSION_SECRET || adminPassword();
  const signature = createHash("sha256").update(`hanja-license-admin:${payload}:${secret}`).digest("hex");
  return `license.${payload}.${signature}`;
}

export function isValidAdminPassword(password) {
  return safeEqual(String(password || ""), adminPassword());
}

export function isValidAdminSession(value) {
  return safeEqual(String(value || ""), adminSessionValue());
}

export function readAdminSession(value) {
  const session = String(value || "");
  if (isValidAdminSession(session)) {
    return { authenticated: true, role: "master", scopeKey: masterScopeKey, teacherCode: "master" };
  }
  const parts = session.split(".");
  if (parts.length !== 3 || parts[0] !== "license") return { authenticated: false };
  const [, payload, signature] = parts;
  const secret = process.env.ADMIN_SESSION_SECRET || adminPassword();
  const expected = createHash("sha256").update(`hanja-license-admin:${payload}:${secret}`).digest("hex");
  if (!safeEqual(signature, expected)) return { authenticated: false };
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.scopeKey || !parsed.teacherCode) return { authenticated: false };
    return { authenticated: true, role: "license", scopeKey: parsed.scopeKey, teacherCode: parsed.teacherCode, licenseHash: parsed.licenseHash };
  } catch {
    return { authenticated: false };
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
