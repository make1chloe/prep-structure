import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import PlanBoard from "./PlanBoard";

export const dynamic = "force-dynamic";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function PlanPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  // 기본은 다음 수업일 감각으로 내일
  const tomorrow = new Date(seoul.getTime() + 24 * 60 * 60 * 1000);
  const date = searchParams?.d || tomorrow.toISOString().slice(0, 10);
  const target = new Date(`${date}T00:00:00+09:00`);
  const dow = DAYS[target.getDay()];

  const { data: allClasses } = await supabase
    .from("classes")
    .select("id, name, days, start_time, end_time")
    .order("start_time", { ascending: true });
  const classes = (allClasses || []).filter((c) => (c.days || []).includes(dow));

  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id");
  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, status")
    .eq("status", "enrolled");
  const studentById = new Map((students || []).map((s) => [s.id, s]));

  // 그날 출결 (결석 예정 포함) — planned 컬럼이 없으면 기본 조회
  let { data: att, error: attErr } = await supabase
    .from("attendance")
    .select("student_id, status, planned, reason")
    .eq("date", date);
  const planReady = !attErr;
  if (attErr) {
    ({ data: att } = await supabase
      .from("attendance")
      .select("student_id, status")
      .eq("date", date));
  }
  const attById = new Map((att || []).map((a) => [a.student_id, a]));

  // 그날 이미 배정된 숙제 개수
  const { data: reports } = await supabase
    .from("daily_reports")
    .select("id, student_id")
    .eq("date", date);
  const reportIds = (reports || []).map((r) => r.id);
  const { data: dri } = reportIds.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, homework_item_id, status")
        .in("daily_report_id", reportIds)
        .eq("status", "assigned")
    : { data: [] };
  const countByReport = new Map();
  (dri || []).forEach((x) => {
    countByReport.set(x.daily_report_id, (countByReport.get(x.daily_report_id) || 0) + 1);
  });
  const assignedOf = new Map(
    (reports || []).map((r) => [r.student_id, countByReport.get(r.id) || 0])
  );

  const groups = classes.map((klass) => {
    const ids = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => m.student_id);
    const rows = ids
      .map((id) => studentById.get(id))
      .filter(Boolean)
      .map((s) => {
        const a = attById.get(s.id);
        return {
          student: s,
          plannedAbsent: !!(a?.planned && a.status === "absent"),
          reason: a?.reason || "",
          assignedCount: assignedOf.get(s.id) || 0,
        };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name, "ko"));
    return { klass, rows };
  });

  const { data: items } = await supabase
    .from("homework_items")
    .select("id, name, category, sort")
    .eq("active", true)
    .order("sort", { ascending: true });

  let { data: books } = await supabase
    .from("textbooks")
    .select("id, name, area, status")
    .order("name", { ascending: true });
  const textbooks = (books || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name, area: b.area || "" }));

  return (
    <>
      <TopBar profile={profile} active="plan" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">미리 작성</p>
          <h1 className="h1">다음 수업 준비</h1>
          <p className="sub">
            오늘이 아닌 날짜의 숙제 · 결석 예정 · 공지를 미리 넣어둡니다. 그날이 되면 오늘 수업 화면에 그대로 나타나요.
          </p>
        </div>
        <PlanBoard
          date={date}
          groups={groups}
          items={items || []}
          textbooks={textbooks}
          planReady={planReady}
        />
      </main>
    </>
  );
}
