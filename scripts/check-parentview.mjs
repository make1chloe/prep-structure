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
/**
 * 2026-08-07 에 **출결 화면으로 옮겼다** (원장님 — 「보강, 결석사전연락,
 * 출석을 출결페이지에서 관리하는게 나을거 같기도 해」).
 *
 * 대시보드에는 「보강 잡을 것 N건」 배지만 남는다. 어디에 있든 상관없지만
 * **어딘가에는 반드시 있어야 한다** — 어머니가 「그날 시험이라 안 돼요」 라고
 * 누르신 것이 아무 화면에도 안 뜨면, 그 보강은 잡힌 채로 지나간다.
 */
eq(read("app/plan/page.jsx").includes("<MakeupAnswers"), true, "출결 화면에 있다");
eq(read("app/plan/page.jsx").includes("<MakeupInbox"), true, "보강 잡을 것도 같은 화면에");
eq(read("app/page.jsx").includes("보강 잡을 것"), true, "대시보드에는 배지로 남는다");
const rowsFile = read("app/MakeupRows.jsx");
eq(rowsFile.includes("변경 요청"), true, "변경 요청이 먼저 보인다");
eq(rowsFile.includes("답 없음"), true, "답 없는 것도 보인다");

console.log("\n== 잡았다가 무를 수 있나 ==");
// 잡는 길만 있고 무르는 길이 없었다 — 잘못 잡으면 그날 오지도 않을 아이가
// 「오늘 수업」 에 뜬다 (원장님, 2026-08-07)
eq(rowsFile.includes("cancelMakeup"), true, "보강 취소 버튼이 있다");
const pl = read("app/plan/actions.js");
eq(pl.includes("export async function cancelMakeup"), true, "취소하는 길이 있다");
// **결석은 그대로 둔다.** 지우면 회차와 수강료가 어긋난다
eq(/cancelMakeup[\s\S]*?\.eq\("status", "makeup"\)/.test(pl), true,
   "보강 줄만 지운다 (결석은 그대로)");
// 어머니는 그날 아이를 보내실 참이었다 — 조용히 지우면 헛걸음을 하신다
eq(/cancelMakeup[\s\S]*?pushToFamilies/.test(pl), true, "취소하면 알린다");

console.log("\n== 전달사항 — 답장 여러 번 · 보낸 쪽 취소 ==");
/**
 * 원장님 (2026-08-07)
 *   「답장을 반복적으로 할 수 있게. 학생에게는 확인완료·조정필요,
 *    학부모님께는 확인하였습니다 뭐 그런 문구를 OX 상황에 맞게」
 *   「학부모, 학생 화면에서 전달 취소가 가능하게. 제출 후에 나한테는 다 보이게」
 */
const { QUICK, quickFor } = await import("../app/requests/quick.js");
// 아이에게 「확인하였습니다」 는 어색하고, 어머니께 「확인완료」 는 무뚝뚝하다
eq(quickFor("student", true), "확인완료", "학생 · O");
eq(quickFor("student", false), "조정필요", "학생 · X");
eq(quickFor("parent", true), QUICK.parent.ok, "학부모 · O");
eq(/확인하였습니다/.test(quickFor("parent", true)), true, "학부모께는 「확인하였습니다」");
eq(/조정/.test(quickFor("parent", false)), true, "학부모 · X 에도 조정 이야기");
// 모르는 역할은 학생 말투로 (모를 때 존댓말이 지나치면 오히려 어색하다)
eq(quickFor(undefined, true), "확인완료", "역할을 모르면 학생 쪽으로");

const inbox = read("app/RequestInbox.jsx");
// **처리한 것이 사라지면 무슨 말을 했는지 다시 볼 수 없다**
eq(inbox.includes("지난 것"), true, "처리한 것도 볼 수 있다");
// 처리한 줄도 답장 버튼이 살아 있어야 한다 (「지난 것」 을 펴면 그 자리에서)
eq(/quickFor\(role, true\)/.test(inbox) && inbox.includes("Row(r, true)"), true,
   "처리한 뒤에도 답장할 수 있다");
eq(inbox.includes("quickFor"), true, "빠른 문구를 쓴다");
// 예전에는 status='new' 만 받아서 「확인」 을 누르는 순간 사라졌다
eq(read("lib/dashboard.js").includes('.from("requests").select("id, student_id, kind, from_date, to_date, body, status, reply, thread'),
   true, "대시보드가 처리한 것까지 받아온다");

const ra = read("app/requests/actions.js");
// 답장을 덮어쓰면 앞의 말이 사라진다
eq(ra.includes("nextThread"), true, "답장을 쌓는다 (덮어쓰지 않는다)");
eq(ra.includes("export async function cancelRequest"), true, "보낸 쪽에서 무를 수 있다");
// 이미 처리한 것을 무르면, 왜 깔렸는지 모르는 결석이 남는다
eq(read("supabase/migrations/0108_request_thread.sql").includes("return 'handled'"), true,
   "이미 확인한 것은 못 무른다");
// 취소해도 지우지 않는다 — 「이 얘기가 왜 사라졌지」 가 없어야 한다
eq(inbox.includes("보낸 쪽에서 취소"), true, "취소한 것도 원장님께는 보인다");

const rfCancel = read("app/me/RequestForm.jsx");
eq(rfCancel.includes("cancelRequest"), true, "학생·학부모 화면에 취소 버튼");

if (fail) { console.log("\n❌ 학부모 화면에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 학부모 화면 통과");
