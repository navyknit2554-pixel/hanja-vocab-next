export function hanjaItems(lesson) {
  const items = lesson?.hanjaSet || [];
  const count = Math.max(1, Number(lesson?.dailyCount || items.length || 1));
  return items.slice(0, count);
}

export function lessonVocab(lesson) {
  return hanjaItems(lesson).flatMap((hanja) => (hanja.vocab || []).map((item) => ({ ...item, parent: hanja })));
}

export function findLesson(curriculum, day, level) {
  const lessons = Array.isArray(curriculum) ? curriculum : [];
  const targetDay = Number(day);
  const targetLevel = String(level || "").trim();
  return (
    lessons.find((item) => Number(item.day) === targetDay && String(item.level || "").trim() === targetLevel) ||
    lessons.find((item) => Number(item.day) === targetDay) ||
    lessons[0]
  );
}

export function learningCards(lesson) {
  return hanjaItems(lesson).flatMap((hanja) => [
    { type: "hanja", hanja },
    ...(hanja.vocab || []).map((item) => ({ type: "vocab", hanja, item }))
  ]);
}

export function quizItems(lesson) {
  const words = lessonVocab(lesson);
  const vocabItems = words.map((item, index) => {
    const meaningPool = words.filter((candidate) => candidate.word !== item.word).map((candidate) => candidate.meaning);
    const wordPool = words.filter((candidate) => candidate.word !== item.word).map((candidate) => candidate.word);
    const fallback = ["어떤 일을 믿고 맡김", "뜻을 전달하는 표시", "새롭게 만들어 냄", "자세히 읽음"];
    const wordFallback = ["신뢰", "발견", "정리", "관찰"];
    const isBlank = index % 2 === 1;
    const example = item.examples?.find((sentence) => sentence.includes(item.word)) || item.examples?.[0] || "";
    const blankSentence = example ? example.replaceAll(item.word, "_____") : `문장 속 빈칸에 들어갈 알맞은 어휘를 고르세요.`;
    const answer = isBlank ? item.word : item.meaning;
    const distractors = isBlank ? [...wordPool, ...wordFallback] : [...meaningPool, ...fallback];
    return {
      id: `${item.word}-${index}`,
      type: isBlank ? "blank" : "meaning",
      item,
      answer,
      prompt: isBlank ? blankSentence : `${item.word}의 뜻은?`,
      helper: isBlank ? "빈칸에 들어갈 알맞은 어휘를 고르세요." : "어휘의 뜻을 고르세요.",
      sub: `${item.hanja} · ${item.parent.character}(${item.parent.sound})`,
      choices: buildChoices(answer, distractors)
    };
  });
  return vocabItems;
}

function buildChoices(answer, distractors) {
  const uniqueDistractors = [...new Set(distractors.filter((item) => item && item !== answer))];
  return shuffle([answer, ...shuffle(uniqueDistractors).slice(0, 3)]);
}

function structureQuizItems(lesson) {
  const hanja = hanjaItems(lesson);
  if (hanja.length < 4) return [];
  const [first, second, firstHomophone, secondHomophone] = hanja;
  const pairLabel = (left, right) => `${left.character}(${left.sound} · ${left.meaning}) - ${right.character}(${right.sound} · ${right.meaning})`;
  return [
    {
      id: `relation-${lesson.day}-${lesson.level}`,
      type: "relation",
      answer: pairLabel(first, second),
      prompt: "서로 의미적으로 관계가 있는 두 한자는?",
      helper: "오늘의 1번, 2번 한자는 서로 반대되거나 짝을 이루는 관계입니다.",
      sub: hanja.map((item) => `${item.character}(${item.sound})`).join(" · "),
      choices: buildChoices(pairLabel(first, second), [
        pairLabel(first, firstHomophone),
        pairLabel(second, secondHomophone),
        pairLabel(firstHomophone, secondHomophone)
      ])
    },
    {
      id: `homophone-first-${lesson.day}-${lesson.level}`,
      type: "homophone",
      answer: pairLabel(first, firstHomophone),
      prompt: `${first.character}(${first.sound} · ${first.meaning})와 음이 같은 다른 뜻의 한자는?`,
      helper: "소리는 같지만 뜻이 다른 한자를 고르세요.",
      sub: `기준 한자: ${first.character}(${first.sound})`,
      choices: buildChoices(pairLabel(first, firstHomophone), [
        pairLabel(first, second),
        pairLabel(first, secondHomophone),
        pairLabel(second, secondHomophone)
      ])
    },
    {
      id: `homophone-second-${lesson.day}-${lesson.level}`,
      type: "homophone",
      answer: pairLabel(second, secondHomophone),
      prompt: `${second.character}(${second.sound} · ${second.meaning})와 음이 같은 다른 뜻의 한자는?`,
      helper: "소리는 같지만 뜻이 다른 한자를 고르세요.",
      sub: `기준 한자: ${second.character}(${second.sound})`,
      choices: buildChoices(pairLabel(second, secondHomophone), [
        pairLabel(first, second),
        pairLabel(second, firstHomophone),
        pairLabel(firstHomophone, secondHomophone)
      ])
    }
  ];
}

export function upsertLesson(curriculum, lesson) {
  const next = [...curriculum];
  const lessonLevel = String(lesson.level || "").trim();
  const index = next.findIndex((item) => Number(item.day) === Number(lesson.day) && String(item.level || "").trim() === lessonLevel);
  if (index >= 0) next[index] = lesson;
  else next.push(lesson);
  return next.sort((a, b) => levelOrder(a.level) - levelOrder(b.level) || Number(a.day) - Number(b.day));
}

function levelOrder(level) {
  const order = { 초급: 1, 중급: 2, 고급: 3 };
  return order[String(level || "").trim()] || 99;
}

export function validateHanjaSet(hanjaSet, context = "한자 묶음") {
  const errors = [];
  if (!Array.isArray(hanjaSet) || !hanjaSet.length) {
    return [`${context}: 한자 묶음은 1개 이상의 배열이어야 합니다.`];
  }

  hanjaSet.forEach((hanja, index) => {
    const label = `${context} ${index + 1}번째 한자`;
    ["character", "sound", "meaning", "origin"].forEach((field) => {
      if (!String(hanja?.[field] || "").trim()) errors.push(`${label}: ${field} 항목이 필요합니다.`);
    });

    if (!Array.isArray(hanja?.vocab) || !hanja.vocab.length) {
      errors.push(`${label}: 어휘가 1개 이상 필요합니다.`);
      return;
    }

    hanja.vocab.forEach((word, wordIndex) => {
      const wordLabel = `${label}의 ${wordIndex + 1}번째 어휘`;
      ["hanja", "word", "meaning"].forEach((field) => {
        if (!String(word?.[field] || "").trim()) errors.push(`${wordLabel}: ${field} 항목이 필요합니다.`);
      });

      const examples = word?.examples || (word?.example ? [word.example] : []);
      if (!Array.isArray(examples) || !examples.some((item) => String(item || "").trim())) {
        errors.push(`${wordLabel}: 예문이 1개 이상 필요합니다.`);
      }
    });
  });

  return errors;
}

export function validateLesson(lesson) {
  const errors = [];
  if (!Number(lesson?.day)) errors.push("일차 번호가 필요합니다.");
  if (!Number(lesson?.dailyCount)) errors.push("일일 한자 수가 필요합니다.");
  return [...errors, ...validateHanjaSet(lesson?.hanjaSet, `${lesson?.day || "?"}일차`)];
}

export function assertValidLesson(lesson) {
  const errors = validateLesson(lesson);
  if (errors.length) throw new Error(errors.slice(0, 6).join("\n"));
  return lesson;
}

export function validateAppStateShape(state) {
  const errors = [];
  if (!Array.isArray(state?.students)) errors.push("students 배열이 필요합니다.");
  if (!Array.isArray(state?.curriculum)) errors.push("curriculum 배열이 필요합니다.");
  if (!state?.progress || typeof state.progress !== "object") errors.push("progress 객체가 필요합니다.");
  if (Array.isArray(state?.curriculum)) {
    state.curriculum.forEach((lesson) => errors.push(...validateLesson(lesson)));
  }
  return errors;
}

export function extractJsonText(rawText) {
  const text = String(rawText || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((index) => index >= 0);
  if (!starts.length) return text;
  const start = Math.min(...starts);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return end > start ? text.slice(start, end + 1).trim() : text;
}

export function parseAiLessons(rawText) {
  const parsed = JSON.parse(extractJsonText(rawText));
  const lessons = Array.isArray(parsed) ? parsed : parsed.curriculum;
  if (!Array.isArray(lessons) || !lessons.length) throw new Error("curriculum 배열이 필요합니다.");
  return lessons.map((lesson) =>
    assertValidLesson({
      ...lesson,
      day: Number(lesson.day),
      dailyCount: Number(lesson.dailyCount || lesson.hanjaSet?.length || 4),
      hanjaSet: Array.isArray(lesson.hanjaSet) ? lesson.hanjaSet : []
    })
  );
}

export function buildAiPrompt({ grade, level, startDay, days }) {
  return [
    "너는 초등학생 한자 어휘 학습 프로그램의 커리큘럼 설계자다.",
    `대상: ${grade}, 난이도: ${level}`,
    `시작 일차: ${startDay}일차, 생성 일수: ${days}일`,
    "",
    "규칙:",
    "1. 하루 한자 4개로 구성한다.",
    "2. 1, 2번째 한자는 관계성이 있는 두 한자다. 예: 높을 고-낮을 저.",
    "3. 3번째 한자는 1번째 한자와 음이 같고 뜻이 다른 한자다.",
    "4. 4번째 한자는 2번째 한자와 음이 같고 뜻이 다른 한자다.",
    "5. 각 한자마다 어휘 2개 이상, 각 어휘마다 초등학생에게 자연스러운 용례 3개를 넣는다.",
    "6. 설명은 초등학생이 이해할 수 있게 짧고 정확하게 쓴다.",
    "",
    "JSON만 출력한다. 형식:",
    '{"curriculum":[{"day":1,"grade":"3학년","level":"초급","dailyCount":4,"hanjaSet":[{"character":"高","sound":"고","meaning":"높다","radical":"高","relation":"관계 한자 설명","origin":"형성 원리","vocab":[{"hanja":"高度","word":"고도","meaning":"뜻","examples":["문장1","문장2","문장3"]}]}]}]}'
  ].join("\n");
}

export function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}
