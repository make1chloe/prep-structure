"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { openAnswers } from "@/lib/answers";
import { addDays } from "@/lib/day";

/**
 * 검사 결과 한 건만 찍는다.
 *
 * 대기줄에서 바로 누르기 위한 것이다. 학생 칸을 열었다 닫았다 하면
 * 열 명이 한꺼번에 끝냈을 때 스무 번을 열어야 한다.
 */
export async function markCheck(studentId, date, itemId, status) {
  if (!studentId || !date || !itemId) return { error: "값이 부족해요." };
  const supabase = await createClient();

  const { data: rep } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (!rep?.id) return { error: "먼저 출결을 찍어주세요." };

  // 같은 항목의 예전 결과는 지우고 새로 넣는다 (○ → △ 로 고칠 수 있게).
  // 학생의 「학습 완료」와 조교가 /check 에서 단 검사 메모는 남의 칸이다 —
  // 지우고 다시 넣어도 살린다 (checkOne 과 같은 규칙. 전에는 여기만
  // 안 살려서, 어느 화면에서 찍었는지에 따라 결과가 달랐다).
  let { data: old, error: oldErr } = await supabase
    .from("daily_report_items")
    .select("id, student_done_at, check_note")
    .eq("daily_report_id", rep.id)
    .eq("homework_item_id", itemId)
    .in("status", ["done", "weak", "missing"]);
  if (oldErr) {
    // 0062 전 — 메모 칸 없이
    ({ data: old } = await supabase
      .from("daily_report_items")
      .select("id, student_done_at")
      .eq("daily_report_id", rep.id)
      .eq("homework_item_id", itemId)
      .in("status", ["done", "weak", "missing"]));
  }
  const doneAt = (old || []).map((x) => x.student_done_at).find(Boolean) || null;
  const oldNote = (old || []).map((x) => x.check_note).find(Boolean) || null;
  if (old?.length) {
    await supabase
      .from("daily_report_items")
      .delete()
      .in("id", old.map((x) => x.id));
  }

  if (status) {
    const row = {
      daily_report_id: rep.id,
      homework_item_id: itemId,
      status,
      student_done_at: doneAt,
      check_note: oldNote,
    };
    let { error } = await supabase.from("daily_report_items").insert(row);
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // 0062 전이면 한 줄 없이 (검사는 되어야 한다)
      const { check_note, ...bare } = row;
      ({ error } = await supabase.from("daily_report_items").insert(bare));
    }
    if (error) return { error: error.message };
    // **검사가 답지를 연다** (0148) — 지난 배정의 답지만 (검사일 전날까지).
    // 판단은 lib/answers 한 곳, 실패해도 검사는 그대로 남는다.
    await openAnswers(supabase, { studentId, itemIds: [itemId], upTo: addDays(date, -1) });
  }

  revalidatePath("/today");
  return { error: null };
}
