"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unitOptions } from "@/lib/unitTree";

function ok(error) {
  return { error: error ? error.message : null };
}

// ---------- 교재 배정 ----------

// 반에 교재를 붙이면 그 반 학생 전원에게도 배정한다 (원칙1: 한 번만 고른다)
export async function setClassTextbooks(classId, textbookIds) {
  if (!classId) return { error: "반이 없어요." };
  const supabase = createClient();
  const next = new Set(textbookIds || []);

  const { data: cur } = await supabase
    .from("class_textbooks")
    .select("textbook_id")
    .eq("class_id", classId);
  const now = new Set((cur || []).map((r) => r.textbook_id));

  const toAdd = [...next].filter((id) => !now.has(id));
  const toRemove = [...now].filter((id) => !next.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("class_textbooks")
      .delete()
      .eq("class_id", classId)
      .in("textbook_id", toRemove);
    if (error) return ok(error);
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("class_textbooks")
      .insert(toAdd.map((textbook_id) => ({ class_id: classId, textbook_id })));
    if (error) return ok(error);
  }

  // 반 학생들에게 새 교재 배정 (이미 있으면 그대로 둠 — 진도는 건드리지 않는다)
  if (toAdd.length > 0) {
    const { data: members } = await supabase
      .from("class_students")
      .select("student_id")
      .eq("class_id", classId);
    const rows = [];
    (members || []).forEach((m) =>
      toAdd.forEach((textbook_id) => rows.push({ student_id: m.student_id, textbook_id }))
    );
    if (rows.length > 0) {
      const { error } = await supabase
        .from("student_textbooks")
        .upsert(rows, { onConflict: "student_id,textbook_id", ignoreDuplicates: true });
      if (error) return ok(error);
    }
  }

  revalidatePath("/classes");
  revalidatePath("/today");
  return { error: null, added: toAdd.length, removed: toRemove.length };
}

// 학생 한 명의 교재를 직접 조정 (반과 다르게 쓰는 학생용)
export async function setStudentTextbooks(studentId, textbookIds) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = createClient();
  const next = new Set(textbookIds || []);

  const { data: cur } = await supabase
    .from("student_textbooks")
    .select("textbook_id")
    .eq("student_id", studentId);
  const now = new Set((cur || []).map((r) => r.textbook_id));

  const toAdd = [...next].filter((id) => !now.has(id));
  const toRemove = [...now].filter((id) => !next.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("student_textbooks")
      .delete()
      .eq("student_id", studentId)
      .in("textbook_id", toRemove);
    if (error) return ok(error);
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("student_textbooks")
      .insert(toAdd.map((textbook_id) => ({ student_id: studentId, textbook_id })));
    if (error) return ok(error);
  }
  revalidatePath("/today");
  return { error: null };
}

// 단원을 아직 안 만든 교재는 "지금 몇 페이지까지"로 진도를 적는다
export async function setCurrentPage(studentId, textbookId, page) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const d = (page ?? "").toString().replace(/[^\d]/g, "");
  const supabase = createClient();
  const { error } = await supabase.from("student_textbooks").upsert(
    { student_id: studentId, textbook_id: textbookId, current_page: d ? parseInt(d, 10) : null },
    { onConflict: "student_id,textbook_id" }
  );
  revalidatePath("/today");
  return ok(error);
}

// ---------- 단원 진도 ----------

// 한 학생의 교재 하나에 대한 단원 목록 + 완료 여부
export async function listStudentUnits(studentId, textbookId) {
  if (!studentId || !textbookId) return { units: [], error: null };
  const supabase = createClient();

  const base = "id, textbook_id, parent_id, label, name, page_start, page_end, sort";
  let { data: units, error } = await supabase
    .from("textbook_units")
    .select(`${base}, total_pages`)
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: true });
  if (error) {
    ({ data: units, error } = await supabase
      .from("textbook_units")
      .select(base)
      .eq("textbook_id", textbookId)
      .order("sort", { ascending: true }));
  }
  if (error) return { units: [], error: error.message };

  const ids = (units || []).map((u) => u.id);
  const { data: prog } = ids.length
    ? await supabase
        .from("student_unit_progress")
        .select("textbook_unit_id, status, done_on")
        .eq("student_id", studentId)
        .in("textbook_unit_id", ids)
    : { data: [] };
  const byUnit = new Map((prog || []).map((p) => [p.textbook_unit_id, p]));

  // 자식이 없는 단원(소단원)만 체크 대상으로 본다
  const hasChild = new Set((units || []).map((u) => u.parent_id).filter(Boolean));
  const options = unitOptions(units || []).map((o) => ({
    ...o,
    leaf: !hasChild.has(o.id),
    status: byUnit.get(o.id)?.status || "",
    doneOn: byUnit.get(o.id)?.done_on || null,
  }));
  return { units: options, error: null };
}

// 순서와 상관없이 아무 단원이나 완료/미완료로 바꾼다
export async function setUnitProgress(studentId, unitIds, status) {
  const ids = Array.isArray(unitIds) ? unitIds : [unitIds];
  if (!studentId || ids.length === 0) return { error: null };
  const supabase = createClient();

  if (!status) {
    // 완료 취소 = 기록을 지운다 (기록이 없으면 = 아직 안 함)
    const { error } = await supabase
      .from("student_unit_progress")
      .delete()
      .eq("student_id", studentId)
      .in("textbook_unit_id", ids);
    revalidatePath("/today");
    return ok(error);
  }

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const { error } = await supabase.from("student_unit_progress").upsert(
    ids.map((textbook_unit_id) => ({
      student_id: studentId,
      textbook_unit_id,
      status,
      done_on: status === "done" ? today : null,
    })),
    { onConflict: "student_id,textbook_unit_id" }
  );
  revalidatePath("/today");
  return ok(error);
}
