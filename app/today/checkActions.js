"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { openAnswers } from "@/lib/answers";
import { addDays } from "@/lib/day";
import { checkMany } from "@/lib/checkWrite";
import { assignedUnitsFor } from "@/lib/dayCheck";
import { applyCheckProgress } from "@/lib/checkProgress";

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

  // 검사 쓰기는 check_many 한 문 (0163 — 계획서 v2 §2-4-①). 행이 제자리에서
  // 고쳐지니 학생 「다 했어요」·조교 메모(note null=유지)·제출물 소속이
  // 저절로 산다 — 옛 「지우고 다시 넣으며 살려 옮기기」 는 통째로 소멸.
  // status null = 취소(그 검사행 delete)도 같은 문이 맡는다.
  const { error } = await checkMany(supabase, rep.id, [
    { item_id: itemId, status: status || null, note: null },
  ]);
  if (error) return { error };

  // **검사가 답지를 연다** (0148) — 지난 배정의 답지만 (검사일 전날까지).
  // 판단은 lib/answers 한 곳, 실패해도 검사는 그대로 남는다.
  // ✕는 안 연다 (#22 — 안 해온 아이에게 답 먼저 금지).
  if (status && status !== "missing") {
    await openAnswers(supabase, { studentId, itemIds: [itemId], upTo: addDays(date, -1) });
  }

  // **여기서 찍은 검사도 진도를 움직인다** (계획서 v2 §2-4-② — 8/22
  // 확정의 원래 뜻. 전에는 판 저장만 진도를 움직여서, 대기줄에서 ○ 를
  // 주면 진도판이 그대로였다). 배정 단원은 판과 같은 판단(lib/dayCheck)
  // 의 1학생판으로 읽는다. 취소(null)는 미검사로 돌아가는 것 — 진도
  // 무접촉 (안 본 것과 손으로 찍은 것을 구별할 수 없다).
  let warn = null;
  if (status) {
    const units = await assignedUnitsFor(supabase, studentId, date);
    warn = await applyCheckProgress(studentId, date, [itemId], { [itemId]: status }, units);
  }

  revalidatePath("/today");
  return { error: null, warn };
}
