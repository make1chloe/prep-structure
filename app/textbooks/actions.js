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

// 새 컬럼(word_range/activity)이 아직 DB에 없으면 그 컬럼만 빼고 다시 저장한다.
// -> Supabase 마이그레이션을 아직 안 돌렸어도 기본 저장은 되게 함.
function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}
async function insertSafe(supabase, table, rows, optionalKeys = []) {
  let { error } = await supabase.from(table).insert(rows);
  if (isMissingColumn(error) && optionalKeys.length) {
    const strip = (r) => {
      const c = { ...r };
      optionalKeys.forEach((k) => delete c[k]);
      return c;
    };
    const trimmed = Array.isArray(rows) ? rows.map(strip) : strip(rows);
    ({ error } = await supabase.from(table).insert(trimmed));
  }
  return error;
}

export async function addTextbook(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const supabase = createClient();
  await insertSafe(
    supabase,
    "textbooks",
    {
      name,
      area: clean(formData, "area"),
      target_grade: clean(formData, "target_grade"),
      total_pages: num(formData, "total_pages"),
      price: num(formData, "price"),
      purchase_url: clean(formData, "purchase_url"),
      word_range: num(formData, "word_range"),
      feature: clean(formData, "feature"),
    },
    ["word_range"]
  );
  revalidatePath("/textbooks");
}

export async function bulkAddTextbooks(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, error: null };
  }
  const toInt = (v) => {
    const d = (v || "").toString().replace(/[^\d]/g, "");
    return d ? parseInt(d, 10) : null;
  };
  const payload = rows
    .filter((r) => (r?.name || "").trim() !== "")
    .map((r) => ({
      name: r.name.trim(),
      area: (r.area || "").trim() || null,
      target_grade: (r.target_grade || "").trim() || null,
      total_pages: toInt(r.total_pages),
      price: toInt(r.price),
      word_range: toInt(r.word_range),
      purchase_url: (r.purchase_url || "").trim() || null,
      feature: (r.feature || "").trim() || null,
    }));

  const supabase = createClient();
  const error = await insertSafe(supabase, "textbooks", payload, ["word_range"]);
  revalidatePath("/textbooks");
  return { inserted: error ? 0 : payload.length, error: error ? error.message : null };
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

  await insertSafe(
    supabase,
    "textbook_units",
    { textbook_id, name, sort, activity: clean(formData, "activity") },
    ["activity"]
  );
  revalidatePath("/textbooks");
}

export async function deleteUnit(formData) {
  const id = (formData.get("id") || "").toString().trim();
  if (!id) return;
  const supabase = createClient();
  await supabase.from("textbook_units").delete().eq("id", id);
  revalidatePath("/textbooks");
}
