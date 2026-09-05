/** 루틴 깔기 — 읽고 넣는 손(DB). 판단은 lib/routine-plan.js(순수) 한 벌, 여기는 표를 읽어 넘기고 결과를 넣는다.
 *  언제 까나(확정-⑨): 판의 검사 줄이 다 검사됐을 때(lib/homework.js checkItem 이 부른다) · 검사 줄이 애초에 없으면 판이 설 때(lib/day.js).
 *  한 번 깔린 교재는 다시 안 깐다(v2.sheet_book.laid_at). 깔린 줄은 지우지 않는다 — 뺄 때는 off 로 내린다(대전제-6 · 검사-⑩).
 *  층: 판 읽기 → [배정·교재 ∥ 판×교재] → [교재마다 todo_units ∥ 학생루틴 ∥ 영역루틴] → 대단원 소단원(눈금) → [줄 넣기 ∥ 판×교재 넣기] = 5단, 검사가 끝나는 그 한 번 */
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { planBook, stopOn, offFor, waves, tuneUnits, PLACE_OF, STOP, MODE } from "./routine-plan.js";
import { ruleInt } from "./rule.js";
export { STOP, MODE };
const alive = (q, date) => q.lte("from_date", date).or(`to_date.is.null,to_date.gte.${date}`);
const isAuto = (it) => it.item_id && !it.carry_of;   // 루틴이 깐 줄 — 손으로 더한 줄(item_id 없음)·나머지 줄(carry_of)은 아니다

/** 오늘 이 아이들의 배정 교재(살아 있는 것) — 화면의 교재 머리(상태 세그먼트)와 깔기가 같이 쓴다 */
export async function booksOf(sb, studentIds, date) {
  if (!studentIds.length) return [];
  const { data, error } = await alive(db(sb).from("student_book").select("id,student_id,book_id,round,per_session,stop_mode,stop_until,order_basis,books!inner(id,name,area,order_basis,state)"), date)
    .in("student_id", studentIds).order("from_date", { ascending: false });
  if (error) throw new Error(`배정 교재를 못 읽음: ${error.message}`);
  const seen = new Set(), out = [];
  for (const r of data ?? []) { const k = `${r.student_id}|${r.book_id}`; if (seen.has(k)) continue; seen.add(k); out.push(r); }   // 같은 교재가 두 기간이면 최근 배정 하나
  return out;
}
/** 루틴 줄 — 학생루틴(그 영역에 있으면 그것 전부)이 없으면 영역루틴(확정-㉒). 학생루틴 줄은 다 필수로 친다(고른 것이니까) */
async function linesOf(sb, studentId, areas) {
  const [sr, ar] = await Promise.all([
    db(sb).from("student_routine").select("area,item_id,place,sort,learn_items!inner(name,state)").eq("student_id", studentId).in("area", areas).eq("learn_items.state", "active"),
    db(sb).from("area_routine").select("area,item_id,place,required,sort,learn_items!inner(name,state)").in("area", areas).eq("learn_items.state", "active"),
  ]);
  if (sr.error) throw new Error(`학생 루틴을 못 읽음: ${sr.error.message}`);
  if (ar.error) throw new Error(`영역 루틴을 못 읽음: ${ar.error.message}`);
  const byArea = {};
  for (const a of areas) {
    const mine = (sr.data ?? []).filter((x) => x.area === a).map((x) => ({ item_id: x.item_id, name: x.learn_items.name, place: x.place, required: true, sort: x.sort }));
    byArea[a] = mine.length ? mine : (ar.data ?? []).filter((x) => x.area === a).map((x) => ({ item_id: x.item_id, name: x.learn_items.name, place: x.place, required: x.required, sort: x.sort }));
  }
  return byArea;
}
async function todoOf(sb, studentId, bookId, date) {
  const { data, error } = await db(sb).rpc("todo_units", { p_student: studentId, p_book: bookId, p_on: date });
  if (error) throw new Error(`안 한 소단원을 못 읽음: ${error.message}`);
  return data ?? [];
}
/** 판 하나에 루틴을 깐다(안 깔린 교재만). 검사가 끝나는 순간 한 번 — 다시 불러도 두 번 깔리지 않는다 */
export async function layRoutine(sb, sheetId) {
  await assertOpen(sb, sheetId);
  const { data: sheet, error } = await db(sb).from("day_sheet").select("id,student_id,date,load_mode").eq("id", sheetId).single();
  if (error || !sheet) throw new Error(`판을 못 읽음: ${error?.message ?? "없음"}`);
  const [books, laid] = await Promise.all([
    booksOf(sb, [sheet.student_id], sheet.date),
    db(sb).from("sheet_book").select("book_id,laid_at").eq("sheet_id", sheetId),
  ]);
  if (laid.error) throw new Error(`판×교재를 못 읽음: ${laid.error.message}`);
  const done = new Set((laid.data ?? []).filter((x) => x.laid_at).map((x) => x.book_id));
  const todoBooks = books.filter((b) => !done.has(b.book_id));
  if (!todoBooks.length) return { laid: 0 };
  const areas = [...new Set(todoBooks.map((b) => b.books.area).filter(Boolean))];
  const [lines, ...todos] = await Promise.all([linesOf(sb, sheet.student_id, areas), ...todoBooks.map((b) => todoOf(sb, sheet.student_id, b.book_id, sheet.date))]);
  const plans = todoBooks.map((b, i) => planBook({ lines: lines[b.books.area] ?? [], todo: todos[i], sb: b, mode: "all", date: sheet.date }));
  // 회차 고르기 눈금 — 이 대단원의 소단원 이름·차례(지난 것 다시 · 하나 더)를 한 번 읽는다. 대단원을 안 넘는다(확정-④)
  const chapters = await Promise.all(plans.map((plan, i) => plan.units.length
    ? db(sb).from("units").select("id,chapter,sort,short,code").eq("book_id", todoBooks[i].book_id).eq("chapter", plan.units[0].chapter).eq("state", "active").order("sort")
    : { data: [], error: null }));
  const rows = [], marks = [];
  todoBooks.forEach((b, i) => {
    const plan = plans[i], ctx = { stop: plan.stop, mode: sheet.load_mode };
    if (chapters[i].error) throw new Error(`대단원 소단원을 못 읽음: ${chapters[i].error.message}`);
    const named = new Map((chapters[i].data ?? []).map((u) => [u.id, u]));
    const name = (u) => { const x = named.get(u.unit_id ?? u.id); return { unit_id: u.unit_id ?? u.id, code: x?.code ?? "?", short: x?.short ?? "?" }; };
    const units = plan.units.map(name), todoHere = todos[i].filter((u) => plan.units.length && u.chapter === plan.units[0].chapter).map(name);
    const first = named.get(plan.units[0]?.unit_id), prev = first ? (chapters[i].data ?? []).filter((u) => u.sort < first.sort).at(-1) : null;
    const w = plan.units.length ? waves({ units, todo: todoHere, done: prev ? name(prev) : null }) : { class: [], home: [] };
    let sort = 0;
    for (const [slot, ls] of [["class", plan.class], ["home", plan.home]]) for (const l of ls) for (const u of plan.units)
      rows.push({ sheet_id: sheetId, slot, item_id: l.item_id, unit_id: u.unit_id, sort: ++sort, off: offFor({ slot, required: l.required }, ctx) });
    marks.push({ sheet_id: sheetId, book_id: b.book_id, laid_at: new Date().toISOString(), waves: { ...w, why: plan.why } });
  });
  const [ins, mark] = await Promise.all([
    rows.length ? db(sb).from("day_item").insert(rows) : { error: null },
    db(sb).from("sheet_book").upsert(marks, { onConflict: "sheet_id,book_id" }),
  ]);
  if (ins.error) throw new Error(`오늘 학습·숙제를 못 깔음: ${ins.error.message}`);
  if (mark.error) throw new Error(`깔았다고 못 적음: ${mark.error.message}`);
  return { laid: todoBooks.length, rows: rows.length };
}
/** 판의 자동 줄에 off 를 다시 매긴다 — 줄이기(그대로·필수만)와 교재 상태(진행중·숙제멈춤·교재멈춤)에서. 지우지 않는다 */
async function refreshOff(sb, sheetId) {
  const { data: sheet, error } = await db(sb).from("day_sheet").select("id,student_id,date,load_mode").eq("id", sheetId).single();
  if (error || !sheet) throw new Error(`판을 못 읽음: ${error?.message ?? "없음"}`);
  const [books, items] = await Promise.all([
    booksOf(sb, [sheet.student_id], sheet.date),
    db(sb).from("day_item").select("id,slot,item_id,unit_id,carry_of,off,units(book_id)").eq("sheet_id", sheetId).in("slot", ["class", "home"]),
  ]);
  if (items.error) throw new Error(`판의 줄을 못 읽음: ${items.error.message}`);
  const auto = (items.data ?? []).filter(isAuto);
  if (!auto.length) return 0;
  const areas = [...new Set(books.map((b) => b.books.area).filter(Boolean))];
  const lines = await linesOf(sb, sheet.student_id, areas);
  const bookOf = new Map(books.map((b) => [b.book_id, b]));
  const changes = [];
  for (const it of auto) {
    const b = bookOf.get(it.units?.book_id); if (!b) continue;
    const line = (lines[b.books.area] ?? []).find((l) => l.item_id === it.item_id && PLACE_OF[it.slot].includes(l.place));
    const off = offFor({ slot: it.slot, required: line?.required ?? true }, { stop: stopOn(b, sheet.date), mode: sheet.load_mode });
    if (off !== it.off) changes.push({ id: it.id, off });
  }
  await Promise.all(changes.map((c) => db(sb).from("day_item").update({ off: c.off }).eq("id", c.id).then(({ error: e }) => { if (e) throw new Error(`뺀 줄을 못 씀: ${e.message}`); })));
  return changes.length;
}
/** 줄이기 — 그대로 · 필수만 (판 하나) */
export async function setMode(sb, sheetId, mode) {
  if (!MODE.some(([k]) => k === mode)) throw new Error(`줄이기 값이 아닙니다: ${mode}`);
  await assertOpen(sb, sheetId);
  const { error } = await db(sb).from("day_sheet").update({ load_mode: mode }).eq("id", sheetId);
  if (error) throw new Error(`줄이기를 못 씀: ${error.message}`);
  return refreshOff(sb, sheetId);
}
/** 교재 상태 — 진행중 · 숙제멈춤 · 교재멈춤 (배정 줄에 쓴다, 확정-⑬). 손으로 고르면 기한은 지운다 — 시험에 묶는 것은 교재 화면에서 */
export async function setStop(sb, sheetId, studentBookId, mode) {
  if (!STOP.some(([k]) => k === mode)) throw new Error(`교재 상태 값이 아닙니다: ${mode}`);
  await assertOpen(sb, sheetId);
  const { data, error } = await db(sb).from("student_book").update({ stop_mode: mode, stop_until: null }).eq("id", studentBookId).select("id");
  if (error) throw new Error(`교재 상태를 못 씀: ${error.message}`);
  if (!data?.length) throw new Error("배정 줄이 없거나 고칠 권한이 없습니다");   // 0줄이면 실패(검사-⑪)
  return refreshOff(sb, sheetId);
}
/** 회차 — 이 교재 이 자리의 자동 줄이 가리키는 소단원을 바꾼다(목업 01 회차 세그먼트). 줄마다 소단원 하나 — 늘면 넣고 줄면 off */
export async function pickWave(sb, sheetId, bookId, slot, unitIds) {
  if (!["class", "home"].includes(slot)) throw new Error(`자리가 아닙니다: ${slot}`);
  const ids = [...new Set((unitIds ?? []).filter(Boolean))]; if (!ids.length) throw new Error("고른 소단원이 없습니다");
  await assertOpen(sb, sheetId);
  const { data: items, error } = await db(sb).from("day_item").select("id,item_id,unit_id,carry_of,off,sort,units!inner(book_id)").eq("sheet_id", sheetId).eq("slot", slot).eq("units.book_id", bookId).order("sort");
  if (error) throw new Error(`판의 줄을 못 읽음: ${error.message}`);
  const auto = (items ?? []).filter(isAuto);
  const byLine = new Map(); for (const it of auto) { if (!byLine.has(it.item_id)) byLine.set(it.item_id, []); byLine.get(it.item_id).push(it); }
  const ups = [], ins = [];
  let sort = Math.max(0, ...auto.map((x) => x.sort));
  for (const [itemId, rows] of byLine) {
    ids.forEach((u, k) => { const r = rows[k]; if (r) { if (r.unit_id !== u || r.off) ups.push({ id: r.id, unit_id: u, off: false }); } else ins.push({ sheet_id: sheetId, slot, item_id: itemId, unit_id: u, sort: ++sort }); });
    rows.slice(ids.length).forEach((r) => { if (!r.off) ups.push({ id: r.id, off: true }); });
  }
  const res = await Promise.all([
    ...ups.map((u) => db(sb).from("day_item").update(u.unit_id ? { unit_id: u.unit_id, off: u.off } : { off: u.off }).eq("id", u.id)),
    ins.length ? db(sb).from("day_item").insert(ins) : { error: null },
  ]);
  const bad = res.find((r) => r.error); if (bad) throw new Error(`회차를 못 바꿈: ${bad.error.message}`);
  return { changed: ups.length + ins.length };
}
/** 교재마다 메모 둘(학습·숙제) — 아이 화면에 그대로(확정-⑨a) */
export async function setMemo(sb, sheetId, bookId, slot, text) {
  if (!["class", "home"].includes(slot)) throw new Error(`자리가 아닙니다: ${slot}`);
  await assertOpen(sb, sheetId);
  const col = slot === "class" ? "class_memo" : "home_memo";
  const { error } = await db(sb).from("sheet_book").upsert({ sheet_id: sheetId, book_id: bookId, [col]: String(text ?? "").trim() || null }, { onConflict: "sheet_id,book_id" });
  if (error) throw new Error(`메모를 못 씀: ${error.message}`);
}
/** 조절 모달(02)이 여는 것 — 안 한 소단원(같은 대단원 · 쪽·문항) · 지금 나가는 소단원 · 「이번에」 · 도는 차례 · 오늘 분량 합계(v2.today_load 한 곳) · 조절 몇 번째(규칙 tune.ask_after) · 긴 줄 눈금(규칙 chunk.split_from) · 메모 둘. 읽기만 */
export async function tunePool(sb, sheetId, bookId) {
  const { data: sheet, error } = await db(sb).from("day_sheet").select("id,student_id,date").eq("id", sheetId).single();
  if (error || !sheet) throw new Error(`판을 못 읽음: ${error?.message ?? "없음"}`);
  const [todo, items, books, load, tuned, askAfter, splitFrom, mark] = await Promise.all([
    todoOf(sb, sheet.student_id, bookId, sheet.date),
    db(sb).from("day_item").select("id,slot,unit_id,item_id,carry_of,off,range_note,units!inner(book_id)").eq("sheet_id", sheetId).eq("units.book_id", bookId).in("slot", ["class", "home"]),
    booksOf(sb, [sheet.student_id], sheet.date),
    db(sb).rpc("today_load", { p_student: sheet.student_id, p_on: sheet.date }),
    db(sb).from("sheet_book").select("sheet_id,day_sheet!inner(student_id)").eq("book_id", bookId).eq("day_sheet.student_id", sheet.student_id).not("tuned_at", "is", null),
    ruleInt(sb, "tune.ask_after"), ruleInt(sb, "chunk.split_from"),
    db(sb).from("sheet_book").select("class_memo,home_memo").eq("sheet_id", sheetId).eq("book_id", bookId).maybeSingle(),
  ]);
  if (items.error) throw new Error(`판의 줄을 못 읽음: ${items.error.message}`);
  if (load.error) throw new Error(`오늘 분량을 못 셈: ${load.error.message}`);
  const first = todo[0];
  const { data: units, error: e2 } = first
    ? await db(sb).from("units").select("id,chapter,sort,short,label,page_start,page_end,q_count").eq("book_id", bookId).eq("chapter", first.chapter).eq("state", "active").order("sort")
    : { data: [], error: null };
  if (e2) throw new Error(`소단원을 못 읽음: ${e2.message}`);
  const named = new Map((units ?? []).map((u) => [u.id, u]));
  const pool = todo.filter((u) => first && u.chapter === first.chapter).map((u) => ({ unit_id: u.unit_id, ...(named.get(u.unit_id) ?? { short: "?" }) }));
  const auto = (items.data ?? []).filter(isAuto);
  const current = { class: [...new Set(auto.filter((i) => i.slot === "class" && !i.off).map((i) => i.unit_id))], home: [...new Set(auto.filter((i) => i.slot === "home" && !i.off).map((i) => i.unit_id))] };
  const ranges = Object.fromEntries(auto.filter((i) => i.range_note).map((i) => [i.unit_id, i.range_note]));
  const b = books.find((x) => x.book_id === bookId);
  const l = Array.isArray(load.data) ? load.data[0] : load.data;
  return { chapter: first?.chapter ?? null, round: b?.round ?? 1, orderBasis: b?.order_basis ?? b?.books?.order_basis ?? "sub", books: books.length, pool, current, ranges,
    load: { questions: l?.questions ?? 0, pages: l?.pages ?? 0 }, tuned: tuned.data?.length ?? 0, askAfter, splitFrom, memos: { class: mark.data?.class_memo ?? "", home: mark.data?.home_memo ?? "" } };
}
/** 조절 적용(02 「적용」) — 고른 소단원으로 학습·숙제 둘 다(회차와 같은 손) · 긴 줄의 「이번에」는 그 소단원 줄의 range_note · 메모 둘 · 조절한 때. 뺀 것은 off 로 내린다 */
export async function applyTune(sb, sheetId, bookId, { unitIds, ranges = {}, classMemo, homeMemo }) {
  await assertOpen(sb, sheetId);
  const ids = [...new Set((unitIds ?? []).filter(Boolean))];
  if (!ids.length) throw new Error("소단원을 하나는 두세요 — 다 빼면 이 교재가 오늘 통째로 빕니다");
  await pickWave(sb, sheetId, bookId, "class", ids);
  await pickWave(sb, sheetId, bookId, "home", ids);
  const { data: rows, error } = await db(sb).from("day_item").select("id,unit_id,item_id,carry_of,range_note").eq("sheet_id", sheetId).in("slot", ["class", "home"]).in("unit_id", ids);
  if (error) throw new Error(`판의 줄을 못 읽음: ${error.message}`);
  const ups = (rows ?? []).filter(isAuto).map((r) => ({ id: r.id, range_note: ranges[r.unit_id] ? String(ranges[r.unit_id]).trim() || null : null, was: r.range_note ?? null })).filter((u) => u.range_note !== u.was);
  await Promise.all(ups.map((u) => db(sb).from("day_item").update({ range_note: u.range_note }).eq("id", u.id).then(({ error: e }) => { if (e) throw new Error(`이번에 낼 번호를 못 씀: ${e.message}`); })));
  if (classMemo !== undefined) await setMemo(sb, sheetId, bookId, "class", classMemo);
  if (homeMemo !== undefined) await setMemo(sb, sheetId, bookId, "home", homeMemo);
  const { error: e3 } = await db(sb).from("sheet_book").upsert({ sheet_id: sheetId, book_id: bookId, tuned_at: new Date().toISOString() }, { onConflict: "sheet_id,book_id" });
  if (e3) throw new Error(`조절한 때를 못 적음: ${e3.message}`);
  await refreshOff(sb, sheetId);   // 숙제멈춤·필수만이면 새로 선 줄도 그에 맞게 내린다
  return { units: ids.length };
}
