/** 학생 줄 머리 판단(목업 01 .rowtop) — 순수, 표를 안 읽는다. 화면과 서버가 같이 쓴다.
 *  학년·학교 글자(「중2 · 신정중」) · 진도 점(오늘 검사 결과 하나에 점 하나) · 「N회독째」 · 「N일째 안 봄」(가장 오래된 안 본 숙제가 며칠 전 것인가) · 🗺 오늘 한 단원 */
import { plusDays } from "./day-plan.js";
const LEVEL = { elem: "초", middle: "중", high: "고" };
/** 「중2」 — 학교 급(schools.level)이 있으면 급+학년, 없으면 「2학년」. 학년(students.grade)은 급 안의 학년이다 */
export const gradeLabel = (level, grade) => (!grade ? "" : LEVEL[level] ? `${LEVEL[level]}${grade}` : `${grade}학년`);
/** 「신정중학교 → 신정중 · 옥련여자고등학교 → 옥련여고 · 서울초등학교 → 서울초」 — 학교 이름은 견주지 않고 줄이기만 한다(견주기는 이관의 일) */
export const schoolShort = (name) => String(name ?? "").replace(/여자고등학교$/, "여고").replace(/고등학교$/, "고").replace(/중학교$/, "중").replace(/초등학교$/, "초").trim();
/** 「중2 · 신정중」 */
export const whoMeta = (student) => [gradeLabel(student?.schools?.level, student?.grade), schoolShort(student?.schools?.name)].filter(Boolean).join(" · ");
/** 진도 점 — 오늘 검사 줄 하나에 점 하나(목업 01 의 .marks: ○△✕ 를 누르면 점이 따라 바뀐다). 다섯까지 */
const DOT = { done: ["ok", "○"], weak: ["weak", "△"], missing: ["miss", "✕"] };
export const marks = (check = []) => check.slice(0, 5).map((it) => { const [cls, ch] = DOT[it?.status] ?? ["", "·"]; return { cls, ch }; });
/** 「3회독째」 — 첫 교재(배정 최근 것)의 회독이 2 이상일 때만. 1회독은 말하지 않는다 */
export const roundPill = (books = []) => { const r = Number(books?.[0]?.round ?? 0); return r >= 2 ? `${r}회독째` : ""; };
/** 「N일째 안 봄」 — 아직 검사 안 한 줄 중 **가장 오래된 숙제가 며칠 전** 것인가(낸 다음 날 보는 것이 보통이라 2일째부터 말한다). 원본 날짜(carry 의 판 날짜)가 없는 줄은 안 센다 */
export function unseenDays(check = [], today) {
  let oldest = null;
  for (const it of check) { if (it?.status && it.status !== "none") continue; const d = it?.carry?.day_sheet?.date ?? it?.origin_date; if (d && (!oldest || d < oldest)) oldest = d; }
  if (!oldest || !today) return 0;
  let n = 0; for (let d = oldest; d < today && n < 60; d = plusDays(d, 1)) n++;
  return n;
}
export const unseenPill = (check, today) => { const n = unseenDays(check, today); return n >= 2 ? `${n}일째 안 봄` : ""; };
/** 🗺 오늘 한 단원 — 검사 줄의 단원(결과대로 ○◐✕·)과 오늘 학습 줄의 단원(◐ 하는 중). 같은 단원은 하나로, 검사 결과가 있으면 그것 */
const UNIT_MARK = { done: "○", weak: "◐", missing: "✕" };
export function todayUnits(sheet, books = []) {
  const name = (b) => books.find((x) => x.book_id === b)?.books?.name ?? "";
  const out = new Map();
  for (const it of sheet?.check ?? []) if (it?.units) out.set(it.units.id, { id: it.units.id, label: `${name(it.units.book_id)} ${it.units.label ?? it.units.short ?? ""}`.trim(), mark: UNIT_MARK[it.status] ?? "·", on: it.status === "done" });
  for (const it of sheet?.class ?? []) if (it?.units && !out.has(it.units.id)) out.set(it.units.id, { id: it.units.id, label: `${name(it.units.book_id)} ${it.units.label ?? it.units.short ?? ""}`.trim(), mark: "◐", on: false });
  return [...out.values()];
}
/** 🗺 영역 메모의 네 칸(목업 01) — v2.area_name 일곱 중 매일 한 마디 적는 넷 */
export const MEMO_AREAS = Object.freeze(["단어", "문법", "독해", "영작"]);
/** 📝 단원평가 결과 — 맞은 개수 · 문항 · 통과선(규칙 unit_test.pass_pct) → { pct, pass }. 안 적었으면 null */
export const unitResult = (correct, qCount, passPct) => { if (correct == null || correct === "" || !Number(qCount)) return null; const pct = Math.round((Number(correct) / Number(qCount)) * 100); return { pct, pass: pct >= Number(passPct) }; };
