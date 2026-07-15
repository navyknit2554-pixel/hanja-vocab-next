export const storageKey = "hanja-vocab-next-state-v1";

export const seedState = {
  students: [
    { id: "s1", loginId: "minjun01", password: "1234", name: "김민준", grade: "3학년", level: "초급", day: 1 },
    { id: "s2", loginId: "harin01", password: "1234", name: "박하린", grade: "3학년", level: "초급", day: 1 },
    { id: "s3", loginId: "doyun01", password: "1234", name: "최도윤", grade: "4학년", level: "중급", day: 2 }
  ],
  progress: {
    s1: { completed: { 1: false }, quiz: { 1: { correct: 0, total: 0, wrong: [], wrongHistory: [], attempts: 0, mastered: false } } },
    s2: { completed: { 1: true }, quiz: { 1: { correct: 4, total: 4, wrong: [], wrongHistory: ["신용"], attempts: 1, mastered: true } } },
    s3: { completed: { 2: false }, quiz: { 2: { correct: 2, total: 3, wrong: ["독서"], wrongHistory: ["독서"], attempts: 1, mastered: false } } }
  },
  curriculum: [
    {
      day: 1,
      grade: "3학년",
      level: "초급",
      dailyCount: 4,
      hanjaSet: [
        {
          character: "高",
          sound: "고",
          meaning: "높다",
          radical: "高",
          relation: "관계 한자: 낮을 저(低)와 반대 의미",
          origin: "높은 누각의 모양에서 비롯되어 높은 곳이나 뛰어난 정도를 나타냅니다.",
          vocab: [
            { hanja: "高度", word: "고도", meaning: "높이 또는 수준", examples: ["비행기는 높은 고도로 올라갔다.", "이 문제는 고도의 집중력이 필요하다.", "과학 기술이 고도로 발달했다."] },
            { hanja: "最高", word: "최고", meaning: "가장 높거나 으뜸", examples: ["우리 팀은 최고 기록을 세웠다.", "친구는 오늘 최고로 멋진 발표를 했다.", "산 정상에서 보는 풍경은 최고였다."] }
          ]
        },
        {
          character: "低",
          sound: "저",
          meaning: "낮다",
          radical: "亻",
          relation: "관계 한자: 높을 고(高)와 반대 의미",
          origin: "사람 인(亻)이 들어가 사람의 자세나 위치가 낮은 상태를 나타냅니다.",
          vocab: [
            { hanja: "低溫", word: "저온", meaning: "낮은 온도", examples: ["음식은 저온에서 보관해야 한다.", "저온 현상 때문에 꽃이 늦게 피었다.", "실험 재료를 저온 상태로 유지했다."] },
            { hanja: "低學年", word: "저학년", meaning: "낮은 학년", examples: ["저학년 학생들은 먼저 운동장에 모였다.", "이 책은 저학년이 읽기 쉽게 쓰였다.", "저학년 교실은 1층에 있다."] }
          ]
        },
        {
          character: "苦",
          sound: "고",
          meaning: "쓰다, 괴롭다",
          radical: "艹",
          relation: "같은 음 다른 뜻: 높을 고(高)와 소리는 같지만 뜻이 다름",
          origin: "풀 초(艹)와 오래될 고(古)가 결합되어 쓴맛이나 괴로운 느낌을 나타냅니다.",
          vocab: [
            { hanja: "苦心", word: "고심", meaning: "몹시 애를 쓰며 깊이 생각함", examples: ["선생님은 좋은 방법을 찾기 위해 고심했다.", "나는 발표 주제를 정하느라 고심했다.", "팀원들은 문제 해결을 위해 함께 고심했다."] },
            { hanja: "苦生", word: "고생", meaning: "어렵고 힘든 일을 겪음", examples: ["먼 길을 오느라 모두 고생했다.", "부모님은 우리를 위해 많은 고생을 하셨다.", "친구는 연습하느라 고생했지만 결국 성공했다."] }
          ]
        },
        {
          character: "楮",
          sound: "저",
          meaning: "닥나무",
          radical: "木",
          relation: "같은 음 다른 뜻: 낮을 저(低)와 소리는 같지만 뜻이 다름",
          origin: "나무 목(木)이 들어가 종이의 재료가 되는 닥나무와 관련됩니다.",
          vocab: [
            { hanja: "楮紙", word: "저지", meaning: "닥나무 껍질로 만든 종이", examples: ["옛 문서는 질긴 저지에 기록되었다.", "장인은 저지를 이용해 전통 공예품을 만들었다.", "박물관에서 오래된 저지를 살펴보았다."] },
            { hanja: "楮皮", word: "저피", meaning: "닥나무 껍질", examples: ["저피는 한지를 만드는 재료로 쓰인다.", "장인은 저피를 물에 불려 섬유를 골랐다.", "저피의 섬유는 질기고 오래간다."] }
          ]
        }
      ]
    },
    {
      day: 2,
      grade: "3학년",
      level: "초급",
      dailyCount: 1,
      hanjaSet: [
        {
          character: "讀",
          sound: "독",
          meaning: "읽다",
          radical: "言",
          relation: "말씀 언(言)이 들어간 한자",
          origin: "말씀 언(言)이 들어가 글을 소리 내거나 뜻을 살피며 읽는 활동과 관련됩니다.",
          vocab: [
            { hanja: "讀書", word: "독서", meaning: "책을 읽음", examples: ["지우는 매일 저녁 독서를 한다.", "독서는 새로운 생각을 만나는 좋은 방법이다.", "우리 반은 아침마다 10분 독서 시간을 가진다."] },
            { hanja: "朗讀", word: "낭독", meaning: "글을 소리 내어 읽음", examples: ["대표 학생이 시를 낭독했다.", "동생은 동화책을 또박또박 낭독했다.", "낭독을 하면 글의 분위기를 더 잘 느낄 수 있다."] },
            { hanja: "熟讀", word: "숙독", meaning: "글을 자세히 읽음", examples: ["문제를 풀기 전 지문을 숙독해야 한다.", "안내문을 숙독한 뒤 신청서를 작성했다.", "중요한 계약서는 내용을 숙독하고 서명해야 한다."] },
            { hanja: "購讀", word: "구독", meaning: "책이나 신문 등을 정기적으로 받아 봄", examples: ["우리 반은 어린이 신문을 구독한다.", "아버지는 과학 잡지를 구독하고 계신다.", "동영상 채널을 구독하면 새 소식을 받을 수 있다."] }
          ]
        }
      ]
    }
  ]
};

export function cloneSeed() {
  return JSON.parse(JSON.stringify(seedState));
}
