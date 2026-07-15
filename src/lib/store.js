"use client";

export async function loadAppState() {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error("학습 데이터를 불러오지 못했습니다.");
  return response.json();
}

export async function saveAppState(state) {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
  if (!response.ok) throw new Error("학습 데이터를 저장하지 못했습니다.");
  return response.json();
}

export async function resetAppState() {
  const response = await fetch("/api/state", { method: "DELETE" });
  if (!response.ok) throw new Error("학습 데이터를 초기화하지 못했습니다.");
  return response.json();
}
