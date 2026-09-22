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

  function startGame(gameType = "gameMenu") {
    setFeedback(null);
    setStage(gameType);
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
    if (stage === "gameMenu") {
      setStage("home");
      return;
    }
    if (stage === "game" || stage === "runner" || stage === "crossword" || stage === "apple") {
      setStage("gameMenu");
      return;
    }
    if (stage === "gameMenu") {
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
              {stage === "home" ? <GameLearningButton onOpen={() => startGame("gameMenu")} /> : null}
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
              {stage === "gameMenu" ? <GameMenu onBlockGame={() => startGame("game")} onRunnerGame={() => startGame("runner")} onCrosswordGame={() => startGame("crossword")} onAppleGame={() => startGame("apple")} /> : null}
              {stage === "game" ? <WordBlockGame hanja={payload.gameHanja || payload.hanja} lesson={payload.lesson} onExit={goHome} /> : null}
              {stage === "runner" ? <WordRunnerGame hanja={payload.gameHanja || payload.hanja} lesson={payload.lesson} onExit={goHome} /> : null}
              {stage === "crossword" ? <CrosswordBattleGame hanja={payload.gameHanja || payload.hanja} lesson={payload.lesson} onExit={goHome} /> : null}
              {stage === "apple" ? <WordAppleGame hanja={payload.gameHanja || payload.hanja} lesson={payload.lesson} onExit={goHome} /> : null}
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

function GameLearningButton({ onOpen }) {
  return (
    <div className="gameHeroAction">
      <button className="btn primary gameStartBtn" type="button" onClick={onOpen}>게임 학습</button>
    </div>
  );
}

function GameMenu({ onBlockGame, onRunnerGame, onCrosswordGame, onAppleGame }) {
  return (
    <section className="gameMenuGrid" aria-label="게임 선택">
      <button className="gameMenuCard" type="button" onClick={onBlockGame}>
        <span>단어 블록</span>
        <strong>이어 붙이면 단어가 터져요</strong>
      </button>
      <button className="gameMenuCard runner" type="button" onClick={onRunnerGame}>
        <span>빙하 달리기</span>
        <strong>정답 단어 카드를 피해 없이 먹어요</strong>
      </button>
      <button className="gameMenuCard crossword" type="button" onClick={onCrosswordGame}>
        <span>배틀가로세로</span>
        <strong>뜻 힌트를 보고 가로세로 어휘를 완성해요</strong>
      </button>
      <button className="gameMenuCard apple" type="button" onClick={onAppleGame}>
        <span>단어 사과</span>
        <strong>글자를 드래그해 배운 어휘를 찾아요</strong>
      </button>
    </section>
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
const RUNNER_LANES = 3;
const RUNNER_TICK_MS = 95;

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
  const [matchAnimation, setMatchAnimation] = useState(null);
  const matchTimerRef = useRef(null);

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
    setMatchAnimation(null);
    window.clearTimeout(matchTimerRef.current);
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
        const response = await fetch(`/api/student/game-score?gameType=block&level=${encodeURIComponent(lesson.level)}&day=${lesson.day}`, { cache: "no-store" });
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

  useEffect(() => () => {
    window.clearTimeout(matchTimerRef.current);
  }, []);

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
          gameType: "block",
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
    if (!active || isOver || matchAnimation) return;
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
    if (!active || isOver || matchAnimation) return;
    const rotated = { ...active, rotation: (active.rotation + 1) % GAME_OFFSETS.length };
    if (canPlaceGamePiece(board, rotated)) setActive(rotated);
  }

  function hardDrop() {
    if (!active || isOver || matchAnimation) return;
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
    setMatchAnimation(null);
    window.clearTimeout(matchTimerRef.current);
    setNextPair(pickGamePair(pairs));
    setActive(firstPair ? makeGamePiece(firstPair) : null);
  }

  function lockActivePiece(piece) {
    const placedBoard = placeGamePiece(board, piece);
    const activeKeys = new Set(getGamePieceCells(piece).map((cell) => `${cell.x}:${cell.y}`));
    const resolved = resolveGameMatches(placedBoard, wordSet, activeKeys);
    const gainedScore = resolved.clearedCount * 100;
    const finalScore = score + gainedScore;
    const finalClearedWords = clearedWords + resolved.clearedCount;
    const upcomingPair = nextPair || pickGamePair(pairs);
    const nextPiece = upcomingPair ? makeGamePiece(upcomingPair) : null;

    const finishPlacement = () => {
      setBoard(resolved.board);
      setScore(finalScore);
      setClearedWords(finalClearedWords);
      setMatchAnimation(null);
      setNextPair(pickGamePair(pairs));

      if (!nextPiece || !canPlaceGamePiece(resolved.board, nextPiece)) {
        setActive(null);
        setIsOver(true);
        saveGameScore(finalScore, finalClearedWords);
        return;
      }
      setActive(nextPiece);
    };

    if (resolved.clearedCount) {
      const matchedLabel = resolved.matchedWords.join(", ");
      setBoard(placedBoard);
      setActive(null);
      setMatchAnimation({ keys: resolved.clearKeys, label: matchedLabel });
      setStatus(`${matchedLabel} 완성!`);
      window.clearTimeout(matchTimerRef.current);
      matchTimerRef.current = window.setTimeout(finishPlacement, 520);
      return;
    }

    setStatus("");
    finishPlacement();
  }

  const visibleBoard = useMemo(() => mergeActiveGamePiece(board, active), [board, active]);
  const matchedKeys = matchAnimation?.keys || [];
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
              className={`gameCell ${cell ? "filled" : ""} ${cell?.active ? "active" : ""} ${matchedKeys.includes(`${x}:${y}`) ? "matched" : ""}`}
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
        <button className="btn secondary" type="button" onClick={() => moveActive(-1, 0)} disabled={isOver || Boolean(matchAnimation)}>왼쪽</button>
        <button className="btn secondary" type="button" onClick={rotateActive} disabled={isOver || Boolean(matchAnimation)}>회전</button>
        <button className="btn secondary" type="button" onClick={() => moveActive(1, 0)} disabled={isOver || Boolean(matchAnimation)}>오른쪽</button>
        <button className="btn primary" type="button" onClick={hardDrop} disabled={isOver || Boolean(matchAnimation)}>떨어뜨리기</button>
      </div>
      <GameLeaderboard leaderboard={leaderboard} saveState={saveState} />
    </section>
  );
}

function WordRunnerGame({ hanja, lesson, onExit }) {
  const questions = useMemo(() => buildRunnerQuestions(hanja), [hanja]);
  const [currentRound, setCurrentRound] = useState(null);
  const [lane, setLane] = useState(1);
  const [isJumping, setIsJumping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState(0);
  const [clearedWords, setClearedWords] = useState(0);
  const [isOver, setIsOver] = useState(false);
  const [status, setStatus] = useState("");
  const [leaderboard, setLeaderboard] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const laneRef = useRef(1);
  const jumpRef = useRef(false);
  const jumpGraceUntilRef = useRef(0);
  const roundRef = useRef(null);
  const scoreRef = useRef(0);
  const clearedRef = useRef(0);
  const resolvingRef = useRef(false);
  const jumpTimerRef = useRef(null);
  const roundTimerRef = useRef(null);

  useEffect(() => {
    laneRef.current = lane;
  }, [lane]);

  useEffect(() => {
    jumpRef.current = isJumping;
  }, [isJumping]);

  useEffect(() => {
    if (questions.length < RUNNER_LANES) return;
    resetRunner();
    return () => {
      window.clearTimeout(jumpTimerRef.current);
      window.clearTimeout(roundTimerRef.current);
    };
  }, [questions]);

  useEffect(() => {
    let ignore = false;
    async function loadLeaderboard() {
      if (!lesson?.level || !lesson?.day) return;
      try {
        const response = await fetch(`/api/student/game-score?gameType=runner&level=${encodeURIComponent(lesson.level)}&day=${lesson.day}`, { cache: "no-store" });
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
    if (!currentRound || isOver || resolvingRef.current) return undefined;
    const timer = window.setInterval(() => {
      setProgress((previous) => {
        const next = Math.min(100, previous + 2.4);
        if (next >= 100) window.setTimeout(resolveRunnerRound, 0);
        return next;
      });
    }, RUNNER_TICK_MS);
    return () => window.clearInterval(timer);
  }, [currentRound, isOver]);

  function resetRunner() {
    window.clearTimeout(jumpTimerRef.current);
    window.clearTimeout(roundTimerRef.current);
    const firstRound = makeRunnerRound(questions);
    setLane(1);
    laneRef.current = 1;
    setIsJumping(false);
    jumpRef.current = false;
    jumpGraceUntilRef.current = 0;
    setProgress(0);
    setScore(0);
    scoreRef.current = 0;
    setClearedWords(0);
    clearedRef.current = 0;
    setIsOver(false);
    setStatus("");
    setSaveState("idle");
    resolvingRef.current = false;
    setCurrentRound(firstRound);
    roundRef.current = firstRound;
  }

  function moveRunner(direction) {
    if (isOver || resolvingRef.current) return;
    setLane((previous) => Math.min(RUNNER_LANES - 1, Math.max(0, previous + direction)));
  }

  function jumpRunner() {
    if (isOver || resolvingRef.current || isJumping) return;
    setIsJumping(true);
    jumpRef.current = true;
    jumpGraceUntilRef.current = Date.now() + 1050;
    window.clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = window.setTimeout(() => {
      setIsJumping(false);
      jumpRef.current = false;
    }, 620);
  }

  function startNextRunnerRound() {
    const nextRound = makeRunnerRound(questions);
    setCurrentRound(nextRound);
    roundRef.current = nextRound;
    setProgress(0);
    resolvingRef.current = false;
  }

  function resolveRunnerRound() {
    if (resolvingRef.current || isOver) return;
    resolvingRef.current = true;
    const round = roundRef.current;
    if (!round) return;
    const reachedCorrectLane = laneRef.current === round.correctLane;
    const jumpWasRecent = jumpRef.current || Date.now() <= jumpGraceUntilRef.current;
    const reachedHeight = round.needsJump ? jumpWasRecent : !jumpRef.current;
    if (reachedCorrectLane && reachedHeight) {
      const finalScore = scoreRef.current + 100;
      const finalCleared = clearedRef.current + 1;
      scoreRef.current = finalScore;
      clearedRef.current = finalCleared;
      setScore(finalScore);
      setClearedWords(finalCleared);
      setStatus(`${round.answer} 획득!`);
      window.clearTimeout(roundTimerRef.current);
      roundTimerRef.current = window.setTimeout(startNextRunnerRound, 430);
      return;
    }
    setIsOver(true);
    setStatus(reachedCorrectLane ? (round.needsJump ? "점프가 필요했어요!" : "낮은 카드는 점프하지 않아야 해요.") : `${round.answer} 카드를 골라야 했어요.`);
    saveRunnerScore(scoreRef.current, clearedRef.current);
  }

  async function saveRunnerScore(finalScore, finalClearedWords) {
    if (!lesson?.level || !lesson?.day || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/student/game-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "runner",
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

  if (questions.length < RUNNER_LANES) {
    return (
      <article className="wordGameCard">
        <Mascot variant="study" small label="달리기 준비" />
        <h2>빙하 달리기</h2>
        <p className="mutedText">이 게임에 사용할 어휘가 아직 부족합니다. 3개 이상의 어휘가 필요해요.</p>
        <button className="btn secondary" type="button" onClick={onExit}>홈으로</button>
      </article>
    );
  }

  return (
    <section className="wordGameCard runnerGameCard">
      <div className="gameHeader">
        <div>
          <span>초록이 빙하 달리기</span>
          <h2>{lesson?.day || ""}일차 게임</h2>
        </div>
        <button className="btn textBtn" type="button" onClick={onExit}>나가기</button>
      </div>
      <div className="gameScoreBar">
        <span><b>{score}</b>점</span>
        <span><b>{clearedWords}</b>개 획득</span>
        <span>정답 카드 찾기</span>
      </div>
      <article className="runnerPrompt">
        <span>{currentRound?.type === "blank" ? "문장 빈칸" : "뜻 고르기"}</span>
        <strong>{currentRound?.prompt}</strong>
      </article>
      <div className="runnerTrack" aria-label="빙하 달리기">
        <span className="runnerMountains" aria-hidden="true" />
        <span className="runnerIce ice-a" aria-hidden="true" />
        <span className="runnerIce ice-b" aria-hidden="true" />
        <span className="runnerWater water-a" aria-hidden="true" />
        <span className="runnerWater water-b" aria-hidden="true" />
        {Array.from({ length: RUNNER_LANES }).map((_, index) => (
          <span className="runnerLane" key={index} />
        ))}
        <div className="runnerCards" style={{ "--runner-y": `${progress * 2.65}px`, "--runner-scale": `${progress * 0.0048}` }}>
          {currentRound?.choices.map((choice, index) => (
            <span className={`runnerCard ${currentRound.highLanes?.includes(index) ? "high" : ""}`} key={`${choice}-${index}`}>
              {choice}
            </span>
          ))}
        </div>
        <div className={`runnerPlayer lane-${lane} ${isJumping ? "jumping" : ""}`} aria-label="초록이">
          <div className="runnerBack" aria-hidden="true">
            <span className="runnerCap" />
            <span className="runnerHead" />
            <span className="runnerBody" />
            <span className="runnerFoot left" />
            <span className="runnerFoot right" />
          </div>
        </div>
        {isOver ? (
          <div className="gameOverPanel" role="status">
            <strong>게임 종료</strong>
            <p>{score}점 · {clearedWords}개 단어 획득</p>
            <button className="btn primary" type="button" onClick={resetRunner}>다시 하기</button>
          </div>
        ) : null}
      </div>
      {status ? <p className="gameStatus">{status}</p> : null}
      <div className="runnerControls">
        <button className="btn secondary" type="button" onClick={() => moveRunner(-1)} disabled={isOver}>왼쪽</button>
        <button className="btn primary" type="button" onClick={jumpRunner} disabled={isOver}>점프</button>
        <button className="btn secondary" type="button" onClick={() => moveRunner(1)} disabled={isOver}>오른쪽</button>
      </div>
      <GameLeaderboard leaderboard={leaderboard} saveState={saveState} />
    </section>
  );
}

function CrosswordBattleGame({ hanja, lesson, onExit }) {
  const puzzle = useMemo(() => buildCrosswordPuzzle(hanja), [hanja]);
  const [solved, setSolved] = useState({});
  const [activeId, setActiveId] = useState("");
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [status, setStatus] = useState("");
  const [isOver, setIsOver] = useState(false);
  const [leaderboard, setLeaderboard] = useState(null);
  const [saveState, setSaveState] = useState("idle");

  const activeEntry = puzzle.entries.find((entry) => entry.id === activeId) || puzzle.entries[0] || null;
  const solvedCount = Object.keys(solved).length;

  useEffect(() => {
    const firstEntry = puzzle.entries[0]?.id || "";
    setSolved({});
    setActiveId(firstEntry);
    setAnswer("");
    setScore(0);
    setTimeLeft(120);
    setStatus("");
    setIsOver(false);
    setSaveState("idle");
  }, [puzzle]);

  useEffect(() => {
    let ignore = false;
    async function loadLeaderboard() {
      if (!lesson?.level || !lesson?.day) return;
      try {
        const response = await fetch(`/api/student/game-score?gameType=crossword&level=${encodeURIComponent(lesson.level)}&day=${lesson.day}`, { cache: "no-store" });
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
    if (isOver || !puzzle.entries.length) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          finishGame(score, solvedCount);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOver, puzzle.entries.length, score, solvedCount]);

  function selectEntry(entryId) {
    if (isOver) return;
    setActiveId(entryId);
    setAnswer("");
    setStatus("");
  }

  function submitCrosswordAnswer(event) {
    event.preventDefault();
    if (!activeEntry || isOver || solved[activeEntry.id]) return;
    const normalizedAnswer = normalizeGameAnswer(answer);
    if (!normalizedAnswer) return;
    if (normalizedAnswer !== normalizeGameAnswer(activeEntry.word)) {
      setScore((previous) => Math.max(0, previous - 20));
      setStatus("아쉬워요. 힌트를 다시 보고 도전해요.");
      setAnswer("");
      return;
    }
    const nextSolved = { ...solved, [activeEntry.id]: true };
    const nextSolvedCount = Object.keys(nextSolved).length;
    const nextScore = score + 100 + Math.max(0, Math.floor(timeLeft / 5));
    setSolved(nextSolved);
    setScore(nextScore);
    setStatus(`${activeEntry.word} 정답!`);
    setAnswer("");
    const nextEntry = puzzle.entries.find((entry) => !nextSolved[entry.id]);
    if (nextEntry) {
      setActiveId(nextEntry.id);
      return;
    }
    finishGame(nextScore, nextSolvedCount);
  }

  function restartCrossword() {
    const firstEntry = puzzle.entries[0]?.id || "";
    setSolved({});
    setActiveId(firstEntry);
    setAnswer("");
    setScore(0);
    setTimeLeft(120);
    setStatus("");
    setIsOver(false);
    setSaveState("idle");
  }

  async function finishGame(finalScore, finalSolvedCount) {
    if (isOver) return;
    setIsOver(true);
    if (!lesson?.level || !lesson?.day || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/student/game-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "crossword",
          level: lesson.level,
          day: lesson.day,
          score: finalScore,
          clearedWords: finalSolvedCount
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

  if (!puzzle.entries.length) {
    return (
      <article className="wordGameCard">
        <Mascot variant="search" small label="가로세로" />
        <h2>배틀가로세로</h2>
        <p className="mutedText">가로세로 판을 만들 2글자 이상 어휘가 아직 부족합니다.</p>
        <button className="btn secondary" type="button" onClick={onExit}>홈으로</button>
      </article>
    );
  }

  return (
    <section className="wordGameCard crosswordGameCard">
      <div className="gameHeader">
        <div>
          <span>초록이 배틀가로세로</span>
          <h2>{lesson?.day || ""}일차 게임</h2>
        </div>
        <button className="btn textBtn" type="button" onClick={onExit}>나가기</button>
      </div>
      <div className="gameScoreBar">
        <span><b>{score}</b>점</span>
        <span><b>{solvedCount}</b> / {puzzle.entries.length}개</span>
        <span><b>{timeLeft}</b>초</span>
      </div>
      <div className="crosswordBattle">
        <div className="crosswordBoard" style={{ "--crossword-size": puzzle.size }} aria-label="배틀가로세로 판">
          {puzzle.cells.flat().map((cell) => {
            const isActive = activeEntry && cell.entryIds.includes(activeEntry.id);
            const isSolvedCell = cell.entryIds.some((entryId) => solved[entryId]);
            return (
              <button
                className={`crosswordCell ${cell.char ? "filled" : "empty"} ${isActive ? "active" : ""} ${isSolvedCell ? "solved" : ""}`}
                disabled={!cell.char || isOver}
                key={`${cell.row}-${cell.col}`}
                type="button"
                onClick={() => cell.entryIds[0] && selectEntry(cell.entryIds[0])}
              >
                {cell.number ? <small>{cell.number}</small> : null}
                <span>{isSolvedCell ? cell.char : ""}</span>
              </button>
            );
          })}
        </div>
        <aside className="crosswordClues" aria-label="가로세로 힌트">
          <div>
            <span>힌트</span>
            <h3>{activeEntry ? `${activeEntry.number}. ${activeEntry.direction === "across" ? "가로" : "세로"}` : "선택"}</h3>
            <p>{activeEntry?.meaning || "힌트를 선택해 주세요."}</p>
          </div>
          <form className="crosswordAnswerForm" onSubmit={submitCrosswordAnswer}>
            <input
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="정답 어휘"
              disabled={isOver || !activeEntry || solved[activeEntry.id]}
            />
            <button className="btn primary" type="submit" disabled={isOver || !activeEntry || solved[activeEntry.id]}>입력</button>
          </form>
          <div className="crosswordClueList">
            {puzzle.entries.map((entry) => (
              <button
                className={`${entry.id === activeId ? "active" : ""} ${solved[entry.id] ? "solved" : ""}`}
                key={entry.id}
                type="button"
                onClick={() => selectEntry(entry.id)}
                disabled={isOver}
              >
                <b>{entry.number}. {entry.direction === "across" ? "가로" : "세로"}</b>
                <span>{entry.meaning}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
      {status ? <p className="gameStatus">{status}</p> : null}
      {isOver ? (
        <div className="crosswordResult" role="status">
          <strong>{solvedCount >= puzzle.entries.length ? "가로세로 완성!" : "게임 종료"}</strong>
          <p>{score}점 · {solvedCount}개 어휘 완성</p>
          <button className="btn secondary" type="button" onClick={restartCrossword}>다시 하기</button>
        </div>
      ) : null}
      <GameLeaderboard leaderboard={leaderboard} saveState={saveState} />
    </section>
  );
}

function WordAppleGame({ hanja, lesson, onExit }) {
  const puzzle = useMemo(() => buildAppleWordPuzzle(hanja), [hanja]);
  const [removed, setRemoved] = useState({});
  const [selection, setSelection] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [score, setScore] = useState(0);
  const [foundWords, setFoundWords] = useState([]);
  const [timeLeft, setTimeLeft] = useState(90);
  const [status, setStatus] = useState("");
  const [isOver, setIsOver] = useState(false);
  const [leaderboard, setLeaderboard] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const foundSet = useMemo(() => new Set(foundWords), [foundWords]);

  useEffect(() => {
    setRemoved({});
    setSelection([]);
    setIsDragging(false);
    setScore(0);
    setFoundWords([]);
    setTimeLeft(90);
    setStatus("");
    setIsOver(false);
    setSaveState("idle");
  }, [puzzle]);

  useEffect(() => {
    let ignore = false;
    async function loadLeaderboard() {
      if (!lesson?.level || !lesson?.day) return;
      try {
        const response = await fetch(`/api/student/game-score?gameType=apple&level=${encodeURIComponent(lesson.level)}&day=${lesson.day}`, { cache: "no-store" });
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
    if (isOver || !puzzle.words.length) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          finishAppleGame(score, foundWords.length);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOver, puzzle.words.length, score, foundWords.length]);

  useEffect(() => {
    function handlePointerUp() {
      if (isDragging) finishSelection();
    }
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [isDragging, selection, removed, score, foundWords, timeLeft]);

  function startSelection(cell) {
    if (isOver || removed[cell.id]) return;
    setSelection([cell.id]);
    setIsDragging(true);
    setStatus("");
  }

  function addSelection(cell) {
    if (!isDragging || isOver || removed[cell.id]) return;
    setSelection((previous) => {
      if (previous.includes(cell.id)) return previous;
      const lastCell = puzzle.cellMap.get(previous[previous.length - 1]);
      if (!lastCell || !areNeighborCells(lastCell, cell)) return previous;
      return [...previous, cell.id];
    });
  }

  function moveSelection(event) {
    if (!isDragging || isOver) return;
    event.preventDefault();
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-apple-cell-id]");
    const cellId = element?.getAttribute?.("data-apple-cell-id");
    const cell = cellId ? puzzle.cellMap.get(cellId) : null;
    if (cell) addSelection(cell);
  }

  function finishSelection() {
    setIsDragging(false);
    if (!selection.length) return;
    const selectedCells = selection.map((id) => puzzle.cellMap.get(id)).filter(Boolean);
    const selectedWord = selectedCells.map((cell) => cell.char).join("");
    const reversedWord = selectedCells.map((cell) => cell.char).reverse().join("");
    const matchedWord = puzzle.wordSet.has(selectedWord) ? selectedWord : puzzle.wordSet.has(reversedWord) ? reversedWord : "";
    if (!matchedWord || foundSet.has(matchedWord)) {
      setStatus("배운 어휘가 아니에요. 다시 드래그해요.");
      setSelection([]);
      return;
    }
    const nextRemoved = { ...removed };
    selectedCells.forEach((cell) => {
      nextRemoved[cell.id] = true;
    });
    const nextFoundWords = [...foundWords, matchedWord];
    const nextScore = score + (matchedWord.length * 60) + Math.max(0, Math.floor(timeLeft / 6));
    setRemoved(nextRemoved);
    setFoundWords(nextFoundWords);
    setScore(nextScore);
    setSelection([]);
    setStatus(`${matchedWord} 발견!`);
    if (nextFoundWords.length >= puzzle.words.length) finishAppleGame(nextScore, nextFoundWords.length);
  }

  function restartAppleGame() {
    setRemoved({});
    setSelection([]);
    setIsDragging(false);
    setScore(0);
    setFoundWords([]);
    setTimeLeft(90);
    setStatus("");
    setIsOver(false);
    setSaveState("idle");
  }

  async function finishAppleGame(finalScore, finalFoundCount) {
    if (isOver) return;
    setIsOver(true);
    if (!lesson?.level || !lesson?.day || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/student/game-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "apple",
          level: lesson.level,
          day: lesson.day,
          score: finalScore,
          clearedWords: finalFoundCount
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

  if (!puzzle.words.length) {
    return (
      <article className="wordGameCard">
        <Mascot variant="search" small label="단어 사과" />
        <h2>단어 사과</h2>
        <p className="mutedText">드래그할 2글자 이상 어휘가 아직 부족합니다.</p>
        <button className="btn secondary" type="button" onClick={onExit}>홈으로</button>
      </article>
    );
  }

  return (
    <section className="wordGameCard appleGameCard">
      <div className="gameHeader">
        <div>
          <span>초록이 단어 사과</span>
          <h2>{lesson?.day || ""}일차 게임</h2>
        </div>
        <button className="btn textBtn" type="button" onClick={onExit}>나가기</button>
      </div>
      <div className="gameScoreBar">
        <span><b>{score}</b>점</span>
        <span><b>{foundWords.length}</b> / {puzzle.words.length}개</span>
        <span><b>{timeLeft}</b>초</span>
      </div>
      <div
        className="appleBoard"
        style={{ "--apple-size": puzzle.size }}
        onPointerMove={moveSelection}
        onPointerLeave={() => isDragging && finishSelection()}
      >
        {puzzle.cells.flat().map((cell) => {
          const selected = selection.includes(cell.id);
          return (
            <button
              className={`appleCell ${selected ? "selected" : ""} ${removed[cell.id] ? "removed" : ""}`}
              disabled={isOver || removed[cell.id]}
              data-apple-cell-id={cell.id}
              key={cell.id}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                startSelection(cell);
              }}
            >
              {cell.char}
            </button>
          );
        })}
      </div>
      <div className="appleFoundWords" aria-label="찾은 어휘">
        {foundWords.length ? foundWords.map((word) => <span key={word}>{word}</span>) : <span>드래그해서 배운 어휘를 찾아요</span>}
      </div>
      {status ? <p className="gameStatus">{status}</p> : null}
      {isOver ? (
        <div className="crosswordResult" role="status">
          <strong>{foundWords.length >= puzzle.words.length ? "모든 어휘 발견!" : "게임 종료"}</strong>
          <p>{score}점 · {foundWords.length}개 어휘 발견</p>
          <button className="btn secondary" type="button" onClick={restartAppleGame}>다시 하기</button>
        </div>
      ) : null}
      <GameLeaderboard leaderboard={leaderboard} saveState={saveState} />
    </section>
  );
}

function WordChainGame({ hanja, lesson, onExit }) {
  const chainData = useMemo(() => buildChainData(hanja), [hanja]);
  const [target, setTarget] = useState("");
  const [orb, setOrb] = useState(null);
  const [decoys, setDecoys] = useState([]);
  const [head, setHead] = useState({ x: 50, y: 50 });
  const [direction, setDirection] = useState({ x: 1, y: 0 });
  const [tail, setTail] = useState([]);
  const [score, setScore] = useState(0);
  const [clearedWords, setClearedWords] = useState(0);
  const [isOver, setIsOver] = useState(false);
  const [status, setStatus] = useState("");
  const [leaderboard, setLeaderboard] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const headRef = useRef({ x: 50, y: 50 });
  const directionRef = useRef({ x: 1, y: 0 });
  const orbRef = useRef(null);
  const decoysRef = useRef([]);
  const isOverRef = useRef(false);
  const scoreRef = useRef(0);
  const clearedRef = useRef(0);
  const targetRef = useRef("");
  const tailRef = useRef([]);

  useEffect(() => {
    if (!chainData.starts.length) return;
    restartChain();
  }, [chainData]);

  useEffect(() => {
    let ignore = false;
    async function loadLeaderboard() {
      if (!lesson?.level || !lesson?.day) return;
      try {
        const response = await fetch(`/api/student/game-score?gameType=chain&level=${encodeURIComponent(lesson.level)}&day=${lesson.day}`, { cache: "no-store" });
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
    if (!chainData.starts.length || isOver) return undefined;
    const timer = window.setInterval(() => {
      moveChainHead();
    }, 95);
    return () => window.clearInterval(timer);
  }, [chainData, isOver]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowUp") setChainDirection({ x: 0, y: -1 });
      if (event.key === "ArrowDown") setChainDirection({ x: 0, y: 1 });
      if (event.key === "ArrowLeft") setChainDirection({ x: -1, y: 0 });
      if (event.key === "ArrowRight") setChainDirection({ x: 1, y: 0 });
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function restartChain() {
    const start = pickChainStart(chainData);
    const nextOrb = makeChainOrb(start, chainData);
    const startHead = { x: 50, y: 50 };
    const startDirection = { x: 1, y: 0 };
    setTarget(start);
    targetRef.current = start;
    setTail([start]);
    tailRef.current = [start];
    setHead(startHead);
    headRef.current = startHead;
    setDirection(startDirection);
    directionRef.current = startDirection;
    setOrb(nextOrb.orb);
    orbRef.current = nextOrb.orb;
    setDecoys(nextOrb.decoys);
    decoysRef.current = nextOrb.decoys;
    setScore(0);
    scoreRef.current = 0;
    setClearedWords(0);
    clearedRef.current = 0;
    setIsOver(false);
    isOverRef.current = false;
    setStatus("");
    setSaveState("idle");
  }

  function setChainDirection(nextDirection) {
    if (isOverRef.current) return;
    setDirection(nextDirection);
    directionRef.current = nextDirection;
  }

  function moveChainHead() {
    if (isOverRef.current || !orbRef.current) return;
    const current = headRef.current;
    const currentDirection = directionRef.current;
    const nextHead = {
      x: clampNumber(current.x + currentDirection.x * 2.8, 6, 94),
      y: clampNumber(current.y + currentDirection.y * 2.8, 9, 91)
    };
    headRef.current = nextHead;
    setHead(nextHead);
    if (distancePercent(nextHead, orbRef.current) < 6.4) {
      eatChainOrb();
      return;
    }
    if (decoysRef.current.some((item) => distancePercent(nextHead, item) < 5.8)) {
      setIsOver(true);
      isOverRef.current = true;
      setStatus("다른 음절에 닿았어요. 다시 도전해요!");
      saveChainScore(scoreRef.current, clearedRef.current);
    }
  }

  function eatChainOrb() {
    const currentOrb = orbRef.current;
    if (!currentOrb) return;
    const candidates = chainData.byStart.get(targetRef.current) || [];
    const match = candidates.find((item) => item.next === currentOrb.char);
    if (!match) {
      setIsOver(true);
      isOverRef.current = true;
      setStatus(`${targetRef.current}${currentOrb.char}는 배운 어휘가 아니에요.`);
      saveChainScore(scoreRef.current, clearedRef.current);
      return;
    }
    const nextScore = scoreRef.current + 100;
    const nextCleared = clearedRef.current + 1;
    const nextTail = [...tailRef.current, currentOrb.char].slice(-12);
    scoreRef.current = nextScore;
    clearedRef.current = nextCleared;
    tailRef.current = nextTail;
    setScore(nextScore);
    setClearedWords(nextCleared);
    setTail(nextTail);
    setStatus(`${match.word} 완성!`);
    const nextTarget = currentOrb.char;
    const nextOrb = makeChainOrb(nextTarget, chainData);
    if (nextOrb.orb) {
      setTarget(nextTarget);
      targetRef.current = nextTarget;
      setOrb(nextOrb.orb);
      orbRef.current = nextOrb.orb;
      setDecoys(nextOrb.decoys);
      decoysRef.current = nextOrb.decoys;
      return;
    }
    const nextStart = pickChainStart(chainData, nextTarget);
    const restartOrb = makeChainOrb(nextStart, chainData);
    const continuedTail = [...nextTail, nextStart].slice(-12);
    tailRef.current = continuedTail;
    setTail(continuedTail);
    setTarget(nextStart);
    targetRef.current = nextStart;
    setOrb(restartOrb.orb);
    orbRef.current = restartOrb.orb;
    setDecoys(restartOrb.decoys);
    decoysRef.current = restartOrb.decoys;
    setStatus(`${match.word} 완성! ${nextStart}부터 계속 이어가요.`);
  }

  async function saveChainScore(finalScore, finalClearedWords) {
    if (!lesson?.level || !lesson?.day || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/student/game-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "chain",
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

  if (!chainData.starts.length) {
    return (
      <article className="wordGameCard">
        <Mascot variant="curious" small label="꼬리 준비" />
        <h2>꼬리물기</h2>
        <p className="mutedText">이어 먹을 수 있는 2글자 이상 어휘가 아직 부족합니다.</p>
        <button className="btn secondary" type="button" onClick={onExit}>홈으로</button>
      </article>
    );
  }

  return (
    <section className="wordGameCard chainGameCard">
      <div className="gameHeader">
        <div>
          <span>초록이 꼬리물기</span>
          <h2>{lesson?.day || ""}일차 게임</h2>
        </div>
        <button className="btn textBtn" type="button" onClick={onExit}>나가기</button>
      </div>
      <div className="gameScoreBar">
        <span><b>{score}</b>점</span>
        <span><b>{clearedWords}</b>개 연결</span>
        <span>현재 {target}</span>
      </div>
      <div className="chainArena">
        <div className="chainSpace" aria-label="꼬리물기 공간">
          {decoys.map((item) => (
            <span className="chainOrb decoy" key={item.id} style={{ left: `${item.x}%`, top: `${item.y}%` }}>{item.char}</span>
          ))}
          {orb ? <span className="chainOrb targetOrb" style={{ left: `${orb.x}%`, top: `${orb.y}%` }}>{orb.char}</span> : null}
          <div className="chainWorm" style={{ left: `${head.x}%`, top: `${head.y}%` }}>
            {tail.map((item, index) => (
              <span
                className={`chainSegment ${index + 1 === tail.length ? "head" : ""}`}
                key={`${item}-${index}`}
                style={{
                  "--segment-index": tail.length - index - 1,
                  "--segment-x": `${direction.x * -1 * (tail.length - index - 1) * 12}px`,
                  "--segment-y": `${direction.y * -1 * (tail.length - index - 1) * 12}px`
                }}
              >
                {item}
              </span>
            ))}
          </div>
          {isOver ? (
            <div className="gameOverPanel" role="status">
              <strong>게임 종료</strong>
              <p>{score}점 · {clearedWords}개 단어 연결</p>
              <button className="btn primary" type="button" onClick={restartChain}>다시 하기</button>
            </div>
          ) : null}
        </div>
        <div className="chainControls" aria-label="이동 컨트롤">
          <button className="chainPadButton up" type="button" onClick={() => setChainDirection({ x: 0, y: -1 })} disabled={isOver} aria-label="위">▲</button>
          <button className="chainPadButton left" type="button" onClick={() => setChainDirection({ x: -1, y: 0 })} disabled={isOver} aria-label="왼쪽">◀</button>
          <span className="chainPadCenter" aria-hidden="true" />
          <button className="chainPadButton right" type="button" onClick={() => setChainDirection({ x: 1, y: 0 })} disabled={isOver} aria-label="오른쪽">▶</button>
          <button className="chainPadButton down" type="button" onClick={() => setChainDirection({ x: 0, y: 1 })} disabled={isOver} aria-label="아래">▼</button>
        </div>
      </div>
      {status ? <p className="gameStatus">{status}</p> : null}
      <GameLeaderboard leaderboard={leaderboard} saveState={saveState} />
    </section>
  );
}

function GameLeaderboard({ leaderboard, saveState }) {
  const scopes = leaderboard?.scopes || [];
  const [activeScopeKey, setActiveScopeKey] = useState("all");
  const activeScope = scopes.find((scope) => scope.key === activeScopeKey) || scopes[0];
  const leaders = activeScope?.top || [];
  if (!scopes.length || !activeScope) {
    return (
      <section className="gameLeaderboard" aria-label="게임 랭킹">
        <div>
          <span>게임 TOP 3</span>
          <h3>점수 랭킹</h3>
        </div>
        {saveState === "saving" ? <p className="mutedText">점수 저장 중...</p> : <p className="emptyLeaderboard">아직 게임 기록이 없습니다.</p>}
      </section>
    );
  }
  return (
    <section className="gameLeaderboard" aria-label="게임 랭킹">
      <div>
        <span>게임 TOP 3</span>
        <h3>{activeScope.title}</h3>
      </div>
      <div className="leaderboardTabs gameRankTabs" role="tablist" aria-label="게임 랭킹 범위">
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
      {saveState === "saving" ? <p className="mutedText">점수 저장 중...</p> : null}
      <div className="gameLeaderboardList">
        {leaders.length ? leaders.map((student) => (
          <article className={`leaderboardItem ${student.id === leaderboard.currentStudentId ? "mine" : ""}`} key={student.id}>
            <strong>{student.rank}위</strong>
            <div>
              <b>{student.name} <small>({student.day}일차)</small></b>
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

function buildRunnerQuestions(hanja) {
  const questions = (hanja || []).flatMap((item) => (item.vocab || [])
    .filter((vocab) => vocab.word && vocab.meaning)
    .map((vocab) => {
      const example = cleanExample(vocab.examples?.[0]?.text || "");
      const canBlank = example && example.includes(vocab.word);
      const useBlank = canBlank && Math.random() > 0.45;
      return {
        id: vocab.id,
        word: vocab.word,
        meaning: vocab.meaning,
        example,
        type: useBlank ? "blank" : "meaning",
        prompt: useBlank
          ? example.replaceAll(vocab.word, "____")
          : vocab.meaning
      };
    }));
  const unique = new Map();
  questions.forEach((question) => {
    if (!unique.has(question.word)) unique.set(question.word, question);
  });
  return [...unique.values()];
}

function makeRunnerRound(questions) {
  const answer = questions[Math.floor(Math.random() * questions.length)];
  const distractors = shuffle(questions.filter((item) => item.word !== answer.word)).slice(0, 2);
  const choices = shuffle([answer, ...distractors]).map((item) => item.word);
  const correctLane = choices.findIndex((word) => word === answer.word);
  const highLanes = makeRunnerHighLanes();
  const needsJump = highLanes.includes(correctLane);
  return {
    answer: answer.word,
    prompt: answer.prompt || answer.meaning,
    type: answer.type,
    choices,
    correctLane,
    highLanes,
    needsJump
  };
}

function makeRunnerHighLanes() {
  if (Math.random() > 0.42) return [];
  const lanes = shuffle([0, 1, 2]).slice(0, Math.random() > 0.7 ? 2 : 1);
  return lanes;
}

function buildAppleWordPuzzle(hanja) {
  const words = [];
  const seen = new Set();
  (hanja || []).forEach((item) => {
    (item.vocab || []).forEach((vocab) => {
      const word = extractHangulChars(vocab.word).join("");
      if (word.length < 2 || word.length > 5 || seen.has(word)) return;
      seen.add(word);
      words.push(word);
    });
  });
  const selectedWords = shuffle(words).sort((a, b) => b.length - a.length).slice(0, 10);
  const size = 6;
  const cells = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => ({
    id: `apple-${row}-${col}`,
    row,
    col,
    char: ""
  })));
  const placedWords = [];
  selectedWords.forEach((word) => {
    const placement = findAppleWordPlacement(word, cells, size);
    if (!placement) return;
    Array.from(word).forEach((char, index) => {
      const row = placement.row + (placement.dr * index);
      const col = placement.col + (placement.dc * index);
      cells[row][col].char = char;
    });
    placedWords.push(word);
  });
  const filler = Array.from(new Set(selectedWords.flatMap((word) => Array.from(word))));
  cells.flat().forEach((cell) => {
    if (!cell.char) cell.char = filler[Math.floor(Math.random() * filler.length)] || "가";
  });
  return {
    size,
    cells,
    words: placedWords,
    wordSet: new Set(placedWords),
    cellMap: new Map(cells.flat().map((cell) => [cell.id, cell]))
  };
}

function findAppleWordPlacement(word, cells, size) {
  const directions = shuffle([
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
    { dr: -1, dc: 1 }
  ]);
  const attempts = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      directions.forEach((direction) => attempts.push({ row, col, ...direction }));
    }
  }
  return shuffle(attempts).find((attempt) => canPlaceAppleWord(word, attempt, cells, size)) || null;
}

function canPlaceAppleWord(word, placement, cells, size) {
  return Array.from(word).every((char, index) => {
    const row = placement.row + (placement.dr * index);
    const col = placement.col + (placement.dc * index);
    if (row < 0 || col < 0 || row >= size || col >= size) return false;
    return !cells[row][col].char || cells[row][col].char === char;
  });
}

function areNeighborCells(a, b) {
  const rowGap = Math.abs(a.row - b.row);
  const colGap = Math.abs(a.col - b.col);
  return rowGap <= 1 && colGap <= 1 && rowGap + colGap > 0;
}

function buildCrosswordPuzzle(hanja) {
  const words = [];
  const seen = new Set();
  (hanja || []).forEach((item) => {
    (item.vocab || []).forEach((vocab) => {
      const word = extractHangulChars(vocab.word).join("");
      if (word.length < 2 || word.length > 6 || !vocab.meaning || seen.has(word)) return;
      seen.add(word);
      words.push({
        id: `crossword-${vocab.id || word}`,
        word,
        meaning: vocab.meaning
      });
    });
  });
  const candidates = shuffle(words).sort((a, b) => b.word.length - a.word.length).slice(0, 20);
  const size = 13;
  return buildBestCrosswordLayout(candidates, size);
}

function buildBestCrosswordLayout(candidates, size) {
  if (!candidates.length) return { size, cells: createCrosswordGrid(size), entries: [] };
  const attempts = Array.from({ length: Math.min(14, Math.max(4, candidates.length)) }, (_, index) => buildCrosswordLayoutAttempt(candidates, size, index));
  return attempts.sort((a, b) => b.score - a.score)[0].puzzle;
}

function createCrosswordGrid(size) {
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => ({
    row,
    col,
    char: "",
    entryIds: [],
    island: null,
    number: 0
  })));
}

function buildCrosswordLayoutAttempt(candidates, size, attemptIndex) {
  const grid = createCrosswordGrid(size);
  const entries = [];
  const usedWords = new Set();
  const islandSizes = [0];
  const seedPool = candidates.slice(0, Math.min(6, candidates.length));
  const seed = seedPool[attemptIndex % seedPool.length];
  const seedPlacement = findCrosswordSeedPlacement(seed.word, grid, size, entries.length, attemptIndex);
  if (!seedPlacement) return { puzzle: { size, cells: grid, entries }, score: 0 };
  const seedEntry = {
    ...seed,
    ...seedPlacement,
    id: `${seed.id}-0`,
    island: 0,
    number: 1
  };
  placeCrosswordEntry(seedEntry, grid);
  entries.push(seedEntry);
  usedWords.add(seed.word);
  islandSizes[0] = 1;

  let islandCount = 1;
  for (let pass = 0; pass < 10 && entries.length < 12; pass += 1) {
    let placedThisPass = 0;
    const targetIsland = pickSmallCrosswordIsland(islandSizes);
    shuffle(candidates).forEach((item) => {
      if (entries.length >= 12 || usedWords.has(item.word)) return;
      const placement = findCrosswordPlacement(item.word, grid, size, targetIsland);
      if (!placement) return;
      const entry = {
        ...item,
        ...placement,
        id: `${item.id}-${entries.length}`,
        island: placement.island,
        number: entries.length + 1
      };
      placeCrosswordEntry(entry, grid);
      entries.push(entry);
      usedWords.add(item.word);
      islandSizes[entry.island] = (islandSizes[entry.island] || 0) + 1;
      placedThisPass += 1;
    });
    const canOpenIsland = islandSizes.every((sizeValue) => sizeValue >= 3) || !placedThisPass;
    if (!canOpenIsland || islandCount >= 4 || entries.length >= 12) continue;
    const nextSeedOption = candidates
      .filter((item) => !usedWords.has(item.word))
      .map((item) => ({ item, placement: findCrosswordSeedPlacement(item.word, grid, size, islandCount, attemptIndex) }))
      .find((option) => option.placement);
    if (!nextSeedOption) continue;
    const { item: nextSeed, placement } = nextSeedOption;
    const entry = {
      ...nextSeed,
      ...placement,
      id: `${nextSeed.id}-${entries.length}`,
      island: islandCount,
      number: entries.length + 1
    };
    placeCrosswordEntry(entry, grid);
    entries.push(entry);
    usedWords.add(nextSeed.word);
    islandSizes[islandCount] = 1;
    islandCount += 1;
  }

  const puzzle = { size, cells: grid, entries };
  return {
    puzzle,
    score: scoreCrosswordPuzzle(entries, grid, size)
  };
}

function pickSmallCrosswordIsland(islandSizes) {
  return islandSizes
    .map((sizeValue, island) => ({ island, size: sizeValue }))
    .sort((a, b) => a.size - b.size || a.island - b.island)[0]?.island || 0;
}

function findCrosswordSeedPlacement(word, grid, size, islandIndex = 0, attemptIndex = 0) {
  const anchors = getCrosswordSeedAnchors(size, islandIndex, attemptIndex);
  const attempts = anchors.flatMap((anchor) => [
    { row: anchor.row, col: anchor.col - Math.floor(word.length / 2), direction: "across" },
    { row: anchor.row - Math.floor(word.length / 2), col: anchor.col, direction: "down" }
  ]);
  return attempts.find((placement) => canPlaceCrosswordSeed(word, placement, grid, size)) || null;
}

function getCrosswordSeedAnchors(size, islandIndex, attemptIndex) {
  const low = Math.floor(size * .25);
  const mid = Math.floor(size / 2);
  const high = Math.floor(size * .75);
  const anchors = [
    { row: mid, col: mid },
    { row: low, col: low },
    { row: high, col: high },
    { row: low, col: high },
    { row: high, col: low }
  ];
  const rotated = anchors.slice(islandIndex).concat(anchors.slice(0, islandIndex));
  return attemptIndex % 2 ? rotated.reverse() : rotated;
}

function canPlaceCrosswordSeed(word, placement, grid, size) {
  const chars = Array.from(word);
  return chars.every((char, index) => {
    const row = placement.row + (placement.direction === "down" ? index : 0);
    const col = placement.col + (placement.direction === "across" ? index : 0);
    if (row < 0 || col < 0 || row >= size || col >= size) return false;
    if (grid[row][col].char && grid[row][col].char !== char) return false;
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        const neighborRow = row + rowOffset;
        const neighborCol = col + colOffset;
        if (neighborRow < 0 || neighborCol < 0 || neighborRow >= size || neighborCol >= size) continue;
        if (grid[neighborRow][neighborCol].char) return false;
      }
    }
    return true;
  });
}

function findCrosswordPlacement(word, grid, size, targetIsland = null) {
  const chars = Array.from(word);
  const attempts = [];
  grid.forEach((row) => row.forEach((cell) => {
    if (!cell.char || (targetIsland !== null && cell.island !== targetIsland)) return;
    chars.forEach((char, index) => {
      if (cell.char !== char) return;
      attempts.push({ row: cell.row, col: cell.col - index, direction: "across" });
      attempts.push({ row: cell.row - index, col: cell.col, direction: "down" });
    });
  }));
  return shuffle(attempts)
    .map((placement) => scoreCrosswordPlacement(word, placement, grid, size, targetIsland))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function scoreCrosswordPlacement(word, placement, grid, size, targetIsland = null) {
  const chars = Array.from(word);
  let intersections = 0;
  let filledNeighbors = 0;
  const beforeRow = placement.row - (placement.direction === "down" ? 1 : 0);
  const beforeCol = placement.col - (placement.direction === "across" ? 1 : 0);
  const afterRow = placement.row + (placement.direction === "down" ? chars.length : 0);
  const afterCol = placement.col + (placement.direction === "across" ? chars.length : 0);
  if (isCrosswordFilled(grid, beforeRow, beforeCol, size) || isCrosswordFilled(grid, afterRow, afterCol, size)) return null;

  for (let index = 0; index < chars.length; index += 1) {
    const row = placement.row + (placement.direction === "down" ? index : 0);
    const col = placement.col + (placement.direction === "across" ? index : 0);
    if (row < 0 || col < 0 || row >= size || col >= size) return null;
    const existing = grid[row][col].char;
    if (existing && existing !== chars[index]) return null;
    if (existing === chars[index]) {
      if (targetIsland !== null && grid[row][col].island !== targetIsland) return null;
      intersections += 1;
      continue;
    }
    const sideA = placement.direction === "across" ? [row - 1, col] : [row, col - 1];
    const sideB = placement.direction === "across" ? [row + 1, col] : [row, col + 1];
    if (isCrosswordFilled(grid, sideA[0], sideA[1], size) || isCrosswordFilled(grid, sideB[0], sideB[1], size)) {
      filledNeighbors += 1;
    }
  }
  if (!intersections || filledNeighbors) return null;
  const center = (size - 1) / 2;
  const middleRow = placement.row + (placement.direction === "down" ? (chars.length - 1) / 2 : 0);
  const middleCol = placement.col + (placement.direction === "across" ? (chars.length - 1) / 2 : 0);
  const centerDistance = Math.abs(center - middleRow) + Math.abs(center - middleCol);
  return {
    ...placement,
    island: targetIsland ?? grid[placement.row]?.[placement.col]?.island ?? 0,
    score: (intersections * 120) + (chars.length * 8) - (centerDistance * 5)
  };
}

function isCrosswordFilled(grid, row, col, size) {
  if (row < 0 || col < 0 || row >= size || col >= size) return false;
  return Boolean(grid[row][col].char);
}

function placeCrosswordEntry(entry, grid) {
  Array.from(entry.word).forEach((char, index) => {
    const row = entry.row + (entry.direction === "down" ? index : 0);
    const col = entry.col + (entry.direction === "across" ? index : 0);
    grid[row][col].char = char;
    grid[row][col].entryIds.push(entry.id);
    grid[row][col].island = entry.island ?? grid[row][col].island ?? 0;
    if (index === 0) grid[row][col].number = grid[row][col].number || entry.number;
  });
}

function scoreCrosswordPuzzle(entries, grid, size) {
  const filledCells = grid.flat().filter((cell) => cell.char);
  const intersectionCount = filledCells.filter((cell) => cell.entryIds.length > 1).length;
  if (!entries.length) return 0;
  const rows = filledCells.map((cell) => cell.row);
  const cols = filledCells.map((cell) => cell.col);
  const area = (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...cols) - Math.min(...cols) + 1);
  return (entries.length * 100) + (intersectionCount * 80) - area;
}

function normalizeGameAnswer(value) {
  return extractHangulChars(value).join("");
}

function buildChainData(hanja) {
  const byStart = new Map();
  const syllables = new Set();
  (hanja || []).forEach((item) => {
    (item.vocab || []).forEach((vocab) => {
      const chars = extractHangulChars(vocab.word);
      if (chars.length < 2) return;
      for (let index = 0; index < chars.length - 1; index += 1) {
        const start = chars[index];
        const next = chars[index + 1];
        const list = byStart.get(start) || [];
        list.push({ next, word: `${start}${next}`, fullWord: vocab.word });
        byStart.set(start, list);
        syllables.add(start);
        syllables.add(next);
      }
    });
  });
  return {
    byStart,
    syllables: [...syllables],
    starts: [...byStart.keys()].filter((key) => (byStart.get(key) || []).length)
  };
}

function pickChainStart(chainData, avoid = "") {
  const starts = (chainData.starts || []).filter((item) => item !== avoid);
  const pool = starts.length ? starts : chainData.starts;
  return pool[Math.floor(Math.random() * pool.length)] || "";
}

function makeChainOrb(target, chainData) {
  const candidates = chainData.byStart.get(target) || [];
  if (!candidates.length) return { orb: null, decoys: [] };
  const answer = candidates[Math.floor(Math.random() * candidates.length)]?.next;
  if (!answer) return { orb: null, decoys: [] };
  const orb = {
    id: `target-${Date.now()}-${Math.random()}`,
    char: answer,
    x: randomPercent(18, 82),
    y: randomPercent(18, 78)
  };
  const decoys = shuffle(chainData.syllables.filter((item) => item && item !== answer))
    .slice(0, 5)
    .map((char, index) => ({
      id: `decoy-${char}-${index}-${Date.now()}-${Math.random()}`,
      char,
      x: randomPercent(12, 88),
      y: randomPercent(14, 84)
    }))
    .filter((item) => distancePercent(item, orb) > 11);
  return { orb, decoys };
}

function randomPercent(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distancePercent(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt((dx * dx) + (dy * dy));
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

function resolveGameMatches(board, wordSet, requiredKeys = new Set()) {
  let workingBoard = cloneGameBoard(board);
  const clearKeys = new Set();
  const matchedWords = [];
  let clearedCount = 0;

  for (let y = 0; y < GAME_ROWS; y += 1) {
    for (let x = 0; x < GAME_COLUMNS; x += 1) {
      const cell = workingBoard[y][x];
      if (!cell) continue;
      const right = x + 1 < GAME_COLUMNS ? workingBoard[y][x + 1] : null;
      const down = y + 1 < GAME_ROWS ? workingBoard[y + 1][x] : null;
      if (right && wordSet.has(`${cell.char}${right.char}`)) {
        clearedCount += addPlacedGameMatch(clearKeys, matchedWords, `${x}:${y}`, `${x + 1}:${y}`, `${cell.char}${right.char}`, requiredKeys);
      }
      if (down && wordSet.has(`${cell.char}${down.char}`)) {
        clearedCount += addPlacedGameMatch(clearKeys, matchedWords, `${x}:${y}`, `${x}:${y + 1}`, `${cell.char}${down.char}`, requiredKeys);
      }
    }
  }

  if (clearKeys.size) {
    clearKeys.forEach((key) => {
      const [x, y] = key.split(":").map(Number);
      workingBoard[y][x] = null;
    });
    workingBoard = applyGameGravity(workingBoard);
  }

  return { board: workingBoard, clearedCount, clearKeys: [...clearKeys], matchedWords: [...new Set(matchedWords)] };
}

function addPlacedGameMatch(clearKeys, matchedWords, firstKey, secondKey, word, requiredKeys) {
  const firstIsNew = requiredKeys.has(firstKey);
  const secondIsNew = requiredKeys.has(secondKey);
  if (firstIsNew === secondIsNew) return 0;
  clearKeys.add(firstKey);
  clearKeys.add(secondKey);
  matchedWords.push(word);
  return 1;
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
