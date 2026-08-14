"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unitOptions } from "@/lib/unitTree";
import { todaySeoul } from "@/lib/day";
import { planAssign } from "@/lib/bookAssign";
import { sessionUser } from "@/lib/session";

function ok(error) {
  return { error: error ? error.message : null };
}

// ---------- 교재 배정 ----------

// 교재는 **학생별**이다 — 반별 교재라는 개념은 쓰지 않는다.
// (같은 반이어도 학생마다 다른 교재를 쓴다. 반으로 묶으면 한 명만 바꿀 수가 없다)

/**
 * 이 학생이 지금 쓰는 교재를 **통째로** 정해준다 (재원생 · 오늘 수업의 교재 배정).
 *
 * 뺀 교재는 **지우지 않는다.** 지금까지 어디까지 나갔는지가 같이 사라지기
 * 때문이다. '중단' 으로 돌려서 배정·진도 화면에서만 빠지게 하고,
 * 학생 기록(교재 사용 기록)에는 그대로 남긴다. 다시 넣으면 이어서 간다.
 */
export async function setStudentTextbooks(studentId, bookIds) {
  if (!studentId) return { error: "학생을 찾지 못했어요." };
  const want = [...new Set((bookIds || []).filter(Boolean))];
  const supabase = createClient();
  const today = todaySeoul();

  const { data: have, error: readErr } = await supabase
    .from("student_textbooks")
    .select("textbook_id, status")
    .eq("student_id", studentId);
  if (readErr) return { error: readErr.message };

  // 넣고 뺄 것을 가리는 규칙은 lib/bookAssign 한 곳에 있다 —
  // 교재 쪽에서 고칠 때(setTextbookStudents)도 같은 규칙을 쓴다
  const { add, drop } = planAssign(
    (have || []).map((r) => ({ id: r.textbook_id, status: r.status })),
    want
  );

  // 넣을 것 — 처음이면 새로, 중단했던 것이면 다시 사용중으로
  if (add.length) {
    const rows = add.map(({ id, known }) =>
      known
        ? { student_id: studentId, textbook_id: id, status: "active", ended_on: null }
        : { student_id: studentId, textbook_id: id, status: "active", assigned_on: today, ended_on: null }
    );
    let { error } = await supabase
      .from("student_textbooks")
      .upsert(rows, { onConflict: "student_id,textbook_id" });
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // ended_on 이 아직 없는 DB
      ({ error } = await supabase
        .from("student_textbooks")
        .upsert(rows.map(({ ended_on: _e, ...r }) => r), { onConflict: "student_id,textbook_id" }));
    }
    if (error) return { error: error.message };
  }

  // 뺄 것 — 지우지 않고 중단으로
  if (drop.length) {
    let { error } = await supabase
      .from("student_textbooks")
      .update({ status: "dropped", ended_on: today })
      .eq("student_id", studentId)
      .in("textbook_id", drop);
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      ({ error } = await supabase
        .from("student_textbooks")
        .update({ status: "dropped" })
        .eq("student_id", studentId)
        .in("textbook_id", drop));
    }
    if (error) return { error: error.message };
  }

  revalidatePath("/students");
  revalidatePath("/today");
  revalidatePath("/plan");
  revalidatePath("/textbooks");
  return { error: null, added: add.length, dropped: drop.length };
}

/**
 * **거꾸로** — 이 교재를 쓰는 학생을 통째로 정해준다 (교재 · 단원 화면).
 *
 * 교재를 새로 들일 때는 「이 책 쓸 아이들」이 먼저 떠오르지, 아이를 하나씩
 * 열어 교재를 붙이지 않는다. 그렇게 하면 열다섯 명이면 열다섯 번을 오간다.
 *
 * 넣고 빼는 규칙은 위와 **똑같다** (`lib/bookAssign`) — 뺀 학생은 지워지지
 * 않고 '중단' 으로 남아 진도가 보존된다. 어느 쪽 화면에서 고치든 결과가
 * 같아야 한다.
 */
export async function setTextbookStudents(textbookId, studentIds) {
  if (!textbookId) return { error: "교재를 찾지 못했어요." };
  const want = [...new Set((studentIds || []).filter(Boolean))];
  const supabase = createClient();
  const today = todaySeoul();

  const { data: have, error: readErr } = await supabase
    .from("student_textbooks")
    .select("student_id, status")
    .eq("textbook_id", textbookId);
  if (readErr) return { error: readErr.message };

  const { add, drop } = planAssign(
    (have || []).map((r) => ({ id: r.student_id, status: r.status })),
    want
  );

  if (add.length) {
    const rows = add.map(({ id, known }) =>
      known
        ? { student_id: id, textbook_id: textbookId, status: "active", ended_on: null }
        : { student_id: id, textbook_id: textbookId, status: "active", assigned_on: today, ended_on: null }
    );
    let { error } = await supabase
      .from("student_textbooks")
      .upsert(rows, { onConflict: "student_id,textbook_id" });
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // ended_on 이 아직 없는 DB
      ({ error } = await supabase
        .from("student_textbooks")
        .upsert(rows.map(({ ended_on: _e, ...r }) => r), { onConflict: "student_id,textbook_id" }));
    }
    if (error) return { error: error.message };
  }

  if (drop.length) {
    let { error } = await supabase
      .from("student_textbooks")
      .update({ status: "dropped", ended_on: today })
      .eq("textbook_id", textbookId)
      .in("student_id", drop);
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      ({ error } = await supabase
        .from("student_textbooks")
        .update({ status: "dropped" })
        .eq("textbook_id", textbookId)
        .in("student_id", drop));
    }
    if (error) return { error: error.message };
  }

  revalidatePath("/textbooks");
  revalidatePath("/students");
  revalidatePath("/today");
  revalidatePath("/plan");
  return { error: null, added: add.length, dropped: drop.length };
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

  // 분량·내용(0100)까지. 없는 DB 는 아래로 한 칸씩 내려가며 다시 본다
  const base = "id, textbook_id, parent_id, label, name, page_start, page_end, sort";
  const LADDER = [
    `${base}, total_pages, question_count, question_range, word_count, summary, minutes`,
    `${base}, total_pages`,
    base,
  ];
  let units = null;
  let error = null;
  for (const cols of LADDER) {
    ({ data: units, error } = await supabase
      .from("textbook_units")
      .select(cols)
      .eq("textbook_id", textbookId)
      .order("sort", { ascending: true }));
    if (!error) break;
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
    note: byUnit.get(o.id)?.note || "",
  }));
  return { units: options, round: r, error: null };
}

/**
 * **한 교재의 학생 전부** — 누가 어디까지 갔나 (교재 화면의 「진도」 탭).
 *
 * 원장님 (2026-08-14): 「이 교재 다들 어디까지 갔지」 를 보려면 재원생에서
 * 아이를 하나씩 열어야 했다. 열다섯이면 열다섯 번이다.
 *
 * 읽기만 한다 — **고치는 곳은 학생 쪽 진도 판 하나다** (BookProgress).
 * 여기서도 고치게 만들면 같은 일을 하는 자리가 두 벌이 된다.
 */
export async function listBookProgress(textbookId) {
  if (!textbookId) return { rows: [], error: null };
  const supabase = createClient();

  // 파도 — 배정과 단원은 서로 필요한 게 없다 (원칙 6-1: 직렬 4층이었다)
  let [{ data: st, error }, { data: units }] = await Promise.all([
    supabase
      .from("student_textbooks")
      .select("student_id, status, round, current_page")
      .eq("textbook_id", textbookId),
    supabase
      .from("textbook_units")
      .select("id, parent_id")
      .eq("textbook_id", textbookId),
  ]);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data: st, error } = await supabase
      .from("student_textbooks")
      .select("student_id, status")
      .eq("textbook_id", textbookId));
  }
  if (error) return { rows: [], error: error.message };
  const active = (st || []).filter((r) => !r.status || r.status === "active");
  if (active.length === 0) return { rows: [], error: null };
  const hasChild = new Set((units || []).map((u) => u.parent_id).filter(Boolean));
  const leaves = (units || []).filter((u) => !hasChild.has(u.id)).map((u) => u.id);

  const { data: students } = await supabase
    .from("students")
    .select("id, name, grade, status")
    .in("id", active.map((r) => r.student_id));
  const nameOf = new Map((students || []).map((s) => [s.id, s]));

  /**
   * 학생별 완료 수 — **그 학생의 지금 회독** 것만 센다.
   * 회독을 안 가르면 2회독째인 아이가 1회독 기록 덕에 다 한 것처럼 보인다.
   *
   * **학생마다 따로 묻지 않는다** (원칙 6-1). 처음에는 학생 수만큼 직렬로
   * 물었다 — 열다섯 명이면 열다섯 왕복. 전부 한 번에 받아서 여기서 가른다.
   */
  const enrolled = active.filter((r) => {
    const s = nameOf.get(r.student_id);
    return s && s.status === "enrolled";   // 퇴원생 진도는 여기 볼 일이 없다
  });
  let allProg = [];
  if (leaves.length && enrolled.length) {
    let q = await supabase
      .from("student_unit_progress")
      .select("student_id, textbook_unit_id, status, done_on, round")
      .in("student_id", enrolled.map((r) => r.student_id))
      .in("textbook_unit_id", leaves);
    if (q.error && (q.error.code === "42703" || q.error.code === "PGRST204")) {
      // 0025 전이면 round 없이 — 전부 1회독으로 본다
      q = await supabase
        .from("student_unit_progress")
        .select("student_id, textbook_unit_id, status, done_on")
        .in("student_id", enrolled.map((r) => r.student_id))
        .in("textbook_unit_id", leaves);
      allProg = (q.data || []).map((p) => ({ ...p, round: 1 }));
    } else {
      allProg = q.data || [];
    }
  }
  const rows = enrolled.map((r) => {
    const s = nameOf.get(r.student_id);
    const round = r.round || 1;
    const prog = allProg.filter((p) => p.student_id === r.student_id && (p.round || 1) === round);
    return {
      studentId: r.student_id,
      name: s.name,
      grade: s.grade || "",
      round,
      curPage: r.current_page ?? null,
      done: prog.filter((p) => p.status === "done").length,
      doing: prog.filter((p) => p.status === "doing").length,
      total: leaves.length,
      // 마지막으로 찍은 날 — 오래 멈춘 아이가 보인다
      lastOn: prog.map((p) => p.done_on).filter(Boolean).sort().pop() || null,
    };
  });
  // 진도 낮은 순 — 챙길 아이가 위로
  rows.sort((a, b) => (a.total ? a.done / a.total : 0) - (b.total ? b.done / b.total : 0) || a.name.localeCompare(b.name, "ko"));
  return { rows, total: leaves.length, error: null };
}

/**
 * **단원 하나에 메모** — 「이 단원 어려워함」 「17번만 다시」.
 *
 * 표(student_unit_progress.note)는 0010 부터 있었는데 적을 데가 없었다.
 * 수업 기록의 진도 메모(own_progress)와 다르다 — 그건 그날 수업 이야기고,
 * 이건 **그 단원**에 붙어서 회독이 넘어가도 따라온다.
 */
export async function setUnitNote(studentId, unitId, note) {
  if (!studentId || !unitId) return { error: "값이 부족해요." };
  const supabase = createClient();
  const { data: u } = await supabase
    .from("textbook_units")
    .select("textbook_id")
    .eq("id", unitId)
    .maybeSingle();
  const round = u ? await currentRound(supabase, studentId, u.textbook_id) : 1;
  const clean = (note || "").trim() || null;

  /**
   * **upsert 를 안 쓴다.** upsert 는 status 까지 같이 보내야 하는데,
   * 그러면 메모를 고칠 때마다 완료 표시를 덮어쓰게 된다.
   * 줄이 있으면 note 만 고치고, 없으면 status 없이 새로 넣는다
   * (0119 가 status 의 not null 을 풀었다 — 그 전 DB 면 안내한다).
   */
  const { data: hit, error: upErr } = await supabase
    .from("student_unit_progress")
    .update({ note: clean })
    .eq("student_id", studentId)
    .eq("textbook_unit_id", unitId)
    .eq("round", round)
    .select("textbook_unit_id");
  if (upErr && (upErr.code === "42703" || upErr.code === "PGRST204")) {
    // round 가 아직 없는 DB (0025 전) — 회독 없이 고친다
    const { data: hit2, error: e2 } = await supabase
      .from("student_unit_progress")
      .update({ note: clean })
      .eq("student_id", studentId)
      .eq("textbook_unit_id", unitId)
      .select("textbook_unit_id");
    if (e2) return ok(e2);
    if ((hit2 || []).length === 0 && clean) {
      const { error: e3 } = await supabase
        .from("student_unit_progress")
        .insert({ student_id: studentId, textbook_unit_id: unitId, note: clean, status: null });
      if (e3?.code === "23502") return { error: "0119 SQL 을 먼저 실행해주세요." };
      return ok(e3);
    }
    revalidatePath("/today");
    revalidatePath("/students");
    return { error: null };
  }
  if (upErr) return ok(upErr);

  if ((hit || []).length === 0 && clean) {
    // 아직 아무 기록이 없는 단원 — 메모만 있는 줄을 만든다 (status 는 비워둔다)
    const { error: insErr } = await supabase
      .from("student_unit_progress")
      .insert({ student_id: studentId, textbook_unit_id: unitId, round, note: clean, status: null });
    if (insErr?.code === "23502") return { error: "0119 SQL 을 먼저 실행해주세요." };
    if (insErr) return ok(insErr);
  }
  revalidatePath("/today");
  revalidatePath("/students");
  return { error: null };
}

/**
 * 한 학생의 **여러 교재**를 한 왕복에 (원장님, 2026-08-14 — 「재원생
 * 페이지에서 저장할 때도 효율적으로」).
 *
 * 재원생·진도 화면에서 학생을 열면 교재 판마다 따로 서버에 다녀왔다 —
 * 교재 네 권이면 네 왕복. 단원·진도를 통째로 받아 여기서 교재별로 가른다.
 * 모양은 listStudentUnits 와 같다 (판이 같은 것을 받아야 하니까).
 */
export async function listStudentUnitsMany(studentId, textbookIds = []) {
  const ids = [...new Set((textbookIds || []).filter(Boolean))];
  if (!studentId || ids.length === 0) return { byBook: {}, error: null };
  const supabase = createClient();

  const base = "id, textbook_id, parent_id, label, name, page_start, page_end, sort";
  const LADDER = [
    `${base}, total_pages, question_count, question_range, word_count, summary, minutes`,
    `${base}, total_pages`,
    base,
  ];
  let units = null;
  let error = null;
  for (const cols of LADDER) {
    ({ data: units, error } = await supabase
      .from("textbook_units")
      .select(cols)
      .in("textbook_id", ids)
      .order("sort", { ascending: true }));
    if (!error) break;
  }
  if (error) return { byBook: {}, error: error.message };

  // 회독은 교재마다 다르다
  let rounds = new Map();
  {
    const { data: st } = await supabase
      .from("student_textbooks")
      .select("textbook_id, round")
      .eq("student_id", studentId)
      .in("textbook_id", ids);
    (st || []).forEach((r) => rounds.set(r.textbook_id, r.round || 1));
  }

  const unitIds = (units || []).map((u) => u.id);
  let prog = [];
  if (unitIds.length) {
    let q = await supabase
      .from("student_unit_progress")
      .select("textbook_unit_id, status, done_on, note, round")
      .eq("student_id", studentId)
      .in("textbook_unit_id", unitIds);
    if (q.error && (q.error.code === "42703" || q.error.code === "PGRST204")) {
      q = await supabase
        .from("student_unit_progress")
        .select("textbook_unit_id, status, done_on, note")
        .eq("student_id", studentId)
        .in("textbook_unit_id", unitIds);
      prog = (q.data || []).map((p) => ({ ...p, round: 1 }));
    } else {
      prog = q.data || [];
    }
  }

  const byBook = {};
  for (const tid of ids) {
    const mine = (units || []).filter((u) => u.textbook_id === tid);
    const round = rounds.get(tid) || 1;
    const byUnit = new Map(
      prog
        .filter((p) => (p.round || 1) === round)
        .map((p) => [p.textbook_unit_id, p])
    );
    const hasChild = new Set(mine.map((u) => u.parent_id).filter(Boolean));
    byBook[tid] = {
      round,
      units: unitOptions(mine).map((o) => ({
        ...o,
        leaf: !hasChild.has(o.id),
        status: byUnit.get(o.id)?.status || "",
        doneOn: byUnit.get(o.id)?.done_on || null,
        note: byUnit.get(o.id)?.note || "",
      })),
    };
  }
  return { byBook, error: null };
}

/**
 * 진도 엑셀 올리기 (원장님, 2026-08-14). **적힌 단원만 바꾼다** —
 * 안 적은 단원은 안 건드린다. 학생·교재·단원은 이름으로 잇고, 못 찾은
 * 이름은 알려준다. 기록은 그 학생의 **지금 회독**에 들어간다.
 */
export async function bulkSetProgress(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return { error: "올릴 줄이 없어요." };
  const supabase = createClient();

  const [{ data: students }, { data: books }] = await Promise.all([
    supabase.from("students").select("id, name").eq("status", "enrolled"),
    supabase.from("textbooks").select("id, name"),
  ]);
  const stByName = new Map();
  (students || []).forEach((x) => {
    const k = x.name.trim();
    stByName.set(k, stByName.has(k) ? "DUP" : x.id);
  });
  const bkByName = new Map((books || []).map((b) => [b.name.trim(), b.id]));

  const missing = [];
  let marked = 0;
  let pages = 0;
  const today = todaySeoul();

  for (const r of rows) {
    const sid = stByName.get(r.student);
    if (!sid) { missing.push(`학생 「${r.student}」`); continue; }
    if (sid === "DUP") { missing.push(`학생 「${r.student}」 — 같은 이름이 둘이라 못 정함`); continue; }
    const bid = bkByName.get(r.book);
    if (!bid) { missing.push(`교재 「${r.book}」`); continue; }

    const round = await currentRound(supabase, sid, bid);
    const { data: units } = await supabase
      .from("textbook_units")
      .select("id, name, parent_id")
      .eq("textbook_id", bid);
    const parents = new Set((units || []).map((u) => u.parent_id).filter(Boolean));
    const leafByName = new Map();
    (units || []).forEach((u) => {
      if (parents.has(u.id)) return;
      const k = u.name.trim();
      leafByName.set(k, leafByName.has(k) ? "DUP" : u.id);
    });
    const resolve = (names) =>
      names
        .map((n) => {
          const id = leafByName.get(n);
          if (!id) { missing.push(`${r.book} 단원 「${n}」`); return null; }
          if (id === "DUP") { missing.push(`${r.book} 단원 「${n}」 — 같은 이름이 둘`); return null; }
          return id;
        })
        .filter(Boolean);

    const upserts = [
      ...resolve(r.done).map((id) => ({
        student_id: sid, textbook_unit_id: id, round, status: "done", done_on: today,
      })),
      ...resolve(r.doing).map((id) => ({
        student_id: sid, textbook_unit_id: id, round, status: "doing", done_on: null,
      })),
    ];
    if (upserts.length) {
      let { error } = await supabase
        .from("student_unit_progress")
        .upsert(upserts, { onConflict: "student_id,textbook_unit_id,round" });
      if (error && (error.code === "42703" || error.code === "PGRST204")) {
        ({ error } = await supabase.from("student_unit_progress").upsert(
          upserts.map(({ round: _r, ...x }) => x),
          { onConflict: "student_id,textbook_unit_id" }
        ));
      }
      if (error) return { error: `${r.student} · ${r.book}: ${error.message}` };
      marked += upserts.length;
    }
    if (r.page !== null && r.page !== undefined) {
      await supabase.from("student_textbooks").upsert(
        { student_id: sid, textbook_id: bid, current_page: r.page },
        { onConflict: "student_id,textbook_id" }
      );
      pages += 1;
    }
  }
  revalidatePath("/today");
  revalidatePath("/students");
  return { error: null, marked, pages, missing: [...new Set(missing)] };
}

/** 지금 진도 내려받기 — 고쳐서 다시 올리는 왕복 (양식과 같은 칸) */
export async function exportProgress() {
  const supabase = createClient();
  const [{ data: students }, { data: books }, { data: st }, { data: units }, progQ] =
    await Promise.all([
      supabase.from("students").select("id, name, status").eq("status", "enrolled").order("name"),
      supabase.from("textbooks").select("id, name"),
      supabase.from("student_textbooks").select("student_id, textbook_id, status, round, current_page"),
      supabase.from("textbook_units").select("id, name, textbook_id, parent_id, sort").order("sort"),
      supabase.from("student_unit_progress").select("student_id, textbook_unit_id, status, round"),
    ]);
  if (progQ.error && !(progQ.error.code === "42703" || progQ.error.code === "PGRST204")) {
    return { error: progQ.error.message, rows: [] };
  }
  const prog = (progQ.data || []).map((p) => ({ ...p, round: p.round || 1 }));
  const bookName = new Map((books || []).map((b) => [b.id, b.name]));
  const unitById = new Map((units || []).map((u) => [u.id, u]));
  const parents = new Set((units || []).map((u) => u.parent_id).filter(Boolean));

  const rows = [];
  for (const s2 of students || []) {
    const mine = (st || []).filter(
      (r) => r.student_id === s2.id && (!r.status || r.status === "active")
    );
    let first = true;
    for (const r of mine) {
      const round = r.round || 1;
      const my = prog.filter((p) => {
        const u = unitById.get(p.textbook_unit_id);
        return (
          p.student_id === s2.id && u && u.textbook_id === r.textbook_id &&
          p.round === round && !parents.has(u.id)
        );
      });
      const names = (status) =>
        my.filter((p) => p.status === status)
          .map((p) => unitById.get(p.textbook_unit_id)?.name)
          .filter(Boolean)
          .join(" · ");
      rows.push([
        first ? s2.name : "",
        bookName.get(r.textbook_id) || "",
        names("done"),
        names("doing"),
        r.current_page ?? "",
      ]);
      first = false;
    }
  }
  return { error: null, rows };
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
    // 완료 취소 = 이번 회독 기록만 지운다 (기록이 없으면 = 아직 안 함).
    // **메모가 있는 줄은 지우지 않는다** — 지우면 메모가 같이 사라진다.
    // status 만 비운다 (0119). 그 전 DB 는 어차피 메모가 없으니 지워도 된다.
    let error = null;
    for (const id of ids) {
      const keep = supabase
        .from("student_unit_progress")
        .update({ status: null, done_on: null })
        .eq("student_id", studentId)
        .eq("textbook_unit_id", id)
        .not("note", "is", null);
      const kept = await withRound(keep, await roundFor(id));
      if (kept.error && kept.error.code !== "23502") error = kept.error;

      const q = supabase
        .from("student_unit_progress")
        .delete()
        .eq("student_id", studentId)
        .eq("textbook_unit_id", id)
        .is("note", null);
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
  const user = await sessionUser(supabase);

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
      .select("textbook_unit_id, status, done_on, note")
      .eq("student_id", studentId)
      .in("textbook_unit_id", unitIds);
  const res = await base().eq("round", round);
  if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
    const fb = await base();
    return fb.data || [];
  }
  return res.data || [];
}
