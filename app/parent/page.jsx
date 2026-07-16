import { Suspense } from "react";
import { ParentProgressApp } from "../../src/components/ParentProgressApp";

export default function ParentPage() {
  return (
    <Suspense fallback={<main className="centerPage">학습 기록을 불러오는 중...</main>}>
      <ParentProgressApp />
    </Suspense>
  );
}
