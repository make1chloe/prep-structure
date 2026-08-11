"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BASIC_HOMEWORK, withSort } from "@/lib/basicHomework";
import { noColumn } from "@/lib/sqlError";


function clean(formData, key) {
  const v = (formData.get(key) || "").toString().trim();
  return v || null;
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

  const tool = clean(formData, "tool");
  const row = { name, category, sort, active: true, method, prep_task, tool };
  let { error } = await supabase.from("homework_items").insert(row);
  if (noColumn(error)) {
    // 0116 전이면 준비물 없이
    const { tool: _tl, ...noTool } = row;
    ({ error } = await supabase.from("homework_items").insert(noTool));
  }
  if (noColumn(error)) {
    // 0028 전이면 prep_task 없이, 그래도 안 되면 method 도 빼고
    const { prep_task: _p, tool: _tl2, ...noPrep } = row;
    ({ error } = await supabase.from("homework_items").insert(noPrep));
    if (noColumn(error)) {
      const { method: _m, ...rest } = noPrep;
      await supabase.from("homework_items").insert(rest);
    }
  }
  revalidatePath("/homework");
  revalidatePath("/today");
}

/**
 * 노션 「기본숙제」를 학습 항목으로 옮겨 넣는다.
 *
 * · 이름이 같은 항목이 이미 있으면 **건드리지 않는다**. 원장님이 고쳐둔
 *   학습 방법을 덮어쓰면 안 되기 때문이다.
 * · 없는 것만 새로 넣는다. 여러 번 눌러도 안전하다.
 * · 마지막에 구두테스트 ↔ 셀프녹음테스트 같은 짝을 이어준다.
 */
export async function seedBasicHomework() {
  const supabase = createClient();

  const { data: exist, error: readErr } = await supabase
    .from("homework_items")
    .select("id, name, home_item_id");
  if (readErr) return { error: readErr.message };

  const byName = new Map((exist || []).map((r) => [r.name, r]));
  const wanted = withSort(BASIC_HOMEWORK);
  const missing = wanted.filter((i) => !byName.has(i.name));

  let added = 0;
  if (missing.length) {
    const rows = missing.map((i) => ({
      name: i.name,
      category: i.category,
      sort: i.sort,
      active: true,
      method: i.method || null,
      in_person: !!i.inPerson,
    }));
    let { error } = await supabase.from("homework_items").insert(rows);
    if (noColumn(error)) {
      // 0063 전이면 '직접검사' 없이 — 나중에 SQL 을 돌리고 다시 눌러도 된다
      ({ error } = await supabase
        .from("homework_items")
        .insert(rows.map(({ in_person: _p, ...r }) => r)));
    }
    if (error) return { error: error.message };
    added = rows.length;
  }

  // 짝 잇기 — 방금 넣은 것까지 포함해 다시 읽는다
  const { data: all } = await supabase.from("homework_items").select("id, name, home_item_id");
  const idOf = new Map((all || []).map((r) => [r.name, r.id]));
  const now = new Map((all || []).map((r) => [r.name, r.home_item_id]));

  let paired = 0;
  for (const i of wanted) {
    if (!i.pair) continue;
    const from = idOf.get(i.name);
    const to = idOf.get(i.pair);
    if (!from || !to) continue;
    if (now.get(i.name) === to) continue; // 이미 이어져 있다
    if (now.get(i.name)) continue;        // 원장님이 다른 것으로 이어뒀으면 그대로 둔다
    const { error } = await supabase.from("homework_items").update({ home_item_id: to }).eq("id", from);
    if (!error) paired += 1;
  }

  revalidatePath("/homework");
  revalidatePath("/today");
  return { error: null, added, kept: wanted.length - missing.length, paired };
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
  // 준비물 — 아이가 무엇을 펴야 하는가 (0116)
  if ("tool" in (patch || {})) row.tool = (patch.tool || "").trim() || null;
  if ("home_item_id" in (patch || {})) row.home_item_id = patch.home_item_id || null;
  if ("no_timer" in (patch || {})) row.no_timer = !!patch.no_timer;
  if ("in_person" in (patch || {})) row.in_person = !!patch.in_person;
  // 단원평가 — 이 표시가 붙은 항목으로 배정하면 아이 화면에 「결과 내기」 가 열린다 (0106)
  if ("unit_test" in (patch || {})) row.unit_test = !!patch.unit_test;
  if (!row.name && "name" in row) return { error: "이름은 비울 수 없어요." };

  const supabase = createClient();
  let { error } = await supabase.from("homework_items").update(row).eq("id", id);
  if (noColumn(error)) {
    // 0116 전이면 '준비물' 없이
    const { tool: _tl, ...noTool } = row;
    ({ error } = await supabase.from("homework_items").update(noTool).eq("id", id));
    if (!error && "tool" in row) {
      return { error: "준비물을 적으려면 설정 → Supabase SQL 에서 0116 을 먼저 실행해주세요." };
    }
  }
  if (noColumn(error)) {
    // 0106 전이면 '단원평가' 표시 없이
    const { unit_test: _ut, tool: _tl2, ...noUnit } = row;
    ({ error } = await supabase.from("homework_items").update(noUnit).eq("id", id));
  }
  if (noColumn(error)) {
    // 0063 전이면 '직접검사' 없이
    const { in_person: _ip, ...noPerson } = row;
    ({ error } = await supabase.from("homework_items").update(noPerson).eq("id", id));
  }
  if (noColumn(error)) {
    // 0045 → 0033 → 0028 순으로 한 칸씩 물러난다
    const { in_person: _ip2, checklist: _c, home_item_id: _h, ...noList } = row;
    ({ error } = await supabase.from("homework_items").update(noList).eq("id", id));
  }
  if (noColumn(error)) {
    const { checklist: _c1, home_item_id: _h1, no_timer: _t, ...noTimer } = row;
    ({ error } = await supabase.from("homework_items").update(noTimer).eq("id", id));
    if (noColumn(error)) {
      const { prep_task: _p, ...noPrep } = noTimer;
      ({ error } = await supabase.from("homework_items").update(noPrep).eq("id", id));
    }
    if (noColumn(error)) {
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
