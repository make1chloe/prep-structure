"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const CATEGORIES = ["단어", "독해", "문법", "노트", "내신", "기타"];

function clean(formData, key) {
  const v = (formData.get(key) || "").toString().trim();
  return v || null;
}

export async function addHomeworkItem(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const supabase = createClient();
  const category = clean(formData, "category");

  // 같은 분류 안에서 맨 뒤로
  const { data: last } = await supabase
    .from("homework_items")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1);
  const sort = (last?.[0]?.sort ?? 0) + 10;

  await supabase.from("homework_items").insert({ name, category, sort, active: true });
  revalidatePath("/homework");
  revalidatePath("/today");
}

export async function updateHomeworkItem(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = {};
  if ("name" in (patch || {})) row.name = (patch.name || "").trim();
  if ("category" in (patch || {})) row.category = (patch.category || "").trim() || null;
  if ("sort" in (patch || {})) {
    const d = (patch.sort ?? "").toString().replace(/[^\d]/g, "");
    row.sort = d ? parseInt(d, 10) : 0;
  }
  if ("active" in (patch || {})) row.active = !!patch.active;
  if (!row.name && "name" in row) return { error: "이름은 비울 수 없어요." };

  const supabase = createClient();
  const { error } = await supabase.from("homework_items").update(row).eq("id", id);
  revalidatePath("/homework");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

export async function setHomeworkItemsActive(ids, active) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("homework_items").update({ active }).in("id", ids);
  revalidatePath("/homework");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

export async function setHomeworkItemsCategory(ids, category) {
  if (!Array.isArray(ids) || ids.length === 0 || !category) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("homework_items").update({ category }).in("id", ids);
  revalidatePath("/homework");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

export async function deleteHomeworkItems(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("homework_items").delete().in("id", ids);
  revalidatePath("/homework");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}
