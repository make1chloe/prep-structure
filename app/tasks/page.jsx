import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddTaskForm from "./AddTaskForm";
import TaskBoard from "./TaskBoard";
import TodoBoard from "../todo/TodoBoard";
import { todaySeoul } from "@/lib/day";
import { hiddenExamIds } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// 일정과 할일은 같은 테이블(tasks)이다. 화면도 하나로 합치고,
// 위의 버튼으로 [통합] [일정만] [할일만] 을 오간다.
//   /todo 는 이 화면의 ?view=todo 로 온다 (옛 주소·즐겨찾기가 안 깨지게)
const VIEWS = [
  { key: "all", label: "통합" },
  { key: "schedule", label: "일정만" },
  { key: "todo", label: "할일만" },
];

export default async function TasksPage({ searchParams }) {
  const view = VIEWS.some((v) => v.key === searchParams?.view) ? searchParams.view : "all";
  const wantSchedule = view !== "todo";
  const wantTodo = view !== "schedule";
  // 지난 일정은 기본으로 안 보인다.
  // 나이스에서 한 해치를 받으면 지난 3~7월 학교 행사가 통째로 쌓여서,
  // 앞으로 무슨 일이 있는지가 그 아래로 묻힌다. 필요하면 켜서 본다.
  const showPast = searchParams?.past === "1";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  // ── 일정 ──────────────────────────────────────────────
  let rows = [];
  let linked = [];
  let classes = [];
  let taskErr = false;
  if (wantSchedule) {
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select(
        "id, title, kind, category, due_on, end_on, start_time, status, class_id, note, deliver_body, deliver_scope, deliver_class_id, deliver_school, deliver_grade"
      )
      .eq("kind", "schedule")
      .gte("due_on", showPast ? "1900-01-01" : todaySeoul())
      .order("due_on", { ascending: true });
    taskErr = !!error;

    const { data: cls } = await supabase
      .from("classes")
      .select("id, name")
      .order("start_time", { ascending: true });
    classes = cls || [];

    // 이미 전달사항을 만든 일정 표시
    const taskIds = (tasks || []).filter((t) => t.deliver_body).map((t) => t.id);
    const { data: made } = taskIds.length
      ? await supabase.from("notices").select("task_id, date").in("task_id", taskIds)
      : { data: [] };
    const madeMap = new Map((made || []).map((n) => [n.task_id, n.date]));
    rows = (tasks || []).map((t) => ({ ...t, deliveredOn: madeMap.get(t.id) || null }));

    // 다른 화면에서 만든 일정도 여기서 같이 보여준다 (여기서 고치지는 않는다)
    //   시험 일정 → exam_periods (수업 스케줄 · 시험)
    //   휴강     → holidays      (수강료 · 수업 스케줄)
    const today = todaySeoul();
    const examQ = await supabase
      .from("exam_periods")
      .select("id, school, grade, name, from_date, to_date, english_on")
      .gte("to_date", today)
      .order("from_date", { ascending: true });
    const hiddenExams = await hiddenExamIds(supabase);
    const holQ = await supabase
      .from("holidays")
      .select("id, date, name, scope, class_id")
      .gte("date", today)
      .order("date", { ascending: true });

    linked = [
      ...(examQ.error ? [] : examQ.data || [])
        .filter((e) => !hiddenExams.has(e.id))   // 숨긴 시험은 뺀다
        .map((e) => ({
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
  }

  // ── 할일 ──────────────────────────────────────────────
  let todos = [];
  let cats = [];
  let todoErr = false;
  if (wantTodo) {
    const catQ = await supabase
      .from("todo_categories")
      .select("id, name, parent_id, color, sort, active")
      .eq("active", true)
      .order("sort", { ascending: true });
    cats = catQ.error ? [] : catQ.data || [];

    const TODO_COLS =
      "id, title, status, due_on, due_time, no_due, priority, note, todo_category_id, parent_id";
    let { data, error } = await supabase
      .from("tasks")
      .select(`${TODO_COLS}, auto_key`)
      .eq("kind", "todo")
      .order("due_on", { ascending: true });
    if (error) {
      // 0028 전이면 auto_key 없이
      ({ data, error } = await supabase
        .from("tasks")
        .select(TODO_COLS)
        .eq("kind", "todo")
        .order("due_on", { ascending: true }));
    }
    todos = data || [];
    todoErr = !!error || !!catQ.error;
  }

  return (
    <>
      <TopBar profile={profile} active="tasks" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">할일 · 일정</p>
          <h1 className="h1">
            {view === "todo" ? "내가 할 일" : view === "schedule" ? "학원 일정" : "할일 · 일정"}
          </h1>
          <p className="sub">
            <b>일정</b>은 날짜가 정해진 것 — 학사일정·특강·시험·상담 예약. 전할 내용을 적으면
            그날 학생 공지로 깔립니다. <b>할일</b>은 처리해야 하는 일입니다.
          </p>
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                className={`btn btn-sm ${view === v.key ? "btn-primary" : ""}`}
                href={v.key === "all" ? "/tasks" : `/tasks?view=${v.key}`}
              >
                {v.label}
              </Link>
            ))}
          </div>
        </div>

        {wantSchedule && (
          <section>
            {view === "all" && (
              <h2 style={{ margin: "6px 0 8px", fontSize: 15, fontWeight: 800 }}>일정</h2>
            )}
            <div className="row" style={{ marginBottom: 10, alignItems: "center", gap: 8 }}>
              <AddTaskForm classes={classes} />
              <span className="spacer" />
              <Link
                className="btn btn-ghost btn-sm"
                href={
                  showPast
                    ? `/tasks${view === "all" ? "" : `?view=${view}`}`
                    : `/tasks?past=1${view === "all" ? "" : `&view=${view}`}`
                }
              >
                {showPast ? "지난 일정 숨기기" : "지난 일정도 보기"}
              </Link>
            </div>
            <TaskBoard tasks={rows} classes={classes} unavailable={taskErr} linked={linked} />
          </section>
        )}

        {wantTodo && (
          <section style={view === "all" ? { marginTop: 22 } : undefined}>
            {view === "all" && (
              <h2 style={{ margin: "6px 0 8px", fontSize: 15, fontWeight: 800 }}>할일</h2>
            )}
            <TodoBoard todos={todos} categories={cats} unavailable={todoErr} />
          </section>
        )}
      </main>
    </>
  );
}
