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
import { SLOTS, slotText, slotLabel, SLOT_NOTES, PRIVACY } from "../lib/applySlots.js";

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
  "중등 월·수 5:00~7:30",
  "중등 화·목 5:00~7:30",
  "중2~고등 월·수 7:30~10:00",
  "중2~고등 화·목 7:30~10:00",
], "원장님이 주신 여섯 가지 그대로");

console.log("\n== 고른 것을 다시 글로 ==");
eq(slotText(["mid-mw", "high-tt"]), "중등 월·수 5:00~7:30 · 중2~고등 화·목 7:30~10:00", "두 개");
eq(slotText([]), "", "안 고른 것");
// 옛 접수에 모르는 열쇠가 있어도 화면이 비면 안 된다 — 그대로라도 보여준다
eq(slotText(["없는열쇠"]), "없는열쇠", "모르는 열쇠는 그대로");

console.log("\n== 고르기 전에 알려야 하는 것 ==");
const notes = SLOT_NOTES.join(" ");
// 「개별 진도」 를 「개별 시간표」 로 오해하시는 일이 잦다 — 한 문장에 같이 적어 가른다
eq(SLOT_NOTES[0].includes("개별 진도"), true, "개별 진도로 수업한다는 것이 맨 위");
eq(SLOT_NOTES[0].includes("개별 시간표"), true, "개별 시간표는 안 된다는 것도 같은 줄에");
eq(notes.includes("금요일"), true, "보강은 금요일");
eq(notes.includes("당일"), true, "당일 결석은 보강 안 됨");
eq(notes.includes("시험"), true, "시험 기간에는 시간이 더 필요할 수 있음");

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
eq(PRIVACY.rows[2].body.includes("퇴원일로부터"), true, "재원 뒤 언제까지인지");
eq(PRIVACY.rows[2].body.includes("상담일로부터"), true, "등록 안 하신 경우도");
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

console.log("\n== 희망 시간은 글로 받는다 ==");
// 날짜 칸으로 받으면 하루를 찍게 되고, 그 하루에 못 맞추면 다시 전화하게 된다
eq(form.includes('name="test_want_text"'), true, "레벨테스트 — 글");
eq(form.includes('name="visit_want_text"'), true, "방문상담 — 글");
eq(form.includes('type="date"'), false, "양식에 날짜 칸이 남아 있다");
eq(form.includes('type="time"'), false, "양식에 시각 칸이 남아 있다");

if (fail) { console.log("\n❌ 상담 신청 양식에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 상담 신청 양식 통과");
