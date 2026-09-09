const fs = require("fs");
const postgres = require("postgres");

loadLocalEnv();

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("SUPABASE_DATABASE_URL 또는 DATABASE_URL이 필요합니다.");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: "require",
  connect_timeout: 20,
  idle_timeout: 20
});

const labelPattern = /^\s*[\[(<【]?\s*(문장|대화|예문|구)\s*(\d+|[一二三])?\s*[\])>】]?\s*[:：.\-–—]*\s*/i;

main()
  .catch((error) => {
    console.error("용례 라벨 정리에 실패했습니다.");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => {});
  });

async function main() {
  const rows = await sql`
    select id, example_text
    from vocab_examples
    where example_text ~ '^[[:space:]]*[\\[\\(<【]?[[:space:]]*(문장|대화|예문|구)'
    order by created_at asc
  `;

  let changed = 0;
  for (const row of rows) {
    const cleaned = cleanExample(row.example_text);
    if (!cleaned || cleaned === row.example_text) continue;
    await sql`
      update vocab_examples
      set example_text = ${cleaned}
      where id = ${row.id}
    `;
    changed += 1;
  }

  console.log(`용례 라벨 ${changed}개를 정리했습니다.`);
}

function cleanExample(value) {
  return String(value || "")
    .replace(labelPattern, "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}
