import { createHash, timingSafeEqual } from "crypto";

export const studentCookieName = "hanja_student_session";

export function studentConfigError() {
  if (process.env.NODE_ENV !== "production") return "";
  if (!process.env.STUDENT_SESSION_SECRET || process.env.STUDENT_SESSION_SECRET === "change-this-before-deploy-too") {
    return "배포 환경에서는 STUDENT_SESSION_SECRET을 긴 무작위 문자열로 설정해야 합니다.";
  }
  return "";
}

export function createStudentSession(studentId, scopeKey = "main") {
  const id = String(studentId || "");
  const scope = String(scopeKey || "main");
  return `${id}.${Buffer.from(scope, "utf8").toString("base64url")}.${studentSignature(id, scope)}`;
}

export function readStudentSession(value) {
  const parts = String(value || "").split(".");
  if (parts.length === 2) {
    const [studentId, signature] = parts;
    if (!studentId || !signature) return null;
    return safeEqual(signature, studentSignature(studentId, "main")) ? { studentId, scopeKey: "main" } : null;
  }
  const [studentId, encodedScope, signature] = parts;
  if (!studentId || !encodedScope || !signature) return null;
  const scopeKey = Buffer.from(encodedScope, "base64url").toString("utf8") || "main";
  return safeEqual(signature, studentSignature(studentId, scopeKey)) ? { studentId, scopeKey } : null;
}

function studentSignature(studentId, scopeKey = "main") {
  const secret = process.env.STUDENT_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || "hanja-student-dev-secret";
  return createHash("sha256").update(`hanja-student:${scopeKey}:${studentId}:${secret}`).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
