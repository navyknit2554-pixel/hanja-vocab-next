import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "../../../../src/lib/adminAccess";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const level = String(body.level || "").trim();
    const startDay = clampNumber(body.startDay, 1, 100);
    const endDay = clampNumber(body.endDay, 1, 100);
    const questionCount = clampNumber(body.questionCount, 1, 100);

    if (!["초급", "중급", "고급"].includes(level) || startDay > endDay) {
      return NextResponse.json({ ok: false, message: "난이도와 일차 범위를 확인해 주세요." }, { status: 400 });
    }

    const db = await sql();
    const rows = await db`
      select
        c.day,
        h.character,
        v.hanja_word,
        v.word,
        v.meaning,
        coalesce((
          select e.example_text
          from vocab_examples e
          where e.vocab_item_id = v.id
          order by e.position asc
          limit 1
        ), '') as example
      from curriculum_days c
      join hanja_items h on h.curriculum_day_id = c.id
      join vocab_items v on v.hanja_item_id = h.id
      where c.level = ${level}
        and c.day between ${startDay} and ${endDay}
        and trim(v.word) <> ''
        and trim(v.meaning) <> ''
      order by c.day asc, h.position asc, v.position asc
    `;

    const pool = shuffle(rows.map((row) => ({
      day: Number(row.day),
      character: row.character,
      hanjaWord: row.hanja_word,
      word: row.word,
      meaning: row.meaning,
      example: cleanExample(row.example)
    })));
    const selected = pool.slice(0, Math.min(questionCount, pool.length));
    const questions = selected.map((item, index) => buildQuestion(item, index, pool));

    return NextResponse.json({
      ok: true,
      test: {
        title: `${level} ${startDay}-${endDay}일차 어휘 테스트`,
        level,
        startDay,
        endDay,
        requestedCount: questionCount,
        availableCount: pool.length,
        questions
      }
    });
  } catch (error) {
    console.error("test paper generation failed", error);
    return adminErrorResponse(error, NextResponse);
  }
}

function buildQuestion(item, index, pool) {
  const type = index % 2 === 0 ? "meaning" : "blank";
  if (type === "blank") {
    const prompt = item.example && item.example.includes(item.word)
      ? item.example.replaceAll(item.word, "____")
      : `${item.meaning}에 알맞은 어휘를 고르세요.`;
    const choices = makeChoices(item.word, pool.map((entry) => entry.word), index + 5);
    return {
      number: index + 1,
      type,
      day: item.day,
      character: item.character,
      prompt,
      choices,
      answerIndex: choices.indexOf(item.word),
      answer: item.word
    };
  }
  const choices = makeChoices(item.meaning, pool.map((entry) => entry.meaning), index);
  return {
    number: index + 1,
    type,
    day: item.day,
    character: item.character,
    prompt: `${item.hanjaWord} · ${item.word}`,
    choices,
    answerIndex: choices.indexOf(item.meaning),
    answer: item.meaning
  };
}

function makeChoices(answer, pool, offset = 0) {
  const candidates = shuffle([...new Set(pool.filter((item) => item && item !== answer))]);
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
  const choices = [answer, ...rotated.slice(0, 4)];
  return shuffle([...new Set(choices)].slice(0, 5));
}

function cleanExample(value) {
  return String(value || "")
    .replace(/^\s*[\[(<【]?\s*(문장|대화|예문|구)\s*(\d+|[一二三])?\s*[\])>】]?\s*[:：.\-–—]*\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}
