import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import CheckBoard from "./CheckBoard";
import { todaySeoul, addDays } from "@/lib/day";
import { loadRunningClasses } from "@/lib/classTerm";

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
export default async function CheckPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const date = searchParams?.d || todaySeoul();

  const [{ data: students }, { data: members }, { data: items }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, school, grade")
      .eq("status", "enrolled")
      .order("name", { ascending: true }),
    supabase.from("class_students").select("class_id, student_id"),
    supabase
      .from("homework_items")
      .select("id, name, sort, in_person, unit_test")
      .eq("active", true)
      .order("sort", { ascending: true }),
  ]);
  // 0063 전이면 '직접검사' 없이 (그러면 전부 제출 대상으로 본다)
  const itemList = items?.length
    ? items
    : ((await supabase
        .from("homework_items")
        .select("id, name, sort")
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
   */
  const unitTest = new Set(itemList.filter((i) => i.unit_test).map((i) => i.id));

  const classes = await loadRunningClasses(supabase, "id, name, days, start_time", date);

  // 오늘 리포트 + 그 안의 항목
  const { data: reports } = await supabase
    .from("daily_reports")
    .select("id, student_id, report_written")
    .eq("date", date);
  const repIds = (reports || []).map((r) => r.id);

  const ITEM = "id, daily_report_id, homework_item_id, status, student_done_at, range_note";
  let itemRows = [];
  if (repIds.length) {
    let q = await supabase
      .from("daily_report_items")
      .select(`${ITEM}, check_note`)
      .in("daily_report_id", repIds);
    if (q.error) {
      // 0062 전이면 한 줄 없이
      q = await supabase.from("daily_report_items").select(ITEM).in("daily_report_id", repIds);
    }
    itemRows = q.error ? [] : q.data || [];
  }

  // 지난 수업에 배정한 것 — **오늘 검사할 것**이 여기 있다
  const { data: prevReports } = await supabase
    .from("daily_reports")
    .select("id, student_id, date")
    .gte("date", addDays(date, -21))
    .lt("date", date)
    .order("date", { ascending: false });
  const prevIds = (prevReports || []).map((r) => r.id);
  // 배정한 것과 **검사한 것을 함께** 읽는다. 배정만 보면 2주 전에 내주고
  // 아직 못 본 숙제가 영영 안 뜬다 — 시험 기간에 밀린 것이 그렇게 사라진다.
  const { data: prevItems } = prevIds.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, homework_item_id, status, range_note")
        .in("daily_report_id", prevIds)
    : { data: [] };

  // 학생이 낸 것 (사진 · 녹음 · 체크리스트)
  const { data: subs } = await supabase
    .from("homework_submissions")
    .select("id, student_id, kind, path, body, seconds, checked_at, created_at, homework_item_id")
    .gte("date", addDays(date, -14))
    .lte("date", date)
    .order("created_at", { ascending: false });

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
  (subs || []).forEach((s) => {
    if (!subsOf.has(s.student_id)) subsOf.set(s.student_id, []);
    subsOf.get(s.student_id).push(s);
  });

  const classOf = new Map();
  (members || []).forEach((m) => {
    const c = classes.find((x) => x.id === m.class_id);
    if (c) classOf.set(m.student_id, c);
  });

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
          <p className="eyebrow">숙제 검사</p>
          <h1 className="h1">낸 것 보고 바로 찍기</h1>
          <p className="sub">
            사진·녹음을 <b>여기서 열어보고</b> 그 자리에서 ○△✕ 와 한 줄을 남깁니다.
            찍으면 목록에서 빠지고, <b>리포트에 그대로 들어갑니다.</b>
          </p>
        </div>
        <CheckBoard date={date} rows={rows} items={itemList} classes={classes} />
      </main>
    </>
  );
}
