/**
 * **신규 문의에 나가는 문자 두 통** (2026-08-07)
 *
 * 원장님
 *   「하나 빠진게 있었어 신규생문의시
 *     1. 전화옴
 *     2. 문자로 설문지 제출할 링크 보내줌
 *     3. 레시간, 상담시간 및 오는 길 안내 문자 보내줘야함」
 *
 * 이 문자는 **처음 오시는 분께 가는 첫 글**이다. 여기서 「{{상담일시}}」 가
 * 그대로 적혀 나가면 그 집은 학원을 그렇게 기억하게 된다.
 *
 * 쓰는 법:  node scripts/check-inqsms.mjs
 */
import { readFileSync } from "node:fs";
import { whenText, fill, guideVars, linkVars, FALLBACK } from "../lib/inquirySms.js";

let bad = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); bad = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 언제라고 적나 ==");
// 날짜 모양은 앱 전체와 같다 (lib/day.js 의 longLabel)
eq(whenText("2026-08-12", "17:00"), "8월 12일 (수) 오후 5시", "오후");
eq(whenText("2026-08-12", "09:30"), "8월 12일 (수) 오전 9시 30분", "오전 · 분");
eq(whenText("2026-08-12", "12:00"), "8월 12일 (수) 오후 12시", "정오는 12시 (0시가 아니다)");
eq(whenText("2026-08-12", ""), "8월 12일 (수)", "시간을 안 정했으면 날짜만");
eq(whenText("", "17:00"), "", "날짜가 없으면 아무것도");

console.log("\n== 못 채운 빈칸 ==");
/**
 * 「{{상담일시}}」 가 적힌 문자가 나가면 어머니는 뭘 보신 건지 알 수 없다.
 * 지우기만 하면 「부모님 방문상담: 」 이 남는데, 그것도 안 하느니만 못하다 —
 * 줄째로 걷어낸다.
 */
eq(
  fill("레벨테스트: {{레테일시}}\n부모님 방문상담: {{상담일시}}", { 레테일시: "8월 12일 (수)" }),
  "레벨테스트: 8월 12일 (수)",
  "못 채운 줄은 통째로 빠진다"
);
eq(fill("{{학원명}} 안녕하세요", { 학원명: "클로이영어" }), "클로이영어 안녕하세요", "채운다");
// 말이 남아 있는 줄은 지우지 않는다 — 문장 가운데가 빈 것뿐이다
eq(
  fill("레벨테스트는 {{분}}분 정도 걸리며 편하게 오시면 됩니다.", {}),
  "레벨테스트는 분 정도 걸리며 편하게 오시면 됩니다.",
  "글이 있는 줄은 남긴다"
);

console.log("\n== 보낼 것이 없으면 안 보낸다 ==");
const S = { academy: { name: "클로이영어" }, message: { address: "인천 연수구 …", phone: "032-000-0000" } };
eq(guideVars({ name: "김서은" }, S), null, "레테도 상담도 안 잡혔으면 null");
const v = guideVars({ name: "김서은", test_on: "2026-08-12", test_at: "17:00" }, S);
eq(v?.레테일시, "8월 12일 (수) 오후 5시", "레테만 잡혀도 보낸다");
eq(v?.상담일시, "", "상담은 비어 있고 (그 줄이 빠진다)");
// 방문상담(visit_on)도 상담 시간으로 본다 — 학부모가 양식에서 고르시는 칸이다
eq(guideVars({ visit_on: "2026-08-13", visit_at: "14:00" }, S)?.상담일시,
   "8월 13일 (목) 오후 2시", "방문상담도 상담 시간이다");

console.log("\n== 기본 문구가 말이 되나 ==");
// 0109 를 아직 안 돌린 DB 에서도 문자는 나가야 한다
const guide = fill(FALLBACK.visit_info, guideVars(
  { name: "김서은", test_on: "2026-08-12", test_at: "17:00", consult_on: "2026-08-13", consult_at: "14:00" }, S));
eq(/\{\{/.test(guide), false, "빈칸이 남아 있으면 안 된다");
eq(guide.includes("8월 12일 (수) 오후 5시"), true, "레테 시간이 들어간다");
eq(guide.includes("인천 연수구"), true, "오시는 길이 들어간다");
const link = fill(FALLBACK.apply_link, linkVars({ name: "김서은" }, S, "https://x/apply?t=ab12"));
eq(/\{\{/.test(link), false, "링크 문자에도 빈칸이 없어야");
eq(link.includes("https://x/apply?t=ab12"), true, "링크가 들어간다");

console.log("\n== 화면과 서버 ==");
const act = read("app/consult/actions.js");
eq(act.includes("export async function sendApplyLink"), true, "① 설문지 링크");
eq(act.includes("export async function sendVisitInfo"), true, "② 일정 · 오시는 길");
// **안 나갔는데 「보냈어요」 라고 하면 안 된다.** 그 집은 아무 연락도 못 받는다
eq(act.includes('if (sent && stamp)'), true, "실제로 나갔을 때만 「보냄」 으로 적는다");
eq(act.includes('audience: "inquiry"'), true, "재원생 문자 차단에 안 걸린다 (아직 계정이 없다)");
// 주소가 비어 있으면 「오시는 길: 」 만 있는 문자가 나간다
eq(act.includes("학원 주소를 먼저 적어주세요"), true, "주소가 없으면 안 보낸다");

const board = read("app/consult/ConsultBoard.jsx");
eq(board.includes("sendApplyLink"), true, "상담 화면에 ① 단추");
eq(board.includes("sendVisitInfo"), true, "상담 화면에 ② 단추");
// 「직접 발송」 이면 안 나간다 — 그때는 글을 그 자리에 펴놓는다
eq(board.includes("sms:"), true, "문자앱으로 여는 길이 있다");
eq(board.includes("copyText"), true, "글도 복사해둔다");
/**
 * **복사를 기다리면 안 된다.** 복사가 막힌 브라우저에서는 그 기다림이
 * 끝나지 않아서(거절도 안 한다) 결과 줄이 영영 안 뜬다 — 크롬 검사에서
 * 실제로 그렇게 걸렸다. 글을 먼저 보여주고 복사는 덤으로 한다.
 */
eq(/setTimeout\(\(\) => no\(new Error\("timeout"\)\), 1000\)/.test(board), true,
   "복사가 안 끝나도 1초 뒤에는 넘어간다");
/**
 * **화면을 옮겨버리면 안 된다.** 예전 판은 곧바로 `window.location.href`
 * 로 문자앱을 열었는데, 컴퓨터에서는 아무 일도 안 일어나서 「눌렀는데
 * 그대로」 가 되고, 무슨 글이 나갈 뻔했는지도 볼 수 없었다.
 */
eq(board.includes("window.location.href = `sms:"), false, "누르자마자 화면을 옮기지 않는다");
eq(board.includes("note.body"), true, "안 나간 글을 그 자리에 펴놓는다");
// 결과가 화면 밖에 있으면 눌러도 아무 일이 없는 것처럼 보인다
eq(board.includes("note?.id === r.id"), true, "결과는 그 줄에서 보인다");

eq(read("supabase/migrations/0109_inquiry_sms.sql").includes("link_sent_at"), true,
   "보낸 때를 적어둔다 (두 번 보내지 않게)");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 신규 문의 문자 통과");
