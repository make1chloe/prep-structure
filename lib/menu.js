/** 메뉴 한 벌 — 어느 화면에서든 같은 것. 열쇠는 lib/perm.js 의 것(두 벌로 적지 않는다).
 *  built 가 아닌 화면은 아직 안 지었다 — 메뉴에 안 그린다(눌러서 404 를 보는 일이 없게). 화면을 지으면 여기서 켠다. */
import { KEYS, decide } from "./perm.js";
import { ROLES } from "./roles.js";
const BUILT = new Set(["/", "/today", "/send", "/schedule", "/books", "/ops", "/settings"]);
/** (려) 원장님 2026-09-10: 「일정에 학교별표를 내신으로 할일을 따로 할일로 메뉴를 나누는게 어떤가 싶어」.
 *  자주 여는 둘을 **상단에 바로** 올린다. 주소는 안 옮긴다(링크 수십 곳이 안 깨진다) ·
 *  **권한도 안 나눈다** — 일정을 볼 수 있으면 이 둘도 본다(`page.schedule` 하나에 얹는다 · 접근 규칙 칸이 안 는다).
 *  강사에게 내신만 열 일이 생기면 그때 열쇠를 나눈다(예외를 미리 만들지 않는다). */
const RIDERS = Object.freeze([
  { after: "/schedule", href: "/schedule/grid", name: "내신" },   // 06c 학교별 표
  { after: "/schedule", href: "/schedule/todo", name: "할 일" },   // 05 내 할 일
]);
export function menuFor(role, rows) {
  if (role === ROLES.STUDENT || role === ROLES.PARENT) return [];   // 아이·학부모는 제 화면 하나 — 2단계에서 온다
  const out = [];
  for (const k of KEYS) {
    if (k.group !== "page" || !BUILT.has(k.href) || decide(role, rows, k.key) !== true) continue;
    out.push({ href: k.href, name: k.name, key: k.key });
    for (const r of RIDERS) if (r.after === k.href) out.push({ href: r.href, name: r.name, key: k.key });   // 얹은 탭은 태운 탭이 열릴 때만 뜨고, **열쇠도 그 탭의 것 그대로**(열쇠 글자를 두 벌로 안 적는다 — 검사-perm)
  }
  return out;
}
export const homeFor = (role) => (role === ROLES.STUDENT ? "/me" : role === ROLES.PARENT ? "/parent" : "/");
/** 지금 화면이 어느 탭인가(껍질 탭을 파랗게 — 목업 .tab[aria-current]) — 주소가 탭 주소 자체거나 그 아래(/schedule/todo → 일정)인 것 중 가장 긴 것 · "/" 는 꼭 같을 때만(/today 가 대시보드로 안 잡히게) · 메뉴에 없는 화면(/scores)은 null */
export function currentTab(items, pathname) {
  let best = null;
  for (const m of items ?? []) { const h = m.href; if (h === "/" ? pathname === "/" : (pathname === h || pathname.startsWith(h + "/"))) if (!best || h.length > best.length) best = h; }
  return best;
}
