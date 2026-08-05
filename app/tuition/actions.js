"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function ok(error) {
  return { error: error ? error.message : null };
}

export async function addHoliday(date, name, classId) {
  if (!date) return { error: "날짜를 골라주세요." };
  const supabase = createClient();
  const { error } = await supabase.from("holidays").insert({
    date,
    name: (name || "").trim() || null,
    scope: classId ? "class" : "all",
    class_id: classId || null,
  });
  revalidatePath("/tuition");
  revalidatePath("/today");
  return ok(error);
}

export async function deleteHoliday(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  revalidatePath("/tuition");
  return ok(error);
}

// 반 수강료 · 기준 회차
export async function setClassTuition(classId, tuition, baseSessions) {
  if (!classId) return { error: "반이 없어요." };
  const num = (v) => {
    const d = (v ?? "").toString().replace(/[^\d]/g, "");
    return d ? parseInt(d, 10) : null;
  };
  const supabase = createClient();
  const { error } = await supabase
    .from("classes")
    .update({ tuition: num(tuition), base_sessions: num(baseSessions) })
    .eq("id", classId);
  revalidatePath("/tuition");
  return ok(error);
}

// 학생 개별 금액 · 등원 시작일 / 퇴원일
export async function setStudentTuition(studentId, patch) {
  if (!studentId) return { error: "학생이 없어요." };
  const num = (v) => {
    const d = (v ?? "").toString().replace(/[^\d]/g, "");
    return d ? parseInt(d, 10) : null;
  };
  const row = {};
  if ("tuition" in patch) row.tuition = num(patch.tuition);
  if ("started_on" in patch) row.started_on = patch.started_on || null;
  if ("ended_on" in patch) row.ended_on = patch.ended_on || null;

  const supabase = createClient();
  const { error } = await supabase.from("students").update(row).eq("id", studentId);
  revalidatePath("/tuition");
  return ok(error);
}

/**
 * 받았다 / 안 받았다 뒤집기.
 *
 * 엑셀로 올린 것과 손으로 누른 것이 **같은 표**에 들어간다. 들어온 길만 다르다.
 * 금액은 앱이 계산한 값을 그대로 적어둔다 — 나중에 반 금액이 바뀌어도
 * 그때 얼마를 받았는지는 남아야 하기 때문이다.
 */
export async function setPaid(studentId, ym, paid, amount = null, paidOn = null) {
  if (!studentId || !ym) return { error: "학생과 달이 필요해요." };
  const supabase = createClient();
  // 받은 날은 **고를 수 있다.** 계좌를 며칠 만에 확인하시는 일이 흔해서,
  // 오늘로 찍어버리면 실제 받은 날과 어긋난다.
  const on = /^\d{4}-\d{2}-\d{2}$/.test(paidOn || "")
    ? paidOn
    : new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("payments").upsert(
    {
      student_id: studentId,
      ym,
      amount: paid ? amount : null,
      paid_on: paid ? on : null,
      source: "manual",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,ym" }
  );
  if (error) {
    return { error: `${error.message} — supabase/migrations/0055_payments.sql 을 실행해주세요.` };
  }
  revalidatePath("/tuition");
  revalidatePath("/");
  return { error: null };
}

/**
 * 학년별 수강료를 저장한다.
 *
 * 반에 하나씩만 적을 수 있어서, 한 반에 중2와 중3이 섞이면 학생마다 손으로
 * 고쳐 넣어야 했다. 학년이 오르면 금액이 오르는 것은 규칙이지 예외가 아니다.
 *
 * 표를 새로 만들지 않는다 — 학년 몇 줄이라 설정 한 줄이면 충분하다.
 * 빈칸은 지운다 (0원과 '안 적음' 은 다르기 때문이다).
 */
export async function saveGradeTuition(map = {}) {
  const clean = {};
  Object.entries(map).forEach(([grade, v]) => {
    const g = (grade || "").trim();
    if (!g) return;
    const digits = (v ?? "").toString().replace(/[^\d]/g, "");
    if (digits === "") return;          // 안 적은 학년은 담지 않는다
    clean[g] = parseInt(digits, 10);
  });

  const supabase = createClient();
  const { error } = await supabase
    .from("integrations")
    .upsert({ id: "tuition", enabled: true, config: { byGrade: clean } }, { onConflict: "id" });
  if (error) return { error: error.message };

  revalidatePath("/tuition");
  return { error: null };
}


/**
 * **여러 명을 한 번에 수납 처리한다.**
 *
 * 반 하나가 다 들어오는 날이면 열댓 번을 눌러야 했다. 고른 사람만,
 * 고른 날짜로 한 번에 찍는다.
 *
 * 금액은 화면이 계산해 둔 것을 그대로 받는다 (원칙1 — 여기서 다시 세지 않는다).
 *
 * @param items  [{ studentId, amount }]
 * @param ym     "2026-08"
 * @param paidOn "2026-08-05" (안 주면 오늘)
 */
export async function setPaidMany(items = [], ym, paid = true, paidOn = null) {
  const list = (items || []).filter((x) => x?.studentId);
  if (list.length === 0) return { error: null, count: 0 };
  if (!ym) return { error: "달이 필요해요." };
  const supabase = createClient();
  const on = /^\d{4}-\d{2}-\d{2}$/.test(paidOn || "")
    ? paidOn
    : new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const rows = list.map((x) => ({
    student_id: x.studentId,
    ym,
    amount: paid ? (Number(x.amount) || null) : null,
    paid_on: paid ? on : null,
    source: "manual",
    updated_at: now,
  }));

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from("payments")
      .upsert(rows.slice(i, i + 200), { onConflict: "student_id,ym" });
    if (error) {
      return { error: `${error.message} — supabase/migrations/0055_payments.sql 을 실행해주세요.` };
    }
  }

  revalidatePath("/tuition");
  revalidatePath("/");
  return { error: null, count: rows.length, paidOn: on };
}
