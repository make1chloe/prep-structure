/**
 * **시험 목록을 읽을 수 있게** — 연도·학기 · 정렬 · 거르기.
 *
 * 원장님 (2026-08-06)
 *   「시험목록 정돈이 필요해. 이름별 정렬, 학교별 필터 등」
 *   「시험 연도 학기 구별이 안 되고, 전국연합학력평가는 대비하는 시험이
 *    아니라서 일정만 확인하면 되고 시험범위자료는 필요없어」
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────
 *
 * 나이스에서 받아오면 시험이 **학교 수 × 학년 수 × 회차** 만큼 쏟아진다.
 * 그런데 목록은 날짜순 한 줄로만 늘어서 있었고, 화면에 적히는 것은 「10.14 ~
 * 10.17」 처럼 **월·일뿐**이었다. 그래서 —
 *
 *   · **몇 년도 것인지 모른다.** 작년 2학기와 올해 2학기가 같은 얼굴이다
 *   · **학교를 찾으려면 눈으로 훑어야 한다**
 *   · 전국연합학력평가가 학교 내신들 사이에 섞여서, 범위를 안 넣었다고
 *     계속 재촉당한다 — **그건 범위를 넣을 시험이 아니다**
 *
 * 여기에는 **계산만** 둔다.
 */

/**
 * **전국연합학력평가·모의고사인가.**
 *
 * 원장님 — 「전국연합학력평가는 대비하는 시험이 아니라서 일정만 확인하면
 * 되고 시험범위자료는 필요없어」
 *
 * 내신은 범위가 있고 그 범위로 대비를 한다. 모의고사는 범위가 없다 —
 * 그동안 배운 전부가 범위다. 그래서 **「범위를 안 넣으셨어요」 를 안 띄운다.**
 * 안 그러면 재촉이 늘 켜져 있게 되고, 늘 켜진 경고는 안 보이는 경고가 된다.
 *
 * 이름으로 가른다. 나이스가 주는 이름이 학교마다 조금씩 다르다 —
 * 「전국연합학력평가」 · 「전국연합」 · 「모의고사」 · 「학력평가」.
 */
export function isMockExam(exam = {}) {
  const t = `${exam.name || ""} ${exam.neis_name || ""}`;
  return /전국\s*연합|학력\s*평가|모의\s*고사|모평|수능/.test(t);
}

/** 범위 자료를 넣어야 하는 시험인가 (모의고사는 아니다) */
export const needsScope = (exam) => !isMockExam(exam);

/**
 * **몇 년 몇 학기 시험인가.**
 *
 * 연도는 시험 날짜에서 온다 (이름에는 대개 없다). 학기는 이름에 적혀 있으면
 * 그것이 이기고, 없으면 **달로 가른다** — 3~7월이 1학기, 8~12월이 2학기다.
 * 1·2월은 앞 학년도의 2학기 끝자락이라 2학기로 둔다.
 */
export function termOf(exam = {}) {
  const d = exam.from_date || exam.to_date || exam.english_on || "";
  const year = d ? Number(d.slice(0, 4)) : null;
  const month = d ? Number(d.slice(5, 7)) : null;

  const name = exam.name || "";
  let half = null;
  if (/1\s*학기/.test(name)) half = 1;
  else if (/2\s*학기/.test(name)) half = 2;
  else if (month) half = month >= 3 && month <= 7 ? 1 : 2;

  // 「중간」 「기말」 을 이름에서 뽑아둔다 — 뱃지에 같이 적으면 한눈에 갈린다
  const round = /기말/.test(name) ? "기말" : /중간/.test(name) ? "중간" : null;

  return { year, half, round };
}

/** 뱃지에 적을 한 줄 — 「26년 2학기 중간」 */
export function termLabel(exam = {}) {
  const { year, half, round } = termOf(exam);
  const bits = [];
  if (year) bits.push(`${String(year).slice(2)}년`);
  if (half) bits.push(`${half}학기`);
  if (round) bits.push(round);
  return bits.join(" ");
}

/** 학년을 차례대로 (초1 … 중3 … 고3, 안 적은 것은 「전체」 라 맨 앞) */
function gradeRank(g) {
  const s = (g || "").trim();
  if (!s) return -1;                                  // 전체
  const m = s.match(/(초|중|고)\s*(\d)/);
  if (!m) return 99;
  return { 초: 0, 중: 10, 고: 20 }[m[1]] + Number(m[2]);
}

const byName = (a, b) => (a ?? "").toString().localeCompare((b ?? "").toString(), "ko");

export const EXAM_SORTS = [
  { key: "date", label: "날짜", hint: "기본 — 가까운 것부터" },
  { key: "school", label: "학교 › 학년" },
  { key: "name", label: "시험 이름" },
];

export const EXAM_SORT_DEFAULT = { key: "date", dir: "asc" };

/**
 * 시험을 늘어세운다. **값이 같으면 늘 날짜로 갈라준다** — 안 그러면
 * 열 때마다 차례가 달라져서 「방금 거기 있었는데」 가 생긴다.
 */
export function sortExams(list = [], { key, dir } = EXAM_SORT_DEFAULT) {
  const date = (e) => e.from_date || e.to_date || "";
  const cmp = (a, b) => {
    if (key === "school") {
      return byName(a.school, b.school) || gradeRank(a.grade) - gradeRank(b.grade) || date(a).localeCompare(date(b));
    }
    if (key === "name") {
      return byName(a.name, b.name) || byName(a.school, b.school) || date(a).localeCompare(date(b));
    }
    return date(a).localeCompare(date(b)) || byName(a.school, b.school);
  };
  return [...list].sort((a, b) => (dir === "desc" ? -cmp(a, b) : cmp(a, b)));
}

/**
 * 거르기 — 학교 · 연도 · 종류 · 검색어.
 *
 * @param kind  "all" | "school"(내신) | "mock"(전국연합·모의고사)
 */
export function filterExams(list = [], { school = "", year = "", kind = "all", q = "" } = {}) {
  const kw = (q || "").trim().toLowerCase();
  return list.filter((e) => {
    if (school && (e.school || "") !== school) return false;
    if (year && String(termOf(e).year || "") !== String(year)) return false;
    if (kind === "mock" && !isMockExam(e)) return false;
    if (kind === "school" && isMockExam(e)) return false;
    if (!kw) return true;
    return [e.school, e.grade, e.name, e.note].some((v) =>
      (v || "").toString().toLowerCase().includes(kw)
    );
  });
}

/** 목록에 실제로 있는 학교들 · 연도들 (거르기 칸을 채우는 데 쓴다) */
export function facetsOf(list = []) {
  const schools = [...new Set(list.map((e) => (e.school || "").trim()).filter(Boolean))].sort(byName);
  const years = [...new Set(list.map((e) => termOf(e).year).filter(Boolean))].sort((a, b) => b - a);
  return { schools, years };
}
