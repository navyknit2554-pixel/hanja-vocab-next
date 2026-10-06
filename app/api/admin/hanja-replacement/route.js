import { NextResponse } from "next/server";
import { adminErrorResponse, requireMaster } from "../../../../src/lib/adminAccess";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request) {
  try {
    await requireMaster();
    const { searchParams } = new URL(request.url);
    const hanjaId = String(searchParams.get("hanjaId") || "").trim();
    if (!hanjaId) {
      return NextResponse.json({ ok: false, message: "교체할 한자를 선택해 주세요." }, { status: 400 });
    }

    const db = await sql();
    const target = await getTargetHanja(db, hanjaId);
    if (!target) return NextResponse.json({ ok: false, message: "교체할 한자를 찾지 못했습니다." }, { status: 404 });

    const lessonCharacters = await db`
      select character
      from hanja_items
      where curriculum_day_id = ${target.curriculum_day_id}
    `;
    const usedCharacters = new Set(lessonCharacters.map((item) => item.character));

    const rows = await db`
      select
        h.id,
        h.character,
        h.sound,
        h.meaning,
        h.radical,
        h.origin_note,
        h.relation_note,
        h.relation_role,
        c.level,
        c.day,
        count(v.id)::int as vocab_count
      from hanja_items h
      join curriculum_days c on c.id = h.curriculum_day_id
      left join vocab_items v on v.hanja_item_id = h.id
      where h.sound = ${target.sound}
        and h.character <> ${target.character}
      group by h.id, c.level, c.day
      order by count(v.id) desc, c.day asc, h.character asc
    `;
    const seen = new Set();
    const candidates = rows
      .filter((item) => !usedCharacters.has(item.character))
      .filter((item) => {
        const key = `${item.character}:${item.meaning}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 24);

    return NextResponse.json({ ok: true, target, candidates });
  } catch (error) {
    console.error("hanja replacement candidates failed", error);
    return adminErrorResponse(error, NextResponse);
  }
}

export async function POST(request) {
  try {
    await requireMaster();
    const body = await request.json().catch(() => ({}));
    const targetHanjaId = String(body.targetHanjaId || "").trim();
    const sourceHanjaId = String(body.sourceHanjaId || "").trim();
    if (!targetHanjaId || !sourceHanjaId || targetHanjaId === sourceHanjaId) {
      return NextResponse.json({ ok: false, message: "교체할 한자와 후보 한자를 확인해 주세요." }, { status: 400 });
    }

    const db = await sql();
    const target = await getTargetHanja(db, targetHanjaId);
    const source = await getTargetHanja(db, sourceHanjaId);
    if (!target || !source) return NextResponse.json({ ok: false, message: "한자 정보를 찾지 못했습니다." }, { status: 404 });
    if (target.sound !== source.sound) {
      return NextResponse.json({ ok: false, message: "동일한 음의 한자로만 교체할 수 있습니다." }, { status: 400 });
    }
    if (target.character === source.character) {
      return NextResponse.json({ ok: false, message: "이미 같은 한자입니다." }, { status: 400 });
    }

    const duplicateRows = await db`
      select id
      from hanja_items
      where curriculum_day_id = ${target.curriculum_day_id}
        and character = ${source.character}
        and id <> ${target.id}
      limit 1
    `;
    if (duplicateRows[0]) {
      return NextResponse.json({ ok: false, message: "이 일차에 이미 같은 한자가 있습니다." }, { status: 409 });
    }

    await db.begin(async (tx) => {
      await tx`
        update hanja_items
        set character = ${source.character},
            sound = ${source.sound},
            meaning = ${source.meaning},
            radical = ${source.radical || ""},
            origin_note = ${source.origin_note || ""},
            relation_note = ${source.relation_note || ""},
            relation_role = ${source.relation_role || ""},
            updated_at = now()
        where id = ${target.id}
      `;
      await tx`delete from vocab_items where hanja_item_id = ${target.id}`;

      const sourceVocab = await tx`
        select id, position, hanja_word, word, meaning, source, source_target_code, needs_review
        from vocab_items
        where hanja_item_id = ${source.id}
        order by position asc
      `;
      for (const vocab of sourceVocab) {
        const inserted = await tx`
          insert into vocab_items (hanja_item_id, position, hanja_word, word, meaning, source, source_target_code, needs_review)
          values (${target.id}, ${vocab.position}, ${vocab.hanja_word}, ${vocab.word}, ${vocab.meaning}, ${vocab.source}, ${vocab.source_target_code}, ${vocab.needs_review})
          returning id
        `;
        const examples = await tx`
          select position, example_text, source
          from vocab_examples
          where vocab_item_id = ${vocab.id}
          order by position asc
        `;
        for (const example of examples) {
          await tx`
            insert into vocab_examples (vocab_item_id, position, example_text, source)
            values (${inserted[0].id}, ${example.position}, ${example.example_text}, ${example.source})
          `;
        }
      }
    });

    return NextResponse.json({
      ok: true,
      message: `${target.character}을/를 ${source.character}(으)로 교체했습니다.`
    });
  } catch (error) {
    console.error("hanja replacement failed", error);
    return adminErrorResponse(error, NextResponse);
  }
}

async function getTargetHanja(db, hanjaId) {
  const rows = await db`
    select
      h.id,
      h.curriculum_day_id,
      h.position,
      h.character,
      h.sound,
      h.meaning,
      h.radical,
      h.origin_note,
      h.relation_note,
      h.relation_role,
      c.level,
      c.day
    from hanja_items h
    join curriculum_days c on c.id = h.curriculum_day_id
    where h.id = ${hanjaId}
    limit 1
  `;
  return rows[0] || null;
}
