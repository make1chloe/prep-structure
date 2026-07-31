// 회차 기준 수강료 계산
//   회차 = 그 달 해당 요일 수업일 − 전체 휴강 − 반 휴강
//   금액 = 월 수강료 × 실제 회차 ÷ 기준 회차
// 결석은 차감하지 않는다 (보강으로 처리하므로).

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${ym}-${String(lastDay).padStart(2, "0")}`;
  return { first, last, lastDay, y, m };
}

// 그 달에 이 반이 수업하는 날짜 전부
export function sessionDates(ym, days = []) {
  const { y, m, lastDay } = monthRange(ym);
  const out = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(Date.UTC(y, m - 1, d));
    const dow = DAYS[date.getUTCDay()];
    if (days.includes(dow)) {
      out.push(`${ym}-${String(d).padStart(2, "0")}`);
    }
  }
  return out;
}

/**
 * 반 하나의 그 달 회차
 *
 * makeupDays 는 **보강·특강만 하는 요일**이다 (설정에서 정한다).
 * 그런 날은 정규수업이 아니므로 회차에서 아예 뺀다.
 *
 * @returns { all: string[], off: string[], live: string[], makeupOnly: string[] }
 */
export function classSessions(ym, klass, holidays = [], makeupDays = []) {
  // 특강은 달 중간에 시작하고 달 중간에 끝난다. 기간 밖의 날은 회차가 아니다.
  //   (개강 전·종강 후에 수업이 있었던 것으로 세면 그만큼 더 청구된다)
  const term = klass.ends_on || (klass.archived_at ? String(klass.archived_at).slice(0, 10) : null);
  const raw = sessionDates(ym, klass.days || []).filter(
    (d) => (!klass.starts_on || d >= klass.starts_on) && (!term || d <= term)
  );
  const skip = new Set(makeupDays);
  const makeupOnly = raw.filter((d) => skip.has(DAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]));
  const all = raw.filter((d) => !makeupOnly.includes(d));

  const offSet = new Set(
    holidays
      .filter((h) => h.scope === "all" || h.class_id === klass.id)
      .map((h) => h.date)
  );
  const off = all.filter((d) => offSet.has(d));
  const live = all.filter((d) => !offSet.has(d));
  return { all, off, live, makeupOnly };
}

/**
 * 학생 한 명의 그 달 금액
 * @param live      휴강 뺀 수업일 목록
 * @param baseCount 기준 회차 (반에 적힌 값 없으면 live.length)
 * @param unit      월 수강료
 * @param student   { started_on, ended_on }
 */
/**
 * 학생 한 명의 그 달 금액
 *
 * 규칙 (2026-07 확정)
 *   · 휴강으로 회차가 빠져도 **금액은 깎지 않는다.** 대신 보강으로 채운다.
 *     → makeupNeeded(보강 필요 횟수)와 credit(차액)을 함께 돌려준다.
 *       차액은 다음 달에 덜 청구하고 싶을 때 쓰는 참고값이다.
 *   · 달 중간에 등원을 시작하거나 퇴원하면 **그만큼만 청구한다.** (안 온 수업이므로)
 *   · 결석은 차감하지 않는다 (보강으로 처리).
 *
 * @param live      휴강을 뺀 실제 수업일
 * @param baseCount 기준 회차 (반에 적힌 값 없으면 그 달 정상 회차)
 * @param unit      월 수강료
 * @param student   { started_on, ended_on }
 * @param allDates  휴강을 빼지 않은 그 달 전체 수업일 (없으면 live 로 본다)
 */
/**
 * 이 학생에게 받을 월 수강료는 얼마인가.
 *
 * 학년이 오르면 금액이 오른다. 그런데 지금까지는 반에 적힌 금액 하나뿐이라,
 * 한 반에 중2와 중3이 섞여 있으면 손으로 학생마다 고쳐 넣어야 했다.
 *
 * 좁은 것이 이긴다 — 학생에게 따로 적은 금액이 제일 세다.
 *   1. 학생에게 직접 적은 금액 (형제 할인 · 장학)
 *   2. 학년별 금액
 *   3. 반 금액
 *   4. 없으면 null — '아직 안 적음' 이다. 0원과 다르다.
 */
export function unitFor(student = {}, klass = {}, byGrade = {}) {
  const has = (v) => v !== null && v !== undefined && v !== "";
  if (has(student.tuition)) return Number(student.tuition);
  const g = (student.grade || "").trim();
  if (g && has(byGrade[g])) return Number(byGrade[g]);
  if (has(klass.tuition)) return Number(klass.tuition);
  return null;
}

/** 그 금액이 어디서 왔는지 — 화면에 표시해 왜 이 값인지 알 수 있게 */
export function unitSource(student = {}, klass = {}, byGrade = {}) {
  const has = (v) => v !== null && v !== undefined && v !== "";
  if (has(student.tuition)) return "학생";
  const g = (student.grade || "").trim();
  if (g && has(byGrade[g])) return "학년";
  if (has(klass.tuition)) return "반";
  return null;
}

export function studentAmount(
  live, baseCount, unit, student = {}, allDates = null, absentDates = []
) {
  const from = student.started_on || null;
  const to = student.ended_on || null;
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);

  const liveMine = live.filter(inRange);                       // 실제로 수업하는 날
  const fullMine = (allDates || live).filter(inRange);         // 휴강까지 포함한 날
  const base = baseCount || (allDates || live).length || 0;

  const offCount = Math.max(0, fullMine.length - liveMine.length);   // 휴강으로 빠진 횟수
  // 결석도 보강 대상이다. 보강이 잡힌 날은 부르는 쪽에서 빼고 넘긴다
  const absentCount = absentDates.filter((d) => inRange(d) && liveMine.includes(d)).length;
  const makeupNeeded = offCount + absentCount;

  const partial = base > 0 ? Math.min(1, fullMine.length / base) : 0;  // 등원/퇴원으로 줄어든 비율

  // 수강료가 **0원**인 것과 **아직 안 적은 것**은 다르다.
  //   0원  → 형제 할인·장학 등. 금액 0원으로 확정
  //   null → 입력 안 함. '—' 로 보여주고 합계에서 뺀다
  if (unit === null || unit === undefined || base === 0) {
    return {
      sessions: liveMine.length,
      planned: fullMine.length,
      base,
      amount: null,
      credit: null,
      makeupNeeded,
      offCount,
      absentCount,
      noPrice: true,
      full: fullMine.length >= base,
    };
  }

  const amount = Math.round((unit * partial) / 10) * 10;      // 10원 단위
  const perSession = unit / base;
  // 차액은 **휴강**으로 못 한 회차만 센다. 결석은 학원 잘못이 아니므로 안 깎는다
  const credit = Math.round((perSession * offCount) / 10) * 10;

  return {
    sessions: liveMine.length,
    planned: fullMine.length,
    base,
    amount,
    credit,                 // 보강을 못 해줄 경우 다음 달에 덜 받을 금액 (휴강분만)
    makeupNeeded,           // 보강해야 할 총 횟수 (휴강 + 결석)
    offCount,               // 그중 휴강
    absentCount,            // 그중 결석
    noPrice: false,
    full: fullMine.length >= base,
  };
}

export function won(n) {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString()}원`;
}
