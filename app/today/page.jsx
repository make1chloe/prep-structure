import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import TodayBoard from "./TodayBoard";

export const dynamic = "force-dynamic";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function TodayPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  // 오늘(서울) 기준 날짜와 요일
  const seoul = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const date = searchParams?.d || seoul.toISOString().slice(0, 10);
  const target = new Date(`${date}T00:00:00+09:00`);
  const dow = DAYS[target.getDay()];

  // 오늘 요일에 수업이 있는 반
  const { data: allClasses } = await supabase
    .from("classes")
    .select("id, name, days, start_time, end_time, room, level, category")
    .order("start_time", { ascending: true });
  const classes = (allClasses || []).filter((c) => (c.days || []).includes(dow));

  // 반 배정 + 학생
  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id");
  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, status")
    .eq("status", "enrolled");

  // 오늘 출결 기록
  const { data: att } = await supabase
    .from("attendance")
    .select("student_id, status, makeup_of")
    .eq("date", date);

  // 오늘 리포트 + 숙제 항목 마스터 + 지난 진도
  const [{ data: reports }, { data: items }, { data: prevReports }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("id, student_id, attitude, word_correct, word_total, sent_correct, sent_total, own_progress, notice, report_written")
      .eq("date", date),
    supabase
      .from("homework_items")
      .select("id, name, category, sort")
      .eq("active", true)
      .order("sort", { ascending: true }),
    supabase
      .from("daily_reports")
      .select("student_id, own_progress, date")
      .lt("date", date)
      .not("own_progress", "is", null)
      .order("date", { ascending: false })
      .limit(300),
  ]);

  const reportByStudent = new Map((reports || []).map((r) => [r.student_id, r]));
  const lastProgress = new Map();
  (prevReports || []).forEach((r) => {
    if (!lastProgress.has(r.student_id)) lastProgress.set(r.student_id, r.own_progress);
  });

  // 리포트별 숙제 항목 상태
  const reportIds = (reports || []).map((r) => r.id);
  let itemsByReport = new Map();
  if (reportIds.length > 0) {
    const { data: dri } = await supabase
      .from("daily_report_items")
      .select("daily_report_id, homework_item_id, status")
      .in("daily_report_id", reportIds);
    (dri || []).forEach((x) => {
      if (!itemsByReport.has(x.daily_report_id)) itemsByReport.set(x.daily_report_id, {});
      itemsByReport.get(x.daily_report_id)[x.homework_item_id] = x.status;
    });
  }

  const studentById = new Map((students || []).map((s) => [s.id, s]));
  const attById = new Map((att || []).map((a) => [a.student_id, a]));
  const memberIds = new Set();

  const groups = classes.map((klass) => {
    const ids = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => m.student_id);
    const rows = ids
      .map((id) => studentById.get(id))
      .filter(Boolean)
      .map((s) => {
        memberIds.add(s.id);
        const a = attById.get(s.id);
        const rep = reportByStudent.get(s.id) || null;
        return {
          student: s,
          status: a?.status || null,
          isMakeup: a?.status === "makeup",
          report: rep,
          items: rep ? itemsByReport.get(rep.id) || {} : {},
          lastProgress: lastProgress.get(s.id) || null,
        };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name, "ko"));
    return { klass, rows };
  });

  // 오늘 반에 속하지 않지만 보강으로 오는 학생
  const extras = (att || [])
    .filter((a) => a.status === "makeup" && !memberIds.has(a.student_id))
    .map((a) => studentById.get(a.student_id))
    .filter(Boolean)
    .map((s) => {
      const rep = reportByStudent.get(s.id) || null;
      return {
        student: s,
        status: "makeup",
        isMakeup: true,
        report: rep,
        items: rep ? itemsByReport.get(rep.id) || {} : {},
        lastProgress: lastProgress.get(s.id) || null,
      };
    });
  if (extras.length > 0) {
    groups.push({
      klass: { id: "makeup", name: "보강", start_time: null, end_time: null },
      rows: extras,
    });
  }

  const label = `${target.getMonth() + 1}월 ${target.getDate()}일 (${dow})`;

  return (
    <>
      <TopBar profile={profile} active="today" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">오늘 수업</p>
          <h1 className="h1">{label}</h1>
        </div>
        <TodayBoard date={date} groups={groups} items={items || []} />
      </main>
    </>
  );
}
