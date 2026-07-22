"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { findLesson, hanjaItems, learningCards, lessonVocab, quizItems } from "../lib/curriculum";
import { Mascot } from "./Mascot";

const studentLoginStorageKey = "chologihanzi-student-login";

export function StudentApp() {
  const [student, setStudent] = useState(null);
  const [curriculum, setCurriculum] = useState([]);
  const [progressRecord, setProgressRecord] = useState({ completed: {}, quiz: {} });
  const [loadError, setLoadError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [login, setLogin] = useState({ teacherCode: "", loginId: "", password: "" });
  const [rememberLogin, setRememberLogin] = useState(true);
  const [stage, setStage] = useState("learn");
  const [cardIndex, setCardIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [queue, setQueue] = useState([]);
  const [retry, setRetry] = useState([]);
  const [stats, setStats] = useState({ correct: 0, total: 0, wrong: [], wrongHistory: [] });
  const [pendingStudent, setPendingStudent] = useState(null);
  const latestStatsRef = useRef(stats);
  const [feedback, setFeedback] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [archeryGame, setArcheryGame] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(studentLoginStorageKey) || "null");
      if (saved) {
        setLogin({
          teacherCode: saved.teacherCode || "",
          loginId: saved.loginId || "",
          password: saved.password || ""
        });
        setRememberLogin(saved.remember !== false);
      }
    } catch {
      window.localStorage.removeItem(studentLoginStorageKey);
    }
  }, []);

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
  const reviewGame = useMemo(() => buildReviewGame(curriculum, lesson, student?.level, progressRecord), [curriculum, lesson, student, progressRecord]);
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
    setArcheryGame(null);
    setPendingStudent(null);
    resetStats();
    if (rememberLogin) {
      window.localStorage.setItem(studentLoginStorageKey, JSON.stringify({ ...login, remember: true }));
    } else {
      window.localStorage.removeItem(studentLoginStorageKey);
      setLogin({ teacherCode: "", loginId: "", password: "" });
    }
  }

  async function logoutStudent() {
    await fetch("/api/student/session", { method: "DELETE" });
    setStudent(null);
    setCurriculum([]);
    setProgressRecord({ completed: {}, quiz: {} });
    resetStats();
    setStage("learn");
    setArcheryGame(null);
    setPendingStudent(null);
  }

  function startQuiz() {
    setQueue(quizItems(lesson));
    setRetry([]);
    setQuizIndex(0);
    setPendingStudent(null);
    setArcheryGame(null);
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
      if (result.student) setPendingStudent(result.student);
      if (result.progress) setProgressRecord(result.progress);
    } catch (error) {
      setLoadError(error.message);
    }
  }

  async function saveGameProgress(result) {
    if (!archeryGame || !lesson) return;
    try {
      const response = await fetch("/api/student/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonDay: lesson.day,
          game: {
            ...result,
            type: "archery",
            key: archeryGame.key,
            rangeStart: archeryGame.rangeStart,
            rangeEnd: archeryGame.rangeEnd,
            level: archeryGame.level
          }
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "게임 결과를 저장하지 못했습니다.");
      }
      const payload = await response.json();
      if (payload.progress) setProgressRecord(payload.progress);
      setArcheryGame(null);
      setStage("review");
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
          <label className="rememberLogin"><input type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} />강사 코드, 아이디, 비밀번호 저장</label>
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
  const unlockAt = progressRecord.unlocks?.[lesson.day];
  const lessonLocked = Boolean(unlockAt && Date.now() < new Date(unlockAt).getTime() && !lessonCompleted);

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
      {lessonLocked ? (
        <LockedLesson lesson={lesson} unlockAt={unlockAt} />
      ) : (
        <>
      <div className="progress"><span style={{ width: `${Math.max(8, Math.min(100, progress))}%` }} /></div>
      {stage === "learn" && <LearningCard card={cards[cardIndex]} index={cardIndex} total={cards.length} onPrev={() => setCardIndex(Math.max(0, cardIndex - 1))} onNext={() => cardIndex + 1 >= cards.length ? startQuiz() : setCardIndex(cardIndex + 1)} />}
      {stage === "quiz" && currentQuiz && <QuizCard quiz={currentQuiz} feedback={feedback} onChoose={choose} remainingWrong={stats.wrong.length} index={quizIndex} total={queue.length} isRetryRound={isRetryRound} />}
      {stage === "archery" && archeryGame && (
        <ArcheryGame
          game={archeryGame}
          onComplete={saveGameProgress}
          onExit={() => {
            setArcheryGame(null);
            setStage("review");
          }}
        />
      )}
      {stage === "review" && (
        <Review
          stats={stats}
          vocab={vocab}
          reviewGame={reviewGame}
          onStartGame={reviewGame ? () => { setArcheryGame(reviewGame); setStage("archery"); } : null}
          onRestart={() => { setStage("learn"); setCardIndex(0); }}
          onRetryQuiz={startQuiz}
          onNextDay={pendingStudent ? () => { setStudent(pendingStudent); setPendingStudent(null); setStage("learn"); setCardIndex(0); } : null}
        />
      )}
        </>
      )}
    </main>
  );
}

function LockedLesson({ lesson, unlockAt }) {
  const unlockText = formatKoreanUnlockTime(unlockAt, "long");
  return (
    <section className="lockedLesson">
      <Mascot mood="happy" />
      <p className="eyebrow">{lesson.day}일차 준비 중</p>
      <h2>다음 학습은 {unlockText}부터 열려요.</h2>
      <p>오늘 학습을 잘 끝냈어요. 내일 00:00 이후에 다음 일차를 시작할 수 있습니다.</p>
      <Link className="btn ghost" href="/">홈으로</Link>
    </section>
  );
}

function formatKoreanUnlockTime(value, monthStyle = "numeric") {
  const date = new Date(value);
  const koreanDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = koreanDate.getUTCMonth() + 1;
  const day = koreanDate.getUTCDate();
  const hour = koreanDate.getUTCHours();
  const minute = String(koreanDate.getUTCMinutes()).padStart(2, "0");
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour < 12 ? hour : hour - 12;
  const monthText = monthStyle === "long" ? `${month}월` : `${month}.`;
  return `${monthText} ${day}일 ${period} ${String(displayHour).padStart(2, "0")}:${minute}`;
}

function LessonOverview({ lesson, hanja, vocab, stage, cardIndex, quizIndex, lessonProgress, lessonCompleted }) {
  const stageLabel = stage === "learn" ? "카드 학습" : stage === "quiz" ? "퀴즈" : stage === "archery" ? "복습 게임" : "학습 완성";
  const current = stage === "learn" ? `${cardIndex + 1}번째 카드` : stage === "quiz" ? `${quizIndex + 1}번째 문제` : stage === "archery" ? "활쏘기" : "완료";
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
  const quizTypeLabel = quiz.type === "blank" ? "문장 빈칸" : "뜻 고르기";
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

function Review({ stats, vocab, reviewGame, onStartGame, onRestart, onRetryQuiz, onNextDay }) {
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
        {reviewGame && (
          <button className="btn blue" onClick={onStartGame}>
            {reviewGame.completed ? "복습 활쏘기 다시 하기" : `${reviewGame.rangeStart}-${reviewGame.rangeEnd}일차 복습 활쏘기`}
          </button>
        )}
        <button className="btn" onClick={onRestart}>카드 다시 보기</button>
        <button className="btn primary" onClick={onRetryQuiz}>퀴즈 다시 풀기</button>
        {onNextDay && <button className="btn blue" onClick={onNextDay}>다음 일차 확인</button>}
      </div>
    </section>
  );
}

function ArcheryGame({ game, onComplete, onExit }) {
  const fieldRef = useRef(null);
  const questions = useMemo(() => buildArcheryQuestions(game.items), [game.items]);
  const [index, setIndex] = useState(0);
  const [hits, setHits] = useState(0);
  const [missed, setMissed] = useState(0);
  const [aim, setAim] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [shot, setShot] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const current = questions[index];
  const blocks = useMemo(() => buildArcheryBlocks(current, game.items), [current, game.items]);
  const fallDuration = Math.max(1800, 3200 - index * 140);

  useEffect(() => {
    setQuestionStartedAt(Date.now());
    setAim(null);
    setDragging(false);
  }, [index]);

  useEffect(() => {
    if (!questions.length || shot) return;
    const timer = window.setTimeout(() => {
      setShot({ correct: false, targetWord: "", timedOut: true });
      window.setTimeout(() => finishQuestion(false, "", true), 520);
    }, fallDuration);
    return () => window.clearTimeout(timer);
  }, [index, questions.length, shot, fallDuration]);

  if (!questions.length) {
    return (
      <section className="archeryGame emptyGame">
        <Mascot />
        <h2>복습 게임을 만들 어휘가 아직 부족해요.</h2>
        <button className="btn" onClick={onExit}>돌아가기</button>
      </section>
    );
  }

  function pointFromEvent(event) {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      width: rect.width,
      height: rect.height
    };
  }

  function handlePointerDown(event) {
    if (shot) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    setAim(pointFromEvent(event));
  }

  function handlePointerMove(event) {
    if (!dragging || shot) return;
    setAim(pointFromEvent(event));
  }

  function handlePointerUp(event) {
    if (!dragging || shot || !current) return;
    const point = pointFromEvent(event);
    setDragging(false);
    setAim(point);
    const target = findTargetBlock(point, blocks, questionStartedAt, fallDuration);
    const correct = target?.word === current.word;
    setShot({ correct, targetWord: target?.word || "" });
    window.setTimeout(() => finishQuestion(correct, target?.word || "", false), 700);
  }

  function finishQuestion(correct, selectedWord = "", timedOut = false) {
    const nextHits = hits + (correct ? 1 : 0);
    const nextMissed = missed + (correct ? 0 : 1);
    const nextAnswers = [
      ...answers,
      {
        word: current.word,
        hanja: current.hanja,
        meaning: current.meaning,
        selectedWord,
        correct,
        timedOut
      }
    ];
    setHits(nextHits);
    setMissed(nextMissed);
    setAnswers(nextAnswers);
    setShot(null);
    setAim(null);
    if (index + 1 >= questions.length) {
      const accuracy = Math.round((nextHits / questions.length) * 100);
      onComplete({
        score: nextHits * 100,
        hits: nextHits,
        total: questions.length,
        missed: nextMissed,
        accuracy,
        cleared: accuracy >= 80,
        reviewedWords: nextAnswers.map((item) => item.word),
        hitWords: nextAnswers.filter((item) => item.correct).map((item) => item.word),
        missedWords: nextAnswers.filter((item) => !item.correct).map((item) => item.word),
        answers: nextAnswers
      });
      return;
    }
    setIndex((value) => value + 1);
  }

  const aimStyle = aim ? {
    "--aim-x": `${aim.x}px`,
    "--aim-y": `${aim.y}px`
  } : undefined;

  return (
    <section className="archeryGame">
      <div className="archeryHud">
        <div>
          <p className="eyebrow">{game.rangeStart}-{game.rangeEnd}일차 복습</p>
          <h2>뜻에 맞는 단어 블록을 맞혀요</h2>
        </div>
        <div className="archeryScore">
          <span>{index + 1}/{questions.length}</span>
          <b>{hits * 100}점</b>
        </div>
      </div>
      <article className="archeryPrompt">
        <span>이번 뜻</span>
        <strong>{current.meaning}</strong>
        <small>{current.parent?.character}({current.parent?.sound}) 한자가 들어간 어휘예요.</small>
      </article>
      <div
        ref={fieldRef}
        className={`archeryField ${shot ? shot.correct ? "hit" : "miss" : ""}`}
        style={aimStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDragging(false)}
      >
        {blocks.map((block, blockIndex) => (
          <div
            className={`wordBlock ${shot?.correct && block.word === current.word ? "broken" : ""}`}
            key={`${block.word}-${blockIndex}`}
            style={{
              left: `${block.x}%`,
              "--fall-duration": `${fallDuration}ms`,
              "--fall-delay": `${blockIndex * 80}ms`
            }}
          >
            <strong>{block.word}</strong>
            <small>{block.hanja}</small>
          </div>
        ))}
        {aim && <span className="aimLine" />}
        <div className="archerKid">
          <span className="kidFace"><i /><i /></span>
          <span className="bowShape" />
          <span className="arrowShape" />
        </div>
        {shot && (
          <div className={`shotResult ${shot.correct ? "correct" : "wrong"}`}>
            <Mascot mood={shot.correct ? "happy" : "sad"} small />
            <strong>{shot.correct ? "명중!" : shot.timedOut ? "놓쳤어요" : "아쉬워요"}</strong>
          </div>
        )}
      </div>
      <div className="archeryControls">
        <p>블록이 바닥에 닿기 전에 단어 블록 쪽으로 드래그해서 맞혀요.</p>
        <button className="btn ghost" onClick={onExit}>그만하기</button>
      </div>
    </section>
  );
}

function buildReviewGame(curriculum, lesson, level, progressRecord) {
  if (!lesson || Number(lesson.day) % 5 !== 0) return null;
  const rangeEnd = Number(lesson.day);
  const rangeStart = Math.max(1, rangeEnd - 4);
  const lessons = [];
  for (let day = rangeStart; day <= rangeEnd; day += 1) {
    const target = findLesson(curriculum, day, level);
    if (target && Number(target.day) === day) lessons.push(target);
  }
  const items = lessons.flatMap((item) => lessonVocab(item)).filter((item) => item.word && item.meaning);
  if (items.length < 4) return null;
  const key = `archery:${level}:${rangeStart}-${rangeEnd}`;
  return {
    key,
    level,
    rangeStart,
    rangeEnd,
    items,
    completed: Boolean(progressRecord.games?.[key]?.cleared)
  };
}

function buildArcheryQuestions(items) {
  return shuffleLocal(items).slice(0, Math.min(10, items.length));
}

function buildArcheryBlocks(current, items) {
  if (!current) return [];
  const options = [current, ...shuffleLocal(items.filter((item) => item.word !== current.word)).slice(0, 3)];
  const lanes = [18, 40, 62, 82];
  return shuffleLocal(options).map((item, index) => ({ ...item, x: lanes[index] }));
}

function findTargetBlock(point, blocks, startedAt, duration) {
  if (!point) return null;
  const elapsed = Math.max(0, Date.now() - startedAt);
  const fallProgress = Math.min(1, elapsed / Math.max(1, duration));
  const currentYPercent = -8 + fallProgress * 86;
  let nearest = null;
  let nearestDistance = Infinity;
  blocks.forEach((block) => {
    const blockX = (point.width * block.x) / 100;
    const blockY = (point.height * currentYPercent) / 100;
    const distance = Math.hypot(point.x - blockX, point.y - blockY);
    if (distance < nearestDistance) {
      nearest = block;
      nearestDistance = distance;
    }
  });
  return nearestDistance <= 130 ? nearest : null;
}

function shuffleLocal(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function highlight(sentence, word) {
  const parts = sentence.split(word);
  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>{part}{index < parts.length - 1 && <strong>{word}</strong>}</span>
  ));
}
