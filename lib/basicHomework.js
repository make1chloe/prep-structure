/**
 * 기본 학습 항목 — 노션 「기본숙제」를 옮겨온 것
 *
 * 노션 3재원생DB 는 학생 한 명당 한 줄이고, 칸이 이렇게 짝을 이룬다.
 *
 *   단어숙제 / 단어학습     독해숙제 / 독해학습     문법숙제 / 문법학습
 *   영작숙제 / 영작학습     듣기숙제 / 듣기학습     노트숙제 / 노트학습
 *   내신문제숙제 / 내신문제학습   내신온라인숙제 / 내신온라인학습
 *   내신워크북학습(학습만)   특강숙제(숙제만)
 *
 * 「숙제」칸은 집에서 하는 것, 「학습」칸은 등원해서 학원에서 하는 것이다.
 * 이 앱에서는 그 둘이 **각각 다른 학습 항목**이다 (0035 참고).
 *
 * 노션에는 학생마다 긴 문장이 적혀 있었다. 그 문장들은 결국 몇 가지가
 * 반복되는 것이라, 반복되는 **행위**만 항목으로 뽑고 학생마다 달라지는
 * 부분(교재 이름 · 몇 단원 · 몇 점)은 여기 넣지 않았다. 그건 교재와
 * 단원에서 나온다.
 *
 * kind
 *   home     집에서 하는 숙제
 *   inclass  등원해서 학원에서 하는 학습
 *
 * pair
 *   등원 학습을 **숙제로 낼 때 대신 쓰는 항목** (0048 home_item_id).
 *   구두테스트는 원장님이 앞에 있어야 하니 집에서는 셀프녹음으로 낸다.
 *
 * inPerson
 *   앱에 낼 것이 없어 **직접 보고 검사**하는 것 (0063).
 *   나머지는 전부 사진이든 녹음이든 낸다 — 안 내면 미제출이다.
 */

export const BASIC_HOMEWORK = [
  // ---------------- 단어 ----------------
  {
    name: "단어 클래스카드 필수학습",
    category: "단어",
    kind: "home",
    method:
      "진도에 맞춰 필수학습을 끝까지 완료합니다.\n" +
      "· 암기 · 리콜 100% 까지\n" +
      "· 다의어는 뜻을 모두 써야 정답입니다\n" +
      "· 등원 전까지 완료",
  },
  {
    name: "단어 교재 풀고 채점",
    category: "단어",
    kind: "home",
    method:
      "정해진 day 만큼 교재를 풀고 **채점까지** 해옵니다.\n" +
      "· 틀린 단어는 표시해 두기",
  },
  {
    name: "단어 셀프테스트 (워크북)",
    category: "단어",
    kind: "home",
    method:
      "등원 전에 단어워크북으로 스스로 시험을 보고 채점합니다.\n" +
      "· 채점까지 끝낸 것을 찍어서 냅니다",
  },
  {
    name: "단어 스펠 100% (재도전)",
    category: "단어",
    kind: "home",
    method: "단어시험에 통과하지 못해 추가로 나가는 숙제입니다. 스펠 100% 까지.",
  },
  {
    name: "단어테스트",
    category: "단어",
    kind: "inclass",
    method:
      "수업 시작에 보는 단어시험입니다.\n" +
      "· 틀린 단어는 본인 교재에 표시\n" +
      "· 시험지에 틀린 개수를 써서 제출",
  },
  {
    name: "틀린 단어 쓰기",
    category: "단어",
    kind: "inclass",
    inPerson: true,
    method:
      "시험에 통과하지 못했거나 숙제를 안 해온 경우, 통과했더라도 틀린 단어를\n" +
      "영어 + 한글 10번씩 쓰고 갑니다.",
  },

  // ---------------- 독해 ----------------
  {
    name: "독해 지문 예습",
    category: "독해",
    kind: "home",
    method:
      "· 지문과 문제에서 모르는 단어를 찾아 뜻 쓰기\n" +
      "· 문제 풀고 채점\n" +
      "· 채점하고 나서 애매했던 것은 세모, 틀린 것은 별표",
  },
  {
    name: "독해 해석쓰기",
    category: "독해",
    kind: "home",
    method:
      "워크시트(또는 교재)에 해석을 씁니다.\n" +
      "· 끊어읽기 · 기호 표시까지 같이",
  },
  {
    name: "독해 기호표시 + QR 채점",
    category: "독해",
    kind: "home",
    method: "기호 표시를 직접 해본 뒤 QR코드로 채점하고, 세모 · 별표까지 표시합니다.",
  },
  {
    name: "독해 클래스카드 (낭독·녹음·암기)",
    category: "독해",
    kind: "home",
    method:
      "· 낭독 / 녹음 100%\n" +
      "· 암기 100%\n" +
      "· 스크램블 목표 점수 (복습이면 지난 점수 경신)",
  },
  {
    name: "독해 동시통역 녹음",
    category: "독해",
    kind: "home",
    method: "동시통역 step2 를 3번씩 녹음해서 인증합니다.",
  },
  {
    name: "독해 워크북 풀기",
    category: "독해",
    kind: "home",
    method: "복습으로 워크북 문제를 풉니다.",
  },
  {
    name: "독해 실전 문제풀기 (시간재기)",
    category: "독해",
    kind: "home",
    method:
      "시간을 재고 풉니다.\n" +
      "· 정답의 근거와 오답의 이유를 선택지마다 표시",
  },
  {
    name: "독해 유형별 해결전략 정리",
    category: "독해",
    kind: "home",
    method:
      "· 해결전략 · 기출총정리를 읽고 형광펜 표시\n" +
      "· 문답노트 형식으로 정리\n" +
      "· Check Up 문제 풀고 채점 + 근거 작성",
  },
  {
    name: "의미덩어리 암기",
    category: "독해",
    kind: "home",
    method: "의미덩어리는 늘 외워둡니다.",
  },
  {
    name: "직독직해 · 스피킹",
    category: "독해",
    kind: "inclass",
    pair: "독해 클래스카드 (낭독·녹음·암기)",
    method:
      "클래스카드 3+0\n" +
      "· 직독직해 입해석\n" +
      "· 스피킹 낭독\n" +
      "· 스피킹 녹음",
  },
  {
    name: "SVOCM 표시하고 제출",
    category: "독해",
    kind: "inclass",
    method: "교재 채점 · 해석 채점을 하고, SVOCM 을 고쳐서 제출합니다.",
  },
  {
    name: "독해 숙제채점",
    category: "독해",
    kind: "inclass",
    inPerson: true,
    method: "지난 시간에 나간 독해 숙제를 학원에서 같이 채점합니다.",
  },

  // ---------------- 문법 ----------------
  {
    name: "문법 개념 정독 · 문답노트 정리",
    category: "문법",
    kind: "home",
    method:
      "· 설명을 읽고 중요한 곳에 형광펜\n" +
      "· 개념노트에 **문답노트 형식**으로 요약 정리",
  },
  {
    name: "문법 강의 듣고 정리",
    category: "문법",
    kind: "home",
    method: "클래스카드 → 문법강의를 듣고, 문답노트 형식으로 정리합니다.",
  },
  {
    name: "셀프녹음테스트 (문답노트)",
    category: "문법",
    kind: "home",
    method:
      "문답노트를 이용해 스스로 구두테스트를 3회 하고 녹음해서 인증합니다.\n" +
      "· 보지 않고 말할 수 있을 때까지",
  },
  {
    name: "클래스카드 문법훈련",
    category: "문법",
    kind: "home",
    method: "클래스카드 → 문법훈련을 끝까지 완료합니다.",
  },
  {
    name: "문법 문제풀기",
    category: "문법",
    kind: "home",
    method: "본교재 문제를 풉니다.",
  },
  {
    name: "문법 워크북 풀기",
    category: "문법",
    kind: "home",
    method: "본교재가 끝난 단원의 워크북을 풉니다.",
  },
  {
    name: "ISL 100점",
    category: "문법",
    kind: "home",
    method: "ISL 에서 100점을 받을 때까지 다시 합니다.",
  },
  {
    name: "단원평가 대비 복습",
    category: "문법",
    kind: "home",
    method: "다음 수업 단원평가에 대비해 개념노트와 틀린 문제를 다시 봅니다.",
  },
  {
    name: "구두테스트 (문답노트)",
    category: "문법",
    kind: "inclass",
    pair: "셀프녹음테스트 (문답노트)",
    inPerson: true,
    method: "문답노트에서 10문제를 구두로 물어봅니다.",
  },
  {
    name: "문법 숙제채점",
    category: "문법",
    kind: "inclass",
    inPerson: true,
    method: "지난 시간에 나간 문법 숙제를 학원에서 같이 채점합니다.",
  },
  {
    name: "단원평가",
    category: "문법",
    kind: "inclass",
    method: "한 단원이 끝나면 학원에서 단원평가를 봅니다.",
  },

  // ---------------- 영작 ----------------
  {
    name: "영작 개념 정독 + 문제풀기",
    category: "영작",
    kind: "home",
    method:
      "· 설명을 꼼꼼히 읽고 형광펜 표시\n" +
      "· 정해진 분량만큼 문제풀기",
  },
  {
    name: "영작 워크북 풀기",
    category: "영작",
    kind: "home",
    method: "본교재 진도에 맞춰 워크북(빌드업노트)을 풉니다.",
  },
  {
    name: "영어문장 쓰기 (서술형)",
    category: "영작",
    kind: "home",
    method: "서술형제패 · 3300제 등, 정해진 분량의 문장 쓰기를 합니다.",
  },
  {
    name: "클래스5 과제",
    category: "영작",
    kind: "inclass",
    method:
      "· 오늘 출제된 과제 완료\n" +
      "· 워크시트 풀기\n" +
      "· 스피킹 점수가 70점 이하면 재도전",
  },
  {
    name: "영작 숙제채점",
    category: "영작",
    kind: "inclass",
    inPerson: true,
    method: "지난 시간에 나간 영작 숙제를 학원에서 같이 채점합니다.",
  },

  // ---------------- 듣기 ----------------
  {
    name: "듣기 문제풀기 + 딕테이션",
    category: "듣기",
    kind: "home",
    method:
      "· 정해진 문항 수만큼 풀기\n" +
      "· 빈칸 없이 딕테이션\n" +
      "· 채점까지",
  },
  {
    name: "듣기 숙제채점",
    category: "듣기",
    kind: "inclass",
    inPerson: true,
    method: "지난 시간에 나간 듣기 숙제를 학원에서 같이 채점합니다.",
  },

  // ---------------- 노트 ----------------
  {
    name: "문법 오답노트",
    category: "노트",
    kind: "home",
    method:
      "별표 또는 틀린 문제를 오답노트에 씁니다.\n" +
      "· 영어 문장 · 해석 · 정답의 근거\n" +
      "· 못 쓰겠는 문제는 사진을 찍어서 물어보세요",
  },
  {
    name: "독해 오답노트",
    category: "노트",
    kind: "home",
    method: "별표 문제의 문장 · 해석 · SVOCM 을 오답노트에 씁니다.",
  },
  {
    name: "노트 검사",
    category: "노트",
    kind: "inclass",
    inPerson: true,
    method: "개념노트 · 오답노트를 가져오면 그 자리에서 넘겨봅니다.",
  },

  // ---------------- 내신 ----------------
  {
    name: "내신 온라인 회독",
    category: "내신",
    kind: "home",
    method: "내신 온라인 자료를 정해진 회독 수만큼 봅니다.",
  },
  {
    name: "내신 문제풀기",
    category: "내신",
    kind: "home",
    method: "내신 대비 문제를 풀고 채점합니다.",
  },
  {
    name: "내신 워크북",
    category: "내신",
    kind: "inclass",
    method: "학원에서 내신 워크북을 풉니다.",
  },
  {
    name: "내신 숙제채점",
    category: "내신",
    kind: "inclass",
    inPerson: true,
    method: "지난 시간에 나간 내신 숙제를 학원에서 같이 채점합니다.",
  },

  // ---------------- 특강 ----------------
  {
    name: "특강 복습 (빈칸 프린트)",
    category: "특강",
    kind: "home",
    method: "숙제 프린트의 빈칸을 채우면서 복습합니다.",
  },
  {
    name: "특강 클래스카드 테스트",
    category: "특강",
    kind: "home",
    method: "클래스카드 테스트를 3번 해봅니다 (목표 점수는 없습니다).",
  },
  {
    name: "특강 예습 정독",
    category: "특강",
    kind: "home",
    method: "다음 unit 설명을 미리 꼼꼼히 읽어옵니다.",
  },
];

/** 등원 학습 → 숙제로 낼 때 바뀌는 항목 (0048 home_item_id) */
export function pairs() {
  return BASIC_HOMEWORK.filter((i) => i.pair).map((i) => ({ from: i.name, to: i.pair }));
}

/**
 * 넣을 순서. 분류 순서대로 10씩 띄워서, 그 안에서는 적어둔 순서대로.
 * 나중에 손으로 끼워 넣을 자리를 남긴다.
 */
export function withSort(list = BASIC_HOMEWORK) {
  const order = ["단어", "독해", "문법", "영작", "듣기", "노트", "내신", "특강", "기타"];
  const seen = new Map();
  return list.map((i) => {
    const base = (order.indexOf(i.category) + 1) * 1000;
    const n = (seen.get(i.category) || 0) + 1;
    seen.set(i.category, n);
    return { ...i, sort: base + n * 10 };
  });
}
