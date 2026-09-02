/**
 * 발송 화면이 DB 에 묻는 **모든 글월**. 한 파일에 모은 까닭이 둘이다.
 *
 * ① `scripts/check-sql.mjs` 는 `lib` 만 훑어서 `app/` 의 SQL 을 **원리적으로 안 본다.**
 *    여기 모아 두면 `scripts/check-screen-send.mjs` 가 **진짜 스키마에 PREPARE** 해서
 *    없는 칸·죽은 칸을 그 자리에서 잡는다 (가짜 DB 로는 못 잡는 것들이다).
 * ② 서버 동작(`actions.js`)은 `next/headers` 를 끌고 들어와 **Next 밖에서 못 불러온다.**
 *    SQL 이 거기 있으면 검사가 그 글월을 영영 못 본다 — 실제로 한 번 막혔다.
 *
 * ⚠️ 값은 반드시 `$1` 로 넘긴다. `${…}` 로 끼우면 기계로 검사할 수가 없다.
 * ⚠️ 앞머리 토막주석(`send:…`)을 지우지 마라 — **화면 것과 lib 것을 갈라 세는 표시**다.
 * ⚠️ 반 명단은 `v2.class_roster()` 로만 읽는다 (자동 검사 ⑮). `v2.class_member` 를 직접 읽으면
 *    「누가 그 반인가」가 두 벌이 된다.
 * ⚠️ **원장님만 볼 메모 칸은 여기 이름조차 안 적는다** — `lib/close.js` 밖에 그 이름이 나오면
 *    `scripts/check-close.mjs` 가 깨진다. 한 줄만 빠져도 학부모 화면에 그대로 뜬다(사고 #7).
 *
 * ⚠️⚠️ **보내는 SQL 이 여기 거의 없다.** 데일리·하원은 `lib/push.js` 의 `sendDaily`·`sendLate` 가
 *    제 글월을 갖고 있다(받는 사람 찾기 · 기기 세기 · 「보냄」 도장까지). 여기 다시 적으면
 *    도장이 두 벌이 되어, 한쪽만 고쳐지는 날 **마감이 「안 보냈습니다」를 안 묻는다.**
 */

/**
 * ⭐ **화면이 그리려고 묻는 것 — 하나뿐이다.**
 * 묶음 셋(데일리·하원·안내)과 예약·읽음·문구·닿는 길을 **한 번에** 받는다.
 * 탭이 없으므로 묶음을 오가도 다시 안 묻는다 (§속도 1).
 *
 * ⚠️ 「보냈나」는 `sent_at` 한 칸으로 본다 — **`lib/push.js` 가 찍는 그 칸이다.**
 *    자취(`v2.notify_log`)를 세어 따로 판정하면 도장과 화면이 갈린다(원칙 1).
 * ⚠️⚠️ **`v2.notify_log` 에 「만든 때」 칸이 없다** (실측 2026-09-02 — id·profile_id·student_id·
 *    kind·title·url·tag·sent_at·delivered_at·opened_at·open_count·failed_at·fail_why·sink).
 *    스위치가 `off` 면 `sent_at` 이 null 로 박혀 **그 줄에는 시각이 하나도 없다** —
 *    「언제 눌렀나」를 못 센다. 고치는 길은 보고의 `needsDb` 에 적었다.
 */
export const Q_BOARD = `/* send:board */
with t as (select coalesce($1::date, v2.today()) as d),
roster as (
  select r.student_id
    from t
    join v2.class_schedule cs
      on cs.from_date <= t.d and (cs.to_date is null or cs.to_date >= t.d)
     and extract(dow from t.d)::int = any(cs.weekdays)
   cross join lateral v2.class_roster(cs.class_id, t.d) r
  union
  select s.id from t join v2.students s on s.state = 'active' and v2.is_makeup_day(s.id, t.d)
  union
  select x.student_id from t join v2.day_sheet x on x.date = t.d
),
who as (select s.id as student_id, s.name, s.grade from roster join v2.students s on s.id = roster.student_id),
reach as (
  select ps.student_id,
         count(distinct p.id)::int         as parents,
         count(distinct sub.endpoint)::int as devices
    from v2.parent_student ps
    join v2.profiles p on p.id = ps.parent_profile_id and p.state = 'active'
    left join v2.push_sub sub on sub.profile_id = p.id and sub.revoked_at is null
   group by ps.student_id
)
select json_build_object(
 'on',    (select to_char(d,'YYYY-MM-DD') from t),
 'today', to_char(v2.today(),'YYYY-MM-DD'),

 'daily', (select coalesce(json_agg(q.j order by q.nm),'[]'::json) from (
    select w.name as nm, json_build_object(
      'studentId', w.student_id, 'name', w.name, 'grade', w.grade,
      'sheetId', sh.id, 'attend', sh.attend, 'closedAt', sh.closed_at, 'sentAt', sh.sent_at,
      'comment', sh.comment, 'sheets', coalesce(sh.n, 0),
      'parents', coalesce(rc.parents, 0), 'devices', coalesce(rc.devices, 0),
      'firstOpen', lg.first_open, 'opens', coalesce(lg.opens, 0), 'logs', coalesce(lg.logs, 0)) as j
      from who w
      left join reach rc on rc.student_id = w.student_id
      left join lateral (
        select x.id, x.attend, x.closed_at, x.sent_at, x.comment, count(*) over ()::int as n
          from v2.day_sheet x
         where x.student_id = w.student_id and x.date = (select d from t)
         order by x.created_at limit 1) sh on true
      left join lateral (
        select count(*)::int                          as logs,
               min(l.opened_at)                       as first_open,
               coalesce(sum(l.open_count), 0)::int    as opens
          from v2.notify_log l
         where l.student_id = w.student_id and l.kind = 'daily') lg on true) q),

 'late', (select coalesce(json_agg(json_build_object(
      'id', l.id, 'sheetId', x.id, 'studentId', x.student_id, 'name', s.name,
      'reason', l.reason, 'untilAt', l.until_at::text,
      'leftAt', (select to_char(a.at at time zone 'Asia/Seoul','HH24:MI') from v2.arrival a
                  where a.student_id = x.student_id and a.date = x.date and a.step = 4),
      'sentAt', l.sent_at, 'closedAt', x.closed_at,
      'parents', coalesce(rc.parents, 0), 'devices', coalesce(rc.devices, 0)) order by s.name),'[]'::json)
    from v2.late_stay l
    join v2.day_sheet x on x.id = l.sheet_id and x.date = (select d from t)
    join v2.students s on s.id = x.student_id
    left join reach rc on rc.student_id = x.student_id),

 'notice', (select coalesce(json_agg(json_build_object(
      'id', n.id, 'title', n.title, 'body', n.body, 'toRole', n.to_role,
      'ring', n.ring, 'place', n.place, 'classId', n.class_id, 'schoolId', n.school_id,
      'publishAt', n.publish_at, 'sentAt', n.sent_at, 'createdAt', n.created_at,
      'readers', (select count(*)::int from v2.notice_read r where r.notice_id = n.id),
      'firstAt', (select min(r.first_at) from v2.notice_read r where r.notice_id = n.id),
      'lastAt',  (select max(r.last_at)  from v2.notice_read r where r.notice_id = n.id),
      'opens',   (select coalesce(sum(r.open_count), 0)::int from v2.notice_read r where r.notice_id = n.id)
    ) order by n.created_at desc),'[]'::json)
    from (select * from v2.notice order by created_at desc limit 20) n),

 'sched', (select coalesce(json_agg(json_build_object(
      'id', sd.id, 'kind', sd.kind, 'studentId', sd.student_id, 'name', s.name,
      'at', sd.at, 'body', sd.body) order by sd.at),'[]'::json)
    from v2.scheduled_send sd left join v2.students s on s.id = sd.student_id
   where sd.sent_at is null and sd.cancelled_at is null),

 -- ⚠️⚠️ **줄 수 상한을 안 건다** (속도-4). 예전에는 order by id desc limit 200 이
 --    **전 학생 공용**이었다 — 학생으로도 날짜로도 안 좁힌 순수 절단이라 규칙 문면 그대로다.
 --    200 을 넘는 순간 접기 머리의 「자취 N줄」(안 자른 총수)과 몸통(200줄)이 갈리고,
 --    「안 읽은 집만 보기」가 그 200줄 안에서만 걸러 **「안 읽은 줄이 없습니다」를 오류 없이** 띄웠다.
 --    데일리 한 번에 ~21줄이 쌓이므로 발송이 돌기 시작하면 **열흘 남짓에** 그 자리에 닿는다.
 -- → **그날 명단 + 날짜 창**으로 좁힌다. 상한($3)은 그래도 남기되 **자른 사실을 화면이 말한다**.
 -- ⚠️ 학생이 안 붙은 줄(집 전체에 간 것)은 **빼지 않는다** — 빼면 그 갈래가 통째로 안 보인다.
 -- ⚠️ sent_at 은 스위치가 off 면 null 이다. 그래서 created_at(0075)로 받쳐 센다 —
 --    안 그러면 **안 나간 줄이 창 밖으로 통째로 밀려난다.**
 'reads', (select coalesce(json_agg(json_build_object(
      'id', l.id, 'kind', l.kind, 'title', l.title, 'sink', l.sink, 'tag', l.tag,
      'studentName', s.name, 'toName', p.name, 'toRole', p.role,
      'sentAt', l.sent_at, 'deliveredAt', l.delivered_at,
      'firstAt', l.opened_at, 'opens', l.open_count,
      'failedAt', l.failed_at, 'failWhy', l.fail_why) order by l.id desc),'[]'::json)
    from (select * from v2.notify_log l
           where (l.student_id in (select student_id from who) or l.student_id is null)
             and coalesce(l.sent_at, l.created_at)
                 >= ((select d from t) - ($2::int || ' days')::interval)
           order by l.id desc limit $3::int) l
    left join v2.students s on s.id = l.student_id
    left join v2.profiles p on p.id = l.profile_id),

 -- 화면이 **자른 사실을 말할 수 있게** 같은 술어로 한 번 더 센다
 'readWin', json_build_object(
    'days', $2::int, 'cap', $3::int,
    'total', (select count(*)::int from v2.notify_log l
               where (l.student_id in (select student_id from who) or l.student_id is null)
                 and coalesce(l.sent_at, l.created_at)
                     >= ((select d from t) - ($2::int || ' days')::interval))),

 'tpl', (select coalesce(json_agg(json_build_object(
      'kind', m.kind, 'title', m.title, 'body', m.body)),'[]'::json) from v2.msg_template m),

 'facts', json_build_object(
    'parents',  (select count(*)::int from v2.profiles where role = 'parent' and state = 'active'),
    'linked',   (select count(distinct parent_profile_id)::int from v2.parent_student),
    'devices',  (select count(*)::int from v2.push_sub where revoked_at is null),
    'revoked',  (select count(*)::int from v2.push_sub where revoked_at is not null),
    'samples',  (select count(*)::int from v2.comment_sample),
    'logs',     (select count(*)::int from v2.notify_log),
    'sheets',   (select count(*)::int from v2.day_sheet where date = (select d from t)),
    'canWrite', (select json_object_agg(tt, json_build_object(
                    'ins', has_table_privilege('v2.'||tt, 'insert'),
                    'upd', has_table_privilege('v2.'||tt, 'update')))
                  from unnest(array['notify_log','scheduled_send','day_sheet','late_stay','notice','push_sub']) tt))
) as j`;

/**
 * 고른 안내(공지)의 **받는 사람** — `lib/` 에 공지를 보내는 한 벌이 아직 없어 여기서 모은다.
 * (데일리·하원은 `lib/push.js` 가 제 손으로 모은다 — 여기 다시 안 적는다.)
 *
 * ⚠️ 반 공지의 대상은 **`v2.class_roster()`** 로만 좁힌다 (자동 검사 ⑮).
 * ⚠️⚠️ 학생 계정은 `v2.students.profile_id` 다 — 실측 2026-09-02 로 `students.id = profiles.id` 인
 *    줄이 **0개**임을 확인했다. 두 값을 같은 것으로 치면 학생 공지가 통째로 아무에게도 안 간다.
 */
export const Q_NOTICE_TARGETS = `/* send:noticetargets */
with t as (select coalesce($1::date, v2.today()) as d)
select coalesce(json_agg(json_build_object(
   'key', n.id, 'noticeId', n.id, 'title', n.title, 'body', n.body,
   'toRole', n.to_role, 'sentAt', n.sent_at, 'targets', tg.list,
   'devices', dv.n)),'[]'::json) as j
  from v2.notice n
 cross join lateral (
   select coalesce(json_agg(json_build_object(
            'profileId', z.profile_id, 'studentId', z.student_id, 'role', z.role)),'[]'::json) as list
     from (
       select distinct p.id as profile_id, s.id as student_id, p.role
         from v2.students s
         join v2.profiles p on p.id = s.profile_id and p.state = 'active'
        where s.state = 'active' and n.to_role in ('student','both')
          and (n.school_id is null or s.school_id = n.school_id)
          and (n.class_id is null
               or s.id in (select r.student_id from v2.class_roster(n.class_id, (select d from t)) r))
       union
       select distinct p.id, ps.student_id, p.role
         from v2.students s
         join v2.parent_student ps on ps.student_id = s.id
         join v2.profiles p on p.id = ps.parent_profile_id and p.state = 'active'
        where s.state = 'active' and n.to_role in ('parent','both')
          and (n.school_id is null or s.school_id = n.school_id)
          and (n.class_id is null
               or s.id in (select r.student_id from v2.class_roster(n.class_id, (select d from t)) r))
     ) z) tg
 cross join lateral (
   -- ⚠️ 「보낼 데가 있나」 — 없으면 자취만 남고 아무도 모른다. lib/push.js 의 outcome 이 이 값을 본다
   select count(distinct sub.endpoint)::int as n
     from v2.push_sub sub
    where sub.revoked_at is null
      and sub.profile_id in (select (x->>'profileId')::uuid from json_array_elements(tg.list) x)) dv
 where n.id = any($2::uuid[])`;

/** 공지 「보냈다」 도장 — ⚠️ **진짜로 나갔을 때만** 찍는다 (`lib/push.js` 의 `outcome` 이 가른다) */
export const Q_NOTICE_SENT = `/* send:noticesent */
update v2.notice set sent_at = coalesce(sent_at, now()) where id = $1::uuid returning id, sent_at`;

/** 고른 판·늦귀가가 **누구 것인가** — 예약 줄에 아이를 적으려고만 쓴다 (조회 하나) */
export const Q_PICKED = `/* send:picked */
select 'daily' as kind, x.id as ref_id, x.student_id, s.name, null::text as body
  from v2.day_sheet x join v2.students s on s.id = x.student_id
 where x.id = any($1::uuid[])
union all
select 'late', l.id, x.student_id, s.name, l.reason
  from v2.late_stay l
  join v2.day_sheet x on x.id = l.sheet_id
  join v2.students s on s.id = x.student_id
 where l.id = any($2::uuid[])`;

/**
 * 부모님께 나갈 글 — **판단이 아니다.** 원장님이 적은 그대로 담는다.
 *
 * ⚠️⚠️ **나간 글은 안 고쳐진다.** `lib/monthly.js` 가 월간 리포트에 걸어 둔 것과 **같은 규칙**이다
 *    (「굳은 글은 안 바뀝니다」). 여기서는 `sent_at` 한 칸이 그 방벽이다 —
 *    그 칸은 `lib/push.js` 가 **진짜로 나갔을 때만** 찍는다.
 *    ⚠️ 스위치가 `off` 면 도장이 안 찍히므로 늘 고쳐진다 — 그게 맞다. 아무 데도 안 갔으니까.
 * ⚠️ 0줄이면 **실패다** (자동 검사 ⑪) — 접근 규칙이 막았는데 「저장됨」이라 말하지 않는다.
 */
export const Q_TEXT = `/* send:text */
update v2.day_sheet set comment = $2, updated_at = now()
 where id = $1::uuid and sent_at is null
 returning id, comment, closed_at`;

/**
 * 예약 한 줄 — ⚠️ 시각은 **DB 가 짓는다.** 브라우저 시계를 믿으면 「학원의 오늘」이 어긋난다
 * (`v2.today()` 는 `now() at time zone 'Asia/Seoul'` 이다 — 0001).
 */
export const Q_SCHED = `/* send:sched */
insert into v2.scheduled_send (kind, student_id, body, at, created_by)
select $1::text, $2::uuid, $3::text, case
    when $4::text = 'tonight'  then ((v2.today()::text || ' 21:00')::timestamp at time zone 'Asia/Seoul')
    when $4::text = 'tomorrow' then (((v2.today() + 1)::text || ' 09:00')::timestamp at time zone 'Asia/Seoul')
    else (($5::text)::timestamp at time zone 'Asia/Seoul') end, $6::uuid
returning id, at, kind, student_id`;

/** 예약 취소 — ⚠️ **지우지 않는다.** 상태로 내린다 (대전제 6 · 사고 #8) */
export const Q_CANCEL = `/* send:cancel */
update v2.scheduled_send set cancelled_at = now()
 where id = $1::uuid and sent_at is null and cancelled_at is null returning id`;

/** ⚠️ 검사가 **진짜 스키마에 물어보게** 내보낸다 — 죽은 칸을 글자로 훑어서는 못 잡는다 */
export const SQL = Object.freeze({
  board: Q_BOARD, noticeTargets: Q_NOTICE_TARGETS, noticeSent: Q_NOTICE_SENT,
  picked: Q_PICKED, text: Q_TEXT, sched: Q_SCHED, cancel: Q_CANCEL,
});
