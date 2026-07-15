import { createHash, timingSafeEqual } from "crypto";

export const studentCookieName = "hanja_student_session";

export function studentConfigError() {
  if (process.env.NODE_ENV !== "production") return "";
  if (!process.env.STUDENT_SESSION_SECRET || process.env.STUDENT_SESSION_SECRET === "change-this-before-deploy-too") {
    return "배포 환경에서는 STUDENT_SESSION_SECRET을 긴 무작위 문자열로 설정해야 합니다.";
  }
  return "";
}

export function createStudentSession(studentId) {
  const id = String(studentId || "");
  return `${id}.${studentSignature(id)}`;
}

export function readStudentSession(value) {
  const [studentId, signature] = String(value || "").split(".");
  if (!studentId || !signature) return "";
  return safeEqual(signature, studentSignature(studentId)) ? studentId : "";
}

function studentSignature(studentId) {
  const secret = process.env.STUDENT_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || "hanja-student-dev-secret";
  return createHash("sha256").update(`hanja-student:${studentId}:${secret}`).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
