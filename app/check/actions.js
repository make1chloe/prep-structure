"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 숙제 검사 — **한 자리에서 끝낸다.**
 *
 * 지금까지는 학생 칸을 하나씩 열어야 사진·녹음을 볼 수 있었다. 열 명이면
 * 스무 번을 열고 닫는다. 여기서는 낸 것을 펼쳐놓고 보면서 그 자리에서 찍는다.
 *
 * 한 번 누르면 세 가지가 같이 끝나야 한다 (그래야 목록에서 빠진다).
 *   1. 검사 결과 (○△✕)
 *   2. 한 줄 코멘트 — 리포트에 그대로 나간다
 *   3. 낸 것을 '봤다' 고 표시
 */

function noteMissing(error) {
  return error && (error.code === "PGRST204" || error.code === "42703");
}

/**
 * 검사 한 건을 마무리한다.
 *
 * @param status ○ done · △ weak · ✕ missing · null 이면 취소
 */
export async function checkOne(studentId, date, itemId, status, note = "", submissionIds = []) {
  if (!studentId || !date || !itemId) return { error: "값이 부족해요." };
  const supabase = createClient();

  const { data: rep } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (!rep?.id) return { error: "이 날짜에 기록이 없어요. 먼저 출결을 찍어주세요." };

  // 같은 항목의 예전 결과는 지우고 새로 넣는다 (○ → △ 로 고칠 수 있게).
  // '배정' 과 '학원에서 할 것' 은 건드리지 않는다 — 검사 결과만 바꾼다.
  const { data: old } = await supabase
    .from("daily_report_items")
    .select("id, student_done_at")
    .eq("daily_report_id", rep.id)
    .eq("homework_item_id", itemId)
    .in("status", ["done", "weak", "missing"]);
  // 학생이 눌러둔 '학습 완료' 는 살린다
  const doneAt = (old || []).map((x) => x.student_done_at).find(Boolean) || null;

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
      check_note: (note || "").trim() || null,
    };
    let { error } = await supabase.from("daily_report_items").insert(row);
    if (noteMissing(error)) {
      // 0062 전이면 한 줄 없이 (검사는 되어야 한다)
      const { check_note, ...bare } = row;
      ({ error } = await supabase.from("daily_report_items").insert(bare));
    }
    if (error) return { error: error.message };
  }

  // 낸 것을 봤다고 표시 — 안 하면 대기줄에 계속 남는다
  const ids = (submissionIds || []).filter(Boolean);
  if (ids.length) {
    await supabase
      .from("homework_submissions")
      .update({ checked_at: new Date().toISOString() })
      .in("id", ids);
  }

  revalidatePath("/check");
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

/** 낸 것만 '봤다' 로 (검사 결과는 나중에) */
export async function seenSubmission(id, on = true) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("homework_submissions")
    .update({ checked_at: on ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath("/check");
  revalidatePath("/me");
  return { error: error ? error.message : null };
}
