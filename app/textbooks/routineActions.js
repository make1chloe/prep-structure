"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { needSql } from "@/lib/sqlError";
import { templateFor, buildSteps, TEMPLATE_AREAS } from "@/lib/routineTemplates";

const NEED = "0035 SQL 을 먼저 실행해주세요.";
/** 이 교재의 루틴 (한 줄 = 한 수업 회차) */
export async function listRoutine(textbookId) {
  if (!textbookId) return { steps: [], ready: true, error: null };
  const supabase = createClient();
  let { data, error } = await supabase
    .from("routine_steps")
    .select("id, sort, label, inclass_items, home_items, home_next, note, round")
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: true });
  if (error) {
    ({ data, error } = await supabase
      .from("routine_steps")
      .select("id, sort, label, inclass_items, home_items, note, round")
      .eq("textbook_id", textbookId)
      .order("sort", { ascending: true }));
  }
  if (error) {
    // 0135 전 — 회독 칸 없이
    ({ data, error } = await supabase
      .from("routine_steps")
      .select("id, sort, label, inclass_items, home_items, note")
      .eq("textbook_id", textbookId)
      .order("sort", { ascending: true }));
  }
  if (needSql(error)) return { steps: [], ready: false, error: NEED };
  if (error) return { steps: [], ready: true, error: error.message };
  /**
   * 교재 루틴이 없으면 **영역 루틴을 따르는 중** (0137). 그대로 보여주되
   * inherited 로 표시한다 — 여기서 단계를 추가하면 교재별 루틴이 생기고
   * 그때부터 그것이 우선이다.
   */
  if ((data || []).length === 0) {
    const { data: bk } = await supabase
      .from("textbooks").select("area").eq("id", textbookId).maybeSingle();
    if (bk?.area) {
      const aq = await supabase
        .from("routine_steps")
        .select("id, sort, label, inclass_items, home_items, home_next, note, round, area")
        .eq("area", bk.area)
        .order("sort", { ascending: true });
      if (!aq.error && (aq.data || []).length > 0) {
        return { steps: aq.data, ready: true, inherited: bk.area, error: null };
      }
    }
  }
  return { steps: data || [], ready: true, error: null };
}

export async function saveStep(textbookId, step) {
  if (!textbookId) return { error: "교재가 없어요." };
  const supabase = createClient();
  const row = {
    textbook_id: textbookId,
    sort: Number.isFinite(+step?.sort) ? +step.sort : 0,
    label: (step?.label || "").trim() || null,
    inclass_items: step?.inclass_items || [],
    home_items: step?.home_items || [],
    home_next: step?.home_next || [],
    note: (step?.note || "").trim() || null,
    // 회독 분기 (0135) — 빈칸이면 모든 회독
    round: Number.isFinite(+step?.round) && +step.round > 0 ? +step.round : null,
  };
  let { error } = step?.id
    ? await supabase.from("routine_steps").update(row).eq("id", step.id)
    : await supabase.from("routine_steps").insert(row);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const { home_next: _hn, ...noNext } = row;
    ({ error } = step?.id
      ? await supabase.from("routine_steps").update(noNext).eq("id", step.id)
      : await supabase.from("routine_steps").insert(noNext));
  }
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const { round: _r, home_next: _hn2, ...noRound } = row;
    ({ error } = step?.id
      ? await supabase.from("routine_steps").update(noRound).eq("id", step.id)
      : await supabase.from("routine_steps").insert(noRound));
  }
  if (needSql(error)) return { error: NEED };
  if (error) return { error: error.message };
  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: null };
}

export async function deleteStep(id) {
  if (!id) return { error: null };
  const supabase = createClient();

  /**
   * **이 단계에 서 있는 학생을 먼저 다음 단계로 옮긴다** (0120).
   *
   * 학생은 단계의 id 를 기억하므로(중간 수정에 안전하려고 그렇게 했다),
   * 그 단계가 지워지면 가리킬 곳이 사라진다. 지우기 전에 sort 상 다음
   * 단계로 옮겨준다 — 다음이 없으면 처음으로 (루틴은 돌기 때문이다).
   *
   * **과거 기록은 안 건드린다** — 그날 무엇을 했는지는 리포트에 이미
   * 박제되어 있다. 여기서 옮기는 것은 「다음 수업에 뭘 할까」 뿐이다.
   */
  const { data: gone } = await supabase
    .from("routine_steps")
    .select("id, textbook_id, sort")
    .eq("id", id)
    .maybeSingle();
  if (gone) {
    const { data: list } = await supabase
      .from("routine_steps")
      .select("id, sort")
      .eq("textbook_id", gone.textbook_id)
      .order("sort", { ascending: true });
    const rest = (list || []).filter((x) => x.id !== id);
    const next =
      rest.find((x) => x.sort > gone.sort) || rest[0] || null;   // 다음 → 없으면 처음
    const move = await supabase
      .from("student_textbooks")
      .update({ routine_step_id: next?.id || null })
      .eq("textbook_id", gone.textbook_id)
      .eq("routine_step_id", id);
    // 0120 전이면 칸이 없다 — 옮길 것도 없으니 조용히 지나간다
    if (move.error && move.error.code !== "42703" && move.error.code !== "PGRST204") {
      return { error: move.error.message };
    }
  }

  const { error } = await supabase.from("routine_steps").delete().eq("id", id);
  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

/**
 * **본보기 루틴 넣기** (원장님, 2026-08-11 — 「학습항목이랑 루틴설계해야
 * 하는데 엄두가 안나」).
 *
 * 빈 화면에서 마흔여섯 개 항목을 골라 순서를 짜는 것이 엄두가 안 나는
 * 일이다. 영역에 맞는 순서를 **넣어드리고 고치시게** 한다.
 *
 * **이미 루틴이 있으면 넣지 않는다** — 손으로 짜두신 것을 덮으면
 * 되돌릴 길이 없다. 지우고 다시 넣으시는 것은 원장님 손에 둔다.
 *
 * 학습 항목을 이름으로 잇는다. 없는 이름은 **버리지 않고 알려준다** —
 * 「기본 학습 목록」 을 아직 안 넣으셨을 수 있다.
 */
export async function seedRoutine(textbookId) {
  if (!textbookId) return { error: "교재가 없어요." };
  const supabase = createClient();

  const { data: book, error: bErr } = await supabase
    .from("textbooks").select("id, name, area").eq("id", textbookId).maybeSingle();
  if (bErr) return { error: bErr.message };
  if (!book) return { error: "교재를 못 찾았어요." };

  const steps = templateFor(book.area);
  if (!steps) {
    return {
      error:
        `「${book.area || "영역 없음"}」 는 본보기가 아직 없어요. `
        + `교재의 영역을 ${TEMPLATE_AREAS.join(" · ")} 중 하나로 정해주시면 넣어드립니다.`,
    };
  }

  const { data: had } = await supabase
    .from("routine_steps").select("id").eq("textbook_id", textbookId).limit(1);
  if ((had || []).length > 0) {
    return { error: "이미 루틴이 있어요. 지우고 다시 넣으시거나, 있는 것을 고쳐주세요." };
  }

  const { data: items, error: iErr } = await supabase
    .from("homework_items").select("id, name").eq("active", true);
  if (iErr) return { error: iErr.message };

  const { rows, missing } = buildSteps(steps, items || []);
  /**
   * **하나도 못 이었으면 넣지 않는다** (2026-08-11, 검사판에서 걸렸다).
   * 빈 단계 세 줄이 들어가고 본보기 단추는 사라져서, 원장님은 쓸모없는
   * 줄을 손으로 지우는 것부터 하셔야 했다 — 도우려다 일을 늘린 꼴이다.
   * 「기본 학습 목록」 을 아직 안 넣으셨을 때 그렇게 된다.
   */
  const filled = rows.filter((r) => r.inclass_items.length + r.home_items.length > 0);
  if (filled.length === 0) {
    return {
      error:
        "학습 항목이 아직 없어서 넣을 수가 없어요.\n\n"
        + "숙제 → 학습 항목 → 「노션 기본숙제 가져오기」 를 먼저 누르신 뒤에 다시 해주세요.",
    };
  }

  const { error } = await supabase
    .from("routine_steps")
    .insert(filled.map((r) => ({ ...r, textbook_id: textbookId })));
  if (needSql(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: null, added: filled.length, area: book.area, missing };
}

/**
 * 루틴 엑셀 올리기 (원장님, 2026-08-14). 한 줄 = 한 수업 회차.
 *
 * **이미 루틴이 있는 교재는 통째로 건너뛰고 알려준다** — 덮어쓰면 그 루틴을
 * 돌고 있는 학생들의 단계 id(0120)가 끊긴다. 고치려면 화면에서 고치거나,
 * 루틴을 비운 뒤 올린다 (지우는 것은 원장님 손에 둔다 — seedRoutine 과 같은 규칙).
 * 항목 이름을 못 찾으면 그 항목만 빠지고 무엇이 빠졌는지 알려준다.
 */
export async function bulkAddRoutines(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return { error: "올릴 줄이 없어요." };
  const supabase = createClient();

  const [{ data: books }, { data: items }] = await Promise.all([
    supabase.from("textbooks").select("id, name"),
    supabase.from("homework_items").select("id, name").eq("active", true),
  ]);
  const bookByName = new Map((books || []).map((b) => [b.name.trim(), b.id]));
  const itemByName = new Map((items || []).map((i) => [i.name.trim(), i.id]));

  /**
   * **영역 루틴** (0137) — 교재명 칸에 「영역:문법」 또는 그냥 영역 이름
   * (문법·독해·단어·영작·듣기·내신)을 적으면 그 영역의 공통 루틴이 된다.
   * 교재별 루틴이 있는 교재는 교재별이 우선이다.
   */
  const AREA_NAMES = ["단어", "독해", "문법", "내신", "듣기", "영작"];
  const areaOfRow = (name) => {
    const m = (name || "").match(/^영역\s*[::]\s*(.+)$/);
    if (m) return m[1].trim();
    return AREA_NAMES.includes((name || "").trim()) ? name.trim() : null;
  };

  // 교재별로 묶는다 (영역 줄은 area 키로)
  const byBook = new Map();
  const missingBooks = new Set();
  for (const r of rows) {
    const area = areaOfRow(r.book);
    if (area) {
      const key = `area:${area}`;
      if (!byBook.has(key)) byBook.set(key, []);
      byBook.get(key).push(r);
      continue;
    }
    const bid = bookByName.get(r.book);
    if (!bid) { missingBooks.add(r.book); continue; }
    if (!byBook.has(bid)) byBook.set(bid, []);
    byBook.get(bid).push(r);
  }

  /**
   * **없는 항목은 만들어서 잇는다** (원장님, 2026-08-19 — 「활동마다
   * 항목을 새로 만든다. 1해줘」). 루틴 구술의 활동(클카 낭독,
   * SVOCM 표시 …)은 학습항목에 아직 없다 — 빼고 넣으면 루틴이
   * 반쪽이 된다. 갈래는 이름으로 짐작해 붙이고, 학습항목 화면에서
   * 언제든 고칠 수 있다.
   */
  const allNames = new Set();
  for (const r of rows)
    [...r.inclass, ...r.home, ...(r.homeNext || [])].forEach((n) => allNames.add(n.name ?? n));
  const toMake = [...allNames].filter((n) => !itemByName.has(n));
  const createdItems = [];
  if (toMake.length) {
    const guessCat = (n) =>
      /단어/.test(n) ? "단어"
      : /문법/.test(n) ? "문법"
      : /노트/.test(n) ? "노트"
      : /내신/.test(n) ? "내신"
      : /step|예습|독해|해석/i.test(n) ? "독해"
      : "기타";
    const { data: made, error: mkErr } = await supabase
      .from("homework_items")
      .insert(toMake.map((n, i) => ({ name: n, category: guessCat(n), active: true, sort: 900 + i })))
      .select("id, name");
    if (mkErr) return { error: `학습항목 만들다 실패: ${mkErr.message}` };
    (made || []).forEach((i2) => {
      itemByName.set(i2.name.trim(), i2.id);
      createdItems.push(i2.name);
    });
  }

  const skippedHasRoutine = [];
  const missingItems = new Set();
  let addedSteps = 0;
  let bookCount = 0;

  for (const [bid, list] of byBook) {
    const isArea = String(bid).startsWith("area:");
    const areaName = isArea ? String(bid).slice(5) : null;
    // 이미 루틴이 있으면 건너뛴다 (위 주석의 까닭)
    const { data: has } = isArea
      ? await supabase.from("routine_steps").select("id").eq("area", areaName).limit(1)
      : await supabase.from("routine_steps").select("id").eq("textbook_id", bid).limit(1);
    if ((has || []).length > 0) {
      skippedHasRoutine.push(isArea ? `영역:${areaName}` : (books || []).find((b) => b.id === bid)?.name || "교재");
      continue;
    }
    const stepRows = [];
    list.forEach((r, i) => {
      // 항목별 주의사항 (0139) — 이름[주의] 의 대괄호가 여기 모인다
      const item_notes = {};
      const toIds = (names) =>
        names
          .map((n) => {
            const name = n.name ?? n;
            const id = itemByName.get(name);
            if (!id) missingItems.add(name);
            else if (n.note) item_notes[id] = n.note;
            return id;
          })
          .filter(Boolean);
      const inclass_items = toIds(r.inclass);
      const home_items = toIds(r.home);
      const home_next = toIds(r.homeNext || []);
      // 하나도 못 이었으면 그 단계는 안 넣는다 (빈 단계는 일만 늘린다 — seed 와 같은 규칙)
      if (inclass_items.length === 0 && home_items.length === 0 && home_next.length === 0) return;
      stepRows.push({
        textbook_id: isArea ? null : bid,
        ...(isArea ? { area: areaName } : {}),
        sort: r.sort !== null && r.sort !== undefined ? r.sort * 10 : (i + 1) * 10,
        label: r.label || "",
        inclass_items,
        home_items,
        home_next,
        item_notes,
        round: r.round ?? null,
      });
    });
    if (stepRows.length === 0) continue;
    let { error } = await supabase.from("routine_steps").insert(stepRows);
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // 0139 전 — 항목별 주의사항 없이
      ({ error } = await supabase
        .from("routine_steps")
        .insert(stepRows.map(({ item_notes, ...r2 }) => r2)));
    }
    if (error && isArea) {
      return { error: "영역 루틴은 0137 SQL 을 먼저 실행해야 넣을 수 있어요." };
    }
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // 0136 전 — 예습 숙제 칸 없이
      ({ error } = await supabase
        .from("routine_steps")
        .insert(stepRows.map(({ home_next, ...r2 }) => r2)));
    }
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // 0135 전 — 회독 칸도 없이
      ({ error } = await supabase
        .from("routine_steps")
        .insert(stepRows.map(({ home_next, round, ...r2 }) => r2)));
    }
    if (error) {
      if (needSql(error)) return { error: NEED };
      return { error: error.message };
    }
    addedSteps += stepRows.length;
    bookCount += 1;
  }

  revalidatePath("/textbooks");
  revalidatePath("/today");
  return {
    error: null,
    bookCount,
    addedSteps,
    missingBooks: [...missingBooks],
    missingItems: [...missingItems],
    createdItems,
    skippedHasRoutine,
  };
}

/** 지금 들어 있는 루틴 내려받기 — 양식 그대로 (교재명 · 순서 · 이름 · 등원 · 숙제) */
export async function exportRoutines() {
  const supabase = createClient();
  let [{ data: steps, error }, { data: books }, { data: items }] = await Promise.all([
    supabase.from("routine_steps").select("textbook_id, sort, label, inclass_items, home_items, round, home_next").order("sort", { ascending: true }),
    supabase.from("textbooks").select("id, name"),
    supabase.from("homework_items").select("id, name"),
  ]);
  if (error) {
    // 0136 전 — 예습 칸 없이
    ({ data: steps, error } = await supabase
      .from("routine_steps")
      .select("textbook_id, sort, label, inclass_items, home_items, round")
      .order("sort", { ascending: true }));
  }
  if (error) {
    // 0135 전 — 회독 칸도 없이
    ({ data: steps, error } = await supabase
      .from("routine_steps")
      .select("textbook_id, sort, label, inclass_items, home_items")
      .order("sort", { ascending: true }));
  }
  if (error) return { error: error.message, rows: [] };
  const bookName = new Map((books || []).map((b) => [b.id, b.name]));
  const itemName = new Map((items || []).map((i) => [i.id, i.name]));
  const names = (ids) => (ids || []).map((id) => itemName.get(id)).filter(Boolean).join(" · ");
  const sorted = [...(steps || [])].sort((a, b) =>
    (bookName.get(a.textbook_id) || "").localeCompare(bookName.get(b.textbook_id) || "", "ko") ||
    (a.sort || 0) - (b.sort || 0)
  );
  const rows = sorted.map((s2, i) => {
    const prev = sorted[i - 1];
    const sameBook = prev && prev.textbook_id === s2.textbook_id;
    return [
      sameBook ? "" : bookName.get(s2.textbook_id) || "",
      Math.round((s2.sort || 0) / 10) || "",
      s2.label || "",
      names(s2.inclass_items),
      names(s2.home_items),
      s2.round || "",
      names(s2.home_next),
    ];
  });
  return { error: null, rows };
}
