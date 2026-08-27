/**
 * **모의고사 표준 문항표** — 45문항이 무엇을 묻는가.
 *
 * ── 왜 코드에 박아두나 (2026-08-06) ──────────────────────────
 *
 * 원장님이 주신 엑셀(JS English 모의고사 5회)의 정답DB 를 뜯어보니
 * **고1·고2·고3 × 5회 = 675문항의 구성이 한 글자도 다르지 않았다.**
 * 모의고사는 어느 학년 몇 월이든 1~17번이 듣기이고 29번이 어법이다.
 *
 * 그러면 **문항표를 적을 이유가 없다.** 틀린 번호만 알면
 *   14번 → 듣기 · 긴 대화 응답
 *   34번 → 독해 · 빈칸추론
 * 가 바로 나오고, 영역별 정답률이 계산된다.
 *
 * 노션 오답분석DB 11줄에는 문항 정의가 아예 없다 — 번호와 「왜 틀렸나」
 * 뿐이다. 문항표를 반드시 요구했다면 그 11줄이 못 들어온다.
 * **모의고사는 앱이 알고, 내신은 시험지마다 적는다** (exam_questions).
 *
 * ── 다만 「거의」 안 바뀐다 ─────────────────────────────────
 *
 * 원장님 (2026-08-06)
 *   「거의 안 바뀌긴 하는데, 18번은 목적 이런 식으로 유형이 정해져 있긴 한데
 *    상황에 따라 모의고사 유형은 바뀔 수 있어.
 *    기본값을 세팅하되, 수정 가능하게 해줘」
 *
 * 그래서 이 표는 **바닥값**이지 정답이 아니다. 세 겹으로 찾는다 —
 *
 *   1. 그 회차의 문항표   exam_questions   이번 시험만 다를 때
 *   2. 학원 기본 문항표   exam_spec_rows   앞으로 계속 이렇게 갈 때
 *   3. 여기               MOCK_SPEC        아무것도 안 하셔도 도는 값
 *
 * 코드를 고치러 와야 하는 구조는 결국 안 고쳐진다. 그래서 화면에서
 * 고칠 수 있게 두고, 여기는 **처음 한 번을 안 하셔도 되게** 하는 자리다.
 */

/** 듣기 1~17 — 분석 영역은 통째로 「듣기」다 */
const LISTEN = [
  "말의 목적", "의견", "말의 요지", "그림 내용 불일치", "할 일",
  "지불 금액", "이유", "언급되지 않은 내용", "내용 불일치", "도표 조건 선택",
  "짧은 대화 응답", "짧은 대화 응답", "긴 대화 응답", "긴 대화 응답",
  "상황에 적절한 말", "주제", "언급 여부",
];

/** 독해 18~45 — [분석영역, 세부유형] */
const READ = [
  ["대의파악", "글의 목적"], ["대의파악", "심경 변화"], ["대의파악", "필자의 주장"],
  ["대의파악", "함축 의미"], ["대의파악", "글의 요지"], ["대의파악", "글의 주제"],
  ["대의파악", "글의 제목"],
  ["세부정보파악", "도표 내용"], ["세부정보파악", "내용 불일치"],
  ["세부정보파악", "안내문 불일치"], ["세부정보파악", "안내문 일치"],
  ["어법", "어법"],
  ["어휘", "어휘"],
  ["빈칸추론", "빈칸 추론"], ["빈칸추론", "빈칸 추론"],
  ["빈칸추론", "빈칸 추론"], ["빈칸추론", "빈칸 추론"],
  ["간접쓰기", "무관한 문장"], ["간접쓰기", "글의 순서"], ["간접쓰기", "글의 순서"],
  ["간접쓰기", "문장 삽입"], ["간접쓰기", "문장 삽입"], ["간접쓰기", "요약문"],
  ["장문독해", "장문 제목"], ["장문독해", "장문 어휘"], ["장문독해", "장문 순서"],
  ["장문독해", "지칭 추론"], ["장문독해", "장문 내용 불일치"],
];

/** 화면에 늘 같은 차례로 보이도록 (막대 순서가 회차마다 바뀌면 못 읽는다) */
export const TOPICS = [
  "듣기", "대의파악", "세부정보파악", "어법", "어휘", "빈칸추론", "간접쓰기", "장문독해",
];

/** 모의고사 45문항 — [{ no, area, topic, detail }] */
export const MOCK_SPEC = [
  ...LISTEN.map((detail, i) => ({ no: i + 1, area: "듣기", topic: "듣기", detail })),
  ...READ.map(([topic, detail], i) => ({ no: i + 18, area: "독해", topic, detail })),
];

/**
 * **왜 틀렸나** — 노션 폼에서 쓰시던 그대로.
 *
 * 아이가 고르는 말이라 바꾸지 않는다. 「어휘력 부족」 같은 말로 다듬으면
 * 아이가 자기 얘기 같지 않아서 아무거나 찍는다.
 */
export const REASONS = [
  { key: "단어를 몰랐어요", tone: "tag-amber", fix: "단어" },
  { key: "해석을 못했어요", tone: "tag-sky", fix: "독해" },
  { key: "어법을 몰랐어요", tone: "tag-lav", fix: "문법" },
  { key: "실수했어요", tone: "tag-muted", fix: "실수" },
  { key: "발음이 들리지 않았어요", tone: "tag-mint", fix: "듣기" },
  { key: "다른 문제를 푸느라 놓쳤어요", tone: "tag-muted", fix: "시간" },
  { key: "기타", tone: "tag-muted", fix: "기타" },
];

function tidy(rows) {
  return [...rows]
    .sort((a, b) => Number(a.no) - Number(b.no))
    .map((q) => ({
      no: Number(q.no),
      area: q.area || "",
      topic: q.topic || q.area || "",
      detail: q.detail || "",
      answer: q.answer || "",
      points: q.points == null || q.points === "" ? null : Number(q.points),
      unit: q.unit || "",
      source: q.source || "",
    }));
}

/**
 * 이 시험의 문항표를 고른다 — **위에서부터 있는 것을 쓴다.**
 *
 *   1. `questions`  그 회차의 문항표 (exam_questions) — 이번 시험만 다를 때
 *   2. `base`       학원 기본 문항표 (exam_spec_rows) — 앞으로 계속 이럴 때
 *   3. 코드의 표준표 (모의고사만)                      — 아무것도 안 해도 되게
 *   4. 번호만 (단원평가 · 옛 자료)
 *
 * @param kind      school | mock | unit
 * @param questions 그 회차 문항표 (없으면 [])
 * @param count     문항 수 (문항표가 하나도 없을 때 몇 번까지 만들지)
 * @param base      학원 기본 문항표 (없으면 [])
 * @returns 문항표 + `from`: 'exam' | 'base' | 'standard' | 'none'
 */
export function specFor(kind, questions = [], count = 0, base = []) {
  const mine = (questions || []).filter((q) => Number.isFinite(Number(q?.no)));
  if (mine.length > 0) return Object.assign(tidy(mine), { from: "exam" });

  const set = (base || []).filter(
    (q) => Number.isFinite(Number(q?.no)) && (!q.kind || q.kind === kind)
  );
  if (set.length > 0) return Object.assign(tidy(set), { from: "base" });

  if (kind === "mock") return Object.assign(MOCK_SPEC.map((q) => ({ ...q })), { from: "standard" });

  const n = Number(count) || 0;
  return Object.assign(
    Array.from({ length: n }, (_, i) => ({ no: i + 1, area: "", topic: "", detail: "" })),
    { from: "none" }
  );
}

/** 문항표를 어디서 가져왔는지 — 화면에 그대로 적어준다 */
export const SPEC_FROM = {
  exam: { text: "이 시험만의 문항표", tone: "tag-mint" },
  base: { text: "학원 기본 문항표", tone: "tag-sky" },
  standard: { text: "표준 문항표", tone: "tag-muted" },
  none: { text: "문항표 없음", tone: "tag-amber" },
};

/**
 * 「14,21,24, 32번」 · "21 22 23" · "1,3,8,18 번" → [14,21,24,32]
 *
 * 노션 자료에 이 세 모양이 다 있었다 (쉼표 · 빈칸 · 「번」 꼬리).
 * 못 읽으면 그 줄의 오답이 통째로 사라지므로 넉넉히 받는다.
 */
export function parseWrongNos(v) {
  const s = (v ?? "").toString();
  if (!s.trim()) return [];
  const out = [];
  for (const m of s.matchAll(/\d+/g)) {
    const n = Number(m[0]);
    if (n >= 1 && n <= 200 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * 문항표 + 틀린 번호 → **영역별 정답률**.
 *
 * @returns [{ topic, total, wrong, right, rate }]  rate 는 0~1
 */
export function byTopic(spec = [], wrongNos = []) {
  const wrong = new Set(wrongNos.map(Number));
  const bag = new Map();
  spec.forEach((q) => {
    const key = q.topic || q.area || "기타";
    if (!bag.has(key)) bag.set(key, { topic: key, total: 0, wrong: 0 });
    const b = bag.get(key);
    b.total += 1;
    if (wrong.has(q.no)) b.wrong += 1;
  });
  const known = TOPICS.filter((t) => bag.has(t)).map((t) => bag.get(t));
  const extra = [...bag.values()].filter((b) => !TOPICS.includes(b.topic));
  return [...known, ...extra].map((b) => ({
    ...b,
    right: b.total - b.wrong,
    rate: b.total > 0 ? (b.total - b.wrong) / b.total : null,
  }));
}

/** 듣기 · 독해로만 나눈 것 (리포트 맨 위 줄) */
export function byArea(spec = [], wrongNos = []) {
  const wrong = new Set(wrongNos.map(Number));
  const one = (want) => {
    const mine = spec.filter((q) => (q.area || q.topic) === want);
    if (mine.length === 0) return null;
    const bad = mine.filter((q) => wrong.has(q.no)).length;
    return { total: mine.length, wrong: bad, right: mine.length - bad, rate: (mine.length - bad) / mine.length };
  };
  return { listen: one("듣기"), read: one("독해") };
}

/** 왜 틀렸나를 센다 — [{ reason, n }] 많은 차례로 */
export function byReason(items = []) {
  const bag = new Map();
  (items || []).forEach((it) => {
    if (!it?.wrong) return;
    // 노션은 한 문항에 이유를 여럿 적을 수 있었다 ("단어를 몰랐어요, 해석을 못했어요")
    (it.reason || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((r) => bag.set(r, (bag.get(r) || 0) + 1));
  });
  return [...bag.entries()]
    .map(([reason, n]) => ({ reason, n }))
    .sort((a, b) => b.n - a.n);
}
