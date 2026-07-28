"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";


function clean(formData, key) {
  const v = (formData.get(key) || "").toString().trim();
  return v || null;
}

function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}

export async function addHomeworkItem(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const supabase = createClient();
  const category = clean(formData, "category");
  const method = clean(formData, "method");
  const prep_task = clean(formData, "prep_task");

  // 같은 분류 안에서 맨 뒤로
  const { data: last } = await supabase
    .from("homework_items")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1);
  const sort = (last?.[0]?.sort ?? 0) + 10;

  const row = { name, category, sort, active: true, method, prep_task };
  let { error } = await supabase.from("homework_items").insert(row);
  if (isMissingColumn(error)) {
    // 0028 전이면 prep_task 없이, 그래도 안 되면 method 도 빼고
    const { prep_task: _p, ...noPrep } = row;
    ({ error } = await supabase.from("homework_items").insert(noPrep));
    if (isMissingColumn(error)) {
      const { method: _m, ...rest } = noPrep;
      await supabase.from("homework_items").insert(rest);
    }
  }
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
  if ("method" in (patch || {})) row.method = (patch.method || "").trim() || null;
  // 체크리스트 — 한 줄에 하나. 비면 학생 화면에 버튼이 안 나온다
  if ("checklist" in (patch || {})) {
    row.checklist =
      (patch.checklist || "").split("\n").map((t) => t.trim()).filter(Boolean).join("\n") || null;
  }
  if ("prep_task" in (patch || {})) row.prep_task = (patch.prep_task || "").trim() || null;
  if ("no_timer" in (patch || {})) row.no_timer = !!patch.no_timer;
  if (!row.name && "name" in row) return { error: "이름은 비울 수 없어요." };

  const supabase = createClient();
  let { error } = await supabase.from("homework_items").update(row).eq("id", id);
  if (isMissingColumn(error)) {
    // 0045 → 0033 → 0028 순으로 한 칸씩 물러난다
    const { checklist: _c, ...noList } = row;
    ({ error } = await supabase.from("homework_items").update(noList).eq("id", id));
  }
  if (isMissingColumn(error)) {
    const { checklist: _c1, no_timer: _t, ...noTimer } = row;
    ({ error } = await supabase.from("homework_items").update(noTimer).eq("id", id));
    if (isMissingColumn(error)) {
      const { prep_task: _p, ...noPrep } = noTimer;
      ({ error } = await supabase.from("homework_items").update(noPrep).eq("id", id));
    }
    if (isMissingColumn(error)) {
      const { method: _m, prep_task: _p2, checklist: _c2, ...rest } = noTimer;
      ({ error } = await supabase.from("homework_items").update(rest).eq("id", id));
    }
  }
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
