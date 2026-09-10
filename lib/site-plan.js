/** 🏫 학교 홈페이지에서 받은 것 읽기(순수 · (버2)) — 나이스에 없는 학교의 학사일정.
 *  **판단을 새로 만들지 않는다**(원칙-1): 여기서 하는 일은 「긁어온 줄 → 나이스 줄과 **같은 꼴**」로 옮기는 것뿐이고,
 *  무엇이 시험인가(kindOf) · 이름을 어떻게 부르나(examName) · 여러 날을 한 회차로(mergeRuns) · 옛 줄에 잇기(diffExams)는
 *  전부 lib/neis-plan.js 것을 그대로 쓴다. 학교가 늘어도 고칠 곳이 한 곳이다.
 *  **확장은 판정하지 않는다** — 본 글과, 있으면 기계 날짜만 보낸다(학교마다 생김새가 달라 확장에 규칙을 넣으면 학교 수만큼 흩어진다). */
const MONTH_DAY = /(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})\s*일?/;
const FULL = /(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})\s*일?/;
const pad = (n) => String(n).padStart(2, "0");
const real = (y, m, d) => { if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null; const s = `${y}-${pad(m)}-${pad(d)}`; const t = new Date(`${s}T00:00:00Z`); return t.toISOString().slice(0, 10) === s ? s : null; };
/** 글에서 날짜 하나 — 「2026-05-04」 「2026.5.4」 「2026년 5월 4일」 「5/4」 「5월 4일」.
 *  해가 없으면 **학년도로 채운다**(3월~다음 해 2월) — 「5/4」 가 어느 해인지는 글이 안 알려 준다 */
export function readDate(text, { year = null, month = null } = {}) {
  const s = String(text ?? "");
  const f = FULL.exec(s); if (f) return real(Number(f[1]), Number(f[2]), Number(f[3]));
  const md = MONTH_DAY.exec(s);
  if (md && year) { const m = Number(md[1]), d = Number(md[2]); return real(m >= 3 ? year : year + 1, m, d); }
  if (!md && month && year) { const only = /(?:^|\D)(\d{1,2})(?:\D|$)/.exec(s); if (only) { const d = Number(only[1]); return real(month >= 3 ? year : year + 1, month, d); } }
  return null;
}
/** 나이스 줄과 같은 꼴로 — planImport 가 그대로 먹는다(AA_YMD · EVENT_NM · SBTR_DD_SC_NM · EVENT_CNTNT) */
export const toNeisShape = (date, name) => ({ AA_YMD: String(date).replaceAll("-", ""), EVENT_NM: name, SBTR_DD_SC_NM: "", EVENT_CNTNT: "" });
export const MAX_ROWS = 2000, MAX_TEXT = 200;
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
/** 확장이 보낸 짐 한 벌 → 나이스 꼴 줄들. 못 쓸 줄은 **막지 않고 버린다**(까닭과 함께 센다) */
export function readSite(body, { year = null } = {}) {
  const list = Array.isArray(body?.rows) ? body.rows : null;
  if (!list) throw new Error("rows 가 없습니다(짐 꼴이 아닙니다)");
  if (list.length > MAX_ROWS) throw new Error(`한 번에 ${MAX_ROWS}줄까지 받습니다(온 것 ${list.length})`);
  const month = Number(body?.month) || null;
  const rows = [], dropped = [];
  for (const r of list) {
    const text = clean(typeof r === "string" ? r : r?.text);
    if (!text) continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r?.date ?? "")) ? String(r.date) : readDate(text, { year, month });
    if (!date) { dropped.push(text.slice(0, 40)); continue; }   // 날짜가 없는 줄 — 메뉴·안내문이다
    const name = clean(text.replace(FULL, " ").replace(MONTH_DAY, " ")) || text;
    rows.push(toNeisShape(date, name));
  }
  return { rows, dropped };
}
/** 마지막으로 받은 때 → 「N일째 못 받았습니다」 — 학교가 홈페이지를 바꾸면 **조용히 멈춘다**(목업 12b) */
export function staleText(lastAt, today, days = 14) {
  if (!lastAt) return "아직 한 번도 못 받았습니다";
  const d = Math.floor((new Date(`${today}T00:00:00Z`) - new Date(String(lastAt).slice(0, 10) + "T00:00:00Z")) / 86400000);
  return d >= days ? `${d}일째 못 받았습니다 — 학교가 홈페이지를 바꿨을 수 있습니다` : null;
}
