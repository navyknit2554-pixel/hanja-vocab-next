import Link from "next/link";
import { Mascot } from "../src/components/Mascot";

export default function Home() {
  return (
    <main className="home">
      <section className="homeHero">
        <Mascot mood="happy" />
        <p className="eyebrow">한자 어휘 학습</p>
        <h1>초록이와 오늘의 한자 4개를 익혀요</h1>
        <div className="homeActions">
          <Link className="btn primary" href="/student">학생 화면</Link>
          <Link className="btn blue" href="/admin">관리 화면</Link>
        </div>
      </section>
    </main>
  );
}
