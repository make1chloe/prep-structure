"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pushToStaff } from "@/app/push/actions";
import { todaySeoul } from "@/lib/day";
import { resolveStudent } from "@/lib/actAs";
import { needSql } from "@/lib/sqlError";

const NEED = "0033 SQL 을 먼저 실행해주세요.";

/** 지금 눌러야 할 학생 — 신원 판정은 lib/actAs 한 벌 */
async function meNow(supabase) {
  const { studentId } = await resolveStudent(supabase);
  return studentId;
}

/**
 * 시작 — 하던 게 있으면 먼저 멈춘다.
 * 한 번에 하나만 한다. 둘을 동시에 켜두면 시간이 두 배로 잡힌다.
 */
export async function startStudy(homeworkItemId, stayTaskId, kind = "home") {
  const supabase = await createClient();
  const sid = await meNow(supabase);
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
  if (needSql(error)) return { error: NEED };
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
  const supabase = await createClient();
  const sid = await meNow(supabase);
  if (!sid) return { error: "학생 계정으로 로그인해주세요." };

  // **숙제는 내야 끝난 것이다.**
  //   "다 했어요" 는 말일 뿐이고, 물어보면 다들 했다고 한다. 사진이든 녹음이든
  //   낸 것이 있어야 끝난 것으로 친다.
  //   낼 것이 없는 숙제(공책처럼 직접 보고 검사하는 것)만 그냥 넘어간다.
  if (kind === "home" && homeworkItemId) {
    const miss = await needsSubmission(supabase, sid, homeworkItemId, reportItemId);
    if (miss) return { error: miss };
  }

  const stop = await stopRunning(supabase, sid, todaySeoul());
  if (stop.error) return stop;

  if (reportItemId) {
    // .select() 로 몇 줄이 바뀌었는지 확인한다 — RLS 에 막히면 update 는
    // 0행 갱신 + 오류 없음이라, 확인 안 하면 「다 했어요」가 조용히
    // 사라진다 (0158 전에 실제로 그랬다).
    const { data: done, error } = await supabase
      .from("daily_report_items")
      .update({ student_done_at: new Date().toISOString() })
      .eq("id", reportItemId)
      .select("id");
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      return { error: "0034 SQL 을 먼저 실행해주세요." };
    }
    if (error) return { error: error.message };
    if (!done || done.length === 0) {
      return { error: "완료 표시가 저장되지 않았어요. 원장님께 알려주세요. (0158 SQL)" };
    }
  }

  // ── 선생님께 알린다 ────────────────────────────────────────
  //
  // 원장님 (2026-08-05) — 「아이 상태가 바뀌면 알림 오게 해줘. 워치랑 연동하게.
  // **숙제는 제외하고 수업 중에만**」
  //
  // 그래서 등원 학습(class)만 보낸다. 숙제(home)는 집에서 하는 것이라 밤에
  // 울린다 — 그러면 알림을 통째로 꺼버리시게 되고, 정작 부르는 것도 못 받는다.
  //
  // 알림이 실패해도 「다 했어요」 는 이미 저장됐다. 여기서 오류를 내면 아이는
  // 자기가 안 눌린 줄 알고 다시 누른다.
  if (kind === "class") {
    try {
      await notifyDone(supabase, sid, homeworkItemId);
    } catch { /* 알림은 곁다리다 — 실패해도 기록은 남는다 */ }
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null };
}

/**
 * **몇 개 중 몇 개째인지까지 적어 보낸다.**
 *
 * 「김서은 다 했어요」 만 오면 그래서 지금 가봐야 하는지 알 수가 없다.
 * 「3/5」 면 아직 하는 중이고 「5/5」 면 손이 비었다는 뜻이다.
 */
async function notifyDone(supabase, sid, homeworkItemId) {
  const today = todaySeoul();
  const [{ data: stu }, { data: rep }, { data: item }] = await Promise.all([
    supabase.from("students").select("name").eq("id", sid).maybeSingle(),
    supabase.from("daily_reports").select("id").eq("student_id", sid).eq("date", today).maybeSingle(),
    homeworkItemId
      ? supabase.from("homework_items").select("name").eq("id", homeworkItemId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!rep?.id) return;

  // 「등원 학습」 구분은 kind 칸이 아니라 status='inclass' 다 — kind 칸은
  // 이 표에 없어서(42703) 이 알림이 한 번도 제대로 센 적이 없었다 (#24).
  const { data: rows } = await supabase
    .from("daily_report_items")
    .select("status, student_done_at")
    .eq("daily_report_id", rep.id);
  const mine = (rows || []).filter((r) => r.status === "inclass");
  const total = mine.length;
  const done = mine.filter((r) => r.student_done_at).length;

  await pushToStaff({
    title: total > 0 && done >= total
      ? `✅ ${stu?.name || "학생"} 다 끝냈어요`
      : `${stu?.name || "학생"} ${item?.name || "학습"} 완료`,
    body: total > 0 ? `등원 학습 ${done}/${total}` : "등원 학습을 마쳤습니다.",
    url: "/today",
  });
}

/**
 * 낸 것이 없으면 왜 안 되는지 말해준다 (없으면 null).
 *
 * 0044·0063 이 아직 없는 DB 에서는 막지 않는다 — 못 내는 상태에서 막으면
 * 아이가 아무것도 끝낼 수가 없다.
 */
async function needsSubmission(supabase, sid, homeworkItemId, reportItemId) {
  const { data: item, error: itemErr } = await supabase
    .from("homework_items")
    .select("name, in_person")
    .eq("id", homeworkItemId)
    .maybeSingle();
  if (itemErr && (itemErr.code === "42703" || itemErr.code === "PGRST204")) return null;
  if (item?.in_person) return null;   // 직접검사 — 앱에 낼 것이 없다

  let q = supabase
    .from("homework_submissions")
    .select("id")
    .eq("student_id", sid)
    .limit(1);
  q = reportItemId ? q.eq("report_item_id", reportItemId) : q.eq("homework_item_id", homeworkItemId);
  const { data: subs, error } = await q;
  if (error) return null;             // 0044 전 — 낼 수가 없으니 막지 않는다
  if ((subs || []).length > 0) return null;

  return "아직 낸 것이 없어요. 사진이나 녹음으로 내야 끝나요.";
}

/** 잘못 눌렀을 때 되돌린다 */
export async function undoFinish(reportItemId) {
  if (!reportItemId) return { error: null };
  const supabase = await createClient();
  const sid = await meNow(supabase);
  if (!sid) return { error: "학생 계정으로 로그인해주세요." };
  const { data: undone, error } = await supabase
    .from("daily_report_items")
    .update({ student_done_at: null })
    .eq("id", reportItemId)
    .select("id");
  revalidatePath("/me");
  revalidatePath("/today");
  if (error) return { error: error.message };
  if (!undone || undone.length === 0) {
    return { error: "취소가 저장되지 않았어요. 원장님께 알려주세요. (0158 SQL)" };
  }
  return { error: null };
}

async function stopRunning(supabase, sid, date) {
  const { data: open, error } = await supabase
    .from("study_sessions")
    .select("id, started_at")
    .eq("student_id", sid)
    .eq("date", date)
    .is("ended_at", null);
  if (needSql(error)) return { error: NEED };
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
  const supabase = await createClient();
  const sid = await meNow(supabase);
  if (!sid) return { error: "학생 계정으로 로그인해주세요." };
  const res = await stopRunning(supabase, sid, todaySeoul());
  revalidatePath("/me");
  return res;
}
