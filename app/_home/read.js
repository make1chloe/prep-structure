/**
 * 대시보드가 DB 에서 읽는 자리 — **한 곳뿐이다.**
 *
 * ⚠️⚠️ **여기서 새 판단을 만들지 않는다.** 세는 것·가르는 것은 전부
 *    `lib/` 아니면 `v2.` 함수가 한다. 이 파일이 하는 일은 셋뿐이다.
 *      ① 그 사람으로 DB 문을 연다 (접근 규칙 안에서)
 *      ② `lib/` 함수와 `v2.` 함수를 **부른다**
 *      ③ 화면이 바로 그릴 수 있는 모양으로 넘긴다
 *
 * ── 왜 `pg` 인가 (지어낸 말이 아니라 실측이다) ─────────────────────────
 *   `lib/` 의 모든 셈이 `{ query(sql, params) }` 를 받는다 (`lib/todo.js` ·
 *   `lib/session.js` · `lib/progress.js` 전부). PostgREST 는 그 SQL 을 못 돌린다.
 *   그래서 화면도 크론과 같은 문(`pg`)으로 붙는다.
 *
 * ⚠️ **그렇다고 접근 규칙을 지나가지는 않는다.** 붙자마자
 *    `set local role authenticated` + `request.jwt.claims` 로 **그 사람이 되어**
 *    읽는다 — `scripts/check-v2-rls.mjs` 가 쓰는 것과 **똑같은 손씨**다.
 *    그래서 원장이 아닌 사람이 이 화면을 열어도 DB 가 남의 자료를 안 준다.
 *    ⚠️ **서비스 열쇠(`lib/db.js` 의 `serviceDb()`)는 여기서 한 번도 안 쓴다.**
 *       그걸 쓰면 접근 규칙이 통째로 꺼진다 — `scripts/check-screen-home.mjs` 가 지킨다.
 *
 * ⚠️ 그리고 `begin read only` 안에서 읽는다. **화면은 한 글자도 못 쓴다** —
 *    `lib/queue.js` 의 `guardDb()` 로 한 겹 더 막는다(글자 방패). 쓰는 자리는
 *    `app/_home/actions.js` 하나뿐이고 그건 따로 붙는다.
 *
 * ── 속도 (계획 「속도」 절 · 지금 앱 `/` 는 조회 ~85 · 직렬 ~19단) ──────
 *   여기는 **문 다섯**으로 나눠 붙고, 문끼리는 **같이 돈다** (실측 2026-09-02).
 *     문1 첫 줄   : 세우기 1 + 조회 1 = **2단**  ← 첫 그림이 기다리는 것은 이것뿐이다
 *     문2 진도·판 : 세우기 1 + 조회 3 = 4단
 *     문3 반 회차 : 세우기 1 + 조회 2 = 3단  (+ 문1 을 기다려 5단)
 *     문4 교재·수강료: 세우기 1 + 조회 2 = 3단
 *     문5 내 할 일: 세우기 1 + 조회 6 = 7단  (+ 문1 을 기다려 **9단**) ← ⚠️ 아래
 *   조회 합 = 5 + 14 = **19** (상한 20).  `scripts/check-screen-home.mjs` 가 진짜로 세어 본다.
 *
 * ⚠️ **문5 가 9단인 까닭** — `lib/todo.js` 의 `myTodos()` 가 조회 여섯을 **차례로** 묻는다
 *    (loadTodos → academyDays 둘 → sheetsOn → loadExams → loadMaterials. 실측 2026-09-02).
 *    화면에서 그것을 다시 짜면 「할 일이 무엇인가」가 두 벌이 된다(원칙 1) — 그래서 **안 짰다.**
 *    `lib/todo.js` 가 겹쳐 묻게 고쳐지면 3단으로 떨어진다. 보고의 `needsDb` 에 적었다.
 */

import {
  MIN_SESSIONS, DOW_NAME, monthRange, countDates, ymd,
} from "../../lib/session.js";
import { pendingMarks, openFlags } from "../../lib/progress.js";
import { myTodos, passesFilter, FILTERS } from "../../lib/todo.js";
import { guardDb, daysBetween } from "../../lib/queue.js";

/* ═══════════════════════════════════════════════════════════════════
 * 0. 이 화면이 DB 에 묻는 것 — **전부 읽기다**
 *
 * ⚠️⚠️ **SQL 을 함수 안에 흩지 마라.** `scripts/check-sql.mjs` 는 `lib` 만 훑어서
 *    `app/` 의 SQL 을 **원리적으로 안 본다** (크론 파일이 같은 까닭으로 같은 모양이다).
 *    여기 담아 두면 `scripts/check-screen-home.mjs` 가 **진짜 스키마에 PREPARE** 해서
 *    없는 칸을 읽는지 그 자리에서 잡는다.
 * ⚠️ 값은 `$1` 로 넘긴다. `${…}` 로 끼우면 기계로 검사할 수가 없다.
 * ═══════════════════════════════════════════════════════════════════ */
export const SQL = {
  /**
   * 맨 위 두 줄 + 카드 차례 — **한 번에 묻는다.** 첫 그림이 기다리는 유일한 조회다.
   * ⚠️ 「며칠째」는 `v2.progress_open_days()` 가 센다 — **저장하지 않는다**(원칙 5).
   * ⚠️ `::text` 를 빼지 마라. `date` 로 받으면 node-pg 가 **그 기계 시간대의 자정** Date 로 줘서
   *    UTC 서버에서 하루가 어긋난다 (크론 파일이 겪은 것과 같은 자리).
   * ⚠️ `ran_on <= v2.today()` — 앞날 도장이 한 번 박히면(`?on=2027-01-05`) 그때까지
   *    「크론이 멈췄다」가 영영 안 뜬다. `v2.day_ran` 은 못 지운다(대전제 6).
   */
  frame: `/* q:home-frame */
    select v2.today()::text                                as today,
           v2.progress_open_days()                         as edit_days,
           (select is_open   from v2.progress_edit where scope = 'academy') as edit_open,
           (select opened_on::text from v2.progress_edit where scope = 'academy') as edit_from,
           (select max(ran_on)::text from v2.day_ran where ran_on <= v2.today()) as cron_on,
           (select layout from v2.screen_pref
             where profile_id = v2.me() and screen = 'home')  as layout`,

  /**
   * 판 — 「마감 안 한 판」과 「마감했는데 안 보낸 판」은 **다른 사실이다.**
   * ⚠️ 둘을 하나로 세면 안 된다. 마감이 0 인 동안(실측 2026-09-02: 1,954 판 중 마감 0)
   *    「안 보낸 판」은 늘 0 이라 **아무 일도 없는 것처럼 보인다.**
   * ⚠️ 앞날 판은 안 센다 — 오늘 이후의 판은 아직 마감할 것이 아니다.
   */
  sheets: `/* q:home-sheets */
    select count(*) filter (where closed_at is null)::int                          as open_n,
           count(*) filter (where closed_at is not null and sent_at is null)::int   as unsent_n,
           min(date) filter (where closed_at is null)::text                         as oldest_open,
           count(*)::int                                                            as all_n
      from v2.day_sheet
     where date <= v2.today()`,

  /**
   * 반의 요일 이력 — 회차를 **여기서 세지 않는다.** 줄만 가져와 `countDates()`(lib/session.js)에 넘긴다.
   * ⚠️ `v2.session_count()` 를 부르지 않는다 — `lib/session.js` 가 「그건 join 이라
   *    이력 두 줄이 겹치면 하루를 두 번 센다」고 못 박아 두었다. 8회 반이 조용히 16회가 된다.
   */
  schedules: `/* q:home-schedules */
    select c.id as class_id, c.kind, c.nickname,
           s.from_date, s.to_date, s.weekdays, s.start_time
      from v2.classes c
      join v2.class_schedule s on s.class_id = c.id
     where c.state = 'active'
       and s.from_date <= $2::date and (s.to_date is null or s.to_date >= $1::date)
     order by c.created_at, s.from_date`,

  /** ⚠️ 반 하나만 쉬는 날도 그 반에서는 빠진다 — `class_id` 를 같이 준다 */
  holidays: `/* q:home-holidays */
    select date, class_id from v2.holiday where date between $1::date and $2::date`,

  /**
   * 교재 한 권의 지금 — **판단 셋을 전부 DB 함수가 한다.**
   *   `v2.book_progress` 끝났나 · `v2.memo_only_streak` 메모로만 몇 번 · `v2.book_stop` 멈췄나
   * ⚠️ 세 함수를 **한 조회 안에서** 부른다. 짝(163줄)마다 따로 물으면 조회가 489 가 된다.
   * ⚠️ 진행 중인 배정만 본다 — 끝난 배정까지 세면 「끝나감」이 영영 안 사라진다.
   */
  books: `/* q:home-books */
    select st.id as student_id, st.name as student_name,
           b.id  as book_id,    b.name as book_name, sb.round,
           p.done, p.skipped, p.total,
           v2.memo_only_streak(sb.student_id, sb.book_id) as memo_n,
           v2.book_stop(sb.student_id, sb.book_id)        as stop
      from v2.student_book sb
      join v2.students st on st.id = sb.student_id
      join v2.books    b  on b.id  = sb.book_id
      cross join lateral v2.book_progress(sb.student_id, sb.book_id) p
     where st.state = 'active'
       and sb.from_date <= v2.today()
       and (sb.to_date is null or sb.to_date >= v2.today())`,

  /**
   * 수강료 — ⚠️ **「미납」을 여기서 판정하지 않는다.** 「며칠 지나면 미납인가」가
   *    계획서에도 `v2.auto_rule` 에도 없다 (실측 2026-09-02: `auto_rule` 0줄).
   *    그래서 **본 것만** 낸다 — 줄이 없다 · 금액이 안 적혔다 · 낸 날이 비었다.
   *    (`v2.payment` 주석: 「금액이 비면 0원이 아니라 **아직 안 적음**이다」)
   */
  fee: `/* q:home-fee */
    select to_char(v2.today(), 'YYYY-MM')                                   as ym,
           count(*)::int                                                     as active_n,
           count(*) filter (where p.id is null)::int                         as no_row,
           count(*) filter (where p.id is not null and p.amount is null)::int as no_amount,
           count(*) filter (where p.id is not null and p.paid_on is null)::int as no_paid
      from v2.students st
      left join v2.payment p
             on p.student_id = st.id and p.ym = to_char(v2.today(), 'YYYY-MM')
     where st.state = 'active'`,
};

/* ═══════════════════════════════════════════════════════════════════
 * 1. 문 — 그 사람이 되어 붙는다
 * ═══════════════════════════════════════════════════════════════════ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ⚠️ **세우는 글은 `$1` 을 못 쓴다** — 여러 문장을 한 왕복에 보내려면 매개변수가 없어야 한다.
 *    (있으면 node-pg 가 문장마다 따로 보내 왕복이 셋이 된다.)
 *    그래서 **UUID 를 정규식으로 확인하고** 글자에 끼운다. 모양이 아니면 그 자리에서 던진다 —
 *    끼워 넣기(injection)가 들어올 자리가 없다.
 */
export function setupSql(profileId) {
  const id = String(profileId ?? "");
  if (!UUID.test(id))
    throw new Error(`⚠️ 사람 번호가 UUID 모양이 아니다 — DB 문을 안 연다 (받은 값 길이 ${id.length})`);
  return (
    "begin read only; " +
    `select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true); ` +
    "set local role authenticated;"
  );
}

/**
 * 문 하나를 열어 `fn(db)` 를 돌리고 **반드시 닫는다.**
 *
 * @param profileId 로그인한 사람 (`lib/supabase-server.js` 의 `roleOf()` 가 준 것)
 * @param fn        `(db) => …` — db 는 **쓰기가 막힌 껍데기**다
 * @returns { ok, value, why, n } — n 은 이 문이 실제로 쓴 왕복 수 (검사가 센다)
 *
 * ⚠️ **던지지 않는다.** 카드 하나가 못 읽었다고 화면 전체가 죽으면
 *    원장님은 그날 아무것도 못 보신다. 못 읽은 카드만 까닭을 띄운다(대전제 0).
 */
export async function openAs(profileId, fn) {
  let client = null, n = 0;
  try {
    const { default: pg } = await import("pg");
    const url = process.env.DATABASE_URL;
    if (!url)
      return { ok: false, n: 0, value: null,
               why: "⚠️ DATABASE_URL 이 없다 — 화면이 DB 에 못 붙는다 (Vercel 환경변수)" };
    client = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
      query_timeout: 8000,
      statement_timeout: 8000,
    });
    await client.connect();
    await client.query(setupSql(profileId));            // 왕복 1 (여러 문장을 한 번에)
    n++;
    // ⚠️ 쓰기를 글자로 한 겹 더 막는다 — `lib/queue.js` 의 것을 그대로 쓴다 (원칙 1)
    const guarded = guardDb({ query: (sql, params) => { n++; return client.query(sql, params); } }, []);
    const value = await fn(guarded);
    return { ok: true, value, why: "", n };
  } catch (e) {
    return { ok: false, value: null, n, why: String(e?.message ?? e) };
  } finally {
    // ⚠️ 트랜잭션을 굳이 되돌리지 않는다 — 연결을 끊으면 Postgres 가 알아서 되돌린다.
    //    되돌리기를 기다리면 그만큼 화면이 늦는다.
    try { await client?.end(); } catch { /* 이미 끊겼다 */ }
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * 2. 카드마다 하나씩 — **부르기만 한다**
 * ═══════════════════════════════════════════════════════════════════ */

/** 맨 위 두 줄 + 카드 차례 (문1 · 조회 1) */
export async function readFrame(me) {
  return openAs(me, async (db) => {
    const r = await db.query(SQL.frame, []);
    const row = r.rows[0] ?? {};
    const today = row.today ?? null;
    // 「N일째」 — 셈은 `v2.progress_open_days()` 가 한다. 여기서 다시 세지 않는다
    const editDays = row.edit_days == null ? null : Number(row.edit_days);
    // 크론이 쉰 날 — `lib/queue.js` 의 `daysBetween()` 이 센다 (양끝 포함이라 −1)
    let cronGap = null;
    if (today && row.cron_on) cronGap = daysBetween(ymd(row.cron_on), today).length - 1;
    return {
      today,
      editOpen: row.edit_open === true,
      editDays,
      editFrom: row.edit_from ?? null,
      cronOn: row.cron_on ?? null,
      cronGap,                                  // null 이면 「한 번도 안 돌았다」
      order: Array.isArray(row.layout?.order) ? row.layout.order.map(String) : null,
    };
  });
}

/** 아이가 찍은 진도 · ❗이의 · 판 (문2 · 조회 3) */
export async function readWaiting(me) {
  return openAs(me, async (db) => {
    const marks = await pendingMarks(db, { limit: 200 });   // lib/progress.js
    const flags = await openFlags(db, { limit: 200 });      // lib/progress.js
    const sheets = (await db.query(SQL.sheets, [])).rows[0] ?? {};
    return {
      marks, flags,
      sheet: {
        openN: Number(sheets.open_n ?? 0),
        unsentN: Number(sheets.unsent_n ?? 0),
        oldestOpen: sheets.oldest_open ?? null,
        allN: Number(sheets.all_n ?? 0),
      },
    };
  });
}

/**
 * 반 회차 (문3 · 조회 2) — **셈은 `countDates()`(lib/session.js) 한 벌이다.**
 *
 * ⚠️ 반마다 따로 묻지 않는다. `lib/session.js` 의 `classSessions()` 는 반 하나마다 조회 둘이라
 *    반 여덟이면 **조회 열여섯 · 직렬 열여섯**이다(실측). 여기서는 이력을 **한 번에** 읽어
 *    반마다 `countDates()` 를 부른다 — 셈은 같은 한 벌이고 조회만 둘이다.
 */
export async function readSessions(me, today) {
  // ⚠️ 맨 위 줄이 못 읽혔으면 오늘이 없다. **날짜를 지어내지 않는다** — 까닭을 그대로 돌려준다
  //    (`monthRange()` 가 던지면 카드 하나가 아니라 **화면 전체**가 죽는다)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today ?? "")))
    return { ok: false, n: 0, value: null,
             why: "학원의 오늘을 못 읽었다 — 맨 위 줄이 먼저 막혀서 이 카드도 못 센다" };
  const ym = String(today).slice(0, 7);
  const { first, last } = monthRange(ym);
  return openAs(me, async (db) => {
    const sch = (await db.query(SQL.schedules, [first, last])).rows;
    const hol = (await db.query(SQL.holidays, [first, last])).rows;

    /* 반마다 회차 — **셈은 `countDates()`(lib/session.js) 한 벌이다.**
     * ⚠️ 8회 판정은 `total`(그 달 전체)로 한다. `done`(오늘까지)으로 하면 매달 1일에
     *    모든 반이 빨갛게 떠서 원장님이 헛보강을 잡으신다. */
    const byClass = new Map();
    for (const s of sch) {
      if (!byClass.has(s.class_id))
        byClass.set(s.class_id, { classId: s.class_id, kind: s.kind, nickname: s.nickname, rows: [] });
      byClass.get(s.class_id).rows.push(s);
    }
    const classes = [...byClass.values()].map((c) => {
      const off = hol.filter((h) => h.class_id == null || h.class_id === c.classId);
      const { dates, past, future } = countDates({
        schedules: c.rows, holidays: off, first, last, today,
      });
      const last1 = c.rows[c.rows.length - 1] ?? {};
      return {
        classId: c.classId, kind: c.kind, nickname: c.nickname,
        // 반 이름은 요일·시각에서 **저절로 지어진다** (v2.classes 에 이름 칸이 없다)
        label: naming(last1),
        done: past.length, planned: future.length, total: dates.length,
        min: MIN_SESSIONS, short: Math.max(0, MIN_SESSIONS - dates.length),
        enough: dates.length >= MIN_SESSIONS,
      };
    });

    return { ym, classes };
  });
}

/** 교재 · 수강료 (문4 · 조회 2) — 판단은 `v2.` 함수 셋이 한다 */
export async function readBooks(me) {
  return openAs(me, async (db) => {
    const books = (await db.query(SQL.books, [])).rows;
    const fee = (await db.query(SQL.fee, [])).rows[0] ?? {};
    return {
      books: books.map((b) => ({
        studentId: b.student_id, studentName: b.student_name,
        bookId: b.book_id, bookName: b.book_name, round: Number(b.round ?? 1),
        done: Number(b.done ?? 0), skipped: Number(b.skipped ?? 0), total: Number(b.total ?? 0),
        left: Math.max(0, Number(b.total ?? 0) - Number(b.done ?? 0) - Number(b.skipped ?? 0)),
        memoN: Number(b.memo_n ?? 0),
        stop: b.stop ?? null,
      })),
      fee: {
        ym: fee.ym ?? "",
        activeN: Number(fee.active_n ?? 0),
        noRow: Number(fee.no_row ?? 0),
        noAmount: Number(fee.no_amount ?? 0),
        noPaid: Number(fee.no_paid ?? 0),
      },
    };
  });
}

/**
 * 내 할 일 (문4 · 조회 6) — **`lib/todo.js` 가 준다. 여기서 세지 않는다.**
 *
 * ⚠️ 거르개를 `myTodos` 에 넘기지 않는다 — 넘기면 학교를 고를 때마다 **화면 전체 재조회**가 된다
 *    (계획 「속도」 1: 탭 전환이 곧 재조회다). 대신 줄마다 **어느 거르개를 지나는지**를
 *    `passesFilter()`(lib/todo.js)로 **여기서 한 번** 물어 붙여 둔다. 화면은 보이고 감추기만 한다.
 */
export async function readTodos(me, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today ?? "")))
    return { ok: false, n: 0, value: null,
             why: "학원의 오늘을 못 읽었다 — 맨 위 줄이 먼저 막혀서 이 카드도 못 센다" };
  return openAs(me, async (db) => {
    const board = await myTodos(db, { today });          // lib/todo.js — 판단 한 벌
    // 학교 목록은 **줄에서 나온다** — 학교 표를 따로 읽지 않는다 (조회 0)
    const schools = new Map();
    for (const g of board.groups)
      for (const r of g.rows)
        if (r.school_id && r.school_name) schools.set(String(r.school_id), r.school_name);

    const keys = [...FILTERS.map((f) => f.key), ...schools.keys()];
    const tag = (r) => ({ ...r, pass: keys.filter((k) => passesFilter(r, k)) });

    return {
      groups: board.groups.map((g) => ({ ...g, rows: g.rows.map(tag) })),
      aside: { ...board.aside, rows: board.aside.rows.map(tag) },
      counts: board.counts, moved: board.moved, lateN: board.late.length,
      filters: [...FILTERS.map((f) => ({ key: f.key, label: f.label })),
                ...[...schools].map(([key, label]) => ({ key, label }))],
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════
 * 3. 작은 글자 — 판단이 아니라 **이름 짓기**
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * 반 이름 — `v2.classes` 에는 이름 칸이 **없다**(표 주석: 「화면 이름은 요일·시각 이력에서
 * 저절로 지어진다」). 별명이 있으면 그것을 쓰고, 없으면 요일·시각으로 짓는다.
 */
export function naming(row = {}) {
  if (row.nickname) return String(row.nickname);
  const days = (row.weekdays ?? []).map(Number).map((d) => DOW_NAME[d] ?? "?").join("");
  const t = String(row.start_time ?? "").slice(0, 5);
  if (!days && !t) return "⚠️ 요일·시각이 안 적힌 반";
  return `${days || "?"}${t ? ` ${t}` : ""}`;
}
