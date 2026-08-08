/**
 * **메뉴 배지가 진짜로 붙나** (2026-08-08)
 *
 * 원장님 — 「해야 할 일이 남은 경우 메뉴마다 알림 배지를 다 추가해줘」
 *
 * ── 이 검사가 잡는 것 ────────────────────────────────────
 *
 * 배지는 **틀려도 오류가 안 난다.** 키를 하나 잘못 적으면 그 메뉴에만
 * 조용히 안 붙고, 화면은 멀쩡해 보인다. 그러면 원장님은 「그 화면은 할 일이
 * 없나 보다」 하고 넘어가시게 된다 — 없는 배지가 「다 했다」 는 말이 된다.
 *
 * 그래서 **메뉴 키가 실제 메뉴에 있는지**를 맞춰 본다.
 *
 * 쓰는 법:  node scripts/check-badges.mjs
 */
import { readFileSync } from "node:fs";
import { ALL_ITEMS } from "../lib/menu.js";
import { menuTodos, badgeText, TODO_LABEL } from "../lib/menuBadges.js";

let bad = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); bad = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 메뉴에 없는 키를 세고 있지 않나 ==");
/**
 * 여기가 어긋나면 **조용히 아무 데도 안 붙는다.** 메뉴 키를 바꿀 일이
 * 생기면(화면 이름을 고치다가) 이 검사가 먼저 걸린다.
 */
const keys = new Set(ALL_ITEMS.map((i) => i.key));
for (const k of Object.keys(TODO_LABEL)) {
  eq(keys.has(k), true, `「${k}」 는 실제 메뉴에 있는 키다`);
}

console.log("\n== 안 셀 것을 세고 있지 않나 ==");
/**
 * **수강료는 일부러 뺐다** (원장님, 2026-08-05 — 「이 앱이 챙기는 것은
 * 수업이다. 수강료는 결제선생에서 따로 보시고, 여기서는 수강료 화면에
 * 들어가셨을 때만 보이게」). 메뉴에 미납을 띄우면 그 결정을 뒤집는 일이다.
 */
eq("tuition" in TODO_LABEL, false, "수강료 미납은 메뉴에 안 띄운다");
const src = read("lib/menuBadges.js");
eq(/payments/.test(src.slice(0, src.indexOf("일부러 안 붙인 것"))), false,
   "미납을 세는 조회 자체가 없다");

console.log("\n== 셀 수 없을 때는 0 ==");
/**
 * 표가 없거나(SQL 전) 읽기가 막히면 **0** 이어야 한다. 「3」 이라고 떠
 * 있는데 들어가서 아무것도 없으면 그다음부터 아무도 안 믿는다.
 */
const dead = {
  from: () => { throw new Error("표가 없습니다"); },
  rpc: () => { throw new Error("함수가 없습니다"); },
};
eq(await menuTodos(dead), {}, "전부 터져도 배지가 안 뜬다");
eq(await menuTodos(null), {}, "로그인 전에도 안 뜬다");

console.log("\n== 0 은 아예 안 담는다 ==");
// 화면에서 매번 걸러내게 하면 언젠가 한 곳이 빠진다
const empty = {
  from: () => {
    const q = {
      select: () => q, eq: () => q, in: () => q, is: () => q, not: () => q,
      lte: () => q, gte: () => q, order: () => q, limit: () => q,
      then: (r) => r({ data: [], count: 0, error: null }),
    };
    return q;
  },
  rpc: async () => ({ data: [], error: null }),
};
eq(await menuTodos(empty), {}, "할 일이 없으면 빈 것을 돌려준다");

console.log("\n== 단원평가 · 시험 성적 (원장님, 2026-08-08) ==");
/**
 * 「단원평가 배정되고 시험 점수 없는 것도」
 *
 * 이 둘은 **아무도 재촉하지 않는다.** 안 적어도 화면은 멀쩡하고, 몇 달 뒤
 * 상담에서야 「그 시험 점수가 없네」 가 된다. 그래서 셈이 조금이라도
 * 어긋나면 있으나 마나다 — 여기서 가짜 자료로 못 박아 둔다.
 */
const T = "2026-08-08";
/**
 * 표 이름별로 미리 정해둔 답을 돌려주는 가짜 supabase.
 *
 * **`eq` 만은 진짜로 거른다.** 안 그러면 같은 표를 서로 다른 조건으로
 * 두 번 묻는 자리(숨긴 시험 · 이미 보낸 리포트)에서 같은 답이 나와서,
 * 검사가 통과해도 아무 뜻이 없다.
 */
function fake(tables) {
  return {
    from(name) {
      const q = {
        _rows: tables[name] || [],
        select() { return q; },
        eq(k, v) { q._rows = q._rows.filter((r) => r[k] === v); return q; },
        in() { return q; }, is() { return q; }, not() { return q; },
        lte() { return q; }, gte() { return q; }, order() { return q; }, limit() { return q; },
        then(r) { return r({ data: q._rows, count: q._rows.length, error: null }); },
      };
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  };
}

// ── 단원평가를 봤는데 점수를 안 적었다 ──────────────────
{
  const t = await menuTodos(fake({
    daily_reports: [
      // 단원평가 배정 · 점수 없음 → 남은 일
      { id: "r1", date: T, student_id: "s1", sent_total: null, sent_unit: "" },
      // 단원평가 배정 · 점수 있음 → 아니다
      { id: "r2", date: T, student_id: "s2", sent_total: 20, sent_unit: "관계대명사" },
      // 단원평가를 안 봤다 → 아니다
      { id: "r3", date: T, student_id: "s3", sent_total: null, sent_unit: "" },
    ],
    homework_items: [{ id: "u1", unit_test: true }],
    daily_report_items: [
      { daily_report_id: "r1", homework_item_id: "u1", status: "assigned", student_done_at: null },
      { daily_report_id: "r2", homework_item_id: "u1", status: "assigned", student_done_at: null },
      { daily_report_id: "r3", homework_item_id: "h9", status: "assigned", student_done_at: null },
    ],
  }), T);
  eq(t.today, 1, "점수를 안 적은 단원평가 1건");
  /**
   * **단원평가는 검사 대상이 아니다** (0106). 검사 대기에까지 세면
   * 영영 안 꺼지는 숫자가 된다 — 찍을 방법이 없기 때문이다.
   */
  eq(t.check, undefined, "단원평가는 검사 대기로 안 센다");
}

// ── 시험은 끝났는데 성적이 안 들어왔다 ──────────────────
{
  const t = await menuTodos(fake({
    exam_periods: [
      // 지난 시험 (해송고 고1) — 이 학교 아이 둘 중 하나만 성적이 있다
      { id: "e1", school: "해송고", grade: "고1", name: "1학기 기말고사", english_on: "2026-07-10" },
      // 앞으로 볼 시험은 성적이 없는 것이 당연하다
      { id: "e2", school: "해송고", grade: "고1", name: "2학기 중간고사", english_on: "2026-08-20" },
      // **모의고사는 안 센다** — 대비하는 시험이 아니다 (needsScope 와 같은 기준)
      { id: "e3", school: "해송고", grade: "고1", name: "9월 전국연합학력평가", english_on: "2026-07-11" },
    ],
    students: [
      { id: "a", school: "해송고", grade: "고1", status: "enrolled" },
      { id: "b", school: "해송고", grade: "고1", status: "enrolled" },
      { id: "c", school: "신정중", grade: "중2", status: "enrolled" },  // 다른 학교는 상관없다
    ],
    scores: [{ student_id: "a", taken_on: "2026-07-12", kind: "school" }],
    prep_scopes: [],
  }), T);
  eq(t.scores, 1, "성적이 안 들어온 학생 1명 (모의고사·앞으로 볼 시험은 뺀다)");
  // 앞으로 볼 시험의 범위는 따로 센다 — 지난 시험까지 세면 영영 안 꺼진다
  eq(t.prep, 1, "범위 미등록은 앞으로 볼 시험만");
}

console.log("\n== 배지 글자 ==");
eq(badgeText(0), null, "0 은 안 그린다");
eq(badgeText(3), "3", "3");
eq(badgeText(100), "99+", "세 자리는 잘라낸다 (메뉴가 밀린다)");

console.log("\n== 화면이 실제로 쓰고 있나 ==");
const bar = read("components/TopBar.jsx");
eq(bar.includes("menuTodos"), true, "위 메뉴가 센다");
// 소메뉴에 하나씩
eq(/badgeText\(todos\[it\.key\]\)/.test(bar), true, "화면마다 붙는다");
/**
 * **접히면 소메뉴가 안 보인다.** 그때 묶음 합계가 없으면 어느 묶음에 일이
 * 밀렸는지 알 수가 없어서, 배지를 붙이는 뜻이 절반 사라진다.
 */
eq(/groupTodo\(row\)/.test(bar), true, "묶음 이름에는 그 안의 합계");
// 숫자만 있으면 「3이 뭐지」 하고 눌러봐야 안다
eq(bar.includes("TODO_LABEL[it.key]"), true, "무엇이 남았는지 말해준다");
/**
 * **빨강은 하나만.** 빨간 점은 「저쪽이 기다린다」 는 뜻으로 써 왔다
 * (결석 요청 · 댓글). 남은 일까지 빨갛게 하면 메뉴가 통째로 빨개져서
 * 정작 사람이 기다리는 것이 그 속에 묻힌다.
 */
eq(/navbadge todo/.test(bar), true, "남은 일은 다른 색으로");
eq(/\.navbadge\.todo \{ background: var\(--amber/.test(read("app/globals.css")), true,
   "남은 일은 호박색 (빨강은 사람이 기다리는 것에만)");

console.log("\n== 숫자가 무엇인지 화면에 적히나 ==");
/**
 * 원장님 (2026-08-08) — 「지금 알림이 발송과 학생에 있는데 왜 뜬 건지
 * 모르겠어」
 *
 * 배지는 「무언가 남았다」 까지만 말한다. 무엇인지는 마우스를 올려야
 * 나오는데 폰에는 올릴 마우스가 없다. 그러면 배지는 화면마다 눌러보게
 * 만드는 물건이 된다 — 없느니만 못하다.
 */
const tb = read("app/TodoBar.jsx");
eq(tb.includes("menuTodos"), true, "메뉴와 **같은 셈**을 쓴다");
eq(tb.includes("TODO_LABEL"), true, "무엇이 남았는지 문장으로 적는다");
eq(read("app/page.jsx").includes("<TodoBar />"), true, "대시보드에 있다");
/**
 * **두 벌로 세면 안 된다.** 대시보드가 따로 세던 것들을 뺐다 — 두 숫자가
 * 달라지는 날 둘 다 못 믿게 된다.
 */
const home = read("app/page.jsx");
/**
 * **말이 아니라 코드로 본다.** 「월간리포트」 같은 낱말은 설명 주석과
 * 아래 본문에도 나와서, 낱말로 찾으면 뺐는데도 남은 것처럼 보인다.
 */
for (const [gone, what] of [
  ["d.unsentPast.length > 0 &&", "지난 미발송"],
  ["d.unsentToday.length > 0 &&", "보낼 리포트"],
  ["d.makeupRows.length > 0 &&", "보강 잡을 것"],
  ['<Badge href="/monthly"', "월간리포트"],
  ["d.examSoon.some((e) => e.noScope)", "시험범위 미등록"],
  ["d.inquiries.length > 0 &&", "진행중 상담"],
  ["tasks.overdue.length > 0 &&", "지난 할일"],
]) {
  eq(home.includes(gone), false, `대시보드가 따로 세던 「${what}」 을 뺐다`);
}
// 여기서 안 세는 것은 그대로 남아 있어야 한다
for (const [stay, what] of [
  ["d.warnings.length > 0 &&", "반성문 대상"],
  ["d.sendFails.length > 0 &&", "발송 실패"],
  ["d.scheduleAlerts.length > 0 &&", "스케줄 특이사항"],
]) {
  eq(home.includes(stay), true, `「${what}」 은 메뉴가 안 세므로 그대로`);
}

console.log("\n== 한꺼번에 묻나 ==");
// 이 셈은 **모든 화면**의 위 메뉴에서 돈다. 줄줄이 기다리면 앱 전체가 느려진다
eq(/await Promise\.all\(\[unreadForStaff\(db\), menuTodos\(db\)\]\)/.test(bar), true,
   "안 본 알림과 남은 일을 한꺼번에");
eq((src.match(/await Promise\.all\(/g) || []).length >= 1, true, "조회도 한꺼번에");
// 학생·학부모 화면에서는 아예 안 센다 (볼 메뉴도 없다)
eq(/const staff = isStaff\(profile\?\.role\)/.test(bar), true, "선생님 계정에서만 센다");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 메뉴 배지 통과");
