import { createHash, timingSafeEqual } from "crypto";

export const adminCookieName = "hanja_admin_session";

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

export function isValidAdminPassword(password) {
  return safeEqual(String(password || ""), adminPassword());
}

export function isValidAdminSession(value) {
  return safeEqual(String(value || ""), adminSessionValue());
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
