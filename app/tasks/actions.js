"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const CATEGORIES = ["학사일정", "수업", "행정", "상담", "교재", "기타"];

function ok(error) {
  return { error: error ? error.message : null };
}
function clean(fd, key) {
  const v = (fd.get(key) || "").toString().trim();
  return v || null;
}

export async function addTask(formData) {
  const title = (formData.get("title") || "").toString().trim();
  if (!title) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    title,
    kind: clean(formData, "kind") || "todo",
    category: clean(formData, "category"),
    due_on: clean(formData, "due_on") || new Date().toISOString().slice(0, 10),
    end_on: clean(formData, "end_on"),
    start_time: clean(formData, "start_time"),
    class_id: clean(formData, "class_id"),
    note: clean(formData, "note"),
    deliver_body: clean(formData, "deliver_body"),
    deliver_scope: clean(formData, "deliver_scope"),
    deliver_class_id: clean(formData, "deliver_class_id"),
    deliver_school: clean(formData, "deliver_school"),
    deliver_grade: clean(formData, "deliver_grade"),
    created_by: user?.id || null,
  };
  await supabase.from("tasks").insert(row);
  revalidatePath("/tasks");
  revalidatePath("/today");
}

export async function updateTask(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = {};
  [
    "title", "kind", "category", "due_on", "end_on", "start_time",
    "note", "deliver_body", "deliver_scope", "deliver_school", "deliver_grade",
  ].forEach((k) => {
    if (k in (patch || {})) row[k] = (patch[k] ?? "").toString().trim() || null;
  });
  ["class_id", "deliver_class_id", "assignee_id"].forEach((k) => {
    if (k in (patch || {})) row[k] = patch[k] || null;
  });
  if (!row.due_on && "due_on" in row) delete row.due_on; // 날짜는 비울 수 없음

  const supabase = createClient();
  const { error } = await supabase.from("tasks").update(row).eq("id", id);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return ok(error);
}

export async function setTaskStatus(ids, status) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, done_at: status === "done" ? new Date().toISOString() : null })
    .in("id", list);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return ok(error);
}

export async function moveTasks(ids, dueOn) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0 || !dueOn) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("tasks").update({ due_on: dueOn }).in("id", list);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return ok(error);
}

export async function deleteTasks(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("tasks").delete().in("id", list);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return ok(error);
}

// ---------- 일정 → 전달사항 ----------
// 일정에 적어둔 전달 내용을 그 날짜의 학생 전달사항으로 깐다. (원칙3: 데이터가 흐르게)
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export async function applyTaskDelivery(taskId, date) {
  if (!taskId) return { error: "일정이 없어요." };
  const supabase = createClient();

  const { data: task, error: tErr } = await supabase
    .from("tasks")
    .select("id, title, due_on, deliver_body, deliver_scope, deliver_class_id, deliver_school, deliver_grade")
    .eq("id", taskId)
    .single();
  if (tErr) return { error: tErr.message };
  if (!task?.deliver_body) return { error: "이 일정에는 전달할 내용이 없어요." };

  const on = date || task.due_on;

  // 이미 만든 적이 있으면 다시 만들지 않는다
  const { data: exist } = await supabase
    .from("notices")
    .select("id")
    .eq("task_id", taskId)
    .eq("date", on)
    .limit(1);
  if (exist?.length) return { error: null, skipped: true };

  // 그날 수업 오는 학생 (오늘 수업 화면과 같은 기준)
  const target = new Date(`${on}T00:00:00+09:00`);
  const dow = DOW[target.getDay()];
  const { data: classes } = await supabase.from("classes").select("id, days");
  const classIds = (classes || []).filter((c) => (c.days || []).includes(dow)).map((c) => c.id);
  const { data: members } = classIds.length
    ? await supabase.from("class_students").select("class_id, student_id").in("class_id", classIds)
    : { data: [] };

  const scope = task.deliver_scope || "all";
  let ids = [...new Set((members || []).map((m) => m.student_id))];
  if (scope === "class" && task.deliver_class_id) {
    ids = [
      ...new Set(
        (members || [])
          .filter((m) => m.class_id === task.deliver_class_id)
          .map((m) => m.student_id)
      ),
    ];
  }
  if (scope === "grade" && (task.deliver_school || task.deliver_grade)) {
    const { data: ss } = ids.length
      ? await supabase.from("students").select("id, school, grade").in("id", ids)
      : { data: [] };
    ids = (ss || [])
      .filter(
        (s) =>
          (!task.deliver_school || s.school === task.deliver_school) &&
          (!task.deliver_grade || s.grade === task.deliver_grade)
      )
      .map((s) => s.id);
  }
  if (ids.length === 0) return { error: "그날 수업 오는 대상 학생이 없어요." };

  const { data: notice, error: nErr } = await supabase
    .from("notices")
    .insert({
      date: on,
      kind: "deliver",
      scope,
      class_id: scope === "class" ? task.deliver_class_id : null,
      school: scope === "grade" ? task.deliver_school : null,
      grade: scope === "grade" ? task.deliver_grade : null,
      body: task.deliver_body,
      task_id: taskId,
    })
    .select("id")
    .single();
  if (nErr) return { error: nErr.message };

  const { error: rErr } = await supabase
    .from("notice_receipts")
    .insert(ids.map((student_id) => ({ notice_id: notice.id, student_id })));
  if (rErr) return { error: rErr.message };

  revalidatePath("/today");
  revalidatePath("/tasks");
  return { error: null, count: ids.length };
}

// 여러 일정을 한 번에
export async function applyTasksDelivery(taskIds, date) {
  const list = Array.isArray(taskIds) ? taskIds : [taskIds];
  let made = 0;
  for (const id of list) {
    const res = await applyTaskDelivery(id, date);
    if (res.error) return { error: res.error, made };
    if (!res.skipped) made += 1;
  }
  return { error: null, made };
}
