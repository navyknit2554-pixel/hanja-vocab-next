const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

loadLocalEnv();

const targetUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!targetUrl) {
  console.error("SUPABASE_DATABASE_URL 또는 DATABASE_URL이 필요합니다.");
  process.exit(1);
}

const db = postgres(targetUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
  idle_timeout: 20,
  connect_timeout: 20
});

const vocabItems = [
  {
    hanjaWord: "豊年",
    word: "풍년",
    meaning: "농사가 잘되어 수확이 많은 해.",
    examples: ["올해는 날씨가 좋아 풍년이 들었다."]
  },
  {
    hanjaWord: "豊作",
    word: "풍작",
    meaning: "농작물이 평소보다 많이 거두어짐.",
    examples: ["사과 풍작으로 시장에 과일이 많아졌다."]
  },
  {
    hanjaWord: "豊富",
    word: "풍부",
    meaning: "넉넉하고 많음.",
    examples: ["이 책에는 다양한 예문이 풍부하게 실려 있다."]
  },
  {
    hanjaWord: "豊饒",
    word: "풍요",
    meaning: "넉넉하고 여유가 있음.",
    examples: ["사람들은 모두 풍요로운 삶을 꿈꾼다."]
  },
  {
    hanjaWord: "豊足",
    word: "풍족",
    meaning: "넉넉하여 모자람이 없음.",
    examples: ["마을 사람들은 물을 풍족하게 쓸 수 있었다."]
  },
  {
    hanjaWord: "豊盛",
    word: "풍성",
    meaning: "넉넉하고 많음.",
    examples: ["잔칫상에는 음식이 풍성하게 차려졌다."]
  },
  {
    hanjaWord: "豊漁",
    word: "풍어",
    meaning: "물고기가 많이 잡힘.",
    examples: ["어부들은 풍어를 바라며 바다로 나갔다."]
  }
];

main()
  .catch((error) => {
    console.error("豊/豐 어휘 보강에 실패했습니다.");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });

async function main() {
  const rows = await db`
    select c.level, c.day, h.id, h.character, h.sound, h.meaning
    from curriculum_days c
    join hanja_items h on h.curriculum_day_id = c.id
    where h.character in ('豊', '豐') or (h.sound = '풍' and h.meaning like '%풍성%')
    order by c.level, c.day, h.position
  `;
  if (!rows.length) throw new Error("豊/豐 한자 항목을 찾지 못했습니다.");

  let added = 0;
  let skipped = 0;
  for (const hanja of rows) {
    const existingRows = await db`
      select word, position
      from vocab_items
      where hanja_item_id = ${hanja.id}
      order by position
    `;
    const existingWords = new Set(existingRows.map((item) => item.word));
    let nextPosition = existingRows.reduce((max, item) => Math.max(max, Number(item.position)), 0) + 1;

    for (const item of vocabItems) {
      if (existingWords.has(item.word)) {
        skipped += 1;
        continue;
      }
      const inserted = await db`
        insert into vocab_items (hanja_item_id, position, hanja_word, word, meaning, source, source_target_code, needs_review)
        values (${hanja.id}, ${nextPosition}, ${item.hanjaWord}, ${item.word}, ${item.meaning}, '관리자 보강', '', false)
        returning id
      `;
      for (let index = 0; index < item.examples.length; index += 1) {
        await db`
          insert into vocab_examples (vocab_item_id, position, example_text, source)
          values (${inserted[0].id}, ${index + 1}, ${item.examples[index]}, '관리자 보강')
        `;
      }
      nextPosition += 1;
      added += 1;
    }
  }

  console.log(`대상 한자 ${rows.length}개: 어휘 ${added}개 추가, ${skipped}개 중복 건너뜀`);
  console.table(rows.map((row) => ({
    level: row.level,
    day: row.day,
    character: row.character,
    sound: row.sound,
    meaning: row.meaning
  })));
}

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
