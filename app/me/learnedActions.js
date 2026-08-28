"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { resolveStudent } from "@/lib/actAs";

/**
 * **오늘 배운 것 — 아이가 적는다** (0181, 원장님 2026-08-28 —
 * 「등원 학습이 끝나고 하원하기 전에 학생이 **반드시**, 오늘 학습에서
 *  배운 것을 적는 칸을 만들어줘」).
 *
 * 이 글은 **원본**이다. 학부모에게 안 나간다 (0181 머리말 · 원장 확정).
 * 나중에 AI 가 이 원본을 토대로 일일리포트를 쓰기로 되어 있는데,
 * **그건 이번 범위 밖**이다 — 여기서는 남기는 데까지만 한다.
 */
export async function saveLearned(body) {
  const supabase = await createClient();
  const { studentId, error: whoErr } = await resolveStudent(supabase);
  if (!studentId) return { error: whoErr || "학생 계정으로 로그인해주세요." };

  const text = String(body || "").trim().slice(0, 2000);
  const { error } = await supabase.from("learned_notes").upsert(
    { student_id: studentId, date: todaySeoul(), body: text },
    { onConflict: "student_id,date" }
  );
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { error: "선생님이 SQL(0181) 을 먼저 실행해야 해요." };
    }
    return { error: error.message };
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null };
}

/**
 * **선생님이 대신 적는다.**
 *
 * 등원 체크의 `setArrivalFor`(0038 계열)와 같은 관례다 — 학생 앱을 아직
 * 안 줬거나, 폰을 안 가져왔거나, 계정이 없는 아이가 있다. 하원 길목이
 * **막는** 것이라 대행 길이 없으면 그 아이는 영영 하원을 못 누른다.
 *
 * 원장님이 오늘 수업 화면에서 아이 말을 받아적는 자리이기도 하다 —
 * 그래서 「고치기」 가 아니라 「적기」 한 벌로 둔다.
 */
export async function setLearnedFor(studentId, date, body) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = await createClient();
  const text = String(body || "").trim().slice(0, 2000);
  const { error } = await supabase.from("learned_notes").upsert(
    { student_id: studentId, date, body: text },
    { onConflict: "student_id,date" }
  );
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { error: "0181 SQL 을 먼저 실행해주세요." };
    }
    return { error: error.message };
  }
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}
