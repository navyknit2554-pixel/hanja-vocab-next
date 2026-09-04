const { randomBytes } = require("crypto");

function secret() {
  return randomBytes(32).toString("hex");
}

console.log("Vercel Environment Variables에 아래 값을 넣으세요.\n");
console.log(`ADMIN_SESSION_SECRET=${secret()}`);
console.log(`STUDENT_SESSION_SECRET=${secret()}`);
console.log("\nHANJA_LICENSE_SECRET은 기존 앱에서 쓰던 값과 같아야 기존 라이선스가 계속 로그인됩니다.");
console.log("ADMIN_PASSWORD는 선생님이 기억할 수 있는 새 마스터 비밀번호로 정하면 됩니다.");
console.log("SUPABASE_DATABASE_URL은 v2 Supabase PostgreSQL 연결 문자열을 넣으면 됩니다.");
console.log("KOREAN_DICT_API_KEY는 국립국어원 API 키를 넣으면 됩니다.");
