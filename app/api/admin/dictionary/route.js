import { NextResponse } from "next/server";
import { adminCookieName, readAdminSession } from "../../../../src/lib/adminAuth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const searchUrl = "https://krdict.korean.go.kr/api/search";

export async function POST(request) {
  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore.get(adminCookieName)?.value);
  if (!session.authenticated) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const apiKey = process.env.KOREAN_DICT_API_KEY || process.env.KRDICT_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, message: "Vercel 환경변수 KOREAN_DICT_API_KEY에 한국어기초사전 API 인증키를 넣어 주세요." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const words = Array.isArray(body.words) ? body.words : [];
  const uniqueWords = [...new Set(words.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 80);
  const results = {};

  for (const word of uniqueWords) {
    try {
      results[word] = await lookupWord(apiKey, word);
    } catch {
      results[word] = { found: false, word, origin: "", definition: "", examples: [] };
    }
  }

  return NextResponse.json({ ok: true, results });
}

async function lookupWord(apiKey, word) {
  const [entry, examples] = await Promise.all([
    fetchDictionaryPart(apiKey, word, "word"),
    fetchDictionaryPart(apiKey, word, "exam")
  ]);
  const matchedEntry = entry.items.find((item) => normalizeWord(item.word) === normalizeWord(word)) || entry.items[0];
  const matchedExamples = examples.items
    .filter((item) => normalizeWord(item.word) === normalizeWord(word) || String(item.example || "").includes(word))
    .map((item) => cleanText(item.example))
    .filter((item) => item.includes(word) && isUsefulExample(item));

  return {
    found: Boolean(matchedEntry || matchedExamples.length),
    word,
    origin: cleanText(matchedEntry?.origin || ""),
    definition: cleanText(matchedEntry?.definition || ""),
    examples: [...new Set(matchedExamples)].slice(0, 3)
  };
}

async function fetchDictionaryPart(apiKey, word, part) {
  const params = new URLSearchParams({
    key: apiKey,
    q: word,
    part,
    sort: "dict",
    num: "20",
    advanced: "y",
    method: "exact",
    type1: "word",
    type2: "chinese"
  });
  if (part === "exam") params.set("target", "3");
  const response = await fetch(`${searchUrl}?${params.toString()}`, { cache: "no-store" });
  const xml = await response.text();
  if (!response.ok) return { items: [] };
  return { items: parseItems(xml, part) };
}

function parseItems(xml, part) {
  return [...String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => {
    const item = match[1];
    return {
      word: tag(item, "word"),
      origin: tag(item, "origin"),
      definition: tag(item, "definition"),
      example: part === "exam" ? tag(item, "example") : ""
    };
  });
}

function tag(xml, name) {
  const match = String(xml || "").match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
  return cleanText(match?.[1] || "");
}

function cleanText(value) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
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
