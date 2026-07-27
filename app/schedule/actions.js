"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function ok(error) {
  return { error: error ? error.message : null };
}

// ---------- 시험 일정 ----------
// 1차: 기간만, 2차: 영어 시험일
export async function addExam(input) {
  const { school, grade, name, from, to } = input || {};
  if (!school || !from) return { error: "학교와 시작일을 넣어주세요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("exam_periods").insert({
    school: school.trim(),
    grade: (grade || "").trim() || null,
    name: (name || "").trim() || null,
    from_date: from,
    to_date: to || from,
    created_by: user?.id || null,
  });
  if (error) return { error: "0021 SQL을 먼저 실행해주세요." };
  revalidatePath("/schedule");
  return { error: null };
}

export async function setEnglishDate(id, englishOn) {
  if (!id) return { error: "id 없음" };
  const supabase = createClient();
  const { error } = await supabase
    .from("exam_periods")
    .update({ english_on: englishOn || null })
    .eq("id", id);
  revalidatePath("/schedule");
  return ok(error);
}

export async function updateExam(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = {};
  ["school", "grade", "name", "note"].forEach((k) => {
    if (k in (patch || {})) row[k] = (patch[k] ?? "").toString().trim() || null;
  });
  ["from_date", "to_date", "english_on"].forEach((k) => {
    if (k in (patch || {})) row[k] = patch[k] || null;
  });
  if (!row.school && "school" in row) return { error: "학교는 비울 수 없어요." };
  const supabase = createClient();
  const { error } = await supabase.from("exam_periods").update(row).eq("id", id);
  revalidatePath("/schedule");
  return ok(error);
}

export async function deleteExam(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("exam_periods").delete().eq("id", id);
  revalidatePath("/schedule");
  return ok(error);
}

// ---------- 시험 기간 → 결석 예정 일괄 ----------
export async function markExamAbsence(classId, dates, reason) {
  if (!classId || !dates?.length) return { error: "날짜가 없어요.", count: 0 };
  const supabase = createClient();
  const { data: members } = await supabase
    .from("class_students")
    .select("student_id")
    .eq("class_id", classId);
  const ids = (members || []).map((m) => m.student_id);
  if (ids.length === 0) return { error: "이 반에 학생이 없어요.", count: 0 };

  const rows = [];
  ids.forEach((sid) =>
    dates.forEach((d) =>
      rows.push({
        student_id: sid,
        date: d,
        status: "absent",
        planned: true,
        reason: reason || "시험 기간",
      })
    )
  );
  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "student_id,date" });
  if (error) return { error: error.message, count: 0 };
  revalidatePath("/schedule");
  revalidatePath("/today");
  return { error: null, count: rows.length };
}

// ---------- 영어 시험 전날 등원 일정 만들기 ----------
// 일정(tasks)으로 만들면 그날 전달사항으로 학생에게 자동 안내된다
export async function makeExamEveSession(input) {
  const { date, school, grade, classId, englishOn } = input || {};
  if (!date) return { error: "날짜가 없어요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const who = [school, grade].filter(Boolean).join(" ");
  const { data: exist } = await supabase
    .from("tasks")
    .select("id")
    .eq("due_on", date)
    .eq("kind", "schedule")
    .ilike("title", `%영어 시험 전날 등원%`)
    .limit(1);
  if (exist?.length) return { error: null, skipped: true };

  const { error } = await supabase.from("tasks").insert({
    title: `영어 시험 전날 등원 (${who || "전체"})`,
    kind: "schedule",
    category: "수업",
    due_on: date,
    class_id: classId || null,
    note: englishOn ? `영어 시험 ${englishOn}` : null,
    deliver_body: `내일 영어 시험이라 오늘은 꼭 등원해주세요. (정규수업일이 아니어도 등원)`,
    deliver_scope: grade ? "grade" : classId ? "class" : "all",
    deliver_class_id: classId || null,
    deliver_school: school || null,
    deliver_grade: grade || null,
    created_by: user?.id || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/schedule");
  revalidatePath("/tasks");
  return { error: null };
}

// ---------- 회차 많은 달 → 휴강 지정 ----------
export async function addClassHoliday(date, name, classId) {
  if (!date) return { error: "날짜를 골라주세요." };
  const supabase = createClient();
  const { error } = await supabase.from("holidays").insert({
    date,
    name: (name || "").trim() || "휴강",
    scope: classId ? "class" : "all",
    class_id: classId || null,
  });
  revalidatePath("/schedule");
  revalidatePath("/tuition");
  return ok(error);
}

// ---------- 공휴일인데 그냥 수업하기로 한 경우 ----------
/**
 * "쉴지 정해주세요" 알림에 대한 **또 하나의 답**이다.
 *
 * 지금까지는 휴강으로 지정하는 길밖에 없어서, 그냥 수업하기로 정해도
 * 알림이 계속 떴다. 결정을 했는데 화면이 그걸 모르는 상태가 되어버린다.
 *
 * 휴강(holidays)으로 넣으면 안 된다 — 수강료 회차에서 빠져버린다.
 * 그래서 **일정(tasks)에 한 줄** 남긴다.
 *   · 알림은 사라진다 (결정했으니까)
 *   · 일정 화면에 "어린이날 — 정상 수업" 으로 남아 나중에 왜 그랬는지 알 수 있다
 *   · 회차·수강료는 건드리지 않는다
 */
export async function keepClassOn(date, name) {
  if (!date) return { error: "날짜가 없어요." };
  const supabase = createClient();

  const title = `${(name || "공휴일").trim()} — 정상 수업`;

  // 이미 같은 날 같은 결정이 있으면 또 만들지 않는다
  const { data: exist } = await supabase
    .from("tasks")
    .select("id")
    .eq("due_on", date)
    .eq("title", title)
    .limit(1);
  if (exist?.length) return { error: null, already: true };

  const { error } = await supabase.from("tasks").insert({
    title,
    kind: "schedule",
    category: "학사일정",
    due_on: date,
    status: "open",
    note: "공휴일이지만 쉬지 않기로 함 (수강료 회차는 그대로 셉니다)",
  });
  if (error) return { error: error.message };

  revalidatePath("/schedule");
  revalidatePath("/tasks");
  revalidatePath("/");
  return { error: null };
}
