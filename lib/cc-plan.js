/** 🃏 클래스카드 판단 한 벌(순수, 목업 01 「클래스카드 플래너」 · 확정-⑩·⑱·55) — 확장이 보낸 짐을 읽고, 모드마다 「목표 대 실제」를 낸다.
 *  확정-⑩ **3초훈련(speed)은 판정하지 않는다** — 앱이 못 보는 것은 검증하는 척하지 않는다(짐에 와도 버린다).
 *  확정-⑱ 목표·실제는 **확장이 이미 보낸다** — 앱이 다시 셈하지 않는다. 미달이어도 **앱이 안 넘긴다**(원장님이 누른다).
 *  확정-55 스크램블·드릴 순서배열도 같은 줄로 받는다. 손(쓰기)은 lib/cc.js · 받는 길은 app/api/cc/route.js */
export const SET_TYPE = Object.freeze({ 1: "단어", 2: "문장" });
/** 모드 — 열쇠(확장이 보내는 이름) · 우리 말 · 단위(pct 백분율 · count 개수) · 어느 세트 갈래에 뜨나 */
export const MODES = Object.freeze([
  ["memorize", "암기", "pct", 1], ["recall", "리콜", "pct", 1], ["match", "매칭", "count", 1], ["spell", "스펠", "pct", 1],
  ["read", "낭독", "pct", 2], ["rec", "녹음", "pct", 2], ["sent", "문장암기", "pct", 2],
  ["scramble", "스크램블", "pct", 0], ["drill", "드릴 순서배열", "pct", 0],   // 확정-55 — 갈래를 안 가린다(0 = 둘 다)
]);
export const MODE_NAME = Object.freeze(Object.fromEntries(MODES.map(([k, name]) => [k, name])));
/** 확정-⑩ — 3초훈련은 판정하지 않는다. 짐에 와도 여기서 걸러 낸다(화면·자취 어디에도 안 남는다) */
export const DROPPED = Object.freeze(["speed", "speed3", "3sec"]);
/** (뎌-3) 클래스카드가 쓰는 이름 → 우리 열쇠. **확장은 긁은 이름을 그대로 보낸다** — 옮김은 여기 한 곳뿐이다(원칙-1).
 *  클래스카드 화면이 이름을 바꾸면 고칠 곳도 여기 한 줄이고, 검사(check-cc)가 그것을 지킨다.
 *  모르는 이름은 옮기지 않고 버린다(tidyScores) — 조용히 엉뚱한 모드로 섞지 않는다. */
export const ALIAS = Object.freeze({ mem: "memorize", memorize: "memorize", recall: "recall", match: "match", matching: "match",
  spell: "spell", spelling: "spell", speaking: "read", read: "read", reading: "read", rec: "rec", record: "rec", recording: "rec",
  sent: "sent", sentence: "sent", scramble: "scramble", drill: "drill" });
/** 그 이름이 가리키는 우리 열쇠 — 모르면 null */
export const modeKey = (k) => { const x = String(k ?? "").trim().toLowerCase(); return DROPPED.includes(x) ? null : (ALIAS[x] ?? (MODE_NAME[x] ? x : null)); };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const clean = (s, max) => { const t = String(s ?? "").trim().replace(/\s+/g, " "); return t ? t.slice(0, max) : null; };
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
/** 모드 값 한 벌 — 3초훈련을 버리고, 숫자가 아닌 것도 버린다(확장이 「-」 를 보낼 때가 있다) */
export function tidyScores(o = {}) {
  const out = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = modeKey(k); if (!key) continue;   // 3초훈련·모르는 이름은 버린다 · 클래스카드 이름은 우리 열쇠로 옮긴다(ALIAS)
    const n = num(v); if (n === null || n < 0) continue;
    out[key] = n;
  }
  return out;
}
/** 확장이 보낸 짐 한 줄 — 못 쓸 줄은 까닭과 함께 버린다(막지 않고 센다: 한 줄이 나빠도 나머지는 들어간다) */
export function readRow(r) {
  const date = String(r?.date ?? "").slice(0, 10);
  if (!isDate(date)) return { bad: `날짜가 아닙니다: ${String(r?.date ?? "").slice(0, 20)}` };
  const set_name = clean(r?.set_name, 120); if (!set_name) return { bad: "세트 이름이 없습니다" };
  const t = num(r?.set_type); const set_type = t === 1 || t === 2 ? t : null;
  const goals = tidyScores(r?.goals), got = tidyScores(r?.got);
  return { row: { date, set_name, set_type, complete: r?.complete === true ? true : r?.complete === false ? false : null,
    learn_status: num(r?.learn_status), cards: num(r?.cards), goals, got } };
}
/** 짐 전체 — 아이마다 줄 여럿. 한 번에 받는 양을 묶는다(확장이 폭주해도 DB 가 안 눕는다) */
export const MAX_STUDENTS = 200, MAX_ROWS = 600;
export function parsePayload(body) {
  const list = Array.isArray(body?.students) ? body.students : null;
  if (!list) throw new Error("students 가 없습니다(짐 꼴이 아닙니다)");
  if (list.length > MAX_STUDENTS) throw new Error(`한 번에 ${MAX_STUDENTS}명까지 받습니다(온 것 ${list.length})`);
  const people = [], dropped = [];
  let rows = 0;
  for (const s of list) {
    const idx = clean(s?.cc_user_idx, 40); if (!idx) { dropped.push("클래스카드 아이디(cc_user_idx)가 없는 줄"); continue; }
    const out = [];
    for (const r of Array.isArray(s?.rows) ? s.rows : []) {
      if (++rows > MAX_ROWS) throw new Error(`한 번에 ${MAX_ROWS}줄까지 받습니다`);
      const got = readRow(r); if (got.bad) { dropped.push(`${idx}: ${got.bad}`); continue; }
      out.push(got.row);
    }
    people.push({ cc_user_idx: idx, cc_login_id: clean(s?.cc_login_id, 60), name: clean(s?.name, 40), rows: out });
  }
  return { people, dropped, rows };
}
/** 목표 대 실제 — 「매칭 3,240 / 목표 3,000」 · 백분율은 「스펠 82% / 목표 100%」 · 목표가 없으면 실제만(판정 안 함) */
export function modeLines(goals = {}, got = {}) {
  const keys = MODES.map(([k]) => k).filter((k) => k in (got ?? {}) || k in (goals ?? {}));
  return keys.map((k) => {
    const [, name, unit] = MODES.find(([x]) => x === k);
    const goal = num(goals?.[k]), actual = num(got?.[k]);
    const fmt = (v) => (v === null ? "—" : unit === "pct" ? `${Math.round(v)}%` : v.toLocaleString("ko-KR"));
    const ok = goal === null || actual === null ? null : actual >= goal;
    return { key: k, name, unit, goal, actual, ok, text: `${name} ${fmt(actual)}${goal === null ? "" : ` · 목표 ${fmt(goal)}`}` };
  });
}
/** 못 넘긴 것만 — 「스펠 82% · 목표 100%」. 하나도 없으면 빈 목록(다 넘었다) · 확정-⑱ 앱은 넘기지 않는다, 보여만 준다 */
export const shortOf = (lines) => lines.filter((l) => l.ok === false);
/** 그날 그 아이의 한 줄 — 「능률보카 Day 38-40 · 단어 · 완료 · 60장」 */
export function plannerLine(p) {
  const bits = [p.set_name];
  if (p.set_type && SET_TYPE[p.set_type]) bits.push(SET_TYPE[p.set_type]);
  if (p.complete === true) bits.push("완료"); else if (p.complete === false) bits.push("아직");
  if (Number(p.cards) > 0) bits.push(`${Number(p.cards).toLocaleString("ko-KR")}장`);
  const lines = modeLines(p.goals, p.got), short = shortOf(lines);
  return { title: bits.join(" · "), lines, short, allOk: lines.length > 0 && short.length === 0 };
}
