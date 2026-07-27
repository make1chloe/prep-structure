"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";

function unavailable(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703");
}
const NEED = "0033 SQL 을 먼저 실행해주세요.";

/** 지금 로그인한 학생 */
async function meAs(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data?.id || null;
}

/**
 * 시작 — 하던 게 있으면 먼저 멈춘다.
 * 한 번에 하나만 한다. 둘을 동시에 켜두면 시간이 두 배로 잡힌다.
 */
export async function startStudy(homeworkItemId, stayTaskId, kind = "home") {
  const supabase = createClient();
  const sid = await meAs(supabase);
  if (!sid) return { error: "학생 계정으로 로그인해주세요." };
  const date = todaySeoul();

  const stop = await stopRunning(supabase, sid, date);
  if (stop.error) return stop;

  const row = {
    student_id: sid,
    date,
    homework_item_id: homeworkItemId || null,
    stay_task_id: stayTaskId || null,
    kind,
  };
  let { error } = await supabase.from("study_sessions").insert(row);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0034 전이면 kind 없이
    const { kind: _k, ...bare } = row;
    ({ error } = await supabase.from("study_sessions").insert(bare));
  }
  if (unavailable(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/me");
  return { error: null };
}

/**
 * 학습 완료 — 학생이 누른다.
 *
 * 타이머를 멈추고 "다 했어요" 를 남긴다.
 * **검사가 필요한 항목이면 이게 곧 검사 대기다.** 학생이 따로 부르지 않아도
 * 선생님 화면 대기줄에 올라가고, 선생님은 손이 빌 때 한꺼번에 본다.
 */
export async function finishStudy(reportItemId, homeworkItemId, stayTaskId, kind = "home") {
  const supabase = createClient();
  const sid = await meAs(supabase);
  if (!sid) return { error: "학생 계정으로 로그인해주세요." };

  const stop = await stopRunning(supabase, sid, todaySeoul());
  if (stop.error) return stop;

  if (reportItemId) {
    const { error } = await supabase
      .from("daily_report_items")
      .update({ student_done_at: new Date().toISOString() })
      .eq("id", reportItemId);
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      return { error: "0034 SQL 을 먼저 실행해주세요." };
    }
    if (error) return { error: error.message };
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null };
}

/** 잘못 눌렀을 때 되돌린다 */
export async function undoFinish(reportItemId) {
  if (!reportItemId) return { error: null };
  const supabase = createClient();
  const sid = await meAs(supabase);
  if (!sid) return { error: "학생 계정으로 로그인해주세요." };
  const { error } = await supabase
    .from("daily_report_items")
    .update({ student_done_at: null })
    .eq("id", reportItemId);
  revalidatePath("/me");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

async function stopRunning(supabase, sid, date) {
  const { data: open, error } = await supabase
    .from("study_sessions")
    .select("id, started_at")
    .eq("student_id", sid)
    .eq("date", date)
    .is("ended_at", null);
  if (unavailable(error)) return { error: NEED };
  if (error) return { error: error.message };

  const now = Date.now();
  for (const s of open || []) {
    const sec = Math.max(0, Math.round((now - new Date(s.started_at).getTime()) / 1000));
    await supabase
      .from("study_sessions")
      .update({ ended_at: new Date().toISOString(), seconds: sec })
      .eq("id", s.id);
  }
  return { error: null };
}

/** 멈춤 */
export async function stopStudy() {
  const supabase = createClient();
  const sid = await meAs(supabase);
  if (!sid) return { error: "학생 계정으로 로그인해주세요." };
  const res = await stopRunning(supabase, sid, todaySeoul());
  revalidatePath("/me");
  return res;
}
