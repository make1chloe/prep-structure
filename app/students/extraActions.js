"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";
import { noTable } from "@/lib/sqlError";

const NEED_SQL = "0164 SQL 을 먼저 실행해주세요 (특강 — 추가 등원).";

/**
 * **특강 = 재원생 속성** (이행계획서 v2 §2-2 — 원장님 확정 2026-08-26).
 *
 * 특강은 반이 아니다 — 「이 학생이 이 기간, 이 요일·시간에 더 온다」다.
 * 반으로 만들면 같은 날 판이 둘로 갈라지고 출결이 이중이 되고 학년
 * 요금표가 특강비를 덮었다. 그래서 여기(재원생 정보)에서 넣는다.
 * 특강비는 **학생별 정액** — 결석해도 안 깎는다 (보강도 예외적 수동).
 */
export async function listExtras(studentId) {
  if (!studentId) return { rows: [], error: "학생이 없어요." };
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], error: guard.error };

  const { data, error } = await supabase
    .from("student_extra_schedules")
    .select("id, label, days, start_time, end_time, from_date, to_date, fee, off_dates, note")
    .eq("student_id", studentId)
    .order("to_date", { ascending: false });
  if (noTable(error)) return { rows: [], error: NEED_SQL };
  if (error) return { rows: [], error: error.message };
  return { rows: data || [], error: null };
}

export async function addExtra(studentId, form = {}) {
  if (!studentId) return { error: "학생이 없어요." };
  const label = (form.label || "").trim();
  const days = (Array.isArray(form.days) ? form.days : []).filter(Boolean);
  const from = (form.from_date || "").trim();
  const to = (form.to_date || "").trim();
  if (!label) return { error: "특강 이름을 적어주세요. (예: 여름 내신 특강)" };
  if (days.length === 0) return { error: "요일을 골라주세요." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { error: "시작일을 골라주세요." };
  // 특강은 끝난다 — 끝을 정하지 않으면 청구·판에서 영영 안 사라진다
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return { error: "끝나는 날을 골라주세요. (특강은 끝나는 날이 있어야 해요)" };
  if (to < from) return { error: "끝나는 날이 시작보다 앞설 수 없어요." };
  if (!(form.start_time || "").trim()) return { error: "시작 시간을 골라주세요." };
  const fee = form.fee === "" || form.fee == null ? null : Number(form.fee);
  if (fee != null && (!Number.isFinite(fee) || fee < 0)) return { error: "금액이 이상해요." };

  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const { error } = await supabase.from("student_extra_schedules").insert({
    student_id: studentId,
    label,
    days,
    start_time: form.start_time,
    end_time: (form.end_time || "").trim() || null,
    from_date: from,
    to_date: to,
    fee,
    note: (form.note || "").trim() || null,
  });
  if (noTable(error)) return { error: NEED_SQL };
  if (error && error.code === "23505")
    return { error: "같은 이름·시작일의 특강이 이미 있어요." };
  if (error) return { error: error.message };

  revalidatePath("/students");
  return { error: null };
}

export async function removeExtra(id) {
  if (!id) return { error: null };
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const { error } = await supabase
    .from("student_extra_schedules")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/students");
  return { error: null };
}
