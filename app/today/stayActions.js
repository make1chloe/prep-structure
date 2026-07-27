"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function unavailable(error) {
  return error && (error.code === "42P01" || /stay_tasks|warning_actions/.test(error.message || ""));
}

// ============================================================
// 오늘 마무리 (늦귀가과제)
// ============================================================

/** 하나 추가 — 미흡·미제출을 찍으면 자동으로, 또는 직접 */
export async function addStay(studentId, date, body, homeworkItemId, auto = false) {
  const text = (body || "").trim();
  if (!studentId || !date || !text) return { error: "내용이 없어요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 같은 날 같은 내용이 이미 있으면 또 만들지 않는다 (자동 부여가 겹칠 수 있다)
  const { data: exist } = await supabase
    .from("stay_tasks")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .eq("body", text)
    .limit(1);
  if (exist?.length) return { error: null, already: true };

  const { error } = await supabase.from("stay_tasks").insert({
    student_id: studentId,
    date,
    homework_item_id: homeworkItemId || null,
    body: text,
    status: "todo",
    auto: !!auto,
    created_by: user?.id || null,
  });
  if (unavailable(error)) {
    return { error: "0024 SQL 을 먼저 실행해주세요." };
  }
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

/**
 * 상태 바꾸기
 *   done    다 했다
 *   moved   다 못 해서 숙제로 넘긴다
 *   skipped 오늘은 넘어간다
 *   todo    되돌리기
 */
export async function setStayStatus(id, status) {
  if (!id) return { error: null };
  const ok = ["todo", "done", "moved", "skipped"];
  if (!ok.includes(status)) return { error: "알 수 없는 상태예요." };

  const supabase = createClient();
  const { error } = await supabase
    .from("stay_tasks")
    .update({
      status,
      done_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

export async function deleteStay(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("stay_tasks").delete().eq("id", id);
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: error ? error.message : null };
}

// ============================================================
// 경고 · 반성문
//   경고 자체는 저장하지 않는다. 사람이 내린 판단만 남긴다.
// ============================================================

/** 그 날 경고를 없던 것으로 (사정이 있었을 때) */
export async function waiveWarning(studentId, targetDate, note) {
  if (!studentId || !targetDate) return { error: "값이 부족해요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("warning_actions").insert({
    student_id: studentId,
    kind: "waive",
    on_date: new Date().toISOString().slice(0, 10),
    target_date: targetDate,
    note: (note || "").trim() || null,
    created_by: user?.id || null,
  });
  if (unavailable(error)) return { error: "0024 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/report");
  return { error: null };
}

/**
 * 반성문을 썼거나(reflection), 이번엔 넘어가거나(defer).
 * 둘 다 그 시점까지의 경고를 정산한다. 다른 건 **기록에 뭐라고 남는가** 뿐이다.
 *   · 반성문 씀 → 다음에 또 3회면 다시 쓴다
 *   · 유예     → 봐준 이력이 남아서, 다음에 판단할 때 참고가 된다
 */
export async function settleWarnings(studentId, kind, onDate, note) {
  if (!studentId) return { error: "학생이 없어요." };
  if (!["reflection", "defer"].includes(kind)) return { error: "알 수 없는 처리예요." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("warning_actions").insert({
    student_id: studentId,
    kind,
    on_date: onDate || new Date().toISOString().slice(0, 10),
    note: (note || "").trim() || null,
    created_by: user?.id || null,
  });
  if (unavailable(error)) return { error: "0024 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/report");
  revalidatePath("/");
  return { error: null };
}

/** 잘못 누른 처리를 되돌린다 */
export async function undoWarningAction(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("warning_actions").delete().eq("id", id);
  revalidatePath("/today");
  revalidatePath("/report");
  return { error: error ? error.message : null };
}
