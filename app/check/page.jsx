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
      toCheck: [...(assigned?.items?.values() || [])].map((i) => ({
        id: i.homework_item_id,
        range: i.range_note || "",
        on: i.on,                    // 언제 낸 숙제인가 (밀린 것을 알 수 있게)
        // 이 숙제로 낸 것이 하나도 없나 — 화면에 '안 냄' 으로 알려준다.
        // 다만 **자동으로 ✕ 를 찍지는 않는다.** 워크북처럼 공책으로 보는 숙제는
        // 앱에 낼 것이 없어서, 안 냈다고 미제출로 몰면 성실한 아이가 억울해진다.
        noSub: !(subsOf.get(s.id) || []).some((x) => x.homework_item_id === i.homework_item_id),
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
