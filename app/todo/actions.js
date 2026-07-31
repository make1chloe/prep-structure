"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function ok(error) {
  return { error: error ? error.message : null };
}

// ---------- 할일 분류 (직접 만들어 쓴다) ----------
export async function addCategory(name, parentId, color) {
  const n = (name || "").trim();
  if (!n) return { error: "이름을 적어주세요." };
  const supabase = createClient();
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
  const supabase = createClient();
  const { error } = await supabase.from("todo_categories").update(row).eq("id", id);
  revalidatePath("/tasks");
  return ok(error);
}

export async function deleteCategory(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("todo_categories").update({ active: false }).eq("id", id);
  revalidatePath("/tasks");
  return ok(error);
}

// ---------- 할일 ----------
export async function addTodo(input) {
  const { title, categoryId, dueOn, dueTime, priority, note, parentId, noDue } = input || {};
  const t = (title || "").trim();
  if (!t) return { error: "할 일을 적어주세요." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const supabase = createClient();
  const { error } = await supabase.from("tasks").update(row).eq("id", id);
  revalidatePath("/tasks");
  revalidatePath("/");
  return ok(error);
}

export async function setTodoStatus(ids, status) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, done_at: status === "done" ? new Date().toISOString() : null })
    .in("id", list);
  revalidatePath("/tasks");
  revalidatePath("/");
  return ok(error);
}

export async function moveTodos(ids, dueOn) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0 || !dueOn) return { error: null };
  const supabase = createClient();
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
  const supabase = createClient();
  const { error } = await supabase.from("tasks").delete().in("id", list);
  revalidatePath("/tasks");
  return ok(error);
}
