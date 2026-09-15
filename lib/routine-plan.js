import { daysBetween } from "./dash-plan.js";
import { isUnchecked } from "./status.js";
/** 루틴 깔기 판단 — 순수 함수(DB 없음). 읽고 넣는 손은 lib/routine.js, 검사 check-routine 은 여기만 돌린다.
 *  하루는 셋(확정-⑨): ① 숙제 검사가 방아쇠 → ② 오늘 학습 · ③ 오늘 숙제가 저절로. 루틴 = 학생루틴(고르고 차례 짠 것)이 있으면 그것, 없으면 영역루틴 전부(확정-㉒).
 *  덩어리 = 안 한 소단원 차례(v2.todo_units)에서 같은 대단원 안 per_session 개(루틴 한 바퀴 = 대단원, 확정-④). 숙제는 오늘 학습과 같은 소단원(복습).
 *  교재 상태 셋(확정-⑬): running 진행중 · hw_off 숙제 보류(숙제 줄만 뺀다) · book_off 교재 보류(다 뺀다). stop_from 전이면 아직 진행중(회차에 묶은 것, 06b) · stop_until 이 지났으면 진행중.
 *  줄이기(확정-㊺a · 앱이 밀지 않는다, 원장님이 누른다): all 그대로 · required 필수만. 필수만으로 줄여 한 올린 기록이 통째로 비면 그 올린 기록은 줄이지 않는다(검사-⑩) */
export const STOP = Object.freeze([["running", "진행중"], ["hw_off", "숙제 보류"], ["book_off", "교재 보류"]]);
export const MODE = Object.freeze([["all", "그대로"], ["required", "필수만"]]);
export const PLACE_OF = Object.freeze({ class: ["class", "both"], home: ["home", "both"], next: ["next"] });   // next = 예습 자리(0065) — 숙제로 나가되 다음 소단원
export const PLACE = Object.freeze([["class", "학원"], ["home", "숙제"], ["both", "둘 다"], ["next", "예습"]]);
/** 영역 일곱(v2.area_name)과 그림 — 목업 11. 이름은 DB 도메인과 같다 */
export const AREAS = Object.freeze([["문법", "📐"], ["의미 단위", "🧩"], ["독해", "📖"], ["영작", "✍️"], ["내신", "📝"], ["블록구문", "🧱"], ["단어", "🔤"]]);
export const areaEmo = (a) => AREAS.find(([k]) => k === a)?.[1] ?? "📚";
export const UNIT_TEST = Object.freeze([["per_chapter", "대단원마다"], ["per_n_sub", "소단원 N개마다"]]);
/** 살아 있는 줄만 · 삭제한 줄(retired)은 셈에서 빠진다(확정-㊷ · 0075). 항목 자체가 내려간 것도 */
export const alive = (rows = []) => rows.filter((r) => (r.state ?? "active") === "active" && (r.item_state ?? "active") === "active");
const bySort = (a, b) => a.sort - b.sort;
/** 영역 머리 알약 — 학원 a · 숙제 b · 필수 c */
export function areaStats(lines = []) { const a = alive(lines); return { class: a.filter((l) => PLACE_OF.class.includes(l.place)).length, home: a.filter((l) => PLACE_OF.home.includes(l.place)).length, next: a.filter((l) => l.place === "next").length, required: a.filter((l) => l.required).length }; }
/** 아이의 한 영역 — 학생 루틴 줄이 있으면 그것(이 아이만 고침), 없으면 영역 루틴 그대로(확정-㉒). 뺀 것 = 영역 줄 중 아이 줄에 없는 항목 */
export function studentAreaView(areaLines = [], studentLines = []) {
  const base = alive(areaLines).sort(bySort), mine = alive(studentLines).sort(bySort);
  if (!mine.length) return { custom: false, lines: base, removed: [] };
  return { custom: true, lines: mine, removed: base.filter((b) => !mine.some((m) => m.item_id === b.item_id)) };
}
/** 교재 하나에 쓰는 줄 — 교재 줄(「이 교재만 루틴 다르게」) › 아이 영역 줄 › 학원 영역 줄(확정-㉒ + 4단계-5 교재 예외 · 수강료의 학생 › 반 › 학년과 같은 꼴). 살아 있는 줄만 · 차례대로 */
export function resolveLines(areaLines = [], studentLines = [], bookLines = []) {
  const book = alive(bookLines).sort(bySort); if (book.length) return { source: "book", lines: book };
  const mine = alive(studentLines).sort(bySort); if (mine.length) return { source: "student", lines: mine };
  return { source: "area", lines: alive(areaLines).sort(bySort) };
}
/** 11 의 교재 칸 — 교재 줄이 있으면 그것(이 교재만 고침) · 뺀 것 = 바탕(아이 영역 › 학원 영역) 줄 중 교재 줄에 없는 항목 */
export function bookView(areaLines = [], studentLines = [], bookLines = []) {
  const base = resolveLines(areaLines, studentLines, []).lines, mine = alive(bookLines).sort(bySort);
  if (!mine.length) return { custom: false, lines: base, removed: [] };
  return { custom: true, lines: mine, removed: base.filter((b) => !mine.some((m) => m.item_id === b.item_id)) };
}
/** ▲▼ — 살아 있는 줄 차례에서 이웃과 sort 를 맞바꾼다. 끝이면 빈 것 */
export function moveSort(lines = [], id, dir) {
  const a = alive(lines).sort(bySort); const i = a.findIndex((l) => l.id === id); const j = i + (dir === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= a.length) return [];
  return [{ id: a[i].id, sort: a[j].sort }, { id: a[j].id, sort: a[i].sort }];
}
/** 예습 줄(place next, 0065)의 소단원(확정-57) — 오늘 덩어리 다음의 n 개(대단원을 넘어도 된다 — 다음 것이 다음 것이다). 숙제 자리로 나간다 */
export function previewUnits(todo = [], units = [], n = 1) { const ids = new Set(units.map((u) => u.unit_id)); return todo.filter((u) => !ids.has(u.unit_id)).slice(0, Math.max(1, n | 0)); }
/** 이대로면 — 남은 소단원 ÷ 회차 = 수업 N회 → 앞으로의 수업일 목록에서 그날. { sessions, endDate, months } (수업일이 모자라면 endDate null) */
export function projectEnd({ remaining = 0, perSession = 1, days = [], from }) {
  const sessions = Math.ceil(Math.max(0, remaining) / Math.max(1, perSession | 0));
  const endDate = sessions ? (days[sessions - 1] ?? null) : from;
  const months = endDate && from ? Math.round((daysBetween(from, endDate) / 30.4) * 10) / 10 : null;
  return { sessions, endDate, months };
}
/** 체크리스트 글 → 목록(쉼표·가운뎃점) */
export const parseChecks = (text) => String(text ?? "").split(/[,·\n]/).map((x) => x.trim()).filter(Boolean);
/** 교재 상태 · 날짜를 넣어 「아직 시작 전이면 진행중 · 지났으면 진행중」까지(회차에 묶은 보류는 영어 시험일 − N주 부터, 06b) */
export function stopOn(sb, date) {
  if (!sb || !sb.stop_mode || sb.stop_mode === "running") return "running";
  if (sb.stop_from && String(sb.stop_from) > String(date)) return "running";
  if (sb.stop_until && String(sb.stop_until) < String(date)) return "running";
  return sb.stop_mode;
}
/** 오늘 덩어리 — todo(안 한 소단원 차례) 중 첫 대단원 안에서 n 개 */
export function chunkOf(todo, n = 1) {
  const first = todo[0]; if (!first) return [];
  return todo.filter((u) => u.chapter === first.chapter).slice(0, Math.max(1, n | 0));
}
/** (머) ✕ 받은 단원(원장님 9/5 ④ · 남긴 것 4) — 이 판의 검사 줄에서 ✕(missing) 인 단원, 이 교재 것만, 차례대로 하나씩. 있으면 오늘 학습·숙제의 기본은 「그 단원 다시」 — 회차 세그먼트로 바꿀 수 있다 */
export function redoUnits(checks = [], bookId = null) {
  return [...new Set(checks.filter((c) => c?.status === "missing" && c.unit_id && (!bookId || (c.units?.book_id ?? c.book_id) === bookId)).map((c) => c.unit_id))];
}
/** 자리(학원·숙제) 하나의 줄 — 루틴 줄에서 그 자리 것만, 필수만이면 필수 줄만(비면 줄이지 않는다) */
export function linesFor(lines, place, mode = "all") {
  const here = lines.filter((l) => PLACE_OF[place].includes(l.place)).sort((a, b) => a.sort - b.sort);
  if (mode !== "required") return here;
  const req = here.filter((l) => l.required);
  return req.length ? req : here;
}
/** 교재 하나의 오늘 계획 — { stop, units, class:[줄], home:[줄], why } · 줄 = { item_id, name, required, sort } */
export function planBook({ lines = [], todo = [], sb = null, mode = "all", date }) {
  const stop = stopOn(sb, date);
  // ⚠️ 세 유형이 **같은 꼴**로 나가야 한다 · 깔기(lib/routine.js)가 class·home·next·preview 를 그냥 훑는다.
  //    2026-09-11 「첫 주 돌려보기」에서 잡힘: 멈춘 교재·할 것 없는 교재는 next·preview 가 없어서
  //    `undefined is not iterable` 로 **판이 아예 안 서고**, 원장님 화면에는 뜻 모를 영어 한 줄만 떴다.
  const 빈 = { units: [], class: [], home: [], next: [], preview: [] };
  if (stop === "book_off") return { stop, ...빈, why: "교재 보류" };
  const units = chunkOf(todo, sb?.per_session ?? 1);
  if (!units.length) return { stop, ...빈, units, why: "안 한 소단원이 없다" };
  const cls = linesFor(lines, "class", mode), home = stop === "hw_off" ? [] : linesFor(lines, "home", mode), next = stop === "hw_off" ? [] : linesFor(lines, "next", mode);
  return { stop, units, preview: previewUnits(todo, units, sb?.per_session ?? 1), class: cls, home, next, why: !cls.length && !home.length && !next.length ? "루틴 줄이 없다" : null };
}
/** (어38) 오늘 단원 세그의 말 · 단원 부호(S2·S2)가 아니라 뜻으로(원장님 9/15 「s2 s다시 이게 대체 무슨 말이야 … 지난 단원 이번 단원 뭐 이렇게 쓰던가」). 어느 단원인지는 바로 밑 단원 머리가 말한다.
 *  저장된 판(sheet_book.waves)의 옛 이름(부호)은 화면이 안 쓰고 key 로 다시 말한다 */
export const WAVE_NAME = Object.freeze({ again: "지난 단원 다시", redo: "✕ 받은 단원 다시", now: "이번 단원", more: "하나 더", review: "이번 단원 복습", next: "다음 단원만" });
export const waveLabel = (o) => (o?.key === "again" && o?.redo ? WAVE_NAME.redo : WAVE_NAME[o?.key] ?? o?.name ?? "?");
/** 오늘 단원 고르기 · 학습: (다시 ·) 이번 단원 · 하나 더 / 숙제: (다시 ·) 이번 단원 복습 · 하나 더 · 다음 단원만 (목업 01 + (머) 숙제에도 「다시」).
 *  done = 이 대단원에서 마지막으로 한 소단원, 또는 (머) ✕ 받은 단원들(여럿 · redo) · 그때 깔리는 줄은 그 단원이라 「다시」가 눌린 채 선다. 이번 단원과 같으면 「다시」를 따로 세우지 않는다. codes 는 단원 부호(참고용) */
export function waves({ units, todo, done = null, redo = false }) {
  const after = todo.filter((u) => !units.some((x) => x.unit_id === u.unit_id)).slice(0, 1);
  const cls = [], home = [];
  const ds = (done == null ? [] : Array.isArray(done) ? done : [done]).filter(Boolean);
  const again = ds.length && !(ds.length === units.length && ds.every((d) => units.some((u) => u.unit_id === d.unit_id))) ? { key: "again", redo: Boolean(redo), name: waveLabel({ key: "again", redo }), codes: short(ds), units: ds } : null;
  if (again) cls.push(again);
  cls.push({ key: "now", name: WAVE_NAME.now, codes: short(units), units });
  if (after.length) { cls.push({ key: "more", name: WAVE_NAME.more, codes: short([...units, ...after]), units: [...units, ...after] }); }
  if (again) home.push({ ...again });
  home.push({ key: "review", name: WAVE_NAME.review, codes: short(units), units });
  if (after.length) { home.push({ key: "more", name: WAVE_NAME.more, codes: short([...units, ...after]), units: [...units, ...after] }); home.push({ key: "next", name: WAVE_NAME.next, codes: short(after), units: after }); }
  return { class: cls, home };
}
/** (어38) 오늘 단원 바꾸기의 줄 배치(순수) · 같은 항목의 줄들(rows: {id, unit_id, off})에 목표 단원(ids)을 앉힌다. 이미 그 단원을 든 줄은 그대로(off 면 살림) · 목표에 없는 단원을 든 줄을 비워 다른 단원에 쓴다 · 모자라면 새 줄 · 남으면 off.
 *  같은 단원을 두 줄이 동시에 드는 순간이 없어 유일 색인(day_item_one_per_slot)에 안 걸린다. 원장님 9/15 「이거 버튼 안 먹힘」: 자리(k번째 줄 → k번째 단원)로 앉히던 것이라, 조절로 [1-4·대비]를 깐 뒤 「하나 더」[1-4·1-5·대비]를 누르면 둘째 줄이 대비 → 1-5 로 바뀌기 전에 새 줄이 대비를 들어 겹쳤다 */
export function wavePlan(rows = [], ids = []) {
  const byUnit = new Map(rows.map((r) => [r.unit_id, r])), free = rows.filter((r) => !ids.includes(r.unit_id));
  const pool = rows.map((r) => r.sort).filter((s) => s != null).sort((a, b) => a - b);   // 이 올린 기록이 쓰던 차례. 목표 단원 차례대로 다시 나눈다(돌려 쓴 줄에 옛 차례가 남으면 대비문제가 1-4 앞에 서고, 「+ 시험 더하기」 기본 단원이 첫 줄을 봐서 어긋난다) · 모자라면 fresh(소비처가 맨 뒤 번호를 pos 차례대로 준다)
  const seat = (r, k, more) => { const s = k < pool.length ? pool[k] : null; const o = { ...(r ? { id: r.id } : {}), ...more, pos: k }; if (s == null) { if (pool.length) o.fresh = true; } else if (!r || r.sort !== s) o.sort = s; return o; };
  const ups = [], ins = []; let k = 0;
  for (const u of ids) {
    const has = byUnit.get(u);
    if (has) { const o = seat(has, k++, { off: false }); if (has.off || o.sort != null || o.fresh) ups.push(o); continue; }
    const r = free.shift();
    if (r) ups.push(seat(r, k++, { unit_id: u, off: false })); else ins.push(seat(null, k++, { unit_id: u }));
  }
  for (const r of free) { const o = seat(r, k++, { off: true }); if (!r.off || o.sort != null || o.fresh) ups.push(o); }
  return { ups, ins };
}
/** (어41) 「교재 배정」 목록 차례(순수) · 아직 배정 안 된 산 교재만 · 진도 체크된 교재(progress 줄이 있는 것)부터(원장님 9/15 「배정이 없으면 걍 진도체크된거부터 뜨게하든가」) · 그 다음은 영역 · 이름 */
export function choiceOrder(books = [], assignedIds = [], prog = []) {
  const m = new Map(); for (const p of prog) { const c = m.get(p.book_id) ?? { done: 0, marks: 0 }; c.marks++; if (p.status === "done") c.done++; m.set(p.book_id, c); }
  return books.filter((b) => !assignedIds.includes(b.id)).map((b) => ({ book_id: b.id, name: b.name, area: b.area ?? "", progressed: m.has(b.id), done: m.get(b.id)?.done ?? 0, marks: m.get(b.id)?.marks ?? 0 }))
    .sort((a, b) => Number(b.progressed) - Number(a.progressed) || b.marks - a.marks || a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
}
const short = (us) => (Array.isArray(us) ? us : [us]).map((u) => u.code ?? u.short ?? u.label ?? "?").join("·");   // 눈금은 짧은 부호(1-4·1-5) — 단추가 길면 세그먼트가 잘린다
/** 뺀 줄(off) 정하기 — 자동 줄 하나가 오늘 분량에 드나: 교재 상태 + 줄이기. 손으로 더한 줄(item_id 없음)과 나머지 줄(carry_of)은 안 건드린다 */
export function offFor({ slot, required }, { stop, mode }) {
  if (stop === "book_off") return true;
  if (stop === "hw_off" && slot === "home") return true;   // 예습 줄도 숙제 자리로 깔리므로 같이 빠진다
  if (mode === "required" && !required) return true;
  return false;
}
/** 조절(02) · (어33) 칩이 곧 고른 것(원장님 9/15 「소단원 갯수 조절 안돼」 · 갯수·뺀 것 두 상태를 안 둔다, 대전제-17) · 차례는 늘 도는 차례(pool).
 *  +: 마지막에 고른 것 뒤에서 아직 안 고른 것 하나(뒤가 없으면 앞쪽) · 대단원을 넘어도 된다(조절은 손이다 · 루틴이 저절로 깔 때만 대단원 안, 확정-④) · −: 마지막에 고른 것을 뺀다(하나는 남긴다). 갯수는 문항·쪽 합계로 보여 준다(확정-㉓) */
export function tuneStep(pool, selected, dir) {
  const ids = pool.map((u) => u.unit_id), sel = ids.filter((id) => selected.includes(id));
  if (dir > 0) { const last = ids.indexOf(sel[sel.length - 1]); const next = ids.slice(last + 1).find((id) => !sel.includes(id)) ?? ids.find((id) => !sel.includes(id)); return next ? ids.filter((id) => id === next || sel.includes(id)) : sel; }
  return sel.length > 1 ? sel.slice(0, -1) : sel;
}
/** 직접 친 갯수 n → 도는 차례에서 앞 n 개 */
export const tuneCount = (pool, n) => pool.slice(0, Math.max(0, Math.min(pool.length, n | 0))).map((u) => u.unit_id);
/** 고른 소단원을 도는 차례로 */
export const tuneSorted = (pool, selected) => pool.filter((u) => selected.includes(u.unit_id));
/** 문항·쪽 합계 — 화면에 뜨는 것은 개수가 아니라 이것 */
export const loadOf = (units) => ({
  questions: units.reduce((n, u) => n + (u.q_count || 0), 0),
  pages: units.reduce((n, u) => n + (u.page_start ? (u.page_end && u.page_end >= u.page_start ? u.page_end - u.page_start + 1 : 1) : 0), 0),
});
/** 한 줄짜리 긴 소단원(62문항)은 한 번에 못 낸다 — 「이번에」 눈금 셋: 1/3 · 1/2 · 전체 (목업 02: 62 → 1-20번 · 1-31번 · 전체) */
export function splitPresets(qCount) {
  const q = qCount | 0; if (q <= 0) return [];
  const a = Math.floor(q / 3), b = Math.floor(q / 2);
  return [{ key: "third", name: `1-${a}번`, range: `1-${a}번` }, { key: "half", name: `1-${b}번`, range: `1-${b}번` }, { key: "all", name: "전체", range: null }];
}

/** 줄이기 세그먼트의 숫자 「그대로 N · 필수만 M」(목업 01) — 판의 자동 줄(학습·숙제 · 뺀 줄 포함 = sheet.items)로 센다. 교재 안에 필수 줄이 하나도 없으면 그 교재는 다 필수로(linesFor 와 같은 뜻 — 비면 줄이지 않는다) */
export function trimCounts(sheet) {
  const auto = (sheet?.items ?? []).filter((it) => ["class", "home"].includes(it.slot) && it.item_id && !it.carry_of && it.unit_id);
  const byBook = new Map();
  for (const it of auto) { const k = it.units?.book_id ?? "?"; if (!byBook.has(k)) byBook.set(k, []); byBook.get(k).push(it); }
  let required = 0;
  for (const rows of byBook.values()) { const req = rows.filter((it) => it.required); required += req.length ? req.length : rows.length; }
  return { all: auto.length, required };
}
/** 📣 오늘 좀 많습니다(목업 01 · 확정-㊺a — 앱은 말만, 줄이는 것은 원장님) — 그날 학습+숙제(뺀 줄 뺀 자동 줄)의 쪽수를 교재마다 세어(같은 소단원은 한 번) 합이 문턱을 넘으면 띠. 문턱 0 이면 없음.
 *  돌려주는 것: { total, usual, top:{book_id,name,pages}, title, small } — 화면은 그대로 쓴다 */
export function heavyBand(sheet, usual, books = []) {
  const limit = Number(usual) || 0; if (!limit) return null;
  const auto = [...(sheet?.class ?? []), ...(sheet?.home ?? [])].filter((it) => it.item_id && !it.carry_of && it.unit_id && !it.off && it.units);
  const perBook = new Map();
  for (const it of auto) { const k = it.units.book_id; if (!perBook.has(k)) perBook.set(k, new Map()); perBook.get(k).set(it.unit_id, it.units); }
  const rows = [...perBook].map(([book_id, units]) => ({ book_id, name: books.find((b) => b.book_id === book_id)?.books?.name ?? "(교재)", pages: loadOf([...units.values()]).pages }));
  const total = rows.reduce((n, r) => n + r.pages, 0);
  if (total <= limit) return null;
  const top = rows.slice().sort((a, b) => b.pages - a.pages)[0] ?? null;
  return { total, usual: limit, top, title: `오늘 좀 많습니다. 합쳐 ${total}쪽`, small: `보통 ${limit}쪽쯤입니다${top ? ` · ${top.name}가 ${top.pages}쪽` : ""}` };
}

/** (어37) 지난 판에서 「다음 시간으로」 미룬 줄 가운데 오늘 이어 깔 것(원장님 9/15) · 이미 뒤 판에 넘어간 것(carriedIds)과 뺀 것(off)은 빼고,
 *  오늘 학습에 같은 항목·단원 줄이 서는 것(루틴이 다시 깐 것)은 새 줄 없이 그 줄이 곧 그것이다(dup · carry_of 만 붙인다). 오래된 것부터 · 손으로 적은 줄(항목·단원 없음)은 늘 새 줄 */
export function nextCarry(nextLines = [], carriedIds = new Set(), todayLines = []) {
  const key = (l) => `${l.item_id ?? ""}|${l.unit_id ?? ""}`;
  const have = new Set(todayLines.filter((l) => l.slot === "class" && (l.item_id || l.unit_id)).map(key));
  const out = [];
  for (const l of [...nextLines].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")) || (a.sort ?? 0) - (b.sort ?? 0))) {
    if (carriedIds.has(l.id) || l.off) continue;
    if ((l.item_id || l.unit_id) && have.has(key(l))) { out.push({ ...l, dup: true }); continue; }
    if (l.item_id || l.unit_id) have.add(key(l));
    out.push({ ...l, dup: false });
  }
  return out;
}

/** (어35) 검사가 다 끝난 교재(순수 · 원장님 9/15 「숙제검사를 먼저 한 영역이 오늘학습에 먼저 배정되게 함」) · 검사 줄(units.book_id 가 있는 것)이 그 교재 것 하나라도 있고 전부 검사됐으면 그 교재 · 단원 없는 검사 줄(손으로 적은 숙제)은 어느 교재도 안 막는다 · 검사 줄이 없는 교재는 안 나온다(마지막 검사에서 깔린다) */
export function readyBooks(checks = []) {
  const m = new Map();
  for (const c of checks) { const b = c?.units?.book_id ?? null; if (!b) continue; m.set(b, (m.get(b) ?? true) && !isUnchecked(c)); }
  return [...m].filter(([, d]) => d).map(([b]) => b);
}
/** (어35) 루틴 차례 · 교재 등수(순수) · 원장님 「미리 루틴 배정한 순서대로」를 이렇게 읽는다: 영역 차례(AREAS · 문법 → 의미 단위 → 독해 → 영작 → 내신 → 블록구문 → 단어) → 배정 시작일(오래된 것 먼저) → 이름 · booksOf 의 줄(book_id · from_date · books.area·name)을 넣는다 · Map(book_id → 0부터) · 틀리면 이 한 곳 */
export function bookRank(books = []) {
  const idx = (a) => { const i = AREAS.findIndex(([k]) => k === a); return i < 0 ? AREAS.length : i; };
  const area = (b) => b.books?.area ?? b.area ?? null, name = (b) => b.books?.name ?? b.name ?? "";
  return new Map([...books].sort((a, b) => idx(area(a)) - idx(area(b)) || String(a.from_date ?? "").localeCompare(String(b.from_date ?? "")) || String(name(a)).localeCompare(String(name(b)), "ko")).map((b, i) => [b.book_id ?? b.id, i]));
}
/** (어35) 지난 시간에서 넘어온 줄인가(carry 가 next 자리 줄 · day-plan fromLast 와 같은 뜻 · 여기는 순수 셈이라 따로 둔다) */
const fromLastRow = (r) => Boolean(r?.carry_of && r?.carry?.slot === "next");
/** (어35) 오늘 학습·숙제 줄의 차례를 다시 세운다(순수 · 원장님 9/15 「숙제검사 완료되면, 미리 루틴 배정한 순서대로 재배열 · 학생이 시작버튼 눌러서 타이머 시작되면, 이미 학생이 시작한 학습 완료후에 나머지를 루틴대로」).
 *  자리(학원·숙제)마다 따로 · ① 시작한 줄(started_at · 시작 차례 · pin) ② 지난 시간에서 넘어온 줄(옛 차례) ③ 교재 줄(rank 등수 → 옛 차례 · 검사 나머지 조각은 아님) ④ 그 밖에(교재 없음 · 조각 · 옛 차례)
 *  차례는 day_item.sort 하나 · 07·01 나무(day-plan itemOrder bySort)와 classSteps 가 그것을 본다 · 돌려주는 것 [{ id, sort }] 바뀐 줄만 · 1부터 · 다시 돌려도 같다 */
export function orderToday(rows = [], rank = new Map(), { pin = true } = {}) {
  const out = [];
  for (const slot of ["class", "home"]) {
    const list = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.slot === slot);
    const grp = (r) => (pin && r.started_at ? 0 : fromLastRow(r) ? 1 : r.units?.book_id != null && !r.carry_of ? 2 : 3);
    const key = ({ r, i }) => { const g = grp(r); return [g, g === 0 ? String(r.started_at) : "", g === 2 ? (rank.get(r.units.book_id) ?? 1e9) : 0, Number(r.sort ?? 0), i]; };
    list.sort((a, b) => { const ka = key(a), kb = key(b); for (let k = 0; k < ka.length; k++) { if (ka[k] < kb[k]) return -1; if (ka[k] > kb[k]) return 1; } return 0; });
    list.forEach(({ r }, k) => { if (Number(r.sort ?? 0) !== k + 1) out.push({ id: r.id, sort: k + 1 }); });
  }
  return out;
}
/** (어35) 01 교재 카드의 차례(순수) · 오늘 학습 줄의 sort 가 곧 차례(그 교재 줄 중 가장 작은 sort · 학습 줄 먼저 · 없으면 숙제 줄) · 줄이 없는 교재는 뒤에 배정 차례대로 · 07 나무(itemOrder bySort)와 같은 차례 */
export function bookOrder(books = [], rows = []) {
  const k = new Map();
  for (const r of rows) { const b = r.units?.book_id; if (b == null || r.off || !["class", "home"].includes(r.slot)) continue; const v = (r.slot === "class" ? 0 : 1) * 1e6 + Number(r.sort ?? 0); if (!k.has(b) || v < k.get(b)) k.set(b, v); }
  return books.map((b, i) => ({ b, v: k.get(b.book_id) ?? 2e6 + i })).sort((x, y) => x.v - y.v).map((x) => x.b);
}
