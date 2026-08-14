"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { noTable } from "@/lib/sqlError";
import { sessionUser } from "@/lib/session";

// ============================================================
// 늦귀가 과제
// ============================================================

/**
 * 하나 추가 — 미흡·미제출을 찍으면 자동으로, 또는 직접.
 *
 * @param status 넣자마자 정해진 상태로 둘 수 있다.
 *   자동으로 올라온 제안은 대부분 '남길 것' 이 아니라 그 자리에서
 *   숙제로 넘기거나 넘어간다. 올렸다가 다시 누르는 두 번을 없앤다.
 */
export async function addStay(studentId, date, body, homeworkItemId, auto = false, status = "todo") {
  const text = (body || "").trim();
  if (!studentId || !date || !text) return { error: "내용이 없어요." };
  if (!["todo", "done", "moved", "skipped", "dropped"].includes(status)) {
    return { error: "알 수 없는 상태예요." };
  }
  const supabase = createClient();
  const user = await sessionUser(supabase);

  // 같은 날 같은 내용이 이미 있으면 또 만들지 않는다 (자동 부여가 겹칠 수 있다)
  const { data: exist } = await supabase
    .from("stay_tasks")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .eq("body", text)
    .limit(1);
  if (exist?.length) {
    // 이미 있으면 상태만 맞춰준다 (제안에서 바로 '숙제로' 를 누른 경우)
    if (status !== "todo") return setStayStatus(exist[0].id, status);
    return { error: null, already: true };
  }

  const { error } = await supabase.from("stay_tasks").insert({
    student_id: studentId,
    date,
    homework_item_id: homeworkItemId || null,
    body: text,
    status,
    auto: !!auto,
    created_by: user?.id || null,
  });
  if (noTable(error)) {
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
 *   dropped 이건 아예 아니다 — 목록에서도 문자에서도 빠진다.
 *           지우지 않고 남기는 이유는, 지우면 △·✕ 자국에서 **다시 제안**되기 때문이다.
 *   todo    되돌리기
 */
export async function setStayStatus(id, status) {
  if (!id) return { error: null };
  const ok = ["todo", "done", "moved", "skipped", "dropped"];
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
  const user = await sessionUser(supabase);

  const { error } = await supabase.from("warning_actions").insert({
    student_id: studentId,
    kind: "waive",
    on_date: todaySeoul(),
    target_date: targetDate,
    note: (note || "").trim() || null,
    created_by: user?.id || null,
  });
  if (noTable(error)) return { error: "0024 SQL 을 먼저 실행해주세요." };
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
  if (!["reflection", "defer", "reset"].includes(kind)) return { error: "알 수 없는 처리예요." };

  const supabase = createClient();
  const user = await sessionUser(supabase);

  const { error } = await supabase.from("warning_actions").insert({
    student_id: studentId,
    kind,
    on_date: onDate || todaySeoul(),
    note: (note || "").trim() || null,
    created_by: user?.id || null,
  });
  if (noTable(error)) return { error: "0024 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/report");
  revalidatePath("/");
  return { error: null };
}

/**
 * 경고 월간 초기화 — 한 달에 한 번, 쌓인 경고를 한꺼번에 0으로 되돌린다.
 *
 * 지우는 게 아니다. 학생마다 'reset' 한 줄을 남기므로
 * 몇 회까지 쌓였다가 언제 정리됐는지는 학생 기록에 그대로 보인다.
 * 다음 달 카운트만 0에서 시작할 뿐이다.
 *
 * @param studentIds 지금 경고가 쌓여 있는 학생들 (0인 학생은 남길 필요가 없다)
 */
export async function resetMonthlyWarnings(studentIds, onDate, note) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0) return { error: null, count: 0 };

  const supabase = createClient();
  const user = await sessionUser(supabase);
  const on = onDate || todaySeoul();

  const { error } = await supabase.from("warning_actions").insert(
    ids.map((student_id) => ({
      student_id,
      kind: "reset",
      on_date: on,
      note: (note || "").trim() || `${on.slice(0, 7)} 월간 정리`,
      created_by: user?.id || null,
    }))
  );
  if (noTable(error)) return { error: "0024 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/students");
  revalidatePath("/report");
  return { error: null, count: ids.length };
}

/**
 * "이번 달은 그냥 둘게요" — 초기화하지 않고 알림만 닫는다.
 * 그 달을 기억해 두므로 다음 달이 되기 전에는 다시 뜨지 않는다.
 */
export async function skipMonthlyReset(ym) {
  const month = ym || todaySeoul().slice(0, 7);
  const supabase = createClient();

  // 'warning' 설정과 따로 둔다 — 설정 화면에서 저장하면 그 줄은 통째로 덮어써지기 때문이다
  const { error } = await supabase.from("integrations").upsert(
    { id: "warning_reset", enabled: true, config: { skip: month } },
    { onConflict: "id" }
  );
  if (error) return { error: error.message };

  revalidatePath("/today");
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
