const { randomBytes } = require("crypto");

function secret() {
  return randomBytes(32).toString("hex");
}

console.log("Vercel Environment Variables에 아래 값을 넣으세요.\n");
console.log(`ADMIN_SESSION_SECRET=${secret()}`);
console.log(`STUDENT_SESSION_SECRET=${secret()}`);
console.log("\nADMIN_PASSWORD는 선생님이 기억할 수 있는 새 비밀번호로 직접 정하면 됩니다.");
console.log("POSTGRES_URL은 Neon에서 복사한 연결 문자열을 넣으면 됩니다.");
