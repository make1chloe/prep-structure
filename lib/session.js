/**
 * 회차 (sessionCount) — 「이 달에 수업이 몇 번인가」
 *
 * ⚠️ **회차는 청구액이 아니다** (계획 오류 대장 83 · 원장님 2026-09-01 정정).
 *    「회차 × 단가 = 청구액」으로 적었던 것은 **통째로 틀렸다.**
 *    회차는 **8회를 채웠는지 보려고** 센다. 못 채우면 **보강을 잡는다.**
 *    정규 수강료는 **월정액**이고 회차와 무관하다. (특강만 회차만큼 받는다)
 *
 * 세는 법 — **반 요일 이력 + 달력 − 휴강.**
 *   · 휴강은 빠진다 (학원이 안 열었다)
 *   · **결석은 안 빠진다** (학원은 열었다 — 그 아이만 보강)
 *     → 그래서 이 파일은 `v2.day_sheet`(출결)을 **한 번도 안 읽는다.**
 *       읽는 순간 결석이 회차를 깎아 수강료·보강이 조용히 틀린다.
 *
 * ⚠️ **DB 에 `v2.session_count(class, ym)` 이 이미 있고 그것과 두 벌이다** (0018_derive.sql).
 *    DB 것에는 **오늘 상한이 없고**, 요일 이력이 겹치면 `join` 이라 **하루를 두 번 센다.**
 *    나는 마이그레이션을 못 고치므로 여기서 다시 셌다. 보고 needsDb 에 적었다.
 *    ⚠️ 둘 중 하나를 지우기 전까지는 **화면이 어느 쪽을 부르느냐로 숫자가 달라진다.**
 *
 * DB 는 `{ query(sql, params) }` 만 있으면 된다 (pg 든 supabase 어댑터든).
 * 검사가 가짜 DB 를 끼운다 — scripts/check-session.mjs
 */

/**
 * 8회 — **모든 반 공통이다.** 반마다 다르지 않다 (원장님 2026-09-01 확정).
 * ⚠️ 특강도 8회 미만이면 보강인지는 **확인 안 됨** — 특강은 「5회면 5회분」으로 받으므로
 *    5회짜리 특강이 매달 「3회 모자람」으로 빨갛게 뜰 수 있다.
 *    지금은 확정 문장 그대로 모든 반에 8을 건다. 아니면 `opts.min` 으로 덮는다.
 */
export const MIN_SESSIONS = 8;

/** 요일 — 0=일 … 6=토. Postgres `extract(dow)` 와 JS `getUTCDay()` 가 같은 뜻이다 */
export const DOW_NAME = ["일", "월", "화", "수", "목", "금", "토"];

// ─────────────────────────────────────────────────────────────
// 날짜 — 글자 'YYYY-MM-DD' 하나로만 다룬다
// ─────────────────────────────────────────────────────────────

/**
 * 무엇이 오든 'YYYY-MM-DD' 로.
 *
 * ⚠️ **`toISOString()` 을 쓰면 안 된다.** node-pg 는 `date` 칸을
 *    **그 기계 시간대의 자정** Date 로 준다. 서울(+9)에서 10월 7일 자정은
 *    UTC 로 10월 6일 15시라, `toISOString().slice(0,10)` 은 **10월 6일**을 낸다.
 *    → 10월 7일 휴강이 6일로 읽혀 **휴강이 안 빠지고 회차가 하나 부푼다.**
 *    그래서 여기서는 지역 칸(getFullYear/Month/Date)을 그대로 읽는다.
 */
export function ymd(v) {
  if (v == null) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}

/**
 * 'YYYY-MM' → 그 달의 첫날·끝날.
 * ⚠️ 모양이 틀리면 **던진다.** 조용히 빈 달을 세면 0회가 나오고,
 *    0 < 8 이라 **모든 반이 빨갛게 뜨고 보강이 통째로 잘못 잡힌다.**
 */
export function monthRange(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ""));
  if (!m) throw new Error(`달이 'YYYY-MM' 이 아니다: ${JSON.stringify(ym)}`);
  const y = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error(`그런 달은 없다: ${ym}`);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // 0일 = 앞 달의 끝날
  return { first: `${m[1]}-${m[2]}-01`, last: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
}

/** 첫날~끝날을 하루씩. UTC 로만 더한다 — 서머타임·지역시간이 끼어들 자리를 없앤다 */
export function eachDate(first, last) {
  const out = [];
  const [fy, fm, fd] = first.split("-").map(Number);
  const [ly, lm, ld] = last.split("-").map(Number);
  const end = Date.UTC(ly, lm - 1, ld);
  for (let t = Date.UTC(fy, fm - 1, fd); t <= end; t += 86400000) {
    const d = new Date(t);
    out.push({ date: ymd(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), dow: d.getUTCDay() });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 셈 — 순수 함수. DB 없이 검사할 수 있다
// ─────────────────────────────────────────────────────────────

/**
 * 요일 이력 + 달력 − 휴강 → 수업이 있는 날들.
 *
 * @param schedules [{from_date, to_date, weekdays:[0..6]}]  ⚠️ **이력이다.** 요일을 옮겨도
 *                  지난달이 소급해 안 바뀌는 까닭이 이것뿐이다 (계획 「처음부터 넣는 것 ①」).
 * @param holidays  [{date, class_id}]  class_id 가 비면 학원 전체 휴강
 * @param today     'YYYY-MM-DD' — **오늘 상한** (계획 0단계 6번)
 * @returns { dates, past, future }
 */
export function countDates({ schedules = [], holidays = [], first, last, today }) {
  const off = new Set(holidays.map((h) => ymd(h.date)));

  const rows = schedules.map((s) => ({
    from: ymd(s.from_date),
    to: s.to_date == null ? null : ymd(s.to_date),
    // ⚠️ pg 가 smallint[] 를 글자로 줄 수도 있어 숫자로 굳힌다. '3' !== 3 이면 그 반은 0회가 된다
    days: new Set((s.weekdays ?? []).map(Number)),
  }));

  // ⚠️ **하루에 한 번만 묻는다** (`some` + Set). 이력 줄마다 세면,
  //    닫는 날을 안 적은 채 새 줄을 넣어 **두 줄이 겹칠 때 하루를 두 번 센다** —
  //    8회 반이 조용히 16회가 되어 「모자람」이 영영 안 뜬다.
  //    DB 의 `v2.session_count` 는 `join` 이라 정확히 여기서 샌다.
  const seen = new Set();
  for (const { date, dow } of eachDate(first, last)) {
    if (off.has(date)) continue;                              // 휴강 — 빠진다
    if (rows.some((r) => r.from <= date && (r.to == null || r.to >= date) && r.days.has(dow))) seen.add(date);
  }

  const dates = [...seen].sort();
  const cut = today ? ymd(today) : null;
  return {
    dates,
    past: cut ? dates.filter((d) => d <= cut) : dates,        // 지나간 것 — 오늘까지
    future: cut ? dates.filter((d) => d > cut) : [],          // 앞날 예정 — 따로 낸다
  };
}

// ─────────────────────────────────────────────────────────────
// DB 를 읽는 자리
// ─────────────────────────────────────────────────────────────

const SQL_TODAY = `select v2.today() as d`;

const SQL_SCHEDULE = `
  select from_date, to_date, weekdays
    from v2.class_schedule
   where class_id = $1 and from_date <= $3 and (to_date is null or to_date >= $2)
   order by from_date`;

const SQL_HOLIDAY = `
  select date, class_id
    from v2.holiday
   where date between $2 and $3 and (class_id is null or class_id = $1)`;

/** ⚠️ 반 명단은 **여기서만** 읽는다 — `v2.class_roster()` 를 지나간다 (자동 검사 ⑮) */
const SQL_ROSTER = `
  select d::date as date, r.student_id
    from unnest($2::date[]) d, lateral v2.class_roster($1, d::date) r`;

/** ⚠️ 소속의 반대쪽도 같은 한 벌 — `v2.student_classes()` */
const SQL_MEMBER_CAL = `
  select d::date as date, c.class_id
    from generate_series($2::date, $3::date, '1 day') d,
         lateral v2.student_classes($1, d::date) c`;

const SQL_MAKEUP = `
  select student_id, on_date, state
    from v2.makeup
   where student_id = any($1::uuid[]) and on_date between $2 and $3 and state <> 'waived'`;

const SQL_CLASSES = `select id, kind from v2.classes where state = 'active' order by created_at`;

/**
 * 오늘 — **학원이 있는 곳(서울)의 오늘**을 DB 한 곳에서 받는다.
 * ⚠️ `new Date()` 를 쓰면 안 된다. 서버가 UTC 면 **밤 9시 이후 하루가 어긋나**
 *    그날 수업이 「앞날 예정」으로 빠져 회차가 하나 모자라게 뜬다 (옛 앱에서 실제로 5건).
 */
export async function todayOf(db) {
  const { rows } = await db.query(SQL_TODAY, []);
  return ymd(rows[0].d);
}

/**
 * 반 하나의 그 달 회차.
 *
 * @returns {{ classId, ym, today, dates, done, planned, total, min, short, enough }}
 *   done    지나간 회차 (**오늘까지**)
 *   planned 앞날 예정
 *   total   그 달 전체
 *   short   8 − total (모자란 만큼). 0 이면 채웠다
 *
 * ⚠️ **8회 판정은 `total` 로 한다. `done` 으로 하면 안 된다.**
 *    매달 1일에 done=0 이라 모든 반이 빨갛게 뜨고, 원장님이 헛보강을 잡는다.
 */
export async function classSessions(db, classId, ym, opts = {}) {
  const { first, last } = monthRange(ym);
  const today = opts.today ? ymd(opts.today) : await todayOf(db);
  const min = opts.min ?? MIN_SESSIONS;

  const schedules = (await db.query(SQL_SCHEDULE, [classId, first, last])).rows;
  const holidays = (await db.query(SQL_HOLIDAY, [classId, first, last])).rows;

  const { dates, past, future } = countDates({ schedules, holidays, first, last, today });
  return {
    classId, ym, today, dates,
    done: past.length, planned: future.length, total: dates.length,
    min, short: Math.max(0, min - dates.length), enough: dates.length >= min,
  };
}

/**
 * 한 아이의 그 달 회차 — **반마다 따로 낸다.**
 *
 * ⚠️ 합쳐서 한 숫자로 주면 안 된다. 한 아이가 **정규·특강 두 반**에 설 수 있고,
 *    정규 6회 + 특강 3회 = 9 로 보이면 **정규가 2회 모자란 것이 가려진다.**
 *    8회 판정은 **반마다** 한다.
 *
 * ⚠️ 그리고 **그 아이가 그 날 그 반이었을 때만** 센다 (계획 1단계 조심할 자리 ③).
 *    안 그러면 반을 옮긴 아이가 **두 반 요일을 합쳐** 회차가 부푼다.
 *    이 구멍은 검증으로 못 잡는다 — 이관이 전원 같은 시작일로 박아
 *    전환 시점엔 닫힌 줄이 하나도 없다. **첫 반 이동 날 처음 터진다.**
 *
 * @returns {{ studentId, ym, today, byClass:[{classId, dates, done, planned, total, short, enough}],
 *             makeupDates, total, shortClasses }}
 */
export async function studentSessions(db, studentId, ym, opts = {}) {
  const { first, last } = monthRange(ym);
  const today = opts.today ? ymd(opts.today) : await todayOf(db);
  const min = opts.min ?? MIN_SESSIONS;

  // 그 달 하루하루 「이 아이가 어느 반이었나」 — 소속 한 벌만 지나간다
  const cal = new Map(); // 'YYYY-MM-DD' → Set(classId)
  const classIds = new Set();
  for (const r of (await db.query(SQL_MEMBER_CAL, [studentId, first, last])).rows) {
    const d = ymd(r.date);
    if (!cal.has(d)) cal.set(d, new Set());
    cal.get(d).add(r.class_id);
    classIds.add(r.class_id);
  }

  const byClass = [];
  const mine = new Set(); // 이 아이의 수업 날 (보강이 겹치는지 보려고)
  for (const classId of classIds) {
    const c = await classSessions(db, classId, ym, { today, min });
    const kept = c.dates.filter((d) => cal.get(d)?.has(classId));   // ⚠️ 소속 기간으로 자른다
    kept.forEach((d) => mine.add(d));
    byClass.push({
      classId, dates: kept,
      done: kept.filter((d) => d <= today).length,
      planned: kept.filter((d) => d > today).length,
      total: kept.length, min,
      short: Math.max(0, min - kept.length), enough: kept.length >= min,
    });
  }
  byClass.sort((a, b) => String(a.classId).localeCompare(String(b.classId)));

  // 잡아 둔 보강 — 이미 수업이 있는 날이면 안 더한다 (그날은 원래 회차다)
  // ⚠️ **보강이 회차에 더해지는지는 계획서에 안 적혀 있다.** 더하는 쪽으로 짰다.
  //    안 더하면 보강을 다 잡은 뒤에도 「모자람」이 그대로 떠서 **같은 보강을 또 잡는다.**
  const mk = (await db.query(SQL_MAKEUP, [[studentId], first, last])).rows;
  const makeupDates = [...new Set(mk.map((r) => ymd(r.on_date)).filter((d) => d && !mine.has(d)))].sort();

  return {
    studentId, ym, today, byClass, makeupDates,
    total: byClass.reduce((a, c) => a + c.total, 0) + makeupDates.length,
    shortClasses: byClass.filter((c) => !c.enough),
  };
}

/**
 * 「보강 잡을 것」 — 그 반이 8회를 못 채우면 **아이마다** 몇 회 모자란지.
 *
 * ⚠️ 보강일은 **학생마다 따로 잡는다** — 전체 보강일 하루를 잡는 것이 아니다(원장님 확정).
 *    그래서 여기가 내놓는 것도 「그 반 N회 모자람」이 아니라 **아이 목록**이다.
 * ⚠️ 반 명단은 `v2.class_roster()` 로만 읽는다 (자동 검사 ⑮).
 *
 * ⚠️ **확인 안 됨** — 달 중간에 들어온 아이도 8회를 채워야 하는지 원장님께 안 여쭸다.
 *    지금은 그 아이가 실제로 설 수 있었던 날만 세므로 **모자람이 크게 잡힌다.**
 *
 * @returns {{ classId, ym, class: <classSessions>, students:[{studentId, sessions, makeup, count, short}] }}
 */
export async function makeupTargets(db, classId, ym, opts = {}) {
  const { first, last } = monthRange(ym);
  const c = await classSessions(db, classId, ym, opts);
  const min = c.min;
  if (c.enough) return { classId, ym, class: c, students: [] };
  if (c.dates.length === 0) return { classId, ym, class: c, students: [] };

  // 그 반의 수업 날마다 명단 — 한 벌을 지나간다
  const roster = new Map(); // studentId → Set(date)
  for (const r of (await db.query(SQL_ROSTER, [classId, c.dates])).rows) {
    const d = ymd(r.date);
    if (!roster.has(r.student_id)) roster.set(r.student_id, new Set());
    roster.get(r.student_id).add(d);
  }
  if (roster.size === 0) return { classId, ym, class: c, students: [] };

  // 이미 잡아 둔 보강은 뺀다 — 안 빼면 같은 보강을 또 잡는다
  const ids = [...roster.keys()];
  const mk = new Map();
  for (const r of (await db.query(SQL_MAKEUP, [ids, first, last])).rows) {
    const d = ymd(r.on_date);
    if (!d) continue;                                   // state='todo' 는 날짜가 없다
    if (roster.get(r.student_id)?.has(d)) continue;     // 원래 수업이 있던 날
    if (!mk.has(r.student_id)) mk.set(r.student_id, new Set());
    mk.get(r.student_id).add(d);
  }

  const students = ids.map((studentId) => {
    const sessions = [...roster.get(studentId)].sort();
    const makeup = [...(mk.get(studentId) ?? [])].sort();
    const count = sessions.length + makeup.length;
    return { studentId, sessions, makeup, count, short: Math.max(0, min - count) };
  }).filter((s) => s.short > 0)
    .sort((a, b) => b.short - a.short || String(a.studentId).localeCompare(String(b.studentId)));

  return { classId, ym, class: c, students };
}

/**
 * 일정 화면 맨 위 — 반마다 「이 달 몇 회」. **8회 미만이면 빨갛게** (`enough:false`).
 * ⚠️ 반 이름은 여기서 안 짓는다 — 요일·시각에서 저절로 지어지는 것은 화면 쪽 일이다.
 */
export async function monthBoard(db, ym, opts = {}) {
  const today = opts.today ? ymd(opts.today) : await todayOf(db);
  const classes = (await db.query(SQL_CLASSES, [])).rows;
  const out = [];
  for (const c of classes) {
    out.push({ kind: c.kind, ...(await classSessions(db, c.id, ym, { ...opts, today })) });
  }
  return out;
}
