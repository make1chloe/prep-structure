"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function ok(error) {
  return { error: error ? error.message : null };
}

export async function addHoliday(date, name, classId) {
  if (!date) return { error: "날짜를 골라주세요." };
  const supabase = createClient();
  const { error } = await supabase.from("holidays").insert({
    date,
    name: (name || "").trim() || null,
    scope: classId ? "class" : "all",
    class_id: classId || null,
  });
  revalidatePath("/tuition");
  revalidatePath("/today");
  return ok(error);
}

export async function deleteHoliday(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  revalidatePath("/tuition");
  return ok(error);
}

// 반 수강료 · 기준 회차
export async function setClassTuition(classId, tuition, baseSessions) {
  if (!classId) return { error: "반이 없어요." };
  const num = (v) => {
    const d = (v ?? "").toString().replace(/[^\d]/g, "");
    return d ? parseInt(d, 10) : null;
  };
  const supabase = createClient();
  const { error } = await supabase
    .from("classes")
    .update({ tuition: num(tuition), base_sessions: num(baseSessions) })
    .eq("id", classId);
  revalidatePath("/tuition");
  return ok(error);
}

// 학생 개별 금액 · 등원 시작일 / 퇴원일
export async function setStudentTuition(studentId, patch) {
  if (!studentId) return { error: "학생이 없어요." };
  const num = (v) => {
    const d = (v ?? "").toString().replace(/[^\d]/g, "");
    return d ? parseInt(d, 10) : null;
  };
  const row = {};
  if ("tuition" in patch) row.tuition = num(patch.tuition);
  if ("started_on" in patch) row.started_on = patch.started_on || null;
  if ("ended_on" in patch) row.ended_on = patch.ended_on || null;

  const supabase = createClient();
  const { error } = await supabase.from("students").update(row).eq("id", studentId);
  revalidatePath("/tuition");
  return ok(error);
}
