export function studentPayload(state, student) {
  return {
    ok: true,
    student: withoutPassword(student),
    curriculum: studentCurriculumSlice(state.curriculum, student),
    progress: state.progress?.[student.id] || { completed: {}, quiz: {} }
  };
}

export function withoutPassword(student) {
  const { password, ...safeStudent } = student;
  return safeStudent;
}

export function studentCurriculumSlice(curriculum, student) {
  const lessons = Array.isArray(curriculum) ? curriculum : [];
  const level = String(student?.level || "").trim();
  const day = Math.max(1, Number(student?.day || 1));
  const startDay = Math.max(1, day - 4);
  const endDay = Math.min(100, day + 1);
  return lessons.filter((lesson) => {
    const lessonLevel = String(lesson?.level || "").trim();
    const lessonDay = Number(lesson?.day || 0);
    return lessonLevel === level && lessonDay >= startDay && lessonDay <= endDay;
  });
}
