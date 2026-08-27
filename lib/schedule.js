import { addDays as addDaysISO, dowOf, DOW as DOWN, todaySeoul } from "./day.js";
import { endOf } from "./classTerm.js";
import { takesExam } from "./who.js";
import { needsScope } from "./examList.js";
export { addDaysISO, dowOf };

/**
 * **그날 이 반이 살아 있나** — 개강 전도 아니고 종강 뒤도 아닌가.
 *
 * 회차를 세는 곳이 둘(`sessionNumbers` · `reviewClass`)인데 규칙을 각자
 * 적어두면 언젠가 갈라진다. 한 줄만 둔다.
 *
 * 종강일은 `endOf` 로 본다 — **손으로 보관만 한 반**(종강일은 안 적고 보관
 * 버튼만 누른 반)도 그날 이후로는 수업이 없다. 예전에는 `ends_on` 만 봐서
 * 보관한 반이 달력에 영원히 남았다.
 *
 * 날짜가 아무것도 안 적혀 있으면 아무것도 안 자른다 — 정규반은 무기한이다.
 */
export function inTermOn(klass = {}, date) {
  if (klass.starts_on && date < klass.starts_on) return false;
  const end = endOf(klass);
  if (end && date > end) return false;
  return true;
}
// 앞으로 3개월 수업 스케줄 점검
//   · 달마다 회차가 몇 번인지 (9회/7회 같은 특이사항)
//   · 시험 기간과 겹치는 수업일 → 타과목 시험이라 결석 예상
//   · 영어 시험 전날 → 정규수업이 아니어도 등원 필요
//
// 중요 — 회차는 **달마다 따로 보지 않는다.**
//   이번 달이 7회(1회 부족)인데 다음 달이 9회(1회 많음)면
//   보강도 휴강도 하지 말고 다음 달을 9회 그대로 하면 딱 맞는다.
//   그래서 3개월치를 **누적**으로 계산해서, 언제 상쇄되는지를 알림에 같이 적어준다.

function ymOf(d) {
  return d.slice(0, 7);
}

/**
 * 숨긴 시험 번호를 모은다.
 *
 * 조건절에 `hidden = false` 를 넣으면 **0060 전 DB 에서는 시험이 통째로
 * 사라진다** — 없는 칸을 물어보면 조회 자체가 실패하고, 실패한 조회는
 * 빈 목록으로 보이기 때문이다. 알림이 조용히 없어지는 것이 제일 나쁘다.
 * 그래서 숨긴 것만 따로 물어보고, 실패하면 '숨긴 것 없음' 으로 본다.
 */
export async function hiddenExamIds(supabase) {
  const { data, error } = await supabase
    .from("exam_periods")
    .select("id")
    .eq("hidden", true);
  if (error) return new Set();
  return new Set((data || []).map((x) => x.id));
}

export function monthsFrom(startYM, count) {
  const [y, m] = startYM.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** 그 달에 이 반이 수업하는 날짜 */
export function datesOfMonth(ym, days = []) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= last; d++) {
    const iso = `${ym}-${String(d).padStart(2, "0")}`;
    if (days.includes(dowOf(iso))) out.push(iso);
  }
  return out;
}

/**
 * **이 반의 그 달 회차 번호** — 날짜 → 「몇 회차인가」.
 *
 * 원장님 (2026-08-06) — 「몇 회차 수업인지를 표시하면 좋겠어. 1회차 이렇게」
 *
 * 아이 달력에 「수업 17:00」 이 요일마다 찍히는 것은 아무것도 안 알려준다.
 * 자기 수업 요일은 아이도 어머니도 이미 안다. 대신 몇 회차인지는 모르고,
 * 그건 수강료·보강과 이어지는 숫자라서 알아야 한다.
 *
 * 세는 방법은 회차 관리(reviewClass)와 **똑같다.** 두 곳이 다르면
 * 「앱에는 3회차라던데요」 가 생긴다.
 *   · 특강 기간 밖은 안 센다
 *   · 보강만 하는 요일은 안 센다 (정규 회차가 아니다)
 *   · 휴강한 날은 안 센다 (그 자리가 비면 뒤가 한 칸씩 당겨진다)
 *
 * @param offDates 이 반에 걸리는 휴강 날짜 (scope=all 이거나 이 반 것)
 */
export function sessionNumbers(klass = {}, ym, offDates = new Set(), makeupDays = []) {
  const skip = new Set(makeupDays);

  const live = datesOfMonth(ym, klass.days || [])
    .filter((d) => inTermOn(klass, d))
    .filter((d) => !skip.has(dowOf(d)))
    .filter((d) => !offDates.has(d));

  return new Map(live.map((d, i) => [d, i + 1]));
}

/**
 * 반 한 개의 3개월 점검
 * @param klass    { id, name, days, base_sessions }
 * @param months   ["2026-08", ...]
 * @param holidays [{ date, scope, class_id }]
 * @param exams    [{ school, grade, from_date, to_date, english_on }]
 * @param roster   [{ school, grade }]  이 반 학생들
 */
export function reviewClass(
  klass, months, holidays = [], exams = [], roster = [], makeupDays = []
) {
  const skipDow = new Set(makeupDays);

  /**
   * **특강 기간 밖은 수업이 아니다** (규칙은 `inTermOn` 한 줄에).
   *
   * 개강일 전 · 종강일 뒤는 요일이 맞아도 수업이 없다. 이걸 안 걸러서
   * 「화목1 특강」 이 종강한 뒤로도 회차 관리에 계속 나왔고, 회차·수강료가
   * 실제보다 많게 잡혔다.
   */
  const inTerm = (d) => inTermOn(klass, d);
  const offSet = new Set(
    holidays
      .filter((h) => h.scope === "all" || h.class_id === klass.id)
      .map((h) => h.date)
  );

  // 이 시험이 걸리는 학생은 누구인가.
  //
  // "누가 와야 하는지" 를 안 적어주면 알림을 봐도 결국 명단을 다시 찾아봐야 한다.
  // 한 반에 학교가 섞여 있으면 **반 전체가 아니라 그 학교 아이들만** 해당한다.
  //
  // **글자로 견주지 않는다** (원장님, 2026-08-09 — 「결석예정자도 학사일정과
  // 다르고」). 아이는 「인천신정중학교」, 회차는 나이스가 준 「신정중」 이라
  // `===` 가 거짓이 되어 **그 아이가 통째로 빠지고 있었다.** 규칙은
  // lib/who 한 곳에 있다.
  const whoOf = (e) => roster.filter((s) => takesExam(s, e));

  /**
   * 이 반 학생들에게 걸리는 시험만.
   *
   * **모의고사는 뺀다** (원장님, 2026-08-08 — 「모의고사는 전날등원 안 해
   * 학교시험만 그래」). 전에는 뺀 적이 없는데도 안 걸렸다 — 모의고사 회차의
   * 학교가 「전국」 이라 위의 `===` 가 늘 거짓이었기 때문이다. **우연히**
   * 맞고 있었던 것이라, 견주는 규칙을 고치는 순간 모의고사가 결석 예정과
   * 전날 등원에 통째로 새어 들어온다. 그래서 여기서 못 박는다.
   */
  const mine = exams
    .filter((e) => needsScope(e))
    .map((e) => ({ ...e, who: whoOf(e) }))
    .filter((e) => e.who.length > 0);

  const rows = months.map((ym) => {
    // 보강 전용 요일(설정)은 정규 회차가 아니므로 뺀다
    const raw = datesOfMonth(ym, klass.days || []).filter(inTerm);
    const makeupOnly = raw.filter((d) => skipDow.has(dowOf(d)));
    const all = raw.filter((d) => !skipDow.has(dowOf(d)));
    const off = all.filter((d) => offSet.has(d));
    const live = all.filter((d) => !offSet.has(d));
    const base = klass.base_sessions || null;

    // 시험 기간과 겹치는 수업일
    const inExam = live.filter((d) =>
      mine.some((e) => d >= e.from_date && d <= e.to_date)
    );

    // 영어 시험 전날 = 등원 필요 (정규수업이든 아니든)
    const engEve = mine
      .filter((e) => e.english_on)
      .map((e) => ({ ...e, eve: addDaysISO(e.english_on, -1) }))
      .filter((e) => ymOf(e.eve) === ym)
      .map((e) => ({
        date: e.eve,
        english_on: e.english_on,
        school: e.school,
        grade: e.grade,
        who: e.who,                                    // 그날 와야 하는 학생
        isClassDay: (klass.days || []).includes(dowOf(e.eve)),
      }));

    const alerts = [];
    if (off.length > 0) {
      alerts.push({ kind: "off", text: `휴강 ${off.length}회`, extra: off.length });
    }
    if (inExam.length > 0) {
      // 그 기간에 시험을 보는 아이만 결석한다 — 반 전체가 아니다.
      //
      // **누가 · 어느 날** 까지 여기서 정한다. 예전에는 "몇 명" 만 세어 놓고
      // 실제로 넣을 때는 반 전체 × 모든 날에 찍었다. 한 반에 학교가 섞여 있으면
      // 시험도 안 보는 아이가 결석으로 남고, 그걸 하나씩 지워야 했다.
      const who = [];
      const pairs = [];
      const seen = new Set();
      mine.forEach((e) => {
        const days = inExam.filter((d) => d >= e.from_date && d <= e.to_date);
        if (days.length === 0) return;
        who.push(...e.who);
        e.who.forEach((s) => {
          days.forEach((d) => {
            const k = `${s.id}|${d}`;      // 시험 둘이 겹치면 같은 아이 같은 날이 두 번 나온다
            if (seen.has(k)) return;
            seen.add(k);
            pairs.push({ student_id: s.id, date: d, name: s.name });
          });
        });
      });
      alerts.push({
        kind: "exam",
        // 보충설명("결석이 많을 수 있습니다")은 뺀다 (원장님 2026-08-19
        // 「입력값에 대한 보충설명은 다 빼줘」)
        text: `타과목 시험 기간에 수업 ${inExam.length}회`,
        extra: inExam.length,
        // 시험은 학교 것이다 — 화면이 학교별로 정렬할 수 있게 싣는다
        schools: [
          ...new Set(
            mine
              .filter((e) => inExam.some((d) => d >= e.from_date && d <= e.to_date))
              .map((e) => e.school)
              .filter(Boolean)
          ),
        ],
        who: [...new Map(who.map((s) => [s.id, s])).values()],
        pairs,
      });
    }
    engEve.forEach((e) => {
      alerts.push({
        kind: "engEve",
        text: `${e.date.slice(5)} 영어 시험(${e.english_on.slice(5)}) 전날 — ${
          e.isClassDay ? "정규수업일" : "정규수업이 아니지만 등원 필요"
        }`,
        date: e.date,
        school: e.school,
        grade: e.grade,
        who: e.who,
      });
    });

    return { ym, all, off, live, base, inExam, engEve, alerts, makeupOnly };
  });

  // 누적은 이번 달부터 (2026-08-21) — 한 해 12달을 넘기게 되면서 1월부터
  // 누적돼 지난 달 차이가 8월 알림에 따라붙었다
  return balance(rows, todaySeoul().slice(0, 7));
}

// ------------------------------------------------------------------
// 회차 누적 계산
//   diff = 그 달 실제 수업 회차 − 기준 회차
//   cum  = 첫 달부터 그 달까지 diff 를 더한 값 (0 이면 그 시점에 딱 맞는다)
// ------------------------------------------------------------------

function mLabel(ym) {
  return `${Number(ym.split("-")[1])}월`;
}

/**
 * @param fromYm 누적을 시작할 달 (보통 이번 달, "YYYY-MM"). 화면이 한 해
 *   12달을 통째로 넘기게 되면서(2026-08-05) 1월부터 누적돼, 8월 알림에
 *   이미 끝난 3·4월 차이가 섞여 있었다 (2026-08-21 발견). 지난 달은
 *   diff 만 남기고 누적·조언에서 뺀다 — 지나간 달은 조언할 것이 없다.
 */
function balance(rows, fromYm = null) {
  let run = 0;
  const withDiff = rows.map((m) => {
    const past = !!(fromYm && m.ym < fromYm);
    const diff = m.base ? m.live.length - m.base : 0;
    if (!past) run += diff;
    return { ...m, diff, cum: past ? 0 : run, past };
  });
  const horizonTotal = run;

  return withDiff.map((m, i) => {
    if (!m.base || m.diff === 0 || m.past) return m;

    // 언제 딱 맞아떨어지는가 — 이번 달까지(이전 달이 메워준 경우) 또는 이후 달
    let settleAt = m.cum === 0 ? i : withDiff.findIndex((x, j) => j > i && x.cum === 0);
    if (settleAt < 0) settleAt = null;

    // 상쇄에 관여하는 달들을 그대로 보여준다 (판단은 원장이 한다)
    const span = withDiff
      .slice(0, settleAt === null ? withDiff.length : settleAt + 1)
      .filter((x) => x.base && x.diff !== 0 && !x.past)
      .map((x) => `${mLabel(x.ym)} ${x.live.length}회(${x.diff > 0 ? "+" : ""}${x.diff})`)
      .join(" · ");

    const many = m.diff > 0;
    const head = many
      ? `${m.live.length}회 — 기준 ${m.base}회보다 ${m.diff}회 많습니다.`
      : `${m.live.length}회 — 기준 ${m.base}회보다 ${-m.diff}회 적습니다.`;

    let advice;
    if (settleAt !== null) {
      const until = mLabel(withDiff[settleAt].ym);
      advice =
        `${span} → ${until}까지 합치면 기준과 정확히 맞습니다. ` +
        `보강도 휴강도 하지 말고 ${until}까지 그대로 수업하면 됩니다.`;
    } else if (horizonTotal === 0) {
      advice = `${span} → 남은 달을 합치면 기준과 맞습니다. 그대로 진행하세요.`;
    } else {
      const rest = horizonTotal > 0 ? `${horizonTotal}회 많음` : `${-horizonTotal}회 부족`;
      advice =
        `${span} → 남은 달을 다 합쳐도 ${rest}. ` +
        (horizonTotal > 0
          ? "그냥 하면 서비스, 쉬려면 아래에서 휴강으로 지정하세요."
          : "보강이 필요합니다.");
    }

    return {
      ...m,
      settled: settleAt !== null,
      alerts: [
        {
          kind: many ? "over" : "short",
          text: head,
          advice,
          settled: settleAt !== null,
          extra: Math.abs(m.diff),
          // 상쇄 구간의 첫 달에만 표시 — 대시보드에서 같은 말이 여러 번 뜨지 않게
          primary: i === 0 || withDiff[i - 1].cum === 0,
        },
        ...m.alerts,
      ],
    };
  });
}
