/**
 * **학부모 화면에서 조심할 것들** (2026-08-07)
 *
 * 원장님
 *   「데일리리포트의 코멘트, 성장은 예민한 부분이야. 가장 최근의 것 1개를
 *    보여주고, 나머지는 필요시 확인할 수 있게 해줘」
 *   「제출을 했을 때는 제출 완료만 표시하고, 그걸 내가 확인했는지
 *    안했는지까지는 노출시키지 마」
 *   「보강 일정이 안내되었을 때 학부모가 확정 버튼까지 누르게 만들어…
 *    둘 중 하나라도 누르지 않으면 계속 첫 화면에서 경고메세지를」
 *
 * 여기서 무너지면 **사람 사이가 상한다.** 오류가 아니라서 아무도 못 잡는다.
 *
 * 쓰는 법:  node scripts/check-parentview.mjs
 */
import { readFileSync } from "node:fs";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const read = (p) => readFileSync(p, "utf8");
const noComment = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const pa = noComment(read("app/parent/page.jsx"));

console.log("== 최근 것 하나만 펴둔다 ==");
/**
 * 지난 수업 넉 줄이 나란히 있으면 어머니는 **줄을 세로로 읽으며 견주신다** —
 * 「지난주는 90점인데 이번주는 70점」. 한 회차의 점수는 그날 컨디션인데
 * 늘어놓으면 흐름처럼 읽힌다. 흐름은 성장 카드가 보여드리는 몫이다.
 */
eq(pa.includes("lessons.slice(0, 1)"), true, "최근 수업 — 하나만");
eq(/lessons\.slice\(1\)/.test(pa), true, "나머지는 접어서 그대로 둔다 (지운 것이 아니다)");
eq(pa.includes("list.slice(0, 1)"), true, "성장 — 종류마다 하나만");
eq(/list\.slice\(1,/.test(pa), true, "나머지 성적도 접어서 그대로");
// 옛날처럼 넉 줄을 그냥 늘어놓으면 안 된다
eq(pa.includes("list.slice(0, 4)"), false, "네 줄을 펼쳐놓던 것이 남아 있다");

console.log("\n== 제출은 「제출 완료」 만 ==");
const rf = noComment(read("app/me/RequestForm.jsx"));
eq(rf.includes("제출 완료"), true, "「제출 완료」 라고 적는다");
// 「전달됨」 이 며칠 그대로면 「왜 안 보시지」 가 된다. 수업 중에는 화면을
// 못 여시는 것이 당연한데, 그 사정은 어머니께 안 보인다
eq(/확인됨|전달됨/.test(rf), false, "확인했는지 안 했는지가 남아 있다");

console.log("\n== 보강 확정 ==");
const mc = read("app/parent/MakeupConfirm.jsx");
eq(mc.includes("확정"), true, "확정 버튼");
eq(mc.includes("일정 변경 요청"), true, "일정 변경 요청 버튼");
// **막지는 않는다.** 어머니를 막으면 그 항의가 원장님께 간다
eq(mc.includes("children"), false, "화면을 가리지 않는다 (문이 아니라 알림 칸이다)");
eq(pa.includes("<MakeupConfirm"), true, "학부모 첫 화면에 있다");
// 답하시면 사라져야 잔소리로 안 남는다
const ma = read("app/parent/makeupActions.js");
eq(ma.includes("!r.makeup_confirmed_at && !r.makeup_change_req"), true, "답한 것은 안 뜬다");
eq(ma.includes('gte("date", todaySeoul())'), true, "지나간 보강에는 안 뜬다");
// attendance 를 통째로 열면 출결을 학부모가 고칠 수 있게 된다
eq(ma.includes("confirm_makeup"), true, "표는 잠가두고 문으로만 적는다");

console.log("\n== 선생님 쪽에 답이 모이나 ==");
const ans = read("app/MakeupAnswers.jsx");
eq(read("app/page.jsx").includes("<MakeupAnswers"), true, "대시보드에 있다");
eq(ans.includes("변경 요청"), true, "변경 요청이 먼저 보인다");
eq(ans.includes("아직 답 없음"), true, "답 없는 것도 보인다");

if (fail) { console.log("\n❌ 학부모 화면에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 학부모 화면 통과");
