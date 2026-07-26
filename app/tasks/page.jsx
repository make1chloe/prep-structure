import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddTaskForm from "./AddTaskForm";
import TaskBoard from "./TaskBoard";

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

        <TaskBoard tasks={rows} classes={classes || []} unavailable={!!error} />
      </main>
    </>
  );
}
