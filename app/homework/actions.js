"use server";

import { revalidatePath } from "next/cache";
// 학습항목 화면은 /textbooks/items 에 산다 (2026-08-27 교재 탭으로 이사,
// 2026-08-28 제 주소로 — 성능수리 4차). 여기 액션들은 /homework(리다이렉트
// 껍데기)가 아니라 그 두 자리를 새로 그린다.
import { createClient } from "@/lib/supabase/server";
import { BASIC_HOMEWORK, withSort } from "@/lib/basicHomework";
import { noColumn, isDupName } from "@/lib/sqlError";
import { stripItemRefs } from "@/lib/itemRefs";


function clean(formData, key) {
  const v = (formData.get(key) || "").toString().trim();
  return v || null;
}

export async function addHomeworkItem(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const supabase = await createClient();
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
      ({ error } = await supabase.from("homework_items").insert(rest));
    }
  }
  /**
   * **이름이 이미 있을 때** (원장님 실사고 2026-08-28 — 학습 항목 추가가
   * 안 되고 `duplicate key value violates unique constraint
   * "homework_items_name_key"` 라는 DB 말이 그대로 튀어나왔다).
   *
   * `homework_items.name` 은 유일해야 한다(0005:61). 이름으로 항목을
   * 찾아 쓰는 곳들(노션 이관·본보기 루틴)이 그 유일함에 기대고 있어
   * 제약 자체는 그대로 둔다.
   *
   * 문제는 **숨긴 항목**이다. 안 쓰는 항목을 끄면(active=false) 목록에서
   * 사라지므로, 원장님 눈에는 없는 이름인데 DB 에는 있다 — 그래서 새로
   * 만들려다 알 수 없는 말을 보게 된다. 그 경우 **끈 것을 되살리고**
   * 방금 적으신 내용으로 맞춘다(원장님이 지금 원하시는 것이 그것이다).
   * 켜져 있는 항목이면 되살릴 것이 없으니 **사람 말로 알린다.**
   */
  if (isDupName(error)) {
    const { data: hit } = await supabase
      .from("homework_items")
      .select("id, name, active")
      .eq("name", name)
      .maybeSingle();
    if (hit && hit.active === false) {
      const { error: upErr } = await supabase
        .from("homework_items")
        .update({ category, method, prep_task, tool, active: true })
        .eq("id", hit.id);
      error = upErr || null;
      if (!error) {
        revalidatePath("/textbooks");
        revalidatePath("/textbooks/items");
        revalidatePath("/today");
        return { error: null, revived: true, name };
      }
    } else {
      return {
        error: `「${name}」 은(는) 이미 있는 학습 항목이에요. 목록에서 그 항목을 고쳐 쓰시거나, 다른 이름으로 지어주세요.`,
      };
    }
  }

  revalidatePath("/textbooks");
  revalidatePath("/textbooks/items");
  revalidatePath("/today");
  return { error: error?.message || null };
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
  const supabase = await createClient();

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

  revalidatePath("/textbooks");
  revalidatePath("/textbooks/items");
  revalidatePath("/today");
  return { error: null, added, kept: wanted.length - missing.length, paired };
}

/**
 * 학습항목 엑셀 올리기 (원장님, 2026-08-14). **이름이 같으면 덮어쓰고**
 * 없는 이름은 새로 만든다 — 내려받아 고쳐 다시 올리는 왕복 (단원과 같은 규칙).
 * 파일에서 지운 항목은 안 지운다 — 루틴·리포트가 그 항목을 가리키고 있다.
 */
export async function bulkAddHomeworkItems(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return { error: "올릴 줄이 없어요." };
  const supabase = await createClient();

  const { data: exist } = await supabase
    .from("homework_items")
    .select("id, name, sort");
  const byName = new Map((exist || []).map((x) => [x.name.trim(), x]));
  let maxSort = Math.max(0, ...(exist || []).map((x) => x.sort || 0));

  let added = 0;
  let updated = 0;
  for (const r of rows) {
    const hit = byName.get(r.name);
    const patch = {
      category: r.category || (hit ? undefined : "기타"),
      tool: r.tool || null,
      active: true,
    };
    if (r.sort !== null && r.sort !== undefined) patch.sort = r.sort;
    if (hit) {
      // undefined 칸은 보내지 않는다 — 빈 엑셀 칸이 있는 값을 지우면 안 된다
      const clean = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined)
      );
      let { error } = await supabase.from("homework_items").update(clean).eq("id", hit.id);
      if (error && (error.code === "42703" || error.code === "PGRST204")) {
        const { tool: _t, ...noTool } = clean;   // 0116 전
        ({ error } = await supabase.from("homework_items").update(noTool).eq("id", hit.id));
      }
      if (error) return { error: `「${r.name}」 저장 실패: ${error.message}` };
      updated += 1;
    } else {
      maxSort += 10;
      const row = {
        name: r.name,
        category: r.category || "기타",
        sort: r.sort ?? maxSort,
        tool: r.tool || null,
        active: true,
      };
      let { error } = await supabase.from("homework_items").insert(row);
      if (error && (error.code === "42703" || error.code === "PGRST204")) {
        const { tool: _t, ...noTool } = row;
        ({ error } = await supabase.from("homework_items").insert(noTool));
      }
      if (error) return { error: `「${r.name}」 추가 실패: ${error.message}` };
      added += 1;
    }
  }
  revalidatePath("/textbooks");
  revalidatePath("/textbooks/items");
  return { error: null, added, updated };
}

/** 지금 들어 있는 학습항목 내려받기용 — 고쳐서 다시 올리는 왕복 */
export async function exportHomeworkItems() {
  const supabase = await createClient();
  let { data, error } = await supabase
    .from("homework_items")
    .select("name, category, sort, tool, active")
    .order("sort", { ascending: true });
  if (error) {
    // 0116 전이면 준비물 없이
    ({ data, error } = await supabase
      .from("homework_items")
      .select("name, category, sort, active")
      .order("sort", { ascending: true }));
  }
  if (error) return { error: error.message, rows: [] };
  const rows = (data || [])
    .filter((x) => x.active)
    .map((x) => [x.name, x.category || "", x.sort ?? "", x.tool || ""]);
  return { error: null, rows };
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
  // 안 해온 숙제 기본 처분 (0141) — inclass | homework | stay | 빈값
  // (stay 는 원장님 2026-08-21 「미제출 처분에 수업 후 남아서 항목도 필요해」)
  if ("redo_default" in (patch || {})) row.redo_default = patch.redo_default || null;
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

  const supabase = await createClient();
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
  revalidatePath("/textbooks");
  revalidatePath("/textbooks/items");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

export async function setHomeworkItemsActive(ids, active) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.from("homework_items").update({ active }).in("id", ids);
  revalidatePath("/textbooks");
  revalidatePath("/textbooks/items");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

export async function setHomeworkItemsCategory(ids, category) {
  if (!Array.isArray(ids) || ids.length === 0 || !category) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.from("homework_items").update({ category }).in("id", ids);
  revalidatePath("/textbooks");
  revalidatePath("/textbooks/items");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

export async function deleteHomeworkItems(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = await createClient();
  /**
   * **기록이 있는 항목은 지우지 않는다 — 숨긴다** (0170, 원장 확정 8/27).
   * 항목을 지우면 전 학생·전 날짜의 검사행이 함께 사라졌다(#14 —
   * cascade). 3표를 세어 이력이 하나라도 있으면 삭제를 거절하고 숨김
   * (active=false)을 안내한다. DB 도 0170 restrict 로 같은 것을 막지만,
   * 여기 선검사가 있어야 SQL 을 아직 안 돌린 판에서도 같은 동작이고
   * 안내 문구도 사람 말이 된다.
   */
  const [dri, af, cs] = await Promise.all([
    supabase.from("daily_report_items").select("id", { count: "exact", head: true }).in("homework_item_id", ids),
    supabase.from("answer_files").select("student_id", { count: "exact", head: true }).in("homework_item_id", ids),
    supabase.from("classcard_shadow").select("student_id", { count: "exact", head: true }).in("item_id", ids),
  ]);
  const used = (dri.count || 0) + (af.count || 0) + (cs.count || 0);
  if (used > 0) {
    return {
      error:
        `이 항목은 기록 ${used}건에 쓰였어요 — 지우면 과거 검사까지 사라져서 막았어요.\n` +
        "대신 「숨김」 을 눌러주세요: 목록에서는 빠지고 과거 기록은 이름 그대로 남아요.",
    };
  }
  /**
   * (기록 0건일 때만 진짜 삭제) **지우기 전에 이름표부터 걷는다**
   * (원장님 2026-08-24 — 저장이 fkey 로 거절당했다). 교재 활동 지도·
   * 진도루틴 단계·학생 기본 목록의 이름표를 안 걷으면 판을 열 때마다
   * 다시 담기고 저장 전체가 거절당한다.
   */
  await stripItemRefs(supabase, { dead: ids, apply: true });
  const { error } = await supabase.from("homework_items").delete().in("id", ids);
  revalidatePath("/textbooks");
  revalidatePath("/textbooks/items");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

/**
 * **단원평가 공통 단원 목록** (원장님, 2026-08-19 — 「단원평가는 교재단원과
 * 별개로 문법 대단원으로 공통의 목록이 하나 필요함」).
 * 관계사·수동태처럼 교재가 무엇이든 같은 문법 갈래 이름들 — 한 줄에 하나.
 * integrations 'grammar_units' 에 담는다 (새 표를 만들 것 없이).
 */
export async function saveGrammarUnits(text) {
  const supabase = await createClient();
  const names = (text || "")
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const { error } = await supabase.from("integrations").upsert({
    id: "grammar_units",
    enabled: true,
    config: { names },
  });
  if (error) return { error: error.message };
  revalidatePath("/textbooks");
  revalidatePath("/textbooks/items");
  revalidatePath("/today");
  return { error: null, count: names.length };
}
