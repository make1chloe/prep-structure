"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 상담일지.
 *
 * 재원생 상담을 적을 곳이 없었다. 신규 상담 '일정' 만 있었고, 정작 무슨
 * 얘기를 했는지 남길 데가 없었다. 그래서 다음 상담 때 기억에 의존했다.
 *
 * 받아쓴 것(raw)과 정리한 것(body)을 **둘 다** 남긴다. 정리본이 틀렸을 때
 * 원본을 볼 수 있어야 하기 때문이다.
 */

function needSql(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205");
}

export async function listNotes(studentId) {
  if (!studentId) return { rows: [], error: null };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("student_notes")
    .select("id, date, kind, title, raw, body, with_whom, minutes, created_at")
    .eq("student_id", studentId)
    .order("date", { ascending: false })
    // 한 학생에게 스무 건 넘게 쌓인 아이가 이미 있다 (옮겨온 것만 21건).
    // 50 에서 자르면 오래된 것이 조용히 안 보인다 — 상담일지는 **지난 것을
    // 보려고** 여는 화면이라, 그게 잘리면 화면을 여는 이유가 없어진다
    .limit(500);
  if (needSql(error)) return { rows: [], error: "0049 SQL 을 먼저 실행해주세요." };
  return { rows: data || [], error: error ? error.message : null };
}

export async function saveNote(studentId, note = {}) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const row = {
    student_id: studentId,
    date: note.date || undefined,
    kind: note.kind || "consult",
    title: (note.title || "").trim() || null,
    raw: (note.raw || "").trim() || null,
    body: (note.body || "").trim() || null,
    with_whom: (note.with_whom || "").trim() || null,
    minutes: Number.isFinite(+note.minutes) && note.minutes !== "" ? +note.minutes : null,
    updated_at: new Date().toISOString(),
  };
  if (user?.id && !note.id) row.created_by = user.id;

  const q = note.id
    ? await supabase.from("student_notes").update(row).eq("id", note.id).select("id").single()
    : await supabase.from("student_notes").insert(row).select("id").single();

  if (needSql(q.error)) return { error: "0049 SQL 을 먼저 실행해주세요." };
  if (q.error) return { error: q.error.message };

  revalidatePath("/students");
  return { error: null, id: q.data?.id };
}

export async function deleteNote(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("student_notes").delete().eq("id", id);
  revalidatePath("/students");
  return { error: error ? error.message : null };
}
