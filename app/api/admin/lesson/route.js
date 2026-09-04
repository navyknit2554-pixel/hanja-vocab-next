import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "../../../../src/lib/adminAccess";
import { getLessonDetail } from "../../../../src/lib/learning";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const level = String(searchParams.get("level") || "").trim();
    const day = Number(searchParams.get("day") || 0);
    if (!["초급", "중급", "고급"].includes(level) || day < 1 || day > 100) {
      return NextResponse.json({ ok: false, message: "난이도와 일차를 확인해 주세요." }, { status: 400 });
    }

    const lesson = await getLessonDetail({ level, day });
    if (!lesson) return NextResponse.json({ ok: false, message: "해당 일차가 아직 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, ...lesson });
  } catch (error) {
    console.error("admin lesson load failed", error);
    return adminErrorResponse(error, NextResponse);
  }
}
