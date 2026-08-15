"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/session";
import { todaySeoul, addMonths } from "@/lib/day";

/**
 * **다음 달 일정 확정** (0123, 원장님 2026-08-14~15).
 *
 * 흐름: 학부모가 다음 달 결석을 requests 로 보내고 → 「다음 달 일정 1차
 * 확인」 을 누른다(결석 없어도) → 원장님이 공휴일·시험 겹침까지 보고
 * 학생별로 회차를 확정한다. 25일까지 확정이 안 남으면 배지로 독촉.
 * 수납 안내는 앱 밖 — 여기서는 확정됐다는 상태만 보인다.
 */

/** 다음 달 'YYYY-MM' */
export async function nextYm() {
  return addMonths(todaySeoul().slice(0, 7), 1);
}

/** 학부모 — 이 아이의 다음 달 일정을 1차 확인 */
export async function parentConfirmMonth(studentId) {
  if (!studentId) return { error: "어느 학생인지 모르겠어요." };
  const supabase = createClient();
  const user = await sessionUser(supabase);
  const ym = addMonths(todaySeoul().slice(0, 7), 1);
  const { error } = await supabase.from("month_confirms").upsert(
    {
      student_id: studentId,
      ym,
      parent_at: new Date().toISOString(),
      parent_by: user?.id || null,
    },
    { onConflict: "student_id,ym" }
  );
  if (error && (error.code === "42P01" || error.code === "PGRST205")) {
    return { error: "아직 준비 중이에요 — 학원에 말씀해주세요. (0123)" };
  }
  revalidatePath("/parent");
  revalidatePath("/schedule");
  return { error: error ? error.message : null, ym };
}

/** 원장 — 학생들의 다음 달 회차를 확정 (여럿 한 번에) */
export async function principalConfirmMonth(studentIds, ym) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0 || !ym) return { error: "학생을 골라주세요." };
  const supabase = createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("month_confirms").upsert(
    ids.map((sid) => ({ student_id: sid, ym, principal_at: now })),
    { onConflict: "student_id,ym" }
  );
  if (error && (error.code === "42P01" || error.code === "PGRST205")) {
    return { error: "0123 SQL 을 먼저 실행해주세요 (관리자 → 설정 → SQL)." };
  }
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}

/** 원장 — 확정을 되돌린다 (잘못 눌렀을 때) */
export async function principalUnconfirmMonth(studentId, ym) {
  if (!studentId || !ym) return { error: "값이 부족해요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("month_confirms")
    .update({ principal_at: null })
    .eq("student_id", studentId)
    .eq("ym", ym);
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}
