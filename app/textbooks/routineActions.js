"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const NEED = "0035 SQL 을 먼저 실행해주세요.";
function unavailable(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703");
}

/** 이 교재의 루틴 (한 줄 = 한 수업 회차) */
export async function listRoutine(textbookId) {
  if (!textbookId) return { steps: [], ready: true, error: null };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("routine_steps")
    .select("id, sort, label, inclass_items, home_items, note")
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: true });
  if (unavailable(error)) return { steps: [], ready: false, error: NEED };
  if (error) return { steps: [], ready: true, error: error.message };
  return { steps: data || [], ready: true, error: null };
}

export async function saveStep(textbookId, step) {
  if (!textbookId) return { error: "교재가 없어요." };
  const supabase = createClient();
  const row = {
    textbook_id: textbookId,
    sort: Number.isFinite(+step?.sort) ? +step.sort : 0,
    label: (step?.label || "").trim() || null,
    inclass_items: step?.inclass_items || [],
    home_items: step?.home_items || [],
    note: (step?.note || "").trim() || null,
  };
  const { error } = step?.id
    ? await supabase.from("routine_steps").update(row).eq("id", step.id)
    : await supabase.from("routine_steps").insert(row);
  if (unavailable(error)) return { error: NEED };
  if (error) return { error: error.message };
  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: null };
}

export async function deleteStep(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("routine_steps").delete().eq("id", id);
  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}
