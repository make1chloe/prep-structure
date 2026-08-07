/**
 * **부르는 중은 가봤으면 지워져야 한다** (2026-08-07)
 *
 * 원장님 — 「부르는 중을 해결했을 때 완료 처리해서 없애고 싶어」
 *
 * 부르는 것은 아이가 켜고 **아이가 꺼야** 했다. 그런데 아이는 선생님이
 * 오시면 그걸로 끝난 것이라 폰을 다시 안 본다. 그래서 「🙋 부르는 중」 이
 * 현황판 맨 위에 그대로 남는다.
 *
 * 이건 오류로 안 잡힌다. 화면은 멀쩡하고, 다만 **다음에 정말 부른 아이가
 * 그 사이에 묻힌다.** 기다리는 사람 수도 거짓말이 된다.
 *
 * 쓰는 법:  node scripts/check-call.mjs
 */
import { readFileSync } from "node:fs";

let bad = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); bad = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 선생님이 지울 수 있나 ==");
const act = read("app/today/callActions.js");
eq(act.startsWith('"use server"'), true, "서버에서 지운다");
eq(/from\("student_activity"\)\s*\n?\s*\.delete\(\)/.test(act), true, "그 줄을 지운다");
// 표에는 학생당 한 줄뿐이라(0084) 지우면 「아무것도 안 하는 중」 으로 돌아간다.
// 아이가 다시 누르면 그때부터 또 부르는 중이다 — 막는 것이 아니다
eq(act.includes("resolveAllCalls"), true, "여럿을 한 번에 지우는 길도 있다");
// **학생 화면도 다시 읽어야 한다** — 아이 화면에 눌린 채로 남으면 다시
// 누를 수가 없다 (누르면 꺼진다)
eq(/revalidatePath\("\/me"\)/.test(act), true, "학생 화면도 다시 읽는다");

console.log("\n== 화면에 단추가 있나 ==");
const board = read("app/today/ActivityBoard.jsx");
eq(board.includes("resolveCall"), true, "현황판에서 부른다");
eq(/\{busy === x\.id \? "…" : "완료"\}/.test(board), true, "이름 옆에 「완료」");
// 여러 명이 부른 날에는 하나씩 누르는 것이 일이 된다
eq(board.includes('"전부 완료"'), true, "여럿이면 한 번에");
// 실시간이 끊긴 자리에서도 눌렀으면 사라져야 한다
eq(/router\.refresh\(\)/.test(board), true, "누르면 그 자리에서 다시 읽는다");

console.log("\n== 아이가 부르는 자리는 그대로 ==");
// 지우는 것은 선생님 쪽 일이다. 아이가 다시 부르는 길을 막으면 안 된다
const card = read("app/me/StateCard.jsx");
eq(card.includes("STUDENT_PICKABLE"), true, "아이는 여전히 자기 화면에서 부른다");
eq(read("lib/activity.js").includes('STUDENT_PICKABLE = ["ask", "bug", "help", "break"]'), true,
   "무슨 일로 부르는지 세 갈래 그대로");
// 부르면 선생님 폰이 울리는 것도 그대로 (0104)
eq(read("app/me/stateActions.js").includes("pushToStaff"), true, "부르면 알린다");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 부르는 중 · 완료 처리 통과");
