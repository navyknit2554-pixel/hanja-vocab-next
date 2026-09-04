import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page center">
      <section className="panel loginCard">
        <h1>초록이한자학습 v2</h1>
        <p>새 데이터 구조로 다시 만드는 버전입니다.</p>
        <Link className="btn primary" href="/student">학생 화면</Link>
        <Link className="btn secondary" href="/admin">관리 화면</Link>
      </section>
    </main>
  );
}
