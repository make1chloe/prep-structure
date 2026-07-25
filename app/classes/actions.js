"use server";

import { revalidatePath } from "next/cache";
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
  };

  const supabase = createClient();
  let { error } = await supabase.from("classes").insert(row);
  if (isMissingColumn(error)) {
    const { school_level, ...rest } = row;
    ({ error } = await supabase.from("classes").insert(rest));
  }
  revalidatePath("/classes");
  revalidatePath("/today");
}

export async function updateClass(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = {};
  const strs = ["name", "start_time", "end_time", "level", "category", "room", "school_level"];
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
    const { school_level, ...rest } = row;
    ({ error } = await supabase.from("classes").update(rest).eq("id", id));
  }
  revalidatePath("/classes");
  revalidatePath("/today");
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
