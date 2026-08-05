"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * 이 학생이 **지금 할 차례**인 루틴 단계를 내어준다.
 *
 * 학생이 쓰는 교재 중 루틴이 있는 것들을 보고, 각 교재의 현재 단계를 모은다.
 * 여러 교재에 루틴이 있으면 다 합친다 (문법 + 독해처럼).
 *
 * 되돌려주기만 하고 저장하지는 않는다 — 화면에서 보고 고칠 수 있어야 하니까.
 */
export async function nextRoutine(studentId) {
  if (!studentId) return { inclass: [], home: [], steps: [], error: null };
  const supabase = createClient();

  // 회독(round)까지 본다 — 2회독이면 1회독 진도는 끝난 것으로 치지 않는다
  let stq = await supabase
    .from("student_textbooks")
    .select("textbook_id, status, routine_step, round")
    .eq("student_id", studentId);
  if (stq.error) {
    stq = await supabase
      .from("student_textbooks")
      .select("textbook_id, status, routine_step")
      .eq("student_id", studentId);
  }
  if (stq.error) return { inclass: [], home: [], steps: [], error: null };

  const mine = (stq.data || []).filter((r) => !r.status || r.status === "active");
  const bookIds = mine.map((r) => r.textbook_id);
  if (bookIds.length === 0) return { inclass: [], home: [], steps: [], error: null };

  const rq = await supabase
    .from("routine_steps")
    .select("id, textbook_id, sort, label, inclass_items, home_items")
    .in("textbook_id", bookIds)
    .order("sort", { ascending: true });
  if (rq.error) return { inclass: [], home: [], steps: [], error: "0035 SQL 을 먼저 실행해주세요." };

  const byBook = new Map();
  (rq.data || []).forEach((s) => {
    if (!byBook.has(s.textbook_id)) byBook.set(s.textbook_id, []);
    byBook.get(s.textbook_id).push(s);
  });

  const { data: books } = await supabase
    .from("textbooks")
    .select("id, name")
    .in("id", bookIds);
  const bookName = new Map((books || []).map((b) => [b.id, b.name]));

  // ── 지금 할 단원 ────────────────────────────────────────
  //
  // 루틴은 **한 단원을 여러 회차에 걸쳐** 하는 순서다. 그래서 항목만 채워주고
  // 범위를 비워두면, 매번 「그래서 몇 과였더라」 를 다시 찾아야 했다.
  //
  // 지금 할 단원 = 이 회독에서 **아직 안 끝낸 첫 단원.** 회독을 넘기면
  // 진도가 비어 있으니 자연스럽게 처음 단원으로 돌아온다 (0026).
  const unitOfBook = await currentUnits(supabase, studentId, bookIds, mine);

  const inclass = new Set();
  const home = new Set();
  const steps = [];
  const itemUnits = {};   // itemId → { textbookId, unitIds }
  mine.forEach((r) => {
    const list = byBook.get(r.textbook_id) || [];
    if (list.length === 0) return;
    const idx = ((r.routine_step || 0) % list.length + list.length) % list.length;
    const step = list[idx];
    const unit = unitOfBook.get(r.textbook_id) || null;
    (step.inclass_items || []).forEach((x) => inclass.add(x));
    (step.home_items || []).forEach((x) => {
      home.add(x);
      // 숙제에는 범위가 붙어야 한다 — 등원 학습은 그 자리에서 하니 안 붙인다
      if (unit?.id) itemUnits[x] = { textbookId: r.textbook_id, unitIds: [unit.id] };
    });
    steps.push({
      textbookId: r.textbook_id,
      book: bookName.get(r.textbook_id) || "교재",
      no: idx + 1,
      total: list.length,
      label: step.label || "",
      unit: unit ? unit.name : "",
      unitDone: !!unit?.allDone,
    });
  });

  return { inclass: [...inclass], home: [...home], steps, itemUnits, error: null };
}

/**
 * 교재마다 **이 학생이 지금 할 단원.**
 *
 * 이 회독에서 아직 안 끝낸 첫 소단원이다. 다 끝났으면 null 을 주고 화면에서
 * 「단원을 다 했어요」 라고 알린다 — 조용히 첫 단원으로 되돌리면 다시
 * 1과를 내주게 된다.
 */
async function currentUnits(supabase, studentId, bookIds, mine) {
  const out = new Map();
  if (bookIds.length === 0) return out;

  const uq = await supabase
    .from("textbook_units")
    .select("id, name, parent_id, textbook_id, sort")
    .in("textbook_id", bookIds)
    .order("sort", { ascending: true });
  if (uq.error) return out;

  // 진도는 **소단원**에 찍힌다 (자식이 없는 것)
  const hasChild = new Set((uq.data || []).map((u) => u.parent_id).filter(Boolean));
  const leaves = (uq.data || []).filter((u) => !hasChild.has(u.id));
  if (leaves.length === 0) return out;

  const roundOf = new Map((mine || []).map((r) => [r.textbook_id, r.round || 1]));
  const pq = await supabase
    .from("student_unit_progress")
    .select("textbook_unit_id, status, round")
    .eq("student_id", studentId)
    .in("textbook_unit_id", leaves.map((u) => u.id));
  const done = new Set(
    (pq.error ? [] : pq.data || [])
      .filter((p) => p.status === "done")
      .map((p) => `${p.textbook_unit_id}|${p.round || 1}`)
  );

  bookIds.forEach((bid) => {
    const list = leaves.filter((u) => u.textbook_id === bid);
    if (list.length === 0) return;
    const round = roundOf.get(bid) || 1;
    const nextOne = list.find((u) => !done.has(`${u.id}|${round}`));
    if (nextOne) out.set(bid, { id: nextOne.id, name: nextOne.name || "" });
    else out.set(bid, { id: null, name: "", allDone: true });
  });
  return out;
}

/** 이 학생의 루틴 단계를 하나 넘긴다 (끝까지 가면 처음으로) */
export async function advanceRoutine(studentId, textbookIds) {
  if (!studentId || !Array.isArray(textbookIds) || textbookIds.length === 0) {
    return { error: null };
  }
  const supabase = createClient();
  const { data: cur } = await supabase
    .from("student_textbooks")
    .select("textbook_id, routine_step")
    .eq("student_id", studentId)
    .in("textbook_id", textbookIds);

  for (const r of cur || []) {
    const { data: list } = await supabase
      .from("routine_steps")
      .select("id")
      .eq("textbook_id", r.textbook_id);
    const len = (list || []).length || 1;
    await supabase
      .from("student_textbooks")
      .update({ routine_step: ((r.routine_step || 0) + 1) % len })
      .eq("student_id", studentId)
      .eq("textbook_id", r.textbook_id);
  }
  return { error: null };
}

/** 학생별 기본값 저장 (루틴이 없는 과목용) */
export async function saveStudentDefaults(studentId, inclass, home) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("students")
    .update({ default_inclass: inclass || [], default_home: home || [] })
    .eq("id", studentId);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    return { error: "0035 SQL 을 먼저 실행해주세요." };
  }
  return { error: error ? error.message : null };
}
