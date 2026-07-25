"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function clean(formData, key) {
  const v = (formData.get(key) || "").toString().trim();
  return v || null;
}
function num(formData, key) {
  const v = (formData.get(key) || "").toString().replace(/[^\d]/g, "");
  return v ? parseInt(v, 10) : null;
}

export async function addTextbook(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const supabase = createClient();
  await supabase.from("textbooks").insert({
    name,
    area: clean(formData, "area"),
    target_grade: clean(formData, "target_grade"),
    total_pages: num(formData, "total_pages"),
    price: num(formData, "price"),
    purchase_url: clean(formData, "purchase_url"),
    word_range: num(formData, "word_range"),
    feature: clean(formData, "feature"),
  });
  revalidatePath("/textbooks");
}

export async function addUnit(formData) {
  const textbook_id = (formData.get("textbook_id") || "").toString().trim();
  const name = (formData.get("name") || "").toString().trim();
  if (!textbook_id || !name) return;

  const supabase = createClient();

  // 순서: 비어있으면 현재 최대+1 자동
  let sort = num(formData, "sort");
  if (sort === null) {
    const { data: last } = await supabase
      .from("textbook_units")
      .select("sort")
      .eq("textbook_id", textbook_id)
      .order("sort", { ascending: false })
      .limit(1);
    sort = (last?.[0]?.sort ?? 0) + 1;
  }

  await supabase.from("textbook_units").insert({
    textbook_id,
    name,
    sort,
    activity: clean(formData, "activity"),
  });
  revalidatePath("/textbooks");
}

export async function deleteUnit(formData) {
  const id = (formData.get("id") || "").toString().trim();
  if (!id) return;
  const supabase = createClient();
  await supabase.from("textbook_units").delete().eq("id", id);
  revalidatePath("/textbooks");
}
