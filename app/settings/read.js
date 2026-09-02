/**
 * 설정 화면이 DB 에서 **읽는** 자리 — 한 곳뿐이다.
 *
 * ⚠️⚠️ **여기서 새 판단을 만들지 않는다.** 세는 것·가르는 것은 전부
 *    `lib/` 아니면 `v2.` 함수가 한다. 이 파일이 하는 일은 셋뿐이다.
 *      ① 그 사람으로 DB 문을 연다 (접근 규칙 안에서)
 *      ② `lib/`·`v2.` 함수를 **부른다**
 *      ③ 화면이 바로 그릴 수 있는 모양으로 넘긴다
 *
 *    실제로 부르는 판단 넷 — 하나도 여기서 다시 짜지 않았다:
 *      `v2.progress_open_days()`  「며칠째 열려 있나」  (세어 나온다 · 원칙 5)
 *      `v2.can_edit_progress(학생)` 「이 아이가 지금 진도를 고칠 수 있나」
 *      `findHole()`  (lib/notify.js)  「이 문구를 지금 보내면 막히나」
 *      `cycleOf()`   (lib/queue.js)   「이 규칙의 주기를 아는가」
 *
 * ⚠️ **서비스 열쇠(`serviceDb()`)를 안 쓴다.** 그걸 쓰면 접근 규칙이 통째로 꺼져
 *    학생이 이 주소를 열었을 때 학원 설정이 그대로 나온다.
 *    붙자마자 `set local role authenticated` 로 **그 사람이 되어** 읽는다.
 *
 * ⚠️ **읽기 문은 `begin read only` 다.** 쓰는 자리는 `app/settings/actions.js` 하나뿐이다.
 *
 * ── 속도 — 이 화면은 **거의 안 여는 화면**이다 (계획 페이지 표: 「처음 한 번, 거의 안 엶」).
 *    그래서 문을 여럿으로 쪼개 첫 그림을 앞당기지 않았다. **문 하나 · 조회 5 · 6단**이고,
 *    그 숫자를 `scripts/check-screen-settings.mjs` 가 **진짜로 세어** 상한 8 과 견준다.
 *    쪼개면 조회 수는 그대로인데 세우기(`setupSql`)만 늘어난다 — 하루에 한 번 여는 화면에서
 *    그건 손해다.
 *
 * ⚠️ **SQL 을 함수 안에 흩지 마라.** `scripts/check-sql.mjs` 는 `lib` 만 훑어서
 *    `app/` 의 SQL 을 **원리적으로 안 본다.** 여기 `SQL` 에 담아 두어야
 *    `scripts/check-screen-settings.mjs` 가 **진짜 스키마에 PREPARE** 해 본다.
 * ⚠️ 값은 `$1` 로 넘긴다. `${…}` 를 SQL 에 끼우지 않는다.
 */

import { guardDb, cycleOf } from "../../lib/queue.js";
import { findHole } from "../../lib/notify.js";

/** 아이디 모양 — 글자를 세우는 글에 끼우기 전에 **반드시** 여기를 지난다 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 이 화면의 조회 상한. 거의 안 여는 화면이라 대시보드(20)보다 낮게 잡았다 */
export const QUERY_CAP = 8;

/** 배색 다섯 — **값은 `app/globals.css` 가 정한다.** 여기 이름을 더하면 그 배색은 안 먹는다 */
export const SKINS = [
  { id: "auto",   name: "기본",     why: "기계가 어두우면 저절로 어두워집니다" },
  { id: "deep",   name: "딥네이비", why: "늘 어둡습니다. 바탕이 깊고 카드가 떠 보입니다" },
  { id: "warm",   name: "따뜻하게", why: "어두운 쪽인데 파랑기를 뺐습니다" },
  { id: "paper",  name: "종이",     why: "밝은 쪽. 눈부심을 줄였습니다" },
  { id: "bright", name: "밝게",     why: "가장 밝고 대비가 셉니다" },
];

/** 학생별 진도 체크 — `v2.students.progress_edit` 가 받는 낱말 그대로다 (0008) */
export const STUDENT_MODES = [
  { id: "follow", name: "학원 따라감" },
  { id: "on",     name: "늘 켬" },
  { id: "off",    name: "늘 끔" },
];

/** 학교급 — `v2.stop_rule.level` 이 받는 낱말 그대로다 (0006) */
export const LEVELS = [
  { id: "high",   name: "고등" },
  { id: "middle", name: "중등" },
  { id: "elem",   name: "초등" },
];

/* ═══════════════════════════════════════════════════════════════════
 * 0. 이 화면이 DB 에 묻는 것 — **전부 읽기다**
 * ═══════════════════════════════════════════════════════════════════ */
export const SQL = {
  /**
   * 진도 체크 한 줄.
   * ⚠️ 「며칠째」는 `v2.progress_open_days()` 가 센다 — 화면에서 다시 세지 않는다(원칙 5).
   * ⚠️ `::text` 를 빼지 마라. `date` 로 받으면 node-pg 가 **그 기계 시간대의 자정** Date 로 줘서
   *    UTC 서버에서 하루가 어긋난다.
   */
  frame: `/* q:set-frame */
    select v2.today()::text                                                 as today,
           v2.progress_open_days()                                          as edit_days,
           (select is_open        from v2.progress_edit where scope = 'academy') as edit_open,
           (select opened_on::text from v2.progress_edit where scope = 'academy') as edit_from`,

  /**
   * 학생별 예외.
   * ⚠️ 「그래서 지금 이 아이가 고칠 수 있나」를 화면에서 조합하지 않는다 —
   *    `v2.can_edit_progress()` 한 곳이 판정한다. 여기서 `follow`×학원설정을 다시 짜면
   *    학생 화면(`app/me`)과 규칙이 두 벌이 된다.
   */
  students: `/* q:set-students */
    select s.id, s.name, s.grade,
           s.progress_edit            as mode,
           v2.can_edit_progress(s.id) as can_edit
      from v2.students s
     where s.state = 'active'
     order by s.name`,

  /** 교재 멈춤 기본 — 고등이 위로 오게 세운다 (원장님이 제일 자주 보는 줄) */
  stop: `/* q:set-stop */
    select level, weeks
      from v2.stop_rule
     order by case level when 'high' then 1 when 'middle' then 2 else 3 end`,

  /** 문구 — 원장님이 지어 쓰는 글 한 벌 */
  msg: `/* q:set-msg */
    select id, kind, title, body, updated_at::text as updated_at
      from v2.msg_template
     order by kind`,

  /**
   * 되풀이 규칙.
   * ⚠️ `where active` 를 걸지 않는다 — **꺼진 규칙이 안 보이면 다시 켤 수가 없다.**
   *    (`lib/queue.js` 의 `autoRules()` 는 켜진 것만 준다. 그건 크론이 쓰는 문이고 여기는 설정이다)
   */
  rules: `/* q:set-rules */
    select id, kind, name, cron, threshold, active, updated_at::text as updated_at
      from v2.auto_rule
     order by name`,
};

/* ═══════════════════════════════════════════════════════════════════
 * 1. 문 — 그 사람이 되어 연다
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ **세우는 글은 `$1` 을 못 쓴다** — 여러 문장을 한 왕복에 보내려면 매개변수가 없어야 한다.
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
 * @returns { ok, value, why, n } — n 은 이 문이 실제로 쓴 왕복 수 (검사가 센다)
 *
 * ⚠️ **던지지 않는다.** 설정 하나를 못 읽었다고 화면 전체가 죽으면 배색조차 못 고르신다.
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
    // 연결을 끊으면 Postgres 가 알아서 되돌린다 — 되돌리기를 기다리면 그만큼 화면이 늦는다
    try { await client?.end(); } catch { /* 이미 끊겼다 */ }
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * 2. 읽어서 화면 모양으로 — **부르기만 한다**
 * ═══════════════════════════════════════════════════════════════════ */

/** 설정 전부 (문1 · 조회 5) */
export async function readSettings(me) {
  return openAs(me, async (db) => {
    const f = (await db.query(SQL.frame, [])).rows[0] ?? {};
    const students = (await db.query(SQL.students, [])).rows;
    const stop = (await db.query(SQL.stop, [])).rows;
    const msg = (await db.query(SQL.msg, [])).rows;
    const rules = (await db.query(SQL.rules, [])).rows;

    return {
      today: f.today ?? null,
      // 진도 체크 — 「며칠째」는 세어서 왔다. 여기서 손대지 않는다
      editOpen: f.edit_open === true,
      editDays: f.edit_days == null ? null : Number(f.edit_days),
      editFrom: f.edit_from ?? null,

      students: students.map((r) => ({
        id: r.id, name: r.name, grade: r.grade == null ? null : Number(r.grade),
        mode: r.mode, canEdit: r.can_edit === true,
      })),

      stop: stop.map((r) => ({ level: r.level, weeks: Number(r.weeks) })),

      // ⚠️ 「지금 이대로 보내면 막히나」는 `lib/notify.js` 가 판정한다 —
      //    발송을 막는 규칙이 화면에 두 벌 생기면, 한쪽을 고치는 날 다른 쪽이 거짓말을 한다
      msg: msg.map((r) => ({
        id: r.id, kind: r.kind, title: r.title ?? "", body: r.body ?? "",
        updatedAt: r.updated_at ?? null,
        hole: findHole(r.title, r.body),
      })),

      // ⚠️ 「이 주기를 아는가」는 `lib/queue.js` 의 `cycleOf()` 가 판정한다.
      //    모르면 `null` 이고 — 그 규칙은 크론이 **한 번도 안 돈다.** 화면이 그걸 밝힌다
      rules: rules.map((r) => ({
        id: r.id, kind: r.kind, name: r.name, cron: r.cron ?? "",
        threshold: r.threshold == null ? "" : JSON.stringify(r.threshold),
        active: r.active === true,
        updatedAt: r.updated_at ?? null,
        cycle: cycleOf(r.cron),
      })),
    };
  });
}
