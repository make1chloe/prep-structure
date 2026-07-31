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
      .select("id, name, sort")
      .eq("active", true)
      .order("sort", { ascending: true }),
  ]);

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
  const { data: prevItems } = prevIds.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, homework_item_id, status, range_note")
        .in("daily_report_id", prevIds)
        .eq("status", "assigned")
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

  // 그 학생에게 마지막으로 배정된 숙제 (가까운 날 것이 이긴다)
  const assignedOf = new Map();
  (prevReports || []).forEach((r) => {
    if (assignedOf.has(r.student_id)) return;   // 이미 더 가까운 날 것을 담았다
    const mine = (prevItems || []).filter((i) => i.daily_report_id === r.id);
    if (mine.length) assignedOf.set(r.student_id, { date: r.date, items: mine });
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
      // 검사할 것 = 지난 수업에 배정한 숙제
      toCheck: (assigned?.items || []).map((i) => ({
        id: i.homework_item_id,
        range: i.range_note || "",
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
        <CheckBoard date={date} rows={rows} items={items || []} classes={classes} />
      </main>
    </>
  );
}
