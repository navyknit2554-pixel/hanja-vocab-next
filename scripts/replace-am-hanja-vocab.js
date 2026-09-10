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

const target = {
  level: "초급",
  day: 52,
  position: 4,
  character: "癌",
  sound: "암",
  meaning: "암",
  radical: "癌"
};

const vocabItems = [
  {
    hanjaWord: "癌",
    word: "암",
    meaning: "몸속에 생기는 나쁜 병의 한 가지.",
    examples: ["건강 검진은 암을 일찍 발견하는 데 도움이 된다."]
  },
  {
    hanjaWord: "胃癌",
    word: "위암",
    meaning: "위에 생기는 암.",
    examples: ["의사는 위암을 예방하려면 건강한 식습관이 중요하다고 말했다."]
  },
  {
    hanjaWord: "肺癌",
    word: "폐암",
    meaning: "폐에 생기는 암.",
    examples: ["담배를 피우지 않는 것은 폐암 예방에 도움이 된다."]
  },
  {
    hanjaWord: "癌細胞",
    word: "암세포",
    meaning: "암을 이루는 세포.",
    examples: ["연구원들은 암세포의 변화를 관찰했다."]
  },
  {
    hanjaWord: "癌患者",
    word: "암환자",
    meaning: "암을 앓고 있는 사람.",
    examples: ["병원에서는 암환자를 위한 상담 프로그램을 운영한다."]
  },
  {
    hanjaWord: "抗癌",
    word: "항암",
    meaning: "암을 억제하거나 치료함.",
    examples: ["의사는 항암 치료 방법을 가족에게 설명했다."]
  },
  {
    hanjaWord: "發癌",
    word: "발암",
    meaning: "암이 생기게 함.",
    examples: ["발암 물질을 피하는 생활 습관이 필요하다."]
  },
  {
    hanjaWord: "制癌",
    word: "제암",
    meaning: "암을 억제함.",
    examples: ["과학자들은 제암 효과가 있는 물질을 연구했다."]
  }
];

main()
  .catch((error) => {
    console.error("암 한자 교체와 어휘 보강에 실패했습니다.");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end({ timeout: 5 }).catch(() => {});
  });

async function main() {
  const rows = await db`
    select c.id as curriculum_day_id, h.id as hanja_item_id, h.character
    from curriculum_days c
    join hanja_items h on h.curriculum_day_id = c.id
    where c.level = ${target.level}
      and c.day = ${target.day}
      and h.position = ${target.position}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error(`${target.level} ${target.day}일차 ${target.position}번째 한자를 찾지 못했습니다.`);

  if (row.character !== target.character) {
    await db`delete from vocab_items where hanja_item_id = ${row.hanja_item_id}`;
  }

  await db`
    update hanja_items
    set character = ${target.character},
        sound = ${target.sound},
        meaning = ${target.meaning},
        radical = ${target.radical},
        origin_note = '',
        relation_note = ${`${target.character}는 暗과 음이 같은 한자입니다.`},
        relation_role = '동음-짝',
        updated_at = now()
    where id = ${row.hanja_item_id}
  `;

  const existingRows = await db`
    select word, position
    from vocab_items
    where hanja_item_id = ${row.hanja_item_id}
    order by position
  `;
  const existingWords = new Set(existingRows.map((item) => item.word));
  let nextPosition = existingRows.reduce((max, item) => Math.max(max, Number(item.position)), 0) + 1;
  let added = 0;
  let skipped = 0;

  for (const item of vocabItems) {
    if (existingWords.has(item.word)) {
      skipped += 1;
      continue;
    }
    const inserted = await db`
      insert into vocab_items (hanja_item_id, position, hanja_word, word, meaning, source, source_target_code, needs_review)
      values (${row.hanja_item_id}, ${nextPosition}, ${item.hanjaWord}, ${item.word}, ${item.meaning}, '관리자 보강', '', false)
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

  console.log(`${target.level} ${target.day}일차 ${target.position}번째: ${row.character} -> ${target.character}`);
  console.log(`어휘 ${added}개 추가, ${skipped}개 중복 건너뜀`);
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
