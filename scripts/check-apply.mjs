/**
 * **신규 상담 양식** (lib/applySlots.js · app/apply)
 *
 * 원장님 (2026-08-06) — 노션 폼을 접고 앱 양식으로 받기로 했다.
 *
 * 이 양식은 **로그인 없이, 처음 오시는 학부모가, 폰에서 한 번** 채우는 것이다.
 * 여기서 잘못되면 그 문의는 그냥 사라진다 — 다시 채워달라고 할 수가 없다.
 * 그래서 세 가지를 못 박아 둔다.
 *
 *   1. 개인정보 동의에 **법이 요구하는 넷**이 다 적혀 있나 (제15조 제2항)
 *   2. 시간표 열쇠(key)가 **안 바뀌었나** — 바뀌면 이미 접수된 것이 안 읽힌다
 *   3. 「선택」 이라는 말이 양식에 없나 (원장님)
 *
 * 쓰는 법:  node scripts/check-apply.mjs
 */

import { readFileSync } from "node:fs";
import { SLOTS, slotText, slotLabel, SLOT_NOTES, PRIVACY, SOURCES, sourceText } from "../lib/applySlots.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

console.log("== 시간표 여섯 가지 ==");
eq(SLOTS.length, 6, "여섯 개");
/**
 * **열쇠는 바꾸면 안 된다.** DB 에 이 글자가 그대로 남는다 — 바꾸면 이미
 * 접수된 문의의 시간표가 안 읽힌다. 시간이 바뀌면 label 만 고친다.
 */
eq(SLOTS.map((s) => s.key),
   ["elem-mw", "elem-tt", "mid-mw", "mid-tt", "high-mw", "high-tt"],
   "열쇠 (바꾸면 옛 접수가 안 읽힌다)");
eq(SLOTS.map(slotLabel), [
  "초등 월·수 2:50~4:50",
  "초등 화·목 2:50~4:50",
  "중1~중3 월·수 5:00~7:30",
  "중1~중3 화·목 5:00~7:30",
  "중2~고3 월·수 7:30~10:00",
  "중2~고3 화·목 7:30~10:00",
], "원장님이 주신 여섯 가지 그대로");
/**
 * **「중등」·「고등」 은 학년을 못 짚는다** (원장님, 2026-08-07).
 * 중2 학부모가 「중등」 과 「중2~고등」 사이에서 헤매신다 — 실제로 둘 다
 * 해당된다. 학년을 그대로 적어 그 자리에서 아시게 한다.
 */
eq(SLOTS.some((s) => s.group === "중등" || s.group === "중2~고등"), false,
   "「중등」·「중2~고등」 이라는 말이 남아 있다");

console.log("\n== 고른 것을 다시 글로 ==");
eq(slotText(["mid-mw", "high-tt"]), "중1~중3 월·수 5:00~7:30 · 중2~고3 화·목 7:30~10:00", "두 개");
eq(slotText([]), "", "안 고른 것");
// 옛 접수에 모르는 열쇠가 있어도 화면이 비면 안 된다 — 그대로라도 보여준다
eq(slotText(["없는열쇠"]), "없는열쇠", "모르는 열쇠는 그대로");

console.log("\n== 고르기 전에 알려야 하는 것 ==");
const notes = SLOT_NOTES.join(" ");
// 「개별 진도」 를 「개별 시간표」 로 오해하시는 일이 잦다 — 한 문장에 같이 적어 가른다
eq(SLOT_NOTES[0].includes("개별 진도"), true, "개별 진도로 수업한다는 것이 맨 위");
eq(SLOT_NOTES[0].includes("개별 시간표"), true, "개별 시간표는 안 된다는 것도 같은 줄에");
/**
 * **아직 오시지도 않은 분께 규칙부터 읽히지 않는다** (원장님, 2026-08-07 —
 * 「보강 언급 지워줘 · 시험기간 언급 지워줘」). 신청서에서 「당일 결석은
 * 보강이 안 됩니다」 를 읽으면 시작도 전에 까다로운 학원이 된다.
 * 그 이야기는 등록하실 때 한다.
 */
eq(notes.includes("보강"), false, "보강 이야기가 남아 있다");
eq(notes.includes("시험"), false, "시험 기간 이야기가 남아 있다");

/**
 * **개인정보 보호법 제15조 제2항** — 동의를 받을 때 반드시 알려야 하는 넷.
 * 하나라도 빠지면 동의를 받은 것이 아니다.
 */
console.log("\n== 개인정보 동의에 네 가지가 다 있나 ==");
eq(PRIVACY.rows.length, 4, "네 줄");
const heads = PRIVACY.rows.map((r) => r.head).join(" ");
eq(heads.includes("목적"), true, "1. 수집·이용 목적");
eq(heads.includes("항목"), true, "2. 수집하려는 항목");
eq(heads.includes("기간"), true, "3. 보유·이용 기간");
eq(heads.includes("거부"), true, "4. 거부할 권리와 불이익");
// 거부에 따른 불이익까지 적어야 4번이 채워진다
eq(PRIVACY.rows[3].body.length > 10, true, "거부하면 어떻게 되는지도 적혀 있다");
/**
 * **만 14세 미만은 법정대리인 동의** (제22조의2).
 *
 * 안내 문장은 뺐다 — 작성은 보호자가 다 하신다 (원장님, 2026-08-06).
 * 대신 체크 문구가 「보호자로서」 라고 말하므로, 보호자가 동의한 것이
 * 기록에 남는다. 이 말이 빠지면 요건이 무너지므로 못 박아 둔다.
 */
eq(PRIVACY.label.includes("보호자"), true, "체크 문구가 보호자의 동의임을 밝힌다");
// 기간은 끝나는 시점을 셀 수 있게 적어야 한다 — 「필요한 기간」 은 안 적은 것과 같다
eq(PRIVACY.rows[2].body.includes("그 뒤 1년"), true, "다니신 뒤 언제까지인지");
eq(PRIVACY.rows[2].body.includes("상담일로부터"), true, "등록 안 하신 경우도");
// 상담받으러 오신 분께 첫 화면에서 「퇴원」 을 말할 이유가 없다 (원장님)
eq(PRIVACY.rows[2].body.includes("퇴원"), false, "「퇴원」 이라는 말을 안 쓴다");
// 실제로 받는 항목이 「수집 항목」 에 적혀 있어야 한다
["이름", "학년", "학교", "연락처"].forEach((w) => {
  eq(PRIVACY.rows[1].body.includes(w), true, `수집 항목에 「${w}」`);
});

console.log("\n== 「선택」 이라는 말을 안 쓴다 ==");
// 원장님: 「선택이라는 말은 아예 적지마」 — 안 적어도 되는 칸이라고 하면 비워서 온다
const form = readFileSync("app/apply/ApplyForm.jsx", "utf8");
const 선택 = form.split("\n")
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => l.includes("선택") && !l.trim().startsWith("*") && !l.trim().startsWith("//"));
eq(선택.map(([n, l]) => `${n}: ${l.trim().slice(0, 40)}`), [], "양식에 「선택」 이 남아 있다");

console.log("\n== 학생 정보는 전부 받는다 ==");
// required 가 화면에만 있으면 안 된다 — 받는 쪽(actions)에서도 막아야 한다
const act = readFileSync("app/apply/actions.js", "utf8");
["name", "phone", "student_phone", "school", "grade"].forEach((f) => {
  eq(form.includes(`name="${f}"`), true, `양식에 ${f} 칸`);
});
["학생 이름", "학부모 연락처", "학생 연락처", "학교", "학년"].forEach((w) => {
  eq(act.includes(w), true, `안 적으면 막는다 — ${w}`);
});
eq(act.includes("privacy_agree"), true, "동의 안 하면 막는다");
// 학생 연락처를 왜 받는지 화면에 적혀 있어야 비워두지 않으신다
eq(form.includes("레벨테스트 아이디 생성"), true, "학생 연락처를 왜 받는지");

console.log("\n== 어떻게 알게 되셨나 ==");
/**
 * **재원생 소개는 이름이 붙어야 쓸모가 있다** (원장님, 2026-08-07).
 * 누가 소개했는지 알아야 그 댁에 인사를 드린다. 「지인 소개」 로
 * 뭉뚱그리면 그게 사라진다. 다만 **안 적으셔도 접수는 된다.**
 */
eq(SOURCES.some((x) => x.key === "재원생 소개" && x.why), true, "재원생 소개 — 이름을 적을 수 있다");
eq(SOURCES.some((x) => x.key === "기타" && x.why), true, "기타 — 사유를 적을 수 있다");
eq(SOURCES.some((x) => x.key === "전단"), false, "안 하는 것(전단)이 남아 있다");
eq(sourceText("재원생 소개", "김하늘"), "재원생 소개 (김하늘)", "이름을 적으면 같이 남는다");
eq(sourceText("재원생 소개", ""), "재원생 소개", "안 적어도 그대로 남는다");
eq(sourceText("", "김하늘"), null, "안 고르면 아무것도 안 남는다");
eq(form.includes("클로이영어를 어떻게 알게 되셨나요"), true, "학원 이름으로 묻는다");

console.log("\n== 학습 경험 ==");
/**
 * 「더 알려주실 것」 은 **안 적어도 되는 칸처럼 들린다** (원장님, 2026-08-07).
 * 실제로 거의 비어서 왔다. 무엇을 적어야 하는지 칸 이름에 그대로 적으면
 * 적으신다 — 교재와 반 이름을 알면 상담 자리에서 되묻지 않아도 된다.
 */
eq(form.includes("학습 경험"), true, "「더 알려주실 것」 이 아니라 「학습 경험」");
// 화면에 남았는지만 본다 — 왜 바꿨는지 적어둔 주석까지 걸면 설명을 못 남긴다
const formCode = form.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
eq(formCode.includes("더 알려주실 것"), false, "「더 알려주실 것」 이 화면에 남아 있다");
eq(form.includes("사용했던 교재"), true, "무엇을 적어야 하는지 — 교재(영역별)");
eq(form.includes("학원명, 반까지"), true, "반 이름까지 적어주시면 상담이 깊어진다");
eq(form.includes("개선하고 싶은 점과 궁금한 점"), true, "무엇을 적어야 하는지 — 개선·궁금한 점");

console.log("\n== 레벨테스트 · 부모님 방문상담 ==");
/**
 * **언제가 안 되는지를 먼저 말씀드린다** (원장님, 2026-08-07).
 * 월~목 오후는 수업이 이어져 있어 부모님을 뵐 수가 없다. 이걸 안 적으면
 * 그 시간을 적어 보내시고, 우리는 다시 여쭤야 한다 — 양식을 받은 보람이 없다.
 */
eq(form.includes("40~60분 가량 소요"), true, "레벨테스트가 얼마나 걸리는지 — 칸 이름에");
eq(form.includes("20분가량 소요"), true, "방문상담이 얼마나 걸리는지 — 칸 이름에");
eq(form.includes("부모님 방문상담"), true, "「학부모 상담」 이 아니라 「부모님 방문상담」");
eq(form.includes("학부모 상담"), false, "「학부모 상담」 이 남아 있다");
/**
 * **둘이 되는 때가 다르다** (원장님, 2026-08-07). 수업 중에도 아이는
 * 테스트를 볼 수 있지만, 부모님을 마주 앉아 뵐 수는 없다. 「월~목 오후는
 * 안 됩니다」 로만 적으면 테스트까지 안 되는 줄 아시고 주말만 적어 보내신다.
 */
eq(/월~목 오후 2시~10시에는 레벨테스트는 가능하고, 부모님 방문상담은 어렵습니다/.test(form),
   true, "월~목 오후 — 테스트는 되고 방문상담은 안 된다");
// 「여러 개 고르실수록 …」 — 원장님이 빼라고 하셨다
eq(form.includes("고르실수록"), false, "빼라고 하신 문장이 남아 있다");

console.log("\n== 접수되면 선생님께 알림 ==");
/**
 * 이 화면만 **로그인이 없다.** 그래서 0104 처럼 「학원 사람인지 확인하고
 * 보낼 곳을 알려주는 함수」 를 쓸 수 없다 — 인터넷의 누구나 그 함수를 불러
 * 알림 열쇠를 가져가게 된다. 서버만 아는 열쇠로 보내고, 그 값이 없으면
 * **설정 화면에 「꺼짐」 이 보여야 한다** (조용히 안 가는 것이 제일 무섭다).
 */
const notify = readFileSync("app/apply/notify.js", "utf8");
eq(act.includes("pushNewInquiry"), true, "접수하면 알림을 부른다");
eq(notify.includes("SUPABASE_SERVICE_ROLE_KEY"), true, "서버만 아는 열쇠로 보낸다");
eq(readFileSync("app/settings/SettingsForm.jsx", "utf8").includes("신규 상담 접수 알림"),
   true, "켜졌는지 설정 화면에서 보인다");
// 알림이 안 가도 접수는 되어야 한다 — 접수를 놓치는 것이 제일 나쁘다
eq(/catch\s*\{[^}]*\}\s*\n\}/.test(act.slice(act.indexOf("async function notifyStaff"))),
   true, "알림이 실패해도 접수는 그대로");

console.log("\n== 희망 시간은 글로 받는다 ==");
// 날짜 칸으로 받으면 하루를 찍게 되고, 그 하루에 못 맞추면 다시 전화하게 된다
eq(form.includes('name="test_want_text"'), true, "레벨테스트 — 글");
eq(form.includes('name="visit_want_text"'), true, "방문상담 — 글");
eq(form.includes('type="date"'), false, "양식에 날짜 칸이 남아 있다");
eq(form.includes('type="time"'), false, "양식에 시각 칸이 남아 있다");

if (fail) { console.log("\n❌ 상담 신청 양식에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 상담 신청 양식 통과");
