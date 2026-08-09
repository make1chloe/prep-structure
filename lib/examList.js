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
import { NATIONWIDE } from "./who.js";

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

  /**
   * 「중간」 「기말」 — 이름에 그 말이 없으면 **회차 숫자로** 읽는다
   * (원장님, 2026-08-08 — 「26년 2학기 따로 2차시험 따로 왜 이래」).
   *
   * 학교마다 「2차시험」 「제2차 지필평가」 「2회고사」 로 적는다. 그 말을
   * 못 읽으면 뱃지가 「26년 2학기」 에서 끊겨서, 중간인지 기말인지를
   * 다시 원래 이름을 보고 알아내야 한다 — 그게 라벨이 두 개가 된 까닭이다.
   *
   * 한 해를 1~4로 세는 학교가 있다 (3회 = 2학기 중간, 4회 = 2학기 기말).
   */
  let round = /기말/.test(name) ? "기말" : /중간/.test(name) ? "중간" : null;
  if (!round) {
    const n = name.match(/제?\s*([1-4])\s*[회차]/);
    if (n) {
      const num = Number(n[1]);
      round = num % 2 === 1 ? "중간" : "기말";
      // 3·4회는 2학기 것이다 — 학기를 이름에서 못 읽었으면 그것으로 본다
      if (num >= 3 && !/[12]\s*학기/.test(name)) half = 2;
    }
  }
  /**
   * **그래도 모르겠으면 달로 정한다** (원장님, 2026-08-08 —
   * 「26년 1학기 기말 / 26년 1학기 중간 이 양식으로만 해줘」).
   *
   * 학교가 「지필평가」 「고사」 처럼 회차도 안 적고 보내는 때가 있다.
   * 그러면 「26년 1학기」 에서 끊겨서 목록이 또 들쭉날쭉해진다.
   * 중간·기말은 달이 거의 정해져 있다 —
   *   4·5월 중간   6·7월 기말   9·10월 중간   11·12월 기말
   * 틀릴 수 있는 것은 3월과 8월뿐인데, 그 달에는 시험이 거의 없다.
   */
  if (!round && month) {
    round = [4, 5, 9, 10].includes(month) ? "중간" : "기말";
  }

  return { year, half, round };
}

/**
 * 뱃지에 적을 한 줄 — 「26년 2학기 기말」.
 *
 * **이 한 줄이면 끝이다** (원장님, 2026-08-08 — 「파란 라벨 26년 2학기 기말
 * 이거 하나면 끝나는데 뒤에 기말고사 붙고 … *년 *학기 중간 또는 기말
 * 이걸로만 정리해줘」). 화면에서 원래 이름 뱃지를 따로 안 붙인다.
 */
export function termLabel(exam = {}) {
  /**
   * **모의고사에는 학기가 없다** (원장님, 2026-08-08 — 「전국 고1이 아니고,
   * 26년 10월 고1 모의고사 이런 양식으로 써주기로 한 거 아니었어?」).
   *
   * 학기 · 중간 · 기말은 **내신** 이야기다. 모의고사에 「26년 2학기」 를
   * 붙이면 그 자리에 정작 필요한 「2026년 10월 고1 모의고사」 가 안 보인다.
   * 모의고사는 이름 자체가 연도 · 월 · 학년이라 그것으로 충분하다.
   */
  if (isMockExam(exam)) return "";
  const { year, half, round } = termOf(exam);
  const bits = [];
  if (year) bits.push(`${String(year).slice(2)}년`);
  if (half) bits.push(`${half}학기`);
  if (round) bits.push(round);
  return bits.join(" ");
}

/**
 * **화면에 적을 시험 이름 — 이것 하나만 쓴다.**
 *
 * 원장님 (2026-08-08) — 「시험명이 아직도 제각각이야.
 * 26년 1학기 기말 / 26년 1학기 중간 이 양식으로만 해줘」
 *
 * 학교마다 「기말고사」 「2차시험」 「제2차 지필평가」 로 적어 보낸다.
 * 그 글자를 화면마다 그대로 쓰면 목록이 들쭉날쭉해지고, 「우리 애 학교는
 * 저게 중간이었나」 를 매번 다시 생각하게 된다.
 *
 * 그래서 **적히는 이름은 한 모양**이다 —
 *   내신      26년 1학기 기말
 *   모의고사  2026년 3월 고1 모의고사   (이미 한 모양이라 그대로)
 *
 * 학교가 뭐라고 적었는지는 지워지지 않는다 (표의 name 은 그대로다).
 */
export function examTitle(exam = {}) {
  if (isMockExam(exam)) return exam.name || "모의고사";
  return termLabel(exam) || exam.name || "시험";
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
  { key: "term", label: "시험 묶음", hint: "기본 — 1학기 기말 · 2학기 중간 …" },
  { key: "date", label: "날짜" },
  { key: "school", label: "학교 › 학년" },
  { key: "name", label: "시험 이름" },
];

export const EXAM_SORT_DEFAULT = { key: "term", dir: "asc" };

/**
 * 시험을 늘어세운다. **값이 같으면 늘 날짜로 갈라준다** — 안 그러면
 * 열 때마다 차례가 달라져서 「방금 거기 있었는데」 가 생긴다.
 */
export function sortExams(list = [], { key, dir } = EXAM_SORT_DEFAULT) {
  const date = (e) => e.from_date || e.to_date || "";
  const cmp = (a, b) => {
    if (key === "term") {
      // 묶음 안에서는 날짜순, 같은 날이면 학교 이름순 (묶는 것은 groupExams 가 한다)
      return groupKey(a).localeCompare(groupKey(b)) || date(a).localeCompare(date(b)) || byName(a.school, b.school);
    }
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
 * **시험 묶음으로 나눈다** (원장님, 2026-08-09 — 「앞으로 학교시험 페이지는
 * 시험 기준으로 재정렬해줘. 1학기 기말 - 학교별 날짜순 나열, 2학기 중간 -
 * 학교별 날짜순 나열 이렇게」).
 *
 * ── 왜 이 차례가 맞나 ──────────────────────────────────
 *
 * 날짜순으로만 늘어놓으면 신정중 기말과 박문중 중간이 뒤섞인다. 그런데
 * 원장님이 챙기시는 단위는 **「이번 기말」** 이다 — 그 안에서 어느 학교가
 * 먼저인지를 보신다. 그러니 묶음이 먼저고 날짜가 그다음이다.
 *
 * 묶음 이름은 termLabel 이 만든다 (「26년 2학기 기말」). 모의고사는 학기가
 * 없으므로 한 묶음으로 모은다.
 */
function groupKey(e) {
  if (isMockExam(e)) return "9999";                 // 모의고사는 늘 맨 뒤
  const { year, half, round } = termOf(e);
  if (!year) return "9998";                          // 언제 것인지 모르는 것
  return `${year}${half || 9}${round === "중간" ? 1 : round === "기말" ? 2 : 9}`;
}

export function groupExams(list = []) {
  const out = [];
  const at = new Map();
  sortExams(list, { key: "term", dir: "asc" }).forEach((e) => {
    const k = groupKey(e);
    if (!at.has(k)) {
      at.set(k, out.length);
      out.push({ key: k, label: isMockExam(e) ? "모의고사" : termLabel(e) || "때를 모르는 시험", rows: [] });
    }
    out[at.get(k)].rows.push(e);
  });
  return out;
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

/**
 * **합치기가 할 일이 남아 있나** (원장님, 2026-08-09 — 「9월 10월 둘 다
 * 전국연합학력평가로 표시되어 있어. 그게 아니라 고1~고3 모의고사로만
 * 입력하기로 한 거야」).
 *
 * 예전에는 「학교마다 한 줄씩 있는 모의고사」 만 세어서 안내를 띄웠다.
 * 그런데 원장님 화면에 남아 있던 것은 **이미 「전국」 인데 학년이 없는**
 * 옛 「전국연합학력평가」 줄이었다 — 세는 눈에 안 걸리니 안내가 안 뜨고,
 * 안내가 안 뜨니 단추도 없고, 단추가 없으니 **치울 방법 자체가 없었다.**
 *
 * 그래서 치울 것을 여기서 한 번에 센다. 실제로 지우는 규칙은
 * app/schedule/actions.js 의 mergeMockExams 와 같아야 한다 —
 * 「같은 날에 학년이 적힌 회차가 있을 때만 학년 없는 줄을 치운다」.
 *
 * @returns {{perSchool:number, stale:number, any:boolean}}
 */
export function mockMess(exams = []) {
  const mock = (exams || []).filter((e) => isMockExam(e));
  const perSchool = mock.filter((e) => (e.school || "") !== NATIONWIDE).length;
  const gradedDays = new Set(
    mock.filter((e) => (e.grade || "").trim()).map((e) => e.from_date)
  );
  const stale = mock.filter(
    (e) => !(e.grade || "").trim() && gradedDays.has(e.from_date)
  ).length;
  return { perSchool, stale, any: perSchool + stale > 0 };
}
