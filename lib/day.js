// 날짜 다루기 — 한국(Asia/Seoul) 기준
//
// 왜 따로 만들었나
//   우리가 다루는 날짜는 "2026-09-24" 같은 **달력 날짜**지 시각이 아니다.
//   그런데 코드 여기저기서 이렇게 쓰고 있었다.
//
//     new Date("2026-09-24T00:00:00+09:00").getDate()
//
//   이건 서버 시간대에 따라 답이 달라진다. Vercel 은 UTC 로 도는데
//   +09:00 로 읽으면 실제 시각은 9/23 15:00Z 가 되고, `getDate()` 는
//   **서버(UTC) 기준**이라 23 을 돌려준다. 하루가 밀린다.
//   요일도 마찬가지라 `getDay()` 가 목요일 대신 수요일을 준다.
//   → 공지 대상 학생이 틀리게 잡히고, 화면 날짜도 하루 어긋난다.
//
// 그래서 여기서는
//   · 날짜 문자열은 **UTC 자정으로 파싱하고 UTC getter 로만** 읽는다
//     (시간대가 개입할 여지를 없앤다 — 어느 서버에서 돌든 같은 답)
//   · "오늘"만 Intl 로 서울 날짜를 뽑는다
//
// 규칙: 앱 안에서 날짜는 항상 "YYYY-MM-DD" 문자열로 주고받는다.

export const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const TZ = "Asia/Seoul";

/** 지금 한국은 며칠인가 → "2026-09-24" */
export function todaySeoul() {
  // en-CA 는 YYYY-MM-DD 로 내려준다
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 지금 한국은 몇 시인가 → "16:30" */
export function timeSeoul() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** 날짜 문자열 → UTC 자정 Date (계산용. 화면에 쓰지 말 것) */
function at(d) {
  return new Date(`${d}T00:00:00Z`);
}

/** "2026-09-24" → { y, m, d } */
export function parts(d) {
  const t = at(d);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** "2026-09-24" → "목" */
export function dowOf(d) {
  return DOW[at(d).getUTCDay()];
}

/** "2026-09-24" → "9/24 (목)" */
export function dayLabel(d) {
  const { m, d: day } = parts(d);
  return `${m}/${day} (${dowOf(d)})`;
}

/** "2026-09-24" → "9월 24일 (목)" */
export function longLabel(d) {
  const { m, d: day } = parts(d);
  return `${m}월 ${day}일 (${dowOf(d)})`;
}

/** "2026-09-24" → "24(목)" — 좁은 자리에 */
export function shortLabel(d) {
  return `${parts(d).d}(${dowOf(d)})`;
}

/** "2026-09-24" → "9/24(목)" — 여러 달이 섞여 나오는 곳에 (시험 목록 등).
    달이 없으면 「2(수)」 가 몇 월인지 알 수 없다. */
export function monthDay(d) {
  const { m, d: day } = parts(d);
  return `${m}/${day}(${dowOf(d)})`;
}

/** n일 뒤(음수면 앞) → "2026-09-26" */
export function addDays(d, n) {
  const t = at(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** 그 달 마지막 날 → "2026-09-30" */
export function endOfMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

/** n달 뒤의 같은 달 → "2026-11" */
export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** from ~ to 사이 날짜를 전부 (양 끝 포함) */
export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
