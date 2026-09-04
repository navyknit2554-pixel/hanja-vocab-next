"use client";

import { useEffect, useState } from "react";
import { Mascot } from "./Mascot";

const emptyStudent = { name: "", loginId: "", password: "", phone: "", grade: "초1", level: "초급", currentDay: 1 };

export function AdminApp() {
  const [admin, setAdmin] = useState(null);
  const [loginForm, setLoginForm] = useState({ password: "", licenseKey: "" });
  const [loginStatus, setLoginStatus] = useState("");
  const [view, setView] = useState("students");
  const [students, setStudents] = useState([]);
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [studentStatus, setStudentStatus] = useState("");
  const [editingStudentId, setEditingStudentId] = useState("");
  const [progressLevel, setProgressLevel] = useState("초급");
  const [progressData, setProgressData] = useState(null);
  const [progressStatus, setProgressStatus] = useState("");
  const [level, setLevel] = useState("초급");
  const [day, setDay] = useState(1);
  const [status, setStatus] = useState("v2는 현재 새 구조를 세우는 단계입니다.");
  const [loading, setLoading] = useState(false);
  const [lessonData, setLessonData] = useState(null);
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reset") === "1") {
      logout().finally(() => {
        window.history.replaceState({}, "", window.location.pathname);
      });
      return;
    }
    loadAdminSession();
  }, []);

  useEffect(() => {
    if (admin) loadStudents();
  }, [admin]);

  useEffect(() => {
    if (admin && view === "progress") loadProgress();
  }, [admin, view, progressLevel]);

  useEffect(() => {
    if (admin?.role === "master" && view === "content") loadLesson();
  }, [admin, view, level, day]);

  async function loadAdminSession() {
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store" });
      const data = await response.json();
      if (data.authenticated) setAdmin(data.admin);
    } catch {
      setLoginStatus("");
    }
  }

  async function submitAdminLogin(event) {
    event.preventDefault();
    setLoginStatus("확인하는 중...");
    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm)
      });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (!response.ok) {
        setLoginStatus(data.message || "관리자 로그인을 확인해 주세요.");
        return;
      }
      setAdmin(data.admin);
      setView("students");
      setLoginStatus("");
    } catch (error) {
      setLoginStatus(error.message || "관리자 로그인 중 문제가 생겼습니다.");
    }
  }

  async function loadStudents() {
    setStudentStatus("학생 목록을 불러오는 중...");
    try {
      const response = await fetch("/api/admin/students", { cache: "no-store" });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (handleExpiredAdmin(response, data)) return;
      if (!response.ok) throw new Error(data.message || "학생 목록을 불러오지 못했습니다.");
      setStudents(data.students || []);
      setStudentStatus(`학생 ${data.students?.length || 0}명`);
    } catch (error) {
      setStudents([]);
      setStudentStatus(error.message || "학생 목록을 불러오지 못했습니다.");
    }
  }

  async function loadProgress() {
    setProgressStatus("학습도를 불러오는 중...");
    try {
      const response = await fetch(`/api/admin/progress?level=${encodeURIComponent(progressLevel)}`, { cache: "no-store" });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (handleExpiredAdmin(response, data)) return;
      if (!response.ok) throw new Error(data.message || "학습도를 불러오지 못했습니다.");
      setProgressData(data);
      setProgressStatus(`${data.level} 학생 ${data.students?.length || 0}명 · 일차 ${data.days?.length || 0}개`);
    } catch (error) {
      setProgressData(null);
      setProgressStatus(error.message || "학습도를 불러오지 못했습니다.");
    }
  }

  async function saveStudent(event) {
    event.preventDefault();
    setStudentStatus("학생 정보를 저장하는 중...");
    try {
      const response = await fetch("/api/admin/students", {
        method: editingStudentId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...studentForm, id: editingStudentId })
      });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (handleExpiredAdmin(response, data)) return;
      if (!response.ok) throw new Error(data.message || "학생 정보를 저장하지 못했습니다.");
      setStudentForm(emptyStudent);
      setEditingStudentId("");
      await loadStudents();
      if (view === "progress") await loadProgress();
    } catch (error) {
      setStudentStatus(error.message || "학생 정보를 저장하지 못했습니다.");
    }
  }

  async function deleteStudent(student) {
    setStudentStatus(`${student.name} 삭제 중...`);
    try {
      const response = await fetch(`/api/admin/students?id=${encodeURIComponent(student.id)}`, { method: "DELETE" });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (handleExpiredAdmin(response, data)) return;
      if (!response.ok) throw new Error(data.message || "학생을 삭제하지 못했습니다.");
      if (editingStudentId === student.id) {
        setEditingStudentId("");
        setStudentForm(emptyStudent);
      }
      await loadStudents();
      if (view === "progress") await loadProgress();
    } catch (error) {
      setStudentStatus(error.message || "학생을 삭제하지 못했습니다.");
    }
  }

  function editStudent(student) {
    setEditingStudentId(student.id);
    setStudentForm({
      name: student.name || "",
      loginId: student.login_id || "",
      password: student.password || "",
      phone: student.phone || "",
      grade: student.grade || "초1",
      level: student.level || "초급",
      currentDay: Number(student.current_day || 1)
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadLesson() {
    try {
      const response = await fetch(`/api/admin/lesson?level=${encodeURIComponent(level)}&day=${day}`, { cache: "no-store" });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (handleExpiredAdmin(response, data)) return;
      if (!response.ok) {
        setLessonData(null);
        setStatus(data.message || "일차 데이터를 불러오지 못했습니다.");
        return;
      }
      setLessonData(data);
      setStatus(`${data.lesson.level} ${data.lesson.day}일차: 한자 ${data.hanja.length}개, 어휘 ${countVocab(data.hanja)}개`);
    } catch (error) {
      setLessonData(null);
      setStatus(error.message || "일차 데이터를 불러오지 못했습니다.");
    }
  }

  async function importDictionary() {
    setLoading(true);
    setStatus(`${level} ${day}일차 국어원 자료를 가져오는 중...`);
    try {
      const response = await fetch("/api/admin/dictionary-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, day })
      });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (handleExpiredAdmin(response, data)) return;
      if (!response.ok) throw new Error(data.message || "국어원 자료를 가져오지 못했습니다.");
      setStatus(`${data.summary.level} ${data.summary.day}일차: 한자 ${data.summary.hanjaCount}개, 어휘 ${data.summary.vocabCount}개 반영. 부족: ${data.summary.missing.join(", ") || "없음"}`);
      await loadLesson();
    } catch (error) {
      setStatus(error.message || "처리 중 문제가 생겼습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function saveVocab(vocab) {
    setSavingId(vocab.id);
    try {
      const response = await fetch("/api/admin/vocab", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: vocab.id,
          hanjaWord: vocab.hanja_word,
          word: vocab.word,
          meaning: vocab.meaning,
          examples: vocab.examples.map((example) => example.text)
        })
      });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (handleExpiredAdmin(response, data)) return;
      if (!response.ok) throw new Error(data.message || "어휘를 저장하지 못했습니다.");
      setStatus(`${vocab.word} 저장 완료`);
      await loadLesson();
    } catch (error) {
      setStatus(error.message || "어휘를 저장하지 못했습니다.");
    } finally {
      setSavingId("");
    }
  }

  async function deleteVocab(vocab) {
    setSavingId(vocab.id);
    try {
      const response = await fetch(`/api/admin/vocab?id=${encodeURIComponent(vocab.id)}`, { method: "DELETE" });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (handleExpiredAdmin(response, data)) return;
      if (!response.ok) throw new Error(data.message || "어휘를 삭제하지 못했습니다.");
      setStatus(`${vocab.word} 삭제 완료`);
      await loadLesson();
    } catch (error) {
      setStatus(error.message || "어휘를 삭제하지 못했습니다.");
    } finally {
      setSavingId("");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAdmin(null);
    setView("students");
    setLoginStatus("");
    setStudents([]);
    setStudentStatus("");
    setProgressData(null);
    setProgressStatus("");
    setLessonData(null);
    setStatus("v2는 현재 새 구조를 세우는 단계입니다.");
  }

  function handleExpiredAdmin(response, data) {
    if (response.status !== 401 && response.status !== 403) return false;
    setAdmin(null);
    setStudents([]);
    setProgressData(null);
    setLessonData(null);
    setStudentStatus("");
    setProgressStatus("");
    setStatus("v2는 현재 새 구조를 세우는 단계입니다.");
    setLoginStatus(data.message || "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.");
    return true;
  }

  function updateVocab(hanjaId, vocabId, patch) {
    setLessonData((current) => ({
      ...current,
      hanja: current.hanja.map((hanja) => {
        if (hanja.id !== hanjaId) return hanja;
        return {
          ...hanja,
          vocab: hanja.vocab.map((vocab) => vocab.id === vocabId ? { ...vocab, ...patch } : vocab)
        };
      })
    }));
  }

  if (!admin) {
    return (
      <main className="page center">
        <form className="panel loginCard" onSubmit={submitAdminLogin}>
          <Mascot variant="search" />
          <h1>관리자 로그인</h1>
          <label>마스터 비밀번호<input type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} placeholder="마스터만 입력" /></label>
          <label>라이선스 키<textarea value={loginForm.licenseKey} onChange={(event) => setLoginForm({ ...loginForm, licenseKey: event.target.value })} placeholder="원장님·강사님은 HANJA-... 키 입력" /></label>
          <button className="btn primary">로그인</button>
          <button className="btn textBtn" type="button" onClick={logout}>세션 초기화</button>
          {loginStatus ? <p className="errorText">{loginStatus}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>초록이한자학습 v2</h1>
          <p>학생·커리큘럼·어휘·진도를 테이블로 분리한 새 버전 · {admin.teacherCode}</p>
        </div>
        <div className="topbarActions">
          <Mascot variant="curious" small label="관리 중" />
          <button className="btn textBtn" type="button" onClick={logout}>로그아웃</button>
        </div>
      </header>
      <nav className="adminTabs">
        <button className={view === "students" ? "active" : ""} onClick={() => setView("students")} type="button">학생 관리</button>
        <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")} type="button">학습도</button>
        {admin.role === "master" ? <button className={view === "content" ? "active" : ""} onClick={() => setView("content")} type="button">한자·어휘 관리</button> : null}
      </nav>
      {view === "students" ? (
        <section className="adminGrid">
          <StudentForm studentForm={studentForm} setStudentForm={setStudentForm} editingStudentId={editingStudentId} onSave={saveStudent} onCancel={() => {
            setEditingStudentId("");
            setStudentForm(emptyStudent);
          }} />
          <StudentList students={students} status={studentStatus} onRefresh={loadStudents} onEdit={editStudent} onDelete={deleteStudent} />
        </section>
      ) : null}
      {view === "progress" ? (
        <ProgressPanel
          level={progressLevel}
          setLevel={setProgressLevel}
          status={progressStatus}
          data={progressData}
          onRefresh={loadProgress}
        />
      ) : null}
      {view === "content" && admin.role === "master" ? (
        <>
          <section className="adminGrid">
            <article className="panel">
              <Mascot variant="book" small label="기준" />
              <h2>마스터 관리 기준</h2>
              <ul className="plainList">
                <li>한자·어휘는 공통 데이터로 관리</li>
                <li>강사 계정은 자기 학생만 관리</li>
                <li>국어원 API는 현재 일차 단위로만 실행</li>
                <li>용례 없는 어휘는 자동 저장하지 않음</li>
              </ul>
            </article>
            <article className="panel">
              <Mascot variant="discover" small label="자료 찾기" />
              <h2>일차별 한자 관리</h2>
              <div className="formGrid">
                <label>난이도<select value={level} onChange={(event) => setLevel(event.target.value)}><option>초급</option><option>중급</option><option>고급</option></select></label>
                <label>일차<input type="number" min="1" max="100" value={day} onChange={(event) => setDay(Number(event.target.value))} /></label>
              </div>
              <LessonHanjaOverview lessonData={lessonData} level={level} day={day} />
              <button className="btn primary" type="button" onClick={importDictionary} disabled={loading}>
                {loading ? "가져오는 중..." : "현재 일차 국어원 어휘·뜻·용례 가져오기"}
              </button>
              <p className="statusText">{status}</p>
            </article>
          </section>
          <section className="panel reviewPanel">
        <div className="sectionHeader">
          <div>
            <h2>어휘 검수</h2>
            <p>국어원에서 가져온 항목을 학생에게 보이기 전에 직접 다듬습니다.</p>
          </div>
          <button className="btn secondary" type="button" onClick={loadLesson}>새로고침</button>
        </div>
        {lessonData?.hanja?.length ? (
          <div className="reviewGrid">
            {lessonData.hanja.map((hanja) => (
              <article className="reviewHanja" key={hanja.id}>
                <header>
                  <strong>{hanja.character}</strong>
                  <span>음 {hanja.sound} · 뜻 {hanja.meaning}</span>
                </header>
                <div className="vocabEditorList">
                  {hanja.vocab.map((vocab) => (
                    <div className="vocabEditor" key={vocab.id}>
                      <div className="vocabFields">
                        <label>한자어<input value={vocab.hanja_word} onChange={(event) => updateVocab(hanja.id, vocab.id, { hanja_word: event.target.value })} /></label>
                        <label>어휘<input value={vocab.word} onChange={(event) => updateVocab(hanja.id, vocab.id, { word: event.target.value })} /></label>
                      </div>
                      <label>뜻<input value={vocab.meaning} onChange={(event) => updateVocab(hanja.id, vocab.id, { meaning: event.target.value })} /></label>
                      <label>
                        용례
                        <textarea
                          value={[0, 1, 2].map((index) => vocab.examples[index]?.text || "").join("\n")}
                          onChange={(event) => updateVocab(hanja.id, vocab.id, {
                            examples: event.target.value.split("\n").slice(0, 3).map((line, index) => ({
                              id: `${vocab.id}-${index}`,
                              position: index + 1,
                              text: line
                            }))
                          })}
                        />
                      </label>
                      <div className="editorActions">
                        <button className="btn secondary" type="button" onClick={() => deleteVocab(vocab)} disabled={savingId === vocab.id}>삭제</button>
                        <button className="btn primary" type="button" onClick={() => saveVocab(vocab)} disabled={savingId === vocab.id}>
                          {savingId === vocab.id ? "저장 중..." : "저장"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="statusText">검수할 어휘가 아직 없습니다.</p>
        )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function LessonHanjaOverview({ lessonData, level, day }) {
  const hanja = lessonData?.hanja || [];

  return (
    <div className="lessonOverview">
      <div className="lessonOverviewHeader">
        <strong>{level} {day}일차 한자 구성</strong>
        <span>{hanja.length ? `${hanja.length}개 한자 · ${countVocab(hanja)}개 어휘` : "불러온 구성이 없습니다"}</span>
      </div>
      {hanja.length ? (
        <div className="lessonHanjaList">
          {hanja.map((item) => (
            <div className="lessonHanjaChip" key={item.id}>
              <b>{item.character}</b>
              <span>음 {item.sound} · 뜻 {item.meaning}</span>
              <small>어휘 {item.vocab.length}개</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="mutedText">이 일차의 한자 구성을 확인하려면 난이도와 일차를 선택해 주세요.</p>
      )}
    </div>
  );
}

function StudentForm({ studentForm, setStudentForm, editingStudentId, onSave, onCancel }) {
  function updatePhone(phone) {
    const password = passwordFromPhone(phone);
    setStudentForm({ ...studentForm, phone, password });
  }

  return (
    <form className="panel studentManager" onSubmit={onSave}>
      <div className="sectionHeader">
        <div>
          <h2>{editingStudentId ? "학생 수정" : "학생 추가"}</h2>
          <p>로그인 정보와 현재 학습 일차를 관리합니다.</p>
        </div>
      </div>
      <div className="studentFormGrid">
        <label>이름<input value={studentForm.name} onChange={(event) => setStudentForm({ ...studentForm, name: event.target.value })} /></label>
        <label>아이디<input value={studentForm.loginId} onChange={(event) => setStudentForm({ ...studentForm, loginId: event.target.value })} /></label>
        <label>비밀번호<input value={studentForm.password} onChange={(event) => setStudentForm({ ...studentForm, password: event.target.value })} placeholder="전화번호 입력 시 자동 생성" /></label>
        <label>전화번호<input value={studentForm.phone} onChange={(event) => updatePhone(event.target.value)} placeholder="01012345678 → 12345678" /></label>
        <label>학년<input value={studentForm.grade} onChange={(event) => setStudentForm({ ...studentForm, grade: event.target.value })} /></label>
        <label>난이도<select value={studentForm.level} onChange={(event) => setStudentForm({ ...studentForm, level: event.target.value })}><option>초급</option><option>중급</option><option>고급</option></select></label>
        <label>현재 일차<input type="number" min="1" max="100" value={studentForm.currentDay} onChange={(event) => setStudentForm({ ...studentForm, currentDay: Number(event.target.value) })} /></label>
      </div>
      <div className="editorActions">
        {editingStudentId ? <button className="btn secondary" type="button" onClick={onCancel}>취소</button> : null}
        <button className="btn primary">{editingStudentId ? "수정 저장" : "학생 추가"}</button>
      </div>
    </form>
  );
}

function StudentList({ students, status, onRefresh, onEdit, onDelete }) {
  return (
    <section className="panel">
      <div className="sectionHeader">
        <div>
          <h2>학생 목록</h2>
          <p>{status}</p>
        </div>
        <button className="btn secondary" type="button" onClick={onRefresh}>새로고침</button>
      </div>
      <div className="studentList">
        {students.map((student) => (
          <article className="studentRow" key={student.id}>
            <div>
              <strong>{student.name}</strong>
              <span>{student.login_id} / {student.password} · {student.grade} · {student.level} · {student.current_day}일차</span>
              <small>완료 {student.completed_count} · 복습 {student.review_count} · {student.teacher_code}</small>
            </div>
            <div className="studentRowActions">
              <button className="btn secondary" type="button" onClick={() => onEdit(student)}>수정</button>
              <button className="btn secondary" type="button" onClick={() => onDelete(student)}>삭제</button>
            </div>
          </article>
        ))}
        {!students.length ? <p className="statusText">등록된 학생이 없습니다.</p> : null}
      </div>
    </section>
  );
}

function ProgressPanel({ level, setLevel, status, data, onRefresh }) {
  const progressMap = buildProgressMap(data?.progress || []);
  return (
    <section className="panel progressPanel">
      <div className="sectionHeader">
        <div>
          <h2>일차별 학습도</h2>
          <p>{status}</p>
        </div>
        <div className="progressTools">
          <select value={level} onChange={(event) => setLevel(event.target.value)}>
            <option>초급</option>
            <option>중급</option>
            <option>고급</option>
          </select>
          <button className="btn secondary" type="button" onClick={onRefresh}>새로고침</button>
        </div>
      </div>
      <div className="legend">
        <span><i className="done" />완료</span>
        <span><i className="review" />복습</span>
        <span><i className="active" />진행</span>
        <span><i className="current" />현재</span>
      </div>
      <div className="progressTableWrap">
        <table className="progressTable">
          <thead>
            <tr>
              <th>학생</th>
              {(data?.days || []).map((day) => <th key={day.id}>{day.day}</th>)}
            </tr>
          </thead>
          <tbody>
            {(data?.students || []).map((student) => (
              <tr key={student.id}>
                <th>
                  <strong>{student.name}</strong>
                  <span>{student.grade} · {student.current_day}일차</span>
                </th>
                {(data?.days || []).map((day) => {
                  const record = progressMap.get(`${student.id}:${day.day}`);
                  const state = progressCellState(student, day.day, record);
                  return (
                    <td key={day.id}>
                      <span className={`progressDot ${state.key}`} title={state.title}>{state.label}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!(data?.students || []).length ? <p className="statusText">표시할 학생이 없습니다.</p> : null}
      </div>
    </section>
  );
}

function parseJsonResponse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: "서버 응답을 읽지 못했습니다. 터미널 오류 메시지를 확인해 주세요." };
  }
}

function countVocab(hanjaItems) {
  return hanjaItems.reduce((total, item) => total + item.vocab.length, 0);
}

function passwordFromPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.startsWith("010") ? digits.slice(3) : digits;
}

function buildProgressMap(progress) {
  return progress.reduce((map, item) => {
    map.set(`${item.student_id}:${item.day}`, item);
    return map;
  }, new Map());
}

function progressCellState(student, day, record) {
  if (record?.status === "completed") {
    return { key: "done", label: "완", title: `${day}일차 완료` };
  }
  if (record?.status === "needs_review") {
    return { key: "review", label: "복", title: `${day}일차 복습 필요` };
  }
  if (record?.status === "in_progress") {
    return { key: "active", label: "진", title: `${day}일차 진행 중` };
  }
  if (Number(student.current_day) === Number(day)) {
    return { key: "current", label: "현", title: `${day}일차 현재 배정` };
  }
  return { key: "empty", label: "", title: `${day}일차 기록 없음` };
}
