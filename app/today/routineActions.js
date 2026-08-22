"use server";

import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { inUseOn } from "@/lib/bookUse";
import { fetchAll } from "@/lib/fetchAll";

/**
 * 이 학생이 **지금 할 차례**인 루틴 단계를 내어준다.
 *
 * 학생이 쓰는 교재 중 루틴이 있는 것들을 보고, 각 교재의 현재 단계를 모은다.
 * 여러 교재에 루틴이 있으면 다 합친다 (문법 + 독해처럼).
 *
 * 되돌려주기만 하고 저장하지는 않는다 — 화면에서 보고 고칠 수 있어야 하니까.
 */
export async function nextRoutine(studentId, opts = {}) {
  // peek: 오늘 저장으로 한 단계 넘어간 **다음 수업** 차례를 미리 본다
  // (원장님 2026-08-20 「숙제를 낼 때 다음 수업 내용까지 정하는 게
  //  기억력 측면에서도 더 나아」)
  const peek = !!opts.peek;
  if (!studentId) return { inclass: [], home: [], steps: [], error: null };
  const supabase = createClient();

  // 회독(round)까지 본다 — 2회독이면 1회독 진도는 끝난 것으로 치지 않는다
  // 멈춤(pause, 0149)도 여기서 같이 읽는다 — 멈춤 판단은 이 함수 한 곳이다
  let stq = await supabase
    .from("student_textbooks")
    .select("textbook_id, status, routine_step, routine_step_id, round, assigned_on, ended_on, pause")
    .eq("student_id", studentId);
  if (stq.error) {
    // 0149 전 — pause 없이 (멈춘 교재가 없는 것으로 본다)
    stq = await supabase
      .from("student_textbooks")
      .select("textbook_id, status, routine_step, routine_step_id, round, assigned_on, ended_on")
      .eq("student_id", studentId);
  }
  if (stq.error) {
    // 0025 전 — 회독 칸도 없이
    stq = await supabase
      .from("student_textbooks")
      .select("textbook_id, status, routine_step, routine_step_id, assigned_on, ended_on")
      .eq("student_id", studentId);
  }
  if (stq.error) return { inclass: [], home: [], steps: [], error: null };

  // 오늘 수업 로스터와 같은 규칙 — 아직 안 시작한 책·끝난 책의 루틴을
  // 제안하면 같은 화면 안에서 딴소리가 된다 (전수검사 A7, 2026-08-15)
  /**
   * **교재멈춤은 아예 뺀다** (원장님 2026-08-22 — 「교재멈춤은 내신 대비할
   * 때 아예 진도 스탑」). 자동 차림·⟳ 다음·peek(다음 수업 미리 담기)까지
   * 이 함수를 지나는 모든 길에서 빠진다. 진도 기록·회독은 그대로라
   * 해제하면 하던 자리에서 재개된다. 저장 때 advanceRoutine 도 steps 에
   * 있는 교재만 넘기므로, 멈춘 교재의 루틴 차례도 제자리에 선다.
   */
  const mine = (stq.data || [])
    .filter((r) => inUseOn(r, todaySeoul()))
    .filter((r) => r.pause !== "all");
  const bookIds = mine.map((r) => r.textbook_id);
  if (bookIds.length === 0) return { inclass: [], home: [], steps: [], error: null };

  let rq = await supabase
    .from("routine_steps")
    .select("id, textbook_id, sort, label, inclass_items, home_items, home_next, round, item_notes")
    .in("textbook_id", bookIds)
    .order("sort", { ascending: true });
  if (rq.error) {
    // 0136 전 — 예습 칸 없이
    rq = await supabase
      .from("routine_steps")
      .select("id, textbook_id, sort, label, inclass_items, home_items, round")
      .in("textbook_id", bookIds)
      .order("sort", { ascending: true });
  }
  if (rq.error) {
    // 0135 전 — 회독 칸 없이
    rq = await supabase
      .from("routine_steps")
      .select("id, textbook_id, sort, label, inclass_items, home_items")
      .in("textbook_id", bookIds)
      .order("sort", { ascending: true });
  }
  if (rq.error) return { inclass: [], home: [], steps: [], error: "0035 SQL 을 먼저 실행해주세요." };

  /**
   * **영역별 루틴** (0137 — 원장님 2026-08-19 「따로 설정 없으면 영역별로
   * 하고, 교재별 설정하면 그걸 우선으로」). 교재 루틴이 한 줄도 없는
   * 교재는 그 교재 영역(문법/독해…)의 루틴을 따른다. 0137 전 DB 는
   * 이 조회가 조용히 실패하고 — 교재별만 돈다 (전과 같다).
   */
  let areaSteps = new Map();
  {
    const aq = await supabase
      .from("routine_steps")
      .select("id, area, sort, label, inclass_items, home_items, home_next, round, item_notes")
      .not("area", "is", null)
      .is("textbook_id", null)   // 영역 루틴 = 교재 없는 줄만 (2026-08-21 섞임 수리)
      .order("sort", { ascending: true });
    if (!aq.error) {
      (aq.data || []).forEach((s) => {
        if (!areaSteps.has(s.area)) areaSteps.set(s.area, []);
        areaSteps.get(s.area).push(s);
      });
    }
  }

  const byBook = new Map();
  (rq.data || []).forEach((s) => {
    if (!byBook.has(s.textbook_id)) byBook.set(s.textbook_id, []);
    byBook.get(s.textbook_id).push(s);
  });

  const { data: books } = await supabase
    .from("textbooks")
    .select("id, name, area")
    .in("id", bookIds);
  const bookName = new Map((books || []).map((b) => [b.id, b.name]));
  const bookArea = new Map((books || []).map((b) => [b.id, b.area || ""]));

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
    // 교재별이 우선 — 없으면 영역별 (0137)
    const all =
      (byBook.get(r.textbook_id) || []).length > 0
        ? byBook.get(r.textbook_id)
        : areaSteps.get(bookArea.get(r.textbook_id)) || [];
    /**
     * **회독 분기** (0135, 브릿지1). round 가 빈 줄은 모든 회독.
     * n 은 「n회독부터」 — 지금 회독 이하 중 **가장 가까운(큰)** 정의만
     * 살린다. 1·2·3회독 줄이 있으면 4회독 학생에겐 3회독 줄이 나온다.
     */
    const cur = r.round || 1;
    const rounded = all.filter((s) => s.round != null && s.round <= cur);
    const maxR = rounded.length ? Math.max(...rounded.map((s) => s.round)) : null;
    const list = all.filter((s) => s.round == null || s.round === maxR);
    if (list.length === 0) return;
    /**
     * **id 가 먼저다** (0120). 번호는 루틴을 중간에 고치면 다른 단계를
     * 가리키게 되어, 아직 id 가 없는 옛 줄의 폴백으로만 쓴다.
     * id 가 목록에 없으면(그 단계가 지워졌는데 보정을 못 받은 드문 경우)
     * 번호 폴백으로 내려간다 — 화면이 비는 것보다 낫다.
     */
    let idx = r.routine_step_id
      ? list.findIndex((x) => x.id === r.routine_step_id)
      : -1;
    if (idx < 0) idx = ((r.routine_step || 0) % list.length + list.length) % list.length;
    if (peek) idx = (idx + 1) % list.length;   // 다음 수업 차례
    const step = list[idx];
    const unit = unitOfBook.get(r.textbook_id) || null;
    /**
     * **숙제멈춤** (원장님 2026-08-22 — 「숙제멈춤은 숙제만 안 나감」).
     * 등원 학습(inclass)은 그대로 차리고, 숙제(home_items)와 예습
     * (home_next)만 비운다. 해제하면 다시 여느 때처럼 나간다.
     */
    const homePaused = r.pause === "home";
    (step.inclass_items || []).forEach((x) => inclass.add(x));
    if (!homePaused) (step.home_items || []).forEach((x) => {
      home.add(x);
      // 숙제에는 범위가 붙어야 한다 — 등원 학습은 그 자리에서 하니 안 붙인다
      if (unit?.id)
        itemUnits[x] = {
          textbookId: r.textbook_id,
          unitIds: [unit.id],
          // 항목별 주의사항 (0139) — 배정 메모로 흘러가 학생 화면에 뜬다
          note: step.item_notes?.[x] || "",
        };
    });
    /**
     * **예습(선행) 숙제** (0136 — 원장님 2026-08-19 「숙제가 선행인지
     * 후행인지」). 오늘 단원이 아니라 **다음 단원**이 붙는다.
     * 다음 단원이 없으면(마지막 단원) 범위 없이 항목만 담는다.
     */
    if (!homePaused) (step.home_next || []).forEach((x) => {
      home.add(x);
      if (unit?.nextId)
        itemUnits[x] = {
          textbookId: r.textbook_id,
          unitIds: [unit.nextId],
          note: step.item_notes?.[x] || "",
        };
    });
    steps.push({
      textbookId: r.textbook_id,
      book: bookName.get(r.textbook_id) || "교재",
      no: idx + 1,
      total: list.length,
      label: step.label || "",
      unit: unit ? unit.name : "",
      unitDone: !!unit?.allDone,
      // 멈춤 상태 — 화면(오늘 수업 판)이 태그로 보여준다
      pause: r.pause || null,
      // 교재 골라 차리기 (원장님 2026-08-20 「3」) — 화면이 교재별로 거른다
      inclassItems: step.inclass_items || [],
      homeItems: homePaused ? [] : [...(step.home_items || []), ...(step.home_next || [])],
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

  const uq = await fetchAll(() =>
    supabase
      .from("textbook_units")
      .select("id, name, parent_id, textbook_id, sort")
      .in("textbook_id", bookIds)
      .order("sort", { ascending: true })
      .order("id"));
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
    const idx = list.findIndex((u) => !done.has(`${u.id}|${round}`));
    if (idx >= 0) {
      const nextOne = list[idx];
      // 예습(선행) 숙제용 — 지금 단원의 **그다음** (0136)
      const after = list.slice(idx + 1).find((u) => !done.has(`${u.id}|${round}`)) || null;
      out.set(bid, {
        id: nextOne.id,
        name: nextOne.name || "",
        nextId: after?.id || null,
        nextName: after?.name || "",
      });
    } else out.set(bid, { id: null, name: "", allDone: true });
  });
  return out;
}

/** 이 학생의 루틴 단계를 하나 넘긴다 (끝까지 가면 처음으로) */
export async function advanceRoutine(studentId, textbookIds) {
  if (!studentId || !Array.isArray(textbookIds) || textbookIds.length === 0) {
    return { error: null };
  }
  const supabase = createClient();
  let { data: cur, error: curErr } = await supabase
    .from("student_textbooks")
    .select("textbook_id, routine_step, routine_step_id")
    .eq("student_id", studentId)
    .in("textbook_id", textbookIds);
  if (curErr) {
    // 0120 전 — 번호만
    ({ data: cur } = await supabase
      .from("student_textbooks")
      .select("textbook_id, routine_step")
      .eq("student_id", studentId)
      .in("textbook_id", textbookIds));
  }

  for (const r of cur || []) {
    const { data: list } = await supabase
      .from("routine_steps")
      .select("id, sort")
      .eq("textbook_id", r.textbook_id)
      .order("sort", { ascending: true });
    const len = (list || []).length || 1;
    // 지금 어디인가 — id 먼저, 없으면 번호 (nextRoutine 과 같은 규칙)
    let idx = r.routine_step_id
      ? (list || []).findIndex((x) => x.id === r.routine_step_id)
      : -1;
    if (idx < 0) idx = ((r.routine_step || 0) % len + len) % len;
    const nextIdx = (idx + 1) % len;
    // **다음 단계의 id 를 적는다.** 번호도 같이 맞춰두지만 (옛 화면 폴백용)
    // 진실은 id 다 — 두 벌이 어긋나면 id 가 이긴다 (위의 읽기 규칙)
    let up = await supabase
      .from("student_textbooks")
      .update({ routine_step: nextIdx, routine_step_id: (list || [])[nextIdx]?.id || null })
      .eq("student_id", studentId)
      .eq("textbook_id", r.textbook_id);
    if (up.error && (up.error.code === "42703" || up.error.code === "PGRST204")) {
      // 0120 전이면 번호만 — 옛 동작 그대로
      await supabase
        .from("student_textbooks")
        .update({ routine_step: nextIdx })
        .eq("student_id", studentId)
        .eq("textbook_id", r.textbook_id);
    }
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
