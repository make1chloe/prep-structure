"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 출결만 빠르게 찍기
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

function toInt(v) {
  const d = (v ?? "").toString().replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : null;
}

/**
 * 학생 한 명의 하루 기록을 한 번에 저장한다.
 *  - attendance: 출결
 *  - daily_reports: 점수 · 진도 · 태도 · 공지
 *  - daily_report_items: 숙제 항목별 상태(done/weak/missing)
 */
export async function saveStudentDay(studentId, date, form) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();

  // 1) 출결
  if (form.attendance) {
    const { error } = await supabase.from("attendance").upsert(
      { student_id: studentId, date, status: form.attendance },
      { onConflict: "student_id,date" }
    );
    if (error) return { error: error.message };
  }

  // 2) 리포트 본체
  //    지난 수업에 '배정한' 숙제가 오늘 모두 검사됐을 때만 '완료'로 본다
  const toCheck = Array.isArray(form.toCheck) ? form.toCheck : [];
  const checked = form.items || {};
  const unchecked = toCheck.filter((id) => !checked[id]);
  const complete = unchecked.length === 0;

  const row = {
    student_id: studentId,
    date,
    attendance_kind: form.attendance || null,
    attitude: form.attitude || null,
    word_correct: toInt(form.word_correct),
    word_total: toInt(form.word_total),
    sent_correct: toInt(form.sent_correct),
    sent_total: toInt(form.sent_total),
    own_progress: (form.own_progress || "").trim() || null,
    notice: (form.notice || "").trim() || null,
    report_written: complete,
  };
  const { data: report, error: repErr } = await supabase
    .from("daily_reports")
    .upsert(row, { onConflict: "student_id,date" })
    .select("id")
    .single();
  if (repErr) return { error: repErr.message };

  // 3) 숙제 항목 (기존 것 지우고 다시 넣기)
  const items = form.items || {};       // 검사 결과 { id: "done"|"weak"|"missing" }
  const nextIds = Array.isArray(form.nextHomework) ? form.nextHomework : []; // 다음 숙제
  const { error: delErr } = await supabase
    .from("daily_report_items")
    .delete()
    .eq("daily_report_id", report.id);
  if (delErr) return { error: delErr.message };

  const payload = [
    ...Object.entries(items)
      .filter(([, status]) => status)
      .map(([homework_item_id, status]) => ({
        daily_report_id: report.id,
        homework_item_id,
        status,
      })),
    // 다음 수업에 검사할 숙제 배정
    ...nextIds.map((homework_item_id) => ({
      daily_report_id: report.id,
      homework_item_id,
      status: "assigned",
    })),
  ];
  if (payload.length > 0) {
    const { error } = await supabase.from("daily_report_items").insert(payload);
    if (error) return { error: error.message };
  }

  revalidatePath("/today");
  return { error: null, complete, unchecked: unchecked.length };
}

// 완료 취소: 기록을 '미완료'로 되돌린다 (입력값은 그대로 둠)
export async function reopenReport(studentId, date) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ report_written: false })
    .eq("student_id", studentId)
    .eq("date", date);
  revalidatePath("/today");
  return { error: error ? error.message : null };
}
