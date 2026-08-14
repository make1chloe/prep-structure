"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { isStaffRole } from "@/lib/actAs";
import { sessionUser } from "@/lib/session";

/**
 * 체험하면서 남긴 오늘 기록을 지운다.
 *
 * 체험 모드에서 누른 것은 **진짜로 기록된다** — 가짜로 기록하면 시험이
 * 되지 않기 때문이다. 대신 그 자리에서 되돌릴 수 있어야 한다.
 * 안 그러면 원장님이 눌러본 시간이 그 학생의 습관 데이터에 섞인다.
 *
 * 지우는 것은 **오늘 그 학생의 것만**이다.
 *   · 타이머 기록 (study_sessions)
 *   · 학습완료 표시 (daily_report_items.student_done_at)
 *   · 등원 체크 (arrival_checks)
 * 숙제 검사 결과·리포트 본문처럼 선생님이 적은 것은 건드리지 않는다.
 */
export async function clearTryout(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = createClient();

  const user = await sessionUser(supabase);
  if (!user) return { error: "로그인이 필요해요." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isStaffRole(profile?.role)) return { error: "선생님만 지울 수 있어요." };

  const date = todaySeoul();
  const notes = [];

  // 1) 오늘 타이머 기록
  const { error: sErr } = await supabase
    .from("study_sessions")
    .delete()
    .eq("student_id", studentId)
    .eq("date", date);
  if (sErr) notes.push(`타이머: ${sErr.message}`);

  // 2) 오늘 등원 체크
  const { error: aErr } = await supabase
    .from("arrival_checks")
    .delete()
    .eq("student_id", studentId)
    .eq("date", date);
  if (aErr) notes.push(`등원 체크: ${aErr.message}`);

  // 3) 오늘 학습완료 표시 — 리포트 줄 자체는 두고 '눌렀다' 만 지운다
  const { data: rep } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (rep?.id) {
    const { error: dErr } = await supabase
      .from("daily_report_items")
      .update({ student_done_at: null })
      .eq("daily_report_id", rep.id)
      .not("student_done_at", "is", null);
    if (dErr) notes.push(`학습완료: ${dErr.message}`);
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: notes.length ? notes.join(" / ") : null };
}
