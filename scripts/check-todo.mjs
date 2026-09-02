/** 「내 할 일」 검사 — 계획 절 ㊴·㉟·㊵·㊱.
 *
 *  핵심은 셋이다. 이 셋은 **오류가 안 나고 화면도 멀쩡해서** 검사가 없으면 아무도 못 알아챈다.
 *   ① 일곱에 없는 갈래(`schedule` 226줄)가 **조용히 사라지는가**
 *   ② 겹친 카드를 한 번 체크했는데 **속의 여덟이 남는가**
 *   ③ 걸음을 **건너뛰어** 인쇄 안 한 자료가 「배부」 칸에 서는가
 *
 *  ⚠️ 가짜 DB 만 상대하면 죽은 칸을 못 잡는다 — **끝에서 진짜 DB 에 물어본다.**
 */
import {
  KINDS, OTHER, ASIDE_KINDS, FILTERS, groupOf, kindLabel,
  STEPS, stepLabel, stepsOf, unknownSteps, stepNow,
  reuseState, reuseOfRow,
  dowOf, isWeekend, pullBack, dday, ddayLabel,
  mergeSame, board, passesFilter, trimAdvice,
  loadTodos, loadMaterials, retestCards, loadScoreLeft, loadExams, academyDays,
  addTodo, planRepeats, myTodos, countedCards, sheetsOn, REPEAT_KINDS,
} from "../lib/todo.js";
import { ymd } from "../lib/session.js";
import { addDays } from "../lib/queue.js";
import { Client } from "pg";
import { readFileSync } from "node:fs";

let fail = 0, n = 0;
const ok = (t, c, why = "") => {
  n++;
  if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
  else console.log(`   ✅ ${t}`);
};

// ─────────────────────────────────────────────────────────────
console.log("■ 바깥 축은 「할 일 종류」다 (㊴) — 학교가 아니다");
// ⚠️ 학교를 바깥 축으로 두면 인쇄 목록이 다섯 군데로 흩어지고 겹치는 것이 아홉 번 뜬다
ok("일곱 칸이다", KINDS.length === 7, String(KINDS.length));
ok("차례가 계획 ㊴ 그대로다 (자료 만들기·인쇄·배부·출제·재시험·성적 받기·되풀이)",
   KINDS.map((k) => k.key).join(",") === "make,print,hand,unit_test,retest,score,repeat",
   KINDS.map((k) => k.key).join(","));
ok("칸 이름에 학교가 없다", !KINDS.some((k) => /학교|중|고/.test(k.label)));

console.log("\n■ ⚠️ 모르는 갈래를 **버리지 않는다** — 옛 앱 학사일정 226줄이 여기 앉아 있다");
ok("모르는 갈래는 「그 밖」으로 간다", groupOf("zzz") === OTHER.key, groupOf("zzz"));
ok("빈 갈래도 안 터진다", groupOf(null) === OTHER.key);
ok("schedule 은 옆으로 치우는 갈래로 적혀 있다", ASIDE_KINDS.includes("schedule"));
ok("일곱은 제 칸으로 간다", KINDS.every((k) => groupOf(k.key) === k.key));
ok("화면 글자가 나온다", kindLabel("print") === "인쇄" && kindLabel("zzz") === "그 밖");

// ─────────────────────────────────────────────────────────────
console.log("\n■ 자료 하나 안에서만 순서가 있다 (㉟) — 클래스카드는 인쇄가 없어 **네 걸음**");
const FIVE = { steps: ["make", "print", "hand", "solve", "score"] };
const CARD = { steps: ["make", "hand", "solve", "score"] };          // 클래스카드
ok("다섯 걸음", stepsOf(FIVE).length === 5);
ok("클래스카드는 네 걸음이고 인쇄가 없다",
   stepsOf(CARD).length === 4 && !stepsOf(CARD).includes("print"), stepsOf(CARD).join(","));
ok("⚠️ 걸음이 안 적혀 있으면 다섯을 **지어내지 않는다**", stepsOf({ steps: [] }) === null);
// ⚠️ 예전에는 「모르는 걸음 글자는 버린다」였다. 그게 사고였다 —
//    버리면 걸음표가 짧아져 **안 한 걸음이 있는 자료가 「끝」으로 올라간다**(아래 upload 줄)
ok("⚠️ 모르는 걸음 글자도 **안 버린다** (버리면 안 한 걸음이 끝으로 올라간다)",
   stepsOf({ steps: ["make", "왕창"] }).join(",") === "make,왕창",
   stepsOf({ steps: ["make", "왕창"] }).join(","));
ok("모르는 걸음을 따로 세어 준다", unknownSteps({ steps: ["make", "upload"] }).join(",") === "upload");
{
  // ⚠️ 사고 재현 — 클래스카드 업로드 걸음이 든 종류. 걸러 내던 때는 finished=true 가 나왔다
  const T6 = { steps: ["make", "print", "upload", "hand", "solve", "score"] };
  const s = stepNow({ made_at: "x", printed_at: "x" }, T6,
                    { n: 3, handed: 3, got: 3, done: 3, scored: 3 });
  ok("⚠️ 클카에 안 올린 자료가 **「끝」으로 안 올라간다** (모르는 걸음 upload)",
     s.finished === false && s.at === "upload", `${s.at} / finished=${s.finished}`);
  ok("모르는 걸음을 unknown 에 담고 까닭을 말한다",
     s.unknown.includes("upload") && /확인 안 됨/.test(s.why ?? ""), `${s.unknown} / ${s.why}`);
}
ok("걸음 이름이 한글로 나온다", stepLabel("hand") === "배부" && stepLabel("score") === "채점");

{
  const give = { n: 15, handed: 0, got: 0, done: 0, scored: null };
  const s = stepNow({ made_at: "2026-10-01T00:00:00Z", printed_at: null }, FIVE, give);
  ok("만들기만 했으면 지금은 「인쇄」", s.at === "print", s.at);
  ok("남은 걸음을 말해 준다", s.left.join(",") === "print,hand,solve,score", s.left.join(","));
}
{
  // ⚠️ 뒤엣것을 먼저 체크해도 앞으로 안 건너뛴다 — 인쇄 안 한 자료가 배부 칸에 서면 빈손으로 나눠 준다
  const give = { n: 15, handed: 15, got: 15, done: 15, scored: null };
  const s = stepNow({ made_at: "2026-10-01T00:00:00Z", printed_at: null }, FIVE, give);
  ok("⚠️ 인쇄를 건너뛰고 배부를 다 해도 지금은 여전히 「인쇄」다", s.at === "print", s.at);
  ok("끝난 것으로 안 올라간다", s.finished === false);
}
{
  const give = { n: 15, handed: 15, got: 15, done: 15, scored: null };
  const s = stepNow({ made_at: "x", printed_at: "x" }, FIVE, give);
  ok("⚠️ 채점은 찍을 칸이 없어 **모른다고 답한다** (지어내서 끝으로 안 올린다)",
     s.at === "score" && s.unknown.join(",") === "score", `${s.at} / ${s.unknown}`);
  ok("모르는 까닭을 말한다", /확인 안 됨/.test(s.why ?? ""), String(s.why));
}
{
  const give = { n: 0, handed: 0, got: 0, done: 0, scored: null };
  const s = stepNow({ made_at: "x", printed_at: "x" }, FIVE, give);
  ok("⚠️ 배정된 아이가 0명이면 배부가 「다 됐다」가 되지 않는다", s.at === "hand", s.at);
}
{
  const s = stepNow({ made_at: null, printed_at: null, state: "done" }, FIVE, { n: 3 });
  ok("⚠️ 시각과 `material.state` 가 어긋나면 **두 벌 경보**를 켠다 (원칙 1)", s.stale === true);
}

// ─────────────────────────────────────────────────────────────
console.log("\n■ 재활용은 고르는 것이 아니라 **체크된 채로 서는 것** (㊵)");
ok("지난 것이 있고 같은 교재면 **만들기가 체크된 채로** 선다",
   reuseState({ reuseOf: "m1", sameBook: true }).checked === true);
ok("지난 것이 없으면 안 체크된 채로 선다",
   reuseState({}).checked === false);
ok("⚠️ 개정판이면 체크하지 않는다 (쪽수가 달라 그대로 못 쓴다)",
   reuseState({ reuseOf: "m1", sameBook: false }).checked === false);
ok("개정판에는 「쪽수가 다를 수 있습니다」가 붙는다",
   /쪽수가 다를 수 있습니다/.test(reuseState({ reuseOf: "m1", sameBook: false }).note));
ok("⚠️ 모르면 체크하지 않는다 (대전제 0 — 안전한 쪽이 「안 체크」다)",
   reuseState({ reuseOf: "m1", sameBook: null }).checked === false);
ok("단추 셋(그대로 쓰기/고쳐 쓰기/배정만)이 없다 — 고를 것이 없다",
   Object.keys(reuseState({ reuseOf: "m1", sameBook: true })).every((k) => !/choice|option|button/i.test(k)));
ok("DB 한 줄에서 바로 — 같은 교재면 체크",
   reuseOfRow({ reuse_of: "m1", book_id: "b1", reuse_book_id: "b1" }).checked === true);
ok("DB 한 줄에서 바로 — 교재가 다르면 개정판",
   reuseOfRow({ reuse_of: "m1", book_id: "b2", reuse_book_id: "b1" }).revised === true);
ok("DB 한 줄에서 바로 — 지난 교재를 모르면 안 체크",
   reuseOfRow({ reuse_of: "m1", book_id: "b1", reuse_book_id: null }).checked === false);

// ─────────────────────────────────────────────────────────────
console.log("\n■ 토·일에 선 할 일을 **앞 수업일로 당긴다** (㉞ 실측 — 7개가 주말에 섰다)");
// 2026-10 월·수 수업이라 치자
const CLASS = new Set(["2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14",
                       "2026-10-19", "2026-10-21", "2026-10-26", "2026-10-28"]);
ok("요일 셈이 class_schedule 과 같다 (0=일 … 6=토)",
   dowOf("2026-10-04") === 0 && dowOf("2026-10-10") === 6, `${dowOf("2026-10-04")}/${dowOf("2026-10-10")}`);
ok("토·일을 가려낸다", isWeekend("2026-10-10") && isWeekend("2026-10-11") && !isWeekend("2026-10-12"));
{
  const p = pullBack("2026-10-11", CLASS);            // 일요일
  ok("일요일 마감이 앞 수업일(10/7)로 당겨진다", p.on === "2026-10-07" && p.moved, JSON.stringify(p));
  ok("⚠️ **뒤로는 절대 안 민다** (밀면 D-7 배부가 시험 뒤가 된다)", p.on < "2026-10-11");
  ok("당긴 까닭을 카드에 남긴다", /당겼다/.test(p.why));
}
ok("평일은 안 건드린다", pullBack("2026-10-07", CLASS).moved === false);
ok("평일인데 수업이 없는 날도 기본은 안 당긴다 (계획서에 없다 — 지어내지 않았다)",
   pullBack("2026-10-08", CLASS).moved === false);
ok("`nonclass` 로 켜면 그때는 당긴다",
   pullBack("2026-10-08", CLASS, { when: "nonclass" }).on === "2026-10-07");
{
  const p = pullBack("2026-08-16", CLASS);            // 방학 — 앞 7일에 수업일이 없다
  ok("⚠️ 앞 7일에 수업일이 없으면 **그대로 둔다** (몇 주 앞으로 안 튄다)",
     p.on === "2026-08-16" && p.moved === false, JSON.stringify(p));
  ok("그 까닭도 말한다", /수업일이 없다/.test(p.why));
}
ok("마감이 없으면 안 터진다", pullBack(null, CLASS).on === null);

console.log("\n■ D-N — 영어 시험일을 모르면 **답하지 않는다** (㉞ 실측 2)");
ok("D-5", dday("2026-10-16", "2026-10-11") === 5, String(dday("2026-10-16", "2026-10-11")));
ok("지난 것은 음수", dday("2026-10-16", "2026-10-19") === -3);
ok("시험일을 모르면 null", dday(null, "2026-10-11") === null);
ok("화면 글자", ddayLabel(5) === "D-5" && ddayLabel(0) === "D-DAY" && ddayLabel(-3) === "D+3");
ok("⚠️ 모르면 「영어 시험일을 넣어 주세요」라고 쓴다 (기간 끝으로 지어내지 않는다)",
   /영어 시험일을 넣어/.test(ddayLabel(null)));

// ─────────────────────────────────────────────────────────────
console.log("\n■ 겹치는 것을 한 카드로 (㉞ 실측 4 — 신송중·옥련여고가 9자리에서 겹쳤다)");
const nine = Array.from({ length: 9 }, (_, i) => ({
  id: `t${i}`, kind: "print", title: "자료 인쇄", due_on: "2026-10-09",
  student_id: null, material_id: null,
  exam_id: i < 5 ? "e-신송" : "e-옥련",
  exam_name: i < 5 ? "2학기 중간" : "2학기 중간",
  school_id: i < 5 ? "s-신송" : "s-옥련",
  school_name: i < 5 ? "신송중" : "옥련여고", state: "todo",
}));
{
  const m = mergeSame(nine);
  ok("아홉 줄이 한 카드가 된다", m.length === 1, String(m.length));
  ok("⚠️ 속의 id 를 **전부** 들고 있다 (하나만 체크하면 여덟이 다음 날 또 뜬다)",
     m[0].ids.length === 9, String(m[0].ids.length));
  ok("몇 자리에서 겹쳤는지 센다", m[0].n === 9);
  ok("두 학교가 카드에 같이 실린다", m[0].exams.length === 2, String(m[0].exams.length));
  ok("학교 id 도 실려 거르개가 듣는다", m[0].exams.every((e) => e.schoolId));
}
{
  // ⚠️ 학생이 다르면 안 묶는다 — 한 번 체크할 때 안 본 아이까지 끝난 것이 된다
  const two = [
    { id: "a", kind: "retest", title: "재시험", due_on: "2026-10-13", student_id: "강민서", state: "todo" },
    { id: "b", kind: "retest", title: "재시험", due_on: "2026-10-13", student_id: "구도은", state: "todo" },
  ];
  ok("⚠️ 학생이 다르면 **안 묶는다**", mergeSame(two).length === 2, String(mergeSame(two).length));
}
{
  const mix = [
    { id: "a", kind: "print", title: "인쇄", due_on: "2026-10-09", state: "done" },
    { id: "b", kind: "print", title: "인쇄", due_on: "2026-10-09", state: "todo" },
  ];
  ok("⚠️ 하나라도 안 끝났으면 **안 끝난 카드**다 (남은 일이 숨지 않는다)",
     mergeSame(mix)[0].state === "todo", mergeSame(mix)[0].state);
}

// ─────────────────────────────────────────────────────────────
console.log("\n■ 보드 한 판 — 갈래가 바깥, **학교는 거르개 한 줄**");
const ROWS = [
  ...nine,
  { id: "m1", kind: "make", title: "변형문제 만들기", due_on: "2026-10-11",
    exam_id: "e-옥련", school_id: "s-옥련", school_name: "옥련여고", state: "todo" },
  { id: "r1", kind: "repeat", title: "매달 수납안내", due_on: "2026-10-25",
    state: "todo", why: "되풀이 규칙 「수납안내」" },
  { id: "s1", kind: "schedule", title: "옥련여자고등학교 개교기념일", due_on: "2026-10-20", state: "todo" },
  { id: "z1", kind: "왕창", title: "모르는 갈래", due_on: "2026-10-15", state: "todo" },
];
{
  const b = board(ROWS, { today: "2026-10-08", classDays: CLASS });
  ok("칸이 여덟이다 (일곱 + 그 밖)", b.groups.length === 8, String(b.groups.length));
  ok("인쇄 칸에 **한 카드**만 있다 (아홉 자리로 안 흩어진다)",
     b.groups.find((g) => g.key === "print").n === 1);
  ok("⚠️ 학사일정은 **사라지지 않고** 옆으로 치워져 세어진다",
     b.aside.n === 1 && b.counts.aside === 1, JSON.stringify(b.counts));
  ok("모르는 갈래는 「그 밖」에 남는다", b.groups.find((g) => g.key === "other").n === 1);
  ok("들어온 줄이 한 줄도 안 없어졌다",
     b.groups.reduce((s, g) => s + g.n, 0) + b.aside.n === mergeSame(ROWS).length,
     `${b.groups.reduce((s, g) => s + g.n, 0)} + ${b.aside.n} vs ${mergeSame(ROWS).length}`);
  ok("일요일 마감(10/11)이 당겨졌다", b.moved >= 1, String(b.moved));
  ok("마감 지난 것을 따로 센다 (10/9 인쇄)", b.late.length >= 1, String(b.late.length));
}
{
  const b = board(ROWS, { filter: "s-옥련", today: "2026-10-08", classDays: CLASS });
  const titles = b.groups.flatMap((g) => g.rows.map((r) => r.title));
  ok("학교 거르개가 듣는다 (옥련여고 것만)", titles.includes("변형문제 만들기"));
  ok("되풀이는 학교 거르개에서 빠진다", !titles.includes("매달 수납안내"));
}
{
  const b = board(ROWS, { filter: "noexam", today: "2026-10-08", classDays: CLASS });
  const titles = b.groups.flatMap((g) => g.rows.map((r) => r.title));
  ok("「내신 아닌 것」 거르개", titles.includes("매달 수납안내") && !titles.includes("변형문제 만들기"));
}
ok("거르개 함수 — 전체는 다 지난다", passesFilter({ exam_id: "e1" }, "all") === true);
{
  // ⚠️ 갈 칸이 없으면 **시끄럽게 터진다.** 조용히 사라지는 것보다 낫다
  const bad = board.bind(null, [{ id: "q", kind: "make", title: "t", state: "todo" }]);
  ok("정상 갈래는 안 터진다", (() => { try { bad({}); return true; } catch { return false; } })());
}

// ─────────────────────────────────────────────────────────────
console.log("\n■ 못 따라가는 시험에는 **「줄이기」를 먼저 권한다** (㉟ — 옥련여고 D-5 에 자료 8개)");
const eight = Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, state: "todo", made_at: null }));
{
  const t = trimAdvice({ dday: 5, left: eight });
  ok("⚠️ D-5 에 자료 8개면 못 따라간다 — 권한다", t.trim === true, JSON.stringify(t));
  ok("몇 개를 빼야 하는지 센다 (8 − 5 = 3)", t.over === 3, String(t.over));
  ok("물어보는 글이 나온다", /빼시겠어요/.test(t.ask), t.ask);
  ok("뺄 수 있는 것을 같이 준다", t.pick.length === 8);
}
{
  const half = [...eight];
  half[0] = { ...half[0], made_at: "x" };
  half[1] = { ...half[1], state: "printed" };
  ok("⚠️ 이미 만든 자료는 뺄 후보에서 나온다 (한 일을 버리지 않는다)",
     trimAdvice({ dday: 5, left: half }).pick.length === 6,
     String(trimAdvice({ dday: 5, left: half }).pick.length));
}
ok("여유가 있으면 안 권한다", trimAdvice({ dday: 21, left: eight }).trim === false);
ok("남은 것이 없으면 안 권한다", trimAdvice({ dday: 1, left: [] }).trim === false);
ok("⚠️ 시험일을 모르면 **못 센다고 답한다** (지어내서 「괜찮다」고 하지 않는다)",
   trimAdvice({ dday: null, left: eight }).why.includes("확인 안 됨") ||
   /영어 시험일/.test(trimAdvice({ dday: null, left: eight }).why),
   trimAdvice({ dday: null, left: eight }).why);
ok("수업일 수를 주면 그걸로 센다 (D-5 인데 수업일이 2일)",
   trimAdvice({ dday: 5, left: eight, daysLeft: 2 }).over === 6);
ok("하루 몇 개인지는 밖에서 바꿀 수 있다 (규칙 줄로 뺄 자리)",
   trimAdvice({ dday: 5, left: eight, perDay: 2 }).trim === false);

// ─────────────────────────────────────────────────────────────
console.log("\n■ 되풀이는 `lib/queue.js` 가 만든다 — 여기선 부르기만");
{
  // 가짜 DB — auto_rule 한 줄, auto_key 는 처음이면 통과
  const seen = [];
  const fake = {
    async query(sql, p) {
      seen.push(sql.trim().slice(0, 24));
      if (/from v2\.auto_rule/.test(sql))
        return { rows: [{ id: "r1", kind: "todo", name: "수납안내", cron: "monthly",
                          threshold: { title: "수납안내 보내기", due_days: 24 }, active: true }] };
      if (/insert into v2\.auto_key/.test(sql)) return { rows: [{ made_at: "x" }] };
      if (/insert into v2\.todo/.test(sql))
        return { rows: [{ id: "t1", kind: p[0], title: p[1], due_on: p[3], state: "todo",
                          why: p[4], rule_id: p[5] }] };
      return { rows: [] };
    },
  };
  const out = await planRepeats(fake, { today: "2026-10-08", classDays: CLASS });
  ok("되풀이 할 일이 선다", out.todos.length === 1, JSON.stringify(out.made));
  ok("갈래가 `repeat` 이다", out.todos[0].kind === "repeat");
  ok("규칙의 제목을 쓴다", out.todos[0].title === "수납안내 보내기", out.todos[0].title);
  ok("⚠️ **왜 생겼는지**를 적는다 (자동화 뼈대 ③)", /되풀이 규칙/.test(out.todos[0].why), out.todos[0].why);
  ok("⚠️ 규칙을 **외래키로** 가리킨다", out.todos[0].rule_id === "r1");
  ok("마감 10/25(일)이 앞 수업일 10/21 로 당겨졌다", out.todos[0].due_on === "2026-10-21", out.todos[0].due_on);
  ok("열쇠는 queue.js 의 auto_key 를 쓴다 — 여기서 새로 안 만든다",
     seen.some((s) => /insert into v2\.auto_key/.test(s)));
  ok("⚠️ 「학원의 오늘」이 없으면 그 자리에서 던진다",
     await planRepeats(fake, {}).then(() => false, () => true));
}
{
  const fake = { async query() { return { rows: [{ id: "x" }] }; } };
  ok("⚠️ 모르는 갈래로는 할 일을 못 세운다 (오타가 「그 밖」에 조용히 쌓이지 않는다)",
     await addTodo(fake, { kind: "prnt", title: "인쇄" }).then(() => false, () => true));
  ok("제목이 없으면 던진다 (빈 줄이 안 선다)",
     await addTodo(fake, { kind: "print" }).then(() => false, () => true));
  ok("일곱 갈래는 선다", (await addTodo(fake, { kind: "print", title: "인쇄" })).id === "x");
}

// ─────────────────────────────────────────────────────────────
// ⚠️⚠️ 여기부터는 **실제로 난 사고를 그대로 재현하는 줄**이다. 지우지 마라 —
//      이 줄들이 없어서 아래 열두 가지가 오류 없이, 화면도 멀쩡한 채로 지나갔다.
// ─────────────────────────────────────────────────────────────
console.log("\n■ 사고 재현 ① 학사일정 날짜를 앞으로 당겼다 (학교가 정한 날이다 — ㊲)");
{
  const rows = [
    { id: "s9", kind: "schedule", title: "옥련여자고등학교 개교기념일", due_on: "2026-10-10", state: "todo" },
    { id: "p9", kind: "print", title: "자료 인쇄", due_on: "2026-10-11", state: "todo" },
  ];
  const b = board(rows, { today: "2026-10-08", classDays: CLASS });
  ok("⚠️ 토요일에 선 **학사일정**의 날짜는 DB 그대로다 (개천절이 10/1 로 안 보인다)",
     b.aside.rows[0].due_on === "2026-10-10" && !b.aside.rows[0].pulled,
     JSON.stringify(b.aside.rows[0].due_on));
  ok("⚠️ `moved` 는 학사일정을 **안 센다** (「3개를 당겼습니다」가 거짓말이 안 된다)",
     b.moved === 1, String(b.moved));
  ok("당겨진 것은 진짜 할 일뿐이다",
     b.groups.flatMap((g) => g.rows).filter((r) => r.pulled).length === 1);
}

console.log("\n■ 사고 재현 ② 학사일정이 같은 이름의 **진짜 할 일을 삼켰다**");
{
  const rows = [
    { id: "s1", kind: "schedule", title: "옥련여자고등학교 2학기 중간고사", due_on: "2026-10-14", state: "todo" },
    { id: "t1", kind: "todo", title: "옥련여자고등학교 2학기 중간고사", due_on: "2026-10-14", state: "todo" },
  ];
  ok("⚠️ 갈래가 다르면 **안 묶는다** (열쇠가 groupOf 가 아니라 kind 원본이다)",
     mergeSame(rows).length === 2, String(mergeSame(rows).length));
  const b = board(rows, { today: "2026-10-08", classDays: CLASS });
  const mine = b.groups.flatMap((g) => g.rows);
  ok("⚠️ 원장님 할 일이 「그 밖」에 **그대로 남는다** (일정 상자로 안 숨는다)",
     mine.length === 1 && mine[0].id === "t1", JSON.stringify(mine.map((r) => r.id)));
  ok("⚠️ 학사일정 카드의 ids 에 **남의 할 일이 안 딸려 든다** (한 번 체크에 같이 안 끝난다)",
     b.aside.rows[0].ids.join(",") === "s1", b.aside.rows[0].ids.join(","));
  ok("둘 다 세어진다", b.counts.all === 2 && b.counts.open === 1, JSON.stringify(b.counts));
}

console.log("\n■ 사고 재현 ③ 전국 시험(학평·수능)이 **어느 거르개에도 안 잡혔다**");
{
  // v2.exams 의 exam_scope_school 제약 — scope='national' 이면 school_id 는 **NULL 이어야 한다**
  const nat = [{ id: "n1", kind: "make", title: "2409 학평 22-24 변형문제 만들기",
                 due_on: "2026-10-11", exam_id: "e-전국", exam_name: "전국연합",
                 exam_scope: "national", school_id: null, state: "todo" }];
  const at = (f) => board(nat, { filter: f, today: "2026-10-08", classDays: CLASS })
                      .groups.flatMap((g) => g.rows).length;
  ok("거르개에 '전국 시험' 이 있다", FILTERS.some((f) => f.key === "national"),
     FILTERS.map((f) => f.key).join(","));
  ok("⚠️ 전국 시험 할 일이 **'전국' 거르개에 잡힌다** (예전엔 셋 어디에도 안 잡혔다)",
     at("national") === 1, String(at("national")));
  ok("전체에서도 보인다", at("all") === 1);
  ok("학교 거르개에는 안 뜬다 (학교가 안 붙은 시험이다)", at("s-신정중") === 0);
  ok("「시험 없는 것」에도 안 뜬다 — 시험이 있으니까", at("noexam") === 0);
}

console.log("\n■ 사고 재현 ④ 묶인 카드가 「시험 없는 것」에 잘못 떴다");
{
  const rows = [
    { id: "a", kind: "make", title: "변형문제", due_on: "2026-10-11", exam_id: null, state: "todo" },
    { id: "b", kind: "make", title: "변형문제", due_on: "2026-10-11",
      exam_id: "e-옥련", school_id: "s-옥련", exam_scope: "school", state: "todo" },
  ];
  const card = mergeSame(rows)[0];
  ok("⚠️ 시험 없는 줄이 먼저 와도 **「시험 없는 것」이 아니다** (exams 를 같이 본다)",
     passesFilter(card, "noexam") === false, JSON.stringify({ exam_id: card.exam_id, exams: card.exams.length }));
  ok("학교 거르개에는 그대로 걸린다", passesFilter(card, "s-옥련") === true);
}

console.log("\n■ 사고 재현 ⑤ 묶을 때 'dropped' 가 안 끝난 일을 덮었다");
{
  const rows = [
    { id: "a", kind: "print", title: "인쇄", due_on: "2026-10-09", state: "dropped" },
    { id: "b", kind: "print", title: "인쇄", due_on: "2026-10-09", state: "todo" },
  ];
  ok("⚠️ 먼저 온 줄이 `dropped` 여도 **안 끝난 쪽이 이긴다** (v2.todo.state 는 넷이다)",
     mergeSame(rows)[0].state === "todo", mergeSame(rows)[0].state);
  const b = board(rows, { today: "2026-10-10", classDays: CLASS });
  const print = b.groups.find((g) => g.key === "print");
  ok("인쇄 칸의 「남은 것」이 0 이 안 된다", print.left === 1, String(print.left));
  ok("배지에서도 안 사라진다", b.counts.open === 1 && b.late.length === 1, JSON.stringify(b.counts));
}
{
  // 반대쪽도 본다 — 끝난 것만 있으면 끝난 카드다
  const rows = [{ id: "a", kind: "print", title: "인쇄", due_on: "2026-10-09", state: "done" },
                { id: "b", kind: "print", title: "인쇄", due_on: "2026-10-09", state: "dropped" }];
  ok("둘 다 끝났으면 `dropped` 가 아니라 더 안 끝난 쪽(dropped)이 남는다",
     mergeSame(rows)[0].state === "dropped", mergeSame(rows)[0].state);
}

console.log("\n■ 사고 재현 ⑥ 「3개를 빼시겠어요」가 뺄 것이 1개뿐일 때도 떴다");
{
  const left = Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, state: "todo", made_at: i < 7 ? "x" : null }));
  const t = trimAdvice({ dday: 5, left });
  ok("⚠️ 남은 갯수도 **아직 안 만든 것만** 센다 (이미 만든 7개는 뺀다)",
     t.n === 1 && t.already === 7, JSON.stringify({ n: t.n, already: t.already }));
  ok("⚠️ 하루 1개로 되는 일에 「빼시겠어요」를 안 묻는다", t.trim === false, JSON.stringify(t));
  ok("숫자가 왜 줄었는지 같이 말한다", /이미 만든 7개는 뺐습니다/.test(t.why ?? ""), String(t.why));
}
{
  const eight = Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, state: "todo", made_at: null }));
  ok("⚠️ 글과 셈이 같은 값을 쓴다 (하루 0개라고 써 놓고 5개까지라고 하지 않는다)",
     /하루 1개로는 5개까지/.test(trimAdvice({ dday: 5, left: eight, perDay: 0 }).ask),
     trimAdvice({ dday: 5, left: eight, perDay: 0 }).ask);
  ok("음수 속도도 바닥값으로 고쳐 쓴다",
     /하루 1개로는/.test(trimAdvice({ dday: 5, left: eight, perDay: -3 }).ask));
  ok("⚠️ 자료 갯수는 낱개다 (2.5개까지라고 안 한다)",
     Number.isInteger(trimAdvice({ dday: 5, left: eight, perDay: 2.5 }).can),
     String(trimAdvice({ dday: 5, left: eight, perDay: 2.5 }).can));
  const past = trimAdvice({ dday: -3, left: eight });
  ok("⚠️ **시험이 지났으면** 「8개를 빼시겠어요」가 아니라 다른 것을 묻는다",
     past.trim === false && past.past === true && /시험이 지났습니다/.test(past.ask), JSON.stringify(past.ask));
}

console.log("\n■ 사고 재현 ⑦ 되풀이가 **한 번 던지면 영영 안 섰다** (도장이 먼저 찍힌다)");
function fakeRules(rules) {
  const keys = new Set(); const todos = [];
  return { todos, async query(sql, p) {
    if (/from v2\.auto_rule/.test(sql))
      return { rows: /kind = \$1/.test(sql) && p[0] != null ? rules.filter((r) => r.kind === p[0]) : rules };
    if (/insert into v2\.auto_key/.test(sql)) {
      const k = JSON.stringify(p);            // 진짜 auto_key 처럼 on conflict do nothing
      if (keys.has(k)) return { rows: [] };
      keys.add(k); return { rows: [{ made_at: "x" }] };
    }
    if (/insert into v2\.todo/.test(sql)) {
      const r = { id: `t${todos.length}`, kind: p[0], title: p[1], due_on: p[3], state: "todo",
                  why: p[4], rule_id: p[5] };
      todos.push(r); return { rows: [r] };
    }
    return { rows: [] };
  } };
}
{
  const db = fakeRules([{ id: "r1", kind: "todo", name: "수납안내", cron: "monthly",
                          threshold: { title: "", due_days: 24 }, active: true }]);
  const out = await planRepeats(db, { today: "2026-10-08", classDays: CLASS });
  ok("⚠️ 제목이 빈 규칙에 **안 던진다** — 규칙 이름으로 선다 (던지면 도장만 남고 영영 안 선다)",
     out.todos.length === 1 && out.todos[0].title === "수납안내",
     JSON.stringify({ todos: out.todos.length, failed: out.failed }));
  const again = await planRepeats(db, { today: "2026-10-08", classDays: CLASS });
  ok("두 번째 날에는 도장이 이미 있어 안 또 선다 (두 벌이 아니다)",
     again.todos.length === 0 && again.already === 1 && db.todos.length === 1,
     JSON.stringify({ todos: again.todos.length, already: again.already, all: db.todos.length }));
}
{
  const db = fakeRules([{ id: "r1b", kind: "todo", name: "", cron: "monthly",
                          threshold: {}, active: true }]);
  const out = await planRepeats(db, { today: "2026-10-08", classDays: CLASS });
  ok("⚠️ 제목도 이름도 없으면 **안 세우고 까닭을 돌려준다** (던지지 않는다)",
     out.todos.length === 0 && out.failed.length === 1, JSON.stringify(out.failed));
  ok("안 세운 까닭을 화면에 줄 수 있다", /제목/.test(out.failed[0].why), out.failed[0].why);
}
{
  const db = fakeRules([{ id: "r2", kind: "todo", name: "수납안내", cron: "monthly",
                          threshold: { due_days: "D-7" }, active: true }]);
  const out = await planRepeats(db, { today: "2026-10-08", classDays: CLASS });
  ok("⚠️ due_days 가 숫자가 아니면 **안 세우고 말한다** (\"NaN-NaN-Na\" 를 DB 에 안 밀어 넣는다)",
     out.todos.length === 0 && /due_days/.test(out.failed[0]?.why ?? ""), JSON.stringify(out.failed));
  ok("만든 마감에 NaN 이 안 섞인다", db.todos.every((t) => !String(t.due_on).includes("NaN")));
}
{
  // addTodo 가 DB 오류로 터져도 크론이 통째로 멈추지 않는다
  const db = fakeRules([{ id: "r3", kind: "todo", name: "수납안내", cron: "monthly",
                          threshold: { title: "수납안내 보내기" }, active: true }]);
  const boom = { query: async (sql, p) =>
    /insert into v2\.todo/.test(sql) ? Promise.reject(new Error("DB 가 거절했다")) : db.query(sql, p) };
  const out = await planRepeats(boom, { today: "2026-10-08", classDays: CLASS });
  ok("⚠️ addTodo 가 터져도 **planRepeats 는 안 던진다** (다음 규칙까지 죽지 않는다)",
     out.failed.length === 1 && /DB 가 거절했다/.test(out.failed[0].why), JSON.stringify(out.failed));
}

console.log("\n■ 사고 재현 ⑧ 되풀이가 **갈래를 안 가리고** 발송·파기 규칙까지 할 일로 세웠다");
{
  const db = fakeRules([
    { id: "r1", kind: "todo", name: "수납안내", cron: "monthly", threshold: { title: "수납안내 보내기", due_days: 24 }, active: true },
    { id: "r2", kind: "notify", name: "데일리리포트", cron: "daily", threshold: {}, active: true },
    { id: "r3", kind: "purge", name: "파기 훑기", cron: "monthly", threshold: {}, active: true },
  ]);
  const out = await planRepeats(db, { today: "2026-10-08", classDays: CLASS });
  ok("⚠️ 할 일 갈래만 선다 — 데일리리포트·파기 훑기가 **원장님 체크거리로 안 뜬다**",
     out.todos.map((t) => t.title).join(",") === "수납안내 보내기",
     out.todos.map((t) => t.title).join(","));
  ok("⚠️ 건너뛴 갈래를 **세어서 말한다** (조용히 안 버린다 — 대전제 6)",
     out.skippedKinds.join(",") === "notify,purge" && /notify/.test(out.why ?? ""),
     `${out.skippedKinds} / ${out.why}`);
}
{
  // ⚠️ 레포 안의 유일한 실물은 check-cron.mjs 의 kind:'repeat' 이다 — 그것도 서야 한다
  const db = fakeRules([{ id: "r9", kind: "repeat", name: "월간 정리", cron: "매달",
                          threshold: null, active: true }]);
  const out = await planRepeats(db, { today: "2026-10-08", classDays: CLASS });
  ok("kind='repeat' 규칙도 선다 (크론 fixture 가 쓰는 글자다)",
     out.todos.length === 1 && out.todos[0].title === "월간 정리", JSON.stringify(out.todos));
  ok("⚠️ 할 일로 보는 갈래가 **한 글자에 안 걸려 있다** (맞는 쪽을 빼면 영영 안 선다 — 확인 안 됨)",
     REPEAT_KINDS.length >= 2 && REPEAT_KINDS.includes("repeat") && REPEAT_KINDS.includes("todo"),
     REPEAT_KINDS.join(","));
}

console.log("\n■ 사고 재현 ⑨ 수업일을 안 넘기면 되풀이가 **일요일에 그대로 섰다**");
{
  const db = fakeRules([{ id: "r1", kind: "todo", name: "수납안내", cron: "monthly",
                          threshold: { title: "수납안내", due_days: 24 }, active: true }]);
  const seen = [];
  const spy = { query: (sql, p) => { seen.push(sql); return db.query(sql, p); } };
  const out = await planRepeats(spy, { today: "2026-10-08" });      // classDays 를 **안 넘긴다**
  ok("⚠️ 수업일을 안 넘기면 **스스로 읽는다**", seen.some((s) => /class_schedule/.test(s)));
  ok("⚠️ 그래도 못 당기면 카드에 **⚠️ 를 남긴다** (조용히 일요일에 안 선다)",
     /⚠️/.test(out.todos[0].why), out.todos[0].why);
}

console.log("\n■ 사고 재현 ⑩ 「내 할 일」이 **세어 나오는 카드를 하나도 안 세웠다**");
{
  // 오늘 판 하나 · 그 아이가 단어를 못 넘었다 — 재시험 카드가 서야 한다
  const fake = { async query(sql) {
    if (/from v2\.day_sheet/.test(sql))
      return { rows: [{ id: "sh1", student_id: "st1", date: "2026-10-08", student_name: "강민서" }] };
    if (/quiz_failed_today/.test(sql))
      return { rows: [{ quiz_id: "q1", kind: "word", scope: "DAY 23", pct: 83 }] };
    return { rows: [] };
  } };
  const b = await myTodos(fake, { today: "2026-10-08" });
  const retest = b.groups.find((g) => g.key === "retest");
  ok("⚠️ 못 넘은 아이가 **재시험 칸에 선다** (원장님이 손으로 안 찾으신다 — 대전제 3)",
     retest.n === 1, JSON.stringify(retest.rows.map((r) => r.title)));
  ok("교재·시험방식·점수가 카드에 실린다", /강민서.*83%/.test(retest.rows[0].title), retest.rows[0].title);
  ok("`counted:false` 로 끄면 안 센다 (화면이 골라 쓸 수 있다)",
     (await myTodos(fake, { today: "2026-10-08", counted: false })).groups
       .find((g) => g.key === "retest").n === 0);
}
{
  // 같은 자료를 가리키는 todo 줄이 이미 있으면 **두 벌로 안 선다** (원칙 1)
  const cards = await countedCards(
    { async query() { return { rows: [] }; } },
    { today: "2026-10-08", todos: [{ id: "t1", material_id: "m1" }] });
  ok("세어 나온 카드가 배열로 온다", Array.isArray(cards));
}

console.log("\n■ 사고 재현 ⑪ 창 때문에 **오래 밀린 일과 주말 당기기가 조용히 빠졌다**");
{
  const seen = [];
  const fake = { async query(sql, p) { seen.push([sql, p]); return { rows: [] }; } };
  await myTodos(fake, { today: "2026-09-05", filter: "s-옥련" });
  const todoP = seen.find(([s]) => /from v2\.todo/.test(s))[1];
  const schedP = seen.find(([s]) => /class_schedule/.test(s))[1];
  ok("⚠️ 수업일 창이 목록 창보다 **7일 앞선다** (창 왼쪽 끝 토·일 마감이 안 당겨졌다)",
     schedP[0] === addDays(todoP[1], -7), `${schedP[0]} vs ${todoP[1]}`);
  ok("⚠️ 학교 거르개를 **SQL 에 안 넘긴다** (넘기면 학사일정·전국시험이 통째로 사라진다)",
     todoP[3] === null, JSON.stringify(todoP[3]));
}

// ─────────────────────────────────────────────────────────────
console.log("\n■ ⚠️ 진짜 DB 에 물어본다 — 가짜 DB 는 **죽은 칸을 원리적으로 못 잡는다**");
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();
  // ⚠️ **읽기만.** 쓰기를 막아 두고 돈다 — 검사가 자료를 바꾸면 다음 검사가 달라진다
  await c.query("begin read only");
  const db = { query: (sql, p) => c.query(sql, p) };

  const rows = await loadTodos(db, {});
  ok("할 일을 진짜로 읽었다", rows.length > 0, String(rows.length));

  const sched = rows.filter((r) => r.kind === "schedule");
  ok("⚠️ 옛 앱 학사일정이 실제로 들어 있다 (일곱에 없는 갈래)", sched.length > 0, String(sched.length));

  const days = await academyDays(db, "2026-10-01", "2026-10-31");
  ok("진짜 수업일을 세었다 (session.js 의 countDates 를 그대로 쓴다)", days.size > 0, String(days.size));
  ok("주말이 수업일에 안 섞였다", ![...days].some(isWeekend),
     [...days].filter(isWeekend).join(","));

  // ⚠️ 사고 재현 — 창(today-14) 밖으로 밀린 **미완료**가 오류 없이 사라졌다
  {
    const T = "2026-10-08";
    const late = await loadTodos(db, { from: T });          // 창을 오늘부터로 좁혀도
    const old = late.filter((r) => r.due_on && ymd(r.due_on) < T && r.kind !== "schedule");
    ok("⚠️ **안 끝난 것은 창 밖이어도 온다** (가장 오래 밀린 것이 먼저 숨던 창이었다)",
       old.length > 0, `창 밖 미완료 ${old.length}줄`);
    const all = await loadTodos(db, {});
    const openAll = all.filter((r) => r.kind !== "schedule").length;
    ok("창을 좁혀도 미완료 갯수가 그대로다 (조용히 안 잘린다)",
       late.filter((r) => r.kind !== "schedule").length === openAll,
       `${late.filter((r) => r.kind !== "schedule").length} vs ${openAll}`);
  }

  const b = await myTodos(db, { today: "2026-10-08" });
  ok("진짜 자료로 한 판이 선다", b.groups.length === 8);
  ok("⚠️ 진짜 학사일정이 **안 사라지고** 옆으로 치워졌다", b.aside.n > 0, String(b.aside.n));
  {
    // ⚠️ 사고 재현 — 추석연휴 09-26 → 09-23 · 개천절 10-03 → 10-01 로 보였다
    const dbDay = new Map((await loadTodos(db, {}))
      .filter((r) => r.kind === "schedule").map((r) => [r.id, r.due_on ? ymd(r.due_on) : null]));
    const wrong = b.aside.rows.filter((r) => dbDay.has(r.id) && r.due_on !== dbDay.get(r.id));
    ok("⚠️ 진짜 학사일정의 날짜가 **DB 그대로다** (학교가 정한 날을 안 당긴다 — ㊲)",
       wrong.length === 0,
       wrong.slice(0, 3).map((r) => `${r.title} ${dbDay.get(r.id)}→${r.due_on}`).join(" · "));
    ok("⚠️ `moved` 가 진짜 할 일만 센다 (「N개를 당겼습니다」가 학사일정이 아니다)",
       b.moved === b.groups.flatMap((g) => g.rows).filter((r) => r.pulled).length,
       `${b.moved} vs ${b.groups.flatMap((g) => g.rows).filter((r) => r.pulled).length}`);
  }
  {
    // ⚠️ 사고 재현 — 학교 거르개를 SQL 로 넘겨 학사일정 32줄이 통째로 사라졌다
    const one = await myTodos(db, { today: "2026-10-08", filter: "s-없는학교" });
    ok("⚠️ 학교를 골라도 **학사일정 줄이 안 사라진다**", one.aside.n === b.aside.n,
       `${one.aside.n} vs ${b.aside.n}`);
  }
  ok("한 줄도 안 없어졌다",
     b.groups.reduce((s, g) => s + g.n, 0) + b.aside.n === b.counts.all,
     `${b.groups.reduce((s, g) => s + g.n, 0)} + ${b.aside.n} vs ${b.counts.all}`);
  ok("당겨진 마감은 전부 수업일이거나 그대로다",
     b.groups.flatMap((g) => g.rows).filter((r) => r.pulled).every((r) => days.has(r.due_on) || !r.pulled.moved),
     "당긴 뒤 수업일이 아닌 줄이 있다");

  ok("자료를 읽는 SQL 이 진짜 칸으로 돈다", Array.isArray(await loadMaterials(db, {})));
  ok("재시험 카드가 진짜 판으로 돈다 (판정은 lib/word.js 한 곳)",
     Array.isArray(await retestCards(db, { sheets: [] })));
  ok("성적 안 받은 아이 SQL 이 돈다", Array.isArray(await loadScoreLeft(db, null)));
  const ex = await loadExams(db, { today: "2026-10-08" });
  ok("시험 목록 SQL 이 돈다", Array.isArray(ex));
  ok("⚠️ 영어 시험일이 없는 시험은 `needsEnglishDate` 로 선다 (루틴을 안 세운다)",
     ex.every((e) => e.needsEnglishDate === (e.english_on == null)));

  await c.query("rollback");
  await c.end();
} catch (e) {
  fail++; console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e.message).split("\n")[0]);
}

console.log(`\n■ 할 일 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
