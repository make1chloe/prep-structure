/** 루틴 깔기 판단 — 순수 함수(DB 없음). 읽고 넣는 손은 lib/routine.js, 검사 check-routine 은 여기만 돌린다.
 *  하루는 셋(확정-⑨): ① 숙제 검사가 방아쇠 → ② 오늘 학습 · ③ 오늘 숙제가 저절로. 루틴 = 학생루틴(고르고 차례 짠 것)이 있으면 그것, 없으면 영역루틴 전부(확정-㉒).
 *  덩어리 = 안 한 소단원 차례(v2.todo_units)에서 같은 대단원 안 per_session 개(루틴 한 바퀴 = 대단원, 확정-④). 숙제는 오늘 학습과 같은 소단원(복습).
 *  교재 상태 셋(확정-⑬): running 진행중 · hw_off 숙제멈춤(숙제 줄만 뺀다) · book_off 교재멈춤(다 뺀다). stop_until 이 지났으면 진행중.
 *  줄이기(확정-㊺a — 앱이 밀지 않는다, 원장님이 누른다): all 그대로 · required 필수만. 필수만으로 줄여 한 묶음이 통째로 비면 그 묶음은 줄이지 않는다(검사-⑩) */
export const STOP = Object.freeze([["running", "진행중"], ["hw_off", "숙제멈춤"], ["book_off", "교재멈춤"]]);
export const MODE = Object.freeze([["all", "그대로"], ["required", "필수만"]]);
export const PLACE_OF = Object.freeze({ class: ["class", "both"], home: ["home", "both"] });
/** 교재 상태 — 날짜를 넣어 「지났으면 진행중」까지 */
export function stopOn(sb, date) {
  if (!sb || !sb.stop_mode || sb.stop_mode === "running") return "running";
  if (sb.stop_until && String(sb.stop_until) < String(date)) return "running";
  return sb.stop_mode;
}
/** 오늘 덩어리 — todo(안 한 소단원 차례) 중 첫 대단원 안에서 n 개 */
export function chunkOf(todo, n = 1) {
  const first = todo[0]; if (!first) return [];
  return todo.filter((u) => u.chapter === first.chapter).slice(0, Math.max(1, n | 0));
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
  if (stop === "book_off") return { stop, units: [], class: [], home: [], why: "교재 멈춤" };
  const units = chunkOf(todo, sb?.per_session ?? 1);
  if (!units.length) return { stop, units, class: [], home: [], why: "안 한 소단원이 없다" };
  const cls = linesFor(lines, "class", mode), home = stop === "hw_off" ? [] : linesFor(lines, "home", mode);
  return { stop, units, class: cls, home, why: !cls.length && !home.length ? "루틴 줄이 없다" : null };
}
/** 회차 고르기 — 학습: 지난 것 다시 · 오늘 것 · 하나 더 / 숙제: 오늘 것 복습 · 하나 더 · 다음 것만 (목업 01). done = 이 대단원에서 마지막으로 한 소단원 */
export function waves({ units, todo, done = null }) {
  const after = todo.filter((u) => !units.some((x) => x.unit_id === u.unit_id)).slice(0, 1);
  const cls = [], home = [];
  if (done) cls.push({ key: "again", name: `${short(done)} 다시`, units: [done] });
  cls.push({ key: "now", name: short(units), units });
  if (after.length) { cls.push({ key: "more", name: short([...units, ...after]), units: [...units, ...after] }); }
  home.push({ key: "review", name: `${short(units)} 복습`, units });
  if (after.length) { home.push({ key: "more", name: short([...units, ...after]), units: [...units, ...after] }); home.push({ key: "next", name: `${short(after)}만`, units: after }); }
  return { class: cls, home };
}
const short = (us) => (Array.isArray(us) ? us : [us]).map((u) => u.code ?? u.short ?? u.label ?? "?").join("·");   // 눈금은 짧은 부호(1-4·1-5) — 단추가 길면 세그먼트가 잘린다
/** 뺀 줄(off) 정하기 — 자동 줄 하나가 오늘 분량에 드나: 교재 상태 + 줄이기. 손으로 더한 줄(item_id 없음)과 나머지 줄(carry_of)은 안 건드린다 */
export function offFor({ slot, required }, { stop, mode }) {
  if (stop === "book_off") return true;
  if (stop === "hw_off" && slot === "home") return true;
  if (mode === "required" && !required) return true;
  return false;
}
