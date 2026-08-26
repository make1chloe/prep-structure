"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextRoutine, advanceRoutine } from "@/app/today/routineActions";
import { openAnswers, openForSubmission } from "@/lib/answers";
import { addDays } from "@/lib/day";
import { checkMany } from "@/lib/checkWrite";
import { assignedUnitsFor } from "@/lib/dayCheck";
import { applyCheckProgress } from "@/lib/checkProgress";

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

/**
 * 검사 한 건을 마무리한다.
 *
 * @param status ○ done · △ weak · ✕ missing · null 이면 취소
 */
export async function checkOne(studentId, date, itemId, status, note = "", submissionIds = []) {
  if (!studentId || !date || !itemId) return { error: "값이 부족해요." };
  const supabase = await createClient();

  const { data: rep } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (!rep?.id) return { error: "이 날짜에 기록이 없어요. 먼저 출결을 찍어주세요." };

  // 검사 쓰기는 check_many 한 문 (0163 — 계획서 v2 §2-4-①). '배정' 과
  // '학원에서 할 것' 은 원래대로 무접촉 — RPC 는 검사 3상태만 만진다.
  // 이 화면의 note 는 **권위**다: 빈 값이면 지운다('') — 현행 그대로.
  // status null = 취소(검사행 delete). 학생 「다 했어요」·제출물 소속은
  // 행이 제자리라 저절로 산다.
  const { error } = await checkMany(supabase, rep.id, [
    { item_id: itemId, status: status || null, note: (note || "").trim() },
  ]);
  if (error) return { error };

  // 낸 것을 봤다고 표시 — 안 하면 대기줄에 계속 남는다
  const ids = (submissionIds || []).filter(Boolean);
  if (ids.length) {
    await supabase
      .from("homework_submissions")
      .update({ checked_at: new Date().toISOString() })
      .in("id", ids);
  }

  // **검사가 답지를 연다** (0148). 검사 대상은 지난 수업의 배정이라
  // **검사일 전날까지**의 답지 줄만 본다 — 오늘 새로 배정하며 붙인 다음
  // 답지가 같이 열리면 안 된다 (판단은 lib/answers 한 곳).
  if (status && status !== "missing") {
    // ✕는 안 연다 (#22 — 안 해온 아이에게 답 먼저 금지)
    await openAnswers(supabase, { studentId, itemIds: [itemId], upTo: addDays(date, -1) });
  }

  // **여기서 찍은 검사도 진도를 움직인다** (계획서 v2 §2-4-② — 8/22
  // 확정의 원래 뜻). 배정 단원은 판과 같은 판단(lib/dayCheck 1학생판).
  // 취소(null)는 미검사로 돌아가는 것 — 진도 무접촉.
  let warn = null;
  if (status) {
    const units = await assignedUnitsFor(supabase, studentId, date);
    warn = await applyCheckProgress(studentId, date, [itemId], { [itemId]: status }, units);
  }

  revalidatePath("/check");
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null, warn };
}

/** 낸 것만 '봤다' 로 (검사 결과는 나중에) */
export async function seenSubmission(id, on = true) {
  if (!id) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("homework_submissions")
    .update({ checked_at: on ? new Date().toISOString() : null })
    .eq("id", id);
  // 「봤어요」 도 확인이다 (0148) — 그 배정일의 답지를 연다 (안 봄으로
  // 되돌려도 이미 열린 답지는 그대로다 — 학생이 봤을 수 있다)
  if (!error && on) await openForSubmission(supabase, id);
  revalidatePath("/check");
  revalidatePath("/me");
  return { error: error ? error.message : null };
}

/**
 * 다음 숙제를 **자동으로** 배정한다.
 *
 * 교재마다 루틴이 정해져 있다 (문법은 설명→문제→본교재→워크북, 독해는
 * 예습→테스트→복습). 그러니 다음에 낼 것은 이미 정해져 있다 — 매번 고를
 * 일이 아니다. 단추 하나로 끝낸다.
 *
 *   1. 그 학생 교재들의 **지금 차례** 를 본다
 *   2. 그 단계의 숙제를 오늘 리포트에 배정한다
 *   3. 루틴을 한 칸 넘긴다 (다음에 누르면 그다음 것이 나온다)
 *
 * 집에서 못 하는 학습은 바꿔서 낸다 (구두테스트 → 셀프녹음테스트).
 * 루틴은 등원 기준 하나만 알면 되고, 숙제로 나갈 때 여기서 알아서 바뀐다.
 */
export async function autoAssign(studentId, date) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = await createClient();

  const { data: rep } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (!rep?.id) return { error: "이 날짜에 기록이 없어요. 먼저 출결을 찍어주세요." };

  const routine = await nextRoutine(studentId);
  if (routine.error) return { error: routine.error };
  let ids = routine.home || [];
  if (ids.length === 0) {
    return { error: "이 학생 교재에 루틴이 없어요. 교재 › 교재·단원 에서 루틴을 먼저 짜주세요." };
  }

  // 집에서 못 하는 것은 숙제용으로 바꾼다
  const { data: twins } = await supabase
    .from("homework_items")
    .select("id, home_item_id")
    .in("id", ids)
    .not("home_item_id", "is", null);
  if (twins?.length) {
    const swap = new Map(twins.map((t) => [t.id, t.home_item_id]));
    ids = [...new Set(ids.map((id) => swap.get(id) || id))];
  }

  // 오늘 이미 배정한 것은 또 넣지 않는다
  const { data: had } = await supabase
    .from("daily_report_items")
    .select("homework_item_id")
    .eq("daily_report_id", rep.id)
    .eq("status", "assigned");
  const have = new Set((had || []).map((x) => x.homework_item_id));
  const add = ids.filter((id) => !have.has(id));
  if (add.length === 0) {
    return { error: null, added: 0, already: true, steps: routine.steps };
  }

  const { error } = await supabase.from("daily_report_items").insert(
    add.map((homework_item_id) => ({
      daily_report_id: rep.id,
      homework_item_id,
      status: "assigned",
    }))
  );
  if (error) return { error: error.message };

  // 다음에 누르면 그다음 단계가 나오게
  await advanceRoutine(studentId, (routine.steps || []).map((s) => s.textbookId));

  revalidatePath("/check");
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null, added: add.length, steps: routine.steps };
}

/**
 * 안 낸 것을 한 번에 미제출(✕)로.
 *
 * 자동으로 찍지 않는 이유 — 워크북처럼 **공책으로 보는 숙제**는 앱에 낼 것이
 * 없다. 안 냈다고 미제출로 몰면 성실히 해온 아이가 억울해진다.
 * 그래서 화면에는 '안 냄' 으로 보여주기만 하고, 찍는 것은 원장님이 한 번 누른다.
 */
export async function markMissing(studentId, date, itemIds = []) {
  const ids = (itemIds || []).filter(Boolean);
  if (!studentId || !date || ids.length === 0) return { error: null, count: 0 };
  const supabase = await createClient();

  const { data: rep } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (!rep?.id) return { error: "이 날짜에 기록이 없어요. 먼저 출결을 찍어주세요." };

  // 이미 찍힌 것은 건드리지 않는다 (○ 로 봐준 것을 ✕ 로 덮으면 안 된다)
  const { data: had } = await supabase
    .from("daily_report_items")
    .select("homework_item_id")
    .eq("daily_report_id", rep.id)
    .in("status", ["done", "weak", "missing"]);
  const done = new Set((had || []).map((x) => x.homework_item_id));
  const add = ids.filter((id) => !done.has(id));
  if (add.length === 0) return { error: null, count: 0 };

  // 벌크도 check_many 한 문 · 한 왕복 (0163). 위의 선필터(○ 불가침)가
  // 이 경로의 방벽이다 — RPC 는 do update 라, 필터 없이 보내면 ○ 를
  // ✕ 로 갈아엎는다 (검토 급-1). 필터를 지우면 안 된다.
  const { error } = await checkMany(
    supabase,
    rep.id,
    add.map((id) => ({ item_id: id, status: "missing", note: null }))
  );
  if (error) return { error };

  // ✕ 도 진도를 움직인다 — 그 날 찍힌 것을 도로 지운다 (계획서 v2
  // §2-4-②. 판단은 lib/checkProgress 한 벌 — 판 저장의 ✕ 와 동일).
  // ✕ 는 답지를 안 여는 것(#22)도 그대로 — 이 경로엔 openAnswers 없음.
  const units = await assignedUnitsFor(supabase, studentId, date);
  const warn = await applyCheckProgress(
    studentId, date, add,
    Object.fromEntries(add.map((id) => [id, "missing"])),
    units
  );

  revalidatePath("/check");
  revalidatePath("/today");
  return { error: null, count: add.length, warn };
}
