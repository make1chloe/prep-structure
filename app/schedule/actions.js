"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toTeachers } from "@/lib/exams";

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
  if ("teachers" in (patch || {})) row.teachers = toTeachers(patch.teachers);
  if ("school_id" in (patch || {})) row.school_id = patch.school_id || null;
  ["from_date", "to_date", "english_on"].forEach((k) => {
    if (k in (patch || {})) row[k] = patch[k] || null;
  });
  if (!row.school && "school" in row) return { error: "학교는 비울 수 없어요." };
  const supabase = createClient();
  const { error } = await supabase.from("exam_periods").update(row).eq("id", id);
  revalidatePath("/schedule");
  return ok(error);
}

/**
 * 나이스 일정을 **내 시험에 붙인다** (0075).
 *
 * 붙인다고 내 것이 바뀌지는 않는다. 학교가 뭐라고 하는지를 옆에 적어둘 뿐이다.
 * 내 기간과 다르면 화면에서 "학교 일정이 바뀌었어요" 라고 알려주고,
 * **반영할지는 원장님이 누른다.** 조용히 바뀌면 시험 사흘 전에 자료 일정이
 * 어긋나 있어도 모른다.
 */
export async function attachNeis(examId, neis = {}) {
  if (!examId || !neis?.source_id) return { error: "붙일 일정이 없어요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("exam_periods")
    .update({
      neis_source_id: neis.source_id,
      neis_from: neis.from_date || null,
      neis_to: neis.to_date || neis.from_date || null,
      neis_name: neis.name || null,
      neis_seen_at: new Date().toISOString(),
    })
    .eq("id", examId);
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    return { error: "0075 SQL 을 먼저 실행해주세요." };
  }
  // 같은 일정이 다른 시험에 이미 붙어 있다
  if (error?.code === "23505") {
    return { error: "이 학교 일정은 다른 시험에 이미 붙어 있어요." };
  }
  revalidatePath("/schedule");
  revalidatePath("/prep");
  return ok(error);
}

/** 잘못 붙였을 때 — 내 시험은 그대로 남는다 */
export async function detachNeis(examId) {
  if (!examId) return { error: "id 없음" };
  const supabase = createClient();
  const { error } = await supabase
    .from("exam_periods")
    .update({
      neis_source_id: null, neis_from: null, neis_to: null,
      neis_name: null, neis_seen_at: null,
    })
    .eq("id", examId);
  revalidatePath("/schedule");
  return ok(error);
}

/**
 * 학교가 바꾼 날짜를 **내 것에 반영한다.**
 * 누를 때만 바뀐다 — 그게 이 설계의 전부다.
 */
export async function applyNeis(examId) {
  if (!examId) return { error: "id 없음" };
  const supabase = createClient();
  const { data: e, error: readErr } = await supabase
    .from("exam_periods")
    .select("id, from_date, to_date, english_on, neis_from, neis_to")
    .eq("id", examId)
    .maybeSingle();
  if (readErr) return ok(readErr);
  if (!e?.neis_from) return { error: "붙여둔 학교 일정이 없어요." };

  const row = { from_date: e.neis_from, to_date: e.neis_to || e.neis_from };
  // 영어 시험일이 새 기간 밖으로 밀려나면 비운다 — 틀린 날짜를 들고 있느니
  // 비어 있는 편이 낫다 (화면이 "영어 시험일 미정" 이라고 알려준다)
  if (e.english_on && (e.english_on < row.from_date || e.english_on > row.to_date)) {
    row.english_on = null;
  }
  const { error } = await supabase.from("exam_periods").update(row).eq("id", examId);
  revalidatePath("/schedule");
  revalidatePath("/prep");
  revalidatePath("/");
  return ok(error);
}

/**
 * 이 회차의 **등급컷**을 적는다.
 *
 * 컷은 학생 것이 아니라 **이 학교 이 회차 시험** 것이다. 여기 한 번 적으면
 * 이 시험을 본 학생 전부의 등급이 같은 기준으로 매겨진다. 성적 줄마다 적으면
 * 신송중 학생 셋이 같은 값을 세 번 적게 되고, 하나만 잘못 쳐도 그 학생만
 * 등급이 다르게 나온다 — 어느 것이 맞는지 알 수가 없다.
 *
 * @param text "90, 84, 77, 70" 처럼 1등급컷부터 순서대로
 */
export async function setExamCuts(id, text) {
  if (!id) return { error: "id 없음" };
  const nums = (text || "")
    .toString()
    .split(/[,\s/·]+/)
    .map((v) => Number(v.replace(/[^\d.]/g, "")))
    .filter((v) => Number.isFinite(v) && v > 0);

  // 1등급컷이 2등급컷보다 낮으면 순서를 거꾸로 적으신 것이다.
  // 조용히 뒤집으면 다음에 또 그렇게 적으시게 되므로 알려드린다.
  const desc = nums.every((v, i) => i === 0 || nums[i - 1] >= v);
  if (nums.length > 1 && !desc) {
    return { error: "1등급컷부터 높은 순서로 적어주세요. 예) 90, 84, 77, 70" };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("exam_periods")
    .update({ cuts: nums.length ? nums : null })
    .eq("id", id);
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    return { error: "0073 SQL 을 먼저 실행해주세요." };
  }
  revalidatePath("/schedule");
  revalidatePath("/scores");
  return ok(error);
}

/**
 * 필요 없는 시험을 숨긴다.
 *
 * 지우면 다시 받아올 때 또 들어오고, 그때마다 다시 지워야 한다.
 * 숨기면 기록이 남아서 **다시 받아도 숨긴 채로** 있다.
 */
export async function hideExam(id, on = true) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("exam_periods")
    .update({ hidden: !!on })
    .eq("id", id);
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    return { error: "0060 SQL 을 먼저 실행해주세요." };
  }
  revalidatePath("/schedule");
  revalidatePath("/tasks");
  revalidatePath("/");
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

/**
 * 휴강을 지운다 — 잘못 넣었거나 다시 수업하기로 한 경우.
 * 회차와 수강료가 같이 바뀌므로 지울 수 있어야 한다.
 */
export async function removeHoliday(id) {
  return removeHolidays([id]);
}

/** 골라서 한 번에 — 시험 기간 휴강을 통째로 걷을 때 하나씩 누르는 것이 일이다 */
export async function removeHolidays(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("holidays").delete().in("id", list);
  revalidatePath("/schedule");
  revalidatePath("/tuition");
  revalidatePath("/");
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
