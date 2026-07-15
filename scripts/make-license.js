const { createHmac, randomBytes } = require("crypto");

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const secret = arg("secret", process.env.HANJA_LICENSE_SECRET || process.env.ADMIN_SESSION_SECRET || "");
const days = Number(arg("days", "365"));
const expires = arg("expires", "");

if (!secret) {
  console.error("HANJA_LICENSE_SECRET 또는 ADMIN_SESSION_SECRET 환경변수가 필요합니다.");
  process.exit(1);
}

const expiresAt = expires ? new Date(`${expires}T23:59:59+09:00`) : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
if (Number.isNaN(expiresAt.getTime())) {
  console.error("만료일을 해석할 수 없습니다.");
  process.exit(1);
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const nonce = Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("");
const exp36 = Math.floor(expiresAt.getTime() / 1000).toString(36).toUpperCase();
const payload = `${exp36}.${nonce}`;
const signature = createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 22);

console.log(`HANJA-${exp36}-${nonce}-${signature}`);
console.log(`만료: ${expiresAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
