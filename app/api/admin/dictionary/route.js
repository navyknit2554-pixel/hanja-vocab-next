import { NextResponse } from "next/server";
import { adminCookieName, readAdminSession } from "../../../../src/lib/adminAuth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const searchUrl = "https://krdict.korean.go.kr/api/search";
const viewUrl = "https://krdict.korean.go.kr/api/view";

class DictionaryApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function POST(request) {
  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore.get(adminCookieName)?.value);
  if (!session.authenticated) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const requestBody = await request.json().catch(() => ({}));

  const apiKey = process.env.KOREAN_DICT_API_KEY || process.env.KRDICT_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, message: "Vercel 환경변수 KOREAN_DICT_API_KEY에 한국어기초사전 API 인증키를 넣어 주세요." },
      { status: 500 }
    );
  }

  try {
    const body = requestBody;
    if (body.mode === "hanja-vocab") {
      const hanjaSet = Array.isArray(body.hanjaSet) ? body.hanjaSet : [];
      const results = {};
      for (const hanja of hanjaSet.slice(0, 8)) {
        const character = String(hanja?.character || "").trim();
        if (character) results[character] = await lookupHanjaVocab(apiKey, hanja);
      }
      return NextResponse.json({ ok: true, results });
    }

    const words = Array.isArray(body.words) ? body.words : [];
    const uniqueWords = [...new Set(words.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 80);
    const results = {};
    for (const word of uniqueWords) {
      results[word] = await lookupWord(apiKey, word);
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error.message || "한국어기초사전 API 연결을 확인해 주세요." },
      { status: error.status || 502 }
    );
  }
}

async function lookupHanjaVocab(apiKey, hanja) {
  const character = String(hanja?.character || "").trim();
  const candidates = await fetchDictionaryPart(apiKey, character, "word", {
    method: "include",
    type2: "chinese",
    target: "4",
    lang: "2",
    num: "100"
  });
  const filtered = candidates.items
    .filter((item) => isValidHanjaVocabCandidate(item, character))
    .sort((left, right) => scoreCandidate(right, character) - scoreCandidate(left, character));
  const selected = [];

  for (const item of filtered) {
    if (selected.length >= 8) break;
    const viewExamples = item.targetCode ? await fetchDictionaryViewExamples(apiKey, item.targetCode, item.word) : [];
    const examples = viewExamples.length ? viewExamples : await fetchDictionarySearchExamples(apiKey, item.word);
    if (!examples.length) continue;
    selected.push({
      hanja: extractHanjaWord(item.origin, character),
      word: item.word,
      meaning: item.definition,
      examples: examples.slice(0, 3),
      source: "한국어기초사전"
    });
  }

  return selected;
}

async function fetchDictionarySearchExamples(apiKey, word) {
  const exactExamples = await fetchDictionaryPart(apiKey, word, "exam", { method: "exact", num: "20" });
  const includeExamples = exactExamples.items.length ? { items: [] } : await fetchDictionaryPart(apiKey, word, "exam", { method: "include", num: "20" });
  return [...exactExamples.items, ...includeExamples.items]
    .map((item) => cleanText(item.example))
    .filter((item) => item.includes(word) && isUsefulExample(item))
    .slice(0, 3);
}

async function lookupWord(apiKey, word) {
  const [exactEntry, broadEntry, exactExamples, broadExamples] = await Promise.all([
    fetchDictionaryPart(apiKey, word, "word", { method: "exact" }),
    fetchDictionaryPart(apiKey, word, "word", { method: "include" }),
    fetchDictionaryPart(apiKey, word, "exam", { method: "exact" }),
    fetchDictionaryPart(apiKey, word, "exam", { method: "include" })
  ]);

  const entries = dedupeByTargetCode([...exactEntry.items, ...broadEntry.items]);
  const matchedEntry = entries.find((item) => normalizeWord(item.word) === normalizeWord(word)) || entries[0];
  const viewExamples = matchedEntry?.targetCode
    ? await fetchDictionaryViewExamples(apiKey, matchedEntry.targetCode, word)
    : [];
  const searchExamples = [...exactExamples.items, ...broadExamples.items]
    .filter((item) => String(item.example || "").includes(word))
    .map((item) => cleanText(item.example));
  const matchedExamples = [...new Set([...viewExamples, ...searchExamples])]
    .filter((item) => item.includes(word) && isUsefulExample(item))
    .slice(0, 3);

  return {
    found: Boolean(matchedEntry || matchedExamples.length),
    word,
    origin: cleanText(matchedEntry?.origin || ""),
    definition: cleanText(matchedEntry?.definition || ""),
    examples: matchedExamples
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
  const response = await fetch(`${searchUrl}?${params.toString()}`, { cache: "no-store" });
  const xml = await response.text();
  assertDictionaryResponse(xml, response.ok);
  return { items: parseItems(xml, part) };
}

async function fetchDictionaryViewExamples(apiKey, targetCode, word) {
  const params = new URLSearchParams({
    key: apiKey,
    method: "target_code",
    q: String(targetCode)
  });
  const response = await fetch(`${viewUrl}?${params.toString()}`, { cache: "no-store" });
  const xml = await response.text();
  assertDictionaryResponse(xml, response.ok);
  return parseExamplesFromView(xml, word);
}

function assertDictionaryResponse(xml, responseOk) {
  const errorCode = tagRaw(xml, "error_code");
  const errorMessage = tagRaw(xml, "message");
  if (!responseOk || errorCode) {
    if (errorCode === "020" || /unregistered key/i.test(errorMessage)) {
      throw new DictionaryApiError("한국어기초사전 API 인증키가 등록되지 않았습니다. Vercel의 KOREAN_DICT_API_KEY 값을 다시 확인해 주세요.", 500);
    }
    throw new DictionaryApiError(`한국어기초사전 API 오류: ${errorMessage || errorCode || "응답을 확인할 수 없습니다."}`);
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
  const examples = [...String(xml || "").matchAll(/<example[^>]*>([\s\S]*?)<\/example>/g)]
    .map((match) => cleanText(match[1]))
    .filter((item) => item.includes(word));
  return [...new Set(examples)];
}

function dedupeByTargetCode(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.targetCode || `${item.word}-${item.definition}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isValidHanjaVocabCandidate(item, character) {
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

function normalizeWord(value) {
  return String(value || "").replace(/[\\-^0-9\s]/g, "").trim();
}

function isUsefulExample(example) {
  return ![
    "최근",
    "관심이 높아졌다",
    "문제를 자세히 다루었다",
    "대책을 마련했다",
    "용례 확인 필요"
  ].some((phrase) => example.includes(phrase));
}
