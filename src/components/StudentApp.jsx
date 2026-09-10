"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mascot } from "./Mascot";

export function StudentApp() {
  const [login, setLogin] = useState({ teacherCode: "master", loginId: "", password: "" });
  const [status, setStatus] = useState("확인하는 중...");
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("home");
  const [cardIndex, setCardIndex] = useState(0);
  const [quizQueue, setQuizQueue] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [retryQueue, setRetryQueue] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0, wrong: [], wrongHistory: [] });
  const [levelUpNotice, setLevelUpNotice] = useState(null);

  useEffect(() => {
    loadToday();
    preloadImages(["/characters/correct.png", "/characters/wrong.png", "/characters/levelup.png"]);
  }, []);

  const lessonItems = useMemo(() => buildLessonItems(payload?.hanja || []), [payload]);
  const quizItems = useMemo(() => buildQuizItems(lessonItems), [lessonItems]);
  const currentCard = lessonItems[cardIndex];
  const currentQuiz = quizQueue[quizIndex];

  async function loadToday() {
    try {
      const response = await fetch("/api/student/today", { cache: "no-store" });
      const data = await response.json();
      if (data.authenticated) {
        setPayload(data);
        setStatus("");
      } else {
        setStatus("");
      }
    } catch {
      setStatus("서버 확인에 실패했습니다.");
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login)
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.message || "로그인을 확인해 주세요.");
        return;
      }
      await loadToday();
      setStage("home");
    } catch {
      setStatus("로그인 요청 중 문제가 생겼습니다.");
    } finally {
      setLoading(false);
    }
  }

  function startCards() {
    setStage("cards");
    setCardIndex(0);
    setFeedback(null);
  }

  function startQuiz(items = quizItems) {
    const queue = shuffle(items);
    setQuizQueue(queue);
    setQuizIndex(0);
    setRetryQueue([]);
    setFeedback(null);
    setStats({ correct: 0, total: 0, wrong: [], wrongHistory: [] });
    setStage(queue.length ? "quiz" : "done");
  }

  function answerQuiz(choice) {
    if (!currentQuiz || feedback) return;
    const correct = choice === currentQuiz.answer;
    const wrongKey = currentQuiz.word;
    setStats((previous) => ({
      correct: previous.correct + (correct ? 1 : 0),
      total: previous.total + 1,
      wrong: correct ? previous.wrong.filter((word) => word !== wrongKey) : [...new Set([...previous.wrong, wrongKey])],
      wrongHistory: correct ? previous.wrongHistory : [...new Set([...previous.wrongHistory, wrongKey])]
    }));
    if (!correct) setRetryQueue((previous) => [...previous, currentQuiz]);
    setFeedback(correct ? "correct" : "wrong");
    window.setTimeout(() => {
      setFeedback(null);
      setQuizIndex((previous) => previous + 1);
    }, 1300);
  }

  useEffect(() => {
    if (stage !== "quiz" || feedback || !quizQueue.length) return;
    if (quizIndex < quizQueue.length) return;
    if (retryQueue.length) {
      setQuizQueue(shuffle(retryQueue));
      setRetryQueue([]);
      setQuizIndex(0);
      return;
    }
    saveProgress();
  }, [stage, feedback, quizIndex, quizQueue, retryQueue]);

  async function saveProgress() {
    setStage("saving");
    try {
      const completedDay = Number(payload.lesson.day);
      const response = await fetch("/api/student/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonDay: payload.lesson.day, stats })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "학습 결과를 저장하지 못했습니다.");
      setPayload(data);
      if (data.lock && completedDay > 0 && completedDay % 5 === 0) {
        const nextLevel = Math.floor(completedDay / 5) + 1;
        setLevelUpNotice({ level: nextLevel });
        window.setTimeout(() => setLevelUpNotice(null), 2600);
      }
      setStage(data.lock ? "home" : "done");
    } catch (error) {
      setStatus(error.message || "학습 결과를 저장하지 못했습니다.");
      setStage("done");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setPayload(null);
    resetLearningState();
    setStatus("");
  }

  function resetLearningState() {
    setStage("home");
    setCardIndex(0);
    setQuizQueue([]);
    setQuizIndex(0);
    setRetryQueue([]);
    setFeedback(null);
    setStats({ correct: 0, total: 0, wrong: [], wrongHistory: [] });
    setLevelUpNotice(null);
  }

  function goHome() {
    resetLearningState();
    setStatus("");
  }

  function goPreviousStage() {
    setFeedback(null);
    if (stage === "cards") {
      setStage("home");
      return;
    }
    if (stage === "quiz") {
      setStage("cards");
      setCardIndex(Math.max(0, lessonItems.length - 1));
      return;
    }
    if (stage === "done") {
      startQuiz();
    }
  }

  if (payload?.student) {
    return (
      <main className="phonePage">
        <PreloadedFeedbackImages />
        <section className="panel studentHome">
          <div className="studentTopActions">
            <button className="btn textBtn" type="button" onClick={logout}>로그아웃</button>
          </div>
          {!payload.lock ? <Mascot variant="wink" level={Math.floor((Number(payload.student.current_day || 1) - 1) / 5) + 1} /> : null}
          <p className="eyebrow">{payload.student.name} · {payload.student.grade} · {payload.student.level}</p>
          <h1>{payload.lock ? `${payload.lock.day}일차 잠김` : `${payload.student.current_day}일차 학습`}</h1>
          {levelUpNotice ? <LevelUpOverlay level={levelUpNotice.level} /> : null}
          {payload.lock ? (
            <LockedLesson lock={payload.lock} onRefresh={loadToday} />
          ) : payload.lesson ? (
            <>
              <LessonStats hanja={payload.hanja} />
              {stage === "home" ? <HomeLesson hanja={payload.hanja} onCards={startCards} onQuiz={() => startQuiz()} /> : null}
              {stage !== "home" && stage !== "saving" ? (
                <StageNavigation stage={stage} onPrev={goPreviousStage} onHome={goHome} />
              ) : null}
              {stage === "cards" && currentCard ? (
                <StudyCard
                  item={currentCard}
                  index={cardIndex}
                  total={lessonItems.length}
                  onPrev={() => setCardIndex(Math.max(0, cardIndex - 1))}
                  onNext={() => {
                    if (cardIndex + 1 >= lessonItems.length) startQuiz();
                    else setCardIndex(cardIndex + 1);
                  }}
                />
              ) : null}
              {stage === "quiz" && currentQuiz ? (
                <QuizCard quiz={currentQuiz} feedback={feedback} index={quizIndex} total={quizQueue.length} onAnswer={answerQuiz} />
              ) : null}
              {stage === "saving" ? <LoadingLesson /> : null}
              {stage === "done" ? <DoneCard stats={stats} status={status} onCards={startCards} onQuiz={() => startQuiz()} /> : null}
            </>
          ) : (
            <p className="errorText">오늘 배정된 일차 데이터가 아직 없습니다.</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="page center">
      <form className="panel loginCard" onSubmit={submitLogin}>
        <Mascot variant="book" />
        <h1>한자 어휘 로그인</h1>
        <label>강사 코드<input value={login.teacherCode} onChange={(event) => setLogin({ ...login, teacherCode: event.target.value })} /></label>
        <label>아이디<input value={login.loginId} onChange={(event) => setLogin({ ...login, loginId: event.target.value })} /></label>
        <label>비밀번호<input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
        <button className="btn primary" disabled={loading}>{loading ? "로그인 중..." : "로그인"}</button>
        <Link className="btn secondary loginSwitch" href="/admin">강사/원장 로그인</Link>
        {status ? <p className="errorText">{status}</p> : null}
      </form>
    </main>
  );
}

function LevelUpOverlay({ level }) {
  return (
    <div className="levelUpOverlay" role="status" aria-live="polite">
      <article className="levelUpCard">
        <Mascot variant="levelup" label="레벨업" />
        <span>Lv. {level}</span>
        <h2>레벨업!</h2>
      </article>
    </div>
  );
}

function LockedLesson({ lock, onRefresh }) {
  const openTime = formatKoreaTime(lock.availableAt);
  return (
    <article className="doneCard lockedCard">
      <div className="lockHero" aria-hidden="true">
        <Mascot variant="wink" label="초록이" />
        <span className="lockBadge">
          <span className="lockShackle" />
          <span className="lockBody" />
        </span>
      </div>
      <span className="lockEyebrow">오늘 학습 완료</span>
      <h2>기다려주세요!</h2>
      <p className="lockMessage"><b>{openTime}</b>에 다음 일차 학습이 시작됩니다!</p>
      <p className="mutedText">{lock.previousDay}일차를 끝냈어요. 잠깐 쉬었다가 다음 한자로 만나요.</p>
      <div className="studyActions singleAction">
        <button className="btn secondary" type="button" onClick={onRefresh}>새로고침</button>
      </div>
    </article>
  );
}

function LessonStats({ hanja }) {
  return (
    <div className="lessonStats">
      <span><b>{hanja.length}</b>한자</span>
      <span><b>{hanja.reduce((total, item) => total + item.vocab.length, 0)}</b>어휘</span>
    </div>
  );
}

function HomeLesson({ hanja, onCards, onQuiz }) {
  return (
    <>
      <div className="hanjaGrid previewGrid">
        {hanja.map((item) => (
          <article key={item.id} className="hanjaCard">
            <strong>{item.character}</strong>
            <p><em>음</em> {item.sound} <em>뜻</em> {item.meaning}</p>
            <p className="mutedText">어휘 {item.vocab.length}개</p>
          </article>
        ))}
      </div>
      <div className="studyActions">
        <button className="btn primary" type="button" onClick={onCards}>카드 학습 시작</button>
        <button className="btn secondary" type="button" onClick={onQuiz}>문제 바로 풀기</button>
      </div>
    </>
  );
}

function StageNavigation({ stage, onPrev, onHome }) {
  const label = stage === "quiz" ? "한자 학습으로" : stage === "done" ? "문제 다시 보기" : "처음 화면으로";

  return (
    <div className="stageNavigation">
      <button className="btn secondary" type="button" onClick={onPrev}>◀ {label}</button>
      <button className="btn textBtn" type="button" onClick={onHome}>홈</button>
    </div>
  );
}

function StudyCard({ item, index, total, onPrev, onNext }) {
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const swipingHorizontally = useRef(false);
  const isFirst = index === 0;
  const isLast = index + 1 >= total;

  function goPrev() {
    if (!isFirst) onPrev();
  }

  function goNext() {
    onNext();
  }

  function handleTouchStart(event) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchStartY.current = event.touches[0]?.clientY ?? null;
    swipingHorizontally.current = false;
  }

  function handleTouchMove(event) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;
    if (!swipingHorizontally.current && Math.abs(deltaX) > 14 && Math.abs(deltaX) > Math.abs(deltaY) + 8) {
      swipingHorizontally.current = true;
    }
    if (swipingHorizontally.current && event.cancelable) {
      event.preventDefault();
    }
  }

  function handleTouchEnd(event) {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const distance = endX - touchStartX.current;
    touchStartX.current = null;
    touchStartY.current = null;
    swipingHorizontally.current = false;
    if (Math.abs(distance) < 55) return;
    if (distance > 0) goPrev();
    else goNext();
  }

  return (
    <article className="swipeCard" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <Mascot variant={item.type === "hanja" ? "study" : "discover"} small label={item.type === "hanja" ? "공부 중" : "어휘 발견"} />
      <p className="eyebrow">{index + 1} / {total}</p>
      {item.type === "hanja" ? (
        <>
          <strong className="studyHanja">{item.character}</strong>
          <div className="metaGrid">
            <span><small>음</small>{item.sound}</span>
            <span><small>뜻</small>{item.meaning}</span>
          </div>
        </>
      ) : (
        <>
          <strong className="studyWord">{item.hanjaWord}</strong>
          <h2>{item.word}</h2>
          <p>{item.meaning}</p>
          {item.example ? <blockquote>{highlightWord(item.example, item.word)}</blockquote> : null}
        </>
      )}
      <div className="navRow">
        <button className="btn secondary" type="button" onClick={goPrev} disabled={isFirst}>이전 카드</button>
        <button className="btn primary" type="button" onClick={goNext}>{isLast ? "문제 풀기" : "다음 카드"}</button>
      </div>
    </article>
  );
}

function QuizCard({ quiz, feedback, index, total, onAnswer }) {
  return (
    <section className="quizStage">
      <article className="questionCard">
        <p className="eyebrow">문제 {index + 1} / {total}</p>
        <span className="quizType">{quiz.type === "meaning" ? "뜻 고르기" : "어휘 고르기"}</span>
        <h2>{quiz.prompt}</h2>
        <p>{quiz.helper}</p>
      </article>
      <div className="choices">
        {quiz.choices.map((choice) => (
          <button className="choice" key={choice} type="button" onClick={() => onAnswer(choice)}>{choice}</button>
        ))}
      </div>
      {feedback ? (
        <div className={`feedbackOverlay ${feedback}`}>
          <article className="feedbackCard">
            <Mascot variant={feedback === "correct" ? "correct" : "wrong"} label="" />
            <strong>{feedback === "correct" ? "정답!" : "다시 풀어볼게요"}</strong>
          </article>
        </div>
      ) : null}
    </section>
  );
}

function PreloadedFeedbackImages() {
  return (
    <div className="preloadAssets" aria-hidden="true">
      <img src="/characters/correct.png" alt="" />
      <img src="/characters/wrong.png" alt="" />
      <img src="/characters/levelup.png" alt="" />
    </div>
  );
}

function DoneCard({ stats, status, onCards, onQuiz }) {
  const rate = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
  return (
    <article className="doneCard">
      <Mascot variant={rate >= 80 ? "levelup" : "streak"} label={rate >= 80 ? "레벨업" : "연속 학습"} />
      <h2>{stats.wrong.length ? "복습 완료" : "오늘 학습 완료"}</h2>
      <p>정답률 {rate}% · {stats.correct}/{stats.total}</p>
      {stats.wrongHistory.length ? <p className="mutedText">다시 만난 어휘: {stats.wrongHistory.join(", ")}</p> : null}
      {status ? <p className="errorText">{status}</p> : null}
      <div className="studyActions">
        <button className="btn secondary" type="button" onClick={onCards}>카드 다시 보기</button>
        <button className="btn primary" type="button" onClick={onQuiz}>문제 다시 풀기</button>
      </div>
    </article>
  );
}

function formatKoreaTime(value) {
  if (!value) return "00:00";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = values.hour === "24" ? "00" : values.hour;
  return `${hour}:${values.minute}`;
}

function LoadingLesson() {
  return (
    <div className="loadingMascot">
      <Mascot variant="loading" small label="저장 중" />
      <p className="statusText">학습 결과 저장 중...</p>
    </div>
  );
}

function buildLessonItems(hanja) {
  return hanja.flatMap((item) => [
    { type: "hanja", id: `h-${item.id}`, character: item.character, sound: item.sound, meaning: item.meaning },
    ...item.vocab.map((vocab) => ({
      type: "vocab",
      id: `v-${vocab.id}`,
      character: item.character,
      hanjaWord: vocab.hanja_word,
      word: vocab.word,
      meaning: vocab.meaning,
      example: cleanExample(vocab.examples?.[0]?.text || "")
    }))
  ]);
}

function buildQuizItems(lessonItems) {
  const words = lessonItems
    .filter((item) => item.type === "vocab" && item.word && item.meaning)
    .map((item) => ({
      id: item.id,
      character: item.character,
      hanjaWord: item.hanjaWord,
      word: item.word,
      meaning: item.meaning,
      example: item.example
    }));
  return words.flatMap((item, index) => {
    const prompt = item.example && item.example.includes(item.word)
      ? item.example.replaceAll(item.word, "____")
      : `${item.meaning}에 맞는 어휘는?`;
    return [
      {
        type: "meaning",
        word: item.word,
        prompt: `${item.hanjaWord} · ${item.word}`,
        helper: `${item.character} 한자가 들어간 어휘의 뜻을 골라요.`,
        answer: item.meaning,
        choices: makeChoices(item.meaning, words.map((word) => word.meaning), index)
      },
      {
        type: "blank",
        word: item.word,
        prompt,
        helper: "빈칸에 들어갈 어휘를 골라요.",
        answer: item.word,
        choices: makeChoices(item.word, words.map((word) => word.word), index + 7)
      }
    ];
  });
}

function makeChoices(answer, pool, offset = 0) {
  const shuffled = shuffle(pool.filter((item) => item && item !== answer));
  const choices = [answer, ...shuffled.slice(offset % 3, offset % 3 + 3)];
  return shuffle([...new Set(choices)].slice(0, 4));
}

function cleanExample(value) {
  return String(value || "")
    .replace(/^\s*[\[(<【]?\s*(문장|대화|예문|구)\s*(\d+|[一二三])?\s*[\])>】]?\s*[:：.\-–—]*\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function highlightWord(sentence, word) {
  const parts = String(sentence || "").split(word);
  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>{part}{index < parts.length - 1 ? <b>{word}</b> : null}</span>
  ));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function preloadImages(paths) {
  paths.forEach((path) => {
    const image = new Image();
    image.src = path;
    if (image.decode) image.decode().catch(() => {});
  });
}
