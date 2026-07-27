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

  const stq = await supabase
    .from("student_textbooks")
    .select("textbook_id, status, routine_step")
    .eq("student_id", studentId);
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

  const inclass = new Set();
  const home = new Set();
  const steps = [];
  mine.forEach((r) => {
    const list = byBook.get(r.textbook_id) || [];
    if (list.length === 0) return;
    const idx = ((r.routine_step || 0) % list.length + list.length) % list.length;
    const step = list[idx];
    (step.inclass_items || []).forEach((x) => inclass.add(x));
    (step.home_items || []).forEach((x) => home.add(x));
    steps.push({
      textbookId: r.textbook_id,
      book: bookName.get(r.textbook_id) || "교재",
      no: idx + 1,
      total: list.length,
      label: step.label || "",
    });
  });

  return { inclass: [...inclass], home: [...home], steps, error: null };
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
