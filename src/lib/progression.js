export function normalizeStudentProgression(state, student) {
  if (!state || !student) return false;
  state.progress ||= {};
  state.progress[student.id] ||= { completed: {}, quiz: {} };
  const progress = state.progress[student.id];
  progress.completed ||= {};
  progress.quiz ||= {};
  progress.unlocks ||= {};

  let changed = false;
  let currentDay = Number(student.day || 1) || 1;
  const level = String(student.level || "").trim();

  for (let guard = 0; guard < 200; guard += 1) {
    const record = progress.quiz?.[currentDay] || {};
    const completed = Boolean(progress.completed?.[currentDay]) && !record?.wrong?.length;
    if (!completed) break;

    const nextDay = currentDay + 1;
    if (!hasLessonForDay(state, nextDay, level)) break;

    if (!progress.unlocks[nextDay]) {
      const inferredUnlock = inferNextUnlockFromRecord(record);
      if (inferredUnlock) {
        progress.unlocks[nextDay] = inferredUnlock;
        changed = true;
      }
    }

    if (Number(student.day || 1) !== nextDay) {
      student.day = nextDay;
      changed = true;
    }

    currentDay = nextDay;
  }

  return changed;
}

export function inferNextUnlockFromRecord(record) {
  if (!record?.finishedAt) return "";
  const finished = new Date(record.finishedAt);
  if (Number.isNaN(finished.getTime())) return "";
  const koreanFinished = new Date(finished.getTime() + 9 * 60 * 60 * 1000);
  const nextMidnightUtcMs = Date.UTC(
    koreanFinished.getUTCFullYear(),
    koreanFinished.getUTCMonth(),
    koreanFinished.getUTCDate() + 1,
    -9,
    0,
    0,
    0
  );
  return new Date(nextMidnightUtcMs).toISOString();
}

export function hasLessonForDay(state, day, level) {
  const targetLevel = String(level || "").trim();
  return (state.curriculum || []).some(
    (lesson) => Number(lesson.day) === Number(day) && String(lesson.level || "").trim() === targetLevel
  );
}
