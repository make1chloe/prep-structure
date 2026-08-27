import { createClient } from "@/lib/supabase/server";
import { isNoCheck } from "@/app/homework/categories";
import TopBar from "@/components/TopBar";
import Help, { helpOn } from "@/components/Help";
import CheckBoard from "./CheckBoard";
import AheadBoard from "./AheadBoard";
import { inUseOn } from "@/lib/bookUse";
import { todaySeoul, addDays } from "@/lib/day";
import { loadClassesWithTerm, running } from "@/lib/classTerm";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";
import { fetchAll } from "@/lib/fetchAll";

export const dynamic = "force-dynamic";

/**
 * 숙제 검사만 하는 화면.
 *
 * 오늘 수업 화면은 할 일이 많다 — 출결, 단어시험, 다음 숙제, 공지.
 * 그런데 **검사는 결이 다르다.** 사진과 녹음을 열어보고 ○△✕ 를 찍는 일이라,
 * 한 번 앉으면 쭉 이어서 하는 것이 빠르다.
 *
 * 그래서 여기서는 **검사할 것만** 늘어놓는다. 처리하면 목록에서 빠진다.
 */
export default async function CheckPage(props) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const user = await sessionUser(supabase);

  const date = searchParams?.d || todaySeoul();

  /**
   * **파도 1** (성능수리 v3 커밋 3 — 직렬 10단 → 3단, §1-5).
   * 날짜(또는 아무것도) 만 있으면 되는 조회를 전부 한꺼번에 띄운다.
   * id 의존 2벌(itemRows←repIds, prevItems←prevIds)만 파도 2 로,
   * 폴백(itemList 빈결과·itemRows 사다리·prev RPC 폴백)은 파도 뒤
   * 「실패/빈결과 시에만」 자리 그대로.
   *
   * **반 목록은 한 번만 읽는다** (전엔 2회 — 오늘 도는 반용·미리 내기용).
   * 두 호출은 필터 날짜가 달랐다: 검사 목록은 running(date), 미리 내기는
   * 날짜 인자 없이 running(undefined) — ends_on 을 안 보는 갈래다.
   * 병합 후에도 **두 조건을 각각 JS 로 재현**한다. 날짜 없는 갈래에서
   * 종강일 지난 특강이 미리 내기 반 목록에 남는 현행 동작(잠복 버그
   * 4호, §3-4)도 그대로다 — 수리는 별도 정합 건, 성능 커밋은 판정 무변경.
   */
  const [profileQ, studentQ, memberQ, itemQ, classAllQ, reportQ, prevQ0, subQ, stBookQ, bookQ] =
    await Promise.all([
      user ? cachedProfile(supabase, user.id) : Promise.resolve({ data: null }),
      supabase
        .from("students")
        .select("id, name, school, grade")
        .eq("status", "enrolled")
        .order("name", { ascending: true }),
      supabase.from("class_students").select("class_id, student_id"),
      supabase
        .from("homework_items")
        .select("id, name, sort, in_person, unit_test, category")
        .eq("active", true)
        .order("sort", { ascending: true }),
      // 기간 칸까지 챙겨 한 번만 — 거르기는 아래에서 조건별로 (classTerm 한 벌)
      loadClassesWithTerm(supabase, "id, name, days, start_time"),
      // 오늘 리포트 + 그 안의 항목
      supabase
        .from("daily_reports")
        .select("id, student_id, report_written")
        .eq("date", date),
      // 지난 수업에 배정한 것 — **오늘 검사할 것**이 여기 있다
      // 학생별 최근 40판 (0171) — 판(/today)과 같은 창을 써야 두 화면의
      // 검사 판정이 한 벌이다 (옛 21일 고정 창은 시험 기간에 밀린 숙제를
      // /today 와 다르게 잘랐다)
      supabase.rpc("prev_reports_of", { d: date }),
      // 학생이 낸 것 (사진 · 녹음 · 체크리스트) — 창은 배정 조회와 **같은
      // 21일**(0잔여-A #18: 15~21일 전 배정이 「안 냄」으로 오탐되던 것).
      // 21일이면 1000행 상한에 걸릴 수 있어 fetchAll 로 전부 받는다.
      fetchAll(() =>
        supabase
          .from("homework_submissions")
          .select("id, student_id, kind, path, body, seconds, checked_at, created_at, homework_item_id")
          .gte("date", addDays(date, -21))
          .lte("date", date)
          .order("created_at", { ascending: false })),
      // 끝까지 읽는다 (2026-08-23 전수) — 이 표는 그만둔 학생·끝낸 교재 줄도
      // 지우지 않고 쌓여서, 천 줄에서 조용히 잘리면 어떤 학생 교재가 통째로
      // 없는 것처럼 보인다 (2026-08-14 「오늘 진도가 재원생이랑 달라」와 같은 병)
      fetchAll(() =>
        supabase
          .from("student_textbooks")
          .select("student_id, textbook_id, status, assigned_on, ended_on")
          .order("student_id")
          .order("textbook_id")
      ),
      supabase
        .from("textbooks")
        .select("id, name, area, status")
        .order("name", { ascending: true }),
    ]);
  const profile = profileQ?.data || null;
  const students = studentQ.data;
  const members = memberQ.data;
  const items = itemQ.data;

  // 0063 전이면 '직접검사' 없이 (그러면 전부 제출 대상으로 본다)
  const itemList = items?.length
    ? items
    : ((await supabase
        .from("homework_items")
        // 0106 전이면 unit_test 가 없다. 분류는 처음부터 있으니 챙긴다 —
        // 이걸 빠뜨리면 「공지」 가 다시 검사 대상이 된다
        .select("id, name, sort, category")
        .eq("active", true)
        .order("sort", { ascending: true })).data || []);
  const inPerson = new Set(itemList.filter((i) => i.in_person).map((i) => i.id));
  /**
   * **단원평가는 검사 대상이 아니다** (원장님, 2026-08-07 — 「숙제에 체크하면
   * 검사할 대상이 아니라 공지의 개념으로 잡혀야 해서 완료·미완료·미흡 체크 안 함」).
   *
   * 아이가 결과를 내는 것이라 ○△✕ 로 매길 것이 없다. 그런데 검사 목록에
   * 남아 있으면 매일 「안 낸 숙제」 로 뜨고, 그것이 경고가 되고, 세 번이면
   * 반성문이 된다 — 안 한 적도 없는 아이가.
   *
   * 분류가 「공지」·「다음테스트」 인 것도 같다 (2026-08-07). 규칙은
   * app/homework/categories.js 의 isNoCheck 한 곳에 있다.
   */
  const unitTest = new Set(itemList.filter(isNoCheck).map((i) => i.id));

  // 오늘 도는 반 — 옛 loadRunningClasses(…, date) 와 같은 거름
  const classes = running(classAllQ, date);

  const { data: reports } = reportQ;
  const repIds = (reports || []).map((r) => r.id);

  let { data: prevReports, error: prevErr } = prevQ0;
  if (prevErr) {
    // 0171 전 DB — 옛 21일 창으로 폴백
    ({ data: prevReports } = await supabase
      .from("daily_reports")
      .select("id, student_id, date")
      .gte("date", addDays(date, -21))
      .lt("date", date)
      .order("date", { ascending: false }));
  }
  const prevIds = (prevReports || []).map((r) => r.id);

  // ── 파도 2 — id 의존 2벌 ─────────────────────────────
  const ITEM = "id, daily_report_id, homework_item_id, status, student_done_at, range_note";
  const [itemQ0, prevItemQ] = await Promise.all([
    // 학생 수 × 항목 수 — 1000줄을 넘으면 뒷 학생 숙제가 안 보인다 (B6)
    repIds.length
      ? fetchAll(() =>
          supabase
            .from("daily_report_items")
            .select(`${ITEM}, check_note`)
            .in("daily_report_id", repIds)
            .order("id"))
      : { data: [] },
    // 배정한 것과 **검사한 것을 함께** 읽는다. 배정만 보면 2주 전에 내주고
    // 아직 못 본 숙제가 영영 안 뜬다 — 시험 기간에 밀린 것이 그렇게 사라진다.
    prevIds.length
      ? fetchAll(() =>
          supabase
            .from("daily_report_items")
            .select("daily_report_id, homework_item_id, status, range_note")
            .in("daily_report_id", prevIds)
            .order("daily_report_id"))
      : { data: [] },
  ]);
  let itemRows = [];
  if (repIds.length) {
    let q = itemQ0;
    if (q.error) {
      // 0062 전이면 한 줄 없이
      q = await fetchAll(() =>
        supabase.from("daily_report_items").select(ITEM).in("daily_report_id", repIds).order("id"));
    }
    itemRows = q.error ? [] : q.data || [];
  }
  const { data: prevItems } = prevItemQ;

  // ── 학생별로 모은다 ──────────────────────────────────
  const repOf = new Map((reports || []).map((r) => [r.student_id, r]));
  const itemsOfRep = new Map();
  itemRows.forEach((i) => {
    if (!itemsOfRep.has(i.daily_report_id)) itemsOfRep.set(i.daily_report_id, []);
    itemsOfRep.get(i.daily_report_id).push(i);
  });

  // ── 아직 검사 안 한 숙제 ────────────────────────────
  //
  // "지난 수업에 낸 것" 만 보면 안 된다. 시험 기간에 못 끝낸 숙제, 결석해서
  // 넘어간 숙제가 그대로 사라진다. **3주 안에 배정한 것 중 아직 안 본 것**을
  // 전부 모은다.
  //
  // 안 본 것의 뜻: 배정한 날 **뒤에** 그 항목을 ○△✕ 로 찍은 기록이 없다.
  // (오늘 찍은 것은 남겨둔다 — 방금 잘못 눌렀을 때 고칠 수 있어야 한다)
  const dateOfRep = new Map((prevReports || []).map((r) => [r.id, r.date]));
  const stuOfRep = new Map((prevReports || []).map((r) => [r.id, r.student_id]));

  // 학생·항목별로 "언제 검사했나" (지난 리포트에서)
  const checkedAt = new Map();
  (prevItems || []).forEach((i) => {
    if (!["done", "weak", "missing"].includes(i.status)) return;
    const k = `${stuOfRep.get(i.daily_report_id)}:${i.homework_item_id}`;
    const d = dateOfRep.get(i.daily_report_id);
    if (!checkedAt.has(k) || d > checkedAt.get(k)) checkedAt.set(k, d);
  });

  const assignedOf = new Map();
  (prevItems || []).forEach((i) => {
    if (i.status !== "assigned") return;
    const sid = stuOfRep.get(i.daily_report_id);
    const on = dateOfRep.get(i.daily_report_id);
    if (!sid || !on) return;

    // 배정한 날 뒤에 검사한 적이 있으면 끝난 것이다
    const seen = checkedAt.get(`${sid}:${i.homework_item_id}`);
    if (seen && seen > on) return;

    const cur = assignedOf.get(sid) || { date: on, items: new Map() };
    // 같은 숙제를 여러 번 냈으면 **가장 최근 것**의 범위를 쓴다
    const had = cur.items.get(i.homework_item_id);
    if (!had || on > had.on) cur.items.set(i.homework_item_id, { ...i, on });
    if (on < cur.date) cur.date = on;     // 제일 오래 밀린 날짜를 적어준다
    assignedOf.set(sid, cur);
  });

  const subsOf = new Map();
  (subQ.data || []).forEach((s) => {
    if (!subsOf.has(s.student_id)) subsOf.set(s.student_id, []);
    subsOf.get(s.student_id).push(s);
  });

  const classOf = new Map();
  (members || []).forEach((m) => {
    const c = classes.find((x) => x.id === m.class_id);
    if (c) classOf.set(m.student_id, c);
  });

  /**
   * **미리 내기**가 쓰는 것 — 반·수업요일·쓰고 있는 교재.
   *
   * 검사 목록은 「오늘 검사할 아이」 만인데, 숙제는 **다음 수업 아무 반**에
   * 낼 수 있어야 한다. 그래서 명단을 따로 만든다. `classes` 는 오늘 도는
   * 반만이라, 여기서는 같은 반 목록을 **날짜 없는 거름**으로 다시 거른다
   * (옛 loadRunningClasses(supabase, …) 무날짜 호출과 같은 갈래 — 위 파도
   * 주석의 4호 재현 참고).
   */
  const allClasses = [...running(classAllQ, undefined)].sort(
    (a, b) => (a.start_time || "").localeCompare(b.start_time || "")
  );
  const stBooks = stBookQ.data;
  const daysOfClass = new Map((allClasses || []).map((c) => [c.id, c.days || []]));
  const cidsOf = new Map();
  (members || []).forEach((m) => {
    if (!cidsOf.has(m.student_id)) cidsOf.set(m.student_id, []);
    cidsOf.get(m.student_id).push(m.class_id);
  });
  const booksOf = new Map();
  (stBooks || []).forEach((r) => {
    // 사용 예정일이 아직 안 온 교재는 낼 것이 없다 (책이 없으니까)
    if (!inUseOn(r, date)) return;
    if (!booksOf.has(r.student_id)) booksOf.set(r.student_id, []);
    booksOf.get(r.student_id).push(r.textbook_id);
  });
  const aheadStudents = (students || []).map((s) => {
    const cids = cidsOf.get(s.id) || [];
    return {
      id: s.id, name: s.name, school: s.school, grade: s.grade,
      classIds: cids,
      days: [...new Set(cids.flatMap((cid) => daysOfClass.get(cid) || []))],
      bookIds: booksOf.get(s.id) || [],
    };
  });

  const textbooks = (bookQ.data || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name, area: b.area || "" }));

  const rows = (students || []).map((s) => {
    const rep = repOf.get(s.id) || null;
    const mine = rep ? itemsOfRep.get(rep.id) || [] : [];
    const marks = {};
    const notes = {};
    mine.forEach((i) => {
      if (["done", "weak", "missing"].includes(i.status)) {
        marks[i.homework_item_id] = i.status;
        if (i.check_note) notes[i.homework_item_id] = i.check_note;
      }
    });
    const assigned = assignedOf.get(s.id) || null;
    const doneAt = {};
    mine.forEach((i) => {
      if (i.student_done_at) doneAt[i.homework_item_id] = i.student_done_at;
    });

    return {
      student: s,
      klass: classOf.get(s.id) || null,
      hasReport: !!rep,
      marks,
      notes,
      doneAt,
      assignedOn: assigned?.date || null,
      // 검사할 것 = 3주 안에 배정했는데 아직 안 본 숙제
      toCheck: [...(assigned?.items?.values() || [])]
        .filter((i) => !unitTest.has(i.homework_item_id))
        .map((i) => ({
        id: i.homework_item_id,
        range: i.range_note || "",
        on: i.on,                    // 언제 낸 숙제인가 (밀린 것을 알 수 있게)
        // 공책처럼 앱에 낼 것이 없는 숙제 — '직접검사' 로 적고 미제출로 세지 않는다
        inPerson: inPerson.has(i.homework_item_id),
        // 낼 숙제인데 낸 것이 하나도 없다 = 안 낸 것
        noSub:
          !inPerson.has(i.homework_item_id) &&
          !(subsOf.get(s.id) || []).some((x) => x.homework_item_id === i.homework_item_id),
      })),
      subs: subsOf.get(s.id) || [],
    };
  });

  return (
    <>
      <TopBar profile={profile} active="check" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">오늘</p>
          <h1 className="h1">숙제 검사</h1>
          <Help>
            <p className="sub">
              사진·녹음을 <b>여기서 열어보고</b> 그 자리에서 ○△✕ 와 한 줄을 남깁니다.
              찍으면 목록에서 빠지고, <b>리포트에 그대로 들어갑니다.</b>
            </p>
          </Help>
        </div>
        <CheckBoard date={date} rows={rows} items={itemList} classes={classes} help={await helpOn()} />

        {/* **다음 수업 숙제는 검사하면서 정한다** (원장님, 2026-08-07 —
            「수업준비페이지가 필요없나 싶어」). 따로 있던 「수업 준비」 화면을
            여기로 접어 넣었다 — 접혀 있으므로 검사만 하실 때는 없는 것과 같다 */}
        <AheadBoard
          classes={allClasses || []}
          students={aheadStudents}
          items={itemList}
          textbooks={textbooks}
        />
      </main>
    </>
  );
}
