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
  const text = await response.text().catch(() => "");
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = {};
  }
  const detail = result.message || result.error || text.slice(0, 220);
  const error = new Error(detail ? `${fallback} (${response.status}) ${detail}` : `${fallback} (${response.status})`);
  error.status = response.status;
  return error;
}

export async function loadAppState() {
  const response = await fetchWithTimeout(apiUrl("/api/state"), { cache: "no-store" }, 25000);
  if (!response.ok) throw await buildApiError(response, "학습 데이터를 불러오지 못했습니다.");
  return response.json();
}

export async function saveAppState(state) {
  const payload = JSON.stringify(state);
  const compressed = await gzipText(payload);
  const useCompressed = Boolean(compressed && compressed.size < payload.length);
  const response = await fetchWithTimeout(apiUrl("/api/state"), {
    method: "PUT",
    headers: useCompressed
      ? { "Content-Type": "application/octet-stream", "X-Hanja-Content-Encoding": "gzip" }
      : { "Content-Type": "application/json" },
    body: useCompressed ? compressed : payload
  }, 30000);
  if (!response.ok) throw await buildApiError(response, "학습 데이터를 저장하지 못했습니다.");
  return response.json();
}

export async function resetAppState() {
  const response = await fetchWithTimeout(apiUrl("/api/state"), { method: "DELETE" }, 25000);
  if (!response.ok) throw await buildApiError(response, "학습 데이터를 초기화하지 못했습니다.");
  return response.json();
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("요청 시간이 초과되었습니다. Supabase 연결 문자열 또는 배포 상태를 확인해 주세요.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function gzipText(text) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}
