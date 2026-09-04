import { NextResponse } from "next/server";
import { adminErrorResponse, requireMaster } from "../../../../src/lib/adminAccess";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function PATCH(request) {
  try {
    await requireMaster();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const hanjaWord = String(body.hanjaWord || "").trim();
    const word = String(body.word || "").trim();
    const meaning = String(body.meaning || "").trim();
    const examples = Array.isArray(body.examples)
      ? body.examples.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
      : [];

    if (!id || !hanjaWord || !word || !meaning) {
      return NextResponse.json({ ok: false, message: "한자어, 어휘, 뜻은 비울 수 없습니다." }, { status: 400 });
    }

    const db = await sql();
    await db`
      update vocab_items
      set hanja_word = ${hanjaWord},
          word = ${word},
          meaning = ${meaning},
          needs_review = false,
          updated_at = now()
      where id = ${id}
    `;
    await db`delete from vocab_examples where vocab_item_id = ${id}`;
    for (let index = 0; index < examples.length; index += 1) {
      await db`
        insert into vocab_examples (vocab_item_id, position, example_text, source)
        values (${id}, ${index + 1}, ${examples[index]}, '관리자 편집')
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin vocab update failed", error);
    return adminErrorResponse(error, NextResponse);
  }
}

export async function DELETE(request) {
  try {
    await requireMaster();
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ ok: false, message: "삭제할 어휘를 찾지 못했습니다." }, { status: 400 });

    const db = await sql();
    await db`delete from vocab_items where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin vocab delete failed", error);
    return adminErrorResponse(error, NextResponse);
  }
}
