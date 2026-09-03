/**
 * **누가 무엇을 보나 — 선언 한 벌 · 판단 한 벌** (대전제-4 · 원칙-1).
 *
 * 원장님 2026-09-03:
 *   「역할별로 페이지를 따로 만들지말고 원장이 학부모·학생·강사·조교에게 각각 페이지를
 *     어디까지 오픈할지 온오프 및 세부목록 관리하는 페이지 추가해.」
 *
 * ── 이 파일이 바꾸는 것
 *    지금까지 「강사는 수강료·설정 못 본다」는 **코드에 박혀 있었다**
 *    (`lib/menu.js` 의 `HIDDEN_FROM_INSTRUCTOR` · `canSeeFees` · `canSettings`).
 *    바꾸시려면 사람을 불러야 했다.
 *
 * ── ⚠️⚠️ **그리고 기본값도 없앴다** (원장님 2026-09-03 정정:
 *    「그런 권한기본값을 니가 미리 정해서 코드에 박아 놓는 게 아니라 내가 웹상에서 설정 할 수 있게 해」).
 *    **이 파일에 켬/끔 값이 한 줄도 없다.** 코드가 아는 것은 「무엇을 물을지」(항목 22)뿐이고,
 *    켤지 끌지는 원장님이 화면에서 누르셔서 `v2.role_access` 에만 든다.
 *    안 하면 무엇이 터지나: `?? true` 한 글자만 있어도 원장님이 끄신 자리가 되살아나고,
 *    화면은 「원장님이 켜 두셨습니다」라고 거짓말한다 — 아무 오류도 안 난다.
 *
 * ── ⚠️⚠️ **목록은 여기 한 곳뿐이다.** 화면에도, 마이그레이션 씨앗에도 다시 적지 않는다(원칙-1).
 *    안 하면 무엇이 터지나: 항목을 하나 더한 날 한쪽만 고쳐져 **켜도 안 뜨거나 꺼도 뜬다.**
 *    오류는 안 난다 — 그래서 아무도 모른다.
 *
 * ── ⚠️⚠️ **원장(principal)은 이 표에 안 든다.** `canFor()` 는 원장이면 **묻지 않고 늘 참**이다.
 *    까닭: 원장님이 스스로를 잠글 자리를 만들면, 잠근 그 화면을 **다시 켤 길이 없어진다.**
 *
 * ── ⚠️ **여기에 SQL 을 두지 않는다.** `scripts/check-sql.mjs` 는 `lib/` 의 SQL 을
 *    **진짜 스키마에 PREPARE** 해 본다. 나르는 것은 supabase-js 한 줄이면 되므로 SQL 을 안 쓴다.
 *    ⚠️ 2026-09-03 실측 갱신 — 저장할 표 `v2.role_access(role,key,allowed,updated_at,updated_by)`
 *    는 **이제 진짜로 있다.** 다만 **0줄이다.** 그래서 지금은 원장 말고는 아무것도 못 본다.
 *    그것이 잘못이 아니라 「아직 안 정하셨다」는 사실이고, 화면이 그렇게 말해야 한다.
 *
 * ── ⚠️ 나르는 손(`loadPerm`)이 여기 같이 사는 까닭:
 *    `scripts/check-screen-ops.mjs` 가 「app/ops 는 `../../lib/` 말고는 안 들여온다」를 단언한다.
 *    그래서 `app/_nav/` 같은 데 두면 운영 화면이 이 값을 못 받는다. **SQL 은 아니고**
 *    supabase-js 한 줄이라 위의 PREPARE 검사에도 안 걸린다.
 */

/* ═══════════════════════════════════════════════════════════════════
 * 0. 역할
 * ═══════════════════════════════════════════════════════════════════ */

/** ⚠️ 원장 — **묻지 않는다.** 아래 ROLE_LIST 에 일부러 안 넣었다 */
export const PRINCIPAL = "principal";

/**
 * ⚠️⚠️ **낡은 글을 고쳤다 (2026-09-03 재실측).** 예전 이 자리에는 「조교는 오늘 로그인할 수 없다」
 *   라고 적혀 있었다. **이제 된다.** 실측 그대로 옮긴다 —
 *     · `v2.profiles.role` CHECK = `principal · instructor · assistant · student · parent` (다섯)
 *     · `v2.is_staff()` = `role in ('principal','instructor','assistant')`
 *     · `v2.role_access.role` CHECK = `instructor · assistant · student · parent` (원장은 안 든다)
 *   ⚠️ 낡은 글을 그대로 두면 **다음 사람이 속는다** — 「어차피 안 걸리는 값」이라 여기고
 *      조교 자리를 안 잇거나, 켜 놓고도 안 걸리는 줄 알고 딴 데를 뒤진다.
 *   ⚠️ 다만 **조교 계정은 아직 0줄이다**(실측: principal 2 · instructor 2 · student 23 · parent 21).
 *      켜고 끄신 값은 저장되고 판단에도 걸리지만, 조교가 생기기 전에는 아무도 안 겪는다.
 */
export const ASSISTANT = "assistant";

/**
 * **물어볼 역할 넷.** 원장은 안 든다.
 * `inDb:false` 는 「DB 가 아직 이 낱말을 못 받는다」는 뜻이고, 화면이 그 사실을 그대로 띄운다.
 * ⚠️ 2026-09-03 재실측 — **넷 다 `inDb:true` 다.** `v2.role_access.role` 의 CHECK 가 받는
 *    낱말과 하나씩 짝이다. 짝이 어긋나면 원장님이 켜신 순간 DB 가 거절한다.
 */
export const ROLE_LIST = Object.freeze([
  Object.freeze({ id: "instructor", name: "강사", inDb: true, note: "" }),
  Object.freeze({
    id: ASSISTANT, name: "조교", inDb: true,
    note: "조교 계정은 아직 한 줄도 없습니다 (2026-09-03 실측 — v2.profiles 에 assistant 0명). " +
          "여기서 켜고 끄신 값은 저장되고 판단에도 걸리지만, 조교 계정을 만드시기 전에는 아무도 안 겪습니다.",
  }),
  Object.freeze({ id: "student", name: "학생", inDb: true, note: "" }),
  Object.freeze({ id: "parent", name: "학부모", inDb: true, note: "" }),
]);


/**
 * 원장님이 이 항목을 **말씀하신 적이 있다**는 표시. ⚠️ **값이 아니다** —
 * 화면이 「9월 3일에 이렇게 말씀하셨습니다」라고 **안내만** 하고, 켜고 끄는 것은 원장님이 누르신다.
 * 코드가 그 말씀을 값으로 박아 두지 않는다(원장님 2026-09-03 「니가 미리 정해서 코드에 박아 놓는 게 아니라」).
 */
const 원장이정함 = "원장님 2026-09-03 「아니 강사는 수강료 설정 못보게」";

/* ═══════════════════════════════════════════════════════════════════
 * 1. 항목 22 — **실물에서 뽑았다** (지어낸 것이 아니다)
 * ═══════════════════════════════════════════════════════════════════
 * · `where` 는 그 항목이 **실제로 사는 자리**다. 이름을 바꾸면 여기도 같이 바꾼다.
 * · `href` 는 `lib/menu.js` 의 SECTIONS 와 **하나씩 짝**이다. 짝이 어긋나면
 *   **켜도 안 뜨거나 꺼도 뜬다** — 검사 담당이 이것을 단언한다.
 * · `card` 는 `lib/screens.js` 의 CARDS 이름과 **하나씩 짝**이다. 같은 까닭.
 * · `cost` 는 「끄면 무엇이 사라지나」다. 화면이 그 자리에서 그대로 띄운다 —
 *   모르고 끄면 강사가 일을 못 하는데 아무도 까닭을 모른다.
 */

/**
 * 학원 사람(강사·조교)에게 묻는 항목이라는 표시.
 * ⚠️⚠️ **켬/끔 값이 아니다.** 「누구에게 물어볼 항목인가」일 뿐이다 —
 *    켤지 끌지는 **원장님이 화면에서 정하신다**(원장님 2026-09-03).
 */
const 학원사람 = Object.freeze(["instructor", ASSISTANT]);

export const ITEMS = Object.freeze([
  /* ── 대메뉴 일곱 — `lib/menu.js` 의 SECTIONS 와 하나씩 짝 ───────────── */
  Object.freeze({
    key: "page.home", name: "대시보드", group: "page", href: "/",
    where: 'lib/menu.js SECTIONS "/"', roles: 학원사람, decided: null,
    cost: "끄면 알림센터(첫 화면)를 못 엽니다 — 「안 하면 앱이 부르는 것」이 여기 다 있습니다.",
  }),
  Object.freeze({
    key: "page.today", name: "오늘", group: "page", href: "/today",
    where: 'lib/menu.js SECTIONS "/today"', roles: 학원사람, decided: null,
    cost: "끄면 숙제 검사·오늘 학습·마감을 못 합니다 — 매일 여는 화면입니다.",
  }),
  Object.freeze({
    key: "page.send", name: "발송", group: "page", href: "/send",
    where: 'lib/menu.js SECTIONS "/send"', roles: 학원사람, decided: null,
    cost: "끄면 데일리리포트·하원·안내 문자를 못 보냅니다.",
  }),
  Object.freeze({
    key: "page.schedule", name: "일정", group: "page", href: "/schedule",
    where: 'lib/menu.js SECTIONS "/schedule"', roles: 학원사람, decided: null,
    cost: "끄면 회차·휴강·보강·시험 일정을 못 봅니다.",
  }),
  Object.freeze({
    key: "page.books", name: "교재", group: "page", href: "/books",
    where: 'lib/menu.js SECTIONS "/books"', roles: 학원사람, decided: null,
    cost: "끄면 교재·단원·학습 항목·내신 자료를 못 봅니다.",
  }),
  Object.freeze({
    key: "page.ops", name: "운영", group: "page", href: "/ops",
    where: 'lib/menu.js SECTIONS "/ops"', roles: 학원사람, decided: null,
    cost: "끄면 상담일지와 신규 문의까지 같이 사라집니다 — 수강료만 가리시려면 아래 「수강료」를 끄세요.",
  }),
  Object.freeze({
    key: "page.settings", name: "설정", group: "page", href: "/settings",
    // ⚠️ 이 「끔」은 원장님이 정하신 것이다. 뒤집으려면 원장님께 먼저 여쭌다
    where: 'lib/menu.js SECTIONS "/settings"', roles: 학원사람, decided: 원장이정함,
    cost: "끄면 배색·문구·진도 체크·되풀이 규칙을 못 고칩니다 (이 「누가 무엇을 보나」 화면도 못 엽니다).",
  }),

  /* ── 운영 화면 안의 카드 셋 ─────────────────────────────────────────── */
  Object.freeze({
    key: "ops.fee", name: "수강료", group: "ops",
    // ⚠️⚠️ **열쇠 하나가 두 자리를 판단한다.** 두 열쇠로 나누면 원장님이 두 번 끄셔야 하고,
    //    한쪽만 꺼진 날이 온다 — 강사 메뉴엔 없는데 대시보드엔 금액이 그대로 뜬다(원칙-1 · 대전제-3).
    where: 'app/ops/page.js 「💳 수강료」 카드 + app/page.js 대시보드 fee 카드',
    roles: 학원사람, decided: 원장이정함,
    cost: "끄면 운영 화면의 수강료 카드와 대시보드의 수강료 카드가 **둘 다** 사라집니다 (자료도 안 읽습니다).",
  }),
  Object.freeze({
    key: "ops.consult", name: "상담일지", group: "ops",
    where: 'app/ops/page.js 「🗒 상담일지」 카드',
    // ⚠️ 「켬」인 까닭: 원장님이 집으신 것은 **수강료와 설정 둘뿐**이고 상담일지는 안 집으셨다
    roles: 학원사람, decided: null,
    cost: "끄면 아이별 상담 기록을 못 보고 새 상담도 못 적습니다.",
  }),
  Object.freeze({
    key: "ops.inquiry", name: "신규 문의", group: "ops",
    where: 'app/ops/page.js 「🆕 신규 문의」 카드', roles: 학원사람, decided: null,
    cost: "끄면 전화 문의를 그 자리에서 못 적습니다.",
  }),

  /* ── 학생 화면의 카드 넷 — `lib/screens.js` 의 CARDS.me 그대로 ──────── */
  Object.freeze({
    key: "me.arrival", name: "등원·하원", group: "me", card: "arrival",
    where: "lib/screens.js CARDS.me[arrival]", roles: ["student"], decided: null,
    cost: "끄면 아이가 등원·하원을 스스로 못 찍습니다.",
  }),
  Object.freeze({
    key: "me.today", name: "오늘 할 것", group: "me", card: "today",
    where: "lib/screens.js CARDS.me[today]", roles: ["student"], decided: null,
    cost: "끄면 아이가 오늘 숙제를 못 보고 「다 했어요」도 못 누릅니다.",
  }),
  Object.freeze({
    key: "me.books", name: "내 교재", group: "me", card: "books",
    where: "lib/screens.js CARDS.me[books]", roles: ["student"], decided: null,
    cost: "끄면 아이가 제 진도를 못 보고 스스로 찍지도 못합니다.",
  }),
  Object.freeze({
    key: "me.flags", name: "이의", group: "me", card: "flags",
    where: "lib/screens.js CARDS.me[flags]", roles: ["student"], decided: null,
    cost: "끄면 아이가 단 ❗(이의)를 아이 화면에서 못 봅니다 — 단 것 자체는 남습니다.",
  }),

  /* ── 학부모 화면의 카드 여덟 — `lib/screens.js` 의 CARDS.parent 그대로 ─ */
  Object.freeze({
    key: "parent.intro", name: "처음 오셨나요", group: "parent", card: "intro",
    where: "lib/screens.js CARDS.parent[intro]", roles: ["parent"], decided: null,
    cost: "끄면 처음 오신 학부모님께 드리는 안내가 안 보입니다.",
  }),
  Object.freeze({
    key: "parent.recent", name: "최근 수업", group: "parent", card: "recent",
    where: "lib/screens.js CARDS.parent[recent]", roles: ["parent"], decided: null,
    cost: "끄면 마감한 수업 내용을 학부모님이 못 보십니다 (자료도 안 읽습니다).",
  }),
  Object.freeze({
    key: "parent.homework", name: "과제", group: "parent", card: "homework",
    where: "lib/screens.js CARDS.parent[homework]", roles: ["parent"], decided: null,
    cost: "끄면 숙제와 「다음에 할 것」이 안 보입니다.",
  }),
  Object.freeze({
    key: "parent.next", name: "다음 달", group: "parent", card: "next",
    // ⚠️ 이 달 달력은 카드가 아니라 늘 서는 자리다 — 꺼도 이 달은 남는다
    where: "lib/screens.js CARDS.parent[next] (둘째 달부터의 달력)",
    roles: ["parent"], decided: null,
    cost: "끄면 다음 달 달력이 안 보입니다 (이 달 달력은 그대로 있습니다).",
  }),
  Object.freeze({
    key: "parent.files", name: "자료 보내기", group: "parent", card: "files",
    where: "lib/screens.js CARDS.parent[files]", roles: ["parent"], decided: null,
    cost: "끄면 학부모님이 사진·파일을 못 보내십니다.",
  }),
  Object.freeze({
    key: "parent.word", name: "남기실 말", group: "parent", card: "word",
    where: "lib/screens.js CARDS.parent[word]", roles: ["parent"], decided: null,
    cost: "끄면 결석·지각 예정과 남기실 말을 못 보내십니다.",
  }),
  Object.freeze({
    key: "parent.reports", name: "월간 리포트", group: "parent", card: "reports",
    where: "lib/screens.js CARDS.parent[reports]", roles: ["parent"], decided: null,
    cost: "끄면 보내 드린 월간 리포트를 다시 못 보십니다 (자료도 안 읽습니다).",
  }),
  Object.freeze({
    key: "parent.sent", name: "보낸 것", group: "parent", card: "sent",
    where: "lib/screens.js CARDS.parent[sent]", roles: ["parent"], decided: null,
    cost: "끄면 「보내신 것을 원장님이 보셨나」를 못 보십니다 (자료도 안 읽습니다).",
  }),
]);

/** 열쇠 → 항목. 목록을 훑지 않는다 */
const BY_KEY = new Map(ITEMS.map((it) => [it.key, it]));
/** 주소 → 열쇠 (`lib/menu.js` 가 SECTIONS 를 거를 때 쓴다) */
const BY_HREF = new Map(ITEMS.filter((it) => it.href).map((it) => [it.href, it.key]));

/** 그 항목의 선언. 모르면 `null` — **지어내지 않는다** */
export const itemOf = (key) => BY_KEY.get(String(key ?? "")) ?? null;

/** 대메뉴 주소에 붙은 열쇠. 짝이 없으면 `null` */
export const pageKeyOf = (href) => BY_HREF.get(String(href ?? "")) ?? null;

/** 카드 이름에 붙은 열쇠 — `me`·`parent` 화면이 쓴다 (`cardKeyOf("me","books") → "me.books"`) */
export const cardKeyOf = (screen, card) => {
  const k = `${String(screen ?? "")}.${String(card ?? "")}`;
  return BY_KEY.has(k) ? k : null;
};

/** 그 역할에게 **묻는** 항목만. 원장은 아무것도 안 묻는다(늘 참이므로) */
export function itemsFor(role) {
  const r = String(role ?? "");
  if (!r || r === PRINCIPAL) return [];
  return ITEMS.filter((it) => it.roles.includes(r));
}

/**
 * **그 역할에게 이 항목이 지금 어떤 상태인가** — 셋이다.
 *
 * ⚠️⚠️ **「아직 안 정함」이 세 번째 상태다.** 예전에는 코드가 기본값을 들고 있어서
 *    안 정한 것과 끈 것이 구별되지 않았다. 원장님 2026-09-03:
 *    「**그런 권한기본값을 니가 미리 정해서 코드에 박아 놓는 게 아니라 내가 웹상에서 설정 할 수 있게 해**」
 *    → 코드는 **무엇을 물을지**만 알고, **켤지 끌지는 하나도 모른다.**
 * ⚠️ 안 정한 것은 **안 보인다**(막는 쪽이 안전하다). 다만 **조용히 막지 않는다** —
 *    화면이 「원장님이 아직 안 정하셨습니다」라고 말하고, 대시보드가 원장님을 부른다.
 *
 * @returns "on" · "off" · "unset"
 */
export function stateOf(role, key, rows) {
  const r = String(role ?? "");
  const it = BY_KEY.get(String(key ?? ""));
  if (!it || !it.roles.includes(r)) return "off";      // 안 묻는 자리는 짐작해서 열지 않는다
  const saved = rows == null ? undefined : rows[`${r}|${it.key}`];
  if (typeof saved !== "boolean") return "unset";
  return saved ? "on" : "off";
}

/**
 * **아직 안 정한 것이 몇 개인가** — 원장님을 부르는 근거다.
 * ⚠️ 세어 나오는 값이라 저장하지 않는다(원칙-5).
 */
export function unsetCount(rows) {
  let n = 0;
  for (const it of ITEMS)
    for (const r of it.roles) if (stateOf(r, it.key, rows) === "unset") n++;
  return n;
}

/** 물어야 하는 칸 전부 — 화면이 표를 그릴 때 쓴다 (역할 × 항목) */
export function everyCell(rows) {
  const out = [];
  for (const it of ITEMS)
    for (const r of it.roles) out.push({ role: r, key: it.key, item: it, state: stateOf(r, it.key, rows) });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
 * 2. 판단 — 앱 쪽에서 부르는 것은 이것 하나다
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * **이 사람이 이것을 보나.**
 *
 * @param role  `v2.profiles.role` 값 그대로
 * @param key   ITEMS 의 열쇠
 * @param rows  저장값 — `rowsOf()` 가 만든 납작한 객체. **없으면(`null`) 전부 「아직 안 정함」이다**
 *
 * ⚠️ **원장이면 묻지 않고 늘 참이다.** 스스로를 잠글 자리를 만들지 않는다.
 * ⚠️ 모르는 열쇠·안 묻는 역할은 **거짓**이다. 짐작해서 열지 않는다(대전제-0).
 */
export function canFor(role, key, rows) {
  if (String(role ?? "") === PRINCIPAL) return true;
  // ⚠️ **안 정한 것은 거짓이다.** 코드에 기본값을 두지 않는다(원장님 2026-09-03).
  //    「끔」과 「아직 안 정함」은 보이는 것은 같지만 **화면이 다르게 말한다** — stateOf 를 봐라.
  return stateOf(role, key, rows) === "on";
}

/** 화면이 그대로 쓰는 자리 이름 — 글자를 자리마다 다시 적지 않는다(원칙-1) */
export const 정하는곳 = "[설정 → 누가 무엇을 보나]";

/**
 * **왜 안 보이나** — 막힌 화면에 그대로 띄우는 글 (대전제-0 · 대전제-10).
 *
 * ⚠️⚠️ **「아직 안 정하셨습니다」와 「꺼 두셨습니다」를 다르게 말한다.**
 *    지금 `v2.role_access` 는 0줄이라 **전부 「아직 안 정함」**이다. 이때 「권한이 없습니다」라고만
 *    하면 강사·조교·아이·학부모가 **원장님이 막으신 줄 알고 포기한다** — 아무도 까닭을 모른다.
 *    그것을 막는 것이 이 함수가 있는 까닭이다.
 * ⚠️ 「권한이 없습니다」로 끝내지 않는다. **누가 어디서 켤 수 있는지**까지 적는다 —
 *    안 그러면 강사가 원장님께 전화해서 물어야 한다.
 *
 * @param state `stateOf()` 가 준 값. **안 주면 「안 정함」으로 안 우긴다** — 안 준 채 부르면
 *              두 갈래를 못 가르므로, 부르는 쪽이 반드시 `stateOf()` 를 함께 부른다.
 */
export function whyOff(role, key, state) {
  const it = BY_KEY.get(String(key ?? ""));
  const 이름 = ROLE_LIST.find((x) => x.id === String(role ?? ""))?.name ?? String(role ?? "이 역할");
  if (!it) return `모르는 항목입니다 (${String(key ?? "")}) — 지어내지 않습니다.`;
  if (state === "unset")
    return `「${it.name}」은(는) 원장님이 **아직 안 정하셨습니다.** ` +
           `${이름}에게 열지 닫을지가 아직 한 번도 정해지지 않았습니다 — 막힌 것이 아닙니다. ` +
           `원장님이 ${정하는곳} 에서 켜 주시면 바로 열립니다.`;
  return `「${it.name}」은(는) 원장님이 ${이름}에게 **꺼 두셨습니다.** ` +
         `다시 여시려면 원장님이 ${정하는곳} 에서 켜시면 됩니다.`;
}

/**
 * 막힌 화면이 그대로 그리는 한 벌 — `{ ok, state, msg, how }`.
 * ⚠️ 화면마다 이 글을 다시 짓지 않는다(원칙-1). 다시 지으면 한쪽만 「안 정하셨습니다」를 말한다.
 * ⚠️ **나가는 길을 `how` 에 적는다**(대전제-10) — 막힌 화면에서 갈 데가 없으면 앱에 갇힌다.
 *
 * @param why `loadPerm()` 이 준 「못 읽었다」 까닭. 있으면 **막되 그 까닭을 그대로** 말한다.
 */
export function blockedBy(role, key, rows, why = null) {
  if (canFor(role, key, rows)) return { ok: true, state: "on", msg: "", how: [] };
  const it = BY_KEY.get(String(key ?? ""));
  const state = stateOf(role, key, rows);
  // ⚠️ 못 읽었으면 **기본값으로 돌지 않는다.** 「못 읽었다」로 막고 그렇게 말한다(대전제-0)
  if (why)
    return { ok: false, state: "unread", msg: why,
             how: ["잠깐 뒤에 다시 열어 보시고, 그래도 같으면 원장님께 알려주세요.",
                   "메뉴 줄의 「🚪 나가기」로 다른 계정으로 들어가실 수 있습니다."] };
  return {
    ok: false, state,
    msg: whyOff(role, key, state),
    how: [
      it?.cost ? `이 자리에서 못 하시는 일: ${it.cost}` : null,
      state === "unset"
        ? "원장님께 「누가 무엇을 보나에서 이 화면을 켜 주세요」라고 말씀해 주세요."
        : "원장님이 일부러 끄신 자리입니다 — 필요하시면 원장님께 말씀해 주세요.",
      "메뉴 줄의 「🚪 나가기」로 다른 계정으로 들어가실 수 있습니다.",
    ].filter(Boolean),
  };
}

/**
 * **차례를 입힌 뒤 걸러낸다** (④).
 *
 * ⚠️⚠️ `lib/screens.js` 의 `applyOrder` 와 **다른 일이다.**
 *    저쪽은 **사람마다 차례**, 이쪽은 **역할마다 열림**이다.
 *    한 함수에 섞으면 「차례를 저장했는데 꺼진 카드가 되살아난다」·「끈 카드가 차례에서 사라져
 *    다시 켜도 맨 뒤로 간다」가 된다. 그래서 **차례를 먼저 입히고 그다음 이것을 부른다.**
 *
 * @param order 이미 `applyOrder()` 를 지난 카드 이름 배열
 */
export function visibleCards(role, screen, order, rows) {
  return (Array.isArray(order) ? order : []).filter((card) => {
    const k = cardKeyOf(screen, card);
    // ⚠️ 선언에 없는 카드는 **그대로 둔다.** 여기서 지우면 아직 항목을 안 만든 카드가
    //    조용히 사라진다 — 없애는 것은 원장님이 끄셨을 때뿐이다
    return k == null ? true : canFor(role, k, rows);
  });
}

/* ═══════════════════════════════════════════════════════════════════
 * 3. 저장값을 나르는 손 — **판단이 아니다**
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * 저장하는 표.
 *
 * ⚠️⚠️ **2026-09-03 실측으로 고쳤다 — 켬/끔 칸 이름이 틀려 있었다.**
 *    여기에는 `is_on` 이라고 적혀 있었는데 진짜 칸은 `allowed` 다:
 *      `v2.role_access(role text, key text, allowed boolean, updated_at timestamptz, updated_by uuid)`
 *      · PK `(role, key)` · `role` CHECK = instructor · assistant · student · parent
 *      · 정책 셋 — 읽기는 `my_role()='principal' or role = my_role()`, 쓰기는 원장만
 *    ⚠️ 안 고치면 무엇이 터지나: `select role,key,is_on` 이 **42703 으로 실패**하고,
 *       `loadPerm` 이 `rows:null` 을 돌려주어 **원장 말고는 모든 화면이 통째로 막힌다.**
 *       오류 화면도 안 뜬다 — 「원장님이 아직 안 정하셨습니다」로 조용히 굳는다.
 * ⚠️ 칸 이름을 `on` 으로 안 짓는 것은 옳다 — `on` 은 Postgres 예약어다.
 */
export const TABLE = Object.freeze({
  name: "role_access",
  select: "role,key,allowed",
  cols: Object.freeze({ role: "role", key: "key", on: "allowed" }),
});

/** DB 줄 → 납작한 객체 `{"강사|page.settings": false}`. 꼴이 다른 줄은 **버린다**(지어내지 않는다) */
export function rowsOf(raw) {
  const out = {};
  for (const r of Array.isArray(raw) ? raw : []) {
    const role = String(r?.[TABLE.cols.role] ?? "");
    const key = String(r?.[TABLE.cols.key] ?? "");
    const on = r?.[TABLE.cols.on];
    if (!role || !key || typeof on !== "boolean") continue;
    out[`${role}|${key}`] = on;
  }
  return out;
}

/**
 * 못 읽은 까닭을 사람 말로. ⚠️ 「표가 없다」와 「막혔다」를 가른다 — 할 일이 다르다.
 *
 * ⚠️⚠️ **「기본값으로 돌고 있습니다」라고 쓰지 않는다 — 기본값이 없다.**
 *    예전 이 자리에는 그렇게 적혀 있었다. 그건 코드가 켬/끔 값을 들고 있던 시절의 글이고,
 *    지금 그렇게 말하면 **거짓말**이다: 못 읽으면 원장 말고는 아무것도 못 본다.
 *    안 고치면 무엇이 터지나 — 강사가 「기본값으로 돈다」는 글을 읽고 기다리는데
 *    화면은 영영 안 열린다. 무엇을 해야 하는지도 모른다.
 */
function whyRead(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "");
  const 꼬리 = " ⚠️ 못 읽었으므로 **아무 화면도 열지 않습니다** — 짐작해서 열지 않습니다(대전제-0).";
  if (code === "42P01" || code === "PGRST205" || (/role_access/.test(msg) && /does not exist|없/.test(msg)))
    return "⚠️ 「누가 무엇을 보나」를 저장하는 표(v2.role_access)를 못 찾았습니다." + 꼬리;
  if (code === "42703")
    return `⚠️ 「누가 무엇을 보나」 표의 칸 이름이 코드와 다릅니다 (${msg || "42703"}).` + 꼬리;
  if (code === "PGRST106")
    return "⚠️ 앱 설정이 아직 덜 됐습니다 (v2 스키마 노출 안 됨)." + 꼬리;
  if (code === "42501" || /permission denied/i.test(msg))
    return "⚠️ 이 계정으로는 「누가 무엇을 보나」를 못 읽습니다 (접근 규칙)." + 꼬리;
  return `⚠️ 「누가 무엇을 보나」를 못 읽었습니다 (${code || msg || "까닭 모름"}).` + 꼬리;
}

/**
 * 저장값을 읽는다. **조회 한 번**이다 (`select role,key,allowed`).
 *
 * @param sb **이미 `schema("v2")` 를 지난** supabase 클라이언트 (`sb.from(...)`)
 * @returns { rows, why } — `rows:null` 이면 **못 읽었다**는 뜻이고 `why` 가 그 까닭이다.
 *          ⚠️⚠️ `rows:null` 을 「전부 켬」으로도 「기본값」으로도 바꾸지 마라 —
 *          `canFor(role, key, null)` 은 원장 말고 전부 거짓이다(fail closed). 그게 맞다.
 * @returns rows `{}`(빈 객체) 는 **읽기는 됐는데 아직 0줄**이라는 뜻이다 — 지금 진짜 그렇다.
 *          `null`(못 읽음)과 `{}`(안 정함)은 **다른 사실**이라 화면이 다르게 말한다.
 *
 * ⚠️ **던지지 않는다.** 표가 없다고 화면이 죽으면 표를 만들 사람도 못 들어온다.
 */
export async function loadPerm(sb) {
  if (!sb || typeof sb.from !== "function")
    return { rows: null, why: "⚠️ DB 문이 없어 「누가 무엇을 보나」를 못 읽었습니다 — 아무 화면도 열지 않습니다." };
  try {
    const r = await sb.from(TABLE.name).select(TABLE.select);
    if (r?.error) return { rows: null, why: whyRead(r.error) };
    return { rows: rowsOf(r.data), why: null };
  } catch (e) {
    return { rows: null, why: whyRead({ message: String(e?.message ?? e) }) };
  }
}
