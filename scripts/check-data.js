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

main()
  .catch((error) => {
    console.error("데이터 확인에 실패했습니다.");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => {});
  });

async function main() {
  const counts = await sql`
    select
      (select count(*)::int from teachers) as teachers,
      (select count(*)::int from students) as students,
      (select count(*)::int from curriculum_days) as curriculum_days,
      (select count(*)::int from hanja_items) as hanja_items,
      (select count(*)::int from vocab_items) as vocab_items,
      (select count(*)::int from student_progress) as student_progress
  `;

  console.log("현재 v2 Supabase 데이터 개수:");
  console.table(counts);

  console.log("강사별 학생 수:");
  console.table(await sql`
    select t.code as teacher_code, count(s.id)::int as students
    from teachers t
    left join students s on s.teacher_id = t.id
    group by t.code
    order by students desc, t.code asc
  `);

  console.log("레벨별 학생 수:");
  console.table(await sql`
    select level, count(*)::int as students
    from students
    group by level
    order by level
  `);
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
