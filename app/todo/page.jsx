import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import TodoBoard from "./TodoBoard";

export const dynamic = "force-dynamic";

export default async function TodoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const { data: cats, error: catErr } = await supabase
    .from("todo_categories")
    .select("id, name, parent_id, color, sort, active")
    .eq("active", true)
    .order("sort", { ascending: true });

  const TODO_COLS = "id, title, status, due_on, due_time, no_due, priority, note, todo_category_id, parent_id";
  let { data: todos, error } = await supabase
    .from("tasks")
    .select(`${TODO_COLS}, auto_key`)
    .eq("kind", "todo")
    .order("due_on", { ascending: true });
  if (error) {
    // 0028 전이면 auto_key 없이
    ({ data: todos, error } = await supabase
      .from("tasks")
      .select(TODO_COLS)
      .eq("kind", "todo")
      .order("due_on", { ascending: true }));
  }

  return (
    <>
      <TopBar profile={profile} active="todo" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">할일</p>
          <h1 className="h1">내가 할 일</h1>
          <p className="sub">
            날짜가 정해진 학사일정·특강은 <b>일정</b> 메뉴에 있습니다. 여기는 처리해야 하는 일만 모읍니다.
          </p>
        </div>
        <TodoBoard
          todos={todos || []}
          categories={cats || []}
          unavailable={!!error || !!catErr}
        />
      </main>
    </>
  );
}
