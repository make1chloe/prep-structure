"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextRoutine, advanceRoutine } from "@/app/today/routineActions";
import { openAnswers, openForSubmission } from "@/lib/answers";
import { addDays } from "@/lib/day";

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
  const supabase = await createClient();

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

  // **검사가 답지를 연다** (0148). 검사 대상은 지난 수업의 배정이라
  // **검사일 전날까지**의 답지 줄만 본다 — 오늘 새로 배정하며 붙인 다음
  // 답지가 같이 열리면 안 된다 (판단은 lib/answers 한 곳).
  if (status) {
    await openAnswers(supabase, { studentId, itemIds: [itemId], upTo: addDays(date, -1) });
  }

  revalidatePath("/check");
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
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

  const { error } = await supabase.from("daily_report_items").insert(
    add.map((homework_item_id) => ({
      daily_report_id: rep.id,
      homework_item_id,
      status: "missing",
    }))
  );
  if (error) return { error: error.message };

  revalidatePath("/check");
  revalidatePath("/today");
  return { error: null, count: add.length };
}
