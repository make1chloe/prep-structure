"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/session";

function ok(error) {
  return { error: error ? error.message : null };
}

// ---------- 할일 분류 (직접 만들어 쓴다) ----------
export async function addCategory(name, parentId, color) {
  const n = (name || "").trim();
  if (!n) return { error: "이름을 적어주세요." };
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("todo_categories")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1);
  const { error } = await supabase.from("todo_categories").insert({
    name: n,
    parent_id: parentId || null,
    color: color || "muted",
    sort: (last?.[0]?.sort ?? 0) + 10,
  });
  if (error) return { error: "0020 SQL을 먼저 실행해주세요." };
  revalidatePath("/tasks");
  return { error: null };
}

export async function updateCategory(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = {};
  if ("name" in patch) row.name = (patch.name || "").trim();
  if ("color" in patch) row.color = patch.color || null;
  if ("sort" in patch) {
    const d = (patch.sort ?? "").toString().replace(/[^\d]/g, "");
    row.sort = d ? parseInt(d, 10) : 0;
  }
  if ("active" in patch) row.active = !!patch.active;
  const supabase = await createClient();
  const { error } = await supabase.from("todo_categories").update(row).eq("id", id);
  revalidatePath("/tasks");
  return ok(error);
}

export async function deleteCategory(id) {
  if (!id) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.from("todo_categories").update({ active: false }).eq("id", id);
  revalidatePath("/tasks");
  return ok(error);
}

// ---------- 할일 ----------
export async function addTodo(input) {
  const { title, categoryId, dueOn, dueTime, priority, note, parentId, noDue } = input || {};
  const t = (title || "").trim();
  if (!t) return { error: "할 일을 적어주세요." };

  const supabase = await createClient();
  const user = await sessionUser(supabase);

  const row = {
    title: t,
    kind: "todo",
    todo_category_id: categoryId || null,
    parent_id: parentId || null,
    priority: priority || 0,
    note: (note || "").trim() || null,
    no_due: !!noDue,
    due_on: noDue ? new Date().toISOString().slice(0, 10) : dueOn || new Date().toISOString().slice(0, 10),
    due_time: dueTime || null,
    created_by: user?.id || null,
  };
  const { error } = await supabase.from("tasks").insert(row);
  if (error) return { error: "0020 SQL을 먼저 실행해주세요." };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { error: null };
}

export async function updateTodo(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = {};
  ["title", "note", "due_on", "due_time"].forEach((k) => {
    if (k in (patch || {})) row[k] = (patch[k] ?? "").toString().trim() || null;
  });
  if ("todo_category_id" in (patch || {})) row.todo_category_id = patch.todo_category_id || null;
  if ("priority" in (patch || {})) row.priority = parseInt(patch.priority, 10) || 0;
  if ("no_due" in (patch || {})) row.no_due = !!patch.no_due;
  if (!row.due_on) delete row.due_on;
  // 하위목록 — 한 줄에 하나 (0117)
  if ("checklist" in (patch || {})) {
    row.checklist =
      (patch.checklist || "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n") || null;
  }

  const supabase = await createClient();
  let { error } = await supabase.from("tasks").update(row).eq("id", id);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0117 전이면 하위목록 칸이 없다
    const { checklist: _c, ...noChecklist } = row;
    ({ error } = await supabase.from("tasks").update(noChecklist).eq("id", id));
    if (!error && "checklist" in row) {
      revalidatePath("/tasks");
      revalidatePath("/");
      return { error: "하위목록을 적으려면 설정 → Supabase SQL 에서 0117 을 먼저 실행해주세요." };
    }
  }
  revalidatePath("/tasks");
  revalidatePath("/");
  return ok(error);
}

// 하위목록 체크·해제(toggleChecklistLine)는 여기 두지 않는다 —
// app/tasks/actions.js 에 한 곳으로 두고 여기서도 그걸 가져다 쓴다
// (「일정」 쪽 할일과 규칙이 같아야 한다. 두 벌이면 반드시 어긋난다).

export async function setTodoStatus(ids, status) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, done_at: status === "done" ? new Date().toISOString() : null })
    .in("id", list);
  revalidatePath("/tasks");
  revalidatePath("/");
  return ok(error);
}

/**
 * **손대기 시작했다 · 손 뗐다** (0113 — 칸반 가운데 칸).
 *
 * 진행중은 status 값이 아니라 `started_at` 이다. 그래서 이 함수는
 * status 를 **건드리지 않는다** — 진행중인 할일도 여전히 `open` 이고,
 * 메뉴 배지도 달력도 그대로 센다. 시작했다고 일이 없어지지는 않는다.
 *
 * 0113 전이면 칸이 없어 실패한다. 그때는 「SQL 을 실행해주세요」 라고
 * 말해야 한다 — 조용히 아무 일도 안 일어나면 원장님은 앱이 고장 난 줄 아신다.
 */
export async function setTodoStarted(ids, on = true) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (list.length === 0) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ started_at: on ? new Date().toISOString() : null })
    .in("id", list);
  if (error && /started_at/.test(error.message || "")) {
    return { error: "설정 → 관리자 → Supabase SQL 에서 0113 을 실행해주세요." };
  }
  revalidatePath("/tasks");
  revalidatePath("/");
  return ok(error);
}

export async function moveTodos(ids, dueOn) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0 || !dueOn) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ due_on: dueOn, no_due: false })
    .in("id", list);
  revalidatePath("/tasks");
  return ok(error);
}

export async function deleteTodos(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().in("id", list);
  revalidatePath("/tasks");
  return ok(error);
}
