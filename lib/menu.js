/**
 * **메뉴 한 벌 + 역할 낱말 한 벌.** 어느 화면에서든 같은 것을 보여 준다.
 *
 * ⚠️ 계획 0단계 10번 — 「어느 화면에서든 **늘 손에 닿아야 하는 것**을 먼저 정한다:
 *    퀵메모 ✏️ · 로그아웃 · 되돌아가기. 이것들은 **스크롤로 접히는 자리에 두지 않는다.**
 *    표·목록 **안쪽** 스크롤이 위 메뉴를 접게 만들지 않는다 — 화면이 짧으면 다시 펼 방법이 없어져
 *    그 자리가 영영 사라진다.」
 *
 * ⚠️ **대전제 10** — 홈 화면에 깐 앱에는 주소창도 뒤로가기도 없다.
 *    그래서 **닫는 길·나가는 길이 언제나 화면 안에** 있어야 한다.
 *
 * ── ⚠️⚠️ 2026-09-03 · 어긋난 곳 ⑯ 을 여기서 고쳤다 (대전제-4 · 원칙-1)
 *    옛 코드는 `menuFor("staff")` 일 때만 메뉴를 줬다. 그런데 **`staff` 라는 역할은
 *    DB 에 한 줄도 없다** — `v2.profiles.role` 의 CHECK 가
 *    `principal | instructor | student | parent` 넷만 받으므로 **넣을 수조차 없다**
 *    (2026-09-03 실측: principal 2 · instructor 2 · parent 21 · student 23 · staff 0).
 *    그래서 원장님이 로그인하면 `menuFor("principal")` → `[]` 였고,
 *    메뉴가 0칸이 되면서 **나가는 길까지 같이 사라졌다**(대전제-10).
 *
 *    안 하면 무엇이 터지나: 역할 낱말이 이 파일과 DB 두 벌로 갈리면,
 *    **코드는 초록인데 사람은 아무 데도 못 간다.** 검사도 지어낸 낱말로 물으면 같이 초록이다.
 *    그래서 여기서는 **DB 에 있는 낱말만 쓴다.** 묶음이 필요하면 그 낱말들로 만든다.
 */

/**
 * **DB `v2.profiles.role` 의 CHECK 가 받는 낱말 다섯.** 이것 말고는 DB 에 못 들어간다.
 * ⚠️ 2026-09-03 **재실측으로 고쳤다** — 여기엔 「넷」이라고 적혀 있었다. 이제 다섯이다:
 *    `check ((role = ANY (ARRAY['principal','instructor','assistant','student','parent'])))`
 *    낡은 글을 그대로 두면 다음 사람이 「조교는 DB 가 안 받는다」고 믿고 조교 자리를 안 잇는다.
 *
 * ⚠️ 여기에 DB 에 없는 낱말을 더하지 마라. 더하는 순간 화면과 DB 가 두 벌이 되고,
 *    ⑯ 사고가 그대로 되풀이된다. `scripts/check-menu.mjs` 가 **진짜 DB 에 물어** 대조한다.
 */
// ⚠️ **판단은 `lib/perm.js` 한 벌이다**(대전제-4). 여기서 켬/끔을 다시 정하지 않는다.
//    `lib/perm.js` 는 아무것도 안 불러오는 순수 파일이라, 이 파일을 들여오는 미들웨어(Edge)도 안전하다.
import { canFor, pageKeyOf } from "./perm.js";

export const ROLES = Object.freeze({
  PRINCIPAL: "principal",
  INSTRUCTOR: "instructor",
  // ⚠️ 2026-09-03 재실측으로 더했다 — DB CHECK 는
  //    `principal · instructor · assistant · student · parent` 다섯을 받는다.
  //    안 더하면 무엇이 터지나: 조교로 로그인하면 `menuFor` 가 0칸을 주고 `homeFor` 가 null 이라
  //    **로그인은 되는데 아무 데도 못 간다** — ⑯ 과 똑같은 모양이다.
  ASSISTANT: "assistant",
  PARENT: "parent",
  STUDENT: "student",
});

/**
 * **학원 사람 = 원장·강사.** 「staff」는 **묶음 이름일 뿐 역할 값이 아니다** —
 * 그래서 값을 지어내지 않고 **DB 낱말 둘로 만든다.**
 * 아홉 곳에 흩어져 있던 `new Set(["principal","instructor"])` 이 여기 한 줄로 모였다(원칙-1).
 */
// ⚠️ **DB `v2.is_staff()` 와 같은 셋이어야 한다** (2026-09-03 실측:
//    `role in ('principal','instructor','assistant')`). 다르면 화면은 여는데 자료는 안 오거나,
//    화면은 막는데 PostgREST 로는 그대로 열린다.
export const STAFF_ROLES = Object.freeze([ROLES.PRINCIPAL, ROLES.INSTRUCTOR, ROLES.ASSISTANT]);
const STAFF_SET = new Set(STAFF_ROLES);

/** 원장이거나 강사인가 — 목록을 화면마다 다시 적지 않는다(원칙-1) */
export const isStaff = (role) => STAFF_SET.has(String(role ?? ""));

/** 원장인가 — **강사와 갈라야 하는 자리에만** 쓴다(수강료·설정) */
export const isPrincipal = (role) => String(role ?? "") === ROLES.PRINCIPAL;

/**
 * 역할마다 첫 화면. **이 Map 이 유일한 한 벌이다** — `lib/supabase-server.js` 가
 * 이것을 그대로 가져다 쓴다(`export { HOME }`). 글자가 같은 게 아니라 **같은 객체**라
 * 두 벌로 갈릴 자리가 없다(원칙-1).
 *
 * ⚠️ 그냥 객체(`{}`)가 아니라 Map 이다. 객체면 role 이 `"__proto__"`·`"constructor"` 로 올 때
 *    `HOME[role]` 이 주소가 아니라 **함수나 객체**를 돌려주고, 그게 그대로 이동 주소가 되어
 *    앱이 엉뚱한 데로 튄다. Map 은 그런 자리가 없다.
 */
export const HOME = new Map([
  [ROLES.PRINCIPAL, "/"],
  [ROLES.INSTRUCTOR, "/"],
  // ⚠️ 조교의 첫 화면은 **강사와 같은 `/`** 다. 조교 전용 화면을 따로 만들지 않는다 —
  //    원장님이 시키신 것은 「역할별로 페이지를 따로 만들지말고 … 어디까지 오픈할지」다.
  [ROLES.ASSISTANT, "/"],
  [ROLES.PARENT, "/parent"],
  [ROLES.STUDENT, "/me"],
]);

/**
 * 원장·강사의 첫 화면 — 화면들의 「← 대시보드」 단추가 가리키는 곳.
 * ⚠️ `"/"` 를 자리마다 박지 않는다. **위 HOME 에서 끌어온다** — 두 벌이 되면 한쪽만 바뀐다(원칙-1).
 * ⚠️ 옛 이름은 `HOME.staff` 였다. `staff` 는 **DB 에 없는 낱말**이라 지웠다(어긋난 곳 ⑯).
 */
export const STAFF_HOME = HOME.get(ROLES.PRINCIPAL);

/**
 * 대메뉴 — 원장·강사만 본다. 아이·학부모는 메뉴가 없다(자기 화면 하나뿐).
 * ⚠️ 옛 앱의 구성을 **그대로 베끼지 않았다**(대전제 11). 하루 동선 순서로 다시 세웠다 —
 *    매일 여는 것이 위, 처음 한 번 여는 것이 아래.
 */
export const SECTIONS = Object.freeze([
  { href: "/",         icon: "🏠", name: "대시보드", hint: "안 하면 앱이 부르는 것들" },
  { href: "/today",    icon: "📋", name: "오늘",     hint: "검사 · 오늘 학습 · 오늘 숙제 · 마감" },
  { href: "/send",     icon: "✉️", name: "발송",     hint: "데일리리포트 · 하원 · 안내" },
  { href: "/schedule", icon: "🗓", name: "일정",     hint: "할일 · 회차 · 휴강 · 시험" },
  { href: "/books",    icon: "📚", name: "교재",     hint: "교재·단원 · 루틴 · 내신 · 영상" },
  { href: "/ops",      icon: "💳", name: "운영",     hint: "수강료 · 상담 · 신규" },
  { href: "/settings", icon: "⚙️", name: "설정",     hint: "배색 · 진도 체크 · 문구" },
]);

/* ⚠️⚠️ **여기 있던 `HIDDEN_FROM_INSTRUCTOR` 를 걷어냈다** (원장님 2026-09-03 정정).
 *    옛 코드는 `Object.freeze(["/settings"])` 였다 — 「강사는 설정 못 본다」를 **코드가 든 값**으로
 *    갖고 있었다. 원장님이 그것을 뒤집으셨다:
 *      「그런 권한기본값을 니가 미리 정해서 코드에 박아 놓는 게 아니라 내가 웹상에서 설정 할 수 있게 해」
 *    → 이제 어느 대메뉴를 여는지는 **`v2.role_access` 에 든 값**이 정하고,
 *      판단은 `lib/perm.js` 의 `canFor(role, key, rows)` 한 벌이다(대전제-4).
 *    안 되살리는 법: `?? true` · `|| true` · `기본값` 으로 슬쩍 넣지 않는다. 넣는 순간
 *    원장님이 끄신 자리가 되살아나고 **아무 오류도 안 난다.**                                   */

/** 아이·학부모가 보는 것 — 메뉴가 아니라 **자기 화면 하나**다 */
export const FAMILY = Object.freeze({
  [ROLES.STUDENT]: [{ href: "/me", icon: "📖", name: "오늘" }],
  // ⚠️ `/parent/upload` 는 **화면이 아니라 파일을 받는 문**(route.js)이다 — 메뉴에 넣으면 누를 때 404.
  //    자료 보내기 자리는 `/parent` 화면 **안**에 있다.
  [ROLES.PARENT]: [{ href: "/parent", icon: "👨‍👩‍👧", name: "우리 아이" }],
});

/**
 * **수강료를 볼 수 있나.**
 *
 * ⚠️⚠️ **옛 코드는 `isPrincipal(role)` 이었다 — 코드에 박힌 켬/끔 값이다.** 걷어냈다.
 *    이제 답은 `v2.role_access` 의 `ops.fee` 줄이 정하고, 판단은 `canFor` 한 벌이다.
 * ⚠️⚠️ **`rows` 를 꼭 넘겨라.** 안 넘기면 「아직 안 정함」으로 읽혀 **원장 말고는 전부 거짓**이다
 *    (fail closed — 돈이 걸린 자리라 막는 쪽이 안전하다). 지금 표가 0줄이라 답은 옛날과 같지만,
 *    원장님이 켜신 뒤에도 안 열리면 **`rows` 를 안 넘긴 자리**를 찾아야 한다.
 *    ⚠️ 2026-09-03 현재 안 넘기는 자리 — `app/page.js` · `app/settings/page.js` ·
 *       `app/settings/actions.js` (담당이 다르다 · 보고에 올렸다).
 *
 * ⚠️ **이것은 화면 가리개일 뿐이다.** `v2.fee_rule`·`v2.payment` 의 접근 규칙은 이제
 *    `v2.can('ops.fee')` 를 탄다(실측) — 그쪽도 0줄이라 강사에게 닫혀 있다.
 */
export const canSeeFees = (role, rows) => canFor(role, "ops.fee", rows);

/**
 * **설정 화면을 열 수 있나.** 메뉴에서 빼는 것과 **같은 판단 한 벌**을 쓴다.
 * ⚠️ 옛 코드는 `isPrincipal(role)` — 박힌 값이라 걷어냈다. 위 `canSeeFees` 의 경고를 같이 읽어라.
 * ⚠️ 메뉴에서만 빼면 강사가 `/settings` 를 주소로 쳐서 그대로 연다.
 */
export const canSettings = (role, rows) => canFor(role, "page.settings", rows);

/** 지금 어느 메뉴에 서 있나 — 「/today/x」도 「오늘」로 본다 */
export function currentOf(path, list = SECTIONS) {
  if (!path) return null;
  // ⚠️ 긴 것부터 본다 — 「/」가 모든 주소에 걸리면 메뉴가 늘 「대시보드」로 뜬다
  const hit = [...list].sort((a, b) => b.href.length - a.href.length)
    .find((s) => s.href === "/" ? path === "/" : path === s.href || path.startsWith(s.href + "/"));
  return hit?.href ?? null;
}

/**
 * 그 사람이 볼 메뉴. **DB 에 있는 낱말을 그대로 받는다** — 지어낸 「staff」를 안 쓴다(⑯).
 *
 * 원장 = 대메뉴 전부(묻지 않는다) · 강사·조교 = **원장님이 켜 두신 것만** ·
 * 아이·학부모 = 자기 화면 하나 · **모르는 역할 = 0칸**.
 *
 * @param rows `lib/perm.js` 의 `loadPerm()` 이 준 저장값. **없으면 전부 「아직 안 정함」**이라
 *             강사·조교 메뉴가 **0칸**이 된다 — 그게 맞다(코드에 기본값을 두지 않는다).
 *
 * ⚠️⚠️ **0칸이어도 나가는 길은 남는다.** `app/nav.js` 는 `EXIT` 를 조건 없이 그리고
 *    `showNav()` 는 역할만 있으면 참이다(⑯ 의 진짜 피해가 그 자리였다 · 대전제-10 · 0-10).
 * ⚠️ **0칸을 조용히 두지 않는다.** 화면이 「원장님이 아직 안 정하셨습니다」라고 말한다.
 * ⚠️ 짝(`ITEMS.href` ↔ `SECTIONS.href`)이 없는 대메뉴는 **안 보여 준다**(fail closed).
 *    열어 두면 원장님이 끌 수 있는 자리조차 없는 화면이 강사에게 그냥 열린다 —
 *    사라지는 것은 눈에 띄지만 새는 것은 아무도 못 본다.
 * ⚠️ 저장값에 따라 달라지므로 **부를 때마다 새 배열**이다. `===` 으로 견주는 자리를 만들지 마라.
 */
export function menuFor(role, rows) {
  const r = String(role ?? "");
  if (r === ROLES.PRINCIPAL) return SECTIONS;
  if (r === ROLES.INSTRUCTOR || r === ROLES.ASSISTANT)
    return SECTIONS.filter((s) => canFor(r, pageKeyOf(s.href), rows));
  if (r === ROLES.STUDENT || r === ROLES.PARENT) return FAMILY[r];
  return [];   // ⚠️ 역할을 모르면 **아무 화면도 안 준다.** 짐작해서 열지 않는다
}

/**
 * **나가는 길** — 어느 역할이든, 역할을 못 읽어도 **늘 있다**(대전제-10 · 0-10).
 * ⚠️ ⑯ 사고의 진짜 피해가 이 자리였다: 메뉴가 0칸이 되자 로그아웃까지 같이 사라져
 *    홈 화면에 깐 앱(주소창도 뒤로가기도 없다)에서 **빠져나갈 방법이 없었다.**
 */
export const EXIT = Object.freeze({
  href: "/login?switch=1", icon: "🚪", name: "나가기", title: "다른 사람으로 들어가기",
});

/**
 * 메뉴 줄을 그리나 — **로그인한 사람이면 늘 그린다.** 역할을 몰라도 그린다.
 *
 * ⚠️ **메뉴 칸 수에 매달면 안 된다.** 옛 `app/nav.js` 는 `if (!items.length) return null` 이라
 *    메뉴가 0칸이 되는 순간 나가는 길까지 같이 지웠다 — 그게 ⑯ 이다.
 *    안 그리는 경우는 **아직 아무도 아닌 때(로그인 전)** 하나뿐이다.
 */
export const showNav = (role) => String(role ?? "").length > 0;

/**
 * 퀵메모 — 어느 화면에서든 한 줄 적어 두는 자리.
 * ⚠️ 「나중에」가 아니라 **지금** 적어야 안 잊는다. 그래서 메뉴 옆에 늘 있다.
 * ⚠️ 저장은 `v2.todo`(kind='todo', private=true)로 간다 — 새 표를 만들지 않는다(원칙 1).
 */
export const QUICK = Object.freeze({
  icon: "✏️", name: "퀵메모",
  hint: "지금 적어 두면 할 일에 섭니다",
  // ⚠️ 입력칸 글씨는 16px 이상 — 아이폰이 확대하고 **닫아도 확대가 남는다**(퀵메모에서 이미 겪었다)
  minFont: 16,
  // ⚠️ **어디로 저장되는지를 여기 한 곳에 적는다**(원칙-1). 쓰는 손이 이 값을 다시 정하지 않는다 —
  //    두 벌이 되면 한쪽만 고쳐져 퀵메모가 할 일 목록에서 조용히 사라진다.
  kind: "todo",        // 새 표를 만들지 않는다 — v2.todo 에 이미 있는 갈래다(실측 13줄)
  private: true,       // 원장님만 보는 줄
  max: 300,            // 한 줄 메모다. 길면 할 일 목록이 통째로 밀린다
});

/** 퀵메모를 쓸 수 있는 사람 — `v2.todo` 정책이 `staff_all`(=`is_staff()`) 하나뿐이다(실측). 아이·학부모는 못 쓴다 */
export const canQuick = (role) => isStaff(role);
