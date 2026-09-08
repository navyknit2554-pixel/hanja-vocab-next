import { NextResponse } from "next/server";
import { adminErrorResponse, requireMaster } from "../../../../src/lib/adminAccess";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request) {
  try {
    await requireMaster();
    const { searchParams } = new URL(request.url);
    const level = String(searchParams.get("level") || "").trim();
    if (!["초급", "중급", "고급"].includes(level)) {
      return NextResponse.json({ ok: false, message: "난이도를 확인해 주세요." }, { status: 400 });
    }

    const db = await sql();
    const rows = await db`
      select
        c.id as lesson_id,
        c.level,
        c.day,
        c.title,
        h.id as hanja_id,
        h.position,
        h.character,
        h.sound,
        h.meaning,
        count(v.id)::int as vocab_count
      from curriculum_days c
      left join hanja_items h on h.curriculum_day_id = c.id
      left join vocab_items v on v.hanja_item_id = h.id
      where c.level = ${level}
      group by c.id, c.level, c.day, c.title, h.id, h.position, h.character, h.sound, h.meaning
      order by c.day asc, h.position asc
    `;

    const days = [];
    const byDay = new Map();
    for (const row of rows) {
      let lesson = byDay.get(row.day);
      if (!lesson) {
        lesson = {
          id: row.lesson_id,
          level: row.level,
          day: row.day,
          title: row.title,
          hanja: [],
          vocabCount: 0
        };
        byDay.set(row.day, lesson);
        days.push(lesson);
      }
      if (row.hanja_id) {
        lesson.hanja.push({
          id: row.hanja_id,
          position: row.position,
          character: row.character,
          sound: row.sound,
          meaning: row.meaning,
          vocabCount: row.vocab_count
        });
        lesson.vocabCount += Number(row.vocab_count || 0);
      }
    }

    return NextResponse.json({ ok: true, level, days });
  } catch (error) {
    console.error("admin curriculum load failed", error);
    return adminErrorResponse(error, NextResponse);
  }
}
