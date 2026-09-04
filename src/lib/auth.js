import { createHash, createHmac, timingSafeEqual } from "crypto";

const cookieName = "chologi_v2_student";
const adminCookie = "chologi_v2_admin";

export function studentCookieName() {
  return cookieName;
}

export function createStudentSession(studentId) {
  const payload = Buffer.from(JSON.stringify({ studentId, at: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload, studentSessionSecret())}`;
}

export function readStudentSession(value) {
  const [payload, signature] = String(value || "").split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, studentSessionSecret()))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed?.studentId ? parsed : null;
  } catch {
    return null;
  }
}

export function adminCookieName() {
  return adminCookie;
}

export function createAdminSession(admin) {
  const payload = Buffer.from(JSON.stringify({
    role: admin.role,
    teacherCode: admin.teacherCode,
    licenseHash: admin.licenseHash || "",
    at: Date.now()
  })).toString("base64url");
  return `${payload}.${sign(payload, adminSessionSecret())}`;
}

export function readAdminSession(value) {
  const [payload, signature] = String(value || "").split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, adminSessionSecret()))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed?.role && parsed?.teacherCode ? parsed : null;
  } catch {
    return null;
  }
}

export function isMasterPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || "";
  return Boolean(expected) && safeEqual(String(password || "").trim(), expected);
}

export function inspectLicenseKey(licenseKey) {
  const normalized = String(licenseKey || "").trim();
  const parts = normalized.split("-");
  if (parts.length < 4 || parts[0] !== "HANJA") return { ok: false, reason: "format" };
  const [, exp36, nonce, ...signatureParts] = parts;
  const signature = signatureParts.join("-");
  const payload = `${exp36}.${nonce}`;
  const expected = createHmac("sha256", licenseSecret()).update(payload).digest("base64url").slice(0, 22);
  if (!safeEqual(signature, expected)) return { ok: false, reason: "signature" };
  const expiresAt = new Date(Number.parseInt(exp36, 36) * 1000);
  if (Number.isNaN(expiresAt.getTime())) return { ok: false, reason: "date" };
  const licenseHash = createHash("sha256").update(normalized).digest("base64url");
  const teacherCode = `t_${licenseHash.slice(0, 10)}`;
  return {
    ok: expiresAt.getTime() >= Date.now(),
    reason: expiresAt.getTime() >= Date.now() ? "" : "expired",
    description: {
      licenseHash,
      teacherCode,
      expiresAt: expiresAt.toISOString()
    }
  };
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function adminSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.STUDENT_SESSION_SECRET || "dev-admin-session-secret";
}

function studentSessionSecret() {
  return process.env.STUDENT_SESSION_SECRET || "dev-student-session-secret";
}

function licenseSecret() {
  return process.env.HANJA_LICENSE_SECRET || process.env.ADMIN_SESSION_SECRET || "hanja-license-dev-secret";
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}
