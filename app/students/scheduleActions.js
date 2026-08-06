"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * **재원생 정보에서 그 아이 일정을 바로 넣는다** (원장님, 2026-08-06).
 *
 * 「재원생 정보에 일정 추가해서 연동해줘」
 *
 * 지금까지는 아이 하나에게만 해당하는 일정(보강, 개인 상담, 학교 행사로 인한
 * 결석)을 넣으려면 할일 화면으로 나갔다 와야 했다. 나갔다 오면 흐름이 끊기고,
 * 끊기면 **나중에 하게 되고, 그 나중은 안 온다.**
 *
 * 여기서 넣은 일정은 tasks 한 줄이다 — 따로 만든 표가 아니다. 그래서
 *   · 할일 화면 달력에 그대로 뜨고
 *   · 그 아이와 어머니 달력에도 뜬다 (deliver_student_ids 로 이어진다 · 0091)
 *   · 구글 캘린더 구독에도 같이 나간다 (0078)
 * 표를 따로 만들면 이 셋이 전부 어긋난다.
 */

async function requireStaff(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요.", user: null };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["principal", "instructor", "assistant"].includes(p?.role)) {
    return { error: "선생님 계정에서만 할 수 있어요.", user: null };
  }
  return { error: null, user };
}

const NEED_SQL = "0077 SQL 을 먼저 실행해주세요 (일정을 학생에게 배정하는 칸).";

function missingColumn(error) {
  return error && (error.code === "42703" || error.code === "PGRST204");
}

/** 이 학생에게 이어져 있는 일정 */
export async function listStudentTasks(studentId) {
  if (!studentId) return { rows: [], error: "학생이 없어요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], error: guard.error };

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, kind, category, due_on, end_on, note, private, deliver_student_ids")
    .contains("deliver_student_ids", [studentId])
    .order("due_on", { ascending: false })
    .limit(50);
  if (missingColumn(error)) return { rows: [], error: NEED_SQL };
  if (error) return { rows: [], error: error.message };
  return { rows: data || [], error: null };
}

/**
 * 일정을 하나 넣는다.
 *
 * **여러 아이에게 같은 일정을 줄 수도 있다.** 같은 날 같은 보강을 세 아이가
 * 받는 일이 흔한데, 세 줄로 넣으면 날짜를 고칠 때 세 번 고쳐야 하고
 * 그러다 하나를 빠뜨린다. 한 줄에 아이들을 담는다.
 */
export async function addStudentTask(studentIds, form = {}) {
  const ids = [...new Set((Array.isArray(studentIds) ? studentIds : [studentIds]).filter(Boolean))];
  if (ids.length === 0) return { error: "학생이 없어요." };

  const title = (form.title || "").trim();
  const dueOn = (form.due_on || "").trim();
  if (!title) return { error: "일정 이름을 적어주세요." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { error: "날짜를 골라주세요." };
  const endOn = (form.end_on || "").trim();
  if (endOn && !/^\d{4}-\d{2}-\d{2}$/.test(endOn)) return { error: "끝나는 날짜가 이상해요." };
  if (endOn && endOn < dueOn) return { error: "끝나는 날이 시작보다 앞설 수 없어요." };

  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const row = {
    title,
    kind: "schedule",                      // 할일이 아니라 **일정**이다 — 아이 달력에 뜬다
    category: (form.category || "").trim() || "수업",
    due_on: dueOn,
    end_on: endOn || null,
    note: (form.note || "").trim() || null,
    status: "open",
    // **이 아이들 것이다.** 이것이 있어야 그 아이·어머니 달력에만 뜬다 (0091)
    deliver_scope: "student",
    deliver_student_ids: ids,
    // 「나만 보기」 를 켜면 아이에게 안 보인다 (0066).
    // 상담 약속처럼 아이가 몰라도 되는 것에 쓴다
    private: !!form.private,
    created_by: guard.user.id,
  };

  const { error } = await supabase.from("tasks").insert(row);
  if (missingColumn(error)) return { error: NEED_SQL };
  if (error) return { error: error.message };

  revalidatePath("/students");
  revalidatePath("/tasks");
  revalidatePath("/me");
  revalidatePath("/parent");
  return { error: null, count: ids.length };
}

/**
 * 지운다.
 *
 * **여러 아이가 걸린 일정이면 이 아이만 뺀다.** 통째로 지우면 남의 아이
 * 일정까지 사라진다 — 지운 사람은 그것을 모른다.
 */
export async function removeStudentTask(taskId, studentId) {
  if (!taskId || !studentId) return { error: "값이 부족해요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const { data: t, error: readErr } = await supabase
    .from("tasks").select("id, deliver_student_ids").eq("id", taskId).maybeSingle();
  if (missingColumn(readErr)) return { error: NEED_SQL };
  if (readErr) return { error: readErr.message };
  if (!t) return { error: null };

  const rest = (t.deliver_student_ids || []).filter((x) => x !== studentId);
  const { error } = rest.length
    ? await supabase.from("tasks").update({ deliver_student_ids: rest }).eq("id", taskId)
    : await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/students");
  revalidatePath("/tasks");
  revalidatePath("/me");
  revalidatePath("/parent");
  return { error: null, left: rest.length };
}
