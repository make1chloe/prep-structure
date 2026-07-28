"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDays, dowOf } from "@/lib/day";
import { loadRunningClasses } from "@/lib/classTerm";


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
    notice_body: clean(formData, "notice_body"),
    absence_reason: clean(formData, "absence_reason"),
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
    "note", "deliver_body", "notice_body", "absence_reason",
    "deliver_scope", "deliver_school", "deliver_grade",
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
  const dow = dowOf(on);
  const classes = await loadRunningClasses(supabase, "id, days", on);
  const classIds = classes.filter((c) => (c.days || []).includes(dow)).map((c) => c.id);
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

// 일정에 적어둔 학부모 공지를 그날 공지로 깐다
export async function applyTaskNotice(taskId, date) {
  if (!taskId) return { error: "일정이 없어요." };
  const supabase = createClient();
  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, due_on, notice_body, deliver_scope, deliver_class_id, deliver_school, deliver_grade")
    .eq("id", taskId)
    .single();
  if (error) return { error: error.message };
  if (!task?.notice_body) return { error: "이 일정에는 학부모 공지 내용이 없어요." };

  const on = date || task.due_on;
  const { data: exist } = await supabase
    .from("notices")
    .select("id")
    .eq("task_id", taskId)
    .eq("date", on)
    .eq("kind", "notice")
    .limit(1);
  if (exist?.length) return { error: null, skipped: true };

  // 그날 수업 오는 학생 (위 전달사항 만들기와 같은 기준)
  const dow = dowOf(on);
  const classes = await loadRunningClasses(supabase, "id, days", on);
  const classIds = classes.filter((c) => (c.days || []).includes(dow)).map((c) => c.id);
  const { data: members } = classIds.length
    ? await supabase.from("class_students").select("student_id").in("class_id", classIds)
    : { data: [] };
  const ids = [...new Set((members || []).map((m) => m.student_id))];
  if (ids.length === 0) return { error: "그날 수업 오는 학생이 없어요." };

  const { data: notice, error: nErr } = await supabase
    .from("notices")
    .insert({ date: on, kind: "notice", scope: "all", body: task.notice_body, task_id: taskId })
    .select("id")
    .single();
  if (nErr) return { error: nErr.message };
  await supabase
    .from("notice_receipts")
    .insert(ids.map((student_id) => ({ notice_id: notice.id, student_id })));

  revalidatePath("/today");
  revalidatePath("/tasks");
  return { error: null, count: ids.length };
}

/**
 * 일정 기간(due_on ~ end_on) 전체를 결석 예정으로 깐다.
 * 가족여행처럼 여러 날 결석하는 경우를 한 번에 처리한다.
 */
export async function applyTaskAbsence(taskId) {
  if (!taskId) return { error: "일정이 없어요." };
  const supabase = createClient();
  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, title, due_on, end_on, absence_student_ids, absence_reason")
    .eq("id", taskId)
    .single();
  if (error) return { error: error.message };

  const ids = task?.absence_student_ids || [];
  if (ids.length === 0) return { error: "결석할 학생을 골라주세요." };

  const from = task.due_on;
  const to = task.end_on || task.due_on;
  const reason = task.absence_reason || task.title;

  // 기간 안에서 그 학생이 실제로 수업 있는 날만
  const classes = await loadRunningClasses(supabase, "id, days", from);
  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id")
    .in("student_id", ids);
  const daysOf = new Map(classes.map((c) => [c.id, c.days || []]));

  const DOWN = ["일", "월", "화", "수", "목", "금", "토"];
  const rows = [];
  for (const sid of ids) {
    const myDays = new Set(
      (members || []).filter((m) => m.student_id === sid).flatMap((m) => daysOf.get(m.class_id) || [])
    );
    let d = from;
    const end = to;
    while (d <= end) {
      if (myDays.has(dowOf(d))) {
        rows.push({ student_id: sid, date: d, status: "absent", planned: true, reason });
      }
      d = addDays(d, 1);
    }
  }
  if (rows.length === 0) return { error: "그 기간에 수업이 없어요." };

  const { error: aErr } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "student_id,date" });
  if (aErr) return { error: aErr.message };

  await supabase
    .from("tasks")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", taskId);

  revalidatePath("/tasks");
  revalidatePath("/today");
  revalidatePath("/plan");
  return { error: null, count: rows.length };
}

// 일정에 결석할 학생을 지정
export async function setTaskAbsenceStudents(taskId, studentIds, reason) {
  if (!taskId) return { error: "일정이 없어요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      absence_student_ids: studentIds || [],
      absence_reason: (reason || "").trim() || null,
    })
    .eq("id", taskId);
  revalidatePath("/tasks");
  return ok(error);
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
