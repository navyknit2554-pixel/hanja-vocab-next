import { NextResponse } from "next/server";
import { adminConfigError } from "../../../src/lib/adminAuth";
import { studentConfigError } from "../../../src/lib/studentAuth";
import { getState, storageMode } from "../../../src/lib/serverStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const warnings = [];
  const adminError = adminConfigError();
  const studentError = studentConfigError();
  const storage = storageMode();

  if (adminError) warnings.push(adminError);
  if (studentError) warnings.push(studentError);
  if (process.env.NODE_ENV === "production" && storage !== "postgres") {
    warnings.push("Vercel 운영 배포에서는 POSTGRES_URL 또는 DATABASE_URL을 설정해야 학습 기록이 안정적으로 저장됩니다.");
  }

  try {
    const state = await getState();
    return NextResponse.json({
      ok: warnings.length === 0,
      storage,
      nodeEnv: process.env.NODE_ENV || "development",
      counts: {
        students: state.students?.length || 0,
        lessons: state.curriculum?.length || 0
      },
      warnings
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      storage,
      nodeEnv: process.env.NODE_ENV || "development",
      error: error.message,
      warnings
    }, { status: 500 });
  }
}
