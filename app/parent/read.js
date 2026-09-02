/**
 * 학부모 화면이 **읽는 자리 한 벌.** 화면(`page.js`·`view.js`)은 여기서 받아 그리기만 한다.
 *
 * ⚠️⚠️ **사고 #7 — 마감 전에는 그날 내용이 밖으로 새면 안 된다.**
 *    이 파일은 판 줄을 **반드시** `lib/close.js` 의 `sheetForFamily()`·`itemsForFamily()` 에
 *    넣어서 내보낸다. 화면에서 `closed_at` 을 보고 숨기지 않는다 —
 *    숨기는 것과 **값에 안 싣는 것**은 다르다. 숨긴 것은 언젠가 그려진다.
 *    원장 메모(`staff_note`)는 **키째로 없어야** 한다. 여기서는 아예 select 도 안 한다.
 *
 * ⚠️ **판단을 여기서 만들지 않는다.**
 *      · 마감 전 가리기·글  → `lib/close.js` (PREPARING · NOTHING · DAY_OPEN · hideEmptyCards)
 *      · 수업일 세기          → `lib/session.js` (countDates · monthRange · eachDate · ymd)
 *      · 「학원의 오늘」       → DB 의 `v2.today()` (여기서 `new Date()` 로 세지 않는다)
 *      · 월간 리포트 굳은 글  → `lib/monthly.js` 의 `sentView()`
 *      · 지각 「얼마나」       → **없앴다** (원장님 2026-09-02) — 찍은 시각이 곧 도착 시각이다
 *      · 자료 받을까 말까     → `lib/files.js` (upload/route.js 에서 부른다)
 *
 * ⚠️ **서비스 열쇠를 쓰지 않는다.** `lib/db.js` 의 `serviceDb()` 는 접근 규칙을 지나쳐 버려서,
 *    학부모 폰에서 남의 아이 자료가 그대로 열린다. 여기서는 그 사람 쿠키로 만든 클라이언트뿐이다.
 *
 * ⚠️ **조회 수에 상한을 둔다** (`MAX_READS`). 지금 앱에서 화면 하나가 30건을 조회해 느려졌다.
 *    한 건 더 붙일 때마다 이 숫자를 봐야 하고, 넘으면 그 자리에서 던진다.
 */
import { applyOrder, orderInLayout, CARDS, SCREENS } from "@/lib/screens";
import { cookies } from "next/headers";
import { serverClientFromStore, roleOf, keys, SCHEMA } from "@/lib/supabase-server";
import { hideEmptyCards } from "@/lib/close";
import { ymd, monthRange, countDates } from "@/lib/session";
import { sentView } from "@/lib/monthly";
// ⚠️ 순수한 자리는 `shape.js` 한 벌이다 — 화면(client)도 검사도 같은 것을 본다 (원칙 1)
import {
  ROLE, MONTHS_AHEAD, MONTHS_BACK, CELL, DOW,
  familyRows, buildMonth, monthLabelOf, addMonth, ymOf,
  PREPARING, NOTHING, DAY_OPEN,
} from "./shape";

/** ⚠️ 이 화면이 한 번 그려질 때 DB 를 두드리는 **최대 횟수.** 넘으면 던진다 */
export const MAX_READS = 12;

// 순수한 자리는 `shape.js` 가 갖고 있다. 서버 쪽에서 부를 수 있게 그대로 내보낸다
export { ROLE, MONTHS_AHEAD, MONTHS_BACK, CELL, DOW, familyRows, buildMonth,
         monthLabelOf, addMonth, ymOf, PREPARING, NOTHING, DAY_OPEN };


// ── 세는 자리 ──────────────────────────────────────────────────────────────

/** 조회를 세는 손잡이. 상한을 넘으면 **그 자리에서 던진다** (조용히 느려지는 것이 제일 나쁘다) */
function readCounter(max = MAX_READS) {
  let n = 0;
  return {
    hit(what) {
      n += 1;
      if (n > max)
        throw new Error(
          `학부모 화면 조회가 상한(${max})을 넘었다 — ${n}번째: ${what}. ` +
          "한 건 더 붙이려면 MAX_READS 를 올리기 전에 **합칠 수 있는지** 먼저 본다"
        );
    },
    get n() { return n; },
  };
}

/** supabase 응답에서 줄을 꺼낸다. 오류는 **삼키지 않고** 사람 말로 모아 둔다 */
function rowsOf(res, what, problems) {
  if (res?.error) {
    const code = String(res.error.code ?? "");
    if (code === "PGRST106")
      problems.push("⚠️ 앱 설정이 아직 덜 됐습니다 — 자료를 읽을 길이 안 열려 있습니다 (v2 스키마 노출 안 됨). 원장님께 알려주세요.");
    else
      problems.push(`⚠️ ${what} 을(를) 못 읽었습니다 (${code || res.error.message}). 원장님께 알려주세요.`);
    return [];
  }
  return res?.data ?? [];
}

/**
 * 화면 한 장에 필요한 값을 전부 읽어 온다.
 *
 * @param opts.studentId 형제 중 고른 아이 (없으면 첫째)
 * @param opts.supabase  ⚠️ 검사가 가짜를 끼우는 구멍. 비우면 그 사람 쿠키로 만든다
 * @returns 화면이 그대로 그릴 수 있는 값 + `problems`(**왜 비었나**)
 */
export async function loadParent(opts = {}) {
  const problems = [];
  const cnt = readCounter(opts.maxReads ?? MAX_READS);

  if (!opts.supabase && !keys().ok) {
    return empty(problems.concat(
      "⚠️ 앱 설정이 아직 덜 됐습니다 — 로그인 열쇠가 없습니다. 원장님께 알려주세요."
    ), cnt.n);
  }

  const supabase = opts.supabase ?? serverClientFromStore(await cookies());
  const sb = supabase.schema(SCHEMA);

  // ① 나는 누구인가 — 역할은 `v2.profiles` 에서 읽는다 (저장하지 않는다)
  cnt.hit("profiles(역할)");
  const me = await roleOf(supabase);
  if (!me.user) return empty(problems.concat("로그인이 풀렸습니다. 다시 로그인해 주세요."), cnt.n);
  if (me.role !== ROLE)
    return empty(problems.concat(
      me.msg || "이 화면은 학부모 계정으로 여는 화면입니다. 원장님께 알려주세요."
    ), cnt.n, { me });

  // ② 「학원의 오늘」 — ⚠️ `new Date()` 로 세지 않는다. 서버가 UTC 면 밤 9시부터 하루가 어긋난다
  cnt.hit("v2.today()");
  const tRes = await sb.rpc("today");
  const today = tRes?.error ? null : ymd(tRes?.data);
  if (!today) {
    problems.push("⚠️ 오늘 날짜를 못 읽어 달력을 못 그립니다 — 지어내지 않습니다. 원장님께 알려주세요.");
    return empty(problems, cnt.n, { me });
  }

  // ③ 내 아이들 — ⚠️ **형제가 있으면 누구 것인지 먼저 묻는다** (계획 ㊸)
  cnt.hit("parent_student");
  const links = rowsOf(await sb.from("parent_student").select("student_id")
    .eq("parent_profile_id", me.user.id), "아이 연결", problems);
  const ids = links.map((r) => r.student_id).filter(Boolean);

  let children = [];
  if (ids.length) {
    cnt.hit("students");
    children = rowsOf(await sb.from("students")
      .select("id,name,grade,state,school_id").in("id", ids).order("name"),
      "아이 정보", problems);
  }
  if (!children.length) {
    problems.push(
      "아직 아이가 연결되어 있지 않습니다 — 그래서 아래가 비어 있습니다. 원장님께 알려주세요."
    );
    return empty(problems, cnt.n, { me, today });
  }

  const student = children.find((c) => c.id === opts.studentId) ?? children[0];

  // ④ 이 아이가 든 반과 그 반의 요일 이력 — **회차·수업일이 여기서 나온다**
  const ymNow = ymOf(today);
  const shown = [];
  for (let i = 0; i <= MONTHS_AHEAD; i++) shown.push(addMonth(ymNow, i));
  const backFirst = monthRange(addMonth(ymNow, -MONTHS_BACK)).first;
  const lastDay = monthRange(shown[shown.length - 1]).last;

  cnt.hit("student_classes(지난 창)"); cnt.hit("student_classes(오늘)"); cnt.hit("class_schedule");
  const { schedules, hadBack, hasNow } = await readClasses(sb, student.id, { back: backFirst, today }, problems);

  // ⚠️ **덜 보여주는 쪽으로 자른다** (계획 ⑯ 3번). 지어낸 날짜로 넓히지 않는다
  const from = hadBack ? backFirst : monthRange(ymNow).first;
  const toClamped = hasNow ? lastDay : today;

  // ⑤ 판 — ⚠️ **`staff_note` 를 select 하지 않는다.** 접근 규칙도 마감 안 한 판을 안 준다
  cnt.hit("day_sheet");
  const sheetRows = rowsOf(await sb.from("day_sheet")
    .select("id,student_id,class_id,date,attend,closed_at,sent_at,comment")
    .eq("student_id", student.id).gte("date", from).lte("date", toClamped).order("date"),
    "수업 기록", problems);

  let itemRows = [];
  const sheetIds = sheetRows.map((s) => s.id);
  if (sheetIds.length) {
    cnt.hit("day_item");
    itemRows = rowsOf(await sb.from("day_item")
      .select("id,sheet_id,slot,status,range_note,done_note,memo,sort," +
              "learn_items(name),units(chapter,sub,activity,books(name))")
      .in("sheet_id", sheetIds).order("sort"),
      "과제", problems);
  }

  // ⑥ 월간 리포트 — **보내야 보인다** (접근 규칙 `own_mr` 이 `sent_at is not null` 을 요구한다)
  cnt.hit("monthly_report");
  const reportRows = rowsOf(await sb.from("monthly_report")
    .select("id,ym,sent_at,body,frozen").eq("student_id", student.id)
    .not("sent_at", "is", null).order("ym", { ascending: false }).limit(12),
    "월간 리포트", problems);

  // ⑦ 내가 보낸 것 — 결석·지각 예정 · 남기신 말. ⚠️ 「원장님이 봤나」를 같이 보여 준다.
  //    ⚠️ 아이로 안 거른다 — **형제 둘의 것을 한 자리에서 본다.** 대신 누구 것인지 이름을 붙인다
  cnt.hit("request");
  const requestRows = rowsOf(await sb.from("request")
    .select("id,student_id,kind,body,at,seen_at,answered_at,answer,state")
    .eq("by_profile", me.user.id).order("at", { ascending: false }).limit(30),
    "보내신 말", problems);

  // ── 여기서부터는 **판단이 아니라 정리**다 ────────────────────────────────
  const itemsBySheet = new Map();
  for (const it of itemRows) {
    if (!itemsBySheet.has(it.sheet_id)) itemsBySheet.set(it.sheet_id, []);
    itemsBySheet.get(it.sheet_id).push(it);
  }

  // ⚠️⚠️ **여기가 유일한 문이다.** 판 줄은 반드시 이 함수를 지나 화면으로 간다
  const days = familyRows(sheetRows, itemsBySheet, ROLE);

  const byDate = new Map();
  for (const d of days) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date).push(d);
  }

  // 수업일 — ⚠️ **휴강은 학부모에게 0줄이다** (접근 규칙에 학부모 자리가 없다).
  //    그래서 휴강한 날이 수업일로 그려진다. 지어내지 않고 화면에 밝힌다.
  const counted = countDates({ schedules, holidays: [], first: from, last: toClamped, today });
  const classDays = new Set(counted.dates);
  const limits = [];
  if (!hadBack)
    limits.push("등록 전일 수 있는 날짜는 안 보여 드립니다 — 이 달부터 보입니다.");
  if (!hasNow)
    problems.push("지금 배정된 반이 없어 앞날 수업이 안 뜹니다 — 그래서 비어 있습니다. 원장님께 알려주세요.");
  if (schedules.length)
    limits.push(
      "휴강한 날도 달력에는 수업일로 보입니다 — 이 화면은 휴강을 못 읽습니다. 휴강 안내는 따로 확인해 주세요."
    );
  else
    problems.push(
      "아직 반 시간표가 없어 달력에 수업일이 안 뜹니다 — 그래서 비어 있습니다. 원장님께 알려주세요."
    );

  const months = shown.map((ym) =>
    buildMonth({ ym, classDays, byDate, today, from, to: toClamped }));

  // 최근 수업 — 마감된 것만 (마감 안 한 것은 애초에 값에 없다)
  const recent = days.filter((d) => d.visible && d.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));

  // 과제 — 숙제(home)와 예습(next). ⚠️ **앞으로 할 것도 같이 보인다**
  const homework = [];
  for (const d of days) {
    if (!d.visible) continue;
    for (const it of d.items) {
      if (it.slot !== "home" && it.slot !== "next") continue;
      homework.push({
        id: it.id, date: d.date, slot: it.slot,
        ahead: it.slot === "next",                 // 「앞으로 할 것」
        status: it.status ?? "none",
        item: it.learn_items?.name ?? null,
        book: it.units?.books?.name ?? null,
        chapter: it.units?.chapter ?? null,
        sub: it.units?.sub ?? null,
        activity: it.units?.activity ?? null,
        range: it.range_note ?? null,
        doneNote: it.done_note ?? null,
        memo: it.memo ?? null,
      });
    }
  }
  homework.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slot < b.slot ? -1 : 1));

  // 월간 리포트 — **굳은 글이 이기는 규칙은 `lib/monthly.js` 가 갖고 있다.** 여기서 다시 짜지 않는다
  const reports = [];
  const mdb = monthlyRowDb(reportRows);
  for (const r of reportRows) {
    const one = await sentView(mdb, student.id, String(r.ym)).catch(() => null);
    reports.push({
      ym: String(r.ym),
      label: monthLabelOf(String(r.ym)),
      sentAt: r.sent_at,
      body: one?.body ?? null,
      why: one?.why ?? null,
      lines: Array.isArray(one?.lines) ? one.lines : [],
    });
  }

  const nameOf = new Map(children.map((c) => [c.id, c.name]));
  const requests = requestRows.map((r) => ({
    id: r.id, kind: r.kind, body: r.body ?? "", at: r.at,
    // ⚠️ 형제가 있으면 누구 것인지 붙인다 — 안 붙이면 형 결석 예정이 동생 것으로 읽힌다
    who: children.length > 1 ? (nameOf.get(r.student_id) ?? null) : null,
    seen: Boolean(r.seen_at), answered: Boolean(r.answered_at), answer: r.answer ?? null,
  }));

  // ⚠️ 자기 줄만 읽는다 (`own_sp` 정책이 profile_id = auth.uid() 로 막는다).
  //    없으면 null 이고 그것이 정상이다 — 한 번도 안 바꾼 사람이다.
  // ⚠️ 조회가 실패해도 **화면을 죽이지 않는다** — 차례는 곁가지다. 기본 차례로 그린다.
  const prefRes = await sb.from("screen_pref")
    .select("layout").eq("profile_id", me.user.id).eq("screen", SCREENS.parent).limit(1);
  const pref = prefRes?.data?.[0] ?? null;

  return {
    ok: true,
    reads: cnt.n,
    problems, limits,
    me: { id: me.user.id, role: me.role },
    children: children.map((c) => ({ id: c.id, name: c.name, grade: c.grade, state: c.state })),
    student: { id: student.id, name: student.name, grade: student.grade, state: student.state },
    today, from, to: toClamped,
    months, recent, homework, reports, requests,
    hideEmpty: hideEmptyCards(ROLE),   // ⚠️ 아이·학부모 화면에서만 빈 카드를 숨긴다 (계획 ⑮ 3번)
    // 카드 차례 — **사람마다 따로**(계획 ⑮ 1). 판단은 `lib/screens.js` 한 벌이다.
    // ⚠️ 저장값을 그대로 쓰지 않는다 — 카드를 더하거나 없앤 날 어긋난다. applyOrder 가 고쳐 준다.
    cardOrder: applyOrder(orderInLayout(pref?.layout), CARDS.parent),
    startTimes: schedules.map((s) => String(s.start_time ?? "").slice(0, 5)).filter(Boolean),
  };
}

/**
 * 반과 요일 이력 — **화면과 서버 동작이 같은 한 벌을 쓴다.**
 *
 * ⚠️⚠️ **명단 표를 직접 읽지 않는다** (자동 검사 ⑮). 「이 아이가 이 날 어느 반인가」는
 *    `v2.student_classes()` 한 곳이 답한다. 직접 읽으면 그 판단이 두 벌이 된다.
 * ⚠️ 조회 **3건**이다 (지난 쪽 · 오늘 쪽 · 요일 이력). 부르는 쪽이 세어야 한다.
 * ⚠️ 수업일을 여기서 세지 않는다 — 세는 것은 `lib/session.js` 의 `countDates()` 한 곳이다.
 *
 * ⚠️ **확인 안 됨 — 「언제부터 다녔나」를 물을 한 벌이 아직 없다.**
 *    `v2.student_classes()` 는 「그 날 어느 반인가」만 답한다. 그래서 여기서는 날짜를 지어내지 않고
 *    **두 날에 물어 본 것만** 쓴다:
 *      · 지난 창 첫날에 반이 없으면 → 그 앞은 **안 그린다** (등록 전일 수 있다). 덜 보여주는 쪽이 맞다
 *      · 오늘 반이 없으면 → **앞날을 안 그린다** (퇴원·반 배정 대기)
 *    계획 ⑯ 3번(지난 것은 재원 기간만)을 이 두 걸음으로 지킨다. 제대로 하려면 DB 한 벌이 필요하다
 *    → 보고의 needsDb 에 `v2.enrolled_span(student)` 을 적었다.
 */
export async function readClasses(sb, studentId, { back, today }, problems = []) {
  const 반 = async (on) => {
    const r = await sb.rpc("student_classes", { p_student: studentId, p_on: on });
    if (r?.error) { rowsOf(r, "반 소속", problems); return []; }
    const rows = Array.isArray(r?.data) ? r.data : r?.data ? [r.data] : [];
    return [...new Set(rows.map((x) => x?.class_id ?? x).filter(Boolean))];
  };

  const 그때 = back ? await 반(back) : [];
  const 오늘 = today ? await 반(today) : [];

  let schedules = [];
  const classIds = [...new Set([...그때, ...오늘])];
  if (classIds.length) {
    schedules = rowsOf(await sb.from("class_schedule")
      .select("class_id,from_date,to_date,weekdays,start_time,end_time").in("class_id", classIds),
      "수업 요일", problems);
  }

  return {
    schedules, classIds,
    // 지난 창 첫날에 반이 없었다 → 그 앞은 안 그린다 (등록 전일 수 있다)
    hadBack: 그때.length > 0,
    // 오늘 반이 없다 → 앞날을 안 그린다
    hasNow: 오늘.length > 0,
  };
}

/**
 * ⚠️ `lib/monthly.js` 의 `sentView()` 는 `{query(sql,params)}` 짜리 어댑터를 받는다.
 *    PostgREST 로는 그 SQL 을 그대로 못 돌리므로, **이미 읽어 둔 줄을 그대로 돌려주는**
 *    얕은 어댑터를 끼운다. 굳은 글과 칸 중 어느 쪽이 이기는지를 **여기서 다시 정하지 않으려고**
 *    이렇게 한다 (원칙 1 — 그 규칙은 `sentView` 한 곳에만 있다).
 * ⚠️ `scripts/check-screen-parent.mjs` 가 `lib/monthly.js` 의 그 문이 아직
 *    `v2.monthly_report` 를 (학생, 달)로 고르는지 확인한다 — 바뀌면 이 어댑터가 거짓이 된다.
 */
function monthlyRowDb(rows) {
  return {
    async query(_sql, params) {
      const ym = String(params?.[1] ?? "");
      return { rows: rows.filter((r) => String(r.ym) === ym) };
    },
  };
}

/** 아무것도 못 읽었을 때 — **예쁜 빈 화면을 만들지 않는다.** 왜 비었는지가 값에 실린다 */
function empty(problems, reads, extra = {}) {
  return {
    ok: false, reads, problems, limits: [],
    me: null, children: [], student: null,
    today: null, from: null, to: null,
    months: [], recent: [], homework: [], reports: [], requests: [],
    hideEmpty: hideEmptyCards(ROLE), startTimes: [],
    ...extra,
  };
}
