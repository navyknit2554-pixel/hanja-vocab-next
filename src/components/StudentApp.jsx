"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { findLesson, hanjaItems, learningCards, lessonVocab, quizItems } from "../lib/curriculum";
import { Mascot } from "./Mascot";

export function StudentApp() {
  const [student, setStudent] = useState(null);
  const [curriculum, setCurriculum] = useState([]);
  const [progressRecord, setProgressRecord] = useState({ completed: {}, quiz: {} });
  const [loadError, setLoadError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [login, setLogin] = useState({ teacherCode: "", loginId: "", password: "" });
  const [stage, setStage] = useState("learn");
  const [cardIndex, setCardIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [queue, setQueue] = useState([]);
  const [retry, setRetry] = useState([]);
  const [stats, setStats] = useState({ correct: 0, total: 0, wrong: [], wrongHistory: [] });
  const latestStatsRef = useRef(stats);
  const [feedback, setFeedback] = useState(null);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    fetch("/api/student/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (result.authenticated) {
          setStudent(result.student);
          setCurriculum(result.curriculum || []);
          setProgressRecord(result.progress || { completed: {}, quiz: {} });
        } else if (result.configError) {
          setLoginError(result.configError);
        }
      })
      .catch((error) => setLoadError(error.message))
      .finally(() => setCheckingSession(false));
  }, []);

  const lesson = useMemo(() => findLesson(curriculum, student?.day, student?.level), [curriculum, student]);
  const cards = useMemo(() => learningCards(lesson), [lesson]);
  const hanja = useMemo(() => hanjaItems(lesson), [lesson]);
  const vocab = useMemo(() => lessonVocab(lesson), [lesson]);
  const currentQuiz = queue[quizIndex];

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    const response = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(login)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setLoginError(result.message || "아이디 또는 비밀번호를 확인해 주세요.");
      return;
    }
    const result = await response.json();
    setStudent(result.student);
    setCurriculum(result.curriculum || []);
    setProgressRecord(result.progress || { completed: {}, quiz: {} });
    setStage("learn");
    setCardIndex(0);
    setQuizIndex(0);
    setQueue([]);
    setRetry([]);
    resetStats();
    setLogin({ teacherCode: "", loginId: "", password: "" });
  }

  async function logoutStudent() {
    await fetch("/api/student/session", { method: "DELETE" });
    setStudent(null);
    setCurriculum([]);
    setProgressRecord({ completed: {}, quiz: {} });
    resetStats();
    setStage("learn");
  }

  function startQuiz() {
    setQueue(quizItems(lesson));
    setRetry([]);
    setQuizIndex(0);
    resetStats();
    setStage("quiz");
  }

  function resetStats() {
    const initialStats = { correct: 0, total: 0, wrong: [], wrongHistory: [] };
    latestStatsRef.current = initialStats;
    setStats(initialStats);
  }

  function choose(choice) {
    if (!currentQuiz || feedback) return;
    const correct = choice === currentQuiz.answer;
    const wrongKey = currentQuiz.item?.word || currentQuiz.answer;
    setStats((prev) => {
      const wrong = correct ? prev.wrong.filter((word) => word !== wrongKey) : [...new Set([...prev.wrong, wrongKey])];
      const wrongHistory = correct ? prev.wrongHistory : [...new Set([...prev.wrongHistory, wrongKey])];
      const nextStats = { correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1, wrong, wrongHistory };
      latestStatsRef.current = nextStats;
      return nextStats;
    });
    if (!correct) setRetry((prev) => [...prev, currentQuiz]);
    setFeedback(correct ? "correct" : "wrong");
    window.setTimeout(() => {
      setFeedback(null);
      setQuizIndex((prev) => prev + 1);
    }, 900);
  }

  useEffect(() => {
    if (stage !== "quiz" || !queue.length || feedback) return;
    if (quizIndex < queue.length) return;
    if (retry.length) {
      setQueue(retry);
      setRetry([]);
      setQuizIndex(0);
      return;
    }
    saveProgress(latestStatsRef.current);
    setStage("review");
  }, [quizIndex, queue, retry, stage, feedback]);

  async function saveProgress(finalStats) {
    try {
      const response = await fetch("/api/student/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonDay: lesson.day, stats: finalStats })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "학습 결과를 저장하지 못했습니다.");
      }
      const result = await response.json();
      if (result.progress) setProgressRecord(result.progress);
    } catch (error) {
      setLoadError(error.message);
    }
  }

  if (loadError) return <main className="centerPage"><strong className="errorText">{loadError}</strong></main>;
  if (checkingSession) return <main className="centerPage">확인하는 중...</main>;

  if (!student) {
    return (
      <main className="centerPage">
        <form className="loginCard" onSubmit={handleLogin}>
          <Mascot />
          <h1>한자 어휘 로그인</h1>
          <p>선생님이 알려 준 강사 코드, 아이디, 비밀번호를 입력하세요.</p>
          <label>강사 코드<input value={login.teacherCode} onChange={(event) => setLogin({ ...login, teacherCode: event.target.value })} placeholder="마스터 계정 학생은 비워 두세요" /></label>
          <label>아이디<input value={login.loginId} onChange={(event) => setLogin({ ...login, loginId: event.target.value })} /></label>
          <label>비밀번호<input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
          <button className="btn primary" type="submit">로그인</button>
          {loginError && <strong className="errorText">{loginError}</strong>}
          <Link className="textLink" href="/admin">관리 화면</Link>
        </form>
      </main>
    );
  }

  if (!lesson) return <main className="centerPage">오늘 학습할 한자가 아직 없습니다.</main>;

  const quizTotal = Math.max(1, queue.length);
  const isRetryRound = stage === "quiz" && queue.length > 0 && queue.length < vocab.length;
  const progress = stage === "learn" ? ((cardIndex + 1) / Math.max(1, cards.length)) * 100 : stage === "quiz" ? (quizIndex / quizTotal) * 100 : 100;
  const lessonProgress = progressRecord.quiz?.[lesson.day] || null;
  const lessonCompleted = Boolean(progressRecord.completed?.[lesson.day]) && !lessonProgress?.wrong?.length;

  return (
    <main className="appFrame">
      <header className="topBar">
        <div><strong>{student.name}</strong><span>{student.grade} · {lesson.day}일차</span></div>
        <div className="topActions">
          <Link className="btn ghost" href="/admin">관리</Link>
          <button className="btn" onClick={logoutStudent}>로그아웃</button>
        </div>
      </header>
      <LessonOverview lesson={lesson} hanja={hanja} vocab={vocab} stage={stage} cardIndex={cardIndex} quizIndex={quizIndex} lessonProgress={lessonProgress} lessonCompleted={lessonCompleted} />
      <div className="progress"><span style={{ width: `${Math.max(8, Math.min(100, progress))}%` }} /></div>
      {stage === "learn" && <LearningCard card={cards[cardIndex]} index={cardIndex} total={cards.length} onPrev={() => setCardIndex(Math.max(0, cardIndex - 1))} onNext={() => cardIndex + 1 >= cards.length ? startQuiz() : setCardIndex(cardIndex + 1)} />}
      {stage === "quiz" && currentQuiz && <QuizCard quiz={currentQuiz} feedback={feedback} onChoose={choose} remainingWrong={stats.wrong.length} index={quizIndex} total={queue.length} isRetryRound={isRetryRound} />}
      {stage === "review" && (
        <Review
          stats={stats}
          vocab={vocab}
          onRestart={() => { setStage("learn"); setCardIndex(0); }}
          onRetryQuiz={startQuiz}
        />
      )}
    </main>
  );
}

function LessonOverview({ lesson, hanja, vocab, stage, cardIndex, quizIndex, lessonProgress, lessonCompleted }) {
  const stageLabel = stage === "learn" ? "카드 학습" : stage === "quiz" ? "퀴즈" : "학습 완성";
  const current = stage === "learn" ? `${cardIndex + 1}번째 카드` : stage === "quiz" ? `${quizIndex + 1}번째 문제` : "완료";
  const savedRate = lessonProgress?.total ? Math.round((lessonProgress.correct / lessonProgress.total) * 100) : 0;
  const savedStatus = lessonCompleted ? "학습 완성" : lessonProgress?.wrong?.length ? "복습 필요" : lessonProgress?.total ? "진행 중" : "시작 전";
  const attempts = lessonProgress?.attempts || (lessonProgress?.total ? 1 : 0);
  const savedDetail = lessonProgress?.total ? `${savedRate}% · ${lessonProgress.correct}/${lessonProgress.total} · ${attempts}회 응시` : "기록 없음";
  return (
    <section className="lessonOverview">
      <div>
        <p className="eyebrow">{lesson.day}일차</p>
        <h1>{hanja.map((item) => item.character).join(" · ")}</h1>
      </div>
      <div className="lessonStats">
        <span><b>{hanja.length}</b>한자</span>
        <span><b>{vocab.length}</b>어휘</span>
        <span><b>{stageLabel}</b>{current}</span>
      </div>
      <div className={`lessonSaved ${lessonCompleted ? "complete" : lessonProgress?.wrong?.length ? "retry" : ""}`}>
        <b>{savedStatus}</b>
        <span>{savedDetail}</span>
        {lessonProgress?.wrong?.length ? <small>남은 오답: {lessonProgress.wrong.join(", ")}</small> : lessonProgress?.wrongHistory?.length ? <small>복습한 어휘: {lessonProgress.wrongHistory.join(", ")}</small> : null}
      </div>
    </section>
  );
}

function LearningCard({ card, index, total, onPrev, onNext }) {
  const isHanja = card.type === "hanja";
  return (
    <section className="studyStage">
      <Mascot small />
      <p className="eyebrow">{index + 1} / {total}</p>
      {isHanja ? (
        <article className="hanjaCard">
          <div className="bigHanja">{card.hanja.character}</div>
          <div className="metaGrid">
            <span><small>음</small>{card.hanja.sound}</span>
            <span><small>뜻</small>{card.hanja.meaning}</span>
          </div>
          <p>{card.hanja.origin}</p>
          <p className="smallText">{card.hanja.relation}</p>
        </article>
      ) : (
        <article className="hanjaCard">
          <div className="wordHanja">{card.item.hanja}</div>
          <h2>{card.item.word}</h2>
          <p>{card.item.meaning}</p>
          <div className="examples">{card.item.examples.map((example) => <p key={example}>{highlight(example, card.item.word)}</p>)}</div>
        </article>
      )}
      <div className="navRow">
        <button className="btn" onClick={onPrev} disabled={index === 0}>이전</button>
        <button className="btn primary" onClick={onNext}>{index + 1 >= total ? "퀴즈 시작" : "다음"}</button>
      </div>
    </section>
  );
}

function QuizCard({ quiz, feedback, onChoose, remainingWrong, index, total, isRetryRound }) {
  const quizTypeLabel = quiz.type === "blank" ? "문장 빈칸" : quiz.type === "relation" ? "관계 한자" : quiz.type === "homophone" ? "동음이의 한자" : "뜻 고르기";
  return (
    <section className="quizStage">
      <article className={`questionCard ${quiz.type === "blank" ? "blankQuestion" : ""}`}>
        <p className="eyebrow">{isRetryRound ? `오답 다시 풀기 · ${index + 1} / ${total}` : `퀴즈 · ${index + 1} / ${total}`}</p>
        {remainingWrong > 0 && <span className="retryCount">남은 오답 {remainingWrong}개</span>}
        <span className="quizType">{quizTypeLabel}</span>
        <h1>{quiz.prompt}</h1>
        <p className="smallText">{quiz.helper}</p>
        <p>{quiz.sub}</p>
      </article>
      <div className="choices">{quiz.choices.map((choice) => <button className="choice" key={choice} onClick={() => onChoose(choice)}>{choice}</button>)}</div>
      {feedback && <div className={`feedback ${feedback}`}><Mascot mood={feedback === "correct" ? "happy" : "sad"} /><strong>{feedback === "correct" ? "좋았어!" : "다시 만나자!"}</strong></div>}
    </section>
  );
}

function Review({ stats, vocab, onRestart, onRetryQuiz }) {
  const rate = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
  const wrongHistory = new Set(stats.wrongHistory || []);
  return (
    <section className="reviewCard">
      <Mascot />
      <h1>{stats.wrong.length ? "복습 필요" : "학습 완성"}</h1>
      <p>정답률 {rate}% · {stats.correct}/{stats.total}</p>
      <p>{stats.wrong.length ? `남은 오답 어휘: ${stats.wrong.join(", ")}` : "오답까지 다시 풀어 모두 맞혔습니다."}</p>
      <div className="reviewWords">
        {vocab.map((item) => {
          const practiced = wrongHistory.has(item.word);
          return (
            <article className={practiced ? "reviewed" : ""} key={item.word}>
              <strong>{item.word}</strong>
              <span>{item.hanja}</span>
              <small>{item.meaning}</small>
            </article>
          );
        })}
      </div>
      <div className="buttonRow">
        <button className="btn" onClick={onRestart}>카드 다시 보기</button>
        <button className="btn primary" onClick={onRetryQuiz}>퀴즈 다시 풀기</button>
      </div>
    </section>
  );
}

function highlight(sentence, word) {
  const parts = sentence.split(word);
  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>{part}{index < parts.length - 1 && <strong>{word}</strong>}</span>
  ));
}
