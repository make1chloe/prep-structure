/**
 * **메뉴 한 벌.** 어느 화면에서든 같은 것을 보여 준다.
 *
 * ⚠️ 계획 0단계 10번 — 「어느 화면에서든 **늘 손에 닿아야 하는 것**을 먼저 정한다:
 *    퀵메모 ✏️ · 로그아웃 · 되돌아가기. 이것들은 **스크롤로 접히는 자리에 두지 않는다.**
 *    표·목록 **안쪽** 스크롤이 위 메뉴를 접게 만들지 않는다 — 화면이 짧으면 다시 펼 방법이 없어져
 *    그 자리가 영영 사라진다(지금 앱에서 이미 나는 일이고, 「아무 페이지에나 다 있어야 한다」는
 *    원장님 요구가 지금 절반만 지켜지는 까닭이다).」
 *
 * ⚠️ **대전제 10** — 홈 화면에 깐 앱에는 주소창도 뒤로가기도 없다.
 *    그래서 **닫는 길·나가는 길이 언제나 화면 안에** 있어야 한다.
 */

/** 역할마다 첫 화면 — `lib/supabase-server.js` 와 **같은 값**이어야 한다(원칙 1) */
export const HOME = Object.freeze({ staff: "/", parent: "/parent", student: "/me" });

/**
 * 대메뉴 — 원장·강사만 본다. 아이·학부모는 메뉴가 없다(자기 화면 하나뿐).
 * ⚠️ 옛 앱의 8개 구성을 **그대로 베끼지 않았다**(대전제 11). 하루 동선 순서로 다시 세웠다 —
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

/** 아이·학부모가 보는 것 — 메뉴가 아니라 **자기 화면 하나**다 */
export const FAMILY = Object.freeze({
  student: [{ href: "/me", icon: "📖", name: "오늘" }],
  // ⚠️ `/parent/upload` 는 **화면이 아니라 파일을 받는 문**(route.js)이다 — 메뉴에 넣으면 누를 때 404.
  //    자료 보내기 자리는 `/parent` 화면 **안**에 있다.
  parent: [{ href: "/parent", icon: "👨‍👩‍👧", name: "우리 아이" }],
});

/** 지금 어느 메뉴에 서 있나 — 「/today/x」도 「오늘」로 본다 */
export function currentOf(path, list = SECTIONS) {
  if (!path) return null;
  // ⚠️ 긴 것부터 본다 — 「/」가 모든 주소에 걸리면 메뉴가 늘 「대시보드」로 뜬다
  const hit = [...list].sort((a, b) => b.href.length - a.href.length)
    .find((s) => s.href === "/" ? path === "/" : path === s.href || path.startsWith(s.href + "/"));
  return hit?.href ?? null;
}

/** 그 사람이 볼 메뉴 */
export function menuFor(role) {
  if (role === "staff") return SECTIONS;
  if (role === "student" || role === "parent") return FAMILY[role];
  return [];   // ⚠️ 역할을 모르면 **아무것도 안 준다.** 짐작해서 열지 않는다
}

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

/** 퀵메모를 쓸 수 있는 사람 — `v2.todo` 정책이 `staff_all` 하나뿐이다(실측). 아이·학부모는 못 쓴다 */
export const canQuick = (role) => role === "staff";
