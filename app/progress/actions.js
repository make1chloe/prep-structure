"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unitOptions } from "@/lib/unitTree";
import { todaySeoul } from "@/lib/day";

function ok(error) {
  return { error: error ? error.message : null };
}

// ---------- 교재 배정 ----------

// 교재는 **학생별**이다 — 반별 교재라는 개념은 쓰지 않는다.
// (같은 반이어도 학생마다 다른 교재를 쓴다. 반으로 묶으면 한 명만 바꿀 수가 없다)

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

// 학생 차원의 교재 상태 — active(사용중) | done(완료) | dropped(중단)
// 완료·중단이면 숙제 배정·진도 화면에서 빠지고, 재원생 기록에만 남는다.
export async function setStudentBookStatus(studentId, textbookId, status, endedOn) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const supabase = createClient();
  const today = todaySeoul();
  const { error } = await supabase.from("student_textbooks").upsert(
    {
      student_id: studentId,
      textbook_id: textbookId,
      status: status || "active",
      ended_on: status === "active" ? null : endedOn || today,
    },
    { onConflict: "student_id,textbook_id" }
  );
  revalidatePath("/today");
  revalidatePath("/students");
  return ok(error);
}

// ---------- 단원 진도 ----------

// 한 학생의 교재 하나에 대한 단원 목록 + 완료 여부
// round 를 주지 않으면 **지금 회독**의 진도를 본다. 지난 회독 기록은 그대로 남아 있다.
export async function listStudentUnits(studentId, textbookId, round) {
  if (!studentId || !textbookId) return { units: [], error: null };
  const supabase = createClient();
  const r = round || (await currentRound(supabase, studentId, textbookId));

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
  const prog = ids.length ? await readProgress(supabase, studentId, ids, r) : [];
  const byUnit = new Map((prog || []).map((p) => [p.textbook_unit_id, p]));

  // 자식이 없는 단원(소단원)만 체크 대상으로 본다
  const hasChild = new Set((units || []).map((u) => u.parent_id).filter(Boolean));
  const options = unitOptions(units || []).map((o) => ({
    ...o,
    leaf: !hasChild.has(o.id),
    status: byUnit.get(o.id)?.status || "",
    doneOn: byUnit.get(o.id)?.done_on || null,
  }));
  return { units: options, round: r, error: null };
}

// 순서와 상관없이 아무 단원이나 완료/미완료로 바꾼다
export async function setUnitProgress(studentId, unitIds, status) {
  const ids = Array.isArray(unitIds) ? unitIds : [unitIds];
  if (!studentId || ids.length === 0) return { error: null };
  const supabase = createClient();

  // 이 단원들이 속한 교재의 **지금 회독**에 기록한다.
  // 체크를 지워도 지난 회독 기록은 건드리지 않는다.
  const { data: us } = await supabase
    .from("textbook_units")
    .select("id, textbook_id")
    .in("id", ids);
  const bookOfUnit = new Map((us || []).map((u) => [u.id, u.textbook_id]));
  const roundCache = new Map();
  async function roundFor(unitId) {
    const tid = bookOfUnit.get(unitId);
    if (!tid) return 1;
    if (!roundCache.has(tid)) roundCache.set(tid, await currentRound(supabase, studentId, tid));
    return roundCache.get(tid);
  }

  if (!status) {
    // 완료 취소 = 이번 회독 기록만 지운다 (기록이 없으면 = 아직 안 함)
    let error = null;
    for (const id of ids) {
      const q = supabase
        .from("student_unit_progress")
        .delete()
        .eq("student_id", studentId)
        .eq("textbook_unit_id", id);
      const res = await withRound(q, await roundFor(id));
      if (res.error) error = res.error;
    }
    revalidatePath("/today");
    return ok(error);
  }

  const today = todaySeoul();
  const rows = [];
  for (const textbook_unit_id of ids) {
    rows.push({
      student_id: studentId,
      textbook_unit_id,
      round: await roundFor(textbook_unit_id),
      status,
      done_on: status === "done" ? today : null,
    });
  }

  let { error } = await supabase
    .from("student_unit_progress")
    .upsert(rows, { onConflict: "student_id,textbook_unit_id,round" });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0026 전 — round 컬럼이 아직 없다
    ({ error } = await supabase.from("student_unit_progress").upsert(
      rows.map(({ round, ...r }) => r),
      { onConflict: "student_id,textbook_unit_id" }
    ));
  }
  revalidatePath("/today");
  return ok(error);
}

// ============================================================
// 단어시험 방식 (학생 · 교재 · 회독마다)
// ============================================================

/** 한 회독의 배분을 저장한다. 합이 100이 아니면 막는다 */
export async function saveWordTest(studentId, textbookId, round, cfg) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const n = (v) => Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  const row = {
    student_id: studentId,
    textbook_id: textbookId,
    round: Math.max(1, parseInt(round, 10) || 1),
    mc_meaning: n(cfg?.mc_meaning),
    sa_meaning: n(cfg?.sa_meaning),
    mc_word: n(cfg?.mc_word),
    sa_word: n(cfg?.sa_word),
    first_hint: !!cfg?.first_hint,
    note: (cfg?.note || "").trim() || null,
  };
  const sum = row.mc_meaning + row.sa_meaning + row.mc_word + row.sa_word;
  if (sum !== 100) return { error: `합이 100%가 되어야 해요. 지금 ${sum}%입니다.` };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("word_test_settings")
    .upsert({ ...row, created_by: user?.id || null }, {
      onConflict: "student_id,textbook_id,round",
    });
  if (error) {
    if (error.code === "42P01") return { error: "0025 SQL 을 먼저 실행해주세요." };
    return { error: error.message };
  }

  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

/**
 * 한 회독을 끝내고 **한 번 더 돌린다.**
 * 회독을 올리고, 새 회독의 시험 방식을 다시 정하게 한다.
 *
 * 지난 회독의 진도는 **지우지 않는다.** 회독을 붙여서 쌓는다.
 * 새 회독은 빈 상태로 시작하고, 1회독을 언제 어디까지 했는지는
 * 학생 기록(교재 사용 기록)에 회독별로 남는다.
 */
export async function nextRound(studentId, textbookId) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const supabase = createClient();

  const { data: cur } = await supabase
    .from("student_textbooks")
    .select("round")
    .eq("student_id", studentId)
    .eq("textbook_id", textbookId)
    .maybeSingle();
  const next = (cur?.round || 1) + 1;

  const { error } = await supabase
    .from("student_textbooks")
    .update({ round: next })
    .eq("student_id", studentId)
    .eq("textbook_id", textbookId);
  if (error) {
    if (error.code === "42703") return { error: "0025 SQL 을 먼저 실행해주세요." };
    return { error: error.message };
  }

  revalidatePath("/today");
  revalidatePath("/students");
  return { error: null, round: next };
}

/** 지금 몇 회독째인가 (컬럼이 아직 없으면 1회독) */
async function currentRound(supabase, studentId, textbookId) {
  const { data, error } = await supabase
    .from("student_textbooks")
    .select("round")
    .eq("student_id", studentId)
    .eq("textbook_id", textbookId)
    .maybeSingle();
  if (error) return 1;
  return data?.round || 1;
}

/** round 컬럼이 아직 없는 DB 에서도 죽지 않게 */
async function withRound(query, round) {
  const res = await query.eq("round", round);
  if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
    return { error: null };
  }
  return res;
}

/** 이번 회독의 진도만 읽는다 (0026 전이면 전부 읽는다) */
async function readProgress(supabase, studentId, unitIds, round) {
  const base = () =>
    supabase
      .from("student_unit_progress")
      .select("textbook_unit_id, status, done_on")
      .eq("student_id", studentId)
      .in("textbook_unit_id", unitIds);
  const res = await base().eq("round", round);
  if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
    const fb = await base();
    return fb.data || [];
  }
  return res.data || [];
}
