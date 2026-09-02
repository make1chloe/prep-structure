/**
 * 일정 화면이 **읽는** 자리. 여기엔 판단이 없다 — 묻고, `lib/` 을 부르고, 받은 것을 넘긴다.
 *
 * ── 판단은 전부 남의 것이다 (원칙 1). 여기서 다시 짜지 않는다:
 *    `lib/session.js`  monthBoard      반마다 「이 달 몇 회」 · **8회 미만이면 빨갛게**
 *                      makeupTargets   못 채운 반의 **아이마다** 몇 회 모자란가 (보강은 학생마다)
 *                      monthRange · ymd · DOW_NAME · MIN_SESSIONS
 *    `lib/todo.js`     myTodos         **「내 할 일」 하나** — 바깥 축은 할 일 종류 (㊴)
 *                      FILTERS         거르개 한 줄 (전체 · 전국 시험 · 시험 없는 것 · 학교)
 *                      ddayLabel       D-N 글자
 *    SQL 함수          v2.today() · v2.class_roster()
 *
 * ── ⚠️ 조회 수 (계획 §속도 표 — `/schedule` 은 **조회 8 · 2단**)
 *    이 파일이 스스로 쓰는 조회는 **하나**다 (`sc:month` 한 벌).
 *    `lib/session.js` 는 반마다 두 번씩 묻는데(실측 2026-09-02: `monthBoard` 가 **17번**),
 *    그 물음을 **미리 읽어 둔 한 벌로** 받아 준다 — 아래 `memoryDoor()`.
 *    나머지는 `lib/todo.js` 의 `myTodos()` 가 쓴다 — **여섯**을 차례로 묻는다(실측).
 *    합 **7**. 화면이 그 숫자를 **감추지 않고 띄운다**(대전제 0).
 *
 * ⚠️⚠️ **SQL 을 함수 안에 흩지 마라.** `scripts/check-sql.mjs` 는 `lib` 만 훑어서
 *    `app/` 의 SQL 을 **원리적으로 안 본다.** 여기 `SQL` 에 담아 두면
 *    `scripts/check-screen-schedule.mjs` 가 **진짜 스키마에 PREPARE** 해서 없는 칸을 그 자리에서 잡는다.
 * ⚠️ 값은 `$1` 로 넘긴다. `${…}` 로 끼우면 기계로 검사할 수가 없다.
 */
import {
  monthBoard, makeupTargets, monthRange, ymd, DOW_NAME, MIN_SESSIONS,
} from "../../lib/session.js";
import { myTodos, FILTERS, ddayLabel } from "../../lib/todo.js";

/** 달 모양 — ⚠️ 틀린 글자를 `to_date` 에 넘기면 엉뚱한 달을 세고도 오류가 안 난다 */
export const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * **쓸 수 있나** — 규칙(RLS)이 열려 있어도 **권한(GRANT)이 없으면 아무것도 못 쓴다.**
 * 0005 가 그 함정을 적어 뒀다: 「규칙만 있고 권한이 없으면 아무도 못 본다 … **둘 다** 있어야 한다」.
 * ⚠️ 목록을 글자로 박아 두면 권한이 들어온 날 화면만 옛말을 한다 — 그래서 **매번 물어본다**
 *    (`has_table_privilege` 는 조회 안에 얹히므로 왕복이 안 는다).
 */
const CAN_WRITE = `(select json_object_agg(t, json_build_object(
        'ins', has_table_privilege('v2.'||t, 'insert'),
        'upd', has_table_privilege('v2.'||t, 'update')))
     from unnest(array['holiday','makeup','day_sheet','exams','todo','month_confirm']) t)`;

export const SQL = {
  /**
   * **한 달치 한 벌.** 회차·달력·시험·도장이 전부 이 하나에서 나온다.
   * ⚠️ 카드마다 따로 물으면 여섯 번이 된다 (§속도 1·2).
   * ⚠️ 날짜는 전부 `to_char(…, 'YYYY-MM-DD')` 로 **글자**로 낸다 —
   *    node-pg 가 주는 `date` 는 그 기계 시간대의 자정 Date 라 하루가 어긋난다(lib/session.js 의 경고).
   */
  month: `/* sc:month */
with p as (select case when $1::text ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
                       then $1::text else to_char(v2.today(),'YYYY-MM') end as ym),
r as (select ym,
             to_date(ym||'-01','YYYY-MM-DD') as d1,
             (to_date(ym||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')::date as d2
        from p),
days as (select d::date as date, r.d1, r.d2, r.ym from r, generate_series(r.d1, r.d2, interval '1 day') d),
roster as (
  select to_char(days.date,'YYYY-MM-DD') as date, cs.class_id, ro.student_id
    from days
    join v2.class_schedule cs
      on cs.from_date <= days.date and (cs.to_date is null or cs.to_date >= days.date)
     and extract(dow from days.date)::int = any(cs.weekdays)
   cross join lateral v2.class_roster(cs.class_id, days.date) ro)
select json_build_object(
 'today', to_char(v2.today(),'YYYY-MM-DD'),
 'ym',    r.ym,
 'first', to_char(r.d1,'YYYY-MM-DD'),
 'last',  to_char(r.d2,'YYYY-MM-DD'),
 'nextYm', to_char(r.d1 + interval '1 month','YYYY-MM'),
 'prevYm', to_char(r.d1 - interval '1 month','YYYY-MM'),
 'classes', (select coalesce(json_agg(json_build_object(
                 'id',c.id,'kind',c.kind,'nickname',c.nickname) order by c.created_at),'[]'::json)
               from v2.classes c where c.state = 'active'),
 'schedules', (select coalesce(json_agg(json_build_object(
                 'class_id',cs.class_id,'weekdays',cs.weekdays,
                 'from_date',to_char(cs.from_date,'YYYY-MM-DD'),
                 'to_date',to_char(cs.to_date,'YYYY-MM-DD'),
                 'start_time',cs.start_time::text,'end_time',cs.end_time::text)
                 order by cs.from_date),'[]'::json)
               from v2.class_schedule cs
              where cs.from_date <= r.d2 and (cs.to_date is null or cs.to_date >= r.d1)),
 'holidays', (select coalesce(json_agg(json_build_object(
                 'id',h.id,'date',to_char(h.date,'YYYY-MM-DD'),
                 'class_id',h.class_id,'reason',h.reason) order by h.date),'[]'::json)
               from v2.holiday h where h.date between r.d1 and r.d2),
 'makeups', (select coalesce(json_agg(json_build_object(
                 'id',m.id,'student_id',m.student_id,'name',st.name,
                 'of_date',to_char(m.of_date,'YYYY-MM-DD'),
                 'on_date',to_char(m.on_date,'YYYY-MM-DD'),
                 'at_time',m.at_time::text,'state',m.state) order by m.on_date, st.name),'[]'::json)
               from v2.makeup m join v2.students st on st.id = m.student_id
              where m.on_date between r.d1 and r.d2),
 'planned', (select coalesce(json_agg(json_build_object(
                 'id',s.id,'student_id',s.student_id,'name',st.name,'class_id',s.class_id,
                 'date',to_char(s.date,'YYYY-MM-DD'),'attend',s.attend,
                 'closed_at',s.closed_at,'updated_at',s.updated_at::text)
                 order by s.date, st.name),'[]'::json)
               from v2.day_sheet s join v2.students st on st.id = s.student_id
              where s.date between r.d1 and r.d2 and s.attend in ('absent','late')),
 'roster', (select coalesce(json_agg(json_build_object(
                 'date',roster.date,'class_id',roster.class_id,'student_id',roster.student_id)),'[]'::json)
               from roster),
 'exams', (select coalesce(json_agg(json_build_object(
                 'id',e.id,'scope',e.scope,'school_id',e.school_id,'school_name',sc.name,
                 'grade',e.grade,'name',e.name,
                 'term_from',to_char(e.term_from,'YYYY-MM-DD'),
                 'term_to',to_char(e.term_to,'YYYY-MM-DD'),
                 'english_on',to_char(e.english_on,'YYYY-MM-DD'),
                 'source',e.source,'state',e.state)
                 order by e.scope, coalesce(e.english_on,e.term_from), e.name),'[]'::json)
               from v2.exams e left join v2.schools sc on sc.id = e.school_id
              where e.state = 'active'),
 'dup_national', (select count(*)::int from (
                 select 1 from v2.exams e where e.scope = 'national' and e.state = 'active'
                  group by e.name, e.term_from, e.term_to, e.grade having count(*) > 1) z),
 'schools', (select coalesce(json_agg(json_build_object('id',sc.id,'name',sc.name,'level',sc.level)
                 order by sc.name),'[]'::json)
               from v2.schools sc where sc.state = 'active'),
 'stamps', (select coalesce(json_agg(json_build_object(
                 'ym',mc.ym,'class_id',mc.class_id,'step',mc.step,'at',mc.at)),'[]'::json)
               from v2.month_confirm mc
              where mc.ym in (r.ym, to_char(r.d1 + interval '1 month','YYYY-MM'))),
 'students', (select coalesce(json_agg(json_build_object('id',st.id,'name',st.name,'grade',st.grade)
                 order by st.name),'[]'::json)
               from v2.students st where st.state = 'active'),
 'can_write', ${CAN_WRITE}
) as j
from r`,
};

/**
 * **미리 읽어 둔 한 벌로 답하는 문.** `lib/session.js` 가 반마다 두 번씩 묻는 것을 받아 준다.
 *
 * ⚠️⚠️ **셈은 여기서 안 한다.** 회차도 8회 판정도 보강 대상도 전부 `lib/session.js` 가 센다 —
 *    이 문은 **그 함수가 물어보는 줄을 돌려줄 뿐**이다(원칙 1).
 *    `app/_home/read.js` 는 `countDates()` 만 부르고 `short`·`enough` 를 화면에서 다시 지었는데,
 *    그러면 8회 판정이 **두 벌**이 된다. 여기서는 `monthBoard()` 를 통째로 부른다.
 *
 * ⚠️ **못 알아본 물음은 진짜 DB 로 그냥 흘려보낸다.** lib 의 SQL 이 바뀌어도 답이 틀리지 않고
 *    **조회만 는다** — 그리고 검사(`scripts/check-screen-schedule.mjs`)가 그 수를 세어
 *    「미리 읽어 둔 것으로 못 막았다」를 그 자리에서 빨갛게 만든다.
 */
export function memoryDoor(real, m) {
  const { first, last } = { first: m.first, last: m.last };
  let miss = 0;
  const rows = (list) => ({ rows: list });
  return {
    missed: () => miss,
    query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, " ");

      // ① 살아 있는 반 (lib/session.js SQL_CLASSES)
      if (/from v2\.classes where state = 'active'/.test(s))
        return Promise.resolve(rows(m.classes.map((c) => ({ id: c.id, kind: c.kind }))));

      // ② 그 반의 요일 이력 (SQL_SCHEDULE) — 창은 이미 그 달로 잘라 읽어 뒀다
      if (/from v2\.class_schedule where class_id = \$1/.test(s))
        return Promise.resolve(rows(m.schedules.filter((x) => x.class_id === params[0])));

      // ③ 휴강 (SQL_HOLIDAY) — 학원 전체(class_id null) + 그 반
      if (/from v2\.holiday where date between \$2 and \$3/.test(s))
        return Promise.resolve(rows(m.holidays
          .filter((h) => h.class_id == null || h.class_id === params[0])
          .map((h) => ({ date: h.date, class_id: h.class_id }))));

      // ④ 반 명단 (SQL_ROSTER) — ⚠️ 이 줄들도 `v2.class_roster()` 를 지나서 읽어 온 것이다
      if (/lateral v2\.class_roster\(\$1, d::date\)/.test(s)) {
        const want = new Set((params[1] ?? []).map(ymd));
        return Promise.resolve(rows(m.roster
          .filter((x) => x.class_id === params[0] && want.has(x.date))
          .map((x) => ({ date: x.date, student_id: x.student_id }))));
      }

      // ⑤ 잡아 둔 보강 (SQL_MAKEUP)
      if (/from v2\.makeup where student_id = any\(\$1::uuid\[\]\)/.test(s)) {
        const who = new Set(params[0] ?? []);
        return Promise.resolve(rows(m.makeups
          .filter((k) => who.has(k.student_id) && k.state !== "waived"
                      && k.on_date && k.on_date >= first && k.on_date <= last)
          .map((k) => ({ student_id: k.student_id, on_date: k.on_date, state: k.state }))));
      }

      miss++;                       // ⚠️ 못 막았다 — 진짜 왕복이 하나 는다. 검사가 세어 밝힌다
      return real.query(sql, params);
    },
  };
}

/**
 * 한 달치를 읽고 `lib/` 에 먹인다.
 *
 * @returns { m, board, makeup, todos, cap }
 *   `board`  반마다 회차 (lib/session.js `monthBoard`)
 *   `makeup` 못 채운 반의 아이 목록 (lib/session.js `makeupTargets`) — **학생마다 따로**
 *   `todos`  「내 할 일」 한 판 (lib/todo.js `myTodos`)
 */
export async function loadMonth(db, { ym = null, filter = "all" } = {}) {
  const q = await db.query(SQL.month, [YM.test(String(ym ?? "")) ? ym : null]);
  const m = q.rows[0].j;

  // ⚠️ 여기부터는 **왕복이 없다.** 미리 읽어 둔 한 벌이 lib 의 물음을 받아 준다
  const mem = memoryDoor(db, m);
  const board = await monthBoard(mem, m.ym, { today: m.today });

  // 못 채운 반만 — ⚠️ 「그 반 N회 모자람」이 아니라 **아이 목록**이다 (보강은 학생마다 따로)
  const makeup = [];
  for (const c of board) {
    if (c.enough) continue;
    makeup.push(await makeupTargets(mem, c.classId, m.ym, { today: m.today }));
  }

  // 「내 할 일」 — ⚠️ 여기서 다시 짜지 않는다. 바깥 축·거르개·묶기가 전부 lib/todo.js 에 있다
  const todos = await myTodos(db, { today: m.today, filter });

  return { m, board, makeup, todos, missed: mem.missed() };
}

/* ═══════════════════════════════════════════════════════════════════
 * 달력에 얹을 것 — **정상 수업은 안 띄우고 휴강을 띄운다**(오류 85) ·
 * **사유별로 묶는다**(오류 86) · **15×15 고정 아이콘**(오류 78).
 *
 * ⚠️ 여기는 「무엇을 그리나」이지 「무엇이 사실인가」가 아니다.
 *    날짜·이름은 위 한 벌이 준 것을 **모아 놓기만** 한다 — 새로 세지 않는다.
 * ═══════════════════════════════════════════════════════════════════ */

/** 달력 한 칸에 서는 줄의 갈래. ⚠️ 아이콘은 **15×15 고정**이다 (오류 78 — 점은 길이가 제각각이었다) */
export const MARKS = Object.freeze([
  { key: "off",    icon: "🚫", label: "휴강",      pill: "pillbad"  },
  { key: "makeup", icon: "🔁", label: "보강",      pill: "pillinfo" },
  { key: "absent", icon: "🅰", label: "결석",      pill: "pillwarn" },
  { key: "late",   icon: "⏰", label: "지각",      pill: "pillwarn" },
  { key: "exam",   icon: "📝", label: "시험",      pill: "pillinfo" },
]);

/** 그 달 날짜를 하루씩 — 요일 칸이 맞도록 앞쪽 빈 칸 수(`pad`)도 같이 낸다 */
export function monthDays(ym) {
  const { first, last } = monthRange(ym);
  const [y, mo] = ym.split("-").map(Number);
  const out = [];
  for (let d = 1; d <= Number(last.slice(8)); d++) {
    const date = `${ym}-${String(d).padStart(2, "0")}`;
    out.push({ date, day: d, dow: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() });
  }
  return { pad: new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(), days: out, first, last };
}

/**
 * 날짜 → 그날 서는 줄들. **사유별로 묶는다** — 「결석 · 강민서, 구도은」(오류 86).
 * ⚠️ 사람마다 한 줄이면 23명 날에 스물세 줄이 선다.
 */
export function calendarMarks(m) {
  const at = new Map();
  const put = (date, key, who, why) => {
    if (!date) return;
    if (!at.has(date)) at.set(date, new Map());
    const bin = at.get(date);
    if (!bin.has(key)) bin.set(key, { key, who: [], why: [] });
    if (who) bin.get(key).who.push(who);
    if (why && !bin.get(key).why.includes(why)) bin.get(key).why.push(why);
  };

  // 휴강 — ⚠️ **정상 수업은 안 띄운다**(오류 85). 당연한 것이라 자리만 먹는다
  for (const h of m.holidays) put(h.date, "off", null, h.reason || "휴강");
  // 보강 — 무른 것(waived)은 안 띄운다. 지우지는 않았다(대전제 6)
  for (const k of m.makeups) if (k.state !== "waived") put(k.on_date, "makeup", k.name, null);
  // 결석·지각 (예정 포함)
  for (const p of m.planned) put(p.date, p.attend === "late" ? "late" : "absent", p.name, null);
  // 시험 — ⚠️ **전국은 학교를 안 붙인다**(㊲)
  for (const e of m.exams) {
    const day = e.english_on ?? e.term_from;
    put(day, "exam", null, e.scope === "national" ? e.name : `${e.school_name ?? "?"} ${e.name}`);
  }

  const out = new Map();
  for (const [date, bin] of at) {
    out.set(date, MARKS.filter((k) => bin.has(k.key)).map((k) => ({ ...k, ...bin.get(k.key) })));
  }
  return out;
}

/** 그날 이미 몇 명 보강이 잡혀 있나 — ⚠️ **보여 주기만 하고 막지 않는다**(㉔ · 오류 82) */
export function makeupLoad(m) {
  const n = {};
  for (const k of m.makeups) if (k.state !== "waived" && k.on_date) n[k.on_date] = (n[k.on_date] ?? 0) + 1;
  return n;
}

/** 그날 수업이 있는 아이 — 반 명단은 `v2.class_roster()` 를 지나 읽어 온 것이다 (자동 검사 ⑮) */
export function whoOn(m) {
  const byName = new Map(m.students.map((s) => [s.id, s.name]));
  const at = new Map();
  for (const r of m.roster) {
    if (!at.has(r.date)) at.set(r.date, new Map());
    at.get(r.date).set(r.student_id, { id: r.student_id, name: byName.get(r.student_id) ?? "?", classId: r.class_id });
  }
  return Object.fromEntries([...at].map(([d, v]) => [d, [...v.values()]]));
}

export { FILTERS, ddayLabel, DOW_NAME, MIN_SESSIONS, ymd };
