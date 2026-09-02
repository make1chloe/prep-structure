/**
 * 월간 리포트 — 한 달치를 모아 학부모에게. (계획 3단계)
 *
 * 판단은 **여기 한 곳**. 화면(`app/`)은 받아서 그리기만 한다.
 *
 * 이 파일이 지키는 것 넷 — 하나라도 빠지면 그 자리가 사고다.
 *
 *  ① **재료는 마감한 판만** (수업에서 나오는 것 — 숙제 성취도 · 단어 통과 · 수업 내용).
 *     안 마감한 판이 섞이면 **학부모가 아직 못 본 것이 리포트에 실린다.**
 *     ⚠️ 단 **출결은 다르다** — 계획 「학부모 화면」 표에서 출결·달력은 **마감과 무관하게 자동**이다.
 *        출결까지 마감한 판으로만 세면 **달력에 보이는 날 수와 리포트 숫자가 어긋난다.**
 *        그래서 줄마다 `from` 에 「어디서 나온 값인가」를 적어 내보낸다 — 숨기지 않는다.
 *
 *  ② **보낼 때 그때 나간 글을 굳힌다** (`monthly_report.frozen`).
 *     나중에 점수를 고쳐도 이미 보낸 글은 안 바뀐다. 안 굳히면
 *     **「보낸 것과 지금 보이는 것이 다르다」**가 되고, 그때는 어느 쪽이 맞는지 아무도 못 가린다.
 *     ⚠️ 그리고 `frozen` 은 접근 규칙상 **학부모가 그대로 읽는다**
 *        (`0031_missing.sql` 의 `own_mr` — `sent_at is not null` 이면 그 줄 전체가 보인다).
 *        → **원장만 볼 것을 `frozen` 에 담으면 그 순간 샌다.** `forFamily()` 를 지난 것만 굳힌다.
 *
 *  ③ **값이 없으면 그 줄을 안 낸다** (원장님 확정: 「값 입력 안 하면 리포트 출력하지 말고」).
 *     **0% 로 치지 않는다 — 「안 봤다」와 「0점」은 다르다.**
 *     안 낸 줄은 사라지지 않고 `hidden` 에 까닭과 함께 남는다(원장 화면용).
 *
 *  ④ **숫자는 전부 세어 나온다**(원칙 5). 여기서 다시 세지 않고 **이미 있는 한 벌을 부른다** —
 *     회차 `lib/session.js` · 출결 `lib/attend.js` · 단어 `lib/word.js` · 진도 `v2.book_progress()`.
 *
 * ⚠️ **성장 리포트 자동 문장은 만들지 않는다.** 재료가 반쯤 차면
 *    「평균 수준을 유지하고 있습니다」 같은 글이 **근거 없이** 나간다.
 *    이 파일은 **숫자만** 낸다. 글(`body`)은 원장님이 쓰신 것만 싣는다 (계획 「성장 리포트는 조건부다」).
 *
 * ⚠️ 발송은 `lib/notify.js` 한 곳을 지난다. 직접 쏘면 `scripts/check-notify.mjs` 가 깨진다.
 *
 * DB 는 `{ query(sql, params) -> { rows } }` 만 받는 얕은 어댑터다 (pg 든 supabase 든).
 * 검사가 가짜 DB 를 끼울 수 있어야 하므로 여기서 직접 붙지 않는다.
 * ⚠️ SQL 안에 `${…}` 를 끼워 넣지 마라 — 끼우면 `scripts/check-sql.mjs` 가 진짜 스키마에
 *    물어볼 수가 없어 **없는 칸을 읽는 SQL 이 초록으로 지나간다.** 값은 전부 $1·$2 로.
 */

import { monthRange, studentSessions } from "./session.js";
import { countAttend } from "./attend.js";
import { reportLines } from "./word.js";
import { notify } from "./notify.js";

// ────────────────────────────────────────────────────────────────
// 굳은 말 — 화면이 글자가 아니라 이 코드로 판단한다
// ────────────────────────────────────────────────────────────────

/** 굳힌 판의 모양 번호. ⚠️ 모양을 바꾸면 **올린다** — 안 올리면 옛 굳은 글을 새 모양으로 읽어 터진다
 *  2 (2026-09-02) — 회차 줄에 `done`·`planned`·`upto` 가 붙었다 (출결과 같은 말로 밝힌다) */
export const FROZEN_V = 2;

/** 알림 tag — 옛 서비스워커가 이 모양을 읽는다 (docs/서비스워커-계약서 ②: `monthly-2026-09`).
 *  ⚠️ 갈래마다 달라야 한다. 같은 tag 는 앞엣것을 덮어쓴다.
 *     아이 붙이기는 `notify.pushPayload` 가 한다 — 여기서 또 붙이면 두 벌이 된다 */
export const monthlyTag = (ym) => `monthly-${ym}`;

/**
 * ⭐ **학부모에게 나가는 칸은 「흰 목록」이다** — 검은 목록이 아니다.
 *
 * ⚠️ 검은 목록(「이것만 빼기」)이면 **새 칸을 더할 때마다 저절로 새어 나간다.**
 *    더한 사람이 목록에 적는 것을 잊으면 그날 학부모 화면에 뜨고, 오류는 안 난다.
 *    실제로 이 파일을 처음 쓸 때 `closedSheets` 한 칸이 그렇게 빠져 있었다
 *    (일부러 깨 보다가 잡았다 — 검사도 같은 목록을 보고 있어 못 잡았다).
 *    → **흰 목록은 반대로 실패한다.** 잊으면 안 나가고, 그건 사고가 아니라 빈 칸이다.
 *
 * ⚠️ `frozen` 은 접근 규칙상 학부모가 **그 줄 전체를 읽는다**(0031 `own_mr`).
 *    그래서 여기 없는 칸은 **굳히지도 않는다.**
 */
export const FAMILY_KEYS = Object.freeze([
  "studentId", "ym", "monthLabel", "first", "last", "lines", "body",
]);
// ⚠️ `sentAt` 은 **일부러 뺐다.** 굳히는 때는 아직 `sent_at` 이 비어 있어서
//    굳은 것에 넣으면 `null` 이 굳고, 되읽을 때 그 `null` 이 진짜 칸을 덮어
//    **학부모 화면에서 「보낸 때」가 사라진다.** 보낸 때는 칸에서 읽는다 (원칙 1 — 두 벌 금지)

/** ⚠️ **원장만 보는 칸** — 여기 있는 이름이 `FAMILY_KEYS` 에 섞이면 그 순간 샌다.
 *  「안 마감한 판 12개」·「왜 그 줄을 안 냈나」가 학부모 화면에 그대로 뜬다.
 *  `forFamily()` 는 이 목록을 **안 본다** — 흰 목록이 막는다. 이건 사람이 읽는 표시이고,
 *  `scripts/check-monthly.mjs` 가 **두 목록이 안 겹치는지**를 본다. */
export const STAFF_ONLY = Object.freeze([
  "hidden", "openSheets", "closedSheets", "sheets", "asks", "mustAsk", "why", "ready", "today",
]);

/** 물음 코드 — 마감(`closeGate`)과 같은 결이다. **막지 않는다. 묻는다.** */
export const ASK = Object.freeze({
  OPEN_SHEETS: "open_sheets",     // ⚠️ 반드시 묻는 것
  NO_LINES: "no_lines",           // ⚠️ 반드시 묻는 것
  MONTH_OPEN: "month_open",       // ⚠️ 반드시 묻는 것 — 아직 안 끝난 달
  NO_BODY: "no_body",
  NOT_COUNTABLE: "not_countable",
  ROSTER_LATE: "roster_late",
  ALREADY_SENT: "already_sent",
});

const ask = (code, what, why, must = false, extra = {}) => ({ code, what, why, must, ...extra });

/** 「2026-08」 → 「2026년 8월」. 알림 제목에 쓴다 */
export function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ""));
  if (!m) throw new Error(`달이 'YYYY-MM' 이 아니다: ${JSON.stringify(ym)}`);
  return `${m[1]}년 ${Number(m[2])}월`;
}

/**
 * ⚠️ `monthly_report.ym` 은 `char(7)` 이고 **모양 제약이 없다**(실측 2026-09-02).
 *    '2026-9' 를 그대로 넣으면 `'2026-9 '` 로 **빈칸이 붙어 저장**되고,
 *    다음 달에 '2026-09' 로 찾으면 **못 찾아 같은 달 리포트가 두 줄**이 된다.
 *    → 쓰는 자리마다 이걸 지난다.
 */
export function assertYm(ym) {
  monthRange(ym);                       // 모양이 틀리면 여기서 던진다 (session.js 한 벌)
  return ym;
}

// ────────────────────────────────────────────────────────────────
// SQL — 값은 전부 $1·$2. `${…}` 를 끼우지 않는다
// 앞머리 주석(/* monthly:… */)은 **가짜 DB 가 붙잡는 손잡이**다. 지우지 마라
// ────────────────────────────────────────────────────────────────

/** 그 달 판 — 마감한 것과 **안 한 것을 같이** 센다. 안 한 것을 안 세면 원장님이 못 알아챈다.
 *  ⚠️ 그날 글(`comment`)은 **안 읽는다.** 월간 리포트에 쓰지 않는 값이라
 *     끌고 오면 언젠가 화면에 그려지고, 그건 마감 전 가리기(`close.js`)를 지나지 않은 글이다 */
const SQL_SHEETS = `/* monthly:sheets */
select s.id, s.date::text as date, s.attend, s.class_id, s.closed_at
  from v2.day_sheet s
 where s.student_id = $1::uuid and s.date >= $2::date and s.date <= $3::date
 order by s.date`;

/** 숙제 검사 ○△✕ — **마감한 판만**. `slot='check'` 가 「집에서 해온 것」이다 */
const SQL_CHECK = `/* monthly:check */
select i.status, count(*)::int as n
  from v2.day_item i
  join v2.day_sheet s on s.id = i.sheet_id
 where s.student_id = $1::uuid and s.date >= $2::date and s.date <= $3::date
   and s.closed_at is not null
   and i.slot = 'check' and i.status is not null and i.status not in ('none', 'inclass')
 group by i.status`;
// ⚠️ `inclass` 를 여기서 뺀다 — 이 줄은 「집에서 해온 것」이 아니라 **학원에서 한 것**이다(0048 이관값).
//    앞서는 `<> 'none'` 만 걸러 `inclass` 가 그대로 넘어왔고, `homeworkOf` 의 칸이 셋뿐이라
//    **조용히 사라졌다** — 10개 중 1개만 해온 아이가 「숙제 성취도 100%」로 굳어 나갔다.
//    `lib/progress.js` 도 'none' 과 'inclass' 를 같이 버린다. 같은 값을 두 파일이 다르게 보면 안 된다

/** 그 달에 배정돼 있던 교재 — 진도 줄을 세울 후보. 배정 기간이 그 달에 걸치면 든다.
 *  ⚠️ `b.state` 를 **거르지 않고 들고 온다.** 앞서는 `and b.state = 'active'` 로 잘랐는데,
 *     그러면 오늘 멈춘 교재가 **지난 달 리포트에서 소리 없이 사라진다**(대전제 6 —
 *     상태로 내린 것이 과거 기록에서 없어지면 안 된다). 실측 8월에 걸친 배정 41줄·13명이
 *     그렇게 잘렸고 `hidden` 에 한 줄도 안 남았다. 지금은 자르는 자리를 아래 `buildReport` 로 옮겨
 *     **까닭과 함께 `hidden` 에 남긴다.** 학부모에게 나가는 것은 그대로 안 나간다 */
const SQL_BOOKS = `/* monthly:books */
select sb.book_id, b.name as book_name, sb.round, b.state as book_state
  from v2.student_book sb
  join v2.books b on b.id = sb.book_id
 where sb.student_id = $1::uuid
   and sb.from_date <= $3::date and (sb.to_date is null or sb.to_date >= $2::date)
 order by b.name`;

/**
 * 진도율 — **세지 않는다. 부른다.** (done, skipped, total) 셋이다 (0052).
 * 교재를 **배열로 한 번에** 묻는다 — 앞서는 교재마다 한 왕복이라 8권이면 8단 직렬이었다.
 *
 * ⚠️⚠️ **거짓 0% 를 여기서 막는다.** `v2.book_progress()` 는 배정 줄을 `v2.today()` 로 고르는데,
 *    그 달에 배정이 끝난 교재는 오늘 기준 줄이 없어 **`done=0 · total=단원수`** 를 돌려준다.
 *    그 0 은 「안 봤다」이지 「0% 했다」가 아니다. 실측 — 8월 리포트에서 재원생 25명 중 17명 ·
 *    교재 61권이 0% 로 나갔고, 그중엔 **76단원을 다 끝낸 교재**도 있었다. 굳으면 못 고친다.
 *
 *    그래서 두 가지를 같이 묻는다 (**진도를 다시 세는 것이 아니다** — 「그 함수가 무엇을 셌나」를 되묻는다):
 *      · `today_round` — `book_progress` 가 고를 배정 줄의 회독. `null` 이거나 그 달 회독과
 *        다르면 그 함수의 답은 **이 달 이야기가 아니다.**
 *      · `marks` — 그 달 회독으로 찍힌 `v2.progress` 줄 수. 0 이면 **한 번도 안 봤다**(0% 가 아니다).
 *    ⚠️ needsDb ① 의 `v2.book_progress_on(학생, 교재, 날짜)` 가 서면 되묻기를 통째로 지우고
 *       그 달 마지막날을 넘겨 **진짜 그때 진도**를 싣는다. 그때까지는 못 믿는 줄을 안 낸다
 */
const SQL_PROGRESS = `/* monthly:progress */
select b.book_id, p.done, p.skipped, p.total,
       (select sb.round from v2.student_book sb
         where sb.student_id = $1::uuid and sb.book_id = b.book_id
           and sb.from_date <= v2.today()
           and (sb.to_date is null or sb.to_date >= v2.today())
         order by sb.from_date desc limit 1) as today_round,
       (select count(*)::int from v2.progress pr
          join v2.units u on u.id = pr.unit_id
         where pr.student_id = $1::uuid and u.book_id = b.book_id and pr.round = b.round) as marks
  from unnest($2::uuid[], $3::int[]) as b(book_id, round)
  cross join lateral v2.book_progress($1::uuid, b.book_id) p`;

/**
 * 반 명단을 **언제 물어도 `v2.student_classes()` 를 지난다** (자동 검사 ⑮).
 * ⚠️ 명단 표를 직접 읽지 마라 — `scripts/check-session.mjs` 가 그 자리에서 잡는다.
 *    명단은 **기간이 있는 표**라 직접 읽으면 「이 날 이 아이가 이 반이었나」를 저마다 다르게 판단하게 된다.
 * `at_first` 달 첫날에 반이 있었나 · `at_now` 오늘 반이 있나 (아래 `countableOf`)
 *
 * ⚠️ `came_before` — **이 달 앞에 이미 이 아이 판이 있었나.**
 *    이관은 반 명단 시작일을 **이관일로 박기 때문에** 이관일이 든 달에는 달 첫날 명단이 원래 없다.
 *    그것만 보고 「달 중간부터 다닌 달」이라 말하면 **3년째 다니는 아이의 학부모가**
 *    「우리 애가 9월 중간에 들어왔다고?」를 읽는다. 실측 — 재원생 25명 중 20명이 이 자리를 밟았다.
 *    그 앞에 판이 이미 있으면 그건 **기록이 늦게 시작한 자국**이지 중간 입회가 아니다.
 *    (판을 세지 않고 `exists` 로 묻는다 — 몇 개인지는 안 궁금하고, 옛 판이 쌓여도 안 느려진다)
 */
const SQL_ROSTER_ON = `/* monthly:rosterOn */
select (select count(*)::int from v2.student_classes($1::uuid, $2::date))   as at_first,
       (select count(*)::int from v2.student_classes($1::uuid, v2.today())) as at_now,
       (select exists(select 1 from v2.day_sheet ds
                       where ds.student_id = $1::uuid and ds.date < $2::date)) as came_before`;

/** 그 아이의 학부모 — 알림을 받을 사람. **원장이 아니라 학부모다** */
const SQL_PARENTS = `/* monthly:parents */
select p.id as profile_id, p.role
  from v2.parent_student ps
  join v2.profiles p on p.id = ps.parent_profile_id
 where ps.student_id = $1::uuid and p.state = 'active'`;

/** 그 아이 그 달 리포트 한 줄 */
const SQL_ONE = `/* monthly:one */
select id, student_id, ym, body, frozen, sent_at, created_at
  from v2.monthly_report where student_id = $1::uuid and ym = $2::char(7)`;

/** 초안 — ⚠️ **보낸 뒤에는 안 고친다.** `where … sent_at is null` 이 그 방벽이다.
 *  0줄로 돌아오면 「이미 보냈다」이고, 화면은 그걸 **성공이라 말하면 안 된다** */
const SQL_DRAFT = `/* monthly:draft */
insert into v2.monthly_report (student_id, ym, body)
values ($1::uuid, $2::char(7), $3)
on conflict (student_id, ym) do update set body = excluded.body
 where monthly_report.sent_at is null
returning id, body, sent_at`;

/** ⭐ **보낼 때 굳힌다.** 한 번만 굳는다 — `where … sent_at is null` 이라 두 번 눌러도 안 덮인다.
 *  ⚠️ 0줄이면 **이미 보낸 것**이다. 그때는 알림도 안 쏜다(아래 `sendMonthly`) —
 *     안 그러면 같은 달 리포트가 학부모 폰에 두 번 뜬다 */
const SQL_FREEZE = `/* monthly:freeze */
insert into v2.monthly_report (student_id, ym, body, frozen, sent_at)
values ($1::uuid, $2::char(7), $3, $4::jsonb, coalesce($5::timestamptz, now()))
on conflict (student_id, ym) do update
   set body = coalesce(excluded.body, monthly_report.body),
       frozen = excluded.frozen,
       sent_at = excluded.sent_at
 where monthly_report.sent_at is null
returning id, body, frozen, sent_at`;

/**
 * ⭐ **굳었는데 아무에게도 안 간 것을 도로 내린다** (대전제 6 — 지우지 않고 상태로 내린다).
 *
 * ⚠️ 굳히기와 알림은 **한 트랜잭션이 아니다.** 알림이 터지면 리포트는 굳은 채로 남고
 *    학부모 폰엔 한 통도 안 갔는데 다시 누르면 `already_sent` 다 — 그 아이의 그 달은 거기서 끝난다.
 *    그래서 되돌릴 길을 **여기 한 곳**에 둔다. `lib/close.js` 의 `reopenSheet()` 와 같은 결이다.
 *
 * ⚠️ **`frozen` 은 안 지운다.** 「그때 무엇이 굳었나」가 자취다 — 지우면 못 되짚는다.
 *    `sent_at` 만 비우면 접근 규칙(`own_mr` 은 `sent_at is not null` 을 요구한다)에 막혀
 *    **학부모에게는 그 순간 안 보인다.** 다시 보내면 `SQL_FREEZE` 가 새 것으로 덮는다.
 * ⚠️ `$3` 는 「내가 방금 박은 그 시각」이다 — 주면 **그 줄만** 내린다.
 *    안 주면 무엇이든 내리므로, 다른 창에서 제대로 보낸 것을 덮어 내릴 수 있다.
 * ⚠️⚠️ **`sent_at = $3` 로 맞대면 안 된다.** `now()` 는 마이크로초까지 박히는데
 *    node-pg 는 그 칸을 **밀리초짜리 JS Date** 로 준다 — 되돌려 넣으면 뒤 세 자리가 잘려
 *    **한 줄도 안 걸리고 「못 내렸다」가 된다.** 진짜 DB 검사가 이 자리에서 한 번 잡았다
 *    (가짜 DB 는 글자로 들고 있어 그냥 지나갔다). 그래서 **밀리초로 깎아 맞댄다**
 */
const SQL_REOPEN = `/* monthly:reopen */
update v2.monthly_report
   set sent_at = null
 where student_id = $1::uuid and ym = $2::char(7)
   and sent_at is not null
   and ($3::timestamptz is null
        or date_trunc('milliseconds', sent_at) = date_trunc('milliseconds', $3::timestamptz))
returning id, (frozen is not null) as had_frozen`;

/**
 * ⭐ **안 보낸 학생을 세어 준다** (대전제 3 — 학생을 하나씩 열지 않는다).
 * 한 질의로 학생마다 「보냈나 · 판 몇 개 · 그중 마감 몇 개」가 나온다.
 */
const SQL_BOARD = `/* monthly:board */
select st.id as student_id, st.name,
       mr.sent_at, (mr.body is not null) as has_body,
       count(s.id)::int as sheets,
       count(s.id) filter (where s.closed_at is not null)::int as closed
  from v2.students st
  left join v2.monthly_report mr on mr.student_id = st.id and mr.ym = $1::char(7)
  left join v2.day_sheet s on s.student_id = st.id
       and s.date >= $2::date and s.date <= $3::date
 where st.state = 'active'
 group by st.id, st.name, mr.sent_at, mr.body
 order by st.name`;

// ────────────────────────────────────────────────────────────────
// 셈 — 순수 함수. DB 없이 검사할 수 있다
// ────────────────────────────────────────────────────────────────

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const has = (v) => String(v ?? "").trim() !== "";

/** 백분율. ⚠️ 분모가 0 이거나 없으면 **0 이 아니라 `null`** 이다 — 「안 봤다」와 「0점」은 다르다 */
export function pct(part, whole) {
  const a = num(part), b = num(whole);
  if (a === null || b === null || b === 0) return null;
  return Math.round((a / b) * 100);
}

/**
 * ⚠️ **이관일 이전 달은 회차를 못 맞춘다.**
 *    반 명단의 시작일을 이관일로 박기 때문에 그 이전 달에는
 *    **그 아이가 어느 반이었는지가 아예 없다.** 실측 2026-09-02 — 23명이 2026-09-02 부터고,
 *    가장 이른 줄도 2026-03-01 이다. 그런데 판(`day_sheet`)은 **2025-05-29** 부터 있다.
 *    → 그 달을 그냥 세면 **회차 0회**가 나오고, 0 < 8 이라 **모든 아이가 「모자람」으로 빨갛게** 뜬다.
 *      원장님이 헛보강을 잡는다. 그래서 0 을 내지 않고 **「셀 수 없음」으로 밝힌다**(대전제 0).
 *
 * ⚠️ 「반이 없다」와 「그 달에만 없다」를 가른다 —
 *    **지금은 반이 있는데 그 달에만 없으면** 그건 퇴원이 아니라 **이관 자국**이다.
 *
 * ⚠️⚠️ **「달 첫날 명단이 없다」와 「달 중간부터 다녔다」는 다른 말이다.**
 *    이관은 반 명단 시작일을 **이관일로 박기 때문에** 이관일이 든 달에는 달 첫날 명단이 원래 없다.
 *    앞서는 `atFirst === 0` 이면 조건 없이 「달 중간부터 다닌 달」로 보았고, 그 문구가
 *    `lines` 에 실려 **그대로 굳어 학부모가 읽었다.** 실측 2026-09 — 재원생 25명 중 **20명**이
 *    이 자리를 밟았고 전부 계속 다니던 아이였다.
 *    → **그 달 앞에 이미 이 아이 판이 있으면**(`cameBefore`) 그건 기록이 늦게 시작한 자국이다.
 *      학부모에게 아무 말도 안 하고(`partial:false`), 원장님께만 `why` 로 남긴다 (대전제 0).
 *
 * @param inMonth     그 달 하루라도 소속돼 있던 반 수 (`studentSessions().byClass.length`)
 * @param atFirst     달 **첫날**에 소속돼 있던 반 수
 * @param atNow       **오늘** 소속돼 있는 반 수
 * @param cameBefore  그 달 **앞에** 이 아이 판(`day_sheet`)이 이미 있었나
 * @returns { countable, partial, rosterLate, why }
 */
export function countableOf({ inMonth = 0, atFirst = 0, atNow = 0, cameBefore = false } = {}) {
  if (inMonth === 0 && atNow > 0)
    return { countable: false, partial: false, rosterLate: false,
             why: "⚠️ 그 달엔 반 명단 기간이 없다 (지금은 반이 있다) — 이관일 이전 달이라 회차를 셀 수 없다" };
  if (inMonth === 0)
    return { countable: false, partial: false, rosterLate: false,
             why: "⚠️ 반 명단 줄이 하나도 없다 — 회차를 셀 수 없다" };
  if (atFirst === 0 && cameBefore)
    // ⚠️ 세기는 세되 **학부모에게는 아무 말도 안 한다.** 명단이 늦게 시작해서 회차가
    //    실제보다 적을 수 있다는 것은 원장님만 아시면 된다 — 안 그러면 거짓말이 굳는다
    return { countable: true, partial: false, rosterLate: true,
             why: "⚠️ 반 명단이 달 중간부터인데 그 앞에 이 아이 판이 이미 있다 — 이관 자국이지 중간 입회가 아니다. "
                + "명단 앞의 수업 날은 안 세었으므로 **회차가 실제보다 적을 수 있다**" };
  if (atFirst === 0)
    return { countable: true, partial: true, rosterLate: false,
             why: "⚠️ 반 명단이 달 중간부터다 — 달의 앞부분은 안 세었다" };
  return { countable: true, partial: false, rosterLate: false, why: null };
}

/**
 * 숙제 성취도 — ○△✕ 를 세어 「○ 비율」을 낸다.
 *
 * ⚠️ **찍은 것이 하나도 없으면 `null`** 이다. 0% 가 아니다.
 * ⚠️ **확인 안 됨** — △(하는 중)를 반 점으로 칠지 원장님께 안 여쭸다.
 *    지어내지 않고 **○ 만 분자에 넣고**, ○·△·✕ 개수를 그대로 같이 내보낸다.
 *    화면이 셋을 다 띄우므로 「○ 비율」이 무엇인지가 학부모에게도 드러난다.
 *
 * ⚠️⚠️ **모르는 표시를 조용히 버리지 않는다.** 앞서는 칸이 셋뿐이라 그 밖의 값이
 *    분자에서도 분모에서도 사라졌다 — `{done:1, inclass:9}` 가 **「성취도 100%」**로 나갔다.
 *    (`day_item_status_check` 는 `inclass` 를 허락한다 — 실측 0011·0048.)
 *    지금은 `unknown` 에 담아 돌려준다. 부르는 쪽이 `hidden` 에 남긴다 — 조용히 버리면
 *    이번처럼 **검사도 못 잡는다.** (`inclass` 는 SQL 이 이미 걸러 여기까지 안 온다)
 */
export function homeworkOf(rows = []) {
  const c = { done: 0, weak: 0, missing: 0 };
  const unknown = [];
  for (const r of rows) {
    const k = r.status;
    if (k === "done" || k === "weak" || k === "missing") c[k] += Number(r.n ?? 0);
    else unknown.push({ status: k ?? null, n: Number(r.n ?? 0) });
  }
  const total = c.done + c.weak + c.missing;
  return { ...c, total, donePct: pct(c.done, total), unknown };
}

/**
 * 출석률 — **판이 선 날**이 분모다.
 * ⚠️ 휴강(`off`)은 분모에서 뺀다. 학원이 안 열린 날을 결석처럼 세면 출석률이 조용히 깎인다.
 * ⚠️ **확인 안 됨** — 지각을 출석으로 셀지 원장님께 안 여쭸다. 지금은 **왔으니 출석**으로 세고,
 *    지각 수를 그대로 같이 내보낸다(감추지 않는다).
 */
export function attendOf(all = {}) {
  const present = Number(all.present ?? 0), late = Number(all.late ?? 0), absent = Number(all.absent ?? 0);
  const days = present + late + absent;
  return { present, late, absent, off: Number(all.off ?? 0), days, pct: pct(present + late, days) };
}

// ────────────────────────────────────────────────────────────────
// 짓는다 — 재료를 모아 줄로
// ────────────────────────────────────────────────────────────────

/**
 * 그 아이 그 달 리포트를 **지어 본다.** 아직 아무것도 저장하지 않는다.
 *
 * @param opts.today  'YYYY-MM-DD' — 안 주면 DB 의 `v2.today()` (session/attend 한 벌이 읽는다)
 * @returns {{
 *   studentId, ym, monthLabel, first, last,
 *   lines:   [{key, label, from, ...값}]   ← 학부모에게 나갈 줄. **값이 있는 것만**
 *   hidden:  [{key, why}]                  ← 왜 안 냈나 (⚠️ 원장 화면용 — 학부모에게 안 내려간다)
 *   openSheets, closedSheets, sheets,      ← ⚠️ 원장 화면용
 *   body                                   ← 원장님이 쓰신 글. **앱이 짓지 않는다**
 * }}
 */
export async function buildReport(db, studentId, ym, opts = {}) {
  if (!studentId) throw new Error("학생이 없다");
  assertYm(ym);
  const { first, last } = monthRange(ym);

  const lines = [];
  const hidden = [];
  const drop = (key, why) => hidden.push({ key, why });

  // ── 재료 넷을 **한꺼번에** 부른다 ────────────────────────────
  //    ⚠️ 서로 안 기다리는 것들이다 — 앞서는 하나씩 await 이라 직렬 단이 그만큼 깊었다
  //       (계획 「속도」 표: `/report` 조회 6 · 2단). 차례는 아래 `lines.push` 가 정한다
  const [sheetRes, at, ss, onRes] = await Promise.all([
    db.query(SQL_SHEETS, [studentId, first, last]),
    // ⚠️ `lib/attend.js` 한 벌을 부른다. 여기서 다시 세면 달력과 두 벌이 되어 언젠가 어긋난다
    countAttend(db, { studentId, from: first, to: last, today: opts.today ?? null }),
    // ⚠️ 반 명단은 여기서도 `v2.student_classes()` 만 지난다 (자동 검사 ⑮)
    studentSessions(db, studentId, ym, { today: opts.today ?? undefined }),
    db.query(SQL_ROSTER_ON, [studentId, first]),
  ]);
  // ── 판 — 마감한 것과 안 한 것 ────────────────────────────────
  const sheets = sheetRes.rows ?? [];
  const closed = sheets.filter((s) => s.closed_at);
  const today = ss.today ?? opts.today ?? null;

  // ── ① 출결 — **마감과 무관하다.** 학부모 달력이 이미 이 값을 보고 있다
  //    (계획 「학부모 화면 — 자동으로 가는 것과 눌러야 가는 것」: 출결·달력은 자동)
  const a = attendOf(at.all);
  if (a.days > 0) {
    lines.push({
      // ⚠️ `from` 은 **학부모가 그대로 읽는 글자다**(굳은 것 = 학부모 값).
      //    함수 이름·⚠️ 같은 안쪽 말을 여기 적지 마라 — 그대로 학부모 화면에 뜬다.
      //    안쪽 사정은 코드 주석과 `hidden` 에만 적는다
      key: "attend", label: "출결", from: "출결 기록 (달력과 같은 값)",
      days: a.days, present: a.present, late: a.late, absent: a.absent, pct: a.pct,
      // ⚠️ 달 중간이면 앞날은 안 세었다. 밝히지 않으면 학부모가 「수업일수가 왜 적나」로 읽는다
      upto: at.cut ? at.upto : null,
    });
  } else {
    drop("attend", "그 달에 판이 하나도 없다 — 출결을 셀 수 없다");
  }

  // ── ② 회차 — `lib/session.js` 한 벌. ⚠️ 이관일 이전 달은 「셀 수 없음」
  const on = onRes.rows?.[0] ?? {};
  const cf = countableOf({ inMonth: ss.byClass.length,
                           atFirst: Number(on.at_first ?? 0), atNow: Number(on.at_now ?? 0),
                           cameBefore: on.came_before === true });
  // ⚠️ 「이관 자국」은 세기는 세되 학부모에게 말하지 않는다 — 원장님께만 남긴다.
  //    키를 `sessions` 로 하면 안 된다 — `sendGate` 가 그 키를 「회차 줄이 빠졌다」로 읽는다
  if (cf.rosterLate) drop("sessions:note", cf.why);
  // ⚠️ 회차는 달 전체(앞날 포함)인데 출결은 오늘까지다. 앞서는 회차 줄에 그 표시가 없어
  //    학부모가 「출결 4일 · 수업 회차 9회」를 나란히 읽고 「9회 중 4일만 왔나」로 보았다.
  //    출결과 **같은 말로** 갈라 싣는다 (`lib/session.js` 가 이미 done·planned 로 갈라 준다)
  const mkDone = ss.makeupDates.filter((d) => !today || d <= today).length;
  const sDone = ss.byClass.reduce((acc, c) => acc + c.done, 0) + mkDone;
  const sPlanned = ss.byClass.reduce((acc, c) => acc + c.planned, 0) + (ss.makeupDates.length - mkDone);
  if (!cf.countable) {
    drop("sessions", cf.why);
  } else if (ss.total > 0) {
    lines.push({
      // ⚠️ **반별 8회 판정은 여기서 안 낸다.** 그건 일정 화면(`session.js` 의 `monthBoard`)의 몫이고,
      //    여기서 또 내면 두 벌이 되어 언젠가 두 화면의 숫자가 어긋난다(원칙 1).
      //    굳은 것은 학부모가 그대로 읽으므로 반 번호를 실을 자리도 아니다
      key: "sessions", label: "수업 회차", from: "반 요일과 달력에서 (휴강 뺌)",
      total: ss.total, makeup: ss.makeupDates.length,
      done: sDone, planned: sPlanned,
      // ⚠️ 아직 안 지난 날이 섞였으면 출결과 같이 「어디까지인가」를 밝힌다
      upto: sPlanned > 0 ? today : null,
      // ⚠️ 달의 앞부분을 못 센 달은 그렇다고 밝힌다 — 안 밝히면 「회차가 왜 적나」가 된다.
      //    **학부모가 읽을 말로 적는다** (안쪽 까닭은 `cf.why` 에 그대로 있고 그건 안 나간다).
      //    ⚠️ 이관 자국은 여기 안 온다 — `countableOf` 가 `partial` 을 안 세운다
      partial: cf.partial ? "달 중간부터 다닌 달이라 앞부분은 세지 않았습니다" : null,
    });
  } else {
    drop("sessions", "그 달에 이 아이의 수업 날이 없다");
  }

  // ── ③ 숙제 성취도 — **마감한 판만** ─────────────────────────
  if (closed.length === 0) {
    drop("homework", `⚠️ 마감한 판이 없다 — 숙제 성취도를 안 낸다 (그 달 판 ${sheets.length}개가 전부 안 마감)`);
  } else {
    const { unknown, ...hw } = homeworkOf((await db.query(SQL_CHECK, [studentId, first, last])).rows ?? []);
    // ⚠️ 모르는 표시는 **조용히 안 버린다.** 버리면 분모가 줄어 성취도가 부풀고, 검사도 못 잡는다
    if (unknown.length)
      drop("homework:모르는표시",
           `⚠️ 이 앱이 모르는 숙제 표시가 있다 — 성취도에서 뺐다: ${unknown.map((u) => `${u.status}×${u.n}`).join(", ")}`);
    if (hw.total > 0 && hw.donePct !== null) {
      lines.push({ key: "homework", label: "숙제 성취도", from: "마감한 수업만",
                   ...hw, ofSheets: closed.length });
    } else {
      drop("homework", "마감한 판에 ○△✕ 를 찍은 줄이 없다 — 0% 로 치지 않는다");
    }
  }

  // ── ④ 단어·문장 시험 — **마감한 판만**, `lib/word.js` 한 벌 ──
  //    ⚠️ 개수를 안 적은 시험은 `lib/word.js` 가 애초에 줄을 안 준다(0039).
  //       그래서 여기서 「안 본 것」을 0% 로 셀 길이 원리적으로 없다 — 그게 맞다.
  //       판정(통과선)도 여기서 다시 하지 않는다 — 통과·멈춤은 `lib/word.js` 한 곳의 몫이다
  if (closed.length === 0) {
    drop("word", "⚠️ 마감한 판이 없다 — 시험 결과를 안 낸다");
  } else {
    let pass = 0, failN = 0;
    // ⚠️ 판마다 한 왕복이다 — **서로 안 기다리므로 같이 보낸다** (마감이 9판이면 9단 직렬이었다).
    //    한 질의로 줄이려면 `lib/word.js` 가 판 목록을 배열로 받는 형제 함수를 내야 한다 (보고 needsDb).
    //    ⚠️ 시험 판정 SQL 이름을 여기 적지 마라 — `scripts/check-word.mjs` 가
    //       「그 이름이 lib/word.js 밖에 나오나」를 파일 훑기로 보아 그 자리에서 빨개진다
    const perSheet = await Promise.all(closed.map((s) => reportLines(db, s.id)));
    for (const rows of perSheet) {
      for (const r of rows) {
        if (r.part !== "오늘 본 것") continue;   // 「다음 시간」은 아직 안 본 것이다
        if (r.passed === true) pass++;
        else if (r.passed === false) failN++;
        // passed 가 null 이면 **안 센다** — 값이 없는 것이지 0점이 아니다
      }
    }
    const tested = pass + failN;
    if (tested > 0)
      lines.push({ key: "word", label: "단어·문장 통과", from: "마감한 수업만",
                   tested, pass, fail: failN, pct: pct(pass, tested) });
    else drop("word", "마감한 판에 개수를 적은 시험이 없다 — 0% 로 치지 않는다");
  }

  // ── ⑤ 교재 진도 — `v2.book_progress()` 를 **부른다** ─────────
  //    ⚠️⚠️ `v2.book_progress()` 는 **오늘 기준**이다 (0052: 배정 줄을 `v2.today()` 로 고른다).
  //       그래서 **그 달에 배정이 끝난 교재는 `done=0` 을 돌려주는데 그것은 「안 봤다」이지 0% 가 아니다.**
  //       앞서는 `total === 0` 만 걸러 그 **0 을 진짜 값으로 실어 냈고**, 굳으면 못 고쳤다
  //       (실측 8월 — 재원생 25명 중 17명 · 교재 61권이 0% 로 나갔다. 76단원을 다 끝낸 교재도 있었다).
  //       지금은 `SQL_PROGRESS` 가 「그 함수가 무엇을 셌나」를 같이 물어 **못 믿는 줄을 안 낸다.**
  //       needsDb ① 의 `v2.book_progress_on()` 이 서면 그 달 마지막날 진도를 진짜로 싣는다.
  //    ⚠️ 그리고 **건너뛴 교재는 한 줄씩 `hidden` 에 남긴다**(원칙 ③) — 앞서는 소리 없이 사라져
  //       원장님이 「이 교재가 왜 안 나갔지」를 화면에서 못 보셨다
  const allBooks = (await db.query(SQL_BOOKS, [studentId, first, last])).rows ?? [];
  const bookLines = [];
  const books = [];
  for (const b of allBooks) {
    // ⚠️ 오늘 멈춘·내린 교재는 학부모에게 안 낸다. **다만 왜 안 냈는지는 남긴다** (대전제 6)
    if (b.book_state !== "active")
      drop(`progress:${b.book_name}`, `교재가 지금 '${b.book_state}' 라 진도 줄에서 뺐다 (그 달엔 배정돼 있었다)`);
    else books.push(b);
  }
  const prog = books.length
    ? (await db.query(SQL_PROGRESS,
        [studentId, books.map((b) => b.book_id), books.map((b) => num(b.round))])).rows ?? []
    : [];
  const byBook = new Map(prog.map((r) => [String(r.book_id), r]));
  for (const b of books) {
    const label = `progress:${b.book_name}`;
    const p = byBook.get(String(b.book_id));
    if (!p) { drop(label, "진도를 물어볼 수 없었다"); continue; }
    const done = num(p.done), total = num(p.total), skipped = num(p.skipped);
    const round = num(b.round), todayRound = num(p.today_round), marks = num(p.marks) ?? 0;
    // ⚠️⚠️ **여기가 거짓 0% 가 나가던 자리다.** `v2.book_progress()` 가 고른 배정 줄이
    //    이 달 줄과 다르면(없거나 회독이 다르면) 그 답은 이 달 이야기가 아니다 — **0 을 안 믿는다**
    if (todayRound === null) {
      drop(label, "그 달로 배정이 끝난 교재다 — 진도는 오늘 기준으로만 셀 수 있어 그때 진도를 모른다 (0% 로 치지 않는다)");
      continue;
    }
    if (round !== null && todayRound !== round) {
      drop(label, `그 달은 ${round}회독인데 지금은 ${todayRound}회독이다 — 그때 진도를 모른다 (0% 로 치지 않는다)`);
      continue;
    }
    // ⚠️ 찍힌 줄이 하나도 없으면 「안 봤다」이지 0% 가 아니다 (원칙 ③)
    if (marks === 0) { drop(label, "이 교재에 찍힌 진도 줄이 하나도 없다 — 0% 로 치지 않는다"); continue; }
    if (done === null || total === null || total === 0) { drop(label, "셀 수 있는 단원이 없다"); continue; }
    bookLines.push({ bookId: b.book_id, name: b.book_name, round,
                     done, skipped, total, pct: pct(done, total) });
  }
  if (bookLines.length)
    // ⚠️ `from` 이 「오늘 기준」인 까닭은 위 ⑤ 의 경고 그대로다. 학부모에게는 그 말만 나간다
    lines.push({ key: "progress", label: "교재 진도", from: "오늘 기준",
                 asOf: "today", books: bookLines });
  else drop("progress", allBooks.length
    ? "배정된 교재 중 지금 셀 수 있는 것이 없다 (교재마다 까닭을 따로 적었다)"
    : "그 달에 배정된 교재가 없다");

  // ── 원장님 글 — **앱이 짓지 않는다** ────────────────────────
  //    ⚠️ 여기서 문장을 지으면 재료가 반쯤 찬 아이에게 근거 없는 글이 나간다
  //       (계획 「성장 리포트는 조건부다」). 원장님이 쓰신 것만 싣는다
  const saved = (await db.query(SQL_ONE, [studentId, ym])).rows?.[0] ?? null;

  return {
    studentId, ym, monthLabel: monthLabel(ym), first, last,
    lines,
    body: saved && has(saved.body) ? saved.body : null,
    sentAt: saved?.sent_at ?? null,
    // ⚠️ 아래는 **원장 화면용**이다. `forFamily()` 가 떼어 낸다 — 안 떼면 `frozen` 에 실려 샌다
    hidden,
    today,                       // ⚠️ 「그 달이 아직 안 끝났나」를 `sendGate` 가 이걸로 본다
    sheets: sheets.length,
    closedSheets: closed.length,
    openSheets: sheets.length - closed.length,
  };
}

/**
 * 학부모에게 내려보낼 값. **이 문을 안 지나면 새는 것으로 본다** (`close.js` 와 같은 규칙).
 *
 * ⚠️ **흰 목록으로 고른다.** 「원장 칸만 빼기」로 짜면 나중에 칸을 하나 더할 때
 *    빼는 것을 잊는 순간 새어 나간다. 여기서는 **`FAMILY_KEYS` 에 적힌 것만** 나간다 —
 *    잊으면 안 나갈 뿐이라 사고가 아니다.
 * ⚠️ 칸을 `null` 로 두지 않고 **키 자체를 없앤다** — 있으면 언젠가 그려진다.
 */
export function forFamily(report) {
  if (!report) return null;
  const out = {};
  for (const k of FAMILY_KEYS) if (k in report) out[k] = report[k];
  return out;
}

// ────────────────────────────────────────────────────────────────
// 보낸다 — **막지 않는다. 묻는다.** 그리고 굳힌다
// ────────────────────────────────────────────────────────────────

/**
 * 보내도 되나 — 조건이 안 찬 것을 목록으로 낸다.
 * `must:true` 인 것만 `sendMonthly(…, {confirm:[코드]})` 로 확인해야 나간다.
 *
 * ⚠️ 굳히는 것은 **되돌릴 수 없다.** 그래서 마감(`closeGate`)보다 must 가 하나 많다.
 */
export async function sendGate(db, studentId, ym, opts = {}) {
  const report = opts.report ?? (await buildReport(db, studentId, ym, opts));
  const asks = [];

  if (report.sentAt)
    asks.push(ask(ASK.ALREADY_SENT, `${report.monthLabel} 리포트는 이미 보냈습니다`,
      "굳은 글은 안 바뀝니다 — 다시 보내려면 그 줄을 원장님이 직접 여셔야 합니다", false,
      { sentAt: report.sentAt }));

  // ⚠️ ① 안 마감한 판이 남아 있으면 **반드시 묻는다.**
  //    재료가 마감한 판만이므로, 안 마감한 판이 많을수록 **숫자가 실제보다 적게 굳는다.**
  //    「출석은 20일인데 숙제 성취도는 3일치」가 그대로 학부모에게 가고, 굳어서 못 고친다
  if (report.openSheets > 0)
    asks.push(ask(ASK.OPEN_SHEETS, `안 마감한 판 ${report.openSheets}개가 빠집니다`,
      "숙제·시험 숫자가 실제보다 적게 굳습니다 — 굳으면 못 고칩니다", true,
      { n: report.openSheets, closed: report.closedSheets, sheets: report.sheets }));

  // ⚠️ ② 실을 줄이 하나도 없으면 **반드시 묻는다** — 빈 리포트가 굳는다
  if (report.lines.length === 0)
    asks.push(ask(ASK.NO_LINES, "실을 줄이 하나도 없습니다",
      "값이 없는 줄은 안 냅니다(0% 로 치지 않습니다) — 지금 보내면 빈 리포트가 굳습니다", true,
      { hidden: report.hidden }));

  // ⚠️⚠️ ②-b **아직 안 끝난 달을 굳히는 것을 아무것도 안 막고 있었다.**
  //    앞으로의 달은 판이 애초에 0개라 ①이 안 걸리고, 회차 줄은 「앞날 예정」이 서서 ②도 안 걸린다.
  //    실측 — 오늘 2026-09-02 에 `sendGate(…, '2027-05')` 가 **아무 물음 없이** `ready:true` 였다.
  //    그리고 굳히기는 되돌릴 수 없으므로(`SQL_FREEZE` 의 `sent_at is null`),
  //    **2027년 5월이 진짜로 왔을 때 그 달 리포트를 영영 못 보낸다.**
  //    막지 않고 묻는다 — 달을 잘못 고른 것이 대부분이지만 미리 보내는 일도 있을 수 있다
  if (report.today && report.last > report.today)
    asks.push(ask(ASK.MONTH_OPEN, `${report.monthLabel}은 아직 안 끝난 달입니다`,
      `오늘은 ${report.today} 입니다 — 지금 굳히면 앞날 예정까지 실린 글이 굳고, `
      + "달이 끝난 뒤에는 그 달 리포트를 다시 못 보냅니다", true,
      { today: report.today, last: report.last }));

  // ③ 원장님 글이 비었다 — 앱이 대신 짓지 않는다
  if (!has(report.body))
    asks.push(ask(ASK.NO_BODY, "원장님 글이 비었습니다",
      "앱은 글을 짓지 않습니다 — 숫자만 나갑니다", false));

  // ④ 회차를 못 센 달
  const notCountable = report.hidden.find((h) => h.key === "sessions");
  if (notCountable)
    asks.push(ask(ASK.NOT_COUNTABLE, "회차 줄이 빠집니다", notCountable.why, false));

  // ⑤ 반 명단이 늦게 시작한 달 — 회차가 실제보다 적을 수 있다.
  //    ⚠️ 학부모에게는 아무 말도 안 나간다(그건 거짓말이 된다). 원장님께만 밝힌다
  const late = report.hidden.find((h) => h.key === "sessions:note");
  if (late)
    asks.push(ask(ASK.ROSTER_LATE, "회차가 실제보다 적을 수 있습니다", late.why, false));

  return { report, asks, mustAsk: asks.filter((x) => x.must).map((x) => x.code),
           ready: asks.every((x) => !x.must) && !report.sentAt };
}

/** 초안 저장 — 원장님 글만 넣는다. ⚠️ **보낸 뒤에는 안 고쳐진다**(0줄로 돌아온다) */
export async function saveDraft(db, studentId, ym, body) {
  assertYm(ym);
  const { rows } = await db.query(SQL_DRAFT, [studentId, ym, body ?? null]);
  if (!rows?.length) return { ok: false, why: "already_sent" };   // ⚠️ 성공이라 말하면 안 된다
  return { ok: true, id: rows[0].id, body: rows[0].body };
}

/**
 * ⭐ **보낸다 — 그리고 그때 나간 글을 굳힌다.**
 *
 * 차례가 중요하다: **굳히기가 먼저고 알림이 나중이다.**
 *   · 알림을 먼저 쏘면, 굳히기가 실패했을 때 학부모가 알림을 누르는데
 *     접근 규칙(`sent_at is not null`)에 막혀 **빈 화면**이 뜬다. 오류도 안 난다.
 *   · 굳히기를 먼저 하면, 알림이 실패해도 리포트는 보이고 **자취가 남아 다시 보낼 수 있다.**
 *
 * ⚠️⚠️ **그런데 「다시 보낼 수 있다」가 사실이 아니었다.** 굳히기와 알림은 한 트랜잭션이 아니라
 *    알림이 터지면 리포트는 굳은 채 커밋되고, 학부모 폰엔 한 통도 안 갔고, 다시 누르면 `already_sent` 였다.
 *    실측(2026-09-02) — 발송 스위치가 꺼진 채로(=기본값) 부르면 `lib/notify.js` 가
 *    `notify_log.sent_at` not null 로 **던진다.** 첫 리허설에서 100% 이 길로 갔다.
 *    → 지금은 알림이 터지면 **방금 박은 `sent_at` 을 도로 내린다**(`SQL_REOPEN`).
 *      계획 「속도」 5번 — 되돌릴 수 없는 낙관 갱신은 하지 않는다. 굳히기는 서버 답을 기다린 뒤에만 산다.
 *    ⚠️ 되돌리는 것까지 실패할 수 있다(그 사이 연결이 끊기면). 그때를 위해 `reopenReport()` 를 둔다.
 *    ⚠️ 알림이 **반쯤 나가고** 터졌으면 다시 보낼 때 그 집엔 두 번 뜬다 —
 *       같은 `tag` 라 폰에서는 앞엣것을 덮어쓴다. 「굳었는데 아무에게도 안 갔다」보다 낫다
 *
 * @param opts.confirm  물음 코드 배열. `must` 인 물음은 여기 들어와야 나간다
 * @param opts.push     실제로 쏘는 것 — `notify` 에 그대로 넘긴다 (검사가 갈아 끼운다)
 * @param opts.env      발송 스위치가 든 환경변수 묶음. **그대로 `notify` 에 넘긴다.**
 *                      ⚠️ 기본값은 `off` 다. 스위치 이름을 여기서 읽지 않는다 —
 *                      읽는 곳은 `lib/notify.js` 하나뿐이어야 한다(자동 검사 ⑦)
 */
export async function sendMonthly(db, studentId, ym, opts = {}) {
  assertYm(ym);
  const gate = await sendGate(db, studentId, ym, opts);
  const { report } = gate;

  if (report.sentAt) return { ok: false, why: "already_sent", gate };

  const confirm = opts.confirm ?? [];
  const need = gate.mustAsk.filter((c) => !confirm.includes(c));
  if (need.length) return { ok: false, why: "ask", need, gate };

  // ⚠️ 굳히는 것은 **학부모에게 나갈 것 그대로**. 원장 칸(`hidden`·`openSheets`)이 섞이면
  //    접근 규칙상 학부모가 그 줄을 통째로 읽으므로 **그 순간 샌다**
  const frozen = { v: FROZEN_V, ...forFamily(report) };

  const { rows } = await db.query(SQL_FREEZE,
    [studentId, ym, report.body ?? null, JSON.stringify(frozen), opts.now ?? null]);

  // ⚠️ 0줄 = 그 사이에 다른 창에서 이미 보냈다. **알림을 쏘지 않는다** —
  //    쏘면 같은 달 리포트가 학부모 폰에 두 번 뜬다
  if (!rows?.length) return { ok: false, why: "already_sent", gate };
  const saved = rows[0];

  // ⚠️ 밖으로 나가는 길은 `lib/notify.js` 하나뿐이다. 여기서 직접 쏘면 check-notify 가 깨진다
  const targets = ((await db.query(SQL_PARENTS, [studentId])).rows ?? [])
    .map((p) => ({ profileId: p.profile_id, studentId, role: p.role }));

  // ⚠️ 제목에 숫자·이름을 안 싣는다 — 잠금화면은 폰을 안 열어도 보인다(계약서 ⑤).
  //    본문은 `notify` 가 「앱에서 확인해주세요.」로 갈아 끼운다
  let sent;
  try {
    sent = await notify(db, {
      kind: "monthly",
      title: `${report.monthLabel} 월간 리포트`,
      body: "월간 리포트가 도착했습니다.",
      tag: monthlyTag(ym),
      url: "/parent",
      targets,
    }, opts);
  } catch (e) {
    // ⚠️⚠️ **굳었는데 아무에게도 안 갔다.** 그대로 두면 다시 누를 때 `already_sent` 라
    //    그 아이의 그 달은 거기서 끝난다 — 방금 박은 그 줄만 도로 내린다
    let undone = false;
    try {
      const back = await db.query(SQL_REOPEN, [studentId, ym, saved.sent_at ?? null]);
      undone = (back.rows ?? []).length > 0;
    } catch (e2) {
      // ⚠️ 되돌리기까지 터졌다. **원래 잘못을 삼키지 않는다** — 그대로 알리고 길만 일러 준다
      undone = false;
    }
    return { ok: false, why: "notify_failed", gate, id: saved.id, undone,
             error: String(e?.message ?? e).split("\n")[0],
             warn: undone
               ? "⚠️ 알림이 실패해 굳힌 것을 도로 내렸다 — 학부모에게는 아직 안 갔다. 다시 눌러 주세요"
               : "⚠️⚠️ 알림이 실패했는데 굳힌 것도 못 내렸다 — reopenReport() 로 내려야 다시 보낼 수 있다" };
  }

  return { ok: true, id: saved.id, frozen, sentAt: saved.sent_at, targets: targets.length,
           notify: sent, gate,
           // ⚠️ 학부모가 하나도 안 붙어 있으면 굳기는 굳었는데 **아무에게도 안 갔다.**
           //    조용히 성공이라 말하면 원장님이 「보냈다」고 믿는다
           warn: targets.length === 0 ? "⚠️ 이 아이에게 붙은 학부모 계정이 없다 — 굳었지만 아무에게도 안 갔다" : null };
}

/**
 * ⭐ **「굳었는데 안 나갔다」를 도로 내린다** — 다시 보낼 수 있게.
 *
 * ⚠️ 지우지 않는다. `sent_at` 만 비운다 (대전제 6 — 상태로 내린다).
 *    `frozen` 은 그대로 둔다 — 「그때 무엇이 굳었나」가 자취다.
 *    접근 규칙(`own_mr`)이 `sent_at is not null` 을 요구하므로 **학부모에게는 그 순간 안 보인다.**
 * ⚠️ `opts.sentAt` 을 주면 **그 시각에 박힌 줄만** 내린다. 안 주면 무엇이든 내리므로,
 *    화면은 되도록 그때 받은 `sentAt` 을 같이 넘긴다 — 안 그러면 다른 창에서 제대로
 *    보낸 것을 덮어 내릴 수 있다.
 */
export async function reopenReport(db, studentId, ym, opts = {}) {
  assertYm(ym);
  const { rows } = await db.query(SQL_REOPEN, [studentId, ym, opts.sentAt ?? null]);
  if (!rows?.length) return { ok: false, why: "not_sent" };   // 이미 안 보낸 상태거나 그 줄이 아니다
  return { ok: true, id: rows[0].id, hadFrozen: rows[0].had_frozen === true };
}

/**
 * 학부모가 보는 것 — **굳은 글 그대로.**
 * ⚠️ 여기서 다시 지으면(`buildReport`) 나중에 점수를 고쳤을 때 **보낸 것과 다른 숫자**가 보인다.
 *    그게 「보낸 것과 지금 보이는 것이 다르다」이고, 그때는 어느 쪽이 맞는지 아무도 못 가린다.
 * 안 보낸 달은 `null` — 접근 규칙(`own_mr`)도 `sent_at is not null` 을 요구한다.
 */
export async function sentView(db, studentId, ym) {
  assertYm(ym);
  const r = (await db.query(SQL_ONE, [studentId, ym])).rows?.[0] ?? null;
  if (!r || !r.sent_at) return null;
  const f = typeof r.frozen === "string" ? JSON.parse(r.frozen) : r.frozen;
  // ⚠️ 굳은 것이 없는 줄(옛 이관 줄 따위)은 **지어서 채우지 않는다.** 없다고 말한다
  if (!f) return { ym, studentId, sentAt: r.sent_at, frozen: null, body: r.body ?? null,
                   why: "⚠️ 굳은 글이 없다 — 그때 숫자를 모른다" };
  // ⚠️ 차례가 중요하다 — **굳은 것(`f`)이 먼저 깔리고 그 위를 칸이 덮는다.**
  //    글은 굳은 것이 이기고(`f.body`), 「보낸 때」는 칸이 이긴다(굳은 것엔 아예 없다)
  return { ...f, ym, studentId, sentAt: r.sent_at, body: f.body ?? r.body ?? null };
}

/**
 * ⭐ **한 화면에서 안 보낸 학생을 센다** (대전제 3 — 학생을 하나씩 열지 않는다).
 * 질의 하나로 학생마다 「보냈나 · 판 몇 개 · 마감 몇 개」가 나온다.
 *
 * ⚠️⚠️ **여기서 「보낼 수 있나」를 말하지 않는다.** 앞서는 `ready` 라는 이름으로 말했고,
 *    같은 물음에 규칙이 두 벌이었다(원칙 1 위반). 보드는 `!sent && closed>0 && open===0`,
 *    `sendGate` 는 「must 물음이 없다」— 실측 2026-09 에 보드는 「바로 보낼 수 있는 아이 0명」인데
 *    같은 24명을 게이트에 물으면 전원 `ready:true` 였다. 원장님은 0명을 읽고 안심하는데
 *    화면은 아무 물음 없이 굳혀 보낸다. 반대로 판은 다 마감했지만 실을 줄이 없는 아이는
 *    보드가 「보낼 수 있음」으로 세는데 누르면 `no_lines` 물음이 뜬다. 두 숫자 중 어느 쪽이
 *    맞는지 화면이 못 가린다.
 *    → 보드가 세는 것은 **판 수**다. 그래서 이름도 `allClosed`(마감 다 됨)로 바꿨다.
 *      **「보낼 수 있나」는 `sendGate` 만 답한다.** 보드 한 질의로는 「줄이 나오는가」를 못 센다.
 *    `blocked` 는 안 마감한 판이 남은 아이 — 리포트가 아니라 **마감**을 먼저 해야 한다.
 */
export async function monthlyBoard(db, ym) {
  assertYm(ym);
  const { first, last } = monthRange(ym);
  const rows = (await db.query(SQL_BOARD, [ym, first, last])).rows ?? [];

  const students = rows.map((r) => {
    const sheets = Number(r.sheets ?? 0), closedN = Number(r.closed ?? 0);
    return {
      studentId: r.student_id, name: r.name,
      sentAt: r.sent_at ?? null, sent: !!r.sent_at, hasBody: r.has_body === true,
      sheets, closed: closedN, open: sheets - closedN,
      // ⚠️ 「마감이 다 됐다」이지 「보낼 수 있다」가 아니다 — 그건 `sendGate` 만 답한다
      allClosed: !r.sent_at && closedN > 0 && sheets - closedN === 0,
    };
  });

  const notSent = students.filter((s) => !s.sent);
  return {
    ym, first, last,
    total: students.length,
    sent: students.length - notSent.length,
    notSent: notSent.length,                             // ⭐ 「안 보낸 학생 N명」
    allClosed: students.filter((s) => s.allClosed).length, // 마감이 다 된 아이 (≠ 보낼 수 있는 아이)
    blocked: notSent.filter((s) => s.open > 0).length,
    noSheet: notSent.filter((s) => s.sheets === 0).length,
    students,
  };
}
