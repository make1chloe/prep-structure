import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddTaskForm from "./AddTaskForm";
import TaskBoard from "./TaskBoard";
import { todaySeoul } from "@/lib/day";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(
      "id, title, kind, category, due_on, end_on, start_time, status, class_id, note, deliver_body, deliver_scope, deliver_class_id, deliver_school, deliver_grade"
    )
    .eq("kind", "schedule")
    .order("due_on", { ascending: true });

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .order("start_time", { ascending: true });

  // 이미 전달사항을 만든 일정 표시
  const taskIds = (tasks || []).filter((t) => t.deliver_body).map((t) => t.id);
  const { data: made } = taskIds.length
    ? await supabase.from("notices").select("task_id, date").in("task_id", taskIds)
    : { data: [] };
  const madeMap = new Map((made || []).map((n) => [n.task_id, n.date]));

  const rows = (tasks || []).map((t) => ({ ...t, deliveredOn: madeMap.get(t.id) || null }));

  // 다른 화면에서 만든 일정도 여기서 같이 보여준다 (여기서 고치지는 않는다)
  //   시험 일정 → exam_periods (수업 스케줄 · 시험)
  //   휴강     → holidays      (수강료 · 수업 스케줄)
  const today = todaySeoul();

  const examQ = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date, to_date, english_on")
    .gte("to_date", today)
    .order("from_date", { ascending: true });
  const holQ = await supabase
    .from("holidays")
    .select("id, date, name, scope, class_id")
    .gte("date", today)
    .order("date", { ascending: true });

  const linked = [
    ...(examQ.error ? [] : examQ.data || []).map((e) => ({
      key: `exam-${e.id}`,
      from: e.from_date,
      to: e.to_date,
      title: `${e.school} ${e.grade || ""} ${e.name || "시험"}`.replace(/\s+/g, " ").trim(),
      extra: e.english_on ? `영어 ${e.english_on.slice(5)}` : "영어 시험일 미정",
      source: "시험",
      href: "/schedule",
    })),
    ...(holQ.error ? [] : holQ.data || []).map((h) => ({
      key: `hol-${h.id}`,
      from: h.date,
      to: h.date,
      title: h.name || "휴강",
      extra: h.scope === "all" ? "전체 휴강" : "반 휴강",
      source: "휴강",
      href: "/schedule",
    })),
  ].sort((a, b) => a.from.localeCompare(b.from));

  return (
    <>
      <TopBar profile={profile} active="tasks" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">일정</p>
          <h1 className="h1">학원 일정</h1>
          <p className="sub">
            날짜가 정해진 것만 넣습니다 (학사일정·특강·시험·상담 예약).
            학생에게 전할 내용을 함께 적으면 그날 전달사항으로 자동으로 깔립니다.
            처리해야 하는 일은 <b>할일</b> 메뉴에 있습니다.
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <AddTaskForm classes={classes || []} />
          </div>
        </div>

        <TaskBoard tasks={rows} classes={classes || []} unavailable={!!error} linked={linked} />
      </main>
    </>
  );
}
