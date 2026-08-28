"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unitOptions } from "@/lib/unitTree";
import { todaySeoul } from "@/lib/day";
import { planAssign } from "@/lib/bookAssign";
import { inUseOn } from "@/lib/bookUse";
import { bookPanelRow, pickableBooks } from "@/lib/bookPanel";
import { fetchAll } from "@/lib/fetchAll";
import { sessionUser } from "@/lib/session";
import { requireStaff } from "@/lib/guard";

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
  const supabase = await createClient();
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

  // 넣을 것 — 처음이면 새로, 중단했던 것이면 다시 사용중으로.
  // **두 갈래를 한 upsert 에 섞지 않는다** (전수검사 A3, 2026-08-15) —
  // 칸이 합집합이 되어, 다시 넣는 책의 assigned_on 이 NULL 로 덮인다
  // (지키려고 known 을 가른 바로 그 값이 지워졌다. import/actions 의
  // 「기본값이 안 먹는다」 교훈과 같은 병).
  for (const part of [
    add.filter((a) => a.known).map(({ id }) =>
      ({ student_id: studentId, textbook_id: id, status: "active", ended_on: null })),
    add.filter((a) => !a.known).map(({ id }) =>
      ({ student_id: studentId, textbook_id: id, status: "active", assigned_on: today, ended_on: null })),
  ]) {
    if (part.length === 0) continue;
    let { error } = await supabase
      .from("student_textbooks")
      .upsert(part, { onConflict: "student_id,textbook_id" });
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // ended_on 이 아직 없는 DB
      ({ error } = await supabase
        .from("student_textbooks")
        .upsert(part.map(({ ended_on: _e, ...r }) => r), { onConflict: "student_id,textbook_id" }));
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
  const supabase = await createClient();
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

  // 두 갈래를 한 upsert 에 섞지 않는다 — 위 setStudentTextbooks 와 같은 까닭 (A3)
  for (const part of [
    add.filter((a) => a.known).map(({ id }) =>
      ({ student_id: id, textbook_id: textbookId, status: "active", ended_on: null })),
    add.filter((a) => !a.known).map(({ id }) =>
      ({ student_id: id, textbook_id: textbookId, status: "active", assigned_on: today, ended_on: null })),
  ]) {
    if (part.length === 0) continue;
    let { error } = await supabase
      .from("student_textbooks")
      .upsert(part, { onConflict: "student_id,textbook_id" });
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // ended_on 이 아직 없는 DB
      ({ error } = await supabase
        .from("student_textbooks")
        .upsert(part.map(({ ended_on: _e, ...r }) => r), { onConflict: "student_id,textbook_id" }));
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
  const supabase = await createClient();
  // **고치기만 한다** (전수검사 A15) — upsert 였을 때는 배정이 없는데
  // 페이지만 적으면 status·assigned_on 없는 줄이 생겼고, 그 줄은 「영원
  // 전부터 사용 중」 인 유령 배정으로 보였다. 페이지는 배정된 책에만 적는다.
  const { error } = await supabase
    .from("student_textbooks")
    .update({ current_page: d ? parseInt(d, 10) : null })
    .eq("student_id", studentId)
    .eq("textbook_id", textbookId);
  // revalidate 없음 (2026-08-23) — 이 판의 다른 저장과 같은 규칙이다.
  // 화면(BookProgress)이 12초 뒤 한 번만 다시 그린다. 서버가 여기서
  // 즉시 무르면 그 처방이 무력해져 적는 중에 화면이 바뀐다
  return ok(error);
}

/**
 * **이 학생은 이 활동을 건너뛴다** (원장님, 2026-08-19 — 「도저히 안
 * 되겠다 싶으면 워크북은 빼고 하게 된단 말이야. 그때까지 진도 기록은
 * 유지된 상태에서 앞으로의 숙제 배정에는 워크북이 빠지게」).
 *
 * 쉼표로 이어 적는다 (예: '워크북'). 기록은 안 건드린다 — 읽는 쪽
 * (진도 판·지난번과 같게·진도율)이 이 값을 보고 거른다.
 */
export async function setBookSkipActs(studentId, textbookId, acts) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const txt = (acts || "").toString().trim() || null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_textbooks")
    .update({ skip_acts: txt })
    .eq("student_id", studentId)
    .eq("textbook_id", textbookId);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    return { error: "관리자 → SQL 확인에서 0133 을 먼저 실행해 주세요." };
  }
  // revalidate 없음 (2026-08-23) — 이 판의 다른 저장과 같은 규칙이다.
  // 화면(BookProgress)이 12초 뒤 한 번만 다시 그린다. 서버가 여기서
  // 즉시 무르면 그 처방이 무력해져 적는 중에 화면이 바뀐다
  return ok(error);
}

/**
 * **교재멈춤 · 숙제멈춤** (원장님, 2026-08-22 — 「교재멈춤은 내신 대비할 때
 * 아예 진도 스탑, 숙제멈춤은 숙제만 안 나감. 버튼이나 체크박스 해제해야
 * 정상 수업 숙제 나가기」).
 *
 * pause: null(정상) | 'all'(교재멈춤) | 'home'(숙제멈춤). 여기는 적기만
 * 한다 — **멈춤을 읽고 거르는 판단은 nextRoutine(app/today/routineActions)
 * 한 곳**이고, 대시보드의 「진도 시작 안 함」 도 멈춘 교재는 재촉하지
 * 않는다 (lib/dashboard). 기록·회독은 안 건드리니 해제하면 그대로 재개된다.
 */
export async function setBookPause(studentId, textbookId, pause) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const p = pause === "all" || pause === "home" ? pause : null;
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };
  const { error } = await supabase
    .from("student_textbooks")
    .update({ pause: p })
    .eq("student_id", studentId)
    .eq("textbook_id", textbookId);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    return { error: "관리자 → SQL 확인에서 0149 를 먼저 실행해 주세요." };
  }
  // revalidate 없음 (setUnitProgress 와 같은 태도, 2026-08-21) — 수업 중
  // 누르는 단추라 /today 를 갈아엎으면 열어둔 판이 튄다. 누른 화면이
  // 낙관으로 즉시 바꾸고, 다른 화면은 다음 자연 새로고침 때 맞춰진다.
  return ok(error);
}

// 학생 차원의 교재 상태 — active(사용중) | done(완료) | dropped(중단)
// 완료·중단이면 숙제 배정·진도 화면에서 빠지고, 재원생 기록에만 남는다.
/**
 * **날짜를 지정해서** 교재 한 권을 붙인다 (원장님, 2026-08-14 — 「사용예정
 * 교재 추가가 필요해. 시작날짜를 입력하고 … 이미 쓴 적 있는데 기록이 없는
 * 교재를 추가할 수 있어야 해」).
 *
 * 시작일이 미래면 「사용 예정」 — 그날까지 오늘 수업 숙제·진도에 안 나온다
 * (그 규칙은 lib/bookUse 한 곳에 있다). 종료일까지 적으면 「끝낸 교재」
 * 기록으로 바로 들어간다 — 앱을 쓰기 전에 끝낸 교재를 남기는 길이다.
 */
export async function addStudentBookDated(studentId, textbookId, startOn, endOn) {
  if (!studentId || !textbookId) return { error: "학생과 교재를 골라주세요." };
  if (endOn && startOn && endOn < startOn) return { error: "종료일이 시작일보다 빠를 수 없어요." };
  const supabase = await createClient();
  /**
   * **이미 있는 짝은 덮지 않는다** (전수검사 A14). 형제 둘(교재 안내 ·
   * 이관)은 planDatedAssign 으로 지키는데 이 길만 upsert 라, 쓰던 책의
   * 시작일이 바뀌고 끝낸 책이 도로 사용 중이 될 수 있었다.
   */
  const { data: had } = await supabase
    .from("student_textbooks")
    .select("status")
    .eq("student_id", studentId)
    .eq("textbook_id", textbookId)
    .maybeSingle();
  if (had && (had.status === "active" || !had.status)) {
    return {
      error: "이미 배정된 교재예요.",
    };
  }
  if (had) {
    /**
     * **끝냄·중단 기록이 있으면 그 자리에서 되살린다** (원장님 2026-08-23
     * — 「이게 어떻게 하라는 건지 모르겠어」). 전에는 딴 화면으로 가라는
     * 순환 안내만 떴다. 진도·회독 기록은 단원 표에 있어 그대로 이어진다.
     */
    let { error: rvErr } = await supabase
      .from("student_textbooks")
      .update({ status: "active", assigned_on: startOn || null, ended_on: endOn || null, pause: null })
      .eq("student_id", studentId)
      .eq("textbook_id", textbookId);
    if (rvErr && (rvErr.code === "42703" || rvErr.code === "PGRST204")) {
      // 0149 전 — pause 없이
      ({ error: rvErr } = await supabase
        .from("student_textbooks")
        .update({ status: "active", assigned_on: startOn || null, ended_on: endOn || null })
        .eq("student_id", studentId)
        .eq("textbook_id", textbookId));
    }
    if (rvErr) return { error: rvErr.message };
    revalidatePath("/progress");
    revalidatePath("/students");
    return { error: null, revived: true };
  }
  const row = {
    student_id: studentId,
    textbook_id: textbookId,
    status: endOn ? "done" : "active",
    assigned_on: startOn || todaySeoul(),
    ended_on: endOn || null,
  };
  let { error } = await supabase
    .from("student_textbooks")
    .upsert(row, { onConflict: "student_id,textbook_id" });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0019 전 DB — ended_on 이 없다
    const { ended_on: _e, ...rest } = row;
    ({ error } = await supabase
      .from("student_textbooks")
      .upsert(rest, { onConflict: "student_id,textbook_id" }));
  }
  revalidatePath("/students");
  revalidatePath("/today");
  return ok(error);
}

/**
 * **여러 권 한 번에 끝냄** (원장님, 2026-08-14 — 「오늘 진도에 사용 중인
 * 교재가 아니라 누적 교재가 다 나와」).
 *
 * 교재안내 기록 이관으로 옛날 안내분까지 전부 「사용 중」 으로 들어왔다 —
 * 앱이 없던 시절 책이라 종료처리가 안 된 것뿐인데, 한 권씩 열어 「이 교재
 * 끝냄」 을 누르기엔 너무 많다. 어느 책이 끝났는지는 원장님만 아니
 * (1월에 안내한 책을 아직 쓰기도 한다) 날짜로 짐작하지 않고 골라서 끝낸다.
 */
/**
 * 이 학생의 **단어 교재 + 시험 방식** (원장님, 2026-08-15 — 「(방식을)
 * 오늘 수업 말고 미리 정해두고 싶다」 → 재원생 단어시험 탭이 부른다).
 * 오늘 수업의 wtOf 와 같은 것 — (학생, 교재, 회독) 하나에 설정 한 줄.
 */
export async function listWordTestBooks(studentId) {
  if (!studentId) return { books: [] };
  const supabase = await createClient();
  const today = todaySeoul();
  const [stQ, bQ] = await Promise.all([
    supabase
      .from("student_textbooks")
      .select("textbook_id, status, assigned_on, ended_on, round")
      .eq("student_id", studentId),
    supabase.from("textbooks").select("id, name, area, status"),
  ]);
  const bookOf = new Map((bQ.data || []).map((b) => [b.id, b]));
  const mine = (stQ.data || [])
    .filter((r) => inUseOn(r, today))
    .map((r) => ({ r, b: bookOf.get(r.textbook_id) }))
    .filter((x) => x.b && (!x.b.status || x.b.status === "active") && x.b.area === "단어");
  if (mine.length === 0) return { books: [] };
  let wt = await supabase
    .from("word_test_settings")
    .select("textbook_id, round, mc_meaning, sa_meaning, mc_word, sa_word, first_hint, units_per")
    .eq("student_id", studentId)
    .in("textbook_id", mine.map((x) => x.r.textbook_id));
  if (wt.error && (wt.error.code === "42703" || wt.error.code === "PGRST204")) {
    // 0124 전이면 「몇 단원씩」 없이
    wt = await supabase
      .from("word_test_settings")
      .select("textbook_id, round, mc_meaning, sa_meaning, mc_word, sa_word, first_hint")
      .eq("student_id", studentId)
      .in("textbook_id", mine.map((x) => x.r.textbook_id));
  }
  const wtOf = new Map(
    (wt.error ? [] : wt.data || []).map((w) => [`${w.textbook_id}|${w.round}`, w])
  );
  return {
    books: mine.map(({ r, b }) => ({
      id: b.id,
      name: b.name,
      round: r.round || 1,
      wordTest: wtOf.get(`${b.id}|${r.round || 1}`) || null,
    })),
  };
}

/**
 * **한 학생의 진도 판 재료 한 벌** — 진도 화면(/progress)이 전교생에게
 * 주는 것과 **똑같은 모양**을, 대시보드 팝오버가 한 아이에게만 받는다.
 *
 * ── 왜 이게 필요했나 (원장님 2026-08-28) ─────────────────
 * 「원판에 비해 너무 기능이 제한적임. 그대로 재현할 것.」
 *
 * 팝오버가 원판(BookProgress · StudentBooksProgress)을 **그대로 마운트**
 * 하려면 그 판이 먹는 재료가 그대로 있어야 한다 — 현재 페이지 · 회독 ·
 * 멈춤 · 건너뛸 활동 · 절판 표시 · ◐ 단원 이름. 축약판을 따로 그리면
 * 두 벌이 되어 언젠가 갈라진다 (원칙 1).
 *
 * 모양은 lib/bookPanel 한 벌, 「지금 쓰는 중인가」는 inUseOn 한 벌 —
 * **여기에 새 판단은 없다.** 조회만 「한 학생」으로 좁혔다.
 */
export async function studentBookPanel(studentId) {
  if (!studentId) return { books: [], allBooks: [] };
  const supabase = await createClient();
  const today = todaySeoul();

  // 파도 (원칙 6-1) — 셋은 서로 필요한 것이 없다
  const COLS = "textbook_id, status, assigned_on, ended_on, current_page, round, skip_acts, pause";
  const [stQ0, bQ, doQ] = await Promise.all([
    supabase.from("student_textbooks").select(COLS).eq("student_id", studentId),
    supabase.from("textbooks").select("id, name, area, status, total_pages").order("name", { ascending: true }),
    supabase.from("student_unit_progress").select("textbook_unit_id, round").eq("student_id", studentId).eq("status", "doing"),
  ]);
  // 0149(pause) → 0133(skip_acts) 없는 DB 는 한 칸씩 물러난다 — 진도 화면과 같은 사다리
  let stQ = stQ0;
  if (stQ.error) {
    stQ = await supabase.from("student_textbooks")
      .select("textbook_id, status, assigned_on, ended_on, current_page, round, skip_acts")
      .eq("student_id", studentId);
  }
  if (stQ.error) {
    stQ = await supabase.from("student_textbooks")
      .select("textbook_id, status, assigned_on, ended_on, current_page, round")
      .eq("student_id", studentId);
  }

  const bookById = new Map((bQ.data || []).map((b) => [b.id, b]));

  // ◐ 인 단원 이름 — 접힌 줄에서 「오늘 위치」를 보여준다 (진도 화면과 같다)
  const doRows = doQ.error ? [] : doQ.data || [];
  const doIds = [...new Set(doRows.map((r) => r.textbook_unit_id))];
  const { data: doUnits } = doIds.length
    ? await supabase.from("textbook_units").select("id, name, textbook_id").in("id", doIds)
    : { data: [] };
  const unitById = new Map((doUnits || []).map((u) => [u.id, u]));
  const doingOf = new Map();
  doRows.forEach((r) => {
    const u = unitById.get(r.textbook_unit_id);
    if (!u) return;
    if (!doingOf.has(u.textbook_id)) doingOf.set(u.textbook_id, []);
    doingOf.get(u.textbook_id).push({ name: u.name, round: r.round || 1 });
  });

  const books = (stQ.data || [])
    .filter((r) => inUseOn(r, today))
    .map((r) => {
      const b = bookById.get(r.textbook_id);
      if (!b) return null;
      const round = r.round || 1;
      return bookPanelRow(r, b, (doingOf.get(b.id) || []).filter((d) => d.round === round).map((d) => d.name));
    })
    .filter(Boolean);

  return { books, allBooks: pickableBooks(bQ.data || []) };
}

export async function endStudentBooks(studentId, textbookIds) {
  const ids = [...new Set((textbookIds || []).filter(Boolean))];
  if (!studentId || ids.length === 0) return { error: "교재를 골라주세요." };
  const supabase = await createClient();
  let { error } = await supabase
    .from("student_textbooks")
    .update({ status: "done", ended_on: todaySeoul() })
    .eq("student_id", studentId)
    .in("textbook_id", ids);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ error } = await supabase
      .from("student_textbooks")
      .update({ status: "done" })
      .eq("student_id", studentId)
      .in("textbook_id", ids));
  }
  revalidatePath("/students");
  revalidatePath("/today");
  revalidatePath("/progress");
  return ok(error);
}

/**
 * **잘못 넣은 교재를 기록에서 지운다** (원장님 2026-08-24 — 「내가 테스트하다
 * 잘못 넣은 건지 모르겠는데 안 쓴 교재가 기록에 있어, 이거 어떻게 지워?」).
 *
 * 끝냄·중단은 **쓴 기록**이라 남겨야 하지만, 애초에 안 쓴 책은 기록이 아니라
 * 잡음이다. 「지난 교재 7권」 이 사실은 4권이면 그 숫자를 못 믿게 된다.
 *
 * 배정 줄만 지운다 — 그 교재에 찍힌 단원 진도는 그대로 둔다. 진도까지 지우면
 * 되돌릴 수가 없고, 배정이 없으면 어차피 화면에 안 나온다.
 */
export async function removeStudentBook(studentId, textbookId) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_textbooks").delete()
    .eq("student_id", studentId).eq("textbook_id", textbookId);
  revalidatePath("/today");
  revalidatePath("/students");
  revalidatePath("/progress");
  return ok(error);
}

export async function setStudentBookStatus(studentId, textbookId, status, endedOn) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();

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

  /**
   * **이름과 진도를 나란히 묻는다** (성능수리 5차 — 직렬 3층이었다).
   *
   * 진도는 원래 「재원생만」 으로 좁혀 물었는데, 누가 재원생인지는 이름
   * 조회가 와야 안다 — 그래서 이름 → 진도로 줄을 서 있었다. 배정된 학생
   * (active) 으로 넓혀 물으면 앞의 답을 안 기다려도 된다. 퇴원생 줄이
   * 몇 줄 더 딸려 올 뿐이고, 아래에서 줄을 만들 때 재원생만 도니
   * **결과는 한 줄도 안 달라진다.**
   */
  const activeIds = active.map((r) => r.student_id);
  const wantProg = leaves.length > 0;
  const [{ data: students }, progQ] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, grade, status")
      .in("id", activeIds),
    // 교재 하나 × 배정된 학생 × 회독이라 1000줄을 넘는다 — 끝까지 (lib/fetchAll)
    wantProg
      ? fetchAll(() =>
          supabase
            .from("student_unit_progress")
            .select("student_id, textbook_unit_id, status, done_on, round")
            .in("student_id", activeIds)
            .in("textbook_unit_id", leaves)
            .order("student_id")
            .order("textbook_unit_id")
        )
      : { data: [], error: null },
  ]);
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
  let allProg = progQ.data || [];
  if (wantProg && progQ.error && (progQ.error.code === "42703" || progQ.error.code === "PGRST204")) {
    // 0025 전이면 round 없이 — 전부 1회독으로 본다
    const q = await fetchAll(() =>
      supabase
        .from("student_unit_progress")
        .select("student_id, textbook_unit_id, status, done_on")
        .in("student_id", activeIds)
        .in("textbook_unit_id", leaves)
        .order("student_id")
        .order("textbook_unit_id")
    );
    allProg = (q.data || []).map((p) => ({ ...p, round: 1 }));
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
  const supabase = await createClient();
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
  const supabase = await createClient();

  const base = "id, textbook_id, parent_id, label, name, page_start, page_end, sort";
  const LADDER = [
    `${base}, total_pages, question_count, question_range, word_count, summary, minutes`,
    `${base}, total_pages`,
    base,
  ];
  let units = null;
  let error = null;
  for (const cols of LADDER) {
    // 교재 여러 권이면 단원이 1000줄을 넘을 수 있다 — 끝까지 (lib/fetchAll)
    ({ data: units, error } = await fetchAll(() =>
      supabase
        .from("textbook_units")
        .select(cols)
        .in("textbook_id", ids)
        .order("sort", { ascending: true })
        .order("id")
    ));
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
    let q = await fetchAll(() =>
      supabase
        .from("student_unit_progress")
        .select("textbook_unit_id, status, done_on, note, round")
        .eq("student_id", studentId)
        .in("textbook_unit_id", unitIds)
        .order("textbook_unit_id")
    );
    if (q.error && (q.error.code === "42703" || q.error.code === "PGRST204")) {
      q = await fetchAll(() =>
        supabase
          .from("student_unit_progress")
          .select("textbook_unit_id, status, done_on, note")
          .eq("student_id", studentId)
          .in("textbook_unit_id", unitIds)
          .order("textbook_unit_id")
      );
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
  const supabase = await createClient();

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
  const supabase = await createClient();
  const [{ data: students }, { data: books }, { data: st }, { data: units }, progQ] =
    await Promise.all([
      supabase.from("students").select("id, name, status").eq("status", "enrolled").order("name"),
      supabase.from("textbooks").select("id, name"),
      // 표 전체 읽기 셋은 1000줄을 넘는다 — 잘린 파일이 진짜처럼 보인다 (A5)
      fetchAll(() => supabase.from("student_textbooks")
        .select("student_id, textbook_id, status, round, current_page")
        .order("student_id").order("textbook_id")),
      fetchAll(() => supabase.from("textbook_units")
        .select("id, name, textbook_id, parent_id, sort").order("sort").order("id")),
      fetchAll(() => supabase.from("student_unit_progress")
        .select("student_id, textbook_unit_id, status, round")
        .order("student_id").order("textbook_unit_id")),
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

// 순서와 상관없이 아무 단원이나 완료/미완료로 바꾼다.
// opts (검사 → 진도 자동 반영, 원장님 2026-08-22 — 「저장」 이 곧 확정 행위):
//   on:       기록 날짜 (done_on·marked_on). 안 주면 오늘 — 지난 날짜의
//             수업을 저장할 때 진도가 엉뚱한 날로 찍히지 않게.
//   keepDone: 이미 done 인 단원은 안 건드린다 — 「이미 더 높은 상태로
//             찍힌 단원을 낮추지 않는다」 (△가 지난 완료를 doing 으로
//             되돌리거나, ○ 재검사가 done_on 을 덮어쓰는 일 방지).
export async function setUnitProgress(studentId, unitIds, status, opts = {}) {
  const ids = Array.isArray(unitIds) ? unitIds : [unitIds];
  if (!studentId || ids.length === 0) return { error: null };
  const supabase = await createClient();

  // 이 단원들이 속한 교재의 **지금 회독**에 기록한다.
  // 체크를 지워도 지난 회독 기록은 건드리지 않는다.
  const { data: us } = await supabase
    .from("textbook_units")
    .select("id, textbook_id")
    .in("id", ids);
  const bookOfUnit = new Map((us || []).map((u) => [u.id, u.textbook_id]));
  // 화면이 옛날 것일 수 있다 — 단원을 통째로 갈아끼운 뒤(엑셀 재주입 등)
  // 그 전에 열어둔 화면의 단원 id 는 이제 없다. 그대로 쓰면 FK 오류로
  // 조용히 실패하고, 원장님 눈에는 「표시했는데 다 날아감」 이 된다
  // (2026-08-17). 없는 단원이 섞여 있으면 저장 전에 멈추고 말해준다.
  const gone = ids.filter((id) => !bookOfUnit.has(id));
  if (gone.length > 0) {
    return {
      error:
        "단원 목록이 그 사이에 새로 바뀌어서, 지금 화면이 옛날 것이에요.\n" +
        "화면을 새로고침한 뒤 다시 표시해 주세요. (저장 안 됨)",
    };
  }
  const roundCache = new Map();
  async function roundFor(unitId) {
    // 지난 회독 고치기 (원장님 2026-08-23 「과거 기록을 수정할 수 있게」)
    if (opts.round) return opts.round;
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
      /**
       * **정정으로 지울 때는 그 날 찍은 것만** (원장님 2026-08-23 —
       * 「○ 를 ✕ 로 고치면 진도도 내려가야지」). 날짜 자물쇠가 없으면,
       * 지난 회차에 이미 끝낸 단원이 이번 주 숙제에 다시 걸렸을 때
       * (문법 한 단원을 여러 번 수업하는 교재) 안 해왔다는 이유로
       * 예전 완료까지 지워진다. reCheckOn 이 있으면 그 날 찍힌 줄만 건드린다.
       */
      const lock = (q) => (opts.reCheckOn ? q.eq("marked_on", opts.reCheckOn) : q);
      const keep = lock(supabase
        .from("student_unit_progress")
        .update({ status: null, done_on: null })
        .eq("student_id", studentId)
        .eq("textbook_unit_id", id)
        .not("note", "is", null));
      const kept = await withRound(keep, await roundFor(id));
      if (kept.error && kept.error.code !== "23502") error = kept.error;

      const q = lock(supabase
        .from("student_unit_progress")
        .delete()
        .eq("student_id", studentId)
        .eq("textbook_unit_id", id)
        .is("note", null));
      let res = await withRound(q, await roundFor(id));
      if (res.error && opts.reCheckOn && (res.error.code === "42703" || res.error.code === "PGRST204")) {
        // 0134 전 — marked_on 이 없다. 완료 날짜로 대신 잠근다
        // (자물쇠를 아예 풀지는 않는다 — 예전 완료까지 지우는 것이 더 나쁘다)
        const q2 = supabase
          .from("student_unit_progress")
          .delete()
          .eq("student_id", studentId)
          .eq("textbook_unit_id", id)
          .is("note", null)
          .eq("done_on", opts.reCheckOn);
        res = await withRound(q2, await roundFor(id));
      }
      if (res.error) error = res.error;
    }
    // revalidate 없음 (2026-08-21) — 진도를 찍는 그 화면이 응답과 함께
    // 즉시 다시 그려져서, 12초 lazyRefresh 를 만들어 둔 보람이 없었다.
    // 새로고침 시점은 화면(BookProgress)이 정한다
    return ok(error);
  }

  // 이미 done 인 단원 골라내기 (keepDone) — 지금 회독 기록만 본다
  let write = ids;
  if (opts.keepDone) {
    let q = await supabase
      .from("student_unit_progress")
      .select("textbook_unit_id, round, marked_on")
      .eq("student_id", studentId)
      .in("textbook_unit_id", ids)
      .eq("status", "done");
    if (q.error && (q.error.code === "42703" || q.error.code === "PGRST204")) {
      // 0026 전 — round 없이 (전부 1회독으로 본다)
      q = await supabase
        .from("student_unit_progress")
        .select("textbook_unit_id")
        .eq("student_id", studentId)
        .in("textbook_unit_id", ids)
        .eq("status", "done");
    }
    const doneSet = new Set();
    for (const r of q.error ? [] : q.data || []) {
      // 그 날 찍은 완료는 「지킬 것」이 아니다 — 같은 날의 정정은 반영돼야 한다
      if (opts.reCheckOn && r.marked_on === opts.reCheckOn) continue;
      if (r.round === undefined || (r.round || 1) === (await roundFor(r.textbook_unit_id))) {
        doneSet.add(r.textbook_unit_id);
      }
    }
    write = ids.filter((id) => !doneSet.has(id));
    if (write.length === 0) return { error: null };
  }

  const today = opts.on || todaySeoul();
  const rows = [];
  for (const textbook_unit_id of write) {
    rows.push({
      student_id: studentId,
      textbook_unit_id,
      round: await roundFor(textbook_unit_id),
      status,
      done_on: status === "done" ? today : null,
      // 「마지막으로 만진 날」 (0134) — ◐도 날짜가 남아야
      // 「오늘 수업한 부분」 을 리포트에 자동으로 채울 수 있다
      marked_on: today,
    });
  }

  let { error } = await supabase
    .from("student_unit_progress")
    .upsert(rows, { onConflict: "student_id,textbook_unit_id,round" });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0134 전 — marked_on 컬럼이 아직 없다
    ({ error } = await supabase.from("student_unit_progress").upsert(
      rows.map(({ marked_on, ...r }) => r),
      { onConflict: "student_id,textbook_unit_id,round" }
    ));
  }
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0026 전 — round 컬럼도 아직 없다
    ({ error } = await supabase.from("student_unit_progress").upsert(
      rows.map(({ round, marked_on, ...r }) => r),
      { onConflict: "student_id,textbook_unit_id" }
    ));
  }
  // revalidate 없음 (2026-08-21) — 진도를 찍는 그 화면이 응답과 함께
  // 즉시 다시 그려져서, 12초 lazyRefresh 를 만들어 둔 보람이 없었다.
  // 새로고침 시점은 화면(BookProgress)이 정한다
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
    // 한 번에 몇 단원씩 (0124) — 0/빈값이면 「지난번 개수만큼」
    units_per: Math.max(0, Math.min(20, parseInt(cfg?.units_per, 10) || 0)) || null,
  };
  const sum = row.mc_meaning + row.sa_meaning + row.mc_word + row.sa_word;
  if (sum !== 100) return { error: `합이 100%가 되어야 해요. 지금 ${sum}%입니다.` };

  const supabase = await createClient();
  const user = await sessionUser(supabase);

  let { error } = await supabase
    .from("word_test_settings")
    .upsert({ ...row, created_by: user?.id || null }, {
      onConflict: "student_id,textbook_id,round",
    });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0124 전이면 「몇 단원씩」 없이 저장한다
    const { units_per: _u, ...rest } = row;
    ({ error } = await supabase
      .from("word_test_settings")
      .upsert({ ...rest, created_by: user?.id || null }, { onConflict: "student_id,textbook_id,round" }));
  }
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
/**
 * **회독 취소** (원장님 2026-08-23 — 「체크 안 한 게 안 한 걸로 기록되는
 * 걸 모르고 넘어가버렸어 … 회독을 취소할 수 있게」). 번호만 되돌린다 —
 * 이번 회독에 찍은 기록은 단원 표에 남아, 다시 넘기면 그대로 보인다.
 */
export async function prevRound(studentId, textbookId) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("student_textbooks")
    .select("round")
    .eq("student_id", studentId)
    .eq("textbook_id", textbookId)
    .maybeSingle();
  const now = cur?.round || 1;
  if (now <= 1) return { error: "1회독이라 되돌릴 회독이 없어요." };
  const { error } = await supabase
    .from("student_textbooks")
    .update({ round: now - 1 })
    .eq("student_id", studentId)
    .eq("textbook_id", textbookId);
  if (error) return { error: error.message };
  return { error: null, round: now - 1 };
}

export async function nextRound(studentId, textbookId) {
  if (!studentId || !textbookId) return { error: "값이 부족해요." };
  const supabase = await createClient();

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
