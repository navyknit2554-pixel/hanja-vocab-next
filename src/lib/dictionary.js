const searchUrl = "https://krdict.korean.go.kr/api/search";
const viewUrl = "https://krdict.korean.go.kr/api/view";

export async function lookupHanjaVocabulary(character, limit = 8) {
  const apiKey = process.env.KOREAN_DICT_API_KEY || process.env.KRDICT_API_KEY;
  if (!apiKey) throw new Error("KOREAN_DICT_API_KEY 환경변수가 필요합니다.");

  const candidates = await fetchDictionaryPart(apiKey, character, "word", {
    method: "include",
    type2: "chinese",
    target: "4",
    lang: "2",
    num: "100"
  });
  const filtered = candidates
    .filter((item) => isValidCandidate(item, character))
    .sort((left, right) => scoreCandidate(right, character) - scoreCandidate(left, character));

  const enriched = await Promise.all(
    filtered.slice(0, limit).map((item) => enrichCandidate(apiKey, item, character))
  );
  return enriched.filter(Boolean).slice(0, limit);
}

async function optionalLookup(task) {
  try {
    return await task();
  } catch {
    return [];
  }
}

async function enrichCandidate(apiKey, item, character) {
  const examples = await optionalLookup(() => item.targetCode
    ? fetchDictionaryViewExamples(apiKey, item.targetCode, item.word)
    : Promise.resolve([]));
  const fallbackExamples = examples.length ? [] : await optionalLookup(() => fetchDictionarySearchExamples(apiKey, item.word));
  const usableExamples = [...new Set([...examples, ...fallbackExamples])]
    .filter((example) => example.includes(item.word) && isUsefulExample(example))
    .slice(0, 3);
  if (!usableExamples.length) return null;
  return {
    targetCode: item.targetCode,
    hanjaWord: extractHanjaWord(item.origin, character),
    word: item.word,
    meaning: item.definition,
    examples: usableExamples
  };
}

async function fetchDictionaryPart(apiKey, word, part, options = {}) {
  const params = new URLSearchParams({
    key: apiKey,
    q: word,
    part,
    sort: "dict",
    num: options.num || "50",
    advanced: "y",
    method: options.method || "exact",
    type1: "word"
  });
  if (options.type2) params.set("type2", options.type2);
  if (options.target) params.set("target", options.target);
  if (options.lang) params.set("lang", options.lang);
  const response = await fetchWithTimeout(`${searchUrl}?${params.toString()}`);
  const xml = await response.text();
  assertDictionaryResponse(xml, response.ok);
  return parseItems(xml, part);
}

async function fetchDictionaryViewExamples(apiKey, targetCode, word) {
  const params = new URLSearchParams({
    key: apiKey,
    method: "target_code",
    q: String(targetCode)
  });
  const response = await fetchWithTimeout(`${viewUrl}?${params.toString()}`);
  const xml = await response.text();
  assertDictionaryResponse(xml, response.ok);
  return parseExamplesFromView(xml, word);
}

async function fetchWithTimeout(url, timeoutMs = 3500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDictionarySearchExamples(apiKey, word) {
  const exact = await fetchDictionaryPart(apiKey, word, "exam", { method: "exact", num: "20" });
  return exact.map((item) => cleanText(item.example));
}

function assertDictionaryResponse(xml, responseOk) {
  const errorCode = tagRaw(xml, "error_code");
  const errorMessage = tagRaw(xml, "message");
  if (!responseOk || errorCode) {
    if (errorCode === "020" || /unregistered key/i.test(errorMessage)) {
      throw new Error("한국어기초사전 API 인증키가 등록되지 않았습니다.");
    }
    throw new Error(`한국어기초사전 API 오류: ${errorMessage || errorCode || "응답 확인 필요"}`);
  }
}

function parseItems(xml, part) {
  return [...String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => {
    const item = match[1];
    return {
      targetCode: tag(item, "target_code"),
      word: tag(item, "word"),
      origin: tag(item, "origin") || tag(item, "original_language"),
      definition: tag(item, "definition"),
      example: part === "exam" ? tag(item, "example") : ""
    };
  });
}

function parseExamplesFromView(xml, word) {
  return [...String(xml || "").matchAll(/<example[^>]*>([\s\S]*?)<\/example>/g)]
    .map((match) => cleanText(match[1]))
    .filter((item) => item.includes(word));
}

function isValidCandidate(item, character) {
  const word = String(item.word || "").trim();
  const hanjaWord = extractHanjaWord(item.origin, character);
  if (!word || word.length < 2 || word.length > 3 || /\s/.test(word)) return false;
  if (!String(item.definition || "").trim()) return false;
  if (!hanjaWord || hanjaWord.length < 2 || hanjaWord.length > 3) return false;
  return hanjaWord.includes(character);
}

function extractHanjaWord(origin, character) {
  const hanjaWords = String(origin || "").match(/[\u3400-\u9fff]{2,3}/g) || [];
  return hanjaWords.find((item) => item.includes(character)) || "";
}

function scoreCandidate(item, character) {
  const word = String(item.word || "");
  const hanjaWord = extractHanjaWord(item.origin, character);
  let score = 0;
  if (hanjaWord.startsWith(character)) score += 4;
  if (word.length === 2) score += 3;
  if (word.length === 3) score += 1;
  if (!/[·ㆍ,;()]/.test(String(item.origin || ""))) score += 1;
  return score;
}

function tag(xml, name) {
  const match = String(xml || "").match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
  return cleanText(match?.[1] || "");
}

function tagRaw(xml, name) {
  const match = String(xml || "").match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
  return String(match?.[1] || "").trim();
}

function cleanText(value) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
    .replace(/^\s*[\[(<【]?\s*(문장|대화|예문)\s*(\d+|[一二三])?\s*[\])>】]?\s*[:：.\-–—]*\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function isUsefulExample(example) {
  return ![
    "최근",
    "관심이 높아졌다",
    "문제를 자세히 다루었다",
    "대책을 마련했다",
    "용례 확인 필요"
  ].some((phrase) => String(example || "").includes(phrase));
}
