/**
 * 등원 찍기 — **아이가 제 손으로 찍는다.**
 *
 * 원장님 2026-09-02: 「아이가 화면에서 본인 출결을 찍게 하는 게 필요해. 등원하면 로그인해서
 * 어플에서 출결 찍어야 해. **학원 아이피로 접속해야 하는 조건**이 있고.」
 * 그리고 「**그냥 지각을 찍은 시간을 등원으로 기록하면 되는 거 아니야?**」
 *
 * ⚠️⚠️ **이 파일의 핵심 — 「몇 분 늦었다」를 고르는 자리가 없어진다.**
 *   아이가 찍은 **그 시각**이 곧 도착 시각이다. 원장님이 분수를 고를 일이 없다(대전제 3).
 *   → 지각인지, 몇 분인지는 **반 시각과 찍은 시각을 견주어 센다**(원칙 5). **저장하지 않는다.**
 *   → 저장하는 것은 `v2.arrival.at` **하나뿐**이고, 나머지는 언제든 다시 세어 나온다.
 *   그래서 `attendanceWrite` 에는 **「얼마나」를 안 넘긴다** — 넘기면 그 자리에서 거절한다
 *   (원장님 2026-09-02. 담을 칸이 없는데 받으면 물어보고 값은 사라지는 꼴이 된다).
 *   담을 칸이 없어도 도착 시각이 남아 있어 몇 분 늦었는지는 영영 다시 셀 수 있다.
 *
 * ⚠️ **아이가 고르는 것은 없다.** 아이는 「찍었다」만 누른다.
 *   출결 갈래(present/late)는 **앱이 센다.** 아이가 present 를 고를 자리를 두지 않는다.
 *
 * ⚠️ **판은 여기서 안 만든다.** `v2.day_sheet` 에 한 글자도 안 쓴다 —
 *   `lib/attend.js` 의 `attendanceWrite({ via:"arrival" })` 를 부른다.
 *   「쓰는 길 전부가 한 벌을 부른다」가 그 규칙이다 (계획 1단계 조심할 자리 ①).
 *
 * ⚠️ 시간대는 **Asia/Seoul 하나**다. `new Date()` 로 서버 시간을 쓰지 않는다 —
 *   오늘 날짜는 `v2.today()`, 찍은 시각은 `at at time zone 'Asia/Seoul'` 로 DB 가 답한다.
 *
 * DB 는 `{ query(sql, params) -> { rows } }` 를 받는 얕은 어댑터다. 여기서 직접 붙지 않는다.
 *
 * ── 세 걸음이 무엇인가 (지어낸 것이 아니다 — 옛 앱에서 그대로 읽었다)
 *   `public.arrival_checks` 의 칸(phone_at · attend_at · homework_at)과
 *   옛 마이그레이션 `0039_arrival_attend.sql` 의 주석 「순서: ① 핸드폰 제출 ② 출석 체크 ③ 숙제 제출」.
 *   `leave_at`(하원)은 **네 번째 칸**이었으나 `v2.arrival` 은 「세 걸음」이라 여기 없다
 *   (하원을 v2 어디에 적을지는 ⚠️ 확인 안 됨 — 보고 unknowns 에 적었다).
 */
import { attendanceWrite, todayOf } from "./attend.js";
import { countDates, ymd } from "./session.js";

/**
 * 등원 세 걸음. **차례가 있다** — 화면은 한 번에 하나씩만 연다
 * (옛 0039 주석: 「셋을 한 번에 늘어놓으면 습관적으로 세 번 연달아 눌러버린다」).
 * ⚠️ 걸음을 더하거나 빼려면 `v2.arrival.step` 의 뜻이 바뀌는 것이라 **마이그레이션이 먼저다.**
 */
export const STEPS = Object.freeze([
  Object.freeze({ step: 1, key: "phone", label: "핸드폰 냈어요" }),
  Object.freeze({ step: 2, key: "attend", label: "출석 체크했어요" }),
  Object.freeze({ step: 3, key: "homework", label: "숙제 냈어요" }),
]);

/**
 * **도착 시각은 그날 가장 먼저 찍은 걸음의 시각이다.**
 *
 * 옛 앱은 ①·②(폰·출석) 둘만 등원으로 쳤다(2026-08-23 원장님 —
 * 「학생이 핸드폰 냈어요 누르면 바로 출석 처리하게 해줘」). 셋 다로 넓힌 까닭은
 * **어느 걸음이든 누른 순간 아이가 학원에 있기 때문**이고, 화면이 차례대로 하나씩 열므로
 * 첫 걸음은 사실상 ①이다. 규칙이 하나면 예외를 셀 자리가 없다.
 */
export const ARRIVED_BY_FIRST_STEP = true;

/** 한 걸음을 나타내는 말이 여럿이면 여기서 하나로 — `1` · `"1"` · `"phone"` */
export function stepOf(v) {
  const s = STEPS.find((x) => x.step === Number(v) || x.key === String(v ?? "").trim());
  if (!s) {
    throw new Error(
      `모르는 걸음: ${JSON.stringify(v)} — 등원은 세 걸음뿐이다 (` +
        STEPS.map((x) => `${x.step}=${x.key}`).join(" · ") + ")");
  }
  return s;
}

// ── SQL ─────────────────────────────────────────────────────────────────────
// 앞머리 주석(/* arrival:… */)은 **가짜 DB 와 SQL 검사가 붙잡는 손잡이**다. 지우지 마라.
// ⚠️ SQL 안에 `${…}` 를 끼우지 마라. 끼우면 이 글자를 그대로 DB 에 물어볼 수가 없어
//    「칸 이름이 진짜 있나」를 기계로 못 본다. 값은 전부 $1·$2 로 넘긴다.

/**
 * 한 걸음을 찍는다.
 * ⚠️ `on conflict … do nothing` — **같은 걸음을 두 번 찍어도 한 줄**이고
 *    **먼저 찍은 시각을 지킨다.** 덮어쓰면 도착 시각이 뒤로 밀려 지각 분이 조용히 달라진다.
 *    (열쇠는 이미 DB 에 있다 — `arrival_student_id_date_step_key`, 실측 2026-09-02)
 */
const SQL_MARK = `/* arrival:mark */
insert into v2.arrival (student_id, date, step, ip)
values ($1, coalesce($2::date, v2.today()), $3::smallint, $4::inet)
on conflict (student_id, date, step) do nothing
returning id, date::text as date, step,
          to_char(at at time zone 'Asia/Seoul', 'HH24:MI') as hm`;

/** 그날 찍힌 걸음들. ⚠️ 시각은 **서울**로 바꿔서 준다 — 화면이 다시 셈하지 않게 */
// ⚠️ `ip::text` 를 쓰지 마라 — 이 Postgres 는 `203.0.113.7/32` 로 준다(실측 2026-09-02).
//    그 글자를 등록 목록과 견주면 **한 번도 안 맞는다.** `host()` 가 맨 주소만 준다.
const SQL_DAY = `/* arrival:day */
select step, host(ip) as ip,
       to_char(at at time zone 'Asia/Seoul', 'HH24:MI') as hm
  from v2.arrival
 where student_id = $1 and date = coalesce($2::date, v2.today())
 order by at, step`;

/**
 * 그 아이가 그날 속한 반과 그 반의 요일 이력.
 * ⚠️ 소속은 **`v2.student_classes()` 로만** 읽는다 (계획 1단계 조심할 자리 ③ · 자동 검사 ⑮).
 *    직접 `class_member` 를 읽으면 반을 옮긴 아이가 두 반에 걸쳐 선다.
 */
const SQL_SCHED = `/* arrival:sched */
select c.class_id, cl.kind, cl.nickname,
       s.from_date::text as from_date, s.to_date::text as to_date, s.weekdays,
       s.start_time::text as start_time, s.end_time::text as end_time
  from v2.student_classes($1, coalesce($2::date, v2.today())) c
  join v2.classes cl on cl.id = c.class_id
  join v2.class_schedule s on s.class_id = c.class_id
 order by c.class_id, s.from_date`;

/**
 * 그날 휴강인가.
 * ⚠️ **아이 눈에는 안 보인다** (실측 2026-09-02 — `v2.holiday` 의 규칙은 `staff_all` 뿐이라
 *    학생으로 갈아타면 0줄이다). 그래서 아이가 찍을 때는 휴강을 **못 본 채**로 센다.
 *    「0줄」과 「못 읽었다」를 여기서는 못 가른다 → 보고 needsDb 에 읽기 규칙을 적었다.
 */
const SQL_HOLIDAY = `/* arrival:holiday */
select date::text as date, class_id
  from v2.holiday
 where date = coalesce($2::date, v2.today())
   and (class_id is null
        or class_id in (select class_id from v2.student_classes($1, coalesce($2::date, v2.today()))))`;

/**
 * 학원 회선 설정 한 줄.
 * ⚠️ **아이는 이 표를 못 읽는다** (실측 — `v2.integration` 규칙은 `staff_all` 뿐이고,
 *    평문 열쇠(솔라피·나이스·앤트로픽·VAPID)가 들어 있어 **열어서도 안 된다**).
 *    → 부르는 쪽이 **접근 규칙을 걸기 전에** 이 한 줄만 읽어서 넘겨준다
 *      (`app/api/arrival/route.js` 의 `openGate()` — 그 문으로는 이것 말고 아무것도 안 읽는다).
 */
const SQL_NET = `/* arrival:net */
select config from v2.integration where id = 'arrival'`;

/** 지금 이 주소를 학원 주소로 등록한다 — **원장님만.** 손으로 IP 를 칠 일이 없다 */
const SQL_ALLOW = `/* arrival:allow */
insert into v2.integration (id, config)
values ('arrival', $1::jsonb)
on conflict (id) do update
   set config = coalesce(integration.config, '{}'::jsonb) || excluded.config,
       updated_at = now()
returning config`;

/** 나는 어느 아이인가 — **제 아이 하나뿐**이다 (`my_own_student`, 학부모의 아이는 안 든다) */
const SQL_ME = `/* arrival:me */
select s.id, s.name
  from v2.students s
 where s.id in (select v2.my_own_student())
 order by s.name`;

// ── ① IP 관문 — 순수 셈 ──────────────────────────────────────────────────────

/**
 * 요청이 어디서 왔나.
 *
 * ⚠️ **어느 것을 믿는가** — 프록시 뒤에서는 `x-forwarded-for` 가 여럿이다.
 *   1. `x-vercel-forwarded-for` — **Vercel 이 붙인다. 손님이 못 넣는다.** 있으면 이것을 믿는다.
 *   2. `x-forwarded-for` 의 **맨 앞** — 계획서 6단계 2번의 말 그대로 「맨 앞이 진짜 손님」이다.
 *      ⚠️ 뒤엣것은 손님이 지어낼 수 있으므로 **절대 뒤를 보지 않는다.**
 *   3. `x-real-ip` — 위 둘이 없을 때만.
 *
 * ⚠️ **앞에 프록시가 없으면(로컬 개발) 이 값은 손님이 지어낼 수 있다.**
 *    학원 관문을 로컬에서 시험할 때 통과했다고 배포에서도 통과하는 것이 아니다.
 */
export function pickIp(headers) {
  const get = (k) => (typeof headers?.get === "function" ? headers.get(k) : headers?.[k]) ?? "";
  const vercel = String(get("x-vercel-forwarded-for")).split(",")[0].trim();
  if (vercel) return vercel;
  const xff = String(get("x-forwarded-for")).split(",")[0].trim();
  if (xff) return xff;
  const real = String(get("x-real-ip")).trim();
  return real || null;
}

/** IPv4-매핑(::ffff:1.2.3.4)·대문자·공백·구역(%eth0)·괄호를 하나로 */
function normIp(v) {
  let s = String(v ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  s = s.split("%")[0];
  return s.replace(/^::ffff:/, "");
}

/**
 * IPv6 를 여덟 덩어리로 **펴서** 준다. 못 펴면 null.
 *
 * ⚠️ 옛 앱은 `split(":").slice(0,4)` 로 앞 네 덩어리를 잘랐다. 그런데 `2001:db8::1` 처럼
 *    줄여 쓴 주소는 split 이 `["2001","db8","","1"]` 을 주어 **앞 4덩어리가 통째로 엉뚱해진다.**
 *    같은 공유기인데도 안 맞거나, 다른 망인데 맞을 수 있다. 그래서 먼저 편다.
 */
export function expandIp6(v) {
  const s = normIp(v);
  if (!s.includes(":")) return null;
  const [head, tail = null, extra] = s.split("::");
  if (extra !== undefined) return null;                  // `::` 가 둘이면 주소가 아니다
  const L = head ? head.split(":") : [];
  const R = tail !== null && tail ? tail.split(":") : [];
  if (tail === null) {
    if (L.length !== 8) return null;
  } else if (L.length + R.length > 7) return null;
  const mid = tail === null ? [] : new Array(8 - L.length - R.length).fill("0");
  const all = [...L, ...mid, ...R];
  if (all.length !== 8) return null;
  const out = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(g.replace(/^0+(?=.)/, ""));
  }
  return out;
}

/**
 * 학원에서 온 요청인가 — **글자만 보는 순수 셈.**
 *
 * ⚠️⚠️ **확인 안 됨** — 계획서 6단계 2번이 그대로 미확인으로 남겨 둔 자리다:
 *    「학원 회선이 IPv6 면 **앞 4덩어리(/64) 비교가 실제 회선에 맞는지**」.
 *    옛 앱도 같은 규칙이었고, 옛 `public.academy_net` 은 **0줄**이라(실측 2026-09-02)
 *    이 규칙은 **한 번도 실제로 켜진 적이 없다.** 리허설에서 터야 한다.
 *    → 그래서 등록은 **원장님이 학원에서 한 번 눌러** 그 자리의 IP 를 담는 길로 둔다.
 */
export function sameNet(ip, allowed = []) {
  const a = normIp(ip);
  if (!a) return { ok: false, hit: null, why: "no-ip" };
  const a6 = expandIp6(a);
  for (const raw of allowed ?? []) {
    const b = normIp(raw);
    if (!b) continue;
    if (a === b) return { ok: true, hit: raw, why: "same" };
    const b6 = expandIp6(b);
    if (a6 && b6 && a6.slice(0, 4).join(":") === b6.slice(0, 4).join(":")) {
      return { ok: true, hit: raw, why: "v6-64" };
    }
  }
  return { ok: false, hit: null, why: "not-academy" };
}

/**
 * **관문 한 벌.** 아이가 지금 찍어도 되는가.
 *
 * ⚠️⚠️ **등록이 없으면 「그냥 통과」가 아니다.** 옛 앱은 비면 통과였고
 *    (`lib/clientIp.js`: 「등록이 없으면 안 막는다」), 옛 표는 **0줄**이었다 —
 *    즉 **학원 IP 조건은 이름만 있고 실제로는 없었다.** 그대로 옮기면 아이가
 *    집에서·오는 길에 등원을 찍고, 그 시각이 그대로 도착 시각이 된다. 조건이 뜻을 잃는다.
 *
 * ⚠️ 그렇다고 「없으니 아무도 못 찍음」으로 끝내면 전환 첫날 전원이 막힌다. 그래서 셋으로 나눈다:
 *    · 등록이 없다 → **아이는 못 찍는다.** 다만 답에 **지금 그 자리의 IP** 를 담아
 *      원장님이 학원에서 한 번 눌러 등록하면 그 순간 열린다(`allowThisIp`).
 *    · 등록이 있는데 안 맞는다 → 못 찍는다.
 *    · **원장님·강사는 관문을 안 지난다** — 아이가 못 찍은 날(폰 없음·와이파이 안 됨)에
 *      손으로 찍어 줄 길이 늘 열려 있어야 한다.
 *
 * @returns { ok, why, msg, seenIp, count, canRegister }
 */
export function netGate({ ip, net, isStaff = false }) {
  const seenIp = normIp(ip) || null;
  const list = Array.isArray(net?.ips) ? net.ips.filter(Boolean) : [];

  if (isStaff) {
    return { ok: true, why: "staff", seenIp, count: list.length, canRegister: true,
      msg: "원장·강사는 학원 회선 조건을 지나지 않습니다 — 손으로 찍어 주는 길입니다" };
  }
  if (!seenIp) {
    return { ok: false, why: "no-ip", seenIp: null, count: list.length, canRegister: false,
      msg: "접속 주소를 못 읽어 등원을 못 찍습니다. 선생님께 말해 주세요" };
  }
  if (list.length === 0) {
    return { ok: false, why: "net-not-set", seenIp, count: 0, canRegister: true,
      msg: "학원 주소가 아직 등록되지 않아 등원을 못 찍습니다 — 선생님이 학원에서 한 번 눌러 주시면 열립니다" };
  }
  const hit = sameNet(seenIp, list);
  if (!hit.ok) {
    return { ok: false, why: "not-academy", seenIp, count: list.length, canRegister: false,
      msg: "학원에 도착해서 학원 와이파이에 연결한 뒤 눌러 주세요" };
  }
  return { ok: true, why: hit.why, hit: hit.hit, seenIp, count: list.length, canRegister: false, msg: null };
}

// ── ② 지각인가 — **센다. 저장 안 한다** (원칙 5) ──────────────────────────────

/** 'HH:MM' · 'HH:MM:SS' → 분. 모양이 틀리면 던진다 — 0 으로 치면 안 늦은 아이가 지각이 된다 */
function hmOf(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (!/^\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) throw new Error(`시각은 'HH:MM' 글자여야 한다: ${JSON.stringify(v)}`);
  const [h, m] = s.split(":").map(Number);
  if (h > 23 || m > 59) throw new Error(`그런 시각은 없다: ${s}`);
  return h * 60 + m;
}

/**
 * 반 시각과 찍은 시각을 견주어 **센다.**
 *
 * ⚠️⚠️ **「몇 분 늦었나」의 한 벌이 여기다.** `lib/attend.js` 가 이 자리를 가리키고 있다
 *    (2026-09-02 — 거기 있던 것을 지우고 「그 셈은 lib/arrival.js 의 lateOf() 한 곳이다」로 바꿨다).
 *    다른 데서 다시 세지 마라. 유예 분을 한쪽만 고치는 날 화면과 리포트가 어긋난다(원칙 1).
 * ⚠️ 나온 값은 **아무 데도 저장하지 않는다**(원칙 5). 저장하는 것은 `v2.arrival.at` 하나뿐이고,
 *    그것만 있으면 몇 분 늦었는지는 언제든 다시 세어 나온다.
 *
 * @param startTime "HH:MM(:SS)" — 그날 그 반 수업 시작 시각. 모르면 null
 * @param atHm      "HH:MM" — 아이가 **처음** 찍은 시각 (서울)
 * @param graceMin  유예 분. ⚠️ **기본 0** — 원장님이 정하신 값이 아니라서 지어내지 않았다.
 *                  `v2.integration('arrival').config.graceMin` 으로 원장님이 고친다.
 * @returns { attend, minutes, sure, tooLate, why }
 *          `sure:false` 는 **「못 셌다」**는 뜻이다. 정시라고 우기지 않는다.
 */
export function lateOf({ startTime, atHm, graceMin = 0 }) {
  if (!/^\d{1,2}:\d{2}$/.test(String(atHm ?? ""))) {
    throw new Error(`찍은 시각이 'HH:MM' 이 아니다: ${JSON.stringify(atHm)}`);
  }
  const s = hmOf(startTime ?? null), a = hmOf(atHm);
  if (s === null) {
    // ⚠️ 못 셌다. **정시라고 우기지 않는다** — 판은 present 로 서되 「확인 안 됨」을 달고 간다
    return { attend: "present", minutes: null, sure: false, tooLate: false,
      why: "⚠️ 확인 안 됨 — 그 반 수업 시작 시각을 몰라 몇 분 늦었는지 못 셌다. 원장님이 손으로 고칠 수 있다" };
  }
  const g = Number.isFinite(Number(graceMin)) ? Math.max(0, Math.trunc(Number(graceMin))) : 0;
  const d = a - s;
  if (d <= g) {
    return { attend: "present", minutes: d > 0 ? d : 0, sure: true, tooLate: false,
      why: d > 0 ? `유예 ${g}분 안에 들어왔다 (${d}분)` : null };
  }
  // ⚠️ 열 시간 넘게 늦는 것은 지각이 아니라 결석이다.
  //    판을 안 세우고 원장님께 넘긴다 — 조용히 present 로 눕히지 않는다.
  if (d > 600) {
    return { attend: "late", minutes: d, sure: true, tooLate: true,
      why: `⚠️ ${d}분은 지각이 아니라 결석에 가깝다 — 원장님이 손으로 찍어야 한다` };
  }
  return { attend: "late", minutes: d, sure: true, tooLate: false, why: null };
}

// ── ③ DB 를 읽는 자리 ────────────────────────────────────────────────────────

/** 학원 회선 설정. ⚠️ **접근 규칙을 걸기 전에** 부른다 (위 SQL_NET 주석) */
export async function readNet(db) {
  const { rows } = await db.query(SQL_NET, []);
  const cfg = rows?.[0]?.config ?? null;
  const ips = Array.isArray(cfg?.ips) ? cfg.ips.map(String).filter(Boolean) : [];
  return {
    has: !!cfg,
    ips,
    graceMin: Number.isFinite(Number(cfg?.graceMin)) ? Number(cfg.graceMin) : 0,
    note: cfg?.note ?? null,
  };
}

/**
 * 지금 이 주소를 학원 주소로 등록한다 — **원장님만 누른다.**
 * ⚠️ 부르는 쪽이 원장·강사인지 먼저 본다. 여기서는 접근 규칙(`staff_all`)이 두 번째 자물쇠다.
 * ⚠️ **지우지 않는다**(대전제 6) — 목록에서 빼는 것은 `ips` 를 다시 적는 일이고,
 *    그것도 원장님 화면의 몫이다. 여기서는 **더하기만** 한다.
 */
export async function allowThisIp(db, { ip, note = null, graceMin = null } = {}) {
  const clean = normIp(ip);
  if (!clean) return { ok: false, why: "no-ip", msg: "지금 주소를 못 읽어 등록할 것이 없습니다" };
  const now = await readNet(db);
  if (now.ips.some((x) => normIp(x) === clean)) {
    return { ok: false, why: "already", ip: clean, ips: now.ips, msg: "이미 등록된 주소입니다" };
  }
  const cfg = { ips: [...now.ips, clean] };
  if (note != null) cfg.note = String(note).slice(0, 200);
  if (graceMin != null) cfg.graceMin = Math.max(0, Math.trunc(Number(graceMin) || 0));
  const { rows } = await db.query(SQL_ALLOW, [JSON.stringify(cfg)]);
  if (!rows?.length) {
    // ⚠️ 0줄이면 **성공이라 말하지 않는다** — 접근 규칙이 막은 것이다
    return { ok: false, why: "blocked", ip: clean,
      msg: "한 줄도 안 바뀌었습니다 — 접근 규칙이 막았습니다(원장·강사만 등록합니다)" };
  }
  const after = rows[0].config ?? {};
  return { ok: true, ip: clean, ips: Array.isArray(after.ips) ? after.ips : [], count: (after.ips ?? []).length };
}

/** 로그인한 사람이 **제 아이**인가 (학부모의 아이는 안 든다 — 학부모가 집에서 찍으면 안 된다) */
export async function whoAmI(db) {
  const { rows } = await db.query(SQL_ME, []);
  const list = (rows ?? []).map((r) => ({ studentId: r.id, name: r.name }));
  return { isStudent: list.length > 0, students: list, studentId: list[0]?.studentId ?? null };
}

/**
 * 그날 그 아이의 반과 수업 시작 시각.
 *
 * ⚠️ 요일 이력 셈은 **`lib/session.js` 의 `countDates()` 한 벌**을 그대로 부른다.
 *    여기서 다시 세면 회차 화면과 등원 화면이 **서로 다른 수업일**을 말하는 날이 온다(원칙 1).
 * ⚠️⚠️ **반이 둘이면 앱이 안 고른다** (원장님 2026-09-03 — 「학생에게 출결하면서
 *    **바로 연달아 고르게** 해」). 예전에는 **가장 이른 반**으로 짐작했는데,
 *    7시 특강만 오는 날에도 5시 정규에 찍혀 **특강 회차가 안 차고 보강이 잘못 떴다.**
 *    → `pick` 은 **반이 하나일 때만** 준다. 둘 이상이면 `pick: null` 이고 `all` 을 그대로 준다 —
 *      화면이 아이에게 묻고, 아이가 고른 것을 `markArrival(classId)` 로 넘긴다.
 *    반이 하나뿐인 날은 **안 묻는다**(대전제-3 — 누를 것을 늘리지 않는다).
 * ⚠️ 반이 없으면 `classId: null` 이다. **null 을 빼먹지 않는다** — `attendanceWrite` 가 거절한다.
 */
export async function classOfDay(db, { studentId, date = null }) {
  if (!studentId) throw new Error("학생이 없다");
  // ⚠️ **한 줄씩 차례로 묻는다.** `Promise.all` 로 겹쳐 물으면 연결 하나짜리 어댑터에서
  //    한쪽이 조용히 빈 답을 받는다 (lib/todo.js 가 같은 자리에서 다쳤다)
  // ⚠️ 오늘은 **`v2.today()` 한 곳**에서 받는다 (`todayOf`). `new Date()` 를 쓰면
  //    서버가 UTC 라 밤 9시 이후 하루가 어긋나 그날 수업이 통째로 안 걸린다
  const day = await todayOf(db, date);
  const sch = await db.query(SQL_SCHED, [studentId, day]);
  const hol = await db.query(SQL_HOLIDAY, [studentId, day]);

  const byClass = new Map();
  for (const r of sch.rows ?? []) {
    if (!byClass.has(r.class_id)) {
      byClass.set(r.class_id, { classId: r.class_id, kind: r.kind, nickname: r.nickname ?? null, rows: [] });
    }
    byClass.get(r.class_id).rows.push(r);
  }

  const on = [];
  const offList = [];
  const d = day;
  for (const c of byClass.values()) {
    // 그날 하루만 물어본다 — 첫날=끝날
    const holidays = (hol.rows ?? []).filter((h) => h.class_id == null || h.class_id === c.classId);
    const any = countDates({ schedules: c.rows, holidays: [], first: d, last: d, today: null });
    if (!any.dates.length) continue;                       // 그 요일이 아니다
    if (holidays.length) { offList.push(c.classId); continue; }   // 휴강이다
    // 그날에 걸리는 이력 줄 중 **가장 나중에 시작한 것**이 그날의 시각이다
    const eff = c.rows
      .filter((r) => ymd(r.from_date) <= d && (r.to_date == null || ymd(r.to_date) >= d))
      .sort((a, b) => (ymd(a.from_date) < ymd(b.from_date) ? 1 : -1))[0] ?? null;
    on.push({
      classId: c.classId, kind: c.kind, nickname: c.nickname,
      startTime: eff?.start_time ? String(eff.start_time).slice(0, 5) : null,
      endTime: eff?.end_time ? String(eff.end_time).slice(0, 5) : null,
    });
  }
  on.sort((a, b) => String(a.startTime ?? "99:99").localeCompare(String(b.startTime ?? "99:99")));

  return {
    date: day,
    // ⚠️ **하나일 때만 고른다.** 둘 이상이면 아이가 고른다 — 앱이 짐작하지 않는다
    pick: on.length === 1 ? on[0] : null,
    all: on,                                  // 아이에게 보여 줄 목록 (하나여도 그대로 준다)
    mustPick: on.length > 1,                  // 「어느 반이에요?」를 물어야 하나
    others: on.slice(1),                      // (옛 이름 — 화면이 아직 쓴다)
    off: offList.length > 0 && on.length === 0,
    // ⚠️ 아이 눈에는 휴강이 안 보인다 (SQL_HOLIDAY 주석). 못 봤다는 것을 숨기지 않는다
    holidaySeen: (hol.rows ?? []).length > 0 ? true : null,
  };
}

/**
 * 아이가 고른 반을 목록에서 찾는다.
 * ⚠️ **목록에 없는 반은 안 받는다.** 밖에서 아무 반 번호나 보내도 그 반으로 안 찍힌다 —
 *    아이가 남의 반(또는 그날 없는 반) 출결을 만들 길을 막는다(표-9 와 같은 결).
 */
const 고른 = (cls, classId) =>
  classId ? ((cls.all ?? []).find((c) => String(c.classId) === String(classId)) ?? null) : null;

// ── ④ 화면이 그릴 값 — **화면은 이것을 받아 그리기만 한다** ────────────────────

/**
 * 그날 등원 판. `app/me` 담당이 이 값을 그대로 그린다 (`app/me` 는 내가 안 건드린다).
 *
 * @returns {
 *   studentId, date,
 *   steps: [{ step, key, label, done, at }],     // 세 걸음, 찍힌 시각까지
 *   next: { step, key, label } | null,           // 다음에 누를 것 (없으면 다 찍었다)
 *   arrivedAt: 'HH:MM' | null,                   // **저장된 유일한 사실**
 *   cls: { classId, startTime, kind, nickname } | null,
 *   late: { attend, minutes, sure, why },        // ⚠️ **세어 나온 값이다. 저장 안 한다**
 * }
 */
export async function arrivalView(db, { studentId, date = null, graceMin = 0, classId = null } = {}) {
  if (!studentId) throw new Error("학생이 없다");
  const d = await todayOf(db, date);
  const marks = await db.query(SQL_DAY, [studentId, d]);
  const rows = marks.rows ?? [];
  const at = new Map(rows.map((r) => [Number(r.step), r.hm]));

  const steps = STEPS.map((s) => ({ ...s, done: at.has(s.step), at: at.get(s.step) ?? null }));
  const next = steps.find((s) => !s.done) ?? null;
  const arrivedAt = rows.length ? rows[0].hm : null;       // SQL 이 `order by at` 이라 첫 줄이 처음

  const cls = await classOfDay(db, { studentId, date: d });
  const late = arrivedAt
    // ⚠️ 아이가 고른 반이 있으면 **그 반 시각**으로 센다. 안 골랐으면 하나뿐인 반(pick)으로
    ? lateOf({ startTime: (고른(cls, classId) ?? cls.pick)?.startTime ?? null, atHm: arrivedAt, graceMin })
    : null;

  return {
    studentId, date: d,
    steps,
    next: next ? { step: next.step, key: next.key, label: next.label } : null,
    arrivedAt,
    cls: 고른(cls, classId) ?? cls.pick,
    all: cls.all,
    // ⚠️ 아직 안 골랐고 반이 둘 이상이면 **화면이 물어야 한다**
    mustPick: cls.mustPick && 고른(cls, classId) == null,
    others: cls.others,
    off: cls.off,
    holidaySeen: cls.holidaySeen,
    late,
  };
}

// ── ⑤ 찍는다 — **찍으면 그날 판이 선다** ─────────────────────────────────────

/**
 * 한 걸음을 찍고, 그 자리에서 **그날 판을 세운다.**
 *
 * @param one { gate, studentId, step, ip, date?, by?, graceMin? }
 *   · `gate`  — `netGate()` 가 준 것. **없거나 ok 가 아니면 던진다.** 관문을 건너뛸 길을 안 둔다
 *   · `by`    — "student"(아이가 눌렀다) · "staff"(원장님이 대신 찍었다)
 *
 * ⚠️ **아이가 찍는 것은 시각뿐이다.** `attend` 를 밖에서 받지 않는다 — 앱이 센다.
 * ⚠️ 판이 안 서면 **성공이라 말하지 않는다.** `sheet.ok:false` 를 그대로 올려보낸다
 *    (실측 2026-09-02 — `v2.day_sheet` 에는 학생용 쓰기 규칙이 없어 아이 자격으로는 0줄이다.
 *     옛 앱도 같은 자리에서 다쳤다. 보고 needsDb 에 규칙을 적었다).
 *
 * @returns { ok, why, msg, first, view, sheet }
 */
export async function markArrival(db, one = {}, opts = {}) {
  const gate = one.gate;
  if (!gate || typeof gate !== "object") {
    throw new Error("관문(netGate)을 안 지났다 — 학원 회선 조건을 건너뛸 길은 없다");
  }
  if (gate.ok !== true) {
    return { ok: false, why: gate.why, msg: gate.msg, seenIp: gate.seenIp ?? null, view: null, sheet: null };
  }
  if (!one.studentId) throw new Error("학생이 없다");
  const by = one.by === "staff" ? "staff" : "student";
  const s = stepOf(one.step);
  const ip = normIp(one.ip) || null;
  const graceMin = Number.isFinite(Number(one.graceMin)) ? Number(one.graceMin) : 0;

  // ① 걸음을 찍는다 — 두 번 찍어도 한 줄, **먼저 찍은 시각을 지킨다**
  const put = await db.query(SQL_MARK, [one.studentId, one.date ?? null, s.step, ip]);
  const first = (put.rows ?? []).length > 0;

  // ② 화면이 그릴 값을 다시 짓는다 (찍힌 시각·도착 시각·지각 셈이 전부 여기서 나온다)
  const view = await arrivalView(db, {
    studentId: one.studentId, date: one.date ?? null, graceMin, classId: one.classId ?? null });

  if (!view.arrivedAt) {
    // 방금 찍었는데 안 읽힌다 — 접근 규칙이 막았다. **찍혔다고 말하지 않는다**
    return { ok: false, why: "blocked", by, step: s,
      msg: "한 줄도 안 남았습니다 — 접근 규칙이 막았습니다. ⚠️ 확인 안 됨: 여기서는 무엇이 막았는지 못 가릅니다",
      first, view, sheet: null };
  }

  // ③ ⚠️⚠️ **반이 둘인데 아직 안 골랐으면 판을 안 세우고 되묻는다**
  //    (원장님 2026-09-03 — 「학생에게 출결하면서 바로 연달아 고르게 해」).
  //    찍기는 이미 남았다 — **다시 찍을 필요 없이** 반만 고르면 그 자리에서 판이 선다.
  //    ⚠️ 짐작해서 세우지 않는다. 예전에는 가장 이른 반으로 세워, 7시 특강만 온 날에도
  //       5시 정규에 찍혀 **특강 회차가 안 차고 보강이 잘못 떴다.**
  if (view.mustPick) {
    return { ok: false, why: "pick-class", by, step: s, first, view, sheet: null,
      classes: view.all,
      msg: "오늘은 반이 둘입니다 — **어느 반인지 골라 주세요.** 찍은 것은 이미 남았습니다" };
  }

  // ③-2 열 시간 넘게 늦은 것은 판을 안 세운다 — 원장님께 넘긴다
  if (view.late?.tooLate) {
    return { ok: false, why: "too-late", by, step: s, first, view, sheet: null, msg: view.late.why };
  }

  // ④ **찍으면 그날 판이 선다** — 출결은 `lib/attend.js` 한 벌만 쓴다
  // ⚠️ 「얼마나 늦었나」를 **넘기지 않는다.** `attendanceWrite` 가 그것을 거절한다
  //    (원장님 2026-09-02 「지각은 시간이 필요없을 듯」 — 담을 칸이 없고, 찍은 시각에서 다시 센다).
  let sheet;
  if (opts.tx === true) await db.query("savepoint arrival_sheet");
  try {
    sheet = await attendanceWrite(db, {
      via: "arrival",
      studentId: one.studentId,
      date: view.date,
      classId: view.cls?.classId ?? null,        // ⚠️ 반이 없으면 **null 이라고 적는다**
      attend: view.late.attend,                  // ⚠️ 앱이 센 것이다. 아이가 안 골랐다
    });
    if (opts.tx === true) await db.query("release savepoint arrival_sheet");
  } catch (e) {
    // ⚠️⚠️ **접근 규칙이 막으면 0줄이 아니라 던진다** (실측 2026-09-02, 아이 자격 —
    //    `new row violates row-level security policy for table "day_sheet"` · 42501).
    //    여기서 안 받으면 아이 폰에 500 이 뜨고, **이미 남은 찍기까지 실패로 보인다.**
    //    찍기는 남았다고, 판은 안 섰다고 **둘 다 그대로** 말한다.
    // ⚠️ 트랜잭션 안이면 그 오류 하나로 **트랜잭션 전체가 죽는다**(25P02) — 앞서 남긴 찍기까지
    //    못 쓰게 된다. 그래서 부르는 쪽이 `opts.tx` 로 「나는 트랜잭션 안이다」라고 말하면
    //    판 쓰기만 되돌린다. **말 안 하면 되돌린 척도 안 한다** (밖에서는 문장마다 따로 커밋된다).
    if (opts.tx === true) await db.query("rollback to savepoint arrival_sheet");
    const msg = String(e?.message ?? e).split("\n")[0];
    sheet = {
      ok: false, changed: 0, why: /row-level security|permission denied/i.test(msg) ? "denied" : "error",
      msg: `그날 판을 못 세웠다 — ${msg}`,
    };
  }

  return {
    ok: sheet.ok === true,
    why: sheet.ok ? (first ? "marked" : "already") : sheet.why,
    by, step: s, first, view, sheet,
    msg: sheet.ok
      ? (first ? `${s.label} — ${view.arrivedAt} 에 찍혔습니다` : `이미 찍혀 있습니다 (${view.steps.find((x) => x.step === s.step)?.at})`)
      : "찍기는 남았는데 **그날 판이 안 섰습니다** — " + (sheet.msg ?? ""),
    // ⚠️ **저장한 것은 찍은 시각 하나뿐이다.** 지각 여부·몇 분은 아무 데도 안 담기고
    //    `lateFromStamp` 로 언제든 다시 세어 나온다 (원칙 5).
    lateDerivable: true,
  };
}
