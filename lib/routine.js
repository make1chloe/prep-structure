/**
 * **숙제 차리기** — 검사(①)가 방아쇠이고, 오늘 학습(②)과 오늘 숙제(③)는 **저절로** 깔린다.
 * (계획 절 ⑨ · ⑨-a · ㉒ · ㉓ · ㊹ · 확정 ④와 붙임 · 「교재 배정」 · ⑬ · ㊺-a)
 *
 * ```
 *  ① 숙제 검사   집에서 해온 것을 ○△✕     ← 원장님이 누르는 유일한 자리
 *        │
 *        ├─ 검사하면 진도가 올라가고 커서가 움직인다
 *        ▼
 *  ② 오늘 학습   학원에서 그 자리에서 하는 것      ← 여기가 이 파일
 *  ③ 오늘 숙제   집에 내보내는 것 (복습 + 다음 단원 예습)  ← 여기가 이 파일
 * ```
 *
 * ── 어디까지 SQL 이고 어디부터 JS 인가 (원칙 1 — 같은 판단을 두 벌로 두지 않는다) ──
 *
 *  SQL 이 하는 판단 (여기서 **다시 만들지 않는다**):
 *    v2.cursor_of(학생,교재)   지금 (회독, 대단원, 갈래) — **저장하지 않는다**   0018/0022
 *    v2.unit_label(단원,전체)  화면에 뭐라고 부르나                              0056
 *    v2.book_progress(…)       진도율 (done, skipped, total)                     0052
 *    v2.today_load(학생,날짜)  **이미 저장된** 판의 분량                          0018
 *
 *  lib/chunk.js 가 하는 판단 (여기서 **다시 만들지 않는다**):
 *    chunkPlan()  이번에 몇 쪽을 낼까 · coveredBy()  다 덮었나 · pageCount()  쪽 세기
 *
 *  이 파일이 하는 일:
 *    · 오늘 이 아이가 든 교재를 모으고 **멈춤 상태**를 얹는다 (⑬)
 *    · 커서가 가리킨 대단원의 남은 줄을 **덩어리**로 묶는다 (㊻ — 갈래 축이 있다)
 *    · 영역 루틴/학생 루틴을 **세 묶음**(학원·숙제·예습)으로 편다 (㉒)
 *    · 세 묶음이 다 비면 **그 회차를 건너뛰고**, 그래도 비면 **밝힌다** (확정 ④ 붙임)
 *    · 많으면 **말만 한다.** 밀지 않는다 (㊺-a)
 *
 * @param db  { query(sql, params) } — pg 든 supabase 어댑터든. 검사가 가짜를 끼운다
 */
import { chunkPlan, coveredBy, pageCount, leftPages } from "./chunk.js";
/**
 * ⚠️ **날짜를 여기서 다시 만들지 않는다**(원칙 1). `lib/session.js` 의 것을 부른다.
 *    node-pg 는 `date` 칸을 **그 기계 시간대의 자정** Date 로 준다 —
 *    서울(+9)에서 `toISOString()`/`getUTC*` 로 읽으면 **하루가 뒤로 밀린다.**
 *    하루가 밀리면 오늘 판을 어제 날짜로 차려 **그날 숙제가 통째로 빈다.**
 */
import { ymd } from "./session.js";

// ────────────────────────────────────────────────────────────────
// 못 박아 두는 값
// ────────────────────────────────────────────────────────────────

/**
 * ⚠️ **이것은 상한이 아니다.** 원장님이 빼신 값이다(㊺-a) —
 *    「하루 총합 몇 쪽까지?? 왜 정하는지 이해를 못하겠네.」
 *    실측한 정규 하루가 **가운데 24쪽**이라, 그보다 많으면 **「많습니다」라고 말만 한다.**
 *    막지 않고, 줄이지 않고, **교재를 밀지 않는다.**
 *    미는 순간 원장님이 모르는 사이 진도가 바뀐다 — 밀어 봤더니 늘 같은 교재만 밀렸다(41건).
 */
export const BUSY_PAGES = 24;

/** 판 안의 자리. `check`(검사)는 이 파일이 만들지 않는다 — 그건 어제 낸 숙제다 */
export const SLOTS = ["class", "home", "next"];

/** 멈춤 세 가지 (⑬). DB 의 `student_book.stop_mode` 와 같은 말이다 */
export const STOP = { RUNNING: "running", HW_OFF: "hw_off", BOOK_OFF: "book_off" };

// ────────────────────────────────────────────────────────────────
// ① 루틴 한 줄이 어느 묶음으로 가나
// ────────────────────────────────────────────────────────────────

/**
 * **예습인가** — ③의 뒷쪽(다음 단원 예습)으로 갈 줄인가.
 *
 * ⚠️ **확인 안 됨.** 루틴 엑셀은 `등원 · 숙제 · 예습숙제-다음단원` **세 칸**이었는데
 *    DB(0010)의 `place` 는 `class · home · both` **셋뿐**이라 예습 칸이 없다.
 *    지금은 **항목 이름**으로 가른다 — 실측 「교재예습」 한 종류뿐이다(단어·독해).
 *    이름을 「예습(교재)」로 바꾸면 계속 맞고, 「미리보기」로 바꾸면 **조용히 숙제 묶음으로 간다.**
 *    → 보고 needsDb ①에 `place='next'` 를 더하는 SQL 을 적었다. 그게 들어오면 아래 첫 줄만 산다.
 */
export function isPreview(item = {}) {
  if (item.place === "next") return true;              // DB 가 갈래를 갖게 되면 이 줄만 남는다
  return /예습/.test(item.name || "");                 // ⚠️ 임시 — 이름으로 가른다
}

/**
 * 그 줄이 설 자리들. `both` 는 **학원에서 한 번, 집에서 또 한 번** 한다는 뜻이다(0036).
 * ⚠️ 모르는 값이 오면 **빈 배열**을 준다 — 아무 데나 끼워 넣지 않는다.
 *    끼워 넣으면 원장님이 안 시킨 것이 아이에게 나가고, 오류는 안 난다.
 */
export function slotsOf(item = {}) {
  if (isPreview(item)) return ["next"];
  if (item.place === "class") return ["class"];
  if (item.place === "home") return ["home"];
  if (item.place === "both") return ["class", "home"];
  return [];
}

// ────────────────────────────────────────────────────────────────
// ② 덩어리 — 「오늘 이 교재에서 어디를 내나」의 최소 단위
// ────────────────────────────────────────────────────────────────

/**
 * 한 줄이 어느 덩어리에 드나.
 *
 * ⚠️⚠️ **워크북은 대단원 전체가 한 덩어리다**(0062, 원장님 2026-09-02).
 *    쓰작2 는 대단원당 워크북이 **10줄**이라, 소단원마다 쪼개면 **열 배로 잘게** 나간다.
 *    오류가 안 나고 화면도 멀쩡해서 몇 달 뒤에야 드러난다.
 * ⚠️ 소단원 이름이 **비어 있으면 줄마다 따로**다 — 3800제 49개 CHAPTER 전부가
 *    「시험대비」 한 줄에 소단원이 없다(실측). 이름 없는 줄을 한 덩어리로 뭉치면
 *    **50~70문항짜리가 앞 줄들과 같이 통째로** 나간다.
 * ⚠️ 소단원 기준(`sub`) 교재에서는 갈래를 **안 가른다** — 소단원마다 본책+워크북 나란히(㉙).
 *    실측으로 워크북 있는 11권은 전부 `chapter` 라 이 길은 지금 안 쓰이지만,
 *    원장님이 한 권을 소단원 기준으로 바꾸시면 그날 바로 쓰인다.
 */
const WB_KEY = "wb";

export function lumpKey(u = {}, { orderBasis = "sub", chunkDepth = "sub" } = {}) {
  const wb = u.is_workbook === true;
  if (orderBasis === "chapter" && wb) return WB_KEY;    // 대단원 통째 (0062)
  const name =
    chunkDepth === "chapter" ? u.chapter
    : chunkDepth === "mid" ? (u.mid || u.sub)
    : (u.sub || u.mid);
  const g = String(name ?? "").trim();
  const side = orderBasis === "chapter" ? (wb ? "w" : "b") : "";
  return g ? `${side}|${g}` : `#${u.id}`;               // 이름이 없으면 줄마다 따로
}

/** 여러 줄에서 나온 이름 — **줄이지 않는다**(⑨-a 4번: 폰에서 단원 이름은 안 줄인다) */
export function lumpLabel(units = []) {
  const full = [...new Set(units.map((u) => u.label).filter(Boolean))];
  if (!full.length) return "";
  // ⚠️ 줄이 셋 이상이면 **몇 줄인지 같이 띄운다.** 이름만 합쳐 놓으면 원장님이
  //    8줄이 나가는 줄 모른 채 저장한다 (어법 서술형 제패 PART 4 실측 8줄).
  // ⚠️⚠️ **이름이 겹쳐 하나로 줄어든 때도 띄운다.** 한 대단원 안에서 중단원만 다르고
  //    소단원 이름이 같은 줄들은 `v2.unit_label` 이 **글자까지 같은 이름**을 준다 —
  //    두 줄이 나가는데 화면에는 이름 한 줄만 떠서 원장님이 UNIT 01·02 두 군데가
  //    나가는 줄 모른 채 저장한다 (실측: 어법끝스타트 PART 2 › Points to Remember).
  const many = units.length > 2 || full.length < units.length ? ` (${units.length}줄)` : "";
  if (full.length === 1) return full[0] + many;
  const head = units[0]?.chapter ? `${units[0].chapter} › ` : "";
  const tails = full.map((t) => (head && t.startsWith(head) ? t.slice(head.length) : t));
  return head + tails.join(" · ") + many;
}

/**
 * 덩어리들. 차례는 **대단원 안에서 본책 갈래 전부 → 워크북 갈래 전부**(㊻ · 0022와 같은 차례)
 *
 * ⚠️⚠️ **이름이 같아도 줄 차례가 끊기면 다른 덩어리다.** 이름만으로 묶으면 한 대단원 안에서
 *    되풀이되는 이름이 통째로 한 덩어리가 되어 **한 회차에 CHAPTER 넷이 나간다.**
 *    실측(2026-09-02): 어법끝스타트 「PART 1 네모 어법 › UNIT Exercise」가 중단원 10개에 걸쳐
 *    **10줄 한 덩어리**(p.38~141) · 어법 서술형 제패 2권 「PART 4 준동사」가 CHAPTER 15~18
 *    **8줄 한 회차**. 그런 자리가 4권 24군데이고 지금 그 교재를 든 아이가 6명이다.
 *    오류도 안 나고 화면도 멀쩡해서 몇 달 뒤에야 드러난다.
 * ⚠️⚠️ **맞닿았는지만 보면 안 된다 — 두 군데서 샜다** (2026-09-02 확인자):
 *   (가) 걸러진 목록만 보면 **가운데 줄이 done/skip 이라 빠진 순간** 다른 중단원의 같은 이름이
 *        맞닿아 다시 뭉친다. 실측 재현 — 이시은 · 어법끝스타트 PART 2, 원장님이
 *        「UNIT 01 › UNIT Exercise (p.154~156)」 한 줄을 건너뛰면 per_session=2 인데
 *        UNIT 01 과 **아직 안 배운 UNIT 02** 가 한 덩어리가 되어 **3줄 · p.150~153, p.158~160**
 *        이 한 회차에 나갔다. done:true 라 쪽수도 안 뜬다.
 *   (나) 중단원이 바뀌는 첫 줄끼리 원래부터 맞닿아 있으면 (사이에 낀 줄이 아예 없으면) 뭉친다.
 *   → 그래서 **두 겹으로 막는다**:
 *      ① `opt.seq` — 걸러지기 **전** 줄 차례를 받으면 그것으로 끊김을 본다 (가)
 *      ② 같은 갈래(본책/워크북)끼리 **`mid`(중단원)가 바뀌면 끊는다** (나)
 * ⚠️ ②가 ㉙(소단원 기준에서 본책+워크북 나란히)을 안 깨는 까닭 — 갈래가 **다르면** mid 를 안 본다.
 *    워크북 줄의 mid 는 본책과 다르게 적히지만(「워크북 …」) 갈래가 달라 끊지 않는다.
 *    실측(2026-09-02): 워크북이 있는 교재 11권이 전부 `chapter` 기준이라 부딪히는 줄이 없고,
 *    한 대단원 안에서 같은 소단원 이름이 되풀이되는 자리 **전부**(어법끝스타트·어법 서술형 제패
 *    ·어법끝이센셜) 가 줄마다 mid 가 달라 ②로 갈린다. mid 로도 못 가르는 자리는 **0군데**다.
 */
export function lumpsOf(units = [], opt = {}) {
  // 줄 차례(sort)대로 훑으며 **이름이 끊길 때마다** 새 덩어리 번호를 준다.
  // ⚠️ `opt.seq` 는 **걸러지기 전** 줄 전부다 — 없으면 받은 것으로만 본다(그러면 (가)가 산다)
  const src = (opt.seq?.length ? opt.seq : units);
  const seq = [...src].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  /**
   * ⚠️⚠️ ②(mid 로 끊기)는 **덩어리가 중단원보다 잘 때만** 건다.
   *    `chunkDepth` 가 `chapter`(대단원 통째)나 `mid`(중단원 통째)면 중단원이 바뀔 때마다 끊는 것이
   *    바로 **원장님이 하지 말라고 한 잘게 쪼개기**다 — 지금 그런 교재는 0권이지만
   *    (실측 2026-09-02: 162권 전부 `sub`) 원장님이 한 권을 바꾸시는 날 조용히 열 배로 잘게 나간다.
   */
  const useMid = (opt.chunkDepth ?? "sub") !== "chapter" && (opt.chunkDepth ?? "sub") !== "mid";
  const keyOf = new Map();
  const nth = new Map();
  let prev = null, prevMid = null, prevWb = null;
  for (const u of seq) {
    const base = lumpKey(u, opt);
    if (base === WB_KEY) { keyOf.set(u.id, base); continue; }   // 대단원 통째 — 끊김을 안 본다
    const wb = u.is_workbook === true;
    const mid = String(u.mid ?? "").trim();
    // ② 같은 갈래인데 중단원이 바뀌면 **이름이 같아도 다른 덩어리다**
    const midBroke = useMid && prev !== null && wb === prevWb && mid !== prevMid;
    if (base !== prev || midBroke) nth.set(base, (nth.get(base) ?? 0) + 1);
    keyOf.set(u.id, `${base}#${nth.get(base)}`);
    prev = base; prevMid = mid; prevWb = wb;
  }

  const map = new Map();
  for (const u of units) {
    const key = keyOf.get(u.id) ?? lumpKey(u, opt);
    if (!map.has(key)) map.set(key, { key, units: [], sort: u.sort ?? 0, isWorkbook: u.is_workbook === true });
    const l = map.get(key);
    l.units.push(u);
    l.sort = Math.min(l.sort, u.sort ?? 0);
  }
  return [...map.values()]
    .sort((a, b) =>
      (opt.orderBasis === "chapter" ? (a.isWorkbook ? 1 : 0) - (b.isWorkbook ? 1 : 0) : 0) ||
      a.sort - b.sort)
    .map((l) => ({
      ...l,
      label: lumpLabel(l.units),
      pages: l.units.reduce((s, u) => s + pageCount(u), 0),
      questions: l.units.reduce((s, u) => s + (Number(u.q_count) || 0), 0),
      unitIds: l.units.map((u) => u.id),
    }));
}

// ────────────────────────────────────────────────────────────────
// ③ 분량 — 갯수가 늘리는 것은 항목 수가 아니라 **분량**이다 (㊹)
// ────────────────────────────────────────────────────────────────

/**
 * **쪽이 이어지는 줄끼리** 묶는다 — 안 이어지면 사이에 낀 쪽은 **우리 것이 아니다.**
 *
 * ⚠️⚠️ 왜 필요한가 — `chunk.js` 의 `lumpOf` 는 **가장 앞쪽~가장 뒤쪽을 통째로** 잡는다.
 *    줄들이 안 이어져 있으면 사이에 낀 **남의 쪽**과 **이미 ○ 인 줄의 쪽**이 오늘 분량에
 *    삼켜진다. 실측(2026-09-02):
 *      · 김서은 「어법 서술형 제패 2권」 진짜 30쪽인데 **62쪽 · p.26~87** 이 나갔다
 *      · 워크북 대단원에서 가운데 한 줄만 이미 ○ 인 아이 — 진짜 15쪽인데 18쪽,
 *        12쪽으로 줄이면 **이미 끝낸 p.41~43 이 다시 숙제로** 나갔다
 *      · 원장님이 건너뛴(skip) 단원의 쪽이 그대로 아이에게 나간다
 *    오류가 안 나고 화면도 멀쩡하다. **없는 쪽을 지어내는 자리**다(대전제 0).
 */
export function pageRuns(units = []) {
  const withSpan = units
    .filter((u) => (u.page_start ?? u.pageStart) != null)
    .map((u) => ({ u, a: Number(u.page_start ?? u.pageStart), b: Number(u.page_end ?? u.pageEnd ?? u.page_start ?? u.pageStart) }))
    .sort((x, y) => x.a - y.a || x.b - y.b);
  const runs = [];
  for (const s of withSpan) {
    const last = runs[runs.length - 1];
    if (last && s.a <= last.to + 1) { last.to = Math.max(last.to, s.b); last.units.push(s.u); }
    else runs.push({ from: s.a, to: s.b, units: [s.u] });
  }
  return runs;
}

const rangeText = (give = []) => give.map(([a, b]) => (a === b ? `p.${a}` : `p.${a}~${b}`)).join(", ");

/**
 * 이번 회차에 실제로 낼 범위. 쪼개기는 `lib/chunk.js` 가 한다 — **다시 만들지 않는다.**
 *
 * ⚠️ **쪽을 모르는 줄에는 `chunkPlan` 을 부르지 않는다.** 부르면
 *    「남은 것이 없다 — 다 냈다」가 돌아온다(실측). 쪽수 0을 「다 냈다」로 읽는 것이라,
 *    그대로 쓰면 **쪽수가 안 적힌 교재가 통째로 「낼 것 없음」이 되어 조용히 0줄**이 된다.
 *    → 쪽을 모르면 **통째로 낸다**고 답하고, 모른다는 것을 `pagesKnown:false` 로 밝힌다.
 */
export function amountOf(units = [], { pages = null, parts = [] } = {}) {
  const mine = parts.filter((p) => units.some((u) => u.id === (p.unit_id ?? p.unitId)));
  const known = units.length > 0 && units.every((u) => (u.page_start ?? u.pageStart) != null);
  const name = lumpLabel(units);
  const q = units.reduce((s, u) => s + (Number(u.q_count) || 0), 0);
  if (!known) {
    return {
      pagesKnown: false, pages: units.reduce((s, u) => s + pageCount(u), 0), questions: q,
      label: name, range: null, leftLabel: null, give: [], done: null,
      why: "⚠️ 쪽수를 모르는 줄이 있다 — 통째로 낸다. 「이걸로 끝」은 원장님이 누른다",
    };
  }
  // ⚠️ **덩이마다 따로** `chunkPlan` 을 부르고 이어 붙인다. 통째로 넘기면 사이에 낀 쪽까지 낸다.
  const runs = pageRuns(units);
  const want = pages == null ? null : Math.max(1, Number(pages));
  const give = [], after = [], whys = [];
  let took = 0, covered = true;
  for (const r of runs) {
    const budget = want == null ? null : want - took;
    if (budget != null && budget <= 0) {                 // 예산이 다 떨어졌다 — 이 덩이는 통째로 남는다
      const l = leftPages(r.units, mine);
      if (l.length) { after.push(...l); covered = false; }
      continue;
    }
    const one = chunkPlan(r.units, { pages: budget, parts: mine });
    give.push(...one.give);
    took += one.pages;
    after.push(...one.leftAfter);
    // 「다 덮었나」는 `chunk.js` 가 판단한다 — 여기서 다시 만들지 않는다(원칙 1). 덩이마다 물어본다
    const c = coveredBy(r.units, [...mine, ...one.give.map(([a, b]) => ({ pageFrom: a, pageTo: b }))]);
    if (c.covered !== true) { covered = false; if (c.why) whys.push(c.why); }
  }
  const p = {
    give, pages: took, done: covered,
    leftLabel: after.length ? `남은 것 ${rangeText(after)}` : "이걸로 끝",
  };
  const c = { why: covered ? "다 덮었다 — 진도가 저절로 올라간다" : whys.join(" · ") || `남은 쪽 ${rangeText(after)}` };
  const range = rangeText(p.give) || null;
  return {
    pagesKnown: true, pages: p.pages, questions: q, give: p.give,
    // ⚠️ 이름은 **`chunkPlan` 이 준 `label` 을 쓰지 않는다.** 그것은 `units[0]` 하나로만 짓기 때문에
    //    갯수를 3으로 올려도 **첫 소단원 이름만** 뜬다 — 목업 2번(「PSS 1-4 · 1-5 · 1-6 이 그 자리에 뜬다」)이
    //    안 되고, 원장님은 무엇이 나가는지 모른 채 저장한다. 이름은 `v2.unit_label` 이 준 것을 이어 붙인다(0056).
    label: range && !p.done ? `${name} · ${range}` : name,
    range, leftLabel: p.leftLabel,
    done: p.done,                       // 이 회차로 그 덩어리가 다 덮이나
    why: c.why,
  };
}

// ────────────────────────────────────────────────────────────────
// ④ 한 교재 한 회차를 세 묶음으로 편다 (순수 함수 — 검사가 그대로 부른다)
// ────────────────────────────────────────────────────────────────

/**
 * @param book   { bookId, name, area, orderBasis, chunkDepth, stopMode, … }
 * @param items  그 영역의 루틴 줄들 (학생루틴이 있으면 학생루틴)
 * @param lumps  이번 회차에 낼 덩어리들 (per_session 개)
 * @param opt    { again, memo:{class,home}, drop:[itemId], parts, pages, nextLumps }
 *
 * ⚠️⚠️ `nextLumps` — **예습(③의 뒷쪽)이 가리키는 곳이다.** 계획 ⑨ 는
 *    「오늘 한 단원의 **복습** + **다음 단원의 예습**」이다. 안 넘기면 세 묶음이 다
 *    **오늘 덩어리**를 가리켜 (1) 아이가 학원에서 방금 푼 단원을 「예습」으로 또 받고
 *    (2) 같은 단원이 slot='class' ○ 와 slot='next' ○ 로 **두 줄** 저장돼
 *    `lib/progress.js` 의 winner() 가 예습 줄을 먼저 집으면 그 단원이 done 으로 안 올라가
 *    **커서가 안 움직여 내일 같은 단원이 또 깔린다.** 실측(2026-09-02) 예습 줄이 선
 *    카드 35개 중 16개가 class 와 글자까지 같았다.
 */
export function layout(book = {}, items = [], lumps = [], opt = {}) {
  const { again = false, memo = {}, drop = [], parts = [], pages = null, nextLumps = [] } = opt;
  const out = { class: [], home: [], next: [], notes: [] };
  const stop = book.stopMode || STOP.RUNNING;

  // ⚠️ 교재멈춤 — 학습도 숙제도 없다. **커서는 안 움직인다**(⑬ 4번).
  //    이 파일은 아무것도 안 쓰므로 저절로 안 움직이지만, 줄을 내보내면 다음 검사에서 진도가 올라간다.
  if (stop === STOP.BOOK_OFF) {
    out.notes.push("교재멈춤 — 이 교재는 오늘 학습도 숙제도 없습니다. 풀면 이 자리에서 이어갑니다");
    return out;
  }
  if (stop === STOP.HW_OFF) {
    // ⚠️ 조용히 0줄로 비우지 않는다 — 확정 ④ 붙임의 「회차가 통째로 빔」과 **같은 자리**다
    out.notes.push("이 교재는 수업만 합니다 — 숙제·예습이 안 나갑니다 (숙제멈춤)");
  }
  if (!lumps.length) return out;

  const units = lumps.flatMap((l) => l.units);
  const amount = amountOf(units, { pages, parts });
  const unitIds = units.map((u) => u.id);
  // 「이번에 낼 번호·쪽」 — 통째로 낼 때는 안 적는다(비면 「다 덮은 것」이라는 뜻이다, 계획 「조각」 2번)
  const rangeNote = amount.pagesKnown && !amount.done ? amount.range : null;

  // ── 예습이 가리킬 **다음 덩어리.** 없으면 예습을 **안 낸다** — 지어내지 않는다(대전제 0)
  const nextUnits = nextLumps.flatMap((l) => l.units);
  // ⚠️ 분량 조절(`pages`)은 **오늘 것**에만 건다. 예습은 다음 단원 통째다
  const nextAmount = nextUnits.length ? amountOf(nextUnits, { pages: null, parts }) : null;
  const nextIds = nextUnits.map((u) => u.id);

  const skip = new Set(drop.map(String));
  const live = items.filter((i) => !skip.has(String(i.item_id ?? i.itemId)));

  let wantedNext = false;
  for (const it of live) {
    const id = it.item_id ?? it.itemId;
    for (const slot of slotsOf(it)) {
      if (stop === STOP.HW_OFF && slot !== "class") continue;   // 숙제·예습이 통째로 빈다
      // ⚠️ **확인 안 됨 (원장님께 물을 것).** ✕ 면 다음 단원 예습을 안 낸다 —
      //    앞 단원을 못 해 왔는데 다음 단원 예습까지 내면 그날 숙제가 두 배가 되기 때문이다.
      //    계획에는 「매 수업 루틴은 그대로」까지만 있고 예습을 어찌할지는 안 적혀 있다.
      if (again && slot === "next") continue;
      if (slot === "next") {
        wantedNext = true;
        if (!nextUnits.length) continue;      // 다음 덩어리를 모른다 — 오늘 것을 예습이라고 내밀지 않는다
      }
      const isNext = slot === "next";
      out[slot].push({
        slot, itemId: id, name: it.name,
        method: it.method ?? null, tool: it.tool ?? null, checks: it.checks ?? null,
        gatePrev: it.gate_prev === true || it.gatePrev === true,
        countN: it.count_n ?? it.countN ?? null,
        source: it.src ?? it.source ?? "area",
        // ⑨-a 2번 — **항목마다 단원이 보인다.** 「클카 문장훈련」만 뜨면 무엇인지 모른다
        label: (isNext ? nextAmount?.label : amount.label) || lumpLabel(isNext ? nextUnits : units),
        unitIds: isNext ? nextIds : unitIds,
        // ⚠️ day_item.unit_id 는 한 칸뿐 — 나머지는 unitIds 로 넘긴다
        unitId: (isNext ? nextIds[0] : unitIds[0]) ?? null,
        rangeNote: isNext ? null : rangeNote,
        again,
      });
    }
  }
  if (wantedNext && !nextUnits.length && stop !== STOP.HW_OFF) {
    out.notes.push("이 교재는 **다음 단원이 없어** 예습이 안 나갑니다 — 이 회독의 마지막 자리입니다");
  }

  // 메모로 대신한 날 (⑨-a 4번 · ㊳) — **항목 대신 한 줄.** 그것이 그날의 ②다
  for (const slot of ["class", "home"]) {
    const m = (memo[slot] ?? "").trim?.() ?? "";
    if (!m) continue;
    if (stop === STOP.HW_OFF && slot !== "class") continue;
    out[slot] = [{
      slot, itemId: null, name: null, memo: m, byMemo: true,
      label: amount.label || lumpLabel(units), unitIds, unitId: unitIds[0] ?? null,
      rangeNote, again, source: "memo",
    }];
  }

  out.amount = amount;
  out.units = units;
  out.nextAmount = nextAmount;      // 예습이 가리키는 곳 — **오늘 것과 다른 단원이다**
  out.nextUnits = nextUnits;
  if (again) out.notes.push("검사 ✕ — 「다음 회차」 대신 **그 단원 다시**가 깔렸습니다");
  if (!amount.pagesKnown) out.notes.push(amount.why);
  if (amount.pagesKnown && !amount.done) out.notes.push(amount.leftLabel);
  return out;
}

/** 세 묶음이 다 비었나 — 확정 ④ 붙임이 보는 그 자리 */
export const isEmpty = (l = {}) => SLOTS.every((s) => !(l[s] || []).length);

// ────────────────────────────────────────────────────────────────
// ⑤ DB 에 묻는 자리 — SQL 은 여기 여섯 개 + `v2.today()` 하나뿐이다
// ────────────────────────────────────────────────────────────────

/** 오늘 이 아이가 든 교재 + 멈춤. ⚠️ `books.state` 가 active 가 아니어도 **안 지운다** — 밝힌다 */
export async function booksOf(db, studentId, on) {
  const { rows } = await db.query(
    `select sb.id as sb_id, sb.book_id, b.name as book_name, b.area, b.state as book_state,
            b.chunk_depth, coalesce(sb.order_basis, b.order_basis) as order_basis,
            sb.round, sb.per_session, sb.unit_test, sb.unit_test_n,
            sb.stop_mode, sb.stop_until, sb.stop_exam_id,
            e.name as exam_name, coalesce(e.term_to, e.english_on) as exam_end
       from v2.student_book sb
       join v2.books b on b.id = sb.book_id
       left join v2.exams e on e.id = sb.stop_exam_id
      where sb.student_id = $1::uuid
        and sb.from_date <= $2::date
        and (sb.to_date is null or sb.to_date >= $2::date)
      order by b.area nulls last, b.name`,
    [studentId, on]);
  return rows.map((r) => ({
    sbId: r.sb_id, bookId: r.book_id, name: r.book_name, area: r.area, bookState: r.book_state,
    chunkDepth: r.chunk_depth || "sub", orderBasis: r.order_basis || "sub",
    round: Number(r.round), perSession: Number(r.per_session) || 1,
    unitTest: r.unit_test ?? null, unitTestN: r.unit_test_n ?? null,
    ...stopOf(r, on),
  }));
}

/**
 * **멈춤이 아직 살아 있나.** 푸는 길은 셋 — 손으로 · 날짜(`stop_until`) · 시험(`stop_exam_id`).
 *
 * ⚠️ 같은 판단이 **0037 의 `word_test_on` 에도 적혀 있는데 서로 다르다** —
 *    거기는 `stop_exam_id` 를 **안 본다.** 시험에 묶어 멈춘 교재는 시험이 끝나도
 *    **단어시험만 영영 안 나간다.** 오류가 안 나고 화면도 멀쩡하다.
 *    → 보고 needsDb ②에 `v2.book_stop()` 한 벌을 적었다. 그게 서면 이 함수는 그걸 부르기만 한다.
 */
export function stopOf(r = {}, on = null) {
  const mode = r.stop_mode || r.stopMode || STOP.RUNNING;
  if (mode === STOP.RUNNING) return { stopMode: STOP.RUNNING, stopWhy: null };
  const d = on ? String(on) : null;
  const until = r.stop_until ? ymd(r.stop_until) : null;
  const examEnd = r.exam_end ? ymd(r.exam_end) : null;
  const freedBy = until && d && until < d ? `${until} 로 풀렸습니다`
    : examEnd && d && examEnd < d ? `${r.exam_name || "시험"} 이 끝나 풀렸습니다` : null;
  if (freedBy) return { stopMode: STOP.RUNNING, stopWhy: freedBy };
  return {
    stopMode: mode,
    stopWhy: until ? `${until} 까지` : examEnd ? `${r.exam_name || "시험"} 끝날 때까지` : "풀 때까지",
  };
}


/** 지금 커서 — **부르기만 한다.** JS 로 다시 세지 않는다 (원칙 1 · 0018/0022) */
export async function cursorOf(db, studentId, bookId) {
  const { rows } = await db.query(
    `select round, chapter, is_workbook, left_in_chapter from v2.cursor_of($1::uuid, $2::uuid)`,
    [studentId, bookId]);
  const r = rows[0];
  if (!r || r.chapter == null) return { round: r ? Number(r.round) : null, chapter: null, isWorkbook: null, leftInChapter: 0 };
  return { round: Number(r.round), chapter: r.chapter, isWorkbook: r.is_workbook === true, leftInChapter: Number(r.left_in_chapter) };
}

/**
 * 그 대단원의 줄. ⚠️ `doing`(◐)은 **남는다** — 조각이 다 덮이면 그때 ○ 가 된다(절 ⑳)
 *
 * ⚠️⚠️ **두 벌로 준다 — `{ todo, all }`.** 낼 것은 `todo`(안 한 줄)지만, 덩어리를 가르려면
 *    `lumpsOf` 가 **걸러지기 전 줄 차례**(`all`)를 봐야 한다. 걸러진 목록만 주면
 *    가운데 한 줄이 done/skip 이라 빠진 순간 다른 중단원의 같은 이름이 맞닿아 **다시 뭉친다**
 *    (실측 재현: 이시은 · 어법끝스타트 PART 2 — 한 줄 skip 에 UNIT 01+02 가 한 회차로 나갔다).
 *    DB 는 **한 번만** 본다 — 거르는 것은 여기 JS 다.
 */
export async function chapterUnits(db, { studentId, bookId, chapter, round }) {
  const { rows } = await db.query(
    `select u.id, u.chapter, u.mid, u.sub, u.activity, u.is_workbook, u.sort,
            u.page_start, u.page_end, u.q_count, u.q_range,
            v2.unit_label(u.id, true) as label,
            p.status as prog
       from v2.units u
       left join v2.progress p
         on p.student_id = $1::uuid and p.unit_id = u.id and p.round = $2::smallint
      where u.book_id = $3::uuid and u.state = 'active' and u.chapter = $4::text
      order by u.sort`,
    [studentId, round, bookId, chapter]);
  return { todo: rows.filter((r) => r.prog !== "done" && r.prog !== "skip"), all: rows };
}

/**
 * **커서 다음 자리**의 줄들 — 예습(`next`)이 가리킬 곳이다 (계획 ⑨).
 *
 * ⚠️ 차례는 `v2.cursor_of`(0022)와 **글자 그대로 같아야 한다** — 대단원 차례 → 갈래 → 줄 차례.
 *    하나만 달라도 예습이 커서가 갈 곳과 **다른 데**를 가리키고, 오류는 안 난다.
 *    커서가 「지금」만 주므로 「다음」은 여기서 같은 차례로 한 칸 더 본다.
 *    ⚠️ 낼 것(`todo`)은 **아직 안 한 것**만이다 — `cursor_of` 의 `todo` 와 같은 조건이다.
 *
 * ⚠️⚠️ **여기도 `{ todo, all }` 두 벌로 준다** — `chapterUnits` 와 같은 까닭이다.
 *    이미 한 줄을 SQL 에서 통째로 지워 버리면 예습 덩어리도 **가운데 줄이 빠진 자리에서 뭉친다.**
 *    그래서 done/skip 을 지우지 않고 `blocked` 로 **표시만** 하고, 어느 자리를 예습으로 삼을지는
 *    「아직 안 한 줄이 처음 나오는 자리」로 정한다 — 고르는 결과는 전과 같다.
 */
export async function afterUnits(db, { studentId, bookId, round, chapter, isWorkbook, orderBasis = "sub" }) {
  const byChapter = orderBasis === "chapter";
  const { rows } = await db.query(
    `with u as (
       select x.id, x.chapter, x.mid, x.sub, x.activity, x.is_workbook, x.sort,
              x.page_start, x.page_end, x.q_count, x.q_range,
              min(x.sort) over (partition by x.chapter) as ch_sort,
              exists (select 1 from v2.progress p
                       where p.student_id = $1::uuid and p.unit_id = x.id
                         and p.round = $3::smallint and p.status in ('done','skip')) as blocked
         from v2.units x
        where x.book_id = $2::uuid and x.state = 'active')
     select u.id, u.chapter, u.mid, u.sub, u.activity, u.is_workbook, u.sort,
            u.page_start, u.page_end, u.q_count, u.q_range, u.blocked,
            v2.unit_label(u.id, true) as label
       from u
      order by u.ch_sort,
               case when $4::boolean and u.is_workbook then 1 else 0 end,
               u.sort`,
    [studentId, bookId, round, byChapter]);
  // 지금 서 있는 자리(대단원 + 갈래)를 지나친 뒤, **바로 다음 자리** 한 묶음만 데려온다
  const at = (r) => `${r.chapter} ${byChapter ? r.is_workbook === true : ""}`;
  const here = `${chapter} ${byChapter ? isWorkbook === true : ""}`;
  const rest = rows.filter((r) => at(r) !== here);
  // ⚠️ 자리는 **아직 안 한 줄**이 처음 나오는 곳이다 — 통째로 끝낸 대단원은 건너뛴다
  const first = rest.find((r) => r.blocked !== true);
  if (!first) return { todo: [], all: [] };
  const there = at(first);
  const all = rest.filter((r) => at(r) === there);
  return { todo: all.filter((r) => r.blocked !== true), all };
}

/**
 * 루틴 — **학생루틴이 있으면 그것이 기본루틴을 대신한다**(㉒: 고르고·차례를 짜고·뺀 것)
 *
 * ⚠️⚠️ **`r.state` 를 반드시 본다.** 여기서 `li.state`(항목이 살아 있나)만 보고
 *    **루틴 줄 자신의 상태를 안 보던 자리가 있었다** (2026-09-02에 막았다).
 *    대전제 6 대로 루틴은 지우지 않고 **`retired` 로 내린다**(㊷ 🗑).
 *    읽는 쪽이 그 칸을 안 보면 **내리기가 아무 일도 안 한다** — 화면에서는 사라지는데
 *    다음 날 숙제에 그대로 나온다. 오류도 안 나고, 내린 줄이 0이던 동안에는 검사도 초록이었다.
 */
export async function routineOf(db, studentId, areas = []) {
  const list = areas.filter(Boolean);
  if (!list.length) return new Map();
  const { rows } = await db.query(
    `select 'area' as src, r.area, r.item_id, li.name, li.method, li.tool, li.checks,
            r.place, r.sort, false as gate_prev, null::smallint as count_n
       from v2.area_routine r
       join v2.learn_items li on li.id = r.item_id
      where r.area = any($1::text[]) and li.state = 'active' and r.state = 'active'
      union all
     select 'student', r.area, r.item_id, li.name, li.method, li.tool, li.checks,
            r.place, r.sort, r.gate_prev, r.count_n
       from v2.student_routine r
       join v2.learn_items li on li.id = r.item_id
      where r.student_id = $2::uuid and r.area = any($1::text[])
        and li.state = 'active' and r.state = 'active'
      order by 2, 9, 4`,
    [list, studentId]);
  return pickRoutine(rows);
}

/** 영역마다 한 벌만 남긴다 — 학생 것이 하나라도 있으면 **그 영역은 학생 것만** 쓴다 */
export function pickRoutine(rows = []) {
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.area)) by.set(r.area, { area: [], student: [] });
    by.get(r.area)[r.src === "student" ? "student" : "area"].push(r);
  }
  const out = new Map();
  for (const [area, g] of by) {
    const use = g.student.length ? g.student : g.area;
    out.set(area, [...use].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)));
  }
  return out;
}

/**
 * 오늘 검사한 것 (①).
 *
 * ⚠️⚠️ **「검사가 방아쇠다」의 그 방아쇠가 실측으로 한 번도 안 당겨진다.**
 *    2026-09-02 진짜 DB: `v2.day_item` 의 check 줄 **3994개 전부 unit_id 가 null** 이다
 *    (✕ 643줄 포함). 단원이 안 붙으면 어느 교재의 어느 단원인지 알 수 없어
 *    「그 단원 다시」를 못 켠다 — 박소윤 2026-08-27 은 ✕ 가 있는데 again 이 전부 false 였다.
 *    예전 주석은 「안 붙은 줄은 안 센다」를 **예외**처럼 적어 뒀지만, 그것이 **지금 있는 줄 전부**다.
 *    → 안 붙은 줄을 **버리지 않고 세어서 밝힌다**(`orphans`). 화면이 day_item 을 쓸 때
 *      unit_id 를 반드시 붙여야 이 방아쇠가 산다. 지어내서 켜지는 않는다(대전제 0).
 */
export async function checksOf(db, studentId, on) {
  const { rows } = await db.query(
    `select i.id, i.status, i.unit_id, u.book_id, u.chapter, u.sub, u.mid, u.activity,
            u.is_workbook, u.sort, u.page_start, u.page_end, u.q_count,
            v2.unit_label(u.id, true) as label
       from v2.day_item i
       join v2.day_sheet s on s.id = i.sheet_id
       left join v2.units u on u.id = i.unit_id
      where s.student_id = $1::uuid and s.date = $2::date and i.slot = 'check'
      order by u.sort nulls last`,
    [studentId, on]);
  return groupChecks(rows);
}

/**
 * 검사 줄을 교재별로 묶는다. ✕(`missing`)만 「그 단원 다시」를 부른다 — △ 는 「하는 중」이다.
 * ⚠️ 단원이 안 붙은 줄은 교재를 모르니 못 묶는다 — **버리지 말고 `orphans` 로 세어 밝힌다.**
 */
export function groupChecks(rows = []) {
  if (rows instanceof Map) return rows;
  const by = new Map();
  let orphans = 0, orphanMissing = 0;
  for (const r of rows) {
    const b = r.book_id ?? r.bookId;
    if (b == null) {                         // ⚠️ 단원이 안 붙은 검사 줄은 어느 교재인지 알 수 없다
      orphans++;
      if (r.status === "missing") orphanMissing++;
      continue;
    }
    if (!by.has(b)) by.set(b, { missing: [], all: [] });
    const g = by.get(b);
    g.all.push(r);
    if (r.status === "missing") g.missing.push(r);
  }
  by.orphans = orphans;
  by.orphanMissing = orphanMissing;
  return by;
}

/** 조각 — 이미 낸 쪽. 다 덮이면 원본이 ○ 로 올라간다(절 ⑳) */
export async function partsOf(db, { studentId, round, unitIds = [] }) {
  if (!unitIds.length) return [];
  const { rows } = await db.query(
    `select unit_id, q_from, q_to, page_from, page_to, note, done_on
       from v2.progress_part
      where student_id = $1::uuid and round = $2::smallint and unit_id = any($3::uuid[])`,
    [studentId, round, unitIds]);
  return rows.map((r) => ({ ...r, unitId: r.unit_id, pageFrom: r.page_from, pageTo: r.page_to }));
}

// ────────────────────────────────────────────────────────────────
// ⑥ 한 판 차리기 — 화면이 부르는 것은 이것 하나다
// ────────────────────────────────────────────────────────────────

/**
 * @param opt.studentId  아이
 * @param opt.on         날짜 (YYYY-MM-DD). 없으면 `v2.today()` 에 물어본다
 * @param opt.adjust     교재마다 조절 (㉓) — `{ [bookId]: { count, pages, drop:[itemId] } }`
 *                       `count` 는 **덩어리 갯수**(회차), `pages` 는 **분량**(㊹)
 * @param opt.memo       교재마다 메모 (⑨-a) — `{ [bookId]: { class:"…", home:"…" } }`
 * @param opt.checks     검사 결과를 밖에서 넣을 때. 없으면 오늘 판에서 읽는다
 */
/**
 * 카드에 `layout()` 이 낸 것을 얹는다.
 *
 * ⚠️⚠️ **notes 는 덮어쓰지 않고 잇는다.** `Object.assign(card, l)` 로 그냥 얹으면
 *    `layout()` 이 새로 만든 **빈 notes 배열**이 카드에 먼저 붙여 둔 줄을 통째로 지운다.
 *    실측(2026-09-02 확인자): 「⚠️ 지난 날짜 판입니다 … (참고용)」이 카드에 **하나도 안 붙었다** —
 *    커서가 살아 있는 카드는 notes 가 빈 배열이었다. 「⚠️ 목록에서 내려간 교재입니다(paused)」와
 *    「영역이 안 붙어 있습니다」·「루틴이 한 줄도 없습니다」도 같이 지워졌다.
 *    그러면 **화면이 그날 것이 아닌 판을 아무 표시 없이** 보여 준다 — 오류도 안 난다.
 */
function put(card, l, extra = {}) {
  const before = card.notes ?? [];
  Object.assign(card, l, extra);
  card.notes = [...before, ...(l.notes ?? [])];
  return card;
}

export async function routineNext(db, opt = {}) {
  const { studentId, adjust = {}, memo = {}, checks = null } = opt;
  const today = ymd((await db.query(`select v2.today() as d`, [])).rows[0]?.d);
  const day = ymd(opt.on ?? today);
  /**
   * ⚠️⚠️ **한 카드 안에 날짜가 둘이다.** 교재 목록은 `on`(달라는 날짜)으로 읽는데
   *    커서는 `v2.cursor_of` 가 **`v2.today()` 로만** 읽는다(0022 — 날짜 칸이 없다).
   *    실측: 구도은을 2026-08-01 로 돌리면 교재 3권 전부가
   *    「이 교재는 지금 회독을 다 끝냈습니다」로 뜬다 — 그날 한창 하고 있던 교재들이다.
   *    배정(`student_book`)이 그 뒤에 끝났을 뿐인데 앱이 **「다 끝냈다」고 지어낸다.**
   *    → 지금은 **밝힌다.** 날짜를 받는 `v2.cursor_of(학생,교재,날짜)` 는 보고 needsDb 에 적었다.
   */
  const stale = day !== today;

  const books = await booksOf(db, studentId, day);
  const areas = [...new Set(books.map((b) => b.area).filter(Boolean))];
  const routines = await routineOf(db, studentId, areas);
  // ⚠️ 밖에서 넣은 검사 결과도 **같은 문을 지난다** — 줄 목록으로 넣어도 교재별로 묶인다
  const checked = checks ? groupChecks(checks) : await checksOf(db, studentId, day);

  const out = [];
  for (const b of books) {
    const card = {
      ...b, chapter: null, isWorkbook: null, leftInChapter: 0,
      // ⚠️ `leftLumps` 는 「이 대단원에 남은 덩어리 수」다 — **「건너뛴 회차」가 아니다**(아래 주석)
      class: [], home: [], next: [], notes: [], leftLumps: 0, again: false, empty: true, why: null,
    };
    if (b.bookState !== "active") {
      card.notes.push(`⚠️ 이 교재는 목록에서 내려간 교재입니다(${b.bookState}) — 배정이 아직 살아 있습니다`);
    }
    if (stale) {
      card.cursorAsOf = today;
      card.notes.push(`⚠️ 지난 날짜(${day}) 판입니다 — 「지금 어디」는 **오늘(${today}) 기준**이라 그날 것과 다를 수 있습니다 (참고용)`);
    }

    // 커서는 **멈춘 교재도** 읽는다. 어디에 서 있는지 보여야 「풀면 여기서 이어갑니다」가 말이 된다
    const cur = await cursorOf(db, studentId, b.bookId);
    Object.assign(card, { chapter: cur.chapter, isWorkbook: cur.isWorkbook, leftInChapter: cur.leftInChapter });
    const round = cur.round ?? b.round;

    if (b.stopMode === STOP.BOOK_OFF) {
      const l = layout(b, [], [], {});
      put(card, l);
      card.why = `교재멈춤 (${b.stopWhy})`;
      card.frozenAt = cur.chapter;
      out.push(card);
      continue;
    }
    if (cur.chapter == null) {
      // ⚠️ 지난 날짜 판에서는 **「다 끝냈다」고 말하지 않는다** — 커서가 오늘 것이라 지어내는 말이 된다
      card.why = stale
        ? `⚠️ 지난 날짜(${day}) 판이라 이 교재가 그날 어디였는지 앱이 모릅니다 — 「지금 어디」는 오늘(${today}) 기준입니다`
        : "이 교재는 지금 회독을 다 끝냈습니다 — 다음 회독으로 올리거나 갈아탈 교재를 들입니다";
      card.notes.push(card.why);
      out.push(card);
      continue;
    }

    const items = routines.get(b.area) ?? [];
    if (!b.area) card.notes.push("⚠️ 이 교재는 영역이 안 붙어 있습니다 — 루틴을 못 찾습니다 (재촉 목록)");
    else if (!items.length) card.notes.push(`⚠️ 「${b.area}」 영역에 루틴이 한 줄도 없습니다`);

    const ch = await chapterUnits(db, { studentId, bookId: b.bookId, chapter: cur.chapter, round });
    // ⚠️ 대단원 기준이면 **지금 갈래만** 본다 — 안 가르면 본책과 워크북이 한 덩어리로 뭉쳐
    //    「대단원 기준」이 켜져 있어도 화면만 그렇고 실제로는 소단원 기준으로 나간다(㊻ 118번).
    const onlyMine = (rows) =>
      b.orderBasis === "chapter" ? rows.filter((u) => (u.is_workbook === true) === cur.isWorkbook) : rows;
    const mine = onlyMine(ch.todo);
    /**
     * ⚠️⚠️ **덩어리를 가를 때는 `seq`(걸러지기 전 줄 전부)를 같이 넘긴다.**
     *    안 넘기면 가운데 한 줄이 done/skip 이라 빠진 자리에서 **다른 중단원의 같은 이름이 맞닿아
     *    다시 뭉친다.** 실측 재현(2026-09-02): 이시은 · 어법끝스타트 PART 2 에서 원장님이
     *    「UNIT 01 › UNIT Exercise」 한 줄만 건너뛰면 per_session=2 인데 UNIT 01 과
     *    **아직 안 배운 UNIT 02** 가 한 회차(3줄 · p.150~153, p.158~160)로 나갔다.
     */
    const lumps = lumpsOf(mine, { orderBasis: b.orderBasis, chunkDepth: b.chunkDepth, seq: onlyMine(ch.all) });

    const adj = adjust[b.bookId] ?? {};
    const count = Math.max(1, Number(adj.count ?? b.perSession) || 1);
    /**
     * ⚠️ **분량 칸도 갯수 칸과 같은 문을 지나야 한다.** 화면의 숫자칸을 비우면 브라우저가
     *    `""` 를 준다 — `Number("") === 0` 이라 `chunkPlan` 이 **1쪽**을 낸다.
     *    실측: 김서은 「어법 서술형 제패 2권」에 `pages:""` → p.26 **1쪽**만 나갔다.
     *    원장님은 「칸을 비웠으니 통째로 나가겠지」로 읽는다. `null` 이 「통째로」다.
     */
    const pgRaw = Number(adj.pages);
    const pages = Number.isFinite(pgRaw) && pgRaw > 0 ? pgRaw : null;

    // 검사 ✕ 면 「다음 회차」 대신 **그 단원 다시** (⑨-a)
    const chk = checked.get(b.bookId);
    const again = !!(chk && chk.missing?.length);
    // ⚠️ 조각은 **오늘 낼 줄** 것만 읽는다 — ✕ 로 되돌아간 줄은 이 대단원 밖일 수 있다
    const need = again ? chk.missing.map((u) => u.unit_id ?? u.id) : mine.map((u) => u.id);
    const parts = await partsOf(db, { studentId, round, unitIds: need });

    if (again) {
      const back = lumpsOf(chk.missing.map((r) => ({ ...r, id: r.unit_id ?? r.id })),
                           { orderBasis: b.orderBasis, chunkDepth: b.chunkDepth });
      // ⚠️ ✕ 인 날은 예습을 안 낸다(layout 이 막는다) — 그러니 다음 덩어리를 찾지 않는다
      const l = layout(b, items, back, { again: true, memo: memo[b.bookId] ?? {}, drop: adj.drop ?? [], parts, pages });
      put(card, l, { again: true, empty: isEmpty(l) });
      // ⚠️ ✕ 인 날도 **조용히 0줄로 비우지 않는다** — 까닭을 카드에도 적는다(확정 ④ 붙임)
      if (card.empty) { card.why = emptyWhy(b, items); card.notes.push(card.why); }
      out.push(card);
      continue;
    }

    const take = lumps.slice(0, count);
    /**
     * 예습이 가리킬 **다음 덩어리** (계획 ⑨ ③ — 「오늘 한 단원의 복습 + **다음 단원의 예습**」).
     * 이 대단원에 남은 덩어리가 있으면 그것, 없으면 `afterUnits` 로 **다음 자리**를 물어본다.
     * ⚠️ 대단원 안에 남아 있으면 DB 를 한 번 덜 본다 — 여기서 세는 것이 아니라 **자르는** 것이다.
     */
    let nextLumps = lumps.slice(count, count * 2);
    let allParts = parts;
    if (!nextLumps.length) {
      const nx = await afterUnits(db, {
        studentId, bookId: b.bookId, round,
        chapter: cur.chapter, isWorkbook: cur.isWorkbook, orderBasis: b.orderBasis,
      });
      // ⚠️ 예습 덩어리도 **걸러지기 전 줄 차례**로 가른다 (위와 같은 사고 자리다)
      nextLumps = lumpsOf(nx.todo, { orderBasis: b.orderBasis, chunkDepth: b.chunkDepth, seq: nx.all })
        .slice(0, count);
      // ⚠️ 다음 대단원 줄의 **조각**도 읽는다 — 안 읽으면 지난번에 낸 쪽을 예습으로 또 낸다
      const nextIds = nextLumps.flatMap((l) => l.unitIds);
      if (nextIds.length) allParts = [...parts, ...await partsOf(db, { studentId, round, unitIds: nextIds })];
    }

    /**
     * ⚠️ **확정 ④ 붙임의 「빈 회차는 건너뛴다」 고리를 지웠다.**
     *    `layout` 이 비는지는 `items`·`drop`·`stopMode`·`memo` 로만 정해지고
     *    **어느 덩어리를 넣느냐와 무관**하다 — 첫 조각이 안 비면 거기서 끝나고, 비면 전부 빈다.
     *    실측으로 덩어리 9개에 `isEmpty` 가 전부 같았다. 즉 그 고리는 `lumps.slice(0, count)`
     *    한 줄과 **언제나 같은 값**을 냈고, 건너뛰어 살아난 회차는 하나도 없었다.
     *    게다가 `skipped` 는 「건너뛴 회차 수」가 아니라 **남은 덩어리 수**여서, 화면이
     *    「N회차 건너뜀」으로 읽으면 **안 일어난 일을 숫자로 말한다.**
     *    → 이름을 `leftLumps`(이 대단원에 남은 덩어리 수)로 바로잡았다.
     *    붙임 2번은 **회차마다 항목이 다른 옛 39행 모델**을 전제한 것이라 지금 모델(㉒ —
     *    영역 루틴이 회차마다 같고 뺄 항목은 모든 회차에 똑같이 걸린다)에서는 성립하지 않는다.
     */
    const l = layout(b, items, take, { memo: memo[b.bookId] ?? {}, drop: adj.drop ?? [], parts: allParts, pages, nextLumps });
    const empty = isEmpty(l);
    put(card, l, { empty, leftLumps: Math.max(0, lumps.length - count) });
    if (empty) {
      card.why = emptyWhy(b, items);
      card.notes.push(card.why);
    }
    out.push(card);
  }

  const plan = { studentId, date: day, books: out, asOf: today, stale };
  // ⚠️ 단원이 안 붙은 검사 줄 — **버리지 말고 밝힌다**(checksOf 주석 참고)
  plan.checkOrphans = checked.orphans ?? 0;
  plan.checkOrphanMissing = checked.orphanMissing ?? 0;
  plan.load = loadOf(plan);
  plan.says = saysOf(plan);
  return plan;
}

/** 왜 비었나 — **조용히 0줄로 비우지 않는다**(확정 ④ 붙임 2번 · 「교재 배정」 (c)) */
export function emptyWhy(book = {}, items = []) {
  if (!book.area) return "이 교재는 영역이 안 붙어 있어 낼 것을 못 찾습니다 — 영역을 붙여 주세요";
  if (!items.length) return `「${book.area}」 영역에 루틴이 없어 낼 것이 없습니다`;
  return "이 아이는 이 교재에 지금 낼 것이 없습니다 — 뺀 항목이 이 회차를 통째로 비웁니다";
}

// ────────────────────────────────────────────────────────────────
// ⑦ 분량 — **말만 한다.** 밀지 않는다 (㊺-a)
// ────────────────────────────────────────────────────────────────

/**
 * 아직 저장 안 된 초안의 분량. **저장된 판은 `v2.today_load` 가 센다.**
 *
 * ⚠️⚠️ **실제로 낸 쪽을 센다 — 덩어리에 든 줄의 쪽 전부가 아니다.** 셈은 `amountOf`
 *    한 곳에만 둔다(원칙 1·5). 예전에는 `b.units` 를 세어서 한 판 안에 숫자가 둘이었다:
 *      · 김서은 · 2026-09-02 — `load.pages` 30 인데 그 교재 `amount.pages` 는 62
 *      · 분량을 2쪽으로 **줄여도** says 는 「합쳐 30쪽 … 많습니다」 그대로
 *      · 항목을 **전부 빼서 한 줄도 안 나가는 교재**의 30쪽을 「많다」고 셌다
 *    원장님은 안 많은 날 「많습니다」를 보고 줄이러 판을 두 번 만진다(대전제 3 반대).
 *
 * ⚠️ **확인 안 됨 (원장님께 물을 것)** — 예습(다음 단원)의 쪽은 `previewPages` 로 따로 센다.
 *    「합쳐 N쪽」에 넣을지 안 넣을지 계획에 안 적혀 있어 **넣지 않았다.** 지어내지 않는다.
 */
export function loadOf(plan = {}) {
  let itemsClass = 0, itemsHome = 0, pages = 0, questions = 0, previewPages = 0;
  for (const b of plan.books ?? []) {
    itemsClass += (b.class ?? []).length;
    itemsHome += (b.home ?? []).length + (b.next ?? []).length;
    // ⚠️ 한 줄도 안 깔린 교재(교재멈춤 · 빈 회차)는 **0쪽**이다
    if (SLOTS.every((s) => !(b[s] ?? []).length)) continue;
    if (b.amount) {
      pages += Number(b.amount.pages) || 0;
      questions += Number(b.amount.questions) || 0;
    }
    if ((b.next ?? []).length && b.nextAmount) previewPages += Number(b.nextAmount.pages) || 0;
  }
  return { itemsClass, itemsHome, pages, questions, previewPages };
}

/**
 * 원장님께 드리는 말. **막지 않고 줄이지 않는다.**
 * ⚠️ 여기서 교재를 밀면 원장님 모르게 진도가 바뀐다 — 미는 것 자체를 뺐다(㊺-a).
 */
export function saysOf(plan = {}) {
  const say = [];
  const l = plan.load ?? loadOf(plan);
  if (l.pages > BUSY_PAGES) say.push(`오늘 좀 많습니다 — 합쳐 ${l.pages}쪽 (정규 하루는 가운데 ${BUSY_PAGES}쪽입니다)`);
  if (plan.stale) say.push(`⚠️ 지난 날짜(${plan.date}) 판입니다 — 「지금 어디」는 오늘(${plan.asOf}) 기준이라 참고용입니다`);
  if (plan.checkOrphans) {
    say.push(`⚠️ 오늘 검사 ${plan.checkOrphans}줄에 **단원이 안 붙어** 있습니다`
      + (plan.checkOrphanMissing ? ` (그중 ✕ ${plan.checkOrphanMissing}줄)` : "")
      + " — 그 줄들은 「그 단원 다시」를 못 켭니다");
  }
  for (const b of plan.books ?? []) {
    if (b.empty && b.why) say.push(`${b.name} — ${b.why}`);
    if (b.stopMode === STOP.HW_OFF) say.push(`${b.name} — 수업만 합니다 (숙제멈춤)`);
  }
  return say;
}

/**
 * 메모로 대신한 날, **마감하면 무엇이 ○ 로 올라가나** (㊳).
 * ⚠️ **그 교재만.** 한 줄이 새면 그날 판의 **모든 교재**가 통째로 ○ 가 되고,
 *    오류도 안 나고 진도율은 오히려 좋아 보여 아무도 못 알아챈다.
 */
export function memoCovers(plan = {}, bookId) {
  const b = (plan.books ?? []).find((x) => x.bookId === bookId);
  if (!b) return [];
  const byMemo = SLOTS.some((s) => (b[s] ?? []).some((r) => r.byMemo));
  if (!byMemo) return [];
  return (b.units ?? []).map((u) => ({ unitId: u.id, label: u.label, round: b.round }));
}
