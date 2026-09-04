import { NextResponse } from "next/server";
import { adminErrorResponse, requireMaster } from "../../../../src/lib/adminAccess";
import { lookupHanjaVocabulary } from "../../../../src/lib/dictionary";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  try {
    await requireMaster();
    const body = await request.json().catch(() => ({}));
    const level = String(body.level || "").trim();
    const day = Number(body.day || 0);
    const hanjaId = String(body.hanjaId || "").trim();
    if (!["초급", "중급", "고급"].includes(level) || day < 1 || day > 100) {
      return NextResponse.json({ ok: false, message: "난이도와 일차를 확인해 주세요." }, { status: 400 });
    }

    const db = await sql();
    const lessonRows = await db`select id from curriculum_days where level = ${level} and day = ${day} limit 1`;
    const lesson = lessonRows[0];
    if (!lesson) return NextResponse.json({ ok: false, message: "해당 일차가 아직 없습니다." }, { status: 404 });

    const hanjaRows = hanjaId ? await db`
      select id, character
      from hanja_items
      where curriculum_day_id = ${lesson.id}
        and id = ${hanjaId}
      order by position asc
    ` : await db`
      select id, character
      from hanja_items
      where curriculum_day_id = ${lesson.id}
      order by position asc
    `;
    if (hanjaId && !hanjaRows.length) {
      return NextResponse.json({ ok: false, message: "가져올 한자를 찾지 못했습니다." }, { status: 404 });
    }
    let vocabCount = 0;
    const missing = [];
    const failed = [];

    const lookupResults = hanjaId ? [await lookupOneHanja(hanjaRows[0])] : await Promise.all(hanjaRows.map(lookupOneHanja));

    async function lookupOneHanja(hanja) {
      try {
        const words = await lookupHanjaVocabulary(hanja.character, 8);
        return { hanja, words };
      } catch (error) {
        return { hanja, words: [], error };
      }
    }

    for (const result of lookupResults) {
      const { hanja, words, error } = result;
      if (error) {
        failed.push(`${hanja.character}: ${error.message || "조회 실패"}`);
        continue;
      }
      if (!words.length) {
        missing.push(hanja.character);
        continue;
      }
      await db`delete from vocab_items where hanja_item_id = ${hanja.id}`;
      for (let index = 0; index < words.length; index += 1) {
        const item = words[index];
        const vocabRows = await db`
          insert into vocab_items (hanja_item_id, position, hanja_word, word, meaning, source, source_target_code, needs_review)
          values (${hanja.id}, ${index + 1}, ${item.hanjaWord}, ${item.word}, ${item.meaning}, '한국어기초사전', ${item.targetCode || ""}, false)
          returning id
        `;
        for (let exampleIndex = 0; exampleIndex < item.examples.length; exampleIndex += 1) {
          await db`
            insert into vocab_examples (vocab_item_id, position, example_text, source)
            values (${vocabRows[0].id}, ${exampleIndex + 1}, ${item.examples[exampleIndex]}, '한국어기초사전')
          `;
        }
        vocabCount += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        level,
        day,
        hanjaCount: hanjaRows.length,
        vocabCount,
        missing,
        failed
      }
    });
  } catch (error) {
    console.error("dictionary import failed", error);
    return adminErrorResponse(error, NextResponse);
  }
}
