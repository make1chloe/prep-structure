"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * **루틴은 메뉴다 — 학생마다 그중 할 것만 고른다** (원장님 2026-08-24 —
 * 「교재루틴이 있으면 그걸 학생한테 일부만 배정하는 거야. 그래서 재원생에서
 * 편집이 필요한 거고」 · 「교재루틴, 영역루틴 을 학생에게 배정」).
 *
 * 여태는 루틴에 적힌 것이 곧 그 학생 것이었다. 아이마다 다르게 하려면 교재
 * 루틴 자체를 고쳐야 했고, 그러면 그 교재를 쓰는 **다른 아이까지** 바뀌었다.
 *
 * 담는 방식은 **「빼는 것」**(0153 routine_skip)이다.
 *   비어 있음 = 루틴에 적힌 것 전부 한다 (지금까지의 동작 그대로)
 *   담겨 있음 = 그 항목만 이 학생에게서 뺀다
 * 「고른 것」 으로 담으면 루틴에 항목을 더할 때마다 학생 전원을 다시 손봐야
 * 한다. 빼는 것으로 담으면 새 항목은 저절로 모두에게 간다.
 *
 * **교재 루틴과 영역 루틴을 가르지 않는다** — 영역 루틴도 결국 그 학생의
 * 그 교재 자리에서 쓰이므로, 한 칸이 둘 다 덮는다. 어느 쪽을 따르는지는
 * `따르는루틴` 으로 알려준다 (화면이 그대로 적어준다).
 */
export async function routineChoices(studentId, textbookId) {
  if (!studentId || !textbookId) return { steps: [], skip: [], error: null };
  const supabase = createClient();

  let stq = await supabase
    .from("student_textbooks")
    .select("round, routine_skip, routine_set_at, routine_order")
    .eq("student_id", studentId).eq("textbook_id", textbookId).maybeSingle();
  let hasOrder = !stq.error;
  if (stq.error) {
    // 0154 전 — 도장·차례 없이
    stq = await supabase
      .from("student_textbooks")
      .select("round, routine_skip")
      .eq("student_id", studentId).eq("textbook_id", textbookId).maybeSingle();
  }
  let hasCol = !stq.error;
  if (stq.error) {
    // 0153 전 — 뺀 목록 칸이 아직 없다
    stq = await supabase
      .from("student_textbooks")
      .select("round")
      .eq("student_id", studentId).eq("textbook_id", textbookId).maybeSingle();
  }
  const cur = stq.data?.round || 1;

  const { data: book } = await supabase
    .from("textbooks").select("id, name, area").eq("id", textbookId).maybeSingle();

  const cols = "id, sort, label, inclass_items, home_items, home_next, round";
  let rq = await supabase
    .from("routine_steps").select(cols)
    .eq("textbook_id", textbookId).order("sort", { ascending: true });
  if (rq.error) {
    rq = await supabase
      .from("routine_steps").select("id, sort, label, inclass_items, home_items")
      .eq("textbook_id", textbookId).order("sort", { ascending: true });
  }
  let all = rq.data || [];
  let 따르는루틴 = "교재";
  // 교재 루틴이 한 줄도 없으면 그 영역 루틴을 따른다 (0137)
  if (all.length === 0 && book?.area) {
    const aq = await supabase
      .from("routine_steps").select(`${cols}, area`)
      .eq("area", book.area).is("textbook_id", null)
      .order("sort", { ascending: true });
    if (!aq.error) { all = aq.data || []; 따르는루틴 = "영역"; }
  }

  // 회독 분기 — nextRoutine 과 같은 잣대 (0135)
  const rounded = all.filter((x) => x.round != null && x.round <= cur);
  const maxR = rounded.length ? Math.max(...rounded.map((x) => x.round)) : null;
  const list = all.filter((x) => x.round == null || x.round === maxR);

  const ids = [...new Set(list.flatMap((x) => [
    ...(x.inclass_items || []), ...(x.home_items || []), ...(x.home_next || []),
  ]).filter(Boolean))];
  const { data: hw } = ids.length
    ? await supabase.from("homework_items").select("id, name").in("id", ids)
    : { data: [] };
  const nameOf = new Map((hw || []).map((x) => [x.id, x.name]));

  const steps = list.map((x, i) => ({
    id: x.id,
    no: i + 1,
    label: x.label || "",
    inclass: (x.inclass_items || []).filter(Boolean).map((id) => ({ id, name: nameOf.get(id) || "(지워진 항목)" })),
    home: [...(x.home_items || []), ...(x.home_next || [])]
      .filter(Boolean).map((id) => ({ id, name: nameOf.get(id) || "(지워진 항목)" })),
  }));

  /**
   * **차례** (0154). 정해둔 것이 앞, 없던 것은 루틴 차례대로 뒤에.
   * 루틴에 항목을 새로 더해도 사라지지 않는다.
   */
  const saved = hasOrder ? (stq.data?.routine_order || []).filter(Boolean) : [];
  const rank = new Map(saved.map((x, i) => [x, i]));
  const order = [...ids].sort((a2, b2) => (rank.get(a2) ?? 9e9) - (rank.get(b2) ?? 9e9));

  return {
    steps,
    order,
    정함: hasOrder ? !!stq.data?.routine_set_at : false,
    차례있음: hasOrder,
    skip: hasCol ? stq.data?.routine_skip || [] : [],
    따르는루틴: steps.length ? 따르는루틴 : null,
    회독: cur,
    ready: hasCol,
    error: null,
  };
}

/**
 * 뺀 것 · 차례 · 「정했다」 도장을 한 번에 담는다.
 *
 * **도장을 따로 두는 까닭** — 뺀 목록이 비어 있는 것이 「전부 한다」 인지
 * 「아직 안 봤다」 인지 구별이 안 된다. 대시보드가 재촉할 것을 알려면
 * 도장이 있어야 한다 (원장님 2026-08-24 「안 되어 있으면 안 되는 정보니까
 * 대시보드 알림이 필요해」).
 */
export async function setRoutinePick(studentId, textbookId, { skip, order, 정함 } = {}) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const supabase = createClient();
  const patch = { routine_skip: [...new Set((skip || []).filter(Boolean))] };
  if (Array.isArray(order)) patch.routine_order = [...new Set(order.filter(Boolean))];
  if (정함) patch.routine_set_at = new Date().toISOString();
  let { error } = await supabase
    .from("student_textbooks").update(patch)
    .eq("student_id", studentId).eq("textbook_id", textbookId);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0154 전 — 뺀 목록만이라도 담는다
    ({ error } = await supabase
      .from("student_textbooks").update({ routine_skip: patch.routine_skip })
      .eq("student_id", studentId).eq("textbook_id", textbookId));
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      return { error: "관리자 → SQL 확인에서 0153·0154 를 먼저 실행해 주세요." };
    }
    if (!error) return { error: null, 도장못찍음: true };
  }
  if (error) return { error: error.message };
  revalidatePath("/students");
  revalidatePath("/today");
  revalidatePath("/");
  return { error: null };
}
