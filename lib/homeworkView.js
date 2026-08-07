/**
 * 수업 기록 · 숙제를 읽어오는 **한 곳.**
 *
 * 학생 화면(/me)과 학부모 화면(/parent)이 같은 숙제를 보여줘야 한다.
 * 집에서 어머니가 「오늘 숙제 뭐야」 를 물을 때 두 화면이 다른 것을 보여주면
 * 그 자리에서 다투게 된다. 그래서 읽는 코드를 두 군데 두지 않는다 (원칙1).
 *
 * 여기 있는 함수들은 전부 **없는 칸을 견딘다.** SQL 이 밀려 있어도 화면은
 * 그대로 열려야 하기 때문이다 — 새 칸이 없으면 그 값만 빠지고 나머지는 뜬다.
 * (실제로 「0037 전」·「0087 전」 같은 상태로 몇 주를 쓰신 적이 있다)
 */

/** 학생·학부모 화면이 함께 쓰는 수업 기록 칸 */
export const REPORT_COLS =
  "id, date, own_progress, notice, word_correct, word_total, sent_correct, sent_total";

/**
 * 최근 수업 기록.
 *
 * **미래 날짜는 안 읽는다.** 노션에서 연도 없는 "12/30" 을 올해로 붙여 들여온
 * 적이 있어서, 지난주에 수업하고도 「최근 수업 12월 30일」 이 떴다. 들여오기는
 * 고쳤지만 이미 들어간 것이 있을 수 있으므로 읽을 때도 오늘까지만 본다.
 */
export async function loadReports(supabase, studentId, todayStr, limit = 6) {
  const q = (cols) =>
    supabase
      .from("daily_reports")
      .select(cols)
      .eq("student_id", studentId)
      .lte("date", todayStr)
      .order("date", { ascending: false })
      .limit(limit);

  let { data, error } = await q(`${REPORT_COLS}, phone_in, homework_in, word_when`);
  if (error) {
    // 0037 전이면 등원 절차 칸이 없다
    ({ data } = await q(REPORT_COLS));
  }
  return data || [];
}

/** 그 기록들에 붙어 있는 숙제 줄 */
export async function loadReportItems(supabase, reportIds = []) {
  if (!reportIds.length) return [];
  const BASE = "id, daily_report_id, homework_item_id, status";
  const q = (cols) =>
    supabase.from("daily_report_items").select(cols).in("daily_report_id", reportIds);

  let { data, error } = await q(
    `${BASE}, textbook_unit_id, textbook_unit_ids, range_note, student_done_at, changed_at`
  );
  if (error) {
    // 0087·0034 전이면 「바뀐 시각」·「학생 완료」 칸이 없다
    ({ data, error } = await q(`${BASE}, textbook_unit_id, textbook_unit_ids, range_note`));
  }
  if (error) {
    // 0008·0009 전이면 단원 칸이 없다
    ({ data } = await q(BASE));
  }
  return data || [];
}

/** 학습 항목 (이름 · 학습 방법 · 영역) — id 로 찾아 쓴다 */
export async function loadHomeworkItems(supabase) {
  const q = (cols) => supabase.from("homework_items").select(cols);

  // unit_test 는 0106 에서 붙는다 — 없으면 그 앞 것으로 물러난다
  let { data, error } = await q(
    "id, name, category, method, sort, no_timer, word_test, checklist, in_person, unit_test"
  );
  if (error) ({ data, error } = await q("id, name, category, method, sort, no_timer, word_test, checklist, in_person"));
  if (error) ({ data, error } = await q("id, name, category, method, sort, no_timer, word_test, checklist"));
  if (error) ({ data, error } = await q("id, name, category, method, sort"));
  if (error) ({ data } = await q("id, name, category"));
  return new Map((data || []).map((i) => [i.id, i]));
}

/** 이 숙제 줄에 붙은 단원 id 들 — 여러 개일 수도, 하나일 수도, 없을 수도 있다 */
export function unitIdsOf(x) {
  if (x?.textbook_unit_ids?.length) return x.textbook_unit_ids;
  return x?.textbook_unit_id ? [x.textbook_unit_id] : [];
}

/**
 * 단원 이름을 **읽을 수 있는 한 줄**로 — 「리딩튜터 Chapter 2 Unit 5 30~35p」.
 *
 * 위 단원 이름까지 거슬러 올라가 붙인다. 「Unit 5」 만 있으면 무슨 책의 5과인지
 * 알 수가 없다 — 어머니는 특히 모르신다.
 */
export async function loadUnitLabels(supabase, dri = []) {
  const unitIds = new Set();
  dri.forEach((x) => unitIdsOf(x).forEach((id) => unitIds.add(id)));
  const out = new Map();
  if (unitIds.size === 0) return out;

  const { data: picked } = await supabase
    .from("textbook_units")
    .select("id, textbook_id")
    .in("id", [...unitIds]);
  const bookIds = [...new Set((picked || []).map((u) => u.textbook_id))];
  if (!bookIds.length) return out;

  const { data: all } = await supabase
    .from("textbook_units")
    .select("id, name, parent_id, textbook_id, page_start, page_end")
    .in("textbook_id", bookIds);
  const { data: bookRows } = await supabase.from("textbooks").select("id, name").in("id", bookIds);

  const bookName = new Map((bookRows || []).map((b) => [b.id, b.name]));
  const byId = new Map((all || []).map((u) => [u.id, u]));

  (all || [])
    .filter((u) => unitIds.has(u.id))
    .forEach((u) => {
      const chain = [];
      let cur = u;
      const seen = new Set();          // 부모가 돌고 있으면 여기서 멈춘다
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        chain.unshift(cur.name);
        cur = cur.parent_id ? byId.get(cur.parent_id) : null;
      }
      const pages = u.page_start && u.page_end ? ` ${u.page_start}~${u.page_end}p` : "";
      out.set(u.id, `${bookName.get(u.textbook_id) || ""} ${chain.join(" ")}${pages}`.trim());
    });
  return out;
}

/** 숙제 줄 하나를 화면이 쓰는 모양으로 */
export function makeCard(itemById, unitLabel) {
  return (x) => {
    const item = itemById.get(x.homework_item_id);
    return {
      key: `${x.daily_report_id}-${x.homework_item_id}-${x.status}`,
      reportItemId: x.id,
      doneAt: x.student_done_at || null,
      itemId: x.homework_item_id,
      name: item?.name || "숙제",
      method: item?.method || "",
      checklist: (item?.checklist || "").split("\n").map((t) => t.trim()).filter(Boolean),
      units: unitIdsOf(x).map((id) => unitLabel.get(id)).filter(Boolean),
      note: x.range_note || "",
      status: x.status,
      // 처음 받은 숙제가 아니라 **나중에 더하거나 고친 것** (0087).
      // 비어 있으면 그날 원래 받은 것이라 표시하지 않는다.
      changedAt: x.changed_at || null,
      area: item?.category || "",
    };
  };
}

/**
 * 지금 해야 할 숙제는 **가장 최근에 배정한 것**이다.
 *
 * 예전에는 「가장 최근 리포트」 만 봤다. 그런데 등원해서 출결을 찍으면 그날
 * 리포트가 새로 생기고, 그 순간 지난 수업에 낸 숙제가 통째로 사라졌다 —
 * 아직 검사도 안 했는데. 그래서 **숙제가 붙어 있는 가장 최근 리포트**를 찾는다.
 *
 * @returns { from, rows }  from = 그 숙제를 낸 수업 기록 (없으면 null)
 */
export function pickAssigned(reports = [], dri = []) {
  const from = reports.find((r) =>
    dri.some((x) => x.daily_report_id === r.id && x.status === "assigned")
  );
  if (!from) return { from: null, rows: [] };
  return {
    from,
    rows: dri.filter((x) => x.daily_report_id === from.id && x.status === "assigned"),
  };
}

/** 숙제 검사 결과를 세어 준다 — 「완료 3 · 보충 1」 */
export const CHECK_LABEL = { done: "완료", weak: "보충 필요", missing: "미완료" };

export function checkCounts(rows = []) {
  const n = { done: 0, weak: 0, missing: 0 };
  rows.forEach((r) => {
    if (n[r.status] !== undefined) n[r.status] += 1;
  });
  return n;
}
