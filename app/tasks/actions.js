"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDays, dowOf, DOW as DOWN } from "@/lib/day";
import { loadRunningClasses } from "@/lib/classTerm";
import { inTarget, sameGrade } from "@/lib/who";
import { sessionUser } from "@/lib/session";
import { isImage, shownName } from "@/lib/noticeFile";

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

  const supabase = await createClient();
  const user = await sessionUser(supabase);

  const row = {
    title,
    kind: clean(formData, "kind") || "todo",
    category: clean(formData, "category"),
    due_on: clean(formData, "due_on") || new Date().toISOString().slice(0, 10),
    end_on: clean(formData, "end_on"),
    start_time: clean(formData, "start_time"),
    // 중요도 (0020) — 달력 점·막대 색이 이걸 본다 (2026-08-15)
    priority: parseInt(clean(formData, "priority") || "0", 10) || 0,
    class_id: clean(formData, "class_id"),
    note: clean(formData, "note"),
    deliver_body: clean(formData, "deliver_body"),
    notice_body: clean(formData, "notice_body"),
    absence_reason: clean(formData, "absence_reason"),
    // **비공개 = 나만 보기** (0066 의 private). 「누가 보나」 에서 비공개를
    // 고르면 대상이 비고 private 이 켜진다 — 자물쇠를 따로 두지 않는다
    deliver_scope: clean(formData, "deliver_scope"),
    private: !!clean(formData, "private"),
    // 날짜 미정 (0143) — due_on 은 대략 시기일 뿐, 달력에 안 박힌다
    date_tbd: !!clean(formData, "date_tbd"),
    deliver_class_id: clean(formData, "deliver_class_id"),
    deliver_school: clean(formData, "deliver_school"),
    deliver_grade: clean(formData, "deliver_grade"),
    // 하위목록 — 한 줄에 하나 (0117)
    checklist: (formData.get("checklist") || "")
      .toString().split("\n").map((s) => s.trim()).filter(Boolean).join("\n") || null,
    created_by: user?.id || null,
  };
  // 학생 지목 · 학교 연결 (0077). 칸이 없는 DB 면 그것만 빼고 넣는다.
  const picked = (formData.get("deliver_student_ids") || "")
    .toString()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const extra = {
    deliver_student_ids: picked,
    deliver_school_id: clean(formData, "deliver_school_id"),
  };
  let { error } = await supabase.from("tasks").insert({ ...row, ...extra });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0143 전이면 날짜 미정 칸이 없다
    const { date_tbd: _d, ...noTbd } = row;
    ({ error } = await supabase.from("tasks").insert({ ...noTbd, ...extra }));
    if (!error && row.date_tbd) {
      revalidatePath("/tasks");
      return { error: "날짜 미정으로 두려면 설정 → Supabase SQL 에서 0143 을 먼저 실행해주세요." };
    }
  }
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0117 전이면 하위목록 칸이 없다
    const { checklist: _c, date_tbd: _d2, ...noChecklist } = row;
    ({ error } = await supabase.from("tasks").insert({ ...noChecklist, ...extra }));
  }
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const { checklist: _c2, date_tbd: _d3, ...noChecklist2 } = row;
    await supabase.from("tasks").insert(noChecklist2);
  }
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0066 전이면 비공개 칸이 없다
    const { private: _p, checklist: _c3, date_tbd: _d4, ...bare } = row;
    await supabase.from("tasks").insert(bare);
  }
  revalidatePath("/tasks");
  revalidatePath("/today");
}

/**
 * **빠른 메모 전용 저장** (2026-08-21). addTask 는 /tasks·/today 를
 * revalidate 해서, 수업 중 메모 하나에 지금 보던 화면이 다시 그려졌다 —
 * 「화면 이동 없이 새로고침 없이」 가 약속이라 여기는 아무것도 안 갈아엎는다.
 * 할일 화면은 다음에 열 때 자연히 보인다.
 */
export async function addQuickMemo(text, paths = []) {
  const t = (text || "").trim();
  // 첨부 경로는 uploadTaskFile(photoActions)이 이미 올려둔 것 — 여기서는 줄에 담기만
  const photos = (paths || []).filter(Boolean);
  if (!t && photos.length === 0) return { error: null };
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  const [first, ...rest] = t.split("\n");
  // 글 없이 첨부만이면 제목은 「사진 메모」, 사진이 아니면 파일 이름 (2026-08-22)
  const title = first.trim()
    ? first.trim().slice(0, 200)
    : (isImage(photos[0]) ? "사진 메모" : shownName(photos[0]).slice(0, 200));
  const row = {
    title,
    kind: "todo",
    due_on: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
    note: rest.join("\n").trim() || null,
    created_by: user?.id || null,
  };
  let { error } = await supabase.from("tasks").insert(
    photos.length ? { ...row, photos } : row
  );
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0147 전이면 첨부 칸이 없다 — 메모만 저장하고, 첨부가 있을 때만 알린다
    ({ error } = await supabase.from("tasks").insert(row));
    if (!error && photos.length) {
      return {
        error: null,
        warn: "메모는 넣었지만 첨부는 못 담았어요. 설정 → Supabase SQL 에서 0147 을 실행해주세요.",
      };
    }
  }
  return { error: error?.message || null };
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
  if ("priority" in (patch || {})) row.priority = parseInt(patch.priority, 10) || 0;
  // 하위목록 — 이름을 고치면(줄 내용이 바뀌면) 그 줄의 체크는 떨어진다.
  // checklist_done 은 글자로 맞추므로, 이제 없는 줄의 체크는 자연히 안 보인다.
  if ("checklist" in (patch || {})) {
    row.checklist =
      (patch.checklist || "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n") || null;
  }
  ["class_id", "deliver_class_id", "assignee_id"].forEach((k) => {
    if (k in (patch || {})) row[k] = patch[k] || null;
  });
  // 나만 보기 — 켜면 학생·학부모 달력에서 빠진다 (0066)
  if ("private" in (patch || {})) row.private = !!patch.private;
  // 날짜 확정 — due_on 채우고 미정 표시를 끈다 (0143)
  if ("date_tbd" in (patch || {})) row.date_tbd = !!patch.date_tbd;
  if (!row.due_on && "due_on" in row) delete row.due_on; // 날짜는 비울 수 없음

  const supabase = await createClient();
  let { error } = await supabase.from("tasks").update(row).eq("id", id);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0117 전이면 하위목록 칸이 없다
    const { checklist: _c, ...noChecklist } = row;
    ({ error } = await supabase.from("tasks").update(noChecklist).eq("id", id));
    if (!error && "checklist" in row) {
      return { error: "하위목록을 적으려면 설정 → Supabase SQL 에서 0117 을 먼저 실행해주세요." };
    }
  }
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const { private: _p, checklist: _c2, date_tbd: _d5, ...noPriv } = row;
    ({ error } = await supabase.from("tasks").update(noPriv).eq("id", id));
    if (!error && "date_tbd" in row) {
      return { error: "날짜 미정을 쓰려면 설정 → Supabase SQL 에서 0143 을 먼저 실행해주세요." };
    }
  }
  revalidatePath("/tasks");
  revalidatePath("/today");
  revalidatePath("/me");
  return ok(error);
}

/**
 * 하위목록 한 줄을 체크·해제한다 (0117).
 *
 * **글자로 맞춘다** — checklist_done 은 체크된 줄의 글자 그대로를 담은
 * 배열이다. 자리(순서)로 맞추면 목록 순서를 바꿨을 때 엉뚱한 줄이
 * 체크된 것처럼 보인다.
 */
export async function toggleChecklistLine(taskId, line, checked) {
  if (!taskId || !line) return { error: "id 없음" };
  const supabase = await createClient();
  const { data: cur, error: readErr } = await supabase
    .from("tasks").select("checklist_done").eq("id", taskId).maybeSingle();
  if (readErr) {
    if (readErr.code === "42703" || readErr.code === "PGRST204") {
      return { error: "설정 → Supabase SQL 에서 0117 을 먼저 실행해주세요." };
    }
    return { error: readErr.message };
  }
  const had = new Set(cur?.checklist_done || []);
  if (checked) had.add(line); else had.delete(line);
  const { error } = await supabase
    .from("tasks").update({ checklist_done: [...had] }).eq("id", taskId);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

export async function setTaskStatus(ids, status) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ due_on: dueOn }).in("id", list);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return ok(error);
}

export async function deleteTasks(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().in("id", list);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return ok(error);
}

// ---------- 일정 → 전달사항 ----------
// 일정에 적어둔 전달 내용을 그 날짜의 학생 전달사항으로 깐다. (원칙3: 데이터가 흐르게)

export async function applyTaskDelivery(taskId, date) {
  if (!taskId) return { error: "일정이 없어요." };
  const supabase = await createClient();

  const BASE =
    "id, title, due_on, deliver_body, deliver_scope, deliver_class_id, deliver_school, deliver_grade";
  // 0077 전이면 학생 지목·학교 연결 칸이 없다
  let { data: task, error: tErr } = await supabase
    .from("tasks")
    .select(`${BASE}, deliver_student_ids, deliver_school_id`)
    .eq("id", taskId)
    .single();
  if (tErr) {
    ({ data: task, error: tErr } = await supabase
      .from("tasks")
      .select(BASE)
      .eq("id", taskId)
      .single());
  }
  if (tErr) return { error: tErr.message };
  if (!task?.deliver_body) return { error: "이 일정에는 전달할 내용이 없어요." };

  const on = date || task.due_on;

  // 이미 만든 적이 있으면 다시 만들지 않는다
  // 「이미 만들었나」 는 task_id + 날짜 + **종류**로 (전수검사 A12) —
  // 종류를 빼면 학부모 공지를 먼저 만든 일정이 「전달사항도 만들었다」 가 된다
  const { data: exist } = await supabase
    .from("notices")
    .select("id")
    .eq("task_id", taskId)
    .eq("date", on)
    .eq("kind", "memo")
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
  // 학생을 직접 고른 경우 — 그날 수업 오는 아이 중에서 고른 아이만 (0077)
  if (scope === "student") {
    const picked = new Set(task.deliver_student_ids || []);
    if (picked.size === 0) return { error: "받을 학생을 고르지 않았어요." };
    ids = ids.filter((id) => picked.has(id));
  }
  if (scope === "grade" && (task.deliver_school_id || task.deliver_school || task.deliver_grade)) {
    // 학교는 **표를 가리키는 것**이 먼저다 (0077). 「신송중」과 「신송중학교」가
    // 갈려서 아무에게도 안 가던 일이 여기서 생겼다. 옛 글자만 있으면 그것으로 맞춘다.
    const cols = task.deliver_school_id ? "id, school, grade, school_id" : "id, school, grade";
    let ss = ids.length
      ? await supabase.from("students").select(cols).in("id", ids)
      : { data: [] };
    if (ss.error) ss = await supabase.from("students").select("id, school, grade").in("id", ids);
    ids = (ss.data || [])
      .filter((s) => {
        // 견주는 규칙은 lib/who 한 곳에 있다 (「신정중」 과 「인천신정중학교」)
        if (task.deliver_school_id) {
          return s.school_id === task.deliver_school_id
            && (!task.deliver_grade || sameGrade(s.grade, task.deliver_grade));
        }
        return inTarget(s, { school: task.deliver_school, grade: task.deliver_grade });
      })
      .map((s) => s.id);
  }
  if (ids.length === 0) return { error: "그날 수업 오는 대상 학생이 없어요." };

  const { data: notice, error: nErr } = await supabase
    .from("notices")
    .insert({
      date: on,
      kind: "memo",
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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();
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

/**
 * 할일을 **일정으로 옮긴다** (또는 그 반대).
 *
 * 원장님 (2026-08-05) — 「학사일정 할일에 있어」 / 「그럼 저건 나이스 자료가 아니야?」
 *
 * **나이스 것은 아니다.** lib/neis 의 toTask 는 언제나 kind='schedule' 로 넣는다.
 * 노션 이관에서 들어온 것이고, 까닭은 **분류와 갈래가 따로 놀았기 때문**이다 —
 * 분류에 「학사일정」 이라고 적혀 있어도 갈래는 제목만 보고 짐작했다.
 * 「입학식」 처럼 제목에 방학·시험 같은 말이 없으면 짐작이 할일 쪽으로 떨어진다.
 * (짐작하는 쪽은 lib/importNotion 에서 고쳤다. 이건 이미 들어온 것을 옮기는 손이다)
 *
 * 지우고 새로 만들지 않는다 — 같은 줄이라 kind 만 바꾸면 된다.
 * 그래야 달아둔 메모·전달사항이 그대로 남는다.
 */
export async function moveKind(ids, kind = "schedule") {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  if (!["schedule", "todo"].includes(kind)) return { error: "알 수 없는 갈래예요." };
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ kind }).in("id", list);
  revalidatePath("/tasks");
  revalidatePath("/");
  return ok(error);
}
