"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { needSql } from "@/lib/sqlError";
import { templateFor, buildSteps, TEMPLATE_AREAS } from "@/lib/routineTemplates";

const NEED = "0035 SQL 을 먼저 실행해주세요.";
/**
 * 이 교재의 루틴 (한 줄 = 한 수업 회차).
 *
 * **영역 루틴도 같은 함수로** (2026-08-21 — 원장님 「수정·삭제 가능하게
 * 해줘」). textbookId 없이 area(문법·영작…)를 주면 그 영역의 공통 루틴을
 * 그대로 내어준다 — 편집기 하나가 교재·영역 두 갈래를 다 다룬다 (원칙 1).
 */
export async function listRoutine(textbookId, area = null) {
  if (!textbookId && !area) return { steps: [], ready: true, error: null };
  const supabase = createClient();
  if (!textbookId && area) {
    const { data, error } = await supabase
      .from("routine_steps")
      .select("id, sort, label, inclass_items, home_items, home_next, note, round")
      .eq("area", area).is("textbook_id", null)
      .order("sort", { ascending: true });
    if (needSql(error) || error?.code === "42703")
      return { steps: [], ready: false, error: "영역 루틴은 0137 SQL 을 먼저 실행해주세요." };
    if (error) return { steps: [], ready: true, error: error.message };
    return { steps: data || [], ready: true, error: null };
  }
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
        .eq("area", bk.area).is("textbook_id", null)
        .order("sort", { ascending: true });
      if (!aq.error && (aq.data || []).length > 0) {
        return { steps: aq.data, ready: true, inherited: bk.area, error: null };
      }
    }
  }
  return { steps: data || [], ready: true, error: null };
}

/** 단계 저장 — textbookId 대신 area 를 주면 영역 루틴 단계다 (0137 · 2026-08-21) */
export async function saveStep(textbookId, step, area = null) {
  if (!textbookId && !area) return { error: "교재가 없어요." };
  const supabase = createClient();
  const row = {
    textbook_id: textbookId || null,
    ...(area && !textbookId ? { area } : {}),
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
  // 여기까지 왔는데도 칸이 없다면 영역 칸(0137) 자체가 없는 DB 다
  if (error && area && !textbookId && (error.code === "42703" || error.code === "PGRST204"))
    return { error: "영역 루틴은 0137 SQL 을 먼저 실행해야 저장할 수 있어요." };
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
  let { data: gone, error: gErr } = await supabase
    .from("routine_steps")
    .select("id, textbook_id, area, sort")
    .eq("id", id)
    .maybeSingle();
  if (gErr) {
    // 0137 전 — 영역 칸 없이
    ({ data: gone } = await supabase
      .from("routine_steps")
      .select("id, textbook_id, sort")
      .eq("id", id)
      .maybeSingle());
  }
  if (gone) {
    // 영역 루틴 단계(0137)는 형제를 영역으로 찾는다 — 교재 칸이 비어 있다
    const sibling = gone.textbook_id
      ? supabase.from("routine_steps").select("id, sort").eq("textbook_id", gone.textbook_id)
      : supabase.from("routine_steps").select("id, sort").eq("area", gone.area).is("textbook_id", null);
    const { data: list } = await sibling.order("sort", { ascending: true });
    const rest = (list || []).filter((x) => x.id !== id);
    const next =
      rest.find((x) => x.sort > gone.sort) || rest[0] || null;   // 다음 → 없으면 처음
    // 영역 단계는 여러 교재의 학생이 딛고 있을 수 있어 교재로 못 좁힌다 —
    // 이 단계 id 를 기억하는 줄 전부를 옮긴다
    let move = supabase
      .from("student_textbooks")
      .update({ routine_step_id: next?.id || null })
      .eq("routine_step_id", id);
    if (gone.textbook_id) move = move.eq("textbook_id", gone.textbook_id);
    move = await move;
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
/**
 * **영역 루틴을 이 교재로 복사해 온다** (원장님 2026-08-24 — 「영역루틴 먼저
 * 짜고, 교재가 생겼을 때 영역루틴을 그대로 추가할지 수정할지 더 추가할지
 * 정하고, 그 다음에 학생별 루틴을 배정하는 게 맞는 거 같아」).
 *
 * 여태는 이 자리가 **함정**이었다. 영역 루틴을 따르는 교재에서 「＋ 단계
 * 추가」 를 누르면, 그 순간 교재 루틴(1단계)이 생기고 교재가 영역보다
 * 우선이므로 **영역의 나머지 단계가 통째로 사라졌다.** 더하려다 지운 셈이다.
 *
 * 그래서 갈래를 눈에 보이게 셋으로 나눈다:
 *   ① 영역 루틴 그대로   — 아무것도 안 만든다 (지금까지의 기본)
 *   ② 가져와서 고치기     — 이 함수. 영역 단계를 그대로 복사한 뒤 고친다
 *   ③ 처음부터 따로 짜기  — 빈 채로 시작
 */
export async function copyAreaRoutine(textbookId) {
  if (!textbookId) return { error: "교재가 없어요." };
  const supabase = createClient();
  const { data: bk } = await supabase
    .from("textbooks").select("area, name").eq("id", textbookId).maybeSingle();
  if (!bk?.area) return { error: "이 교재에 영역이 안 적혀 있어요 — 교재 정보에서 영역을 먼저 정해주세요." };

  // 이미 제 루틴이 있으면 덮지 않는다 — 손으로 짜두신 것을 지우면 안 된다
  const { data: mine } = await supabase
    .from("routine_steps").select("id").eq("textbook_id", textbookId).limit(1);
  if ((mine || []).length > 0) return { error: "이 교재는 이미 제 진도루틴이 있어요." };

  let aq = await supabase
    .from("routine_steps")
    .select("sort, label, inclass_items, home_items, home_next, note, round")
    .eq("area", bk.area).is("textbook_id", null)
    .order("sort", { ascending: true });
  if (aq.error) {
    aq = await supabase
      .from("routine_steps")
      .select("sort, label, inclass_items, home_items")
      .eq("area", bk.area).is("textbook_id", null)
      .order("sort", { ascending: true });
  }
  const src = aq.data || [];
  if (src.length === 0) return { error: `「${bk.area}」 영역 루틴이 아직 없어요 — 영역 루틴을 먼저 짜주세요.` };

  const rows = src.map((x) => ({ ...x, textbook_id: textbookId, area: null }));
  let { error } = await supabase.from("routine_steps").insert(rows);
  if (error) {
    // 옛 DB — 회독·예습 칸 없이 한 번 더
    const bare = rows.map(({ round, home_next, ...rest }) => rest);
    ({ error } = await supabase.from("routine_steps").insert(bare));
  }
  if (error) return { error: error.message };
  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: null, added: src.length, area: bk.area };
}

export async function seedRoutine(textbookId, area = null) {
  if (!textbookId && !area) return { error: "교재가 없어요." };
  const supabase = createClient();

  // 영역 루틴(0137)도 같은 본보기로 — 영역 이름이 곧 본보기 갈래다 (2026-08-21)
  let seedArea = area;
  if (textbookId) {
    const { data: book, error: bErr } = await supabase
      .from("textbooks").select("id, name, area").eq("id", textbookId).maybeSingle();
    if (bErr) return { error: bErr.message };
    if (!book) return { error: "교재를 못 찾았어요." };
    seedArea = book.area;
  }

  const steps = templateFor(seedArea);
  if (!steps) {
    return {
      error:
        `「${seedArea || "영역 없음"}」 는 본보기가 아직 없어요. `
        + (textbookId
          ? `교재의 영역을 ${TEMPLATE_AREAS.join(" · ")} 중 하나로 정해주시면 넣어드립니다.`
          : `본보기가 있는 영역: ${TEMPLATE_AREAS.join(" · ")}`),
    };
  }

  const { data: had } = textbookId
    ? await supabase.from("routine_steps").select("id").eq("textbook_id", textbookId).limit(1)
    : await supabase.from("routine_steps").select("id").eq("area", area).is("textbook_id", null).limit(1);
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
    .insert(filled.map((r) => ({
      ...r,
      textbook_id: textbookId || null,
      ...(textbookId ? {} : { area }),
    })));
  if (error && !textbookId && (error.code === "42703" || error.code === "PGRST204"))
    return { error: "영역 루틴은 0137 SQL 을 먼저 실행해야 넣을 수 있어요." };
  if (needSql(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: null, added: filled.length, area: seedArea, missing };
}

/**
 * 루틴 엑셀 올리기 (원장님, 2026-08-14). 한 줄 = 한 수업 회차.
 *
 * **이미 루틴이 있는 교재는 통째로 건너뛰고 알려준다** — 화면에서 고친
 * 루틴을 자동이 덮으면 대전제 2(원장님이 손댄 것은 자동이 절대 덮지 않는다,
 * docs/업무루틴-규칙.md) 위반이고, 돌고 있는 학생들의 단계 id(0120)도 끊긴다.
 * 항목 이름을 못 찾으면 그 항목만 빠지고 무엇이 빠졌는지 알려준다.
 *
 * **force** (2026-08-21) — 원장님이 「덮어쓰기」 를 명시적으로 체크했을 때만,
 * 올린 파일에 있는 교재·영역의 기존 루틴을 지우고 새로 심는다. 자동이 아니라
 * 원장님 손이므로 대전제 2 와 어긋나지 않는다. 지운 단계를 딛고 있던 학생
 * 기억(routine_step_id)은 비운다 — nextRoutine 이 번호 폴백으로 잇는다.
 */
export async function bulkAddRoutines(rows = [], force = false) {
  if (!Array.isArray(rows) || rows.length === 0) return { error: "올릴 줄이 없어요." };
  const supabase = createClient();

  const [{ data: books }, { data: items }] = await Promise.all([
    supabase.from("textbooks").select("id, name"),
    // active 안 거른다 (2026-08-21 — 「duplicate key homework_items_name_key」).
    // 숨긴 항목과 같은 이름을 「없다」 고 보고 새로 만들다 유니크에 부딪혔다
    supabase.from("homework_items").select("id, name, active"),
  ]);
  const bookByName = new Map((books || []).map((b) => [b.name.trim(), b.id]));
  const itemByName = new Map((items || []).map((i) => [i.name.trim(), i.id]));
  // 숨겨져 있던 항목을 루틴이 다시 쓰면 되살린다 — 루틴에 있는데 목록에
  // 안 보이면 「항목이 없다」 로 읽히기 때문
  const inactiveByName = new Map(
    (items || []).filter((i) => i.active === false).map((i) => [i.name.trim(), i.id])
  );

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
  // 루틴이 쓰는 숨김 항목은 다시 켠다
  const revive = [...allNames].filter((n) => inactiveByName.has(n)).map((n) => inactiveByName.get(n));
  if (revive.length) {
    await supabase.from("homework_items").update({ active: true }).in("id", revive);
  }
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
  const replaced = [];
  const missingItems = new Set();
  let addedSteps = 0;
  let bookCount = 0;

  for (const [bid, list] of byBook) {
    const isArea = String(bid).startsWith("area:");
    const areaName = isArea ? String(bid).slice(5) : null;
    const targetLabel = isArea
      ? `영역:${areaName}`
      : (books || []).find((b) => b.id === bid)?.name || "교재";
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
    // 넣을 것이 없으면 여기서 끝 — **지우기보다 먼저 확인한다.** 파일이
    // 비었는데 기존 루틴부터 지우면, 덮어쓰기가 아니라 그냥 삭제가 된다
    if (stepRows.length === 0) continue;

    // 이미 루틴이 있으면 건너뛴다 (위 주석의 까닭 — 대전제 2)
    const { data: has } = isArea
      ? await supabase.from("routine_steps").select("id").eq("area", areaName).is("textbook_id", null).limit(1)
      : await supabase.from("routine_steps").select("id").eq("textbook_id", bid).limit(1);
    if ((has || []).length > 0) {
      if (!force) {
        skippedHasRoutine.push(targetLabel);
        continue;
      }
      // force — 원장님이 명시한 덮어쓰기만. 기존 단계를 지우고 학생 기억을 비운다
      const { data: goneIds, error: delErr } = isArea
        ? await supabase.from("routine_steps").delete().eq("area", areaName).is("textbook_id", null).select("id")
        : await supabase.from("routine_steps").delete().eq("textbook_id", bid).select("id");
      if (delErr) return { error: `「${targetLabel}」 기존 루틴 지우기 실패: ${delErr.message}` };
      if ((goneIds || []).length) {
        const clear = await supabase
          .from("student_textbooks")
          .update({ routine_step_id: null })
          .in("routine_step_id", goneIds.map((g) => g.id));
        // 0120 전이면 칸이 없다 — 비울 것도 없으니 조용히 지나간다
        if (clear.error && clear.error.code !== "42703" && clear.error.code !== "PGRST204")
          return { error: clear.error.message };
      }
      replaced.push(targetLabel);
    }
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
    replaced,
  };
}

/** 지금 들어 있는 루틴 내려받기 — 양식 그대로 (교재명 · 순서 · 이름 · 등원 · 숙제) */
export async function exportRoutines() {
  const supabase = createClient();
  let [{ data: steps, error }, { data: books }, { data: items }] = await Promise.all([
    supabase.from("routine_steps").select("textbook_id, area, sort, label, inclass_items, home_items, round, home_next").order("sort", { ascending: true }),
    supabase.from("textbooks").select("id, name"),
    supabase.from("homework_items").select("id, name"),
  ]);
  if (error) {
    // 0137 전 — 영역 칸 없이
    ({ data: steps, error } = await supabase
      .from("routine_steps")
      .select("textbook_id, sort, label, inclass_items, home_items, round, home_next")
      .order("sort", { ascending: true }));
  }
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
  // 영역 루틴 줄은 교재명 칸에 「영역:문법」 — 올리기가 읽는 표기 그대로.
  // 내려받은 파일이 그대로 다시 올라가야 왕복이 성립한다 (원칙 1)
  const labelOf = (s2) => (s2.textbook_id ? bookName.get(s2.textbook_id) || "" : `영역:${s2.area || ""}`);
  const keyOf = (s2) => s2.textbook_id || `area:${s2.area || ""}`;
  const sorted = [...(steps || [])].sort((a, b) =>
    labelOf(a).localeCompare(labelOf(b), "ko") || (a.sort || 0) - (b.sort || 0)
  );
  const rows = sorted.map((s2, i) => {
    const prev = sorted[i - 1];
    const sameBook = prev && keyOf(prev) === keyOf(s2);
    return [
      sameBook ? "" : labelOf(s2),
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
