"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { buildAiPrompt, findLesson, lessonVocab, parseAiLessons, upsertLesson, validateAppStateShape, validateLesson } from "../lib/curriculum";
import { buildSeedCurriculum } from "../lib/data";
import { loadAppState, resetAppState, saveAppState } from "../lib/store";
import { Mascot } from "./Mascot";

const gradeOptions = ["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"];
const defaultStudentForm = { name: "", phone: "", loginId: "", password: "", grade: "초1", level: "초급" };

function passwordFromPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.startsWith("010") ? digits.slice(3) : digits;
}

function normalizeGradeLabel(grade) {
  const value = String(grade || "").trim();
  const elementaryMatch = value.match(/^([1-6])학년$/);
  if (elementaryMatch) return `초${elementaryMatch[1]}`;
  return gradeOptions.includes(value) ? value : "초1";
}

export function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLicenseKey, setAdminLicenseKey] = useState("");
  const [adminInfo, setAdminInfo] = useState(null);
  const [adminError, setAdminError] = useState("");
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [studentForm, setStudentForm] = useState(defaultStudentForm);
  const [plan, setPlan] = useState({ grade: "초1", level: "초급", startDay: 1, days: 3 });
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState("초급");
  const [hanjaJson, setHanjaJson] = useState("");
  const [dailyCount, setDailyCount] = useState(4);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiPreview, setAiPreview] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [progressFilter, setProgressFilter] = useState("all");
  const [bulkDay, setBulkDay] = useState(1);

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        setAuthenticated(Boolean(result.authenticated));
        if (result.authenticated) setAdminInfo(result);
        if (result.configError) setAdminError(result.configError);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    loadAppState().then(setState).catch((error) => setLoadError(error.message));
  }, [authenticated]);

  const lesson = useMemo(() => findLesson(state?.curriculum, selectedDay, selectedLevel), [selectedDay, selectedLevel, state]);
  const dayOptions = useMemo(() => {
    const lessons = state?.curriculum.filter((item) => String(item.level || "").trim() === selectedLevel) || [];
    return [...new Set(lessons.map((item) => Number(item.day)).filter(Boolean))].sort((a, b) => a - b);
  }, [selectedLevel, state]);
  const filteredStudents = useMemo(() => {
    if (!state) return [];
    const query = studentSearch.trim().toLowerCase();
    return state.students.filter((student) => {
      const matchesText = !query || [student.name, student.loginId, student.grade, student.level, `${student.day}일차`]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = progressFilter === "all" || getProgressStatus(state, student).key === progressFilter;
      return matchesText && matchesStatus;
    });
  }, [progressFilter, state, studentSearch]);
  const progressSummary = useMemo(() => {
    if (!state) return { completed: 0, retry: 0, active: 0, idle: 0 };
    return state.students.reduce((summary, student) => {
      const status = getProgressStatus(state, student).key;
      summary[status] += 1;
      return summary;
    }, { completed: 0, retry: 0, active: 0, idle: 0 });
  }, [state]);
  const contentPreview = useMemo(() => {
    if (!lesson) return { hanjaSet: [], errors: [], vocabCount: 0 };
    try {
      const hanjaSet = JSON.parse(hanjaJson || "[]");
      const previewLesson = { ...lesson, day: Number(selectedDay), dailyCount: Number(dailyCount), hanjaSet };
      const errors = validateLesson(previewLesson);
      const vocabCount = Array.isArray(hanjaSet) ? hanjaSet.reduce((total, hanja) => total + (Array.isArray(hanja.vocab) ? hanja.vocab.length : 0), 0) : 0;
      return { hanjaSet: Array.isArray(hanjaSet) ? hanjaSet : [], errors, vocabCount };
    } catch {
      return { hanjaSet: [], errors: ["한자 묶음 JSON 형식을 확인해 주세요."], vocabCount: 0 };
    }
  }, [dailyCount, hanjaJson, lesson, selectedDay]);

  useEffect(() => {
    if (!lesson) return;
    setDailyCount(lesson.dailyCount || lesson.hanjaSet?.length || 4);
    setHanjaJson(JSON.stringify(lesson.hanjaSet || [], null, 2));
  }, [lesson]);

  useEffect(() => {
    if (!dayOptions.length) return;
    setBulkDay((current) => dayOptions.includes(Number(current)) ? Number(current) : dayOptions[0]);
  }, [dayOptions]);

  useEffect(() => {
    if (!dayOptions.length) return;
    setSelectedDay((current) => dayOptions.includes(Number(current)) ? Number(current) : dayOptions[0]);
  }, [dayOptions]);

  async function loginAdmin(event) {
    event.preventDefault();
    setAdminError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword, licenseKey: adminLicenseKey })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setAdminError(result.message || "관리자 비밀번호를 확인해 주세요.");
      return;
    }
    setAuthenticated(true);
    setAdminInfo(await response.json().catch(() => null));
    setAdminPassword("");
    setAdminLicenseKey("");
  }

  async function logoutAdmin() {
    await fetch("/api/admin/session", { method: "DELETE" });
    setAuthenticated(false);
    setAdminInfo(null);
    setState(null);
  }

  async function persist(nextState) {
    setState(nextState);
    try {
      const saved = await saveAppState(nextState);
      setState(saved);
    } catch (error) {
      setLoadError(error.message);
    }
  }

  function updateStudentForm(patch) {
    setStudentForm((current) => {
      const next = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "name")) {
        next.loginId = String(patch.name || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(patch, "phone")) {
        next.password = passwordFromPhone(patch.phone);
      }
      return next;
    });
  }

  function addStudent(event) {
    event.preventDefault();
    const nextStudent = {
      id: `s${Date.now()}`,
      ...studentForm,
      phone: String(studentForm.phone || "").replace(/\D/g, ""),
      loginId: (studentForm.loginId || studentForm.name).trim(),
      password: (studentForm.password || passwordFromPhone(studentForm.phone)).trim(),
      name: studentForm.name.trim(),
      grade: normalizeGradeLabel(studentForm.grade),
      day: 1
    };
    if (!nextStudent.name || !nextStudent.loginId || !nextStudent.password) return;
    if (state.students.some((student) => student.loginId === nextStudent.loginId)) {
      alert("이미 같은 아이디를 사용하는 학생이 있습니다. 동명이인은 아이디에 반/번호를 붙여 주세요.");
      return;
    }
    const nextState = structuredClone(state);
    nextState.students.push(nextStudent);
    nextState.progress[nextStudent.id] = { completed: {}, quiz: {} };
    persist(nextState);
    setStudentForm(defaultStudentForm);
  }

  async function importStudentsCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    let rows;
    try {
      rows = parseCsv(await file.text());
    } catch {
      alert("학생 CSV 파일 형식을 확인해 주세요.");
      return;
    }
    if (rows.length < 2) {
      alert("제목줄과 학생 정보가 포함된 CSV 파일이 필요합니다.");
      return;
    }

    const headers = rows[0].map(normalizeHeader);
    const loginIds = new Set(state.students.map((student) => student.loginId));
    const nextStudents = [];
    const errors = [];

    rows.slice(1).forEach((row, index) => {
      if (!row.some((cell) => String(cell || "").trim())) return;
      const entry = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] || ""]));
      const name = String(entry.name || "").trim();
      const phone = String(entry.phone || "").replace(/\D/g, "");
      const loginId = String(entry.loginId || name).trim();
      const password = String(entry.password || passwordFromPhone(phone)).trim();
      const grade = normalizeGradeLabel(entry.grade || "초1");
      const level = String(entry.level || "초급").trim();
      const day = Number(entry.day || 1);

      if (!name || !loginId || !password) {
        errors.push(`${index + 2}행: 이름과 전화번호 또는 비밀번호가 필요합니다.`);
        return;
      }
      if (loginIds.has(loginId)) {
        errors.push(`${index + 2}행: 이미 사용 중인 아이디입니다. (${loginId})`);
        return;
      }

      loginIds.add(loginId);
      nextStudents.push({ id: `s${Date.now()}-${index}`, name, phone, loginId, password, grade, level, day: day || 1 });
    });

    if (errors.length) {
      alert(errors.slice(0, 10).join("\n"));
      return;
    }
    if (!nextStudents.length) {
      alert("가져올 학생 정보가 없습니다.");
      return;
    }

    const nextState = structuredClone(state);
    nextStudents.forEach((student) => {
      nextState.students.push(student);
      nextState.progress[student.id] = { completed: {}, quiz: {} };
    });
    await persist(nextState);
    alert(`${nextStudents.length}명의 학생 계정을 가져왔습니다.`);
  }

  function updateStudentDay(studentId, day) {
    const nextState = structuredClone(state);
    const student = nextState.students.find((item) => item.id === studentId);
    if (!student) return;
    student.day = Number(day);
    persist(nextState);
  }

  function assignFilteredStudentsDay() {
    if (!filteredStudents.length) return;
    const targetDay = Number(bulkDay);
    const label = studentSearch.trim() ? "검색된 학생" : "전체 학생";
    if (!window.confirm(`${label} ${filteredStudents.length}명을 ${targetDay}일차로 배정할까요?`)) return;
    const targetIds = new Set(filteredStudents.map((student) => student.id));
    const nextState = structuredClone(state);
    nextState.students.forEach((student) => {
      if (targetIds.has(student.id)) student.day = targetDay;
    });
    persist(nextState);
  }

  function resetStudentProgress(studentId) {
    const student = state.students.find((item) => item.id === studentId);
    if (!student || !window.confirm(`${student.name} 학생의 학습 기록을 초기화할까요?`)) return;
    const nextState = structuredClone(state);
    nextState.progress[studentId] = { completed: {}, quiz: {} };
    persist(nextState);
  }

  function deleteStudent(studentId) {
    const student = state.students.find((item) => item.id === studentId);
    if (!student || !window.confirm(`${student.name} 학생 계정을 삭제할까요?`)) return;
    const nextState = structuredClone(state);
    nextState.students = nextState.students.filter((item) => item.id !== studentId);
    delete nextState.progress[studentId];
    persist(nextState);
  }

  function saveLesson(event) {
    event.preventDefault();
    let hanjaSet;
    try {
      hanjaSet = JSON.parse(hanjaJson);
    } catch {
      alert("한자 묶음 JSON 형식을 확인해 주세요.");
      return;
    }
    const nextLesson = { ...lesson, day: Number(selectedDay), level: selectedLevel, dailyCount: Number(dailyCount), hanjaSet };
    const errors = validateLesson(nextLesson);
    if (errors.length) {
      alert(errors.slice(0, 8).join("\n"));
      return;
    }
    persist({ ...state, curriculum: upsertLesson(state.curriculum, nextLesson) });
  }

  function addLesson() {
    const sameLevelLessons = state.curriculum.filter((item) => String(item.level || "").trim() === plan.level);
    const nextDay = Math.max(0, ...sameLevelLessons.map((item) => Number(item.day) || 0)) + 1;
    const nextLesson = {
      day: nextDay,
      grade: plan.grade,
      level: plan.level,
      dailyCount: 4,
      hanjaSet: [
        {
          character: "新",
          sound: "신",
          meaning: "새롭다",
          radical: "斤",
          relation: "새 일차 편집용 기본 한자입니다.",
          origin: "나무를 베어 새롭게 다듬는 모습과 관련된 한자입니다.",
          vocab: [
            {
              hanja: "新入",
              word: "신입",
              meaning: "새로 들어옴",
              examples: ["신입 회원이 동아리에 들어왔다.", "신입 학생들이 강당에 모였다.", "신입 선수는 열심히 연습했다."]
            }
          ]
        }
      ]
    };
    persist({ ...state, curriculum: upsertLesson(state.curriculum, nextLesson) });
    setSelectedDay(nextDay);
    setSelectedLevel(plan.level);
  }

  function deleteLesson() {
    if (state.curriculum.length <= 1) {
      alert("최소 1개의 일차는 남아 있어야 합니다.");
      return;
    }
    if (!window.confirm(`${selectedLevel} ${selectedDay}일차 한자 구성을 삭제할까요?`)) return;
    const remaining = state.curriculum.filter((item) => !(Number(item.day) === Number(selectedDay) && String(item.level || "").trim() === selectedLevel));
    const sameLevelRemaining = remaining.filter((item) => String(item.level || "").trim() === selectedLevel);
    const fallbackDay = sameLevelRemaining[0]?.day || remaining[0]?.day || 1;
    const nextState = structuredClone(state);
    nextState.curriculum = remaining;
    nextState.students.forEach((student) => {
      if (Number(student.day) === Number(selectedDay)) student.day = fallbackDay;
    });
    Object.values(nextState.progress).forEach((record) => {
      delete record.completed?.[selectedDay];
      delete record.quiz?.[selectedDay];
    });
    persist(nextState);
    setSelectedDay(fallbackDay);
  }

  function makePrompt() {
    setAiPrompt(buildAiPrompt(plan));
  }

  function previewAi() {
    try {
      const lessons = parseAiLessons(aiResult);
      setAiPreview(lessons.map((item) => `${item.day}일차: ${item.hanjaSet.map((hanja) => `${hanja.character}(${hanja.sound})`).join(" · ")}`).join("\n"));
    } catch (error) {
      setAiPreview(error.message || "AI 결과 형식을 확인해 주세요.");
    }
  }

  function applyAi() {
    let lessons;
    try {
      lessons = parseAiLessons(aiResult);
    } catch (error) {
      alert(error.message || "AI 결과 형식을 확인해 주세요.");
      return;
    }
    const nextState = structuredClone(state);
    lessons.forEach((item) => {
      nextState.curriculum = upsertLesson(nextState.curriculum, item);
    });
    persist(nextState);
    setSelectedDay(lessons[0].day);
    setSelectedLevel(lessons[0].level || plan.level);
    setAiPreview(lessons.map((item) => `${item.day}일차 적용 완료`).join("\n"));
  }

  function applySeedCurriculum() {
    if (!window.confirm("초급/중급/고급 100일차 기본 한자 구성을 적용할까요? 기존 학생 계정과 학습 기록은 유지하고 커리큘럼만 교체합니다.")) return;
    const nextState = structuredClone(state);
    nextState.curriculum = buildSeedCurriculum();
    persist(nextState);
    setSelectedLevel("초급");
    setSelectedDay(1);
  }

  async function resetDemo() {
    try {
      const nextState = await resetAppState();
      setState(nextState);
      setSelectedDay(nextState.curriculum[0]?.day || 1);
    } catch (error) {
      setLoadError(error.message);
    }
  }

  function exportState() {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      app: "hanja-vocab-next",
      version: 1,
      data: state
    };
    downloadFile(
      `hanja-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(snapshot, null, 2),
      "application/json"
    );
  }

  function exportProgressCsv() {
    const headers = ["학생", "아이디", "비밀번호", "학년", "난이도", "현재 일차", "진도", "정답률", "정답 수", "응시 문항 수", "응시 횟수", "오답", "복습 이력"];
    const rows = state.students.map((student) => {
      const record = state.progress[student.id]?.quiz?.[student.day] || { correct: 0, total: 0, wrong: [], wrongHistory: [] };
      const completed = state.progress[student.id]?.completed?.[student.day] && !record.wrong?.length;
      const rate = record.total ? `${Math.round((record.correct / record.total) * 100)}%` : "";
      const attempts = record.attempts || (record.total ? 1 : 0);
      return [
        student.name,
        student.loginId,
        student.password,
        student.grade,
        student.level,
        `${student.day}일차`,
        completed ? "학습 완성" : "진행 중",
        rate,
        record.correct || 0,
        record.total || 0,
        attempts,
        (record.wrong || []).join(", "),
        (record.wrongHistory || []).join(", ")
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadFile(`hanja-progress-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  }

  function exportProgressHistoryCsv() {
    const headers = ["학생", "아이디", "학년", "난이도", "일차", "배정 여부", "진도", "정답률", "정답 수", "응시 문항 수", "응시 횟수", "오답", "복습 이력", "완료 시각"];
    const days = state.curriculum.map((lesson) => Number(lesson.day)).sort((a, b) => a - b);
    const rows = state.students.flatMap((student) =>
      days.map((day) => {
        const record = state.progress[student.id]?.quiz?.[day] || { correct: 0, total: 0, wrong: [], wrongHistory: [] };
        const completed = state.progress[student.id]?.completed?.[day] && !record.wrong?.length;
        const assigned = Number(student.day) === Number(day);
        const status = completed ? "학습 완성" : record.wrong?.length ? "복습 필요" : record.total ? "진행 중" : "시작 전";
        const rate = record.total ? `${Math.round((record.correct / record.total) * 100)}%` : "";
        const attempts = record.attempts || (record.total ? 1 : 0);
        return [
          student.name,
          student.loginId,
          student.grade,
          student.level,
          `${day}일차`,
          assigned ? "현재 배정" : "",
          status,
          rate,
          record.correct || 0,
          record.total || 0,
          attempts,
          (record.wrong || []).join(", "),
          (record.wrongHistory || []).join(", "),
          record.finishedAt || ""
        ];
      })
    );
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadFile(`hanja-progress-history-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  }

  function exportStudentCsv() {
    const headers = ["이름", "전화번호", "아이디", "비밀번호", "학년", "난이도", "일차"];
    const rows = state.students.map((student) => [
      student.name,
      student.phone || "",
      student.loginId,
      student.password,
      student.grade,
      student.level,
      student.day
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadFile(`hanja-students-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  }

  function downloadStudentTemplate() {
    const rows = [
      ["이름", "전화번호", "아이디", "비밀번호", "학년", "난이도", "일차"],
      ["김민준", "010-1234-5678", "", "", "초3", "초급", "1"],
      ["박하린", "010-2345-6789", "", "", "초4", "초급", "1"]
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadFile("hanja-student-template.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importState(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let imported;
    try {
      imported = JSON.parse(await file.text());
    } catch {
      alert("가져올 JSON 파일 형식을 확인해 주세요.");
      return;
    }
    const nextState = imported.data || imported;
    if (!Array.isArray(nextState.students) || !Array.isArray(nextState.curriculum) || !nextState.progress) {
      alert("학생, 커리큘럼, 진도 데이터가 포함된 백업 파일만 가져올 수 있습니다.");
      return;
    }
    const errors = validateAppStateShape(nextState);
    if (errors.length) {
      alert(errors.slice(0, 10).join("\n"));
      return;
    }
    if (!window.confirm("현재 데이터를 백업 파일 내용으로 교체할까요?")) return;
    await persist(nextState);
    setSelectedDay(nextState.curriculum[0]?.day || 1);
  }

  if (checkingAuth) return <main className="centerPage">확인하는 중...</main>;

  if (!authenticated) {
    return (
      <main className="centerPage">
        <form className="loginCard" onSubmit={loginAdmin}>
          <Mascot />
          <h1>관리자 로그인</h1>
          <p>발급받은 라이선스 키로 로그인하세요. 소유자만 비상용 관리자 비밀번호를 사용할 수 있습니다.</p>
          <label>라이선스 키<input value={adminLicenseKey} onChange={(event) => setAdminLicenseKey(event.target.value)} placeholder="HANJA-... 키 입력" /></label>
          <details className="ownerLogin">
            <summary>소유자 비밀번호로 로그인</summary>
            <label>내 관리자 비밀번호<input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="ADMIN_PASSWORD" /></label>
          </details>
          <button className="btn primary" type="submit">관리 화면 열기</button>
          {adminError && <strong className="errorText">{adminError}</strong>}
          <Link className="textLink" href="/student">학생 화면으로</Link>
        </form>
      </main>
    );
  }

  if (loadError) return <main className="centerPage"><strong className="errorText">{loadError}</strong></main>;
  if (!state) return <main className="centerPage">불러오는 중...</main>;

  return (
    <main className="adminFrame">
      <header className="topBar">
        <div><strong>학습 관리</strong><span>학생 계정 · 한자 구성 · 학습도{adminInfo?.role === "license" ? ` · 강사 코드 ${adminInfo.teacherCode}` : ""}</span></div>
        <div className="topActions">
          <Link className="btn ghost" href="/student">학생 화면</Link>
          <button className="btn" type="button" onClick={exportState}>백업</button>
          <button className="btn" type="button" onClick={exportProgressCsv}>학습도 CSV</button>
          <button className="btn" type="button" onClick={exportProgressHistoryCsv}>전체 이력 CSV</button>
          <label className="btn fileBtn">가져오기<input type="file" accept="application/json,.json" onChange={importState} /></label>
          <button className="btn" onClick={resetDemo}>초기화</button>
          <button className="btn" onClick={logoutAdmin}>로그아웃</button>
        </div>
      </header>

      <section className="adminGrid">
        <form className="panel form" onSubmit={addStudent}>
          <h2>학생 계정</h2>
          <label>이름<input value={studentForm.name} onChange={(event) => updateStudentForm({ name: event.target.value })} placeholder="예: 이서연" /></label>
          <label>전화번호<input value={studentForm.phone} onChange={(event) => updateStudentForm({ phone: event.target.value })} placeholder="예: 010-1234-5678" /></label>
          <label>아이디<input value={studentForm.loginId} onChange={(event) => updateStudentForm({ loginId: event.target.value })} placeholder="이름으로 자동 입력" /></label>
          <label>비밀번호<input value={studentForm.password} onChange={(event) => updateStudentForm({ password: event.target.value })} placeholder="010을 제외한 전화번호로 자동 입력" /></label>
          <Select label="학년" value={studentForm.grade} onChange={(grade) => updateStudentForm({ grade })} options={gradeOptions} />
          <Select label="난이도" value={studentForm.level} onChange={(level) => setStudentForm({ ...studentForm, level })} options={["초급", "중급", "고급"]} />
          <button className="btn primary" type="submit">계정 생성</button>
          <div className="buttonRow compact">
            <button className="miniBtn" type="button" onClick={downloadStudentTemplate}>CSV 양식</button>
            <label className="miniBtn fileBtn">CSV 가져오기<input type="file" accept=".csv,text/csv" onChange={importStudentsCsv} /></label>
            <button className="miniBtn" type="button" onClick={exportStudentCsv}>계정 CSV</button>
          </div>
        </form>

        <section className="panel">
          <div className="studentPanelHead">
            <h2>학생 목록</h2>
            <span>{filteredStudents.length}명 표시</span>
          </div>
          <label className="searchBox">학생 검색
            <input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="이름, 아이디, 학년, 난이도" />
          </label>
          <div className="bulkAssign">
            <label>검색 결과 일괄 배정
              <select value={bulkDay} onChange={(event) => setBulkDay(Number(event.target.value))}>
                {dayOptions.map((day) => <option key={day} value={day}>{day}일차</option>)}
              </select>
            </label>
            <button className="miniBtn" type="button" onClick={assignFilteredStudentsDay} disabled={!filteredStudents.length}>배정</button>
          </div>
          <div className="studentList">
            {filteredStudents.map((student) => (
              <div className="studentRow" key={student.id}>
                <div>
                  <strong>{student.name}</strong>
                  <span>{student.loginId} / {student.password} · {student.phone ? `${student.phone} · ` : ""}{student.grade} · {student.level}</span>
                </div>
                <label className="dayPicker">현재 일차
                  <select value={student.day} onChange={(event) => updateStudentDay(student.id, event.target.value)}>
                    {dayOptions.map((day) => <option key={day} value={day}>{day}일차</option>)}
                  </select>
                </label>
                <div className="studentActions">
                  <button className="miniBtn" type="button" onClick={() => resetStudentProgress(student.id)}>진도 초기화</button>
                  <button className="miniBtn danger" type="button" onClick={() => deleteStudent(student.id)}>삭제</button>
                </div>
              </div>
            ))}
            {!filteredStudents.length && <p className="emptyText">검색 결과가 없습니다.</p>}
          </div>
        </section>

        <section className="panel wide">
          <h2>학생별 학습도</h2>
          <div className="summaryStrip">
            <span><b>{state.students.length}</b>전체</span>
            <span className="complete"><b>{progressSummary.completed}</b>완성</span>
            <span className="retry"><b>{progressSummary.retry}</b>복습 필요</span>
            <span className="active"><b>{progressSummary.active}</b>진행 중</span>
            <span><b>{progressSummary.idle}</b>시작 전</span>
          </div>
          <div className="statusFilters">
            {[
              ["all", "전체", state.students.length],
              ["completed", "완성", progressSummary.completed],
              ["retry", "복습 필요", progressSummary.retry],
              ["active", "진행 중", progressSummary.active],
              ["idle", "시작 전", progressSummary.idle]
            ].map(([key, label, count]) => (
              <button className={progressFilter === key ? "active" : ""} type="button" key={key} onClick={() => setProgressFilter(key)}>
                {label}<b>{count}</b>
              </button>
            ))}
          </div>
          {(studentSearch.trim() || progressFilter !== "all") && <p className="filterNote">현재 조건에 맞는 학생 {filteredStudents.length}명만 표시 중입니다.</p>}
          <table>
            <thead><tr><th>학생</th><th>배정</th><th>상태</th><th>퀴즈 기록</th><th>오답/복습</th></tr></thead>
            <tbody>{filteredStudents.map((student) => <ProgressRow key={student.id} state={state} student={student} />)}</tbody>
          </table>
        </section>

        <section className="panel form">
          <div className="panelTitle"><h2>AI 생성 준비</h2><Mascot small /></div>
          <Select label="학년" value={plan.grade} onChange={(grade) => setPlan({ ...plan, grade })} options={gradeOptions} />
          <Select label="난이도" value={plan.level} onChange={(level) => setPlan({ ...plan, level })} options={["초급", "중급", "고급"]} />
          <label>시작 일차<input type="number" min="1" value={plan.startDay} onChange={(event) => setPlan({ ...plan, startDay: Number(event.target.value) })} /></label>
          <label>생성 일수<input type="number" min="1" max="30" value={plan.days} onChange={(event) => setPlan({ ...plan, days: Number(event.target.value) })} /></label>
          <button className="btn blue" type="button" onClick={makePrompt}>AI 프롬프트 만들기</button>
          <label>AI 요청 프롬프트<textarea readOnly value={aiPrompt} /></label>
          <label>AI 생성 JSON 붙여넣기<textarea value={aiResult} onChange={(event) => setAiResult(event.target.value)} placeholder="AI가 만든 curriculum JSON을 붙여넣으세요." /></label>
          <div className="buttonRow">
            <button className="btn" type="button" onClick={previewAi}>미리보기</button>
            <button className="btn primary" type="button" onClick={applyAi}>적용</button>
          </div>
          {aiPreview && <pre className="previewBox">{aiPreview}</pre>}
        </section>

        <form className="panel form contentForm" onSubmit={saveLesson}>
          <div className="contentTitle">
            <h2>일차별 한자 관리</h2>
            <div className="contentActions">
              <button className="miniBtn" type="button" onClick={applySeedCurriculum}>기본 100일차 적용</button>
              <button className="miniBtn" type="button" onClick={addLesson}>새 일차</button>
              <button className="miniBtn danger" type="button" onClick={deleteLesson}>일차 삭제</button>
            </div>
          </div>
          <Select label="난이도" value={selectedLevel} onChange={setSelectedLevel} options={["초급", "중급", "고급"]} />
          <label>일차<select value={selectedDay} onChange={(event) => setSelectedDay(Number(event.target.value))}>{dayOptions.map((day) => <option key={`${selectedLevel}-${day}`} value={day}>{day}일차</option>)}</select></label>
          <label>일일 한자 수<input type="number" min="1" max="8" value={dailyCount} onChange={(event) => setDailyCount(event.target.value)} /></label>
          <label>한자 묶음 JSON<textarea value={hanjaJson} onChange={(event) => setHanjaJson(event.target.value)} /></label>
          <ContentPreview preview={contentPreview} dailyCount={dailyCount} />
          <button className="btn primary" type="submit">저장</button>
        </form>
      </section>
    </main>
  );
}

function ProgressRow({ state, student }) {
  const lesson = findLesson(state.curriculum, student.day, student.level);
  const record = state.progress[student.id]?.quiz?.[student.day] || { correct: 0, total: 0, wrong: [], wrongHistory: [] };
  const status = getProgressStatus(state, student);
  const totalWords = lessonVocab(lesson).length;
  const rate = record.total ? Math.round((record.correct / record.total) * 100) : 0;
  const progress = status.key === "completed" ? 100 : record.total ? Math.min(92, Math.round((record.correct / Math.max(1, totalWords)) * 100)) : 0;
  const finishedAt = record.finishedAt ? new Date(record.finishedAt).toLocaleDateString("ko-KR") : "";
  const attempts = record.attempts || (record.total ? 1 : 0);
  const quizMeta = record.total ? [`${record.correct}/${record.total}문항`, `${attempts}회 응시`, finishedAt].filter(Boolean).join(" · ") : `예정 어휘 ${totalWords}개`;
  const wrongText = record.wrong?.length ? record.wrong.join(", ") : record.wrongHistory?.length ? `복습 완료: ${record.wrongHistory.join(", ")}` : "-";

  return (
    <tr>
      <td><strong>{student.name}</strong><br /><span>{student.loginId} / {student.password}</span></td>
      <td><b>{student.day}일차</b><br /><span>{student.grade} · {student.level}</span></td>
      <td>
        <span className={`statusPill ${status.key}`}>{status.label}</span>
        <div className="miniProgress"><i style={{ width: `${progress}%` }} /></div>
      </td>
      <td><b>{record.total ? `${rate}%` : "-"}</b><br /><span>{quizMeta}</span></td>
      <td>{wrongText}</td>
    </tr>
  );
}

function getProgressStatus(state, student) {
  const record = state.progress[student.id]?.quiz?.[student.day];
  const completed = state.progress[student.id]?.completed?.[student.day] && !record?.wrong?.length;
  if (completed) return { key: "completed", label: "학습 완성" };
  if (record?.wrong?.length) return { key: "retry", label: "복습 필요" };
  if (record?.total) return { key: "active", label: "진행 중" };
  return { key: "idle", label: "시작 전" };
}

function ContentPreview({ preview, dailyCount }) {
  const visibleHanja = preview.hanjaSet.slice(0, Number(dailyCount) || preview.hanjaSet.length);
  return (
    <section className={`contentPreview ${preview.errors.length ? "hasError" : ""}`}>
      <div className="previewSummary">
        <span><b>{visibleHanja.length}</b>학습 한자</span>
        <span><b>{preview.vocabCount}</b>전체 어휘</span>
        <span><b>{preview.errors.length ? "확인 필요" : "저장 가능"}</b>상태</span>
      </div>
      {preview.errors.length ? (
        <ul className="previewErrors">
          {preview.errors.slice(0, 5).map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : (
        <div className="hanjaPreviewList">
          {visibleHanja.map((hanja, index) => (
            <article key={`${hanja.character}-${index}`}>
              <strong>{hanja.character}</strong>
              <span>음 {hanja.sound} · 뜻 {hanja.meaning}</span>
              <small>{hanja.vocab?.length || 0}개 어휘</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(header) {
  const value = String(header || "").replace(/^\uFEFF/, "").trim().toLowerCase();
  const map = {
    "이름": "name",
    name: "name",
    "학생": "name",
    "아이디": "loginId",
    id: "loginId",
    loginid: "loginId",
    "전화번호": "phone",
    "휴대폰": "phone",
    phone: "phone",
    tel: "phone",
    "비밀번호": "password",
    password: "password",
    "학년": "grade",
    grade: "grade",
    "난이도": "level",
    level: "level",
    "일차": "day",
    day: "day",
    "현재 일차": "day"
  };
  return map[value] || value;
}

function Select({ label, value, onChange, options }) {
  return (
    <label>{label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
