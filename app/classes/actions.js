"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

function clean(formData, key) {
  const v = (formData.get(key) || "").toString().trim();
  return v || null;
}
function num(formData, key) {
  const v = (formData.get(key) || "").toString().replace(/[^\d]/g, "");
  return v ? parseInt(v, 10) : null;
}
function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}

export async function addClass(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const days = DAYS.filter((d) => formData.get(`day_${d}`));
  const row = {
    name,
    days,
    start_time: clean(formData, "start_time"),
    end_time: clean(formData, "end_time"),
    level: clean(formData, "level"),
    category: clean(formData, "category") || "정규반",
    room: clean(formData, "room"),
    capacity: num(formData, "capacity") ?? 5,
    school_level: clean(formData, "school_level"),
    starts_on: clean(formData, "starts_on"),
    ends_on: clean(formData, "ends_on"),
  };

  const supabase = createClient();
  let { data, error } = await supabase.from("classes").insert(row).select("id").single();
  if (isMissingColumn(error)) {
    // 0042·초중고 전 DB 에서도 반은 만들어져야 한다
    const { school_level, starts_on, ends_on, ...rest } = row;
    ({ data, error } = await supabase.from("classes").insert(rest).select("id").single());
  }
  revalidatePath("/classes");
  revalidatePath("/today");
  // 만든 반을 바로 열어 학생을 배정할 수 있게 한다
  if (!error && data?.id) redirect(`/classes?c=${data.id}`);
}

export async function updateClass(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = {};
  const strs = [
    "name", "start_time", "end_time", "level", "category", "room", "school_level",
    "starts_on", "ends_on",
  ];
  strs.forEach((k) => {
    if (k in (patch || {})) row[k] = (patch[k] || "").toString().trim() || null;
  });
  if ("capacity" in (patch || {})) {
    const d = (patch.capacity ?? "").toString().replace(/[^\d]/g, "");
    row.capacity = d ? parseInt(d, 10) : 5;
  }
  if ("days" in (patch || {})) row.days = Array.isArray(patch.days) ? patch.days : [];

  const supabase = createClient();
  let { error } = await supabase.from("classes").update(row).eq("id", id);
  if (isMissingColumn(error)) {
    const { school_level, starts_on, ends_on, ...rest } = row;
    ({ error } = await supabase.from("classes").update(rest).eq("id", id));
  }
  revalidatePath("/classes");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

/**
 * 손으로 보관하거나 되살린다.
 *
 * 대개는 종강일만 넣어두면 알아서 내려가므로 이 버튼을 쓸 일은 없다.
 * 기한 없이 흐지부지 끝난 반을 위한 길이다.
 *
 * 지우는 것이 **아니다.** 그 반의 리포트·출결·수강료 기록은 그대로 남고
 * 화면에서만 내려간다.
 */
export async function archiveClass(id, on = true) {
  if (!id) return { error: "반이 없어요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("classes")
    .update({ archived_at: on ? new Date().toISOString() : null })
    .eq("id", id);
  if (isMissingColumn(error)) return { error: "0042 SQL 을 먼저 실행해주세요." };
  revalidatePath("/classes");
  revalidatePath("/today");
  revalidatePath("/tuition");
  return { error: error ? error.message : null };
}

export async function deleteClasses(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("classes").delete().in("id", ids);
  revalidatePath("/classes");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

// 반에 학생 배정 (체크된 학생 = 최종 명단)
export async function setClassStudents(classId, studentIds) {
  if (!classId) return { error: "반이 없어요." };
  const supabase = createClient();

  const { data: current } = await supabase
    .from("class_students")
    .select("student_id")
    .eq("class_id", classId);
  const now = new Set((current || []).map((r) => r.student_id));
  const next = new Set(studentIds || []);

  const toAdd = [...next].filter((id) => !now.has(id));
  const toRemove = [...now].filter((id) => !next.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("class_students")
      .delete()
      .eq("class_id", classId)
      .in("student_id", toRemove);
    if (error) return { error: error.message };
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("class_students")
      .insert(toAdd.map((student_id) => ({ class_id: classId, student_id })));
    if (error) return { error: error.message };
  }

  revalidatePath("/classes");
  revalidatePath("/today");
  return { error: null };
}

// 반 엑셀 대량 업로드
export async function bulkAddClasses(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, error: null };
  }
  const payload = rows
    .filter((r) => (r?.name || "").trim() !== "")
    .map((r) => ({
      name: r.name.trim(),
      days: Array.isArray(r.days) ? r.days : [],
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      category: (r.category || "정규반").trim(),
      level: (r.level || "").trim() || null,
      school_level: (r.school_level || "").trim() || null,
      room: (r.room || "").trim() || null,
      capacity: r.capacity ?? 5,
    }));

  const supabase = createClient();
  let { error } = await supabase.from("classes").insert(payload);
  if (isMissingColumn(error)) {
    const trimmed = payload.map(({ school_level, ...rest }) => rest);
    ({ error } = await supabase.from("classes").insert(trimmed));
  }
  revalidatePath("/classes");
  revalidatePath("/today");
  return { inserted: error ? 0 : payload.length, error: error ? error.message : null };
}
