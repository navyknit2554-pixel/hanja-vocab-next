import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const prefix = "HANJA";

function normalize(value) {
  return String(value || "").trim();
}

export function licenseSecret() {
  return process.env.HANJA_LICENSE_SECRET || process.env.ADMIN_SESSION_SECRET || "hanja-license-dev-secret";
}

export function licenseHash(licenseKey) {
  return createHash("sha256").update(normalize(licenseKey)).digest("base64url");
}

export function teacherCodeFromHash(hash) {
  return `t_${String(hash || "").slice(0, 10)}`;
}

export function scopeKeyFromHash(hash) {
  return scopeKeyFromTeacherCode(teacherCodeFromHash(hash));
}

export function scopeKeyFromTeacherCode(teacherCode) {
  const code = normalize(teacherCode).toLowerCase();
  return code && code !== "master" ? `teacher:${code}` : "main";
}

export function signLicensePayload(payload, secret = licenseSecret()) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createLicenseKey({ expiresAt, nonce, secret } = {}) {
  const expires = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const exp36 = Math.floor(expires.getTime() / 1000).toString(36).toUpperCase();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomNonce = Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("");
  const token = normalize(nonce) || randomNonce;
  const payload = `${exp36}.${token}`;
  const signature = signLicensePayload(payload, secret || licenseSecret()).slice(0, 22);
  return `${prefix}-${exp36}-${token}-${signature}`;
}

export function describeLicenseKey(licenseKey) {
  const parts = normalize(licenseKey).split("-");
  if (parts.length !== 4 || parts[0] !== prefix) return null;
  const [, exp36, nonce, signature] = parts;
  const payload = `${exp36}.${nonce}`;
  const expected = signLicensePayload(payload).slice(0, 22);
  if (!safeEqual(signature, expected)) return null;
  const expiresAt = new Date(Number.parseInt(exp36, 36) * 1000);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const hash = licenseHash(licenseKey);
  return {
    active: expiresAt.getTime() >= Date.now(),
    expiresAt: expiresAt.toISOString(),
    licenseHash: hash,
    teacherCode: teacherCodeFromHash(hash),
    scopeKey: scopeKeyFromHash(hash)
  };
}

export function getLicenseAccess(licenseKey) {
  const description = describeLicenseKey(licenseKey);
  if (!description || !description.active) return { allowed: false };
  return { allowed: true, role: "license", ...description };
}
