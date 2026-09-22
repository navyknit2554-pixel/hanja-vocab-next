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
  const [stats, setStats] = useState({ correct: 0, total: 0, wrong: [], wrongHistory: [], wrongDetails: [] });
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
    setStats({ correct: 0, total: 0, wrong: [], wrongHistory: [], wrongDetails: [] });
    setStage(queue.length ? "quiz" : "done");
  }

  function startGame() {
    setFeedback(null);
    setStage("game");
  }

  function answerQuiz(choice) {
    if (!currentQuiz || feedback) return;
    const correct = choice === currentQuiz.answer;
    const wrongKey = currentQuiz.word;
    const wrongDetail = {
      word: currentQuiz.word,
      hanjaWord: currentQuiz.hanjaWord,
      meaning: currentQuiz.meaning,
      questionType: currentQuiz.type
    };
    setStats((previous) => ({
      correct: previous.correct + (correct ? 1 : 0),
      total: previous.total + 1,
      wrong: correct ? previous.wrong.filter((word) => word !== wrongKey) : [...new Set([...previous.wrong, wrongKey])],
      wrongHistory: correct ? previous.wrongHistory : [...new Set([...previous.wrongHistory, wrongKey])],
      wrongDetails: correct ? previous.wrongDetails : mergeWrongDetails(previous.wrongDetails, wrongDetail)
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
    setStats({ correct: 0, total: 0, wrong: [], wrongHistory: [], wrongDetails: [] });
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
      return;
    }
    if (stage === "game") {
      setStage("home");
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
          <GradeLeaderboard leaderboard={payload.leaderboard} />
          {payload.lock ? (
            <LockedLesson lock={payload.lock} onRefresh={loadToday} />
          ) : payload.lesson ? (
            <>
              {stage === "home" ? <GameLearningButton onGame={startGame} /> : null}
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
              {stage === "game" ? <WordBlockGame hanja={payload.gameHanja || payload.hanja} lesson={payload.lesson} onExit={goHome} /> : null}
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

function GradeLeaderboard({ leaderboard }) {
  const scopes = leaderboard?.scopes || [];
  const [activeScopeKey, setActiveScopeKey] = useState("all");
  const activeScope = scopes.find((scope) => scope.key === activeScopeKey) || scopes[0];
  const leaders = activeScope?.top || [];
  if (!scopes.length || !activeScope) return null;

  return (
    <section className="gradeLeaderboard" aria-label="랭킹">
      <div className="leaderboardHeader">
        <div>
          <span>랭킹 TOP 3</span>
          <h2>{activeScope.title}</h2>
        </div>
        {activeScope.mine && Number(activeScope.mine.rank) > 3 ? (
          <p>나는 {activeScope.mine.rank}위</p>
        ) : null}
      </div>
      <div className="leaderboardTabs" role="tablist" aria-label="랭킹 범위">
        {scopes.map((scope) => (
          <button
            className={scope.key === activeScope.key ? "active" : ""}
            key={scope.key}
            type="button"
            role="tab"
            aria-selected={scope.key === activeScope.key}
            onClick={() => setActiveScopeKey(scope.key)}
          >
            {scope.label}
          </button>
        ))}
      </div>
      <div className="leaderboardList">
        {leaders.length ? leaders.map((student) => (
          <article className={`leaderboardItem ${student.id === leaderboard.currentStudentId ? "mine" : ""}`} key={student.id}>
            <strong>{student.rank}위</strong>
            <div>
              <b>{student.name}</b>
              <span>{student.level} · {student.completed_count}일차 완료</span>
            </div>
          </article>
        )) : <p className="emptyLeaderboard">아직 랭킹에 표시할 학생이 없습니다.</p>}
      </div>
    </section>
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

function GameLearningButton({ onGame }) {
  return (
    <div className="gameHeroAction">
      <button className="btn primary gameStartBtn" type="button" onClick={onGame}>게임 학습</button>
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

const GAME_COLUMNS = 6;
const GAME_ROWS = 10;
const GAME_DROP_MS = 950;
const GAME_OFFSETS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
];

function WordBlockGame({ hanja, lesson, onExit }) {
  const pairs = useMemo(() => buildGamePairs(hanja), [hanja]);
  const wordSet = useMemo(() => makeGameWordSet(pairs), [pairs]);
  const [board, setBoard] = useState(() => createEmptyGameBoard());
  const [active, setActive] = useState(null);
  const [nextPair, setNextPair] = useState(null);
  const [score, setScore] = useState(0);
  const [clearedWords, setClearedWords] = useState(0);
  const [isOver, setIsOver] = useState(false);
  const [leaderboard, setLeaderboard] = useState(null);
  const [status, setStatus] = useState("");
  const [saveState, setSaveState] = useState("idle");

  useEffect(() => {
    const emptyBoard = createEmptyGameBoard();
    const firstPair = pickGamePair(pairs);
    const upcomingPair = pickGamePair(pairs);
    setBoard(emptyBoard);
    setScore(0);
    setClearedWords(0);
    setIsOver(false);
    setStatus("");
    setSaveState("idle");
    setNextPair(upcomingPair);
    if (!firstPair) {
      setActive(null);
      return;
    }
    const firstPiece = makeGamePiece(firstPair);
    setActive(canPlaceGamePiece(emptyBoard, firstPiece) ? firstPiece : null);
  }, [pairs]);

  useEffect(() => {
    let ignore = false;
    async function loadLeaderboard() {
      if (!lesson?.level || !lesson?.day) return;
      try {
        const response = await fetch(`/api/student/game-score?level=${encodeURIComponent(lesson.level)}&day=${lesson.day}`, { cache: "no-store" });
        const data = await response.json();
        if (!ignore && data.ok) setLeaderboard(data.leaderboard);
      } catch {
        if (!ignore) setStatus("게임 랭킹을 불러오지 못했습니다.");
      }
    }
    loadLeaderboard();
    return () => {
      ignore = true;
    };
  }, [lesson?.level, lesson?.day]);

  useEffect(() => {
    if (!active || isOver || !pairs.length) return undefined;
    const timer = window.setInterval(() => {
      stepDown();
    }, GAME_DROP_MS);
    return () => window.clearInterval(timer);
  }, [active, board, isOver, pairs]);

  async function saveGameScore(finalScore, finalClearedWords) {
    if (!lesson?.level || !lesson?.day || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/student/game-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: lesson.level,
          day: lesson.day,
          score: finalScore,
          clearedWords: finalClearedWords
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "점수를 저장하지 못했습니다.");
      setLeaderboard(data.leaderboard);
      setSaveState("saved");
    } catch (error) {
      setStatus(error.message || "점수를 저장하지 못했습니다.");
      setSaveState("idle");
    }
  }

  function moveActive(dx, dy) {
    if (!active || isOver) return;
    const moved = { ...active, x: active.x + dx, y: active.y + dy };
    if (canPlaceGamePiece(board, moved)) {
      setActive(moved);
      return;
    }
    if (dy > 0) lockActivePiece(active);
  }

  function stepDown() {
    moveActive(0, 1);
  }

  function rotateActive() {
    if (!active || isOver) return;
    const rotated = { ...active, rotation: (active.rotation + 1) % GAME_OFFSETS.length };
    if (canPlaceGamePiece(board, rotated)) setActive(rotated);
  }

  function hardDrop() {
    if (!active || isOver) return;
    let dropped = active;
    while (canPlaceGamePiece(board, { ...dropped, y: dropped.y + 1 })) {
      dropped = { ...dropped, y: dropped.y + 1 };
    }
    lockActivePiece(dropped);
  }

  function restartGame() {
    const emptyBoard = createEmptyGameBoard();
    const firstPair = pickGamePair(pairs);
    setBoard(emptyBoard);
    setScore(0);
    setClearedWords(0);
    setIsOver(false);
    setStatus("");
    setSaveState("idle");
    setNextPair(pickGamePair(pairs));
    setActive(firstPair ? makeGamePiece(firstPair) : null);
  }

  function lockActivePiece(piece) {
    const placedBoard = placeGamePiece(board, piece);
    const activeKeys = new Set(getGamePieceCells(piece).map((cell) => `${cell.x}:${cell.y}`));
    const resolved = resolveGameMatches(placedBoard, wordSet, activeKeys);
    const gainedScore = resolved.clearedCount * 100 + Math.max(0, resolved.chainCount - 1) * 50;
    const finalScore = score + gainedScore;
    const finalClearedWords = clearedWords + resolved.clearedCount;
    const upcomingPair = nextPair || pickGamePair(pairs);
    const nextPiece = upcomingPair ? makeGamePiece(upcomingPair) : null;

    setBoard(resolved.board);
    setScore(finalScore);
    setClearedWords(finalClearedWords);
    setStatus(resolved.clearedCount ? `${resolved.clearedCount}개 어휘 완성!` : "");
    setNextPair(pickGamePair(pairs));

    if (!nextPiece || !canPlaceGamePiece(resolved.board, nextPiece)) {
      setActive(null);
      setIsOver(true);
      saveGameScore(finalScore, finalClearedWords);
      return;
    }
    setActive(nextPiece);
  }

  const visibleBoard = useMemo(() => mergeActiveGamePiece(board, active), [board, active]);
  const nextLabel = nextPair ? nextPair.chars.join(" ") : "-";

  if (!pairs.length) {
    return (
      <article className="wordGameCard">
        <Mascot variant="book" small label="게임 준비" />
        <h2>단어 블록 게임</h2>
        <p className="mutedText">이 일차에는 게임으로 만들 수 있는 2글자 어휘가 아직 부족합니다.</p>
        <button className="btn secondary" type="button" onClick={onExit}>홈으로</button>
      </article>
    );
  }

  return (
    <section className="wordGameCard">
      <div className="gameHeader">
        <div>
          <span>초록이 단어 블록</span>
          <h2>{lesson?.day || ""}일차 게임</h2>
        </div>
        <button className="btn textBtn" type="button" onClick={onExit}>나가기</button>
      </div>
      <div className="gameScoreBar">
        <span><b>{score}</b>점</span>
        <span><b>{clearedWords}</b>개 완성</span>
        <span>다음 {nextLabel}</span>
      </div>
      <div className="gameBoardWrap">
        <div className="gameBoard" aria-label="단어 블록 판">
          {visibleBoard.flatMap((row, y) => row.map((cell, x) => (
            <span
              className={`gameCell ${cell ? "filled" : ""} ${cell?.active ? "active" : ""}`}
              key={`${x}-${y}`}
            >
              {cell?.char || ""}
            </span>
          )))}
        </div>
        {isOver ? (
          <div className="gameOverPanel" role="status">
            <strong>게임 종료</strong>
            <p>{score}점 · {clearedWords}개 어휘 완성</p>
            <button className="btn primary" type="button" onClick={restartGame}>다시 하기</button>
          </div>
        ) : null}
      </div>
      {status ? <p className="gameStatus">{status}</p> : null}
      <div className="gameControls">
        <button className="btn secondary" type="button" onClick={() => moveActive(-1, 0)} disabled={isOver}>왼쪽</button>
        <button className="btn secondary" type="button" onClick={rotateActive} disabled={isOver}>회전</button>
        <button className="btn secondary" type="button" onClick={() => moveActive(1, 0)} disabled={isOver}>오른쪽</button>
        <button className="btn primary" type="button" onClick={hardDrop} disabled={isOver}>떨어뜨리기</button>
      </div>
      <GameLeaderboard leaderboard={leaderboard} saveState={saveState} />
    </section>
  );
}

function GameLeaderboard({ leaderboard, saveState }) {
  const leaders = leaderboard?.top || [];
  return (
    <section className="gameLeaderboard" aria-label="게임 랭킹">
      <div>
        <span>게임 TOP 3</span>
        <h3>{leaderboard?.day ? `${leaderboard.day}일차 점수 랭킹` : "점수 랭킹"}</h3>
      </div>
      {saveState === "saving" ? <p className="mutedText">점수 저장 중...</p> : null}
      <div className="gameLeaderboardList">
        {leaders.length ? leaders.map((student) => (
          <article className={`leaderboardItem ${student.id === leaderboard.currentStudentId ? "mine" : ""}`} key={student.id}>
            <strong>{student.rank}위</strong>
            <div>
              <b>{student.name}</b>
              <span>{student.best_score}점 · {student.cleared_words}개 완성</span>
            </div>
          </article>
        )) : <p className="emptyLeaderboard">아직 게임 기록이 없습니다.</p>}
      </div>
    </section>
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

function mergeWrongDetails(details, item) {
  const key = `${item.word}:${item.questionType}`;
  const current = Array.isArray(details) ? details : [];
  if (current.some((detail) => `${detail.word}:${detail.questionType}` === key)) return current;
  return [...current, item];
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

function buildGamePairs(hanja) {
  const pairs = [];
  (hanja || []).forEach((item) => {
    (item.vocab || []).forEach((vocab) => {
      const chars = extractHangulChars(vocab.word).slice(0, 2);
      if (chars.length !== 2) return;
      pairs.push({
        id: vocab.id,
        word: vocab.word,
        gameWord: chars.join(""),
        chars,
        hanjaWord: vocab.hanja_word
      });
    });
  });
  const unique = new Map();
  pairs.forEach((pair) => {
    if (!unique.has(pair.gameWord)) unique.set(pair.gameWord, pair);
  });
  return [...unique.values()];
}

function extractHangulChars(value) {
  return Array.from(String(value || "").replace(/[^가-힣]/g, ""));
}

function makeGameWordSet(pairs) {
  const words = new Set();
  pairs.forEach((pair) => {
    words.add(pair.gameWord);
    words.add([...pair.chars].reverse().join(""));
  });
  return words;
}

function createEmptyGameBoard() {
  return Array.from({ length: GAME_ROWS }, () => Array.from({ length: GAME_COLUMNS }, () => null));
}

function pickGamePair(pairs) {
  if (!pairs.length) return null;
  return pairs[Math.floor(Math.random() * pairs.length)];
}

function makeGamePiece(pair) {
  return {
    x: Math.floor(GAME_COLUMNS / 2),
    y: 1,
    rotation: 2,
    chars: pair.chars
  };
}

function getGamePieceCells(piece) {
  if (!piece) return [];
  const offset = GAME_OFFSETS[piece.rotation] || GAME_OFFSETS[2];
  return [
    { x: piece.x, y: piece.y, char: piece.chars[0], active: true },
    { x: piece.x + offset.x, y: piece.y + offset.y, char: piece.chars[1], active: true }
  ];
}

function canPlaceGamePiece(board, piece) {
  return getGamePieceCells(piece).every((cell) => (
    cell.x >= 0
    && cell.x < GAME_COLUMNS
    && cell.y >= 0
    && cell.y < GAME_ROWS
    && !board[cell.y][cell.x]
  ));
}

function placeGamePiece(board, piece) {
  const nextBoard = cloneGameBoard(board);
  getGamePieceCells(piece).forEach((cell) => {
    if (cell.y >= 0 && cell.y < GAME_ROWS && cell.x >= 0 && cell.x < GAME_COLUMNS) {
      nextBoard[cell.y][cell.x] = { char: cell.char };
    }
  });
  return nextBoard;
}

function mergeActiveGamePiece(board, piece) {
  const nextBoard = cloneGameBoard(board);
  getGamePieceCells(piece).forEach((cell) => {
    if (cell.y >= 0 && cell.y < GAME_ROWS && cell.x >= 0 && cell.x < GAME_COLUMNS) {
      nextBoard[cell.y][cell.x] = { char: cell.char, active: true };
    }
  });
  return nextBoard;
}

function resolveGameMatches(board, wordSet, requiredKeys = null) {
  let workingBoard = cloneGameBoard(board);
  let clearedCount = 0;
  let chainCount = 0;

  while (true) {
    const clearKeys = new Set();
    for (let y = 0; y < GAME_ROWS; y += 1) {
      for (let x = 0; x < GAME_COLUMNS; x += 1) {
        const cell = workingBoard[y][x];
        if (!cell) continue;
        const right = x + 1 < GAME_COLUMNS ? workingBoard[y][x + 1] : null;
        const down = y + 1 < GAME_ROWS ? workingBoard[y + 1][x] : null;
        if (right && wordSet.has(`${cell.char}${right.char}`)) {
          addGameMatch(clearKeys, `${x}:${y}`, `${x + 1}:${y}`, requiredKeys, chainCount);
        }
        if (down && wordSet.has(`${cell.char}${down.char}`)) {
          addGameMatch(clearKeys, `${x}:${y}`, `${x}:${y + 1}`, requiredKeys, chainCount);
        }
      }
    }
    if (!clearKeys.size) break;
    chainCount += 1;
    clearedCount += Math.floor(clearKeys.size / 2);
    clearKeys.forEach((key) => {
      const [x, y] = key.split(":").map(Number);
      workingBoard[y][x] = null;
    });
    workingBoard = applyGameGravity(workingBoard);
  }

  return { board: workingBoard, clearedCount, chainCount };
}

function addGameMatch(clearKeys, firstKey, secondKey, requiredKeys, chainCount) {
  if (requiredKeys && chainCount === 0) {
    const firstIsNew = requiredKeys.has(firstKey);
    const secondIsNew = requiredKeys.has(secondKey);
    if (!firstIsNew && !secondIsNew) return;
    if (firstIsNew && secondIsNew) return;
  }
  clearKeys.add(firstKey);
  clearKeys.add(secondKey);
}

function applyGameGravity(board) {
  const nextBoard = createEmptyGameBoard();
  for (let x = 0; x < GAME_COLUMNS; x += 1) {
    const blocks = [];
    for (let y = GAME_ROWS - 1; y >= 0; y -= 1) {
      if (board[y][x]) blocks.push(board[y][x]);
    }
    blocks.forEach((block, index) => {
      nextBoard[GAME_ROWS - 1 - index][x] = block;
    });
  }
  return nextBoard;
}

function cloneGameBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
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
