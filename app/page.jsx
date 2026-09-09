import Link from "next/link";
import { Mascot } from "../src/components/Mascot";

export default function HomePage() {
  return (
    <main className="page center">
      <section className="panel loginCard">
        <Mascot variant="hero" label="초록이" />
        <h1>초록이한자학습 v2</h1>
        <p>새 데이터 구조로 다시 만드는 버전입니다.</p>
        <Link className="btn primary" href="/student">학생 화면</Link>
        <Link className="btn secondary" href="/admin">관리 화면</Link>
      </section>
    </main>
  );
}
