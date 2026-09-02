/**
 * 오늘 화면이 **읽는** 자리. 여기엔 판단이 없다 — 묻고, `lib/` 을 부르고, 받은 것을 넘긴다.
 *
 * ── 판단은 전부 남의 것이다 (원칙 1). 여기서 다시 짜지 않는다:
 *    `lib/routine.js`  routineNext   ②오늘 학습 · ③오늘 숙제를 **차려 준다** (⑨ · ⑨-a)
 *                      loadOf/saysOf 「오늘 좀 많습니다」 — **말만 하고 밀지 않는다** (㊺-a)
 *                      memoCovers    메모로 대신한 날 마감이 무엇을 올리나 (㊳)
 *    `lib/word.js`     testsToday    오늘 볼 단어시험 (**멈춘 교재는 SQL 이 뺀다**)
 *                      reportLines   본 것·다음 시간 (**개수를 안 적으면 줄이 안 온다**)
 *                      failedToday · lateReasonText  미통과 → 늦귀가 사유 (⑭)
 *    `lib/close.js`    sheetForFamily / itemsForFamily  마감 전 가리기 · 원장 메모 빼기
 *    SQL 함수          v2.class_roster · v2.is_makeup_day · v2.book_progress ·
 *                      v2.book_stop · v2.memo_only_streak · v2.today_load · v2.unit_label
 *
 * ── ⚠️ 조회 수 (계획 §속도 — `/today` 는 **조회 20 · 4단**)
 *    이 파일이 스스로 쓰는 조회는 **둘뿐**이다 (명단 1 · 한 아이 한 벌 1).
 *    나머지는 `lib/` 이 쓴다 — 실측 2026-09-02 구도은(교재 5권)에서
 *    `routineNext` 하나가 **21번**을 물었다(405ms). 문 열기 1 + 2 + 21 + 단어 1 = **25**로
 *    상한 20을 넘는다. 화면이 그 숫자를 **감추지 않고 띄운다**(대전제 0).
 *    줄이는 길은 화면이 아니라 DB 쪽이다 — 보고의 `needsDb` 에 적었다.
 */
import { routineNext, loadOf, saysOf, memoCovers, STOP } from "../../lib/routine.js";
import { areaMemos } from "../../lib/day.js";
import { testsToday, reportLines, failedToday, lateReasonText } from "../../lib/word.js";

/**
 * 오늘 수업하는 사람 — **반 명단은 `v2.class_roster()` 로만 읽는다** (자동 검사 ⑮).
 * 보강으로 오는 아이는 「그날 보강인가」(`v2.is_makeup_day`)로 붙는다 — 판에 안 적힌 값이다(0047).
 * ⚠️ 결석·지각 예정으로 판이 미리 선 아이도 **그대로 보인다.** 원장 화면에서는 빈 것도 보여야
 *    빠뜨린 것을 잡는다 (⑮ 3번).
 */
/**
 * **쓸 수 있나** — 규칙(RLS)이 열려 있어도 **권한(GRANT)이 없으면 아무것도 못 쓴다.**
 * 0005 가 그 함정을 적어 뒀다: 「규칙만 있고 권한이 없으면 아무도 못 본다 … **둘 다** 있어야 한다」.
 *
 * ⚠️ 실측 2026-09-02 — `authenticated` 는 `day_sheet`·`late_stay`·`quiz`·`unit_test` 에
 *    **SELECT 밖에 없다.** 정책은 `staff_all` 로 열려 있는데 권한이 없어서
 *    출결·마감·부모님 글·늦귀가가 **전부 permission denied** 로 막힌다(직접 돌려 봤다).
 *    → 화면이 이 값을 읽어 **못 하는 단추를 「할 수 있는 척」 하지 않는다.**
 *      목록을 글자로 박아 두면 권한이 들어온 날 화면만 옛말을 한다 — 그래서 **매번 물어본다**
 *      (`has_table_privilege` 는 조회 안에 얹히므로 왕복이 안 는다).
 */
const CAN_WRITE = `(select json_object_agg(t, json_build_object(
        'ins', has_table_privilege('v2.'||t, 'insert'),
        'upd', has_table_privilege('v2.'||t, 'update')))
     from unnest(array['day_sheet','day_item','late_stay','quiz','unit_test','progress','day_area_memo']) t)`;

const Q_ROSTER = `/* today:roster */
with t as (select coalesce($1::date, v2.today()) as d),
people as (
select to_char(t.d,'YYYY-MM-DD')        as on_date,
       to_char(v2.today(),'YYYY-MM-DD') as today,
       s.id as student_id, s.name, s.grade, s.state,
       cs.class_id, cs.start_time::text as start_time, cs.end_time::text as end_time,
       false as by_makeup,
       sh.id as sheet_id, sh.attend, sh.closed_at, sh.sent_at, sh.n as sheets,
       sh.checks, sh.checks_left
  from t
  join v2.class_schedule cs
    on cs.from_date <= t.d and (cs.to_date is null or cs.to_date >= t.d)
   and extract(dow from t.d)::int = any(cs.weekdays)
  cross join lateral v2.class_roster(cs.class_id, t.d) r
  join v2.students s on s.id = r.student_id
  left join lateral (
    select x.id, x.attend, x.closed_at, x.sent_at, count(*) over () as n,
           (select count(*)::int from v2.day_item i
             where i.sheet_id = x.id and i.slot = 'check') as checks,
           (select count(*)::int from v2.day_item i
             where i.sheet_id = x.id and i.slot = 'check'
               and (i.status is null or i.status = 'none')) as checks_left
      from v2.day_sheet x
     where x.student_id = s.id and x.date = t.d
     order by (x.class_id is not distinct from cs.class_id) desc
     limit 1) sh on true
union all
select to_char(t.d,'YYYY-MM-DD'), to_char(v2.today(),'YYYY-MM-DD'),
       s.id, s.name, s.grade, s.state,
       null::uuid, null, null, true,
       sh.id, sh.attend, sh.closed_at, sh.sent_at, sh.n, sh.checks, sh.checks_left
  from t
  join v2.students s on s.state = 'active' and v2.is_makeup_day(s.id, t.d)
  left join lateral (
    select x.id, x.attend, x.closed_at, x.sent_at, count(*) over () as n,
           (select count(*)::int from v2.day_item i
             where i.sheet_id = x.id and i.slot = 'check') as checks,
           (select count(*)::int from v2.day_item i
             where i.sheet_id = x.id and i.slot = 'check'
               and (i.status is null or i.status = 'none')) as checks_left
      from v2.day_sheet x where x.student_id = s.id and x.date = t.d limit 1) sh on true
)
select people.*, ${CAN_WRITE} as can_write from people order by 8 nulls last, 4`;

/**
 * 고른 아이의 **나머지 한 벌** — 판·줄·단어시험·클래스카드·단원평가·늦귀가·교재·분량을
 * **조회 한 번**에 받는다. 카드마다 따로 물으면 여덟 번이 된다 (§속도 1·2).
 *
 * ⚠️⚠️ **원장님만 볼 메모 칸은 여기서 안 읽는다.** 그 칸 이름은 `lib/close.js` 밖 어디에도
 *    못 나온다 — `scripts/check-close.mjs` 가 `app/`·`lib/` 전수를 훑어 막는다.
 *    까닭은 사고 #7 이다: 가리는 목록에서 **한 줄만 빠져도** 그 칸이 학부모 화면에 그대로 뜬다.
 *    → 원장 화면이 그 칸을 쓰려면 `lib/close.js` 에 **「원장에게만 주는 한 벌」이 먼저 서야** 한다.
 *      화면이 몰래 읽으면 그 방벽이 그날로 없어진다. 보고의 `notes` 에 적었다.
 * ⚠️ 진도율·멈춤·메모 연속은 **DB 함수가 센다.** JS 로 다시 세지 않는다 (원칙 5).
 */
const Q_ONE = `/* today:one */
select json_build_object(
 'student', (select json_build_object('id',s.id,'name',s.name,'grade',s.grade,'state',s.state)
               from v2.students s where s.id = $1::uuid),
 'sheets', (select coalesce(json_agg(json_build_object(
                'id',x.id,'class_id',x.class_id,'attend',x.attend,'closed_at',x.closed_at,
                'sent_at',x.sent_at,'comment',x.comment)
                order by x.created_at),'[]'::json)
              from v2.day_sheet x where x.student_id = $1::uuid and x.date = $2::date),
 'items', (select coalesce(json_agg(json_build_object(
                'id',i.id,'sheet_id',i.sheet_id,'slot',i.slot,'item_id',i.item_id,
                'unit_id',i.unit_id,'book_id',u.book_id,'book_name',b.name,'status',i.status,
                'range_note',i.range_note,'done_note',i.done_note,'memo',i.memo,'sort',i.sort,
                'name',li.name,'label',v2.unit_label(i.unit_id, true)) order by i.sort),'[]'::json)
              from v2.day_item i
              join v2.day_sheet x on x.id = i.sheet_id
              left join v2.units u on u.id = i.unit_id
              left join v2.books b on b.id = u.book_id
              left join v2.learn_items li on li.id = i.item_id
             where x.student_id = $1::uuid and x.date = $2::date),
 'cc', (select coalesce(json_agg(json_build_object(
                'set_name',p.set_name,'set_type',p.set_type,'complete',p.complete,
                'learn_status',p.learn_status,'cards',p.cards,'goals',p.goals,'got',p.got,
                'fetched_at',p.fetched_at) order by p.set_name),'[]'::json)
              from v2.cc_planner p where p.student_id = $1::uuid and p.date = $2::date),
 'cc_due',  (select exists(select 1 from v2.cc_due d where d.student_id = $1::uuid and d.date = $2::date)),
 'cc_rows', (select count(*)::int from v2.cc_planner),
 'cc_link', (select (i.config is not null) from v2.integration i where i.id = 'classcard'),
 'unit_tests', (select coalesce(json_agg(json_build_object(
                'id',ut.id,'topic',g.name,'assigned_on',ut.assigned_on,'taken_on',ut.taken_on,
                'q_count',ut.q_count,'correct',ut.correct,'state',ut.state)
                order by ut.created_at),'[]'::json)
              from v2.unit_test ut left join v2.grammar_topics g on g.id = ut.topic_id
             where ut.student_id = $1::uuid
               and (ut.taken_on = $2::date or ut.assigned_on = $2::date
                    or ut.state in ('todo','made'))),
 'topics', (select count(*)::int from v2.grammar_topics),
 'late', (select coalesce(json_agg(json_build_object(
                'id',l.id,'sheet_id',l.sheet_id,'reason',l.reason,'until_at',l.until_at,
                'left_at',l.left_at,'sent_at',l.sent_at)),'[]'::json)
              from v2.late_stay l join v2.day_sheet x on x.id = l.sheet_id
             where x.student_id = $1::uuid and x.date = $2::date),
 'books', (select coalesce(json_agg(json_build_object(
                'book_id',sb.book_id,'name',b.name,'area',b.area,'round',sb.round,
                'per_session',sb.per_session,
                'stop',v2.book_stop($1::uuid, sb.book_id, $2::date),
                'streak',v2.memo_only_streak($1::uuid, sb.book_id),
                'done',pr.done,'skipped',pr.skipped,'total',pr.total)
                order by b.area nulls last, b.name),'[]'::json)
              from v2.student_book sb
              join v2.books b on b.id = sb.book_id
              cross join lateral v2.book_progress($1::uuid, sb.book_id) pr
             where sb.student_id = $1::uuid and sb.from_date <= $2::date
               and (sb.to_date is null or sb.to_date >= $2::date)),
 'saved_load', (select row_to_json(l) from v2.today_load($1::uuid, $2::date) l),
 'samples', (select count(*)::int from v2.comment_sample),
 'end_time', (select max(cs.end_time)::text
                from v2.class_schedule cs
                cross join lateral v2.student_classes($1::uuid, $2::date) sc
               where cs.class_id = sc.class_id and cs.from_date <= $2::date
                 and (cs.to_date is null or cs.to_date >= $2::date))
) as j`;

/** ⚠️ 검사가 **진짜 스키마에 물어보게** 내보낸다 — 죽은 칸을 글자로 훑어서는 못 잡는다 */
export const SQL = Object.freeze({ roster: Q_ROSTER, one: Q_ONE });

/** 명단만. 아무도 안 골랐을 때는 **이것 하나로 끝난다** (조회 1) */
export async function loadRoster(db, on = null) {
  const { rows } = await db.query(Q_ROSTER, [on || null]);
  const today = rows[0]?.today ?? null;
  const onDate = rows[0]?.on_date ?? on ?? null;
  const canWrite = rows[0]?.can_write ?? {};
  const people = rows.map((r) => ({
    studentId: r.student_id, name: r.name, grade: r.grade, state: r.state,
    classId: r.class_id, startTime: r.start_time, endTime: r.end_time,
    byMakeup: r.by_makeup === true,
    sheetId: r.sheet_id, attend: r.attend, closedAt: r.closed_at, sentAt: r.sent_at,
    sheets: r.sheets ?? 0, checks: r.checks ?? 0, checksLeft: r.checks_left ?? 0,
  }));
  // ⚠️ 명단이 0줄이면 `can_write` 도 안 온다 — 그때는 **모른다.** 「쓸 수 있다」로 치지 않는다
  return { today, on: onDate, people, canWrite };
}

/**
 * 고른 아이 한 판.
 *
 * @param opt.adjust 교재마다 조절 (㉓) — `{ [bookId]: { count, pages, drop:[itemId] } }`
 * @param opt.memo   교재마다 메모 (⑨-a 4번) — `{ [bookId]: { class, home } }`
 *
 * ⚠️ `adjust`·`memo` 는 **아직 어디에도 저장 안 된다.** 주소줄에서 와서 초안을 다시 차릴 뿐이다 —
 *    「안 누르면 화면에 보이는 그대로 나간다」의 그 「보이는 그대로」를 만드는 자리다.
 */
export async function loadOne(db, { studentId, on, adjust = {}, memo = {} }) {
  const one = (await db.query(Q_ONE, [studentId, on])).rows[0]?.j ?? {};
  const sheets = one.sheets ?? [];
  const sheetId = sheets[0]?.id ?? null;

  // ⚠️ 초안은 **차려져서 온다.** 손으로 채우는 자리가 아니다 (⑨-a 1번 · 오류 36)
  const plan = await routineNext(db, { studentId, on, adjust, memo });

  // 단어시험 — 판정도 거르기도 SQL 이 한다. 여기서 세지 않는다
  const wordBooks = await testsToday(db, studentId, on);
  const wordLines = sheetId ? await reportLines(db, sheetId) : [];
  // 영역 메모 — **판이 서 있어야 적을 수 있다**(판에 매달린 줄이다). 판이 없으면 빈 것으로 준다
  const areaMemo = sheetId ? await areaMemos(db, sheetId) : {};
  const failed = sheetId ? await failedToday(db, sheetId) : [];

  return {
    one, sheets, sheetId, plan, areaMemo,
    // `plan.load`·`plan.says` 는 routineNext 가 이미 붙여 준다. 없을 때만 다시 부른다
    load: plan.load ?? loadOf(plan),
    says: plan.says ?? saysOf(plan),
    word: { books: wordBooks, lines: wordLines, failed, reason: lateReasonText(failed) },
    // 메모로 대신한 교재는 마감이 무엇을 올리나 — **그 교재만** (㊳)
    memoRaise: (plan.books ?? [])
      .filter((b) => b.stopMode !== STOP.BOOK_OFF)
      .map((b) => ({ bookId: b.bookId, name: b.name, units: memoCovers(plan, b.bookId) }))
      .filter((x) => x.units.length),
  };
}
