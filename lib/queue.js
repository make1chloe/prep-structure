/**
 * 자동화 뼈대 — 큐 · 되풀이 할일 · 「오늘 이거 이미 돌았나」
 *
 * 크론(Vercel Cron)이 붙는 자리다. 계획 1-1 (e) ①~⑪ 을 그대로 옮긴 것.
 * 표는 이미 파 두었다 — supabase/migrations/0012_notify.sql
 * (`v2.job_queue` · `v2.auto_rule` · `v2.auto_key` · `v2.day_ran`).
 *
 * ⚠️ 이 파일은 **DB 를 얕은 어댑터로 받는다** — `{ query(sql, params) }`.
 *    lib/notify.js 와 같은 계약이다. 검사가 가짜 DB 를 끼울 수 있어야 하기 때문이다.
 *    ⚠️ 확인 안 됨: `lib/db.js` 의 `serviceDb()` 는 supabase-js 라 **raw SQL 을 못 돌린다.**
 *    크론 라우트가 `pg` 로 붙든지 DB 함수를 하나 더 파야 한다 — 내 담당 밖이라 손 안 댔다.
 *
 * ⚠️ 접근 규칙: 0017_grants.sql 이 `authenticated` 에게서 job_queue · auto_key · day_ran 의
 *    insert/update 를 걷어갔다. **여기 함수들은 서비스 열쇠로만 돈다** — 화면에서 부르면 막힌다.
 *
 * ── 이 파일이 막는 사고 넷 ──────────────────────────────────
 *  ① 「보낸 때」 한 칸을 자물쇠로 쓰면 **재시도가 원리적으로 불가능**하다.
 *     → 상태 · 시도횟수 · 다음시도 · 잠금 · 마지막오류를 다 쓴다.
 *  ② 자동 생성 열쇠에 **기준 날짜**가 없으면 매주·매달·매년이 **한 번만** 생기고 만다.
 *     오류도 안 나고 화면이 비지도 않아 몇 주 뒤에나 안다.
 *  ⑨ 크론이 매일 훑는 것은 **새 셈을 만들지 않는다.** `lib/` 의 셈을 부르기만 한다.
 *  ⑩ 크론은 **「학원의 오늘」을 인자로 받는다.** 서버 시간으로 돌면 시간대가 크론에서만 깨진다.
 */

// ─────────────────────────────────────────────────────────────
// 0. 날짜 — 「학원의 오늘」은 글자 하나로만 다닌다
// ─────────────────────────────────────────────────────────────

/**
 * 「때」(instant) 는 시간대와 무관한 절댓값이라 Date 를 그냥 쓴다.
 * 「날」(date) 만 서울 기준이라 **`'YYYY-MM-DD'` 글자로만** 다닌다.
 * 이 둘을 안 가르면 밤 9시 이후 하루가 어긋난다 (계획 0단계 2번).
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 서울 기준 오늘. DB 의 `v2.today()` 와 같은 답을 낸다 */
export function seoulToday(at = new Date()) {
  // en-CA 는 'YYYY-MM-DD' 로 준다. 숫자(+9)를 손으로 더하지 않는다 — 그게 시간대 버그의 씨앗이다
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(at);
}

/**
 * ⚠️ ⑩ 「학원의 오늘」이 없거나 Date 객체면 **그 자리에서 던진다.**
 *    안 던지면 크론이 서버 시간(UTC)으로 돌고, 밤 9시 이후에 만든 할일이
 *    **어제 날짜로 서서** 이미 지난 마감이 된다. 오류가 안 나서 아무도 모른다.
 */
export function assertToday(today, who = "이 함수") {
  if (today instanceof Date)
    throw new Error(`⚠️ ${who} 는 Date 를 안 받는다 — 「학원의 오늘」을 'YYYY-MM-DD' 로 넘겨라 (seoulToday())`);
  if (typeof today !== "string" || !DAY.test(today))
    throw new Error(`⚠️ ${who} 에 「학원의 오늘」이 없다 — seoulToday() 를 넘겨라 (받은 것: ${JSON.stringify(today)})`);
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d)
    throw new Error(`⚠️ 없는 날이다: ${today}`);
  return today;
}

const p2 = (n) => String(n).padStart(2, "0");
/** 'YYYY-MM-DD' → UTC 밀리초. **UTC 로만 셈해서** 서머타임·시간대가 못 끼어든다 */
const ms = (day) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const day = (t) => { const x = new Date(t); return `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}`; };
const D1 = 86400000;

/** 날 더하기 (음수 가능) */
export function addDays(d, n) { assertToday(d, "addDays"); return day(ms(d) + n * D1); }

/** 두 날 사이 (앞·뒤 포함) */
export function daysBetween(from, to) {
  assertToday(from, "daysBetween"); assertToday(to, "daysBetween");
  const out = [];
  for (let t = ms(from); t <= ms(to); t += D1) out.push(day(t));
  return out;
}

// ─────────────────────────────────────────────────────────────
// 1. 큐 — 상태 · 재시도 · 잠금  (계획 (e) ①)
// ─────────────────────────────────────────────────────────────

/** v2.job_queue 의 check 제약이 허용하는 넷. 다른 글자를 쓰면 DB 가 거절한다 */
export const QUEUE_STATES = ["wait", "taking", "done", "fail"];

/**
 * ⚠️ 아래 셋은 **계획서에 없는 숫자다 — 내가 고른 기본값이다.**
 *    원장님이 바꾸실 값이면 `v2.auto_rule.threshold` 로 빼야 한다 (계획 (e) ⑤).
 */
export const MAX_TRIES = 5;                       // 이만큼 실패하면 'fail' 로 굳는다
export const BACKOFF_MIN = [1, 5, 15, 60, 180];   // 몇 분 뒤에 다시 집을까
export const LOCK_STALE_MIN = 10;                 // ⚠️ 크론 주기보다 길어야 한다. 짧으면 도는 일을 두 번 집는다

/** 몇 번째 실패인지로 다음 시도 시각을 정한다 */
export function backoffAt(tries, now = new Date(), mins = BACKOFF_MIN) {
  const i = Math.min(Math.max(tries, 1), mins.length) - 1;
  return new Date(now.getTime() + mins[i] * 60000);
}

/**
 * **다시 할까, 굳힐까** — 이 판단은 SQL 안이 아니라 여기 산다.
 *
 * ⚠️ SQL 의 `case when` 안에 넣으면 **검사가 못 본다.** 가짜 DB 는 자기가 흉내낸 규칙을
 *    돌릴 뿐이라, SQL 쪽 판단을 몰래 뒤집어도 검사가 통과해 버린다.
 *    (레포 대원칙: 판단은 전부 `lib/` 에 산다. 화면도 SQL 도 받아서 쓰기만 한다.)
 */
export function stateAfterFail(tries, max = MAX_TRIES) {
  return tries >= max ? "fail" : "wait";
}

/**
 * 큐에 넣는다.
 * @param at  Date — 예약 발송이면 그 시각. 없으면 지금
 *
 * ⚠️ 큐 자체에는 중복 방지가 없다. 같은 일을 두 번 안 넣으려면 `pushOnce()` 를 써라
 *    (자동 생성 열쇠로 먼저 도장을 찍고 넣는다).
 */
export async function push(db, kind, payload = null, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const { rows } = await db.query(
    `insert into v2.job_queue(kind, payload, next_at) values ($1,$2,$3)
     returning id, kind, state, next_at`,
    [kind, payload === null ? null : JSON.stringify(payload), at.toISOString()]);
  return rows[0];
}

/**
 * 집는다 — `wait` 이고 `next_at` 이 지난 것만.
 *
 * ⚠️ `for update skip locked` — 크론이 겹쳐 돌아도 **같은 일을 두 번 안 집는다.**
 *    이게 없으면 두 프로세스가 같은 줄을 집어 문자가 두 통 나간다.
 * ⚠️ **시도 횟수는 집을 때 올린다** (끝날 때가 아니라).
 *    프로세스가 통째로 죽는 일이면 끝나는 자리에 영영 못 닿는데,
 *    끝날 때 올리면 `revive()` 가 그 일을 **영원히 되살린다.**
 */
export async function take(db, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const limit = opts.limit ?? 20;
  const kinds = opts.kinds && opts.kinds.length ? opts.kinds : null;
  const { rows } = await db.query(
    `update v2.job_queue q set state='taking', locked_at=$1, tries=tries+1
      where q.id in (
        select id from v2.job_queue
         where state='wait' and next_at <= $1 and ($3::text[] is null or kind = any($3))
         order by next_at, id limit $2 for update skip locked)
      returning q.id, q.kind, q.payload, q.tries`,
    [now.toISOString(), limit, kinds]);
  return rows;
}

/** 됐다. ⚠️ 대전제 6 — **지우지 않는다.** 자취로 남겨야 「왜 두 번 갔나」에 답할 수 있다 */
export async function done(db, id) {
  const { rows } = await db.query(
    `update v2.job_queue set state='done', locked_at=null where id=$1 returning id, state`, [id]);
  return rows[0] ?? null;
}

/**
 * 실패했다 — **재시도냐 굳히기냐를 여기서 가른다.**
 *
 * ⚠️ 이것이 계획 (e) ① 이 짚은 사고 자리다. 「보낸 때」 한 칸만 두면
 *    실패해도 도장을 찍어야 무한 반복이 안 나는데, 도장을 찍으면 **다시 못 보낸다.**
 *    상태를 따로 두면 실패한 것이 `wait` 으로 돌아와 **다시 집힌다.**
 *
 * @param job  { id, tries } — `take()` 가 준 그 줄
 */
export async function failed(db, job, err, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const tries = job.tries ?? 1;
  const state = stateAfterFail(tries, opts.maxTries ?? MAX_TRIES);   // ← 판단은 JS 에서
  const at = backoffAt(tries, now, opts.backoff ?? BACKOFF_MIN);
  const why = String(err?.message ?? err ?? "").slice(0, 500);
  const { rows } = await db.query(
    `update v2.job_queue set state = $2, next_at = $3, locked_at = null, last_error = $4
      where id = $1 returning id, state, tries, next_at`,
    [job.id, state, at.toISOString(), why]);
  return rows[0] ?? null;
}

/**
 * 잠긴 채 죽은 일을 되살린다.
 *
 * ⚠️ 없으면 배포·타임아웃·OOM 으로 죽은 일이 `taking` 인 채 **영원히 안 집힌다.**
 *    오류도 안 나고 큐 화면에는 줄이 있어서, 문자가 안 갔다는 것을 학부모가 먼저 안다.
 * ⚠️ 시도 횟수가 이미 다 찼으면 되살리지 않고 `fail` 로 굳힌다 —
 *    안 그러면 **프로세스를 죽이는 일이 영원히 되살아나** 크론이 그것만 붙잡는다.
 */
export async function revive(db, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const stale = new Date(now.getTime() - (opts.staleMin ?? LOCK_STALE_MIN) * 60000);
  const max = opts.maxTries ?? MAX_TRIES;

  // ① 잠긴 채 오래된 것을 읽고 ② JS 가 가르고 ③ 두 벌로 갈아 끼운다.
  // ⚠️ 판단을 SQL 의 case 로 넣지 않는 이유는 stateAfterFail() 주석에 있다.
  const { rows } = await db.query(
    `select id, kind, tries from v2.job_queue
      where state = 'taking' and locked_at is not null and locked_at < $1
      order by id`, [stale.toISOString()]);
  if (!rows.length) return [];

  const out = rows.map((r) => ({ ...r, state: stateAfterFail(r.tries, max) }));
  const back = out.filter((r) => r.state === "wait").map((r) => r.id);
  const dead = out.filter((r) => r.state === "fail").map((r) => r.id);
  const WHY = "잠긴 채 멈췄다 — 되살렸다";

  // ⚠️ `and state = 'taking'` 을 빼지 마라 — 그 사이 다른 크론이 손을 댔으면 덮어쓴다
  if (back.length) await db.query(
    `update v2.job_queue set state = 'wait', next_at = $2, locked_at = null,
            last_error = coalesce(last_error, $3)
      where id = any($1) and state = 'taking'`, [back, now.toISOString(), WHY]);
  if (dead.length) await db.query(
    `update v2.job_queue set state = 'fail', locked_at = null,
            last_error = coalesce(last_error, $2)
      where id = any($1) and state = 'taking'`, [dead, WHY]);
  return out;
}

/**
 * 상태별 셈.
 * ⚠️ 원칙 5 — **세어 나오는 값은 저장하지 않는다.** 여기서 세어 돌려줄 뿐,
 *    「밀린 건수」 같은 칸을 만들지 않는다.
 */
export async function stats(db) {
  const { rows } = await db.query(
    `select state, count(*)::int n from v2.job_queue group by state`);
  const out = { wait: 0, taking: 0, done: 0, fail: 0 };
  for (const r of rows) out[r.state] = Number(r.n);
  return out;
}

// ─────────────────────────────────────────────────────────────
// 2. 자동 생성 열쇠 — 칸으로 쪼갠다  (계획 (e) ②)
// ─────────────────────────────────────────────────────────────

const LABEL = { ruleId: "규칙", studentId: "학생", bookId: "교재", unitId: "단원",
                round: "회독", nth: "몇 번째", baseDate: "기준 날짜" };

/**
 * **계기마다 어느 칸을 채우는지** — 계획서의 표를 그대로 옮긴 것이다.
 *
 * | 계기 | 채우는 칸 |
 * |---|---|
 * | 매주 · 매달 · 매년 | 규칙 + 기준 날짜 |
 * | 신규 학생 | 규칙 + 학생 — **기준 날짜는 비운다** |
 * | 교재 끝나감 | 규칙 + 학생 + 교재 + 회독 |
 * | 재시험 | 규칙 + 학생 + 단원 + 몇 번째 |
 *
 * ⚠️ **기준 날짜는 할일 마감일과 별개다.** 한 번 찍으면 안 고친다.
 *    마감일을 열쇠로 삼으면 원장님이 미뤄 놓는 순간 원래 날짜가 비고
 *    크론이 **그 날짜 것을 새로 만든다** — 미룰 때마다 할일이 하나씩 는다.
 *
 * ⚠️ 확인 안 됨: **시험 루틴(㉛·㉟)** 은 이 표에 없다. 시험 하나에 딸린 줄은
 *    「규칙 + 시험」이어야 할 것 같은데 `auto_key` 에 시험 칸이 없다.
 *    지어내지 않았다 — 보고의 needsDb 에 SQL 로 적어 두었다.
 */
export const TRIGGERS = {
  weekly:  { label: "매주",   cycle: "weekly",  fill: ["ruleId", "baseDate"],
             why: "없으면 첫 주 한 번만 생기고 그 뒤로 영영 안 생긴다" },
  monthly: { label: "매달",   cycle: "monthly", fill: ["ruleId", "baseDate"],
             why: "없으면 첫 달 한 번만 생기고 그 뒤로 영영 안 생긴다" },
  yearly:  { label: "매년",   cycle: "yearly",  fill: ["ruleId", "baseDate"],
             why: "없으면 첫 해 한 번만 생기고 그 뒤로 영영 안 생긴다" },
  daily:   { label: "매일",   cycle: "daily",   fill: ["ruleId", "baseDate"],
             why: "없으면 첫날 한 번만 생기고 그 뒤로 영영 안 생긴다" },
  new_student: { label: "신규 학생", cycle: null, fill: ["ruleId", "studentId"],
             why: "학생이 없으면 누구 것인지 모른다",
             blankWhy: { baseDate: "채우면 **날마다 새로 생겨** 「평생 한 번」이 깨진다" } },
  book_end:{ label: "교재 끝나감", cycle: null, fill: ["ruleId", "studentId", "bookId", "round"],
             why: "회독까지 있어야 2회독에 다시 뜬다",
             blankWhy: { baseDate: "채우면 교재가 끝나갈 때마다 날마다 새로 생긴다" } },
  retest:  { label: "재시험", cycle: null, fill: ["ruleId", "studentId", "unitId", "nth"],
             why: "몇 번째 재시험인지가 없으면 두 번째 재시험이 안 생긴다",
             blankWhy: { baseDate: "채우면 재시험 카드가 날마다 하나씩 는다" } },
};

/** 빈 열쇠 — 일곱 칸 전부 (DB 의 unique nulls not distinct 와 같은 모양) */
const EMPTY = { ruleId: null, studentId: null, bookId: null, unitId: null,
                round: null, nth: null, baseDate: null };

/**
 * 계기에 맞는 열쇠를 조립한다. **모자라도 던지고, 남아도 던진다.**
 *
 * ⚠️ 남는 것도 막는 이유: 신규 학생 열쇠에 기준 날짜를 채우면 유니크가 날마다 달라져
 *    **「평생 한 번」이 조용히 깨진다.** 오류가 안 나서 며칠 뒤 카드가 30장 쌓여야 안다.
 */
export function keyFor(trigger, f = {}) {
  const spec = TRIGGERS[trigger];
  if (!spec) throw new Error(`⚠️ 모르는 계기: ${trigger} — 아는 것: ${Object.keys(TRIGGERS).join(" · ")}`);
  const key = { ...EMPTY };
  const has = (v) => v !== undefined && v !== null && v !== "";
  for (const k of spec.fill) {
    if (!has(f[k]))
      throw new Error(`⚠️ 「${spec.label}」 열쇠에 ${LABEL[k]} 가 비었다 — ${spec.why}`);
    key[k] = f[k];
  }
  for (const k of Object.keys(EMPTY)) {
    if (spec.fill.includes(k)) continue;
    if (has(f[k]))
      throw new Error(`⚠️ 「${spec.label}」 열쇠에 ${LABEL[k]} 를 채우면 안 된다 — ` +
        (spec.blankWhy?.[k] ?? "열쇠 칸이 늘면 「한 번만」이 깨진다"));
  }
  if (key.baseDate) assertToday(key.baseDate, `「${spec.label}」의 기준 날짜`);
  return key;
}

/** 열쇠 → DB 파라미터 (칸 순서는 0012_notify.sql 의 유니크 순서 그대로) */
export function keyRow(key) {
  return [key.ruleId, key.studentId ?? null, key.bookId ?? null, key.unitId ?? null,
          key.round ?? null, key.nth ?? null, key.baseDate ?? null];
}

/**
 * 도장을 찍는다. **처음이면 `true`, 이미 있으면 `false`.**
 *
 * ⚠️ 유니크가 `nulls not distinct` 라서 빈 칸이 섞여도 걸린다.
 *    보통 UNIQUE 는 NULL 을 서로 다른 값으로 봐서 `on conflict` 가 **한 번도 안 걸리고**
 *    돌 때마다 줄이 새로 생긴다. 0012 가 이미 그렇게 잡아 두었다.
 */
export async function claimKey(db, key) {
  const { rows } = await db.query(
    `insert into v2.auto_key(rule_id, student_id, book_id, unit_id, round, nth, base_date)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning made_at`,
    keyRow(key));
  return rows.length === 1;
}

/** 계기 이름으로 바로 — `keyFor` + `claimKey` */
export async function claimOnce(db, trigger, fields) {
  return claimKey(db, keyFor(trigger, fields));
}

/**
 * 「한 번만 큐에 넣는다」 — 열쇠로 먼저 도장을 찍고 넣는다.
 * 큐에 유니크가 없으므로 **두 번 안 넣는 유일한 길**이다.
 */
export async function pushOnce(db, trigger, fields, kind, payload = null, opts = {}) {
  if (!(await claimOnce(db, trigger, fields))) return null;
  return push(db, kind, payload, opts);
}

/** 되풀이 규칙 — 켜져 있는 것만 */
export async function autoRules(db, kind = null) {
  const { rows } = await db.query(
    `select id, kind, name, cron, threshold, active from v2.auto_rule
      where active and ($1::text is null or kind = $1) order by name`, [kind]);
  return rows;
}

// ─────────────────────────────────────────────────────────────
// 3. 되풀이 — 기준 날짜를 주기의 첫날로 잡는다
// ─────────────────────────────────────────────────────────────

/**
 * `auto_rule.cron` 이 어느 주기인지.
 *
 * ⚠️ **모르는 글자는 짐작하지 않고 `null` 을 돌려준다.** 짐작해서 주기를 잘못 잡으면
 *    ② 사고가 그대로 난다 — 오류 없이 할일이 안 서고 몇 주 뒤에나 안다.
 *    다섯 칸짜리 진짜 cron 은 **아직 안 받는다** (계획서에 형식이 없다 — 지어내지 않았다).
 */
export function cycleOf(cron) {
  const s = String(cron ?? "").trim().toLowerCase().replace(/^@/, "");
  const map = { daily: "daily", 매일: "daily", weekly: "weekly", 매주: "weekly",
                monthly: "monthly", 매달: "monthly", 매월: "monthly",
                yearly: "yearly", annually: "yearly", 매년: "yearly" };
  return map[s] ?? null;
}

/**
 * 그 날이 속한 주기의 **첫날** = 기준 날짜.
 * 하루에 크론이 몇 번 돌든 같은 답이 나오므로 도장이 한 번만 찍힌다.
 * 주는 **월요일 시작**이다 (ISO).
 */
export function baseDateOf(cycle, on) {
  assertToday(on, "baseDateOf");
  if (cycle === "daily") return on;
  if (cycle === "weekly") {
    const back = (new Date(ms(on)).getUTCDay() + 6) % 7;   // 0=일 → 월요일까지 되돌린다
    return day(ms(on) - back * D1);
  }
  if (cycle === "monthly") return on.slice(0, 8) + "01";
  if (cycle === "yearly") return on.slice(0, 4) + "-01-01";
  throw new Error(`⚠️ 모르는 주기: ${cycle}`);
}

/**
 * 되풀이 할일을 세운다 — **밀린 것까지 따라잡는다.**
 *
 * @param today  '학원의 오늘' (필수)
 * @param since  여기부터 훑는다. 없으면 오늘 하루만 (크론이 며칠 멈췄으면 넣어라)
 * @param rules  없으면 v2.auto_rule 에서 켜진 것을 읽는다
 * @param make   async ({ rule, baseDate, cycle, today }) => void — **실제로 줄을 만드는 것은 부르는 쪽**
 *
 * ⚠️ 여기서 `make` 에 넘기는 `baseDate` 는 **열쇠**다. 할일의 마감일이 아니다.
 *    마감일은 `make` 안에서 따로 정하고, 나중에 원장님이 미루셔도 열쇠는 안 건드린다.
 */
export async function planRecurring(db, opts = {}) {
  const today = assertToday(opts.today, "planRecurring");
  const since = opts.since ? assertToday(opts.since, "planRecurring(since)") : today;
  const rules = opts.rules ?? await autoRules(db);
  const days = daysBetween(since, today);
  const made = [], skipped = [];
  let already = 0;

  for (const rule of rules) {
    if (rule.active === false) { skipped.push({ rule, why: "꺼져 있다" }); continue; }
    const cycle = cycleOf(rule.cron);
    if (!cycle) {
      // ⚠️ 짐작하지 않는다. 건너뛴 것을 돌려주니 화면이 「이 규칙은 안 돈다」를 보여줄 수 있다
      skipped.push({ rule, why: `주기를 모른다: ${JSON.stringify(rule.cron)}` });
      continue;
    }
    const seen = new Set();
    for (const d of days) {
      const baseDate = baseDateOf(cycle, d);
      if (seen.has(baseDate)) continue;         // 같은 주에 이레가 들어와도 도장은 한 번
      seen.add(baseDate);
      const key = keyFor(cycle, { ruleId: rule.id, baseDate });
      if (!(await claimKey(db, key))) { already++; continue; }
      if (opts.make) await opts.make({ rule, baseDate, cycle, today });
      made.push({ ruleId: rule.id, name: rule.name, baseDate, cycle });
    }
  }
  return { made, skipped, already };
}

// ─────────────────────────────────────────────────────────────
// 4. 「오늘 이거 이미 돌았나」  (계획 (e) ⑥ · ⑨ · ⑩)
// ─────────────────────────────────────────────────────────────

/**
 * ⚠️ `day_ran` 과 `auto_key` 는 **둘 다 「이미 했나」지만 축이 다르다** (원칙 1 위반이 아니다).
 *    day_ran  = 갈래 × 날   — 「오늘 이 훑기가 돌았나」
 *    auto_key = 규칙 × 열쇠 — 「이 규칙이 이 대상에 대해 만들었나」
 *    하나로 합치면 규칙별로 다시 만들라는 물음에 답을 못 한다.
 */
export async function ranToday(db, kind, today) {
  assertToday(today, "ranToday");
  const { rows } = await db.query(
    `select 1 from v2.day_ran where kind=$1 and ran_on=$2`, [kind, today]);
  return rows.length > 0;
}

/** 도장을 찍는다. **처음이면 `true`** — 이게 크론 두 개가 겹쳐도 한 번만 돌게 하는 자물쇠다 */
export async function markRan(db, kind, today) {
  assertToday(today, "markRan");
  const { rows } = await db.query(
    `insert into v2.day_ran(kind, ran_on) values ($1,$2) on conflict do nothing returning kind`,
    [kind, today]);
  return rows.length === 1;
}

/**
 * 하루 한 번만 돈다.
 *
 * ⚠️ **도장을 먼저 찍고 일을 한다.** 크론이 겹쳐 돌아도 한쪽만 들어간다.
 * ⚠️ 일이 실패해도 **도장을 안 지운다** (대전제 6 — 지우지 않는다).
 *    대신 **큐에 재시도를 넣는다** — 큐가 상태·시도횟수·backoff 를 이미 들고 있으니
 *    「도장을 지웠다 다시 찍는」 위험한 길을 안 만들어도 된다.
 *    ⚠️ 재시도 일감의 갈래는 같은 `kind` 다 — **크론이 그 갈래를 처리할 줄 알아야 한다.**
 *       모르면 큐에 쌓이기만 하고 아무도 안 집는다.
 */
export async function runOnce(db, kind, today, fn, opts = {}) {
  assertToday(today, "runOnce");
  if (!(await markRan(db, kind, today)))
    return { ran: false, why: "오늘 이미 돌았다", kind, on: today };
  try {
    const result = await fn(today);
    return { ran: true, ok: true, result, kind, on: today };
  } catch (e) {
    const job = opts.retry === false ? null
      : await push(db, kind, { ran_on: today, why: "하루 훑기 실패 — 다시" },
                   { at: backoffAt(1, opts.now instanceof Date ? opts.now : new Date()) });
    return { ran: true, ok: false, error: String(e?.message ?? e), retryJobId: job?.id ?? null,
             kind, on: today };
  }
}

/**
 * **쓰기를 막는 껍데기.** 어떤 표에 쓰려 했는지까지 말해 준다.
 *
 * ⚠️ 글자로 훑는 얕은 방패다 — 함수 안에 숨은 쓰기(`select v2.무엇()`)는 못 잡는다.
 *    그래도 「크론이 셈을 한 벌 더 만든다」는 실수는 **첫 줄에서 터진다.**
 */
export function guardDb(db, allow = []) {
  const ok = new Set(allow.map((t) => t.toLowerCase().replace(/^v2\./, "")));
  return {
    async query(sql, params) {
      const s = String(sql)
        .replace(/--[^\n]*/g, " ")
        .replace(/'[^']*'/g, "''")
        .replace(/\bfor\s+update\b/gi, " ")
        .replace(/\bdo\s+update\b/gi, " ");
      const re = /\b(?:insert\s+into|update|delete\s+from|create|alter|drop|truncate)\s+(?:table\s+|only\s+)?([a-z0-9_."]*)/gi;
      let m;
      while ((m = re.exec(s))) {
        const t = (m[1] || "").toLowerCase().replace(/"/g, "").replace(/^v2\./, "");
        if (!t || !ok.has(t))
          throw new Error(`⚠️ 셈은 DB 에 쓰지 않는다 (계획 (e) ⑨ · 원칙 4·5). ` +
            `v2.${t || "?"} 에 쓰려 했다 — ` + (ok.size ? `허용: ${[...ok].join(" · ")}` : "여기선 아무 데도 못 쓴다"));
      }
      return db.query(sql, params);
    },
  };
}

/**
 * 하루 한 번 훑기.
 *
 * ⚠️ **크론은 새 셈을 만들지 않는다** (계획 (e) ⑨). 「보강 잡을 것 · 안 보낸 판 ·
 *    교재 끝나감 · 미납」은 전부 세어 나오는 값이다. SQL 로 같은 셈을 한 벌 더 만들면
 *    원칙 4 위반이고, 두 벌이 어긋나는 날 어느 쪽이 맞는지 아무도 모른다.
 *    → 여기서는 `lib/` 의 셈을 **부르기만** 하고, DB 에는 `day_ran` 만 남긴다.
 *    셈에 넘기는 DB 는 **쓰기가 막힌 껍데기**라, 셈이 쓰려 들면 그 자리에서 터진다.
 *
 * @param today   '학원의 오늘' (필수 — ⑩)
 * @param checks  [{ kind, count(today, readOnlyDb) }] — `lib/` 의 셈을 부르는 얇은 껍데기
 * @param on      async (kind, result, db) => void — 알림 만들기 등. **여기는 안 막는다**
 *                (lib/notify.js 가 notify_log 에 자취를 남겨야 하기 때문)
 */
export async function sweep(db, opts = {}) {
  const today = assertToday(opts.today, "sweep");
  const readOnly = guardDb(db, []);            // 셈은 한 글자도 못 쓴다
  const out = [];
  for (const c of opts.checks ?? []) {
    const r = await runOnce(db, c.kind, today, async () => {
      const n = await c.count(today, readOnly);
      if (opts.on) await opts.on(c.kind, n, db);
      return n;
    }, opts);
    out.push(r);
  }
  return out;
}
