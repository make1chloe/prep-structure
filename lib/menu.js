/** 메뉴 한 벌 — 어느 화면에서든 같은 것. 열쇠는 lib/perm.js 의 것(두 벌로 적지 않는다).
 *  built 가 아닌 화면은 아직 안 지었다 — 메뉴에 안 그린다(눌러서 404 를 보는 일이 없게). 화면을 지으면 여기서 켠다. */
import { KEYS, decide } from "./perm.js";
import { ROLES } from "./roles.js";
const BUILT = new Set(["/", "/settings"]);
export function menuFor(role, rows) {
  if (role === ROLES.STUDENT || role === ROLES.PARENT) return [];   // 아이·학부모는 제 화면 하나 — 2단계에서 온다
  return KEYS.filter((k) => k.group === "page" && BUILT.has(k.href) && decide(role, rows, k.key) === true)
             .map((k) => ({ href: k.href, name: k.name, key: k.key }));
}
export const homeFor = (role) => (role === ROLES.STUDENT ? "/me" : role === ROLES.PARENT ? "/parent" : "/");
