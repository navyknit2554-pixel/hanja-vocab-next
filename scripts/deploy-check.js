const fs = require("fs");
const path = require("path");

const root = process.cwd();
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function check(label, passed, detail = "") {
  checks.push({ label, passed, detail });
}

const packageJson = JSON.parse(read("package.json"));
const gitignore = exists(".gitignore") ? read(".gitignore") : "";
const envExample = exists(".env.example") ? read(".env.example") : "";

check("Next.js build script", packageJson.scripts?.build === "next build", "package.json에 build 스크립트가 필요합니다.");
check("Health API", exists("app/api/health/route.js"), "/api/health가 있어야 배포 후 상태 확인이 쉽습니다.");
check("Deployment guide", exists("DEPLOYMENT.md"), "DEPLOYMENT.md 체크리스트가 필요합니다.");
check("Local data ignored", gitignore.includes(".data"), ".data는 로컬 저장 파일이라 배포에서 제외해야 합니다.");
check("Env files ignored", gitignore.includes(".env*") && gitignore.includes("!.env.example"), ".env는 숨기고 .env.example만 남겨야 합니다.");

["POSTGRES_URL", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "STUDENT_SESSION_SECRET", "HANJA_LICENSE_SECRET"].forEach((key) => {
  check(`Env example: ${key}`, envExample.includes(key), `.env.example에 ${key} 안내가 필요합니다.`);
});

const failed = checks.filter((item) => !item.passed);

checks.forEach((item) => {
  const mark = item.passed ? "OK" : "FAIL";
  console.log(`[${mark}] ${item.label}`);
  if (!item.passed && item.detail) console.log(`  - ${item.detail}`);
});

if (failed.length) {
  console.error(`\n${failed.length}개 배포 점검 항목을 확인해야 합니다.`);
  process.exit(1);
}

console.log("\n배포 전 정적 점검을 통과했습니다. 이어서 npm run build를 실행하면 됩니다.");
