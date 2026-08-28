"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toTeachers } from "@/lib/exams";
import { needSql } from "@/lib/sqlError";
import { requireStaff } from "@/lib/guard";

const SQL = "0052~0054 SQL 을 먼저 실행해주세요.";

/** 범위를 담을 때 고를 교재 목록 (정규 교재DB 그대로 쓴다) */
export async function listBooks() {
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prep_material_types")
    .select("id, parent_id, name, sort, active, need_make, need_print, need_card, need_hand, need_solve, need_grade, give_kind")
    .order("sort", { ascending: true });
  if (needSql(error)) return { rows: [], error: SQL };
  return { rows: data || [], error: error ? error.message : null };
}

export async function saveType(t = {}) {
  const name = (t.name || "").trim();
  if (!name) return { error: "이름을 넣어주세요." };
  const supabase = await createClient();

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
    // 종이냐 파일이냐 (0178) — 여기 정해두면 이 종류로 만든 자료가 물려받는다
    give_kind: t.give_kind === "file" ? "file" : "paper",
  };
  const q = t.id
    ? await supabase.from("prep_material_types").update(row).eq("id", t.id)
    : await supabase.from("prep_material_types").insert(row);
  if (needSql(q.error)) return { error: SQL };
  revalidatePath("/prep");
  return { error: q.error ? q.error.message : null };
}

/**
 * **자료 종류를 한 화면에서 한꺼번에 넣는다** (원장님 2026-08-23 —
 * 「내신자료종류 입력하는 게 한 개씩 하는 게 너무 번거로워. 한 번에 한
 * 화면에서 하게 해줘」).
 *
 * 적는 법 — 큰 갈래를 쓰고, 그 아래 자료를 들여쓰거나 `>` 로 잇는다:
 *
 *     이그잼
 *       변형문제
 *       분석지
 *     자이스토리 > 변형문제
 *
 * 이미 있는 이름은 **건드리지 않는다** — 여러 번 눌러도 늘어나지 않는다
 * (같은 이름이 두 벌 생기면 자료가 어느 쪽에 붙었는지 알 수 없게 된다).
 * 단계(만들기·인쇄·…)는 기본값으로 들어가고, 뒤에 줄마다 고치면 된다.
 */
export async function saveTypesBulk(text) {
  const lines = (text || "").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { error: "적은 것이 없어요." };
  const supabase = await createClient();

  const { data: have, error: readErr } = await supabase
    .from("prep_material_types")
    .select("id, parent_id, name");
  if (needSql(readErr)) return { error: SQL };
  if (readErr) return { error: readErr.message };

  // 이름으로 찾는다 — 큰 갈래는 부모 없는 것들 중에서
  const key = (parentId, name) => `${parentId || ""}|${name.trim()}`;
  const found = new Map((have || []).map((t) => [key(t.parent_id, t.name), t]));

  const BASE = {
    active: true, need_make: true, need_print: true,
    need_card: false, need_hand: true, need_solve: true, need_grade: true,
  };

  let addedTop = 0, addedKid = 0, skipped = 0;
  let curTop = null;   // 지금 열려 있는 큰 갈래

  async function ensure(name, parentId) {
    const k = key(parentId, name);
    if (found.has(k)) { skipped += 1; return found.get(k); }
    const { data, error } = await supabase
      .from("prep_material_types")
      .insert({ ...BASE, name: name.trim(), parent_id: parentId, sort: 0 })
      .select("id, parent_id, name")
      .maybeSingle();
    if (error) return null;
    found.set(k, data);
    if (parentId) addedKid += 1; else addedTop += 1;
    return data;
  }

  for (const raw of lines) {
    const indented = /^[\s\t　]+/.test(raw);
    const line = raw.trim();
    const parts = line.split(">").map((x) => x.trim()).filter(Boolean);

    if (parts.length >= 2) {
      // 「이그잼 > 변형문제」 — 한 줄에 둘 다
      const top = await ensure(parts[0], null);
      if (!top) return { error: `「${parts[0]}」 을 넣지 못했어요.` };
      curTop = top;
      const kid = await ensure(parts.slice(1).join(" ").trim(), top.id);
      if (!kid) return { error: `「${parts[1]}」 을 넣지 못했어요.` };
      continue;
    }

    if (indented && curTop) {
      const kid = await ensure(line, curTop.id);
      if (!kid) return { error: `「${line}」 을 넣지 못했어요.` };
    } else {
      const top = await ensure(line, null);
      if (!top) return { error: `「${line}」 을 넣지 못했어요.` };
      curTop = top;
    }
  }

  revalidatePath("/prep");
  return { error: null, addedTop, addedKid, skipped };
}


/**
 * **고른 것들의 단계를 한 번에 바꾼다** (원장님 2026-08-23 — 「이거 고치는
 * 방식이 너무 번거로워. 목록에서 선택해서 한 번에 일괄 변경 가능하게 해줘」).
 *
 * 자료 종류가 서른 개가 넘는데, 유료로 받아온 것은 「만들기」 를 다 꺼야 한다.
 * 하나씩 「고치기 → 체크 → 저장」 이면 서른 번이다.
 *
 * patch 에 담긴 칸만 바꾼다 — 안 담긴 칸은 그대로 둔다 (섞어 고를 수 있게).
 */
export async function setTypesFlags(ids, patch = {}) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (list.length === 0) return { error: "고른 것이 없어요." };
  const ALLOW = ["need_make", "need_print", "need_card", "need_hand", "need_solve", "need_grade", "active"];
  const row = {};
  for (const k of ALLOW) if (patch[k] !== undefined) row[k] = !!patch[k];
  // 종이·파일은 참거짓이 아니라 글자다 (0178)
  if (patch.give_kind !== undefined) row.give_kind = patch.give_kind === "file" ? "file" : "paper";
  if (Object.keys(row).length === 0) return { error: "바꿀 것을 골라주세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("prep_material_types").update(row).in("id", list);
  if (needSql(error)) return { error: SQL };
  revalidatePath("/prep");
  return { error: error ? error.message : null, count: list.length };
}

/** 고른 것들을 한 번에 지운다 (하위는 표가 알아서 딸려 지운다) */
export async function removeTypes(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (list.length === 0) return { error: "고른 것이 없어요." };
  const supabase = await createClient();
  const { error } = await supabase.from("prep_material_types").delete().in("id", list);
  if (needSql(error)) return { error: SQL };
  revalidatePath("/prep");
  return { error: error ? error.message : null, count: list.length };
}

export async function removeType(id) {
  if (!id) return { error: null };
  const supabase = await createClient();
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
  const supabase = await createClient();

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
  /**
   * **겹쳤다는 말을 사람 말로** (원장님 2026-08-24 — 「duplicate key value
   * violates unique constraint "exam_periods_uniq"」 가 그대로 떴다).
   * 무엇이 겹쳤는지, 어떻게 하면 되는지가 없으면 손쓸 데가 없다.
   */
  if (q.error?.code === "23505") {
    /**
     * **무엇이 막고 있는지 찾아서 말해준다.** 「이미 있어요」 라고만 하면
     * 원장님이 목록을 뒤져도 안 나올 수 있다 — 겹치는 잣대가 (학교·학년·
     * 시작일)이라, **이름이 달라도** 같은 날 시작하는 다른 시험이 있으면
     * 막히기 때문이다(0156 을 아직 안 돌렸을 때). 그래서 지어내지 말고
     * **진짜로 있는 줄**을 읽어다 보여준다.
     */
    /**
     * **0156 을 돌렸는지 먼저 확인한다.** 안 돌렸으면 잣대에 이름이 없어서
     * **이름이 달라도** 같은 날 시작하는 시험이 있으면 막힌다 — 그때는
     * 「이 이름이 이미 있다」 고 말하면 거짓말이 된다. 추측하지 말고 묻는다.
     */
    const { error: noPatch } = await supabase.rpc("exam_uniq_name_on");
    const { data: hit } = await supabase
      .from("exam_periods")
      .select("name, grade, from_date, english_on")
      .eq("school", school)
      .eq("from_date", row.from_date || day || "")
      .limit(3);
    if (noPatch) {
      return {
        error:
          "아직 0156 SQL 을 안 돌리셔서, **같은 학교에 같은 날 시작하는 시험**은 " +
          "이름이 달라도 하나만 들어갑니다.\n" +
          "설정 › 관리자 › SQL 확인에서 0156 을 실행하시면 바로 됩니다.\n" +
          "지금 당장 넣으시려면 영어 시험일을 넣어 다른 날로 두세요.",
      };
    }
    const 있는것 = (hit || [])
      .map((x) => `· ${x.name || "이름 없음"}${x.grade ? ` (${x.grade})` : ""}` +
                  `${x.from_date ? ` — ${x.from_date} 시작` : ""}`)
      .join("\n");
    return {
      error: 있는것
        ? `${school} 에 이미 있는 시험과 겹칩니다:\n${있는것}\n\n` +
          "그 시험을 골라 고치시거나, 시험 시작일(영어 시험일)을 넣어 다른 날로 두세요.\n" +
          "(지난 시험은 기본으로 숨겨져 있어요 — 「지난 시험 보기」 를 눌러 찾아보세요)"
        : `「${school} ${(e.grade || "").trim() || "전학년"} ${term}」 은 이미 있어요.\n` +
          "목록에서 그 시험을 골라 고쳐주세요. (지난 시험은 「지난 시험 보기」 로)",
    };
  }
  revalidatePath("/prep");
  revalidatePath("/schedule");
  return { error: q.error ? q.error.message : null };
}


/**
 * **시험을 학년별로 쪼갠다** (원장님 2026-08-23 — 「내신대비 범위를 학년별로
 * 구분해야 하는데 그게 없어. 날짜도 아주 드문 경우 달라」).
 *
 * 나이스에서 받아온 시험은 **학교 한 줄**로 들어온다(학년 칸이 빈다).
 * 그런데 범위는 학년마다 다르고, 드물게 영어 시험일도 다르다. 한 줄에
 * 범위를 다 담으면 중2 범위가 중3 아이 자료에 섞인다.
 *
 * 쪼갠 뒤에는 학년마다 **따로** 범위를 담고 날짜를 고칠 수 있다.
 * 원본은 **첫 학년으로 바뀐다** — 이미 담아둔 범위·자료가 딸려 있으므로
 * 새로 만들어 옮기지 않는다 (배정 기록까지 따라 움직이면 위험하다).
 */
export async function splitExamByGrade(examId, grades = []) {
  const list = [...new Set((grades || []).map((g) => (g || "").trim()).filter(Boolean))];
  if (!examId || list.length === 0) return { error: "나눌 학년이 없어요." };
  const supabase = await createClient();

  const { data: ex, error: readErr } = await supabase
    .from("exam_periods")
    .select("*")
    .eq("id", examId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!ex) return { error: "그 시험을 찾지 못했어요." };
  if ((ex.grade || "").trim()) {
    return { error: `이미 「${ex.grade}」 시험이에요. 나눌 것이 없어요.` };
  }

  const [first, ...rest] = list;

  // 원본을 첫 학년으로 (담아둔 범위·자료가 그대로 따라온다)
  const up = await supabase.from("exam_periods").update({ grade: first }).eq("id", examId);
  if (up.error) return { error: up.error.message };

  // 나머지 학년은 같은 날짜로 새 줄 (날짜가 다르면 뒤에 각자 고친다)
  if (rest.length) {
    const { id: _id, created_at: _c, created_by: _b, ...base } = ex;
    const rows = rest.map((g) => ({ ...base, grade: g }));
    const ins = await supabase.from("exam_periods").insert(rows);
    if (ins.error) return { error: ins.error.message };
  }

  revalidatePath("/prep");
  revalidatePath("/schedule");
  return { error: null, made: rest.length, first };
}

export async function removeExam(id) {
  if (!id) return { error: null };
  const supabase = await createClient();
  // 시험을 지우면 범위·자료도 같이 간다. 학사일정에서도 사라진다 — 같은 시험이다.
  const { error } = await supabase.from("exam_periods").delete().eq("id", id);
  revalidatePath("/prep");
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}

/**
 * **골라서 한 번에 지운다** (원장님 2026-08-24 — 「잘못 입력할 때 지우게
 * 선택 삭제 기능 넣어줘」). 하나씩 지우면서 매번 확인창을 받으면, 시험
 * 대여섯 개를 정리하는 데 열두 번을 누른다.
 * 범위·자료·배정이 같이 간다 — 부르는 쪽에서 몇 개인지 보여주고 묻는다.
 */
export async function removeExams(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null, count: 0 };
  const supabase = await createClient();
  const { error } = await supabase.from("exam_periods").delete().in("id", ids);
  revalidatePath("/prep");
  revalidatePath("/schedule");
  return { error: error ? error.message : null, count: ids.length };
}

// ── 범위 ───────────────────────────────────────────────
export async function saveScope(s = {}) {
  if (!s.exam_id) return { error: "시험이 없어요." };
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { error } = await supabase.from("prep_scopes").delete().eq("id", id);
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

// ── 자료 ───────────────────────────────────────────────
export async function addMaterial(scopeId, typeId, name) {
  if (!scopeId) return { error: "범위가 없어요." };
  const supabase = await createClient();

  // 종류에 정해둔 단계를 그대로 가져온다 — 매번 체크할 일이 없게
  // give_kind 도 같은 길에 태운다 (0178) — 종이인지 파일인지도 종류가 정한다
  let base = { need_make: true, need_print: true, need_card: false, need_hand: true, need_solve: true, need_grade: true, give_kind: "paper" };
  let sort = 0;
  if (typeId) {
    const { data: t } = await supabase
      .from("prep_material_types")
      .select("sort, need_make, need_print, need_card, need_hand, need_solve, need_grade, give_kind")
      .eq("id", typeId)
      .maybeSingle();
    if (t) {
      base = {
        need_make: t.need_make, need_print: t.need_print, need_card: t.need_card,
        need_hand: t.need_hand, need_solve: t.need_solve, need_grade: t.need_grade,
        give_kind: t.give_kind === "file" ? "file" : "paper",
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
  const supabase = await createClient();
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
  if ("give_kind" in patch) row.give_kind = patch.give_kind === "file" ? "file" : "paper";

  const { error } = await supabase.from("prep_materials").update(row).eq("id", id);
  if (needSql(error)) return { error: SQL };
  revalidatePath("/prep");
  revalidatePath("/tasks");
  return { error: error ? error.message : null };
}

export async function removeMaterial(id) {
  if (!id) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.from("prep_materials").delete().eq("id", id);
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

/** 단계 하나를 '했음' 으로 (다시 누르면 취소) */
export async function markStage(materialId, stage, on = true) {
  const COL = { make: "made_at", print: "printed_at", card: "card_at" };
  const col = COL[stage];
  if (!materialId || !col) return { error: "알 수 없는 단계예요." };
  const supabase = await createClient();
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
  const supabase = await createClient();

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
  if (drop.length) {
    /**
     * **수령 기록도 같이 지운다 (0178).** 안 지우면 배정을 껐다 켠 아이가
     * 누른 적도 없는데 「받음」으로 뜬다 — 배정을 끊는 순간 그 자료를 받았다는
     * 사실도 없던 일이 되어야 앞뒤가 맞는다.
     * (자료를 통째로 지우는 쪽은 on delete cascade 가 이미 맡는다)
     */
    const gone = [...was.entries()].filter(([sid]) => !now.has(sid)).map(([sid]) => sid);
    await supabase.from("prep_assignments").delete().in("id", drop);
    await supabase
      .from("prep_receipts")
      .delete()
      .eq("material_id", materialId)
      .in("student_id", gone);
  }

  revalidatePath("/prep");
  return { error: null };
}

/**
 * **수령을 원장이 대신 찍는다** (0178).
 *
 * 원래는 아이가 자기 화면에서 누르는 것이다. 그런데 종이 자료는 학원
 * 와이파이일 때만 눌리고, LTE 만 쓰는 아이·폰을 안 가져온 아이·아직 계정이
 * 없는 재원생은 영영 못 누른다. 그러면 원장님 화면의 「안 받음」이 **끌 수
 * 없는 숫자**가 된다 — 그 화면에서 지금 할 수 있는 일만 재촉한다는 규칙에
 * 어긋난다. 등원 체크를 선생님이 대신 찍는 것(setArrivalFor)과 같은 결이다.
 *
 * 누가 눌렀는지는 by_staff 로 남긴다 — 화면에는 안 그리지만, 칸을 안 두면
 * 「아이가 눌렀다」와 「원장이 대신 찍었다」가 한 칸에 뭉개져 되돌릴 수 없다.
 */
export async function markReceiptFor(materialId, studentId, on = true) {
  if (!materialId || !studentId) return { error: "값이 부족해요." };
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const { error } = await supabase.from("prep_receipts").upsert(
    {
      material_id: materialId,
      student_id: studentId,
      received_at: on ? new Date().toISOString() : null,
      by_staff: true,
    },
    { onConflict: "material_id,student_id" }
  );
  if (needSql(error)) return { error: "0178 SQL 을 먼저 실행해주세요." };
  revalidatePath("/prep");
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: error ? error.message : null };
}

/** 학생 한 명의 단계 (배부 · 풀이 · 채점) */
export async function markAssign(assignId, stage, on = true, extra = {}) {
  const COL = { hand: "handed_at", solve: "solved_at", grade: "graded_at" };
  const col = COL[stage];
  if (!assignId || !col) return { error: "알 수 없는 단계예요." };
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { error } = await supabase.from("prep_materials").delete().in("id", ids);
  revalidatePath("/prep");
  return { error: error ? error.message : null };
}

export async function removeScopes(scopeIds) {
  const ids = (scopeIds || []).filter(Boolean);
  if (ids.length === 0) return { error: null };
  const supabase = await createClient();
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
  const supabase = await createClient();

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
