import { NextResponse } from "next/server";
import { findLesson, lessonVocab } from "../../../../src/lib/curriculum";
import { scopeKeyFromTeacherCode } from "../../../../src/lib/licenseAuth";
import { getState } from "../../../../src/lib/serverStore";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const teacherCode = searchParams.get("teacher") || "master";
  const studentId = searchParams.get("student") || "";
  const token = searchParams.get("token") || "";
  if (!studentId || !token) {
    return NextResponse.json({ ok: false, message: "학부모 확인 링크가 올바르지 않습니다." }, { status: 400 });
  }

  const state = await getState(scopeKeyFromTeacherCode(teacherCode));
  const student = state.students.find((item) => item.id === studentId);
  if (!student || !student.parentToken || student.parentToken !== token) {
    return NextResponse.json({ ok: false, message: "학부모 확인 링크가 만료되었거나 올바르지 않습니다." }, { status: 403 });
  }

  const levelLessons = state.curriculum
    .filter((lesson) => String(lesson.level || "").trim() === String(student.level || "").trim())
    .sort((a, b) => Number(a.day) - Number(b.day));
  const currentLesson = findLesson(state.curriculum, student.day, student.level);
  const progress = state.progress[student.id] || { completed: {}, quiz: {} };
  const history = levelLessons.map((lesson) => buildDayRecord(lesson, progress, Number(student.day || 1)));
  const completedCount = history.filter((record) => record.statusKey === "completed").length;
  const activeCount = history.filter((record) => record.statusKey === "active" || record.statusKey === "retry").length;

  return NextResponse.json({
    ok: true,
    student: {
      name: student.name,
      grade: student.grade,
      level: student.level,
      day: Number(student.day || 1)
    },
    summary: {
      completedCount,
      activeCount,
      totalDays: levelLessons.length,
      currentWords: lessonVocab(currentLesson).length
    },
    currentLesson: currentLesson ? {
      day: Number(currentLesson.day),
      hanja: (currentLesson.hanjaSet || []).slice(0, Number(currentLesson.dailyCount || 4)).map((item) => ({
        character: item.character,
        sound: item.sound,
        meaning: item.meaning
      }))
    } : null,
    history
  });
}

function buildDayRecord(lesson, progress, currentDay) {
  const day = Number(lesson.day);
  const record = progress.quiz?.[day] || {};
  const completed = Boolean(progress.completed?.[day]) && !record.wrong?.length;
  const total = Number(record.total || 0);
  const correct = Number(record.correct || 0);
  const attempts = Number(record.attempts || (total ? 1 : 0));
  const rate = total ? Math.round((correct / total) * 100) : 0;
  const words = lessonVocab(lesson).length;
  const statusKey = completed ? "completed" : record.wrong?.length ? "retry" : total ? "active" : day === currentDay ? "ready" : "idle";
  const statusLabel = {
    completed: "학습 완성",
    retry: "복습 필요",
    active: "진행 중",
    ready: "학습 가능",
    idle: "시작 전"
  }[statusKey];
  return {
    day,
    statusKey,
    statusLabel,
    rate,
    correct,
    total,
    attempts,
    words,
    wrongCount: Array.isArray(record.wrong) ? record.wrong.length : 0,
    finishedAt: record.finishedAt || ""
  };
}
