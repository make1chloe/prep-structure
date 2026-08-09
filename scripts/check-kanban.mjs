/**
 * **할일 칸반** (0113 · 원장님 2026-08-09, academy-video 벤치마킹).
 *
 * 벤치마킹 문서는 「할일 / 진행중 / 완료 3컬럼 드래그」 라고만 적혀 있다.
 * 그대로 베끼면 우리 앱에서는 안 된다 — 저쪽에는 없는 것이 우리에겐 있다:
 *
 *   · 할일이 스무 개가 넘는다 (원장님 확인)
 *   · 반복 루틴이 매일 자동으로 할일을 만들어 넣는다
 *   · tasks 표를 학사일정 · 수업 · 보강이 같이 쓴다
 *
 * 여기서 그 세 가지를 못 박는다.
 *
 * 쓰는 법:  node scripts/check-kanban.mjs
 */
import { readFileSync } from "node:fs";
import { split, band, isSoon, byUrgency } from "../lib/kanban.js";

let bad = 0;
const read = (f) => readFileSync(f, "utf8");
const say = (m) => { console.log(`  ✗ ${m}`); bad = 1; };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    say(`${what}\n     나온 것: ${JSON.stringify(got)}  바란 것: ${JSON.stringify(want)}`);
  } else {
    console.log(`  ${what}`);
  }
};

const NOW = "2026-08-09";
const WEEK = "2026-08-16";
const T = (o) => ({ status: "open", priority: 0, no_due: false, ...o });

console.log("== 오늘 할 일이 나중 것 아래로 내려가지 않나 ==");
/**
 * 처음엔 중요도를 마감보다 앞에 뒀다. 그랬더니 「오늘 마감인 보통 일」 이
 * 「이레 뒤 마감인 중요한 일」 아래로 내려갔다 — 화면을 찍어 보고서야 알았다.
 * 오늘 해야 하는 것이 아래에 있으면 그건 틀린 목록이다.
 */
const mix = [
  T({ id: "먼중요", title: "모의고사 성적 입력", due_on: "2026-08-16", priority: 1 }),
  T({ id: "오늘보통", title: "클래스카드 올리기", due_on: NOW, priority: 0 }),
  T({ id: "지남", title: "특강 교재 주문", due_on: "2026-08-06", priority: 2 }),
];
eq(mix.slice().sort(byUrgency(NOW)).map((t) => t.id), ["지남", "오늘보통", "먼중요"],
   "지난 것 → 오늘 것 → 나중 것 차례");
eq([band(T({ due_on: "2026-08-01" }), NOW), band(T({ due_on: NOW }), NOW),
    band(T({ due_on: "2026-09-01" }), NOW), band(T({ no_due: true }), NOW)],
   [0, 1, 2, 3], "지남 · 오늘 · 나중 · 마감없음 순으로 묶인다");

console.log("\n== 스무 장을 한 칸에 쌓지 않나 ==");
/**
 * 「할 것」 칸에 스무 장이 쌓이면 칸 안에 스크롤이 생기고, 그 순간 칸반은
 * 「좁은 칸에 갇힌 목록」 이 된다. 코앞의 것만 올리고 나머지는 접는다.
 */
const many = Array.from({ length: 24 }, (_, i) =>
  T({ id: `t${i}`, due_on: `2026-${i < 12 ? "08" : "10"}-${String((i % 28) + 1).padStart(2, "0")}` })
);
const s1 = split({ todos: many, now: NOW, week: WEEK, started: true });
if (s1.todo.length > 12) say(`「할 것」 칸에 ${s1.todo.length}장이 올라갑니다 (접히는 것이 없습니다)`);
else console.log(`  코앞 ${s1.todo.length}장만 올라가고 ${s1.later.length}장은 접힙니다`);
eq(s1.todo.length + s1.later.length, many.length, "접힌 것도 사라지지 않는다 (합이 맞는다)");

// 급한 것은 마감이 멀어도 올린다 — 급하다고 적어두신 뜻이 그것이다
eq(isSoon(T({ due_on: "2026-12-01", priority: 2 }), NOW, WEEK), true, "급한 것은 마감이 멀어도 올린다");
eq(isSoon(T({ no_due: true }), NOW, WEEK), false, "마감 없는 것은 접힌다");

console.log("\n== 「하는 중」 이 일을 사라지게 하지 않나 ==");
/**
 * **이 앱에서 제일 자주 물린 함정.** status 에 doing 을 넣었으면 진행중인
 * 할일은 open 도 done 도 아니게 되어, 메뉴 배지·대시보드·달력에서 통째로
 * 빠졌을 것이다. 오류는 안 난다 — 조용히 안 세진다.
 */
const doingRow = T({ id: "d1", due_on: NOW, started_at: "2026-08-09T01:00:00Z" });
eq(doingRow.status, "open", "하는 중이어도 status 는 open 이다");
const s2 = split({ todos: [doingRow], now: NOW, week: WEEK, started: true });
eq([s2.doing.length, s2.todo.length], [1, 0], "하는 중 칸으로 가고 할 것 칸에서는 빠진다");

const act = read("app/todo/actions.js");
const started = act.slice(act.indexOf("export async function setTodoStarted"));
const body = started.slice(0, started.indexOf("\n}\n") + 3);
eq(/status/.test(body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^.*setTodoStatus.*$/gm, "")), false,
   "손대기 단추가 status 를 건드리지 않는다");
// 0113 이 없으면 조용히 실패하면 안 된다
eq(/0113/.test(started.slice(0, started.indexOf("\n}\n"))), true,
   "0113 전이면 SQL 을 실행하라고 말한다");

console.log("\n== 0113 전에는 두 칸으로 선다 ==");
const s3 = split({ todos: [doingRow], now: NOW, week: WEEK, started: false });
eq([s3.doing.length, s3.todo.length], [0, 1],
   "칸이 없으면 카드는 「할 것」 에 남는다 (사라지지 않는다)");

console.log("\n== 끝낸 칸이 무덤이 되지 않나 ==");
const s4 = split({
  todos: [
    T({ id: "오늘끝", status: "done", done_at: `${NOW}T05:00:00Z`, due_on: NOW }),
    T({ id: "지난달끝", status: "done", done_at: "2026-07-02T05:00:00Z", due_on: "2026-07-02" }),
  ],
  now: NOW, week: WEEK, started: true,
});
eq([s4.doneToday.map((t) => t.id), s4.doneAll], [["오늘끝"], 2],
   "오늘 끝낸 것만 세우되, 그전 것이 몇 개인지는 안다");

console.log("\n== 화면이 실제로 그렇게 쓰나 ==");
const kb = read("app/todo/TodoKanban.jsx");
eq(/from "@\/lib\/kanban"/.test(kb), true, "화면이 같은 함수를 쓴다 (두 벌로 나누지 않는다)");
// **폰에서는 끌어놓기가 안 된다** — 손가락으로는 화면만 구른다
eq(/onClick=\{\(\) => moveTo\(/.test(kb), true, "카드에 단추가 있다 (폰에서 옮길 수 있다)");
eq(/onDrop=/.test(kb), true, "PC 에서는 끌어서도 옮긴다");
// 머릿수와 보이는 장수가 다르면 안 된다 — 「17」 인데 9장만 보이면 여덟 장을 찾을 수가 없다
eq(/count=\{openLater \? todo\.length \+ later\.length : todo\.length\}/.test(kb), true,
   "칸 머릿수는 보이는 장수를 센다");
eq(/나중 것 \$\{later\.length\}개/.test(kb), true, "접힌 것이 몇 개인지 적어둔다");
// 루틴이 만든 것은 티가 나야 한다 — 저쪽 앱에 없는 갈래다
eq(/t\.auto_key/.test(kb), true, "앱이 만든 할일은 「자동」 이라고 적는다");

console.log("\n== 폰에서 칸이 잘리지 않나 ==");
/**
 * 칸 안 스크롤을 폰에도 걸었더니 마지막 카드가 반쯤 잘린 채 멈췄다
 * (화면을 찍어 보고 잡았다). 폰은 칸이 위아래로 쌓여 페이지가 이미 구른다.
 */
const css = read("app/globals.css");
const kbBody = css.slice(css.indexOf(".kbbody"));
const flat = kbBody.slice(0, kbBody.indexOf("\n.kbcard"));
eq(/@media \(min-width: 820px\) \{\s*\.kbbody \{ max-height/.test(flat.replace(/\n/g, " ")), true,
   "칸 안 스크롤은 PC 에서만 건다");
eq(/^\.kbbody \{[^}]*max-height/m.test(flat), false, "폰에는 칸 높이 제한이 없다");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 할일 칸반 통과");
