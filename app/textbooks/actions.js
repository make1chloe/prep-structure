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

  const parent_id = (formData.get("parent_id") || "").toString().trim() || null;
  const activity = clean(formData, "activity"); // label 컬럼에 저장(활동)

  const supabase = createClient();

  // 순서: 비어있으면 같은 상위 안에서 최대+1 자동
  let sort = num(formData, "sort");
  if (sort === null) {
    let q = supabase
      .from("textbook_units")
      .select("sort")
      .eq("textbook_id", textbook_id)
      .order("sort", { ascending: false })
      .limit(1);
    q = parent_id ? q.eq("parent_id", parent_id) : q.is("parent_id", null);
    const { data: last } = await q;
    sort = (last?.[0]?.sort ?? 0) + 1;
  }

  await supabase
    .from("textbook_units")
    .insert({ textbook_id, parent_id, name, sort, label: activity });
  revalidatePath("/textbooks");
}

// ---------- 교재: 수정 / 삭제 ----------

export async function updateTextbook(id, patch) {
  if (!id) return { error: "id 없음" };
  const allow = ["name", "area", "target_grade", "total_pages", "price", "purchase_url", "feature"];
  const row = {};
  allow.forEach((k) => {
    if (k in (patch || {})) {
      let v = patch[k];
      if (k === "total_pages" || k === "price") {
        const d = (v ?? "").toString().replace(/[^\d]/g, "");
        v = d ? parseInt(d, 10) : null;
      } else if (typeof v === "string") {
        v = v.trim() || null;
      }
      row[k] = v ?? null;
    }
  });
  if (Object.keys(row).length === 0) return { error: null };

  const supabase = createClient();
  const { error } = await supabase.from("textbooks").update(row).eq("id", id);
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

export async function deleteTextbooks(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("textbooks").delete().in("id", ids);
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

export async function updateTextbooksArea(ids, area) {
  if (!Array.isArray(ids) || ids.length === 0 || !area) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("textbooks").update({ area }).in("id", ids);
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

// ---------- 단원: 수정 / 삭제 / 이동 ----------

export async function updateUnit(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = {};
  if ("name" in (patch || {})) row.name = (patch.name || "").trim() || null;
  if ("sort" in (patch || {})) {
    const d = (patch.sort ?? "").toString().replace(/[^\d]/g, "");
    row.sort = d ? parseInt(d, 10) : 0;
  }
  if ("activity" in (patch || {})) row.label = (patch.activity || "").trim() || null;
  if ("parent_id" in (patch || {})) row.parent_id = patch.parent_id || null;

  const supabase = createClient();
  const { error } = await supabase.from("textbook_units").update(row).eq("id", id);
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

export async function deleteUnits(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("textbook_units").delete().in("id", ids);
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

// 선택한 단원을 다른 교재로 옮기기 (최상위=대단원으로 이동)
export async function moveUnitsToTextbook(ids, textbookId) {
  if (!Array.isArray(ids) || ids.length === 0 || !textbookId) return { error: null };
  const supabase = createClient();
  const { data: last } = await supabase
    .from("textbook_units")
    .select("sort")
    .eq("textbook_id", textbookId)
    .is("parent_id", null)
    .order("sort", { ascending: false })
    .limit(1);
  let next = (last?.[0]?.sort ?? 0) + 1;

  for (const id of ids) {
    const { error } = await supabase
      .from("textbook_units")
      .update({ textbook_id: textbookId, parent_id: null, sort: next++ })
      .eq("id", id);
    if (error) {
      revalidatePath("/textbooks");
      return { error: error.message };
    }
  }
  revalidatePath("/textbooks");
  return { error: null };
}

// 선택한 단원을 다른 상위 단원 밑으로 옮기기 (parentId 가 null 이면 대단원으로)
export async function moveUnitsUnder(ids, parentId, textbookId) {
  if (!Array.isArray(ids) || ids.length === 0 || !textbookId) return { error: null };
  if (parentId && ids.includes(parentId)) {
    return { error: "자기 자신 아래로는 옮길 수 없어요." };
  }
  const supabase = createClient();

  let q = supabase
    .from("textbook_units")
    .select("sort")
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: false })
    .limit(1);
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data: last } = await q;
  let next = (last?.[0]?.sort ?? 0) + 1;

  for (const id of ids) {
    const { error } = await supabase
      .from("textbook_units")
      .update({ parent_id: parentId || null, sort: next++ })
      .eq("id", id);
    if (error) {
      revalidatePath("/textbooks");
      return { error: error.message };
    }
  }
  revalidatePath("/textbooks");
  return { error: null };
}

// 선택한 단원을 같은 상위 안에서 위/아래로 한 칸 이동
export async function moveUnits(ids, direction, textbookId) {
  if (!Array.isArray(ids) || ids.length === 0 || !textbookId) return { error: null };
  const supabase = createClient();
  const { data: all } = await supabase
    .from("textbook_units")
    .select("id, sort, parent_id")
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: true });
  if (!all || all.length === 0) return { error: null };

  // 형제(같은 부모)끼리만 자리 교환
  const groups = new Map();
  all.forEach((u) => {
    const k = u.parent_id || "root";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(u);
  });

  for (const list of groups.values()) {
    const idxs = list
      .map((u, i) => (ids.includes(u.id) ? i : -1))
      .filter((i) => i >= 0);
    if (idxs.length === 0) continue;
    const ordered = direction === "up" ? idxs : [...idxs].reverse();
    for (const i of ordered) {
      const j = direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) continue;
      if (ids.includes(list[j].id)) continue;
      [list[i], list[j]] = [list[j], list[i]];
    }
    for (let i = 0; i < list.length; i++) {
      if (list[i].sort !== i + 1) {
        await supabase.from("textbook_units").update({ sort: i + 1 }).eq("id", list[i].id);
      }
    }
  }
  revalidatePath("/textbooks");
  return { error: null };
}

export async function deleteUnit(formData) {
  const id = (formData.get("id") || "").toString().trim();
  if (!id) return;
  const supabase = createClient();
  await supabase.from("textbook_units").delete().eq("id", id);
  revalidatePath("/textbooks");
}
