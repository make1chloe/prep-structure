"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * **가봤으면 지운다** (원장님, 2026-08-07 —
 * 「부르는 중을 해결했을 때 완료 처리해서 없애고 싶어」).
 *
 * ── 왜 안 지워지고 있었나 ────────────────────────────────
 *
 * 부르는 것은 아이가 켜고 **아이가 꺼야** 했다. 그런데 아이는 선생님이
 * 오시면 그걸로 끝난 것이라 폰을 다시 안 본다. 그래서 「🙋 부르는 중」 이
 * 현황판 맨 위에 그대로 남는다.
 *
 * 남아 있으면 두 가지가 망가진다.
 *   · 다음에 정말 부른 아이가 그 사이에 묻힌다
 *   · 몇 명이 기다리는지 세는 숫자가 거짓말이 된다
 *
 * 여기서는 **선생님이 지운다.** 표에는 학생당 한 줄뿐이라(0084) 줄을
 * 지우면 「아무것도 안 하는 중」 으로 돌아간다 — 아이가 자기 화면에서
 * 다시 누르면 그때부터 또 부르는 중이다.
 *
 * 표에 쓰는 권한은 이미 선생님에게 열려 있다 (0084). SQL 은 없다.
 */
export async function resolveCall(studentId) {
  if (!studentId) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("student_activity")
    .delete()
    .eq("student_id", studentId);
  if (error) return { error: error.message };
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

/** 여럿을 한 번에 — 수업이 끝날 때 남은 것을 쓸어담는 자리 */
export async function resolveAllCalls(studentIds) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0) return { error: null, count: 0 };
  const supabase = createClient();
  const { error } = await supabase
    .from("student_activity")
    .delete()
    .in("student_id", ids);
  if (error) return { error: error.message, count: 0 };
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null, count: ids.length };
}
