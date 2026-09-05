/** 「누가 무엇을 보나」 판단 한 벌(대전제-4). 열쇠 목록의 주인은 여기다 — DB 는 값만 든다.
 *  기본값은 코드에 없다: 줄이 없으면 「안 정함」이고 막힌다(fail closed). 원장은 묻지 않는다.
 *  ⚠️ 열쇠 이름은 옛 앱과 같다 — 원장님이 2026-09-03 에 정하신 32칸이 v2.role_access 에 그대로 있다. 이름을 바꾸면 그 답이 사라진다. */
import { ROLES } from "./roles.js";
const 학원사람 = Object.freeze([ROLES.INSTRUCTOR, ROLES.ASSISTANT]);
export const KEYS = Object.freeze([
  { key: "page.home",     name: "대시보드",   group: "page",   roles: 학원사람,       href: "/" },
  { key: "page.today",    name: "오늘",       group: "page",   roles: 학원사람,       href: "/today" },
  { key: "page.send",     name: "발송",       group: "page",   roles: 학원사람,       href: "/send" },
  { key: "page.schedule", name: "일정",       group: "page",   roles: 학원사람,       href: "/schedule" },
  { key: "page.books",    name: "교재",       group: "page",   roles: 학원사람,       href: "/books" },
  { key: "page.ops",      name: "운영",       group: "page",   roles: 학원사람,       href: "/ops" },
  { key: "page.settings", name: "설정",       group: "page",   roles: 학원사람,       href: "/settings" },
  { key: "ops.fee",       name: "수강료",     group: "ops",    roles: 학원사람 },
  { key: "ops.consult",   name: "상담일지",   group: "ops",    roles: 학원사람 },
  { key: "ops.inquiry",   name: "신규 문의",  group: "ops",    roles: 학원사람 },
  { key: "me.arrival",    name: "등원·하원",  group: "me",     roles: [ROLES.STUDENT] },
  { key: "me.today",      name: "오늘",       group: "me",     roles: [ROLES.STUDENT] },
  { key: "me.books",      name: "내 교재",    group: "me",     roles: [ROLES.STUDENT] },
  { key: "me.flags",      name: "표시",       group: "me",     roles: [ROLES.STUDENT] },
  { key: "parent.intro",    name: "소개",       group: "parent", roles: [ROLES.PARENT] },
  { key: "parent.recent",   name: "최근",       group: "parent", roles: [ROLES.PARENT] },
  { key: "parent.homework", name: "숙제",       group: "parent", roles: [ROLES.PARENT] },
  { key: "parent.next",     name: "다음",       group: "parent", roles: [ROLES.PARENT] },
  { key: "parent.files",    name: "자료",       group: "parent", roles: [ROLES.PARENT] },
  { key: "parent.word",     name: "단어",       group: "parent", roles: [ROLES.PARENT] },
  { key: "parent.reports",  name: "리포트",     group: "parent", roles: [ROLES.PARENT] },
  { key: "parent.sent",     name: "보낸 것",    group: "parent", roles: [ROLES.PARENT] },
].map(Object.freeze));
export const GROUP_NAME = Object.freeze({ page: "대메뉴", ops: "운영 카드", me: "학생 화면 카드", parent: "학부모 화면 카드" });

/** 켬(true) · 끔(false) · 안 정함(null). 원장은 늘 켬. rows 는 v2.role_access 의 줄들 */
export function decide(role, rows, key) {
  if (role === ROLES.PRINCIPAL) return true;
  const r = (rows ?? []).find((x) => x.role === role && x.key === key);
  return r ? Boolean(r.allowed) : null;
}
/** 아직 안 정한 칸 — 역할마다 그 역할에 걸리는 열쇠만 센다 */
export function undecided(rows) {
  const out = [];
  for (const k of KEYS) for (const role of k.roles) if (decide(role, rows, k.key) === null) out.push({ role, key: k.key, name: k.name });
  return out;
}
/** 32칸 = 열쇠마다 걸리는 역할 수의 합 — 검사가 센다 */
export const CELLS = KEYS.reduce((n, k) => n + k.roles.length, 0);
