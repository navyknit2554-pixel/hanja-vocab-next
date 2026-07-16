"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mascot } from "./Mascot";

export function ParentProgressApp() {
  const searchParams = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({
      teacher: searchParams.get("teacher") || "",
      student: searchParams.get("student") || "",
      token: searchParams.get("token") || ""
    });
    return params.toString();
  }, [searchParams]);

  useEffect(() => {
    setError("");
    fetch(`/api/parent/progress?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "학습 기록을 불러오지 못했습니다.");
        setData(result);
      })
      .catch((err) => setError(err.message));
  }, [query]);

  if (error) {
    return (
      <main className="centerPage">
        <section className="loginCard">
          <Mascot mood="sad" />
          <h1>링크를 확인해 주세요</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!data) return <main className="centerPage">학습 기록을 불러오는 중...</main>;

  const { student, summary, currentLesson, history } = data;
  const currentRecord = history.find((record) => record.day === student.day);
  const recent = history.filter((record) => record.statusKey !== "idle").slice(-8).reverse();

  return (
    <main className="parentFrame">
      <section className="parentHero">
        <div>
          <p className="eyebrow">학부모 학습 리포트</p>
          <h1>{student.name} 학생의 한자 어휘 학습</h1>
          <p>{student.grade} · {student.level} · 현재 {student.day}일차</p>
        </div>
        <Mascot />
      </section>

      <section className="parentSummary">
        <article><b>{summary.completedCount}</b><span>완성한 일차</span></article>
        <article><b>{student.day}</b><span>현재 일차</span></article>
        <article><b>{currentRecord?.rate || 0}%</b><span>현재 정답률</span></article>
        <article><b>{summary.currentWords}</b><span>오늘 어휘</span></article>
      </section>

      <section className="parentPanel">
        <div className="panelTitle">
          <h2>현재 학습</h2>
          <span className={`statusPill ${currentRecord?.statusKey || "idle"}`}>{currentRecord?.statusLabel || "시작 전"}</span>
        </div>
        <div className="parentCurrent">
          <strong>{student.day}일차 한자</strong>
          <div>
            {currentLesson?.hanja?.map((item) => (
              <span key={item.character}>{item.character}({item.sound} · {item.meaning})</span>
            )) || <span>배정된 한자가 없습니다.</span>}
          </div>
        </div>
      </section>

      <section className="parentPanel">
        <h2>최근 학습 기록</h2>
        <div className="parentHistory">
          {(recent.length ? recent : history.slice(0, 5)).map((record) => (
            <article key={record.day}>
              <div>
                <strong>{record.day}일차</strong>
                <span className={`statusPill ${record.statusKey}`}>{record.statusLabel}</span>
              </div>
              <div className="miniProgress"><i style={{ width: `${record.statusKey === "completed" ? 100 : record.rate}%` }} /></div>
              <p>{record.total ? `${record.correct}/${record.total}문항 · 정답률 ${record.rate}% · ${record.attempts}회 응시` : `예정 어휘 ${record.words}개`}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
