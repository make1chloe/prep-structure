/**
 * 운영 화면이 **읽는** 자리. 여기엔 판단이 없다 — 묻고, `lib/` 을 부르고, 받은 것을 넘긴다.
 *
 * ── 판단은 전부 남의 것이다 (원칙 1). 여기서 다시 짜지 않는다:
 *    `lib/session.js`  studentSessions  **특강 회차** — 「반 요일 이력 + 달력 − 휴강」.
 *                                       ⚠️ 결석은 안 빼고, **그 아이가 그 날 그 반이었을 때만** 센다.
 *                      monthRange       달의 첫날·끝날 (모양이 틀리면 던진다)
 *                      DOW_NAME         요일 이름 — 반 이름을 짓는 재료
 *    `lib/monthly.js`  monthLabel       「2026-08」 → 「2026년 8월」
 *                      assertYm         `char(7)` 에 빈칸 붙어 저장되던 자리를 막는다
 *    SQL 함수          v2.today() · v2.student_classes()
 *
 * ── ⚠️⚠️ **청구액을 여기서 만들지 않는다** (오류 대장 83 — 계획이 한 번 통째로 틀렸던 자리).
 *    · **정규는 월정액**이고 회차와 무관하다. 회차를 곱하면 안 된다.
 *    · **특강만 회차만큼** 받는다(5회면 5회분). 그래도 **곱셈은 이 화면이 안 한다** —
 *      단가 줄과 회차를 **나란히 보여주고** 금액은 원장님이 적으신다.
 *      곱하는 순간 「청구액」이라는 새 판단이 화면에 생기고, 그건 `lib/` 에도 DB 에도 없다.
 *    · **금액이 비면 0원이 아니라 「아직 안 적음」**이다 (`v2.payment.amount` 주석 그대로).
 *
 * ── ⚠️ **반 명단 표(`v2.class_member`)를 직접 읽지 않는다** (자동 검사 ⑮).
 *    「이 아이가 이 날 어느 반인가」는 `v2.student_classes()` 한 곳이 답한다.
 *    직접 읽으면 그 판단이 두 벌이 되고, 반을 옮긴 아이의 회차가 두 반 요일을 합쳐 부푼다.
 *
 * ── ⚠️ **퇴원생은 재원 기간만 보인다** (계획 ⑯ 3 · 물음 V — 파기와 부딪힌다).
 *    「언제부터 언제까지 다녔나」를 묻는 한 벌이 아직 없어서(`v2.enrolled_span` 은 없다 —
 *    `app/parent/read.js` 도 같은 자리에서 막혔다), 여기서는 **날짜마다 물어본다**:
 *      · 수납 — 그 달 **첫날이나 끝날**에 반이 있었나
 *      · 상담 — **그 상담이 있던 날**에 반이 있었나
 *    그래서 못 그린 줄이 생기면 **개수를 밝힌다** (대전제 0 · 대전제 6 — 지우지 않는다).
 *
 * ── ⚠️ 조회 수 (`db.js` 의 `QUERY_CAP`)
 *    이 파일이 스스로 쓰는 조회는 **넷**이다 (머리 1 · 수납 1 · 문의 1 · 상담 1).
 *    특강 아이가 있으면 `lib/session.js` 가 아이마다 더 묻는다 — 화면이 그 숫자를 **감추지 않는다.**
 */
import { studentSessions, DOW_NAME } from "../../lib/session.js";
import { monthLabel, assertYm } from "../../lib/monthly.js";

/* ══════════════════════════════════════════════════════════════════════
 * SQL — 값은 전부 `$1`. `${…}` 를 끼우지 않는다.
 * 앞머리 토막주석(`/* ops:… *\/`)은 **조회를 세는 손잡이**다. 지우지 마라.
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 머리 — 오늘 · 고른 달 · 앞뒤 달 · **쓸 수 있나**.
 *
 * ⚠️ 앞뒤 달을 JS 로 세지 않는다. 달력이 두 벌이 되면 12월→1월에서 한 쪽만 틀린다.
 * ⚠️ **「쓸 수 있나」를 글자로 박아 두지 않는다.** 규칙(RLS)이 열려 있어도
 *    권한(GRANT)이 없으면 아무것도 못 쓴다 — 0005 가 적어 둔 함정이고,
 *    `/today` 가 실제로 그 자리에서 막혔었다. 그래서 **매번 물어본다**
 *    (`has_table_privilege` 는 조회 안에 얹히므로 왕복이 안 는다).
 */
const Q_HEAD = `/* ops:head */
with m as (select coalesce(nullif($1,''), to_char(v2.today(),'YYYY-MM')) as ym)
select to_char(v2.today(),'YYYY-MM-DD')                              as today,
       to_char(v2.today(),'YYYY-MM')                                 as this_ym,
       m.ym                                                          as ym,
       to_char((m.ym||'-01')::date - interval '1 month','YYYY-MM')   as prev_ym,
       to_char((m.ym||'-01')::date + interval '1 month','YYYY-MM')   as next_ym,
       to_char((m.ym||'-01')::date,'YYYY-MM-DD')                     as first_day,
       to_char(((m.ym||'-01')::date + interval '1 month' - interval '1 day')::date,'YYYY-MM-DD') as last_day,
       (select json_object_agg(t, json_build_object(
           'ins', has_table_privilege('v2.'||t,'insert'),
           'upd', has_table_privilege('v2.'||t,'update')))
          from unnest(array['payment','fee_rule','consult','inquiry','students','class_member']) t) as can_write,
       (select count(*)::int from v2.fee_rule)                        as fee_rules,
       (select count(*)::int from v2.schools where state = 'active')  as schools,
       -- 지금 열려 있는 반 — **등록 전환**과 **단가 줄**이 고르는 목록이다.
       -- ⚠️ 반에는 이름 칸이 없다(0002). 요일·시각을 같이 실어 화면이 이름을 짓게 한다
       (select coalesce(json_agg(json_build_object('id', c.id, 'kind', c.kind,
                 'weekdays', s.weekdays, 'start', to_char(s.start_time,'HH24:MI'))
                 order by c.kind, s.start_time), '[]'::json)
          from v2.classes c
          left join lateral (
            select cs.weekdays, cs.start_time from v2.class_schedule cs
             where cs.class_id = c.id and cs.from_date <= v2.today()
               and (cs.to_date is null or cs.to_date >= v2.today())
             order by cs.from_date desc limit 1) s on true
         where c.state = 'active')                                    as classes,
       -- 단가 줄 **전부** — 「언제부터 얼마」를 쌓은 이력이다. 지난 줄도 안 감춘다(대전제 6).
       -- ⚠️ 어느 줄이 이기는지 여기서 안 정한다 — 그 규칙이 계획서에도 DB 에도 없다
       (select coalesce(json_agg(json_build_object('id', f.id, 'amount', f.amount,
                 'from', to_char(f.from_date,'YYYY-MM-DD'), 'to', to_char(f.to_date,'YYYY-MM-DD'),
                 'per_session', f.per_session,
                 'scope', case when f.student_id is not null then 'student' else 'class' end,
                 'name', coalesce(st2.name, ck2.tag))
                 order by f.from_date desc), '[]'::json)
          from v2.fee_rule f
          left join v2.students st2 on st2.id = f.student_id
          left join lateral (
            select case when c2.kind = 'special' then '특강' else '정규' end as tag
              from v2.classes c2 where c2.id = f.class_id) ck2 on true)  as rules
  from m`;

/**
 * 그 달 수납 한 벌 — 아이 하나가 한 줄.
 *
 * 같이 딸려 오는 것:
 *   `classes`  그 달에 이 아이가 선 반 (정규/특강 · 요일 · 시각). **반 이름은 화면이 짓는다**
 *              (`lib/session.js`: 「반 이름은 여기서 안 짓는다 — 화면 쪽 일이다」)
 *   `rules`    그 달에 **걸쳐 있는 단가 줄 전부**. ⚠️ **하나를 고르지 않는다** —
 *              학생 줄과 반 줄 중 어느 쪽이 이기는지가 계획서에도 DB 에도 **안 적혀 있다.**
 *              지어내면 그날부터 지난달 청구액이 소급해 바뀐다. 둘 다 보여주고 원장님이 정하신다.
 *   `hidden_left` **재원 기간 밖이라 안 그린 퇴원생 수납 줄 수.** 0 이 아니면 화면이 밝힌다
 *
 * ⚠️ 줄에 서는 아이 = 재원생 전부 + **그 달에 반이 있었던 아이**(퇴원생 포함).
 *    퇴원생인데 그 달에 반이 없으면 안 그린다 — 그것이 「재원 기간만」이다.
 */
const Q_FEE = `/* ops:fee */
with m as (select $1::text as ym, ($1||'-01')::date as d1,
                  (($1||'-01')::date + interval '1 month' - interval '1 day')::date as d2)
select st.id as student_id, st.name, st.grade, st.state,
       p.id as payment_id, p.amount, to_char(p.paid_on,'YYYY-MM-DD') as paid_on,
       p.method, p.note,
       coalesce(ck.j, '[]'::json) as classes,
       coalesce(fr.j, '[]'::json) as rules,
       (select count(*)::int from v2.payment q
          join v2.students s2 on s2.id = q.student_id
         where q.ym = m.ym and s2.state <> 'active'
           and not exists (select 1 from v2.student_classes(s2.id, m.d1))
           and not exists (select 1 from v2.student_classes(s2.id, m.d2))) as hidden_left
  from m
  cross join v2.students st
  left join lateral (
    select array_agg(distinct sc.class_id) as ids
      from (select class_id from v2.student_classes(st.id, m.d1)
             union
            select class_id from v2.student_classes(st.id, m.d2)) sc) cls on true
  left join v2.payment p on p.student_id = st.id and p.ym = m.ym
  left join lateral (
    select json_agg(json_build_object('id', c.id, 'kind', c.kind,
             'weekdays', s.weekdays, 'start', to_char(s.start_time,'HH24:MI'))
           order by c.kind, c.created_at) as j
      from v2.classes c
      left join lateral (
        select cs.weekdays, cs.start_time from v2.class_schedule cs
         where cs.class_id = c.id and cs.from_date <= m.d2
           and (cs.to_date is null or cs.to_date >= m.d1)
         order by cs.from_date desc limit 1) s on true
     where c.id = any(coalesce(cls.ids,'{}'::uuid[]))) ck on true
  left join lateral (
    select json_agg(json_build_object('id', f.id, 'amount', f.amount,
             'from', to_char(f.from_date,'YYYY-MM-DD'), 'to', to_char(f.to_date,'YYYY-MM-DD'),
             'per_session', f.per_session, 'base', f.base_sessions,
             'scope', case when f.student_id is not null then 'student' else 'class' end,
             'class_id', f.class_id) order by f.from_date desc) as j
      from v2.fee_rule f
     where f.from_date <= m.d2 and (f.to_date is null or f.to_date >= m.d1)
       and (f.student_id = st.id
         or (f.student_id is null and f.class_id = any(coalesce(cls.ids,'{}'::uuid[]))))) fr on true
 where st.state = 'active' or coalesce(array_length(cls.ids,1),0) > 0
 order by st.name`;

/**
 * 신규 문의 — **진행 중인 것이 맨 위**다. 전화 끊고 바로 여는 자리다.
 * ⚠️ 끝난 것(등록·안 옴)도 안 지우고 그대로 둔다 (대전제 6). 화면이 접어서 줄인다.
 */
const Q_INQUIRY = `/* ops:inquiry */
select i.id, i.name, i.phone, i.school, i.grade, i.way, i.stage, i.body, i.student_id,
       st.name as student_name,
       to_char(i.created_at at time zone 'Asia/Seoul','YYYY-MM-DD') as on_date,
       to_char(i.updated_at at time zone 'Asia/Seoul','YYYY-MM-DD') as up_date
  from v2.inquiry i
  left join v2.students st on st.id = i.student_id
 order by (i.stage in ('new','test','visit')) desc, i.created_at desc
 limit 200`;

/**
 * 상담일지 — **아이마다 모아 본다.**
 *   `by_student` 아이 목록 + 그 아이 상담 개수 · 마지막 날 (한눈에 「누가 오래 비었나」)
 *   `rows`       고른 아이의 줄 전부. 아무도 안 골랐으면 **최근 20줄**
 *   `hidden`     재원 기간 밖이라 안 그린 줄 수 (퇴원생)
 *   `no_student` 아이가 안 붙은 상담 줄 수 — 있으면 밝힌다 (숨기면 영영 못 찾는다)
 *
 * ⚠️ `$1` 이 비면 전체 최근, 있으면 그 아이. **글자를 SQL 에 안 끼운다.**
 */
const Q_CONSULT = `/* ops:consult */
select json_build_object(
 'by_student', (select coalesce(json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'grade', s.grade, 'state', s.state,
        'n', k.n, 'last', to_char(k.last at time zone 'Asia/Seoul','YYYY-MM-DD'))
        order by k.n desc nulls last, s.name), '[]'::json)
     from v2.students s
     cross join lateral (select count(*)::int as n, max(c.at) as last
                           from v2.consult c where c.student_id = s.id) k
    where s.state = 'active' or k.n > 0),
 'rows', (select coalesce(json_agg(json_build_object(
        'id', c.id, 'student_id', c.student_id, 'name', s.name, 'way', c.way, 'body', c.body,
        'at', to_char(c.at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'))
        order by c.at desc), '[]'::json)
     from (select cc.* from v2.consult cc
            where ($1::uuid is null or cc.student_id = $1::uuid)
            order by cc.at desc
            limit case when $1::uuid is null then 20 else 200 end) c
     left join v2.students s on s.id = c.student_id
    where s.id is null or s.state = 'active'
       or exists (select 1 from v2.student_classes(c.student_id,
                                (c.at at time zone 'Asia/Seoul')::date))),
 'hidden', (select count(*)::int from v2.consult c
             join v2.students s on s.id = c.student_id
            where s.state <> 'active'
              and not exists (select 1 from v2.student_classes(c.student_id,
                                     (c.at at time zone 'Asia/Seoul')::date))),
 'no_student', (select count(*)::int from v2.consult where student_id is null)
) as j`;

/** ⚠️ 검사가 **진짜 스키마에 물어보게** 내보낸다 — 죽은 칸을 글자로 훑어서는 못 잡는다 */
export const SQL = Object.freeze({ head: Q_HEAD, fee: Q_FEE, inquiry: Q_INQUIRY, consult: Q_CONSULT });

/* ══════════════════════════════════════════════════════════════════════
 * 읽는 손 — 판단 없음. 받은 것을 화면이 쓰기 좋은 모양으로만 갈아 준다.
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 반 이름 — **요일 + 시각**이다. 반에는 이름 칸이 없다 (0002 주석: 「이름이 없다」).
 * ⚠️ `lib/session.js` 가 「반 이름은 여기서 안 짓는다 — 화면 쪽 일이다」라고 못 박아 둔 자리라
 *    여기서 짓는다. 요일 이름은 `DOW_NAME` 한 벌을 그대로 쓴다 (베끼지 않는다).
 */
export function classLabel(c = {}) {
  const days = (c.weekdays ?? []).map((d) => DOW_NAME[Number(d)] ?? "?").join("·");
  const at = c.start ? ` ${c.start}` : "";
  if (!days && !at) return c.kind === "special" ? "특강" : "정규";
  return `${days}${at}`;
}

/**
 * 머리 — 오늘·달·앞뒤 달·권한·반·단가 줄.
 * @param ym 'YYYY-MM' 또는 `null`. **비면 DB 가 「학원의 오늘」로 채운다** —
 *           `new Date()` 를 쓰면 서버가 UTC 라 밤 9시 이후 달이 어긋난다.
 * ⚠️ 모양이 틀린 글자가 오면 `assertYm` 이 **여기서 던진다** (`char(7)` 에 빈칸 붙던 자리).
 */
export async function loadHead(db, ym = null) {
  const { rows } = await db.query(Q_HEAD, [ym ? assertYm(ym) : ""]);
  const r = rows[0] ?? {};
  return {
    today: r.today ?? null,
    thisYm: r.this_ym ?? null,
    ym: r.ym ?? ym,
    label: monthLabel(r.ym ?? ym),
    prevYm: r.prev_ym ?? null,
    nextYm: r.next_ym ?? null,
    firstDay: r.first_day ?? null,
    lastDay: r.last_day ?? null,
    canWrite: r.can_write ?? {},
    feeRules: Number(r.fee_rules ?? 0),
    schools: Number(r.schools ?? 0),
    classes: (r.classes ?? []).map((c) => ({ ...c, label: classLabel(c) })),
    rules: r.rules ?? [],
  };
}

/**
 * 그 달 수납.
 *
 * ⚠️ **여기서 세는 것은 「빈 칸이 몇 개인가」뿐이다.** 「미납」은 안 판정한다 —
 *    「며칠 지나면 미납인가」가 계획서에도 `v2.auto_rule` 에도 없다(대시보드가 이미 같은 자리에서 멈췄다).
 *    기준을 지어내면 원장님이 안 보셔도 될 아이가 빨갛게 뜬다.
 */
export async function loadFee(db, ym) {
  const { rows } = await db.query(Q_FEE, [assertYm(ym)]);
  const people = rows.map((r) => {
    const classes = r.classes ?? [];
    return {
      studentId: r.student_id, name: r.name, grade: r.grade, state: r.state,
      paymentId: r.payment_id ?? null,
      // ⚠️ `null` 을 0 으로 바꾸지 않는다. 비면 **「아직 안 적음」**이다
      amount: r.amount == null ? null : Number(r.amount),
      paidOn: r.paid_on ?? null, method: r.method ?? null, note: r.note ?? null,
      classes: classes.map((c) => ({ ...c, label: classLabel(c) })),
      special: classes.filter((c) => c.kind === "special"),
      rules: r.rules ?? [],
    };
  });
  const hiddenLeft = Number(rows[0]?.hidden_left ?? 0);
  return {
    people, hiddenLeft,
    // 본 것만 센다 (판정 아님)
    noRow: people.filter((p) => p.paymentId == null).length,
    noAmount: people.filter((p) => p.paymentId != null && p.amount == null).length,
    noPaid: people.filter((p) => p.paymentId != null && !p.paidOn).length,
  };
}

/** 신규 문의 — 진행 중과 끝난 것을 **가르지 않고** 그대로 준다. 접는 것은 화면 일이다 */
export async function loadInquiry(db) {
  const { rows } = await db.query(Q_INQUIRY, []);
  return rows.map((r) => ({
    id: r.id, name: r.name, phone: r.phone, school: r.school, grade: r.grade,
    way: r.way, stage: r.stage, body: r.body,
    studentId: r.student_id ?? null, studentName: r.student_name ?? null,
    onDate: r.on_date, upDate: r.up_date,
  }));
}

/** 상담일지 */
export async function loadConsult(db, studentId = null) {
  const { rows } = await db.query(Q_CONSULT, [studentId || null]);
  const j = rows[0]?.j ?? {};
  return {
    byStudent: j.by_student ?? [],
    rows: j.rows ?? [],
    hidden: Number(j.hidden ?? 0),
    noStudent: Number(j.no_student ?? 0),
  };
}

/**
 * **특강 회차** — 특강 아이만. `lib/session.js` 의 `studentSessions()` 한 벌을 부른다.
 *
 * ⚠️ 왜 정규는 안 부르나: **정규 수강료는 월정액**이고 회차와 무관하다(원장님 2026-09-01 정정).
 *    정규 회차는 「8회를 채웠나」를 보는 값이고 그건 **일정 화면**에 산다.
 * ⚠️ 왜 반 단위로 안 세나: 달 중간에 들어오거나 나간 아이가 있으면 반 회차와 아이 회차가 다르다.
 *    `studentSessions` 는 **그 아이가 그 날 그 반이었을 때만** 세는 유일한 한 벌이다.
 * ⚠️ **아이마다 조회가 는다.** 실측 2026-09-02 — 특강 아이 하나에 **4~6번**
 *    (그 아이가 선 반이 정규·특강 둘이면 반마다 요일·휴강을 묻는다).
 *    실제로 재 보니 특강 아이 3명일 때 2026-08 은 12번, 2026-09 는 18번이었다.
 *    → 그래서 **아이 수가 아니라 조회 수로 멈춘다.** 아이 수로 멈추면 반이 둘인 아이가
 *      섞였을 때 상한을 소리 없이 넘는다.
 * ⚠️ 멈춰서 못 센 아이는 **이름을 그대로 돌려준다.** 조용히 빠뜨리면 그 아이 특강비가 영영 안 걷힌다.
 *
 * @param opt.budget 이 함수가 쓸 수 있는 조회 수 (`QUERY_CAP` 에서 기본 넷을 뺀 만큼)
 * @returns { byStudent: Map(studentId → {total, byClass}), skipped:[이름], asked:number, used:number }
 */
export async function loadSpecial(db, people, ym, today, { budget = 20 } = {}) {
  const mine = people.filter((p) => p.special.length > 0);
  const out = new Map();
  const skipped = [];
  let used = 0, asked = 0;
  // ⚠️ 세는 손만 얹는다. `lib/session.js` 가 받는 모양(`{query}`)은 그대로다
  const counted = { query: (sql, params) => { used++; return db.query(sql, params); } };

  for (const p of mine) {
    // ⚠️ 한 아이가 6번까지 쓴다 — **시작하기 전에** 자리가 남았는지 본다.
    //    시작해 놓고 중간에 멈추면 반쪽짜리 숫자가 나온다
    if (used + 6 > budget) { skipped.push(p.name); continue; }
    asked++;
    const s = await studentSessions(counted, p.studentId, ym, { today });
    const ids = new Set(p.special.map((c) => c.id));
    const byClass = (s.byClass ?? []).filter((c) => ids.has(c.classId));
    out.set(p.studentId, { total: byClass.reduce((a, c) => a + c.total, 0), byClass });
  }
  return { byStudent: out, skipped, asked, used };
}
