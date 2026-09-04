import { NextResponse } from "next/server";
import { hasDatabase, sql } from "../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json(
      { ok: false, storage: "missing", message: "SUPABASE_DATABASE_URL 또는 DATABASE_URL이 필요합니다." },
      { status: 500 }
    );
  }

  try {
    const db = await sql();
    const rows = await db`
      select
        (select count(*)::int from teachers) as teachers,
        (select count(*)::int from students) as students,
        (select count(*)::int from curriculum_days) as curriculum_days,
        (select count(*)::int from hanja_items) as hanja_items,
        (select count(*)::int from vocab_items) as vocab_items,
        (select count(*)::int from student_progress) as student_progress
    `;

    return NextResponse.json({
      ok: true,
      storage: "postgres",
      nodeEnv: process.env.NODE_ENV || "development",
      counts: rows[0],
      warnings: []
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        storage: "postgres",
        message: error?.message || "DB 연결 확인에 실패했습니다.",
        code: error?.code || ""
      },
      { status: 500 }
    );
  }
}
