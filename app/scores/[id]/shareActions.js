"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const OK = ["none", "student", "parent", "both"];

/**
 * 성적을 누구에게 보여줄지 (0101).
 *
 * 원장님 (2026-08-06) — 「성장 공개 대상 — 비공개 / 학생만 / 학부모만 / 둘다」
 *
 * 이 칸은 **읽기 규칙이 직접 본다** (0101 의 `score_visible`). 그래서 여기서
 * 바꾸면 화면에서 감춰지는 것이 아니라 자료째로 막힌다.
 */
export async function setScoreShare(studentId, share) {
  if (!studentId) return { error: "어느 학생인지 모르겠어요." };
  if (!OK.includes(share)) return { error: "고를 수 없는 값이에요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ score_share: share })
    .eq("id", studentId);

  if (error) {
    if (error.code === "PGRST204" || error.code === "42703") {
      return { error: "0101 SQL 을 먼저 실행해주세요." };
    }
    return { error: error.message };
  }

  revalidatePath("/scores");
  revalidatePath("/students");
  revalidatePath("/parent");
  revalidatePath("/me");
  return { error: null };
}
