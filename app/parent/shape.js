/**
 * 학부모 화면의 **순수한 자리** — DB 도, 쿠키도, 서버도 없다.
 * 화면(`view.js`)과 읽는 자리(`read.js`)와 검사(`scripts/check-screen-parent.mjs`)가
 * **같은 한 벌**을 본다 (원칙 1).
 *
 * ⚠️ 이 파일이 따로 있는 까닭 — `read.js` 는 `next/headers` 와 `lib/notify.js`(웹푸시)를 끌어온다.
 *    그걸 화면(client)에서 불러오면 **빌드가 그 자리에서 깨진다.** 그래서 같이 쓰는 값만 여기 둔다.
 *
 * ⚠️ **판단을 여기서 만들지 않는다.** 마감 전 가리기는 `lib/close.js`,
 *    수업일 세기는 `lib/session.js` 가 한다. 여기는 **부르고 모양만 갖춘다.**
 */
import { sheetForFamily, itemsForFamily, PREPARING, NOTHING, DAY_OPEN } from "@/lib/close";
import { ymd, monthRange, eachDate, DOW_NAME } from "@/lib/session";

/** 이 화면이 서는 역할 — 문지기가 역할로 안 지켜 주므로 화면이 스스로 본다 */
export const ROLE = "parent";

/** 앞날은 **다음 달까지만** (계획 ⑯ 2번). 그 너머는 휴강·반 이동으로 자주 틀린다 */
export const MONTHS_AHEAD = 1;

/** 지난 것을 몇 달까지 그리나 — **재원 기간 안에서만** 자른다 (계획 ⑯ 3번) */
export const MONTHS_BACK = 2;

/** 달력 칸의 상태 — 화면은 이 글자로만 가른다. **새 글자를 화면에서 만들지 마라** */
export const CELL = Object.freeze({
  OUT: "out",          // 재원 기간 밖 · 다음 달 너머 — 안 그린다
  OFF: "off",          // 수업이 없는 날
  OPEN: "open",        // ⚠️ 수업은 했는데 아직 정리 중(마감 전) — 빈 칸이면 「수업 없던 날」과 같아 보인다
  CLOSED: "closed",    // 마감했다 — 그날 내용이 보인다
  FUTURE: "future",    // 앞으로 있을 수업 — 여기서 결석·지각을 미리 알린다
});

/** 요일 이름 — `lib/session.js` 의 한 벌을 그대로 쓴다 */
export const DOW = DOW_NAME;

export { PREPARING, NOTHING, DAY_OPEN };

/**
 * 판 줄 + 그 안의 줄을 **학부모에게 내보낼 값**으로 바꾼다.
 *
 * ⚠️⚠️ **이 함수를 안 거치고 판 줄을 화면에 넘기면 그게 곧 사고 #7 이다**
 *    (마감 전 내용이 밖으로 새던, 유일하게 밖으로 샌 사고).
 *    화면에서 `closed_at` 을 보고 **숨기지 않는다** — 숨긴 것은 언젠가 그려진다.
 *    원장 메모(`staff_note`)는 **키째로 없어야** 한다.
 *    `scripts/check-screen-parent.mjs` 가 원장 메모를 심은 가짜 줄로 실제로 돌려서 확인한다.
 */
export function familyRows(sheets = [], itemsBySheet = new Map(), role = ROLE) {
  return (sheets ?? []).map((s) => {
    const view = sheetForFamily(s, { role });
    const items = itemsForFamily(itemsBySheet.get(s.id) ?? [], s, { role });
    return { ...view, date: ymd(view.date), items };
  });
}

/**
 * 달력 한 달. **아무것도 새로 판단하지 않는다** — 수업일은 `lib/session.js` 의 `countDates()` 가
 * 미리 센 것을 받고, 마감 전 글은 `lib/close.js` 의 `DAY_OPEN` 을 그대로 나른다.
 *
 * @param ym        'YYYY-MM'
 * @param classDays Set('YYYY-MM-DD') — `countDates()` 가 낸 수업일
 * @param byDate    Map('YYYY-MM-DD' → [판 …])  ⚠️ **`familyRows` 를 지난 값**이어야 한다
 * @param today     'YYYY-MM-DD' — `v2.today()`
 * @param from,to   재원 기간·다음 달까지로 자른 범위
 */
export function buildMonth({ ym, classDays = new Set(), byDate = new Map(), today, from, to }) {
  const { first, last } = monthRange(ym);
  const days = eachDate(first, last).map(({ date, dow }) => {
    const sheets = byDate.get(date) ?? [];
    const inRange = (!from || date >= from) && (!to || date <= to);
    let state;
    if (!inRange) state = CELL.OUT;
    else if (!classDays.has(date)) state = CELL.OFF;
    else if (date > today) state = CELL.FUTURE;
    else if (sheets.some((s) => s.visible)) state = CELL.CLOSED;
    // ⚠️ 수업한 날인데 안 보인다 = **아직 마감 전이다.** 빈 칸으로 두지 않는다 (계획 ⑯ 1번)
    else state = CELL.OPEN;

    return {
      date, dow,
      day: Number(date.slice(8, 10)),
      state,
      // ⚠️ 글자를 여기서 짓지 않는다 — `lib/close.js` 의 것을 그대로 나른다
      label: state === CELL.OPEN ? DAY_OPEN : null,
      attend: sheets.find((s) => s.visible)?.attend ?? null,
      canTell: state === CELL.FUTURE,   // 결석·지각 예정을 고를 수 있는 날 = **수업일만** (계획 ㉔)
    };
  });
  // 1일이 무슨 요일에 서는지 — 앞을 빈 칸으로 민다
  return { ym, label: monthLabelOf(ym), pad: days[0]?.dow ?? 0, days };
}

/** 「2026-09」 → 「2026년 9월」 */
export function monthLabelOf(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ""));
  return m ? `${m[1]}년 ${Number(m[2])}월` : String(ym ?? "");
}

/** 'YYYY-MM' 에 달을 더한다 */
export function addMonth(ym, n) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ""));
  if (!m) return ym;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + Number(n), 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export const ymOf = (d) => String(d ?? "").slice(0, 7);
