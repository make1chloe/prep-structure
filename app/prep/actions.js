"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toTeachers } from "@/lib/exams";
import { needSql } from "@/lib/sqlError";

const SQL = "0052~0054 SQL 을 먼저 실행해주세요.";

/** 범위를 담을 때 고를 교재 목록 (정규 교재DB 그대로 쓴다) */
export async function listBooks() {
  const supabase = createClient();
  let { data, error } = await supabase
    .from("textbooks")
    .select("id, name, category")
    .order("name", { ascending: true });
  if (error) {
    // category 칸이 없는 DB
    ({ data, error } = await supabase
      .from("textbooks")
      .select("id, name")
      .order("name", { ascending: true }));
  }
  return { rows: data || [], error: error ? error.message : null };
}

// ── 자료 종류 ──────────────────────────────────────────
export async function listTypes() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("prep_material_types")
    .select("id, parent_id, name, sort, active, need_make, need_print, need_card, need_hand, need_solve, need_grade")
    .order("sort", { ascending: true });
  if (needSql(error)) return { rows: [], error: SQL };
  return { rows: data || [], error: error ? error.message : null };
}

export async function saveType(t = {}) {
  const name = (t.name || "").trim();
  if (!name) return { error: "이름을 넣어주세요." };
  const supabase = createClient();

  const row = {
    parent_id: t.parent_id || null,
    name,
    sort: Number.isFinite(+t.sort) && t.sort !== "" ? +t.sort : 0,
    active: t.active !== false,
    need_make: !!t.need_make,
    need_print: !!t.need_print,
    need_card: !!t.need_card,
    need_hand: !!t.need_hand,
    need_solve: !!t.need_solve,
    need_grade: !!t.need_grade,
  };
  const q = t.id
    ? await supabase.from("prep_material_types").update(row).eq("id", t.id)
    : await supabase.from("prep_material_types").insert(row);
  if (needSql(q.error)) return { error: SQL };
  revalidatePath("/prep");
  return { error: q.error ? q.error.message : null };
}

export async function removeType(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("prep_material_types").delete().eq("id", id);
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

// ── 시험 ───────────────────────────────────────────────
/**
 * 시험 한 줄 — **학사일정과 같은 표**다 (0074).
 *
 * 예전에는 내신 자료용 시험(prep_exams)이 따로 있어서, 같은 신송중 1학기 기말이
 * 두 줄로 살고 서로를 몰랐다. 날짜가 바뀌면 두 군데를 고쳐야 했고, 등급컷은
 * 이쪽에만 · 범위는 저쪽에만 있었다.
 *
 * 여기서 만든 시험은 학사일정에도 그대로 뜬다 (그게 맞다 — 같은 시험이다).
 */
export async function saveExam(e = {}) {
  const school = (e.school || "").trim();
  const term = (e.term || "").trim();
  if (!school || !term) return { error: "학교와 학기를 넣어주세요." };
  const supabase = createClient();

  // 시험 기간을 모르면 영어 시험일 하루짜리로 둔다 — 아는 것이 그것뿐이다.
  // 학사일정에서 나이스로 받아오면 진짜 기간으로 채워진다.
  const day = (e.exam_date || "").trim() || null;
  const row = {
    school,
    name: term,
    grade: (e.grade || "").trim() || null,
    english_on: day,
    teachers: toTeachers(e.teachers ?? e.teacher),
    note: (e.note || "").trim() || null,
  };
  if (!e.id) {
    row.from_date = day || new Date().toISOString().slice(0, 10);
    row.to_date = row.from_date;
    row.source = "manual";
  }

  let q = e.id
    ? await supabase.from("exam_periods").update(row).eq("id", e.id)
    : await supabase.from("exam_periods").insert(row);
  // 0074 전이면 출제 선생님 칸이 없다
  if (q.error && (q.error.code === "PGRST204" || q.error.code === "42703")) {
    const { teachers: _t, source: _s, ...noNew } = row;
    q = e.id
      ? await supabase.from("exam_periods").update(noNew).eq("id", e.id)
      : await supabase.from("exam_periods").insert(noNew);
  }
  if (needSql(q.error)) return { error: SQL };
  revalidatePath("/prep");
  revalidatePath("/schedule");
  return { error: q.error ? q.error.message : null };
}

export async function removeExam(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  // 시험을 지우면 범위·자료도 같이 간다. 학사일정에서도 사라진다 — 같은 시험이다.
  const { error } = await supabase.from("exam_periods").delete().eq("id", id);
  revalidatePath("/prep");
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}

// ── 범위 ───────────────────────────────────────────────
export async function saveScope(s = {}) {
  if (!s.exam_id) return { error: "시험이 없어요." };
  const supabase = createClient();
  const row = {
    exam_id: s.exam_id,
    name: (s.name || "").trim() || null,
    unit_ids: Array.isArray(s.unit_ids) ? s.unit_ids : [],
    note: (s.note || "").trim() || null,
    sort: Number.isFinite(+s.sort) && s.sort !== "" ? +s.sort : 0,
  };
  const q = s.id
    ? await supabase.from("prep_scopes").update(row).eq("id", s.id)
    : await supabase.from("prep_scopes").insert(row);
  if (needSql(q.error)) return { error: SQL };
  revalidatePath("/prep");
  return { error: q.error ? q.error.message : null };
}

/**
 * 범위를 지운다 — **그 아래 자료와 학생 배정도 같이 사라진다.**
 * 원장님 판단이고, 되돌릴 수 없다.
 */
export async function removeScope(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("prep_scopes").delete().eq("id", id);
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

// ── 자료 ───────────────────────────────────────────────
export async function addMaterial(scopeId, typeId, name) {
  if (!scopeId) return { error: "범위가 없어요." };
  const supabase = createClient();

  // 종류에 정해둔 단계를 그대로 가져온다 — 매번 체크할 일이 없게
  let base = { need_make: true, need_print: true, need_card: false, need_hand: true, need_solve: true, need_grade: true };
  let sort = 0;
  if (typeId) {
    const { data: t } = await supabase
      .from("prep_material_types")
      .select("sort, need_make, need_print, need_card, need_hand, need_solve, need_grade")
      .eq("id", typeId)
      .maybeSingle();
    if (t) {
      base = {
        need_make: t.need_make, need_print: t.need_print, need_card: t.need_card,
        need_hand: t.need_hand, need_solve: t.need_solve, need_grade: t.need_grade,
      };
      sort = t.sort ?? 0;
    }
  }

  const { error } = await supabase.from("prep_materials").insert({
    scope_id: scopeId,
    type_id: typeId || null,
    name: (name || "").trim() || null,
    sort,
    ...base,
  });
  if (needSql(error)) return { error: SQL };
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

export async function updateMaterial(id, patch = {}) {
  if (!id) return { error: null };
  const supabase = createClient();
  const row = {};
  ["need_make", "need_print", "need_card", "need_hand", "need_solve", "need_grade"].forEach((k) => {
    if (k in patch) row[k] = !!patch[k];
  });
  ["made_at", "printed_at", "card_at"].forEach((k) => {
    if (k in patch) row[k] = patch[k] || null;
  });
  if ("name" in patch) row.name = (patch.name || "").trim() || null;
  if ("sort" in patch) row.sort = Number.isFinite(+patch.sort) ? +patch.sort : 0;
  if ("note" in patch) row.note = (patch.note || "").trim() || null;

  const { error } = await supabase.from("prep_materials").update(row).eq("id", id);
  if (needSql(error)) return { error: SQL };
  revalidatePath("/prep");
  revalidatePath("/tasks");
  return { error: error ? error.message : null };
}

export async function removeMaterial(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("prep_materials").delete().eq("id", id);
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

/** 단계 하나를 '했음' 으로 (다시 누르면 취소) */
export async function markStage(materialId, stage, on = true) {
  const COL = { make: "made_at", print: "printed_at", card: "card_at" };
  const col = COL[stage];
  if (!materialId || !col) return { error: "알 수 없는 단계예요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("prep_materials")
    .update({ [col]: on ? new Date().toISOString() : null })
    .eq("id", materialId);
  if (needSql(error)) return { error: SQL };
  revalidatePath("/prep");
  revalidatePath("/tasks");
  return { error: error ? error.message : null };
}

// ── 학생 배정 ──────────────────────────────────────────
export async function setAssignees(materialId, studentIds = []) {
  if (!materialId) return { error: "자료가 없어요." };
  const supabase = createClient();

  const { data: have } = await supabase
    .from("prep_assignments")
    .select("id, student_id")
    .eq("material_id", materialId);
  const now = new Set(studentIds);
  const was = new Map((have || []).map((a) => [a.student_id, a.id]));

  const add = studentIds.filter((id) => !was.has(id));
  const drop = [...was.entries()].filter(([sid]) => !now.has(sid)).map(([, id]) => id);

  if (add.length) {
    const { error } = await supabase
      .from("prep_assignments")
      .insert(add.map((student_id) => ({ material_id: materialId, student_id })));
    if (needSql(error)) return { error: SQL };
    if (error) return { error: error.message };
  }
  if (drop.length) await supabase.from("prep_assignments").delete().in("id", drop);

  revalidatePath("/prep");
  return { error: null };
}

/** 학생 한 명의 단계 (배부 · 풀이 · 채점) */
export async function markAssign(assignId, stage, on = true, extra = {}) {
  const COL = { hand: "handed_at", solve: "solved_at", grade: "graded_at" };
  const col = COL[stage];
  if (!assignId || !col) return { error: "알 수 없는 단계예요." };
  const supabase = createClient();
  const row = { [col]: on ? new Date().toISOString() : null };
  if ("result" in extra) row.result = extra.result || null;
  if ("score" in extra) row.score = (extra.score || "").trim() || null;
  if ("note" in extra) row.note = (extra.note || "").trim() || null;
  const { error } = await supabase.from("prep_assignments").update(row).eq("id", assignId);
  if (needSql(error)) return { error: SQL };
  revalidatePath("/prep");
  revalidatePath("/tasks");
  return { error: error ? error.message : null };
}

// ── 골라서 한 번에 ─────────────────────────────────────
//
// 시험 하나에 범위가 여럿이고, 범위마다 자료가 여럿이다. 인쇄를 몰아서 하고
// 나면 열댓 개를 하나씩 눌러 '인쇄함' 으로 바꿔야 했다.
//
// **두 층 모두에서 고를 수 있게 한다.**
//   위층(범위)  고른 범위들의 자료 전부에 한꺼번에
//   아래층(자료) 그 범위 안에서 자료만 골라서

export async function markStages(materialIds, stage, on = true) {
  const COL = { make: "made_at", print: "printed_at", card: "card_at" };
  const col = COL[stage];
  const ids = (materialIds || []).filter(Boolean);
  if (ids.length === 0 || !col) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("prep_materials")
    .update({ [col]: on ? new Date().toISOString() : null })
    .in("id", ids);
  if (needSql(error)) return { error: SQL };
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

export async function removeMaterials(materialIds) {
  const ids = (materialIds || []).filter(Boolean);
  if (ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("prep_materials").delete().in("id", ids);
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

export async function removeScopes(scopeIds) {
  const ids = (scopeIds || []).filter(Boolean);
  if (ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("prep_scopes").delete().in("id", ids);
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

/**
 * **모의고사를 문항별로 담을 수 있게 만든다** (원장님, 2026-08-08 —
 * 「모고는 단원별 아니고 문항별로 시험범위 나온다는 점 고려해줘」).
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 *
 * 고등학교 내신은 그 학기 모의고사 지문이 시험범위에 들어간다.
 * 학교는 「3월 모의고사 18~24번」 처럼 **문항 번호로** 알려준다.
 *
 * 그런데 시험범위는 교재 단원에서 골라 담게 되어 있다(ScopePicker).
 * 모의고사는 교재가 아니니 담을 것이 없었고, 그래서 결국 손으로 적게 됐다.
 * 손으로 적으면 자료도 안 붙고 학생 배정도 안 된다.
 *
 * ── 무엇을 하나 ──────────────────────────────────────────
 *
 * 그 모의고사 회차 이름으로 **교재를 하나 만들고, 문항 번호를 단원으로**
 * 넣는다. 그러면 다음부터는 다른 교재와 똑같이 「18번 ~ 24번」 을 클릭으로
 * 담을 수 있다.
 *
 * 영어 영역은 1~17번이 듣기다. 듣기는 내신 범위에 안 들어가므로
 * **18번부터** 만든다 (필요하면 first 를 1로 주면 된다).
 *
 * 두 번 눌러도 안 늘어난다 — 이미 있으면 그 교재를 그대로 돌려준다.
 */
export async function makeMockBook(examId, { first = 18, last = 45 } = {}) {
  if (!examId) return { error: "시험이 없어요." };
  const supabase = createClient();

  const { data: exam, error: exErr } = await supabase
    .from("exam_periods").select("id, name, grade").eq("id", examId).maybeSingle();
  if (exErr) return { error: exErr.message };
  if (!exam?.name) return { error: "시험을 못 찾았어요." };

  // 이미 만든 것이 있으면 그것을 쓴다 (이름이 곧 열쇠다)
  const { data: had } = await supabase
    .from("textbooks").select("id").eq("name", exam.name).maybeSingle();
  if (had?.id) return { error: null, bookId: had.id, made: 0, already: true };

  const book = {
    name: exam.name,
    area: "내신",
    target_grade: exam.grade || null,
  };
  let { data: made, error } = await supabase
    .from("textbooks").insert(book).select("id").single();
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data: made, error } = await supabase
      .from("textbooks").insert({ name: exam.name }).select("id").single());
  }
  if (error) return { error: error.message };

  const a = Math.max(1, Math.min(+first || 18, 100));
  const b = Math.max(a, Math.min(+last || 45, 100));
  const units = [];
  for (let i = a; i <= b; i += 1) {
    units.push({ textbook_id: made.id, name: `${i}번`, sort: i });
  }
  const { error: uErr } = await supabase.from("textbook_units").insert(units);
  if (uErr) return { error: uErr.message, bookId: made.id, made: 0 };

  revalidatePath("/prep");
  revalidatePath("/textbooks");
  return { error: null, bookId: made.id, made: units.length };
}
