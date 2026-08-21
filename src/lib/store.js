"use client";

function apiUrl(path) {
  if (typeof window === "undefined") return path;
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return path;
  }
}

async function buildApiError(response, fallback) {
  const result = await response.json().catch(() => ({}));
  const error = new Error(result.message || result.error || fallback);
  error.status = response.status;
  return error;
}

export async function loadAppState() {
  const response = await fetch(apiUrl("/api/state"), { cache: "no-store" });
  if (!response.ok) throw await buildApiError(response, "학습 데이터를 불러오지 못했습니다.");
  return response.json();
}

export async function saveAppState(state) {
  const response = await fetch(apiUrl("/api/state"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
  if (!response.ok) throw await buildApiError(response, "학습 데이터를 저장하지 못했습니다.");
  return response.json();
}

export async function resetAppState() {
  const response = await fetch(apiUrl("/api/state"), { method: "DELETE" });
  if (!response.ok) throw await buildApiError(response, "학습 데이터를 초기화하지 못했습니다.");
  return response.json();
}
