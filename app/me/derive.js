/**
 * 학생 화면이 쓰는 **셈** — 순수 함수만. DB 도 React 도 안 부른다.
 *
 * ⚠️⚠️ **이 파일은 임시 자리다.** 판단은 원래 `lib/` 에 살아야 한다(대전제).
 *    지금 `lib/` 는 다른 판들이 고치는 중이라 손대지 말라는 지시가 있어서 여기 뒀다.
 *    **`lib/roadmap.js` 로 옮겨야 한다** — 옮길 때까지는 이 파일이 유일한 한 벌이다.
 *    학부모 화면·원장 화면이 같은 셈을 다시 짜면 그날부터 규칙이 두 벌이다(원칙 1).
 *
 * ⚠️ 여기 없는 것 — **일부러 없다.**
 *   · 「지금 어느 대단원인가」는 안 센다. `v2.cursor_of` 가 한 벌이다(0018).
 *   · 「진도율(끝/전체)」도 안 센다. `v2.book_progress` 가 한 벌이다(0018).
 *   · 「단원 이름 한 줄」도 안 짓는다. `v2.unit_label` 이 한 벌이다 —
 *     화면은 대단원·소단원·활동을 **따로 그린다**(붙인 글자를 만들지 않는다).
 *
 * ⚠️ 세어 나오는 값은 **저장하지 않는다**(원칙 5). 아래는 전부 그때그때 센다.
 */

import { addDays, daysBetween } from "@/lib/queue";
import { countDates } from "@/lib/session";

/* ══ 1. 아이가 손댈 수 있는 자리 ══════════════════════════════════════
 * ⚠️ **지어낸 목록이 아니다.** `supabase/migrations/0016_rls_rest.sql` 의
 *    `child_done` 정책이 `slot in ('home','next')` 만 연다.
 *    화면이 이 목록 밖에 ○ 을 그리면 **누르는 순간 접근 규칙이 거절한다** —
 *    아이는 「눌렀는데 안 돼요」를 겪고 원장님은 까닭을 모른다.
 *    정책이 바뀌면 **여기와 정책 둘 다** 고친다(맞대는 검사가 check-screen-me.mjs 에 있다). */
export const 아이가_찍는_칸 = Object.freeze(["home", "next"]);

/** 화원에서 하는 것 — 차례대로 하나씩 보여 주되 **아이는 못 찍는다**(위 정책) */
export const 학원_칸 = "class";

/** 판 줄의 칸 이름 → 아이가 읽을 말 */
export const 칸이름 = Object.freeze({
  check: "쌤이 검사한 것",
  class: "학원에서 할 것",
  home: "집에서 할 것",
  next: "미리 볼 것",
});

/* ══ 2. 오늘 할 것 — 차례대로 하나씩 ═════════════════════════════════ */

/**
 * 학원에서 할 것을 **차례대로** 세운다. 앞엣것이 끝나야 다음이 열린다.
 *
 * ⚠️ **화면에서만 막는다 — 서버에는 안 건다.** 순서를 건너뛰어도 아이가 얻는 것이 없고,
 *    서버에 걸면 원장님이 순서를 바꾸는 날 아이 화면이 통째로 잠긴다.
 *
 * @param 줄들 sort 로 이미 정렬된 그 칸의 줄들
 * @returns 같은 줄들에 `{ 열림, 차례 }` 를 붙인 것.
 *          끝난 줄은 늘 열림(되돌려 볼 수 있어야 한다), 첫 미완만 열림, 그 뒤는 잠김.
 */
export function 차례대로(줄들 = []) {
  let 열어줄자리 = -1;
  줄들.forEach((r, i) => {
    if (열어줄자리 < 0 && !끝난줄(r)) 열어줄자리 = i;
  });
  return 줄들.map((r, i) => ({
    ...r,
    차례: i + 1,
    열림: 끝난줄(r) || i === 열어줄자리,
  }));
}

/** 그 줄이 끝났나 — `day_item.status` 는 0052 에서 not null · 기본 'none' 이 됐다 */
export const 끝난줄 = (r = {}) => r.status === "done";

/**
 * 카드 하나의 분자·분모.
 * ⚠️ **접힌 것도 분자에 그대로 든다** — 접기는 보이는 것만 바꾸지 세는 것을 안 바꾼다(절 ⑮-2).
 */
export function 센다(줄들 = []) {
  const 전체 = 줄들.length;
  const 끝 = 줄들.filter(끝난줄).length;
  return { 끝, 전체, 남음: 전체 - 끝 };
}

/* ══ 3. 빈 카드 ══════════════════════════════════════════════════════
 * ⚠️ 「없음」으로 굳는 것은 **마감한 뒤**다. 마감 전에는 「아직 정리 중이에요」 —
 *    안 그러면 **마감 안 한 날과 진짜 없는 날이 아이에게 똑같아 보인다**(절 ⑮-3 · 물음 T).
 *    글자는 `lib/close.js` 의 PREPARING·NOTHING 을 그대로 받는다(여기서 안 짓는다). */

/**
 * 이 카드를 띄우나.
 * @returns 'show' 보인다 · 'preparing' 「아직 정리 중이에요」로 보인다 · 'hide' 아예 안 띄운다
 */
export function 카드어떻게(있나, 마감됐나) {
  if (있나) return "show";
  return 마감됐나 ? "hide" : "preparing";
}

/* ══ 4. 카드 순서 — 사람마다 따로 (절 ⑮-1 · v2.screen_pref) ══════════ */

/**
 * 학생 화면의 카드 — **달력은 여기 없다.** 달력은 언제나 맨 밑이다(절 ⑯).
 *
 * ⚠️ 「진도 체크」를 **따로 카드로 두지 않는다.** 로드맵과 같은 단원을 두 번 그리게 되고,
 *    그것이 패파에서 실제로 난 사고다 — 「같은 숙제가 세 군데에 보여 아이가 어디를 봐야 할지 모른다」.
 *    진도 체크는 설정이 열렸을 때 **로드맵 줄에 ○◐· 가 붙는 것**으로 나타난다.
 */
export const 카드들 = Object.freeze(["today", "books", "flags"]);

/**
 * 저장해 둔 순서를 입힌다.
 * ⚠️ 저장값을 **믿지 않는다** — 카드를 하나 더 만든 날 저장값에는 그 이름이 없다.
 *    모르는 이름은 버리고, 빠진 이름은 기본 차례로 뒤에 붙인다. 그래야 카드가 안 사라진다.
 */
export function 순서입히기(저장값, 기본 = 카드들) {
  const 목록 = Array.isArray(저장값) ? 저장값 : [];
  const 살아있는 = 목록.filter((k) => 기본.includes(k));
  const 남은 = 기본.filter((k) => !살아있는.includes(k));
  return [...new Set([...살아있는, ...남은])];
}

/** ▲▼ 한 칸 옮기기. 끝에서 더 밀면 **그대로 둔다**(고리처럼 돌면 아이가 어디로 갔는지 못 찾는다) */
export function 한칸옮기기(순서 = [], key, 어디로) {
  const i = 순서.indexOf(key);
  const j = i + (어디로 === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= 순서.length) return 순서;
  const 새 = [...순서];
  새[i] = 새[j];
  새[j] = key;
  return 새;
}

/** 끌어다 놓기 — `from` 을 빼서 `to` 자리에 끼운다 */
export function 끌어옮기기(순서 = [], from, to) {
  const i = 순서.indexOf(from), j = 순서.indexOf(to);
  if (i < 0 || j < 0 || i === j) return 순서;
  const 새 = [...순서];
  새.splice(i, 1);
  새.splice(j, 0, from);
  return 새;
}

/* ══ 5. 교재 로드맵 — 전 대단원 (보드 C) ═════════════════════════════ */

/**
 * 단원 줄들을 **대단원으로 묶는다.** 묶기만 한다 — 「지금 어디」는 안 정한다.
 *
 * ⚠️ 지금 대단원은 `v2.cursor_of` 가 준 `chapter` 로 **밖에서** 표시한다.
 *    여기서 「첫 미완이 든 대단원」을 다시 세면 커서 규칙이 두 벌이 된다(원칙 1) —
 *    그리고 대단원 기준 교재(본책 전부 → 워크북 전부)에서 **다른 답**이 나온다.
 *
 * @param units  [{id, chapter, mid, sub, activity, is_workbook, sort}]  sort 순
 * @param 진도맵 Map(unit_id → {status,last_by,confirmed,done_on})  **그 회독 것만** 걸러 넣는다
 */
export function 대단원묶기(units = [], 진도맵 = new Map()) {
  const 묶음 = new Map();
  for (const u of units) {
    const key = u.chapter ?? "";
    if (!묶음.has(key)) 묶음.set(key, { chapter: key, units: [], 끝: 0, 하는중: 0, 건너뜀: 0, 전체: 0 });
    const g = 묶음.get(key);
    const p = 진도맵.get(u.id) ?? null;
    g.units.push({ ...u, 진도: p });
    g.전체 += 1;
    // ⚠️ **`v2.book_progress` 와 같은 잣대여야 한다** — 그것은 `status='done'` 만 센다.
    //    여기서 `skip` 을 끝으로 세면 대단원 합과 교재 머리의 숫자가 안 맞아
    //    아이가 「9 / 9 인데 왜 100% 가 아니지」를 본다. 건너뛴 것은 따로 센다.
    if (p?.status === "done") g.끝 += 1;
    else if (p?.status === "skip") g.건너뜀 += 1;
    else if (p?.status === "doing") g.하는중 += 1;
  }
  return [...묶음.values()];
}

/**
 * 그 진도 줄을 아이가 덮을 수 있나 — ⚠️ **접근 규칙과 같은 잣대여야 한다.**
 *    `0052_progress_fix.sql` 의 `child_progress_update`:
 *      `last_by = 'student' or status = 'none'`
 *    화면이 이보다 헐거우면 눌러도 거절당하고, 빡빡하면 아이가 못 채운다.
 */
export function 아이가덮을수있나(진도, 열려있나) {
  if (!열려있나) return false;
  if (!진도) return true;                       // 줄이 없다 = 빈 줄. 새로 넣는다(insert 정책)
  if (진도.status === "none") return true;      // 비어 있는 줄은 누구 것이든 채운다
  return 진도.last_by === "student";            // 원장·검사·이관이 찍은 줄은 **못 덮는다**
}

/** 아이가 찍고 아직 원장님이 안 본 줄 — **노란 테두리**로 선다(절 ㊶ ②) */
export const 확인기다리는중 = (진도) =>
  !!진도 && 진도.last_by === "student" && 진도.confirmed === false;

/** 줄마다 「쌤/내가」 (표 4-8 의 `last_by`. 감사 기록을 뒤지지 않는다) */
export function 누가찍었나(진도) {
  if (!진도 || 진도.status === "none") return null;
  if (진도.last_by === "student") return "내가";
  if (진도.last_by === "import") return "옮겨온 것";
  return "쌤";                                   // staff · check 둘 다 아이에겐 「쌤」이다
}

/** 아이가 고를 수 있는 표시 셋 — ○ 다 함 · ◐ 하는 중 · · 아직 (절 ㊶ · 오류 101) */
export const 표시들 = Object.freeze([
  { key: "done", 글자: "○", 이름: "다 했어요" },
  { key: "doing", 글자: "◐", 이름: "하는 중" },
  { key: "none", 글자: "·", 이름: "아직" },
]);

/* ══ 6. 「이대로면 언제쯤 끝나나」 ════════════════════════════════════
 * ⚠️ **저장하지 않는다**(원칙 5). 그리고 **모르면 지어내지 않는다**(대전제 0). */

/** ⚠️ 확인 안 됨 — 원장님이 정하신 값이 아니다. 내가 고른 **가장 느슨한 바닥**이다 */
export const 셀수있는_바닥 = Object.freeze({
  다닌날: 60,      // 「두세 달 다니기 전에는 못 센다」 → 두 달
  최근창: 56,      // 속도를 재는 창 — 최근 8주
  최근완료: 3,     // 그 창에 끝낸 소단원이 이만큼은 돼야 잰다
  앞으로볼날: 400, // 이보다 멀면 「1년 넘게 걸려요」로만 말한다
});

/**
 * 이 교재가 언제쯤 끝나나.
 *
 * 남은 단원 ÷ (최근 8주 속도) = 남은 수업 횟수 → 앞으로의 수업 날에서 그만큼 뒤.
 *
 * ⚠️ **휴강을 못 뺀다.** `v2.holiday` 에는 아이 접근 규칙이 없어(0016) 아이 계정에 0줄이다.
 *    그래서 수업 날이 실제보다 많이 잡히고 → 속도가 **낮게** 잡히고 → 날짜가 **늦게** 나온다.
 *    늦게 나오는 쪽이 안전하지만, 화면에 그렇게 밝힌다.
 *
 * @returns { state, on, 남은수업, why }
 *   state: 'done' 다 했다 · 'tooNew' 아직 못 센다 · 'tooFew' 최근에 한 게 적다 ·
 *          'noClass' 수업 요일을 못 읽었다 · 'far' 1년 넘게 · 'ok'
 */
export function 언제끝나나({
  오늘,
  남은단원 = 0,
  완료날들 = [],
  다닌날 = null,
  수업이력 = [],
  바닥 = 셀수있는_바닥,
} = {}) {
  if (남은단원 <= 0) return { state: "done", on: null, 남은수업: 0, why: "이 교재는 이번 회독을 다 했어요" };

  if (다닌날 == null)
    return { state: "tooNew", on: null, 남은수업: null,
             why: "언제부터 이 교재를 했는지 앱이 몰라서 아직 셀 수 없습니다" };
  if (다닌날 < 바닥.다닌날)
    return { state: "tooNew", on: null, 남은수업: null,
             why: `아직 셀 수 없습니다 — 다닌 지 ${다닌날}일이라 속도를 재기엔 이릅니다 (${바닥.다닌날}일부터)` };

  const 창시작 = addDays(오늘, -바닥.최근창);
  const 최근 = 완료날들.filter((d) => d >= 창시작 && d <= 오늘);
  if (최근.length < 바닥.최근완료)
    return { state: "tooFew", on: null, 남은수업: null,
             why: `아직 셀 수 없습니다 — 최근 ${Math.round(바닥.최근창 / 7)}주에 끝낸 것이 ${최근.length}개뿐입니다` };

  // 최근 창의 **수업 날 수** — 요일 이력에서 센다. ⚠️ 휴강은 못 뺀다(위 경고)
  const 지난수업 = countDates({ schedules: 수업이력, holidays: [], first: 창시작, last: 오늘, today: 오늘 }).past;
  if (!지난수업.length)
    return { state: "noClass", on: null, 남은수업: null,
             why: "수업 요일을 못 읽어서 셀 수 없습니다 — 반 배정이 아직 없을 수 있어요" };

  const 하루당 = 최근.length / 지난수업.length;
  const 남은수업 = Math.ceil(남은단원 / 하루당);

  const 끝 = addDays(오늘, 바닥.앞으로볼날);
  const 앞날 = countDates({ schedules: 수업이력, holidays: [], first: addDays(오늘, 1), last: 끝, today: 오늘 }).future;
  if (남은수업 > 앞날.length)
    return { state: "far", on: null, 남은수업,
             why: `이 속도면 1년 안에는 안 끝나요 — 수업 ${남은수업}번쯤 더 남았습니다` };

  return { state: "ok", on: 앞날[남은수업 - 1], 남은수업,
           why: `최근 ${Math.round(바닥.최근창 / 7)}주 속도로 셌습니다 (수업 ${남은수업}번쯤 더)` };
}

/** 다닌 날 — 가장 이른 배정 시작일부터 오늘까지. 없으면 null(지어내지 않는다) */
export function 다닌날수(배정들 = [], 오늘) {
  const 날 = 배정들.map((b) => String(b.from_date ?? "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!날.length) return null;
  const 처음 = 날.sort()[0];
  if (처음 > 오늘) return 0;
  return daysBetween(처음, 오늘).length - 1;
}

/* ══ 7. 달력 (절 ⑯) ══════════════════════════════════════════════════ */

/**
 * 'YYYY-MM-DD' 의 요일 (0=일 … 6=토).
 * ⚠️ **UTC 로만 센다.** 지역시간으로 `new Date("2026-09-01")` 을 쓰면 서울에서 하루가 밀려
 *    달력 첫 칸이 한 칸 어긋나고, 그 뒤 전부가 요일과 안 맞는다.
 */
export function 요일(날) {
  const [y, m, d] = String(날).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * 한 달치 칸을 만든다. **앱이 이미 아는 값만 얹는다 — 새로 넣는 것이 없다.**
 *
 * ⚠️ 마감 안 한 날은 **빈 칸이 아니다.** 빈 칸이면 「수업이 없던 날」과 같아 보인다(절 ⑯ 1번).
 *    그런데 아이 계정은 **마감한 판만 읽는다**(0016 `own_sheet`) — 즉 마감 안 한 날은
 *    아이에게 아예 안 내려온다. 그래서 「수업이 있었을 날인데 판이 없는 날」을
 *    수업 요일에서 세어 `정리중` 으로 세운다. 지어낸 것이 아니라 **요일 이력**이 근거다.
 *
 * @returns [{ date, dow, 이달, 판, 상태, 시험들, 지남 }]
 */
export function 달력칸({ 오늘, first, last, 판들 = [], 수업이력 = [], 시험들 = [], 재원시작 = null } = {}) {
  const 판맵 = new Map(판들.map((s) => [String(s.date).slice(0, 10), s]));
  const 수업날 = new Set(countDates({ schedules: 수업이력, holidays: [], first, last, today: last }).dates);

  const 칸 = [];
  for (let i = 0; i < 요일(first); i++) 칸.push(null);   // 첫 주 앞의 빈 자리

  for (const 날 of daysBetween(first, last)) {
    const s = 판맵.get(날) ?? null;
    const 지남 = 날 <= 오늘;
    const 너무이름 = 재원시작 && 날 < 재원시작;      // ⚠️ 재원 기간 밖은 안 보여준다(절 ⑯ 3번)
    let 상태 = "none";
    if (너무이름) 상태 = "before";
    else if (s) 상태 = "closed";                    // 아이에게 내려온 판은 **마감한 것뿐**이다
    else if (수업날.has(날) && 지남) 상태 = "open"; // 수업은 했는데 판이 안 왔다 = 정리 중
    else if (수업날.has(날) && !지남) 상태 = "plan";

    칸.push({
      date: 날,
      dow: 요일(날),
      판: s,
      상태,
      시험들: 시험들.filter((e) => 시험날인가(e, 날)),
      지남,
    });
  }
  return 칸;
}

/** 그 날이 그 시험에 걸리나 — 영어 시험일이 있으면 그날만, 없으면 시험 기간 전체 */
export function 시험날인가(e = {}, 날) {
  const 영어 = e.english_on ? String(e.english_on).slice(0, 10) : null;
  if (영어) return 영어 === 날;
  const from = e.term_from ? String(e.term_from).slice(0, 10) : null;
  const to = e.term_to ? String(e.term_to).slice(0, 10) : from;
  return !!from && 날 >= from && 날 <= to;
}

/**
 * 'YYYY-MM' 한 달 앞·뒤.
 * ⚠️ 아이 달력은 **다음 달까지만** 앞으로 간다(절 ⑯ 2번) — 그 너머는 휴강·반 이동으로 자주 틀린다.
 *    그 테두리는 부르는 쪽이 지킨다(`read.js` 가 석 달치만 읽어 온다).
 */
export function 달옮기기(ym, n) {
  const [y, m] = String(ym).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}
