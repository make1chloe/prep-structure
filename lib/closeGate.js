/**
 * **마감 판정 한 곳** — 「무조건 마감된 것만 학생·학부모에게 공개한다」
 * (원장 확정 2026-08-28).
 *
 * ── 왜 이 파일이 생겼나 ─────────────────────────────────────
 *
 * 0169 가 마감 게이트를 만들 때 원장 확정(8/27)은 「할 일은 실시간, 리포트는
 * 마감 전 통째 비노출 — **점수는 공개**」 였다. 그래서 SQL 정책은 검사
 * 3상태(done·weak·missing)만 막았고, 단어·문법 점수는 적는 순간 아이와
 * 어머니 화면에 그대로 떴다. 한 달 살아보기(scripts/live-month.mjs)에서
 * 「적는 중」 인 판의 단어 89% · 문법 87% 가 아이 화면에 뜬 것이 그 증거다.
 *
 * 8/28 원장 지시가 그것을 뒤집었다 — **점수도 마감 뒤에만.**
 *
 * ── 왜 RLS 가 아니라 화면 쪽인가 ────────────────────────────
 *
 * Postgres 의 RLS 는 **행 단위**다. 점수(word_*·sent_*)·진도(own_progress)·
 * 공지(notice)·리포트 글(report_text)은 daily_reports **한 행 안의 칸**이라
 * 정책으로 가릴 수가 없다. 그렇다고 행을 통째로 막으면 —
 *
 *   · 오늘 나간 숙제(assigned)가 딸린 판이 안 보여서 **오늘 숙제가 통째로
 *     사라진다** (lib/homeworkView pickAssigned 가 그 행을 찾아 쓴다)
 *   · 출결(attendance_kind)도 같이 사라져 「갔어요?」 가 안 보인다
 *
 * 그래서 0169 가 notice 를 화면에서 가린 것과 **같은 자리**에서 가린다.
 * 대신 판정을 두 벌로 적지 않는다 (원칙 1) — 여기 한 곳이고, SQL 쪽
 * `public.report_gate(daily_reports)` 와 **같은 뜻**이어야 한다:
 *
 *     report_written or closed_at is not null
 *
 * closed_at 으로 마감의 정본을 옮기는 공사(0169 머리말)가 오면 SQL 은
 * report_gate 몸통만, JS 는 이 파일만 고치면 된다.
 */

/**
 * 조회에 꼭 같이 적어야 하는 칸.
 *
 * **이 두 칸을 안 읽으면 게이트가 조용히 열린다** — 아래 isClosed 가 옛 DB 를
 * 견디느라 undefined 를 공개로 치기 때문이다. 그래서 칸 이름을 여기 한 줄로
 * 두고, 학생·학부모 쪽 조회는 전부 이것을 이어 붙인다.
 * (0169 전 DB 면 closed_at 이 없어 조회가 실패한다 — 부르는 곳마다 한 칸
 *  물러나는 사다리를 둔다. 물러나도 report_written 은 남으니 게이트는 산다.)
 */
export const GATE_COLS = "report_written, closed_at";
/** 0169 전 DB 로 한 칸 물러날 때 (closed_at 없이) */
export const GATE_COLS_OLD = "report_written";

/**
 * **이 판은 마감되었나** — SQL `report_gate()` 와 같은 판정.
 *
 * 칸을 못 읽은 옛 DB(undefined)는 **공개로 친다.** 다 가리는 쪽이 더 나쁘기
 * 때문이다 — 0037·0087 전 상태로 몇 주를 쓰신 적이 있고, 그때 화면이 통째로
 * 비면 아이는 자기 숙제도 못 본다. (report_written 은 0005 부터 not null
 * default false 라, 실제로 읽기만 하면 undefined 가 나올 일이 없다.)
 */
export function isClosed(r) {
  if (!r) return false;
  if (r.closed_at) return true;
  return r.report_written !== false;
}

/**
 * 마감 전 판에서 **학생·학부모에게 안 보일 칸을 비운다.**
 *
 * 비우는 것 — 리포트 부분 전부:
 *   점수   word_correct·word_total·sent_correct·sent_total
 *   단원평가 sent_unit·sent_passed
 *   진도   own_progress
 *   말     notice·report_text·notice_student
 *   평가   attitude·understanding
 *
 * 안 비우는 것 — **할 일과 출결은 실시간**(0169 의 화이트리스트와 같은 결):
 *   id·date·attendance_kind·등원 절차(phone_in·homework_in·word_when)
 *   출결은 등원하는 순간 어머니 폰으로 이미 알림이 간다. 여기서만 늦게
 *   보이면 「갔다고 알림 왔는데 화면엔 안 왔다고 나온다」 가 된다.
 */
const HIDDEN = [
  "word_correct", "word_total", "sent_correct", "sent_total",
  "sent_unit", "sent_passed",
  "own_progress", "notice", "report_text", "notice_student",
  "attitude", "understanding",
];

export function maskUnclosed(r) {
  if (isClosed(r)) return r;
  const out = { ...r };
  HIDDEN.forEach((k) => { out[k] = null; });
  return out;
}

/** 여러 판을 한 번에 — 마감된 것은 그대로, 아닌 것은 리포트 부분을 비운다 */
export function maskRows(rows = []) {
  return (rows || []).map(maskUnclosed);
}
