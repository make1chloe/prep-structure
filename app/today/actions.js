"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 화면 라벨 ↔ DB enum(attendance_status)
export const ATT = [
  { key: "present", label: "정시" },
  { key: "late", label: "지각" },
  { key: "absent", label: "결석" },
  { key: "makeup", label: "보강" },
  { key: "early_leave", label: "조퇴" },
  { key: "online", label: "온라인" },
];

// 출결 저장 (하루 한 건, 있으면 갱신)
export async function setAttendance(studentId, date, status, note) {
  if (!studentId || !date || !status) return { error: "값이 부족해요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("attendance")
    .upsert(
      { student_id: studentId, date, status, note: note || null },
      { onConflict: "student_id,date" }
    );
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

// 출결 취소 (잘못 찍었을 때)
export async function clearAttendance(studentId, date) {
  if (!studentId || !date) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("student_id", studentId)
    .eq("date", date);
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

// 보강 등록: 오늘 이 반으로 오는 학생을 추가
export async function addMakeup(studentId, date, originalDate) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();
  const { error } = await supabase.from("attendance").upsert(
    {
      student_id: studentId,
      date,
      status: "makeup",
      makeup_of: originalDate || null,
    },
    { onConflict: "student_id,date" }
  );
  revalidatePath("/today");
  return { error: error ? error.message : null };
}
