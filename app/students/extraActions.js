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

/**
 * **「이 아이 오늘 특강만 빠짐」 을 적는 한 곳** (0164 student_extra_absences).
 *
 * 정규 출결(attendance)은 하루 한 줄이라 「정규는 왔는데 특강만 빠짐」 을
 * 못 적는다 — 그래서 0164 가 이 표를 따로 깔았다. 그런데 **쓰는 코드가
 * 없어서** 표가 빈 채로 반년을 지났다 (0164 머리말: 「화면·백필은 다음
 * 커밋들」 — 그 커밋이 안 왔다). 여기가 그 자리다.
 *
 * 원장님 확인 2026-08-29: 「정규는 왔는데 특강만 빠지는 일이 실제로 있다」.
 *
 * 읽는 쪽은 이미 셋이 있다 — 월간(app/monthly/actions.js)·학생(/me)·
 * 학부모(/parent) 가 lib/extraTerm 의 extraDatesBy 로 이 줄을 뺀다.
 * 그래서 읽는 코드는 새로 만들지 않는다 (원칙 1).
 *
 * 특강비는 정액이라 **돈에는 영향이 없다** — 「이번 달 총 N회」 숫자에만
 * 영향이 있다 (0164 주석).
 *
 * @param on true = 결석으로 적는다 / false = 그 기록을 지운다(되돌리기)
 */
export async function setExtraAbsence(scheduleId, date, on) {
  if (!scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")))
    return { error: "특강·날짜가 없어요." };
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const { error } = on
    ? await supabase
        .from("student_extra_absences")
        // 같은 날 두 번 눌러도 한 줄 (unique(schedule_id, date) — 0164)
        .upsert({ schedule_id: scheduleId, date, status: "absent" },
                { onConflict: "schedule_id,date" })
    : await supabase
        .from("student_extra_absences")
        .delete()
        .eq("schedule_id", scheduleId)
        .eq("date", date);
  if (noTable(error)) return { error: NEED_SQL };
  if (error) return { error: error.message };

  revalidatePath("/today");
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
