/**
 * **흩어진 것을 모으고, 안 읽히는 말을 걷어냈나** (2026-08-07)
 *
 * 원장님
 *   「정보과잉인 경우 없는지 점검하고 개선해」
 *   「같은 종류로 묶여서 관리되어야할 항목이 흩어져있는게 없는지
 *    전체 하나하나 확인하고 개선해」
 *
 * 이런 것은 고쳐놓아도 **다음에 화면 하나 만들 때 도로 흩어진다.** 새 기능은
 * 늘 「일단 새 화면에」 로 붙기 때문이다. 그래서 못 박아둔다.
 *
 * 쓰는 법:  node scripts/check-tidy.mjs
 */
import { readFileSync } from "node:fs";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 출결은 한 화면에 ==");
const plan = read("app/plan/page.jsx");
const board = read("app/plan/PlanBoard.jsx");
eq(plan.includes("<MakeupInbox"), true, "보강 필요");
eq(plan.includes("<MakeupAnswers"), true, "잡아둔 보강 (취소도 여기서)");
eq(board.includes("AbsenceRows"), true, "앞으로 잡힌 결석 예정 목록");
// **무르는 자리가 넣는 자리에 있어야 한다.** 이게 없어서 원장님이
// 「보강이나 결석예정 취소가 어렵네」 라고 하셨다
eq(read("app/plan/AbsenceRows.jsx").includes("cancelAbsence"), true, "그 줄에서 바로 취소");
// 「수업 준비」 라는 이름으로는 여기 결석이 있는 줄을 알 수가 없었다
eq(read("lib/menu.js").includes('label: "출결"'), true, "메뉴 이름도 「출결」");
eq(read("lib/menu.js").includes("수업 준비"), false, "옛 이름이 남아 있다");

console.log("\n== 숙제 미리 내기는 검사 화면으로 ==");
// 검사하면서 다음 숙제를 정하는 것이 실제 순서다 — 두 화면이면 두 번 연다
eq(read("app/check/page.jsx").includes("<AheadBoard"), true, "숙제 검사 화면에 붙었다");
eq(read("app/check/AheadBoard.jsx").includes("assignHomeworkAhead"), true, "숙제 내기");
eq(read("app/check/AheadBoard.jsx").includes("createNotice"), true, "공지도 같이 왔다");
// 검사가 이 화면의 본일이다 — 접혀 있어야 검사만 하실 때 방해가 안 된다
eq(read("app/check/AheadBoard.jsx").includes("if (!open)"), true, "접어둔다");
eq(board.includes("assignHomeworkAhead"), false, "출결 화면에 숙제가 남아 있다");

console.log("\n== 미리 적어두는 말은 한 자리에 ==");
const menu = read("lib/menu.js");
// 「문자 문구」 와 「안내 문구」 — 이름이 비슷한 두 칸이 나란히 있었다
eq(menu.includes('label: "안내 문구"'), false, "설정 메뉴에서 두 칸을 차지하던 것");
eq(read("app/settings/messages/page.jsx").includes("NotesForm"), true, "한 화면 안의 두 칸으로");
// 즐겨찾기로 들어오시면 빈 화면이 아니라 옮겨간 자리로
eq(read("app/settings/notes/page.jsx").includes("redirect"), true, "옛 주소는 데려다준다");

console.log("\n== 설명 문구는 껐다 켤 수 있게 ==");
/**
 * 화면마다 제목 밑에 서너 줄씩 붙어 있었다. 처음 여는 날에는 도움이 되지만
 * 원장님은 이 화면들을 매일 여신다 — 백 번째 여는 날에도 같은 서너 줄이
 * 제목과 볼 것 사이를 가로막는다. **지우지는 않고** 기본을 꺼둔다.
 */
const help = read("components/Help.jsx");
eq(help.includes('=== "on"'), true, "켜야만 보인다 (기본은 감춤)");
for (const p of ["app/check/page.jsx", "app/schools/page.jsx", "app/scores/page.jsx",
                 "app/tasks/page.jsx", "app/schedule/page.jsx"]) {
  eq(read(p).includes("<Help>"), true, `${p} 의 설명 문구가 스위치를 탄다`);
}
// 학생·학부모 화면에서는 설명이 곧 안내다 — 거기까지 끄면 안 된다
eq(read("app/me/page.jsx").includes("<Help>"), false, "학생 화면은 그대로");
eq(read("app/parent/page.jsx").includes("<Help>"), false, "학부모 화면은 그대로");
eq(read("app/apply/page.jsx").includes("<Help>"), false, "신규 상담 신청서도 그대로");
// 켜는 자리가 없으면 켜진 채로 못 돌아간다
eq(read("app/settings/screen/page.jsx").includes("<HelpBox"), true, "화면 설정에 스위치가 있다");

console.log("\n== 시험 한 줄에 붙는 말 ==");
const ex = read("lib/exams.js");
// 목록의 거의 전부가 「내가 적음」 이다 — 다 붙는 말은 아무것도 안 알려준다
eq(/mine:\s*""/.test(ex), true, "「내가 적음」 은 안 붙인다");
eq(/linked:\s*"나이스"/.test(ex), true, "붙어 있는 것만 「나이스」 라고");
// 바뀐 줄에는 바로 위에 무엇이 어떻게 바뀌었는지가 이미 있다
eq(/changed:\s*""/.test(ex), true, "「바뀜」 을 두 번 말하지 않는다");
const sb = read("app/schedule/ScheduleBoard.jsx");
eq(sb.includes('{e.grade || "전체"}'), false, "학년 자리에 「전체」 를 적던 것");
eq(sb.includes("cleanNote(e.note)"), true, "「노션 이관」 은 화면에서 뗀다");

if (fail) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 정리 상태 통과");
