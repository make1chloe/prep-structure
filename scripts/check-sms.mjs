/** 문자(솔라피) 판단 검사(검사-75 · (커) 확정-71) — lib/sms-plan.js 순수 셈을 본보기로: 전화 다듬기·가리기 · 통신사 바이트 · SMS/LMS · 치환(빈 자리는 못 나간다 · 「덧붙임」은 줄째 사라진다) · 솔라피 서명(lib/solapi.js · 고정 값으로) · 짐 · 답 읽기 */
import { phoneDigits, maskPhone, smsBytes, smsType, lenText, fill, smsBody, readSolapi, SMS_MAX_BYTES, TEMPLATES, templateName, OPTIONAL, SMS_ALSO, smsAlso, lateLine, feeLine, monthlyLine } from "../lib/sms-plan.js";
import { readFileSync } from "node:fs";
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 주석 먼저(폰-5)
import { solapiAuth } from "../lib/solapi.js";   // 서명은 서버 쪽(열쇠를 만진다) — 화면은 sms-plan 만 가져온다
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
console.log("■ 전화 · 길이");
ok("휴대전화만 받는다 — 010-1234-5678 → 01012345678 · 011 도 · 집전화·짧은 번호는 null", phoneDigits("010-1234-5678") === "01012345678" && phoneDigits("01112345678") === "01112345678" && phoneDigits("02-123-4567") === null && phoneDigits("") === null && phoneDigits("0101234") === null);
ok("자취에는 가려서 「010-****-5678」 · 짧으면 빈 글", maskPhone("01012345678") === "010-****-5678" && maskPhone("123") === "");
ok("통신사 셈 — 한글 2바이트 · 90까지 SMS · 넘으면 LMS · 상한 2000", smsBytes("가나다") === 6 && smsBytes("abc") === 3 && smsType("가".repeat(45)) === "SMS" && smsType("가".repeat(46)) === "LMS" && SMS_MAX_BYTES === 2000);
ok("화면 줄 — 「LMS · 92 / 2000바이트」 · 상한을 넘으면 over", lenText("가".repeat(46)).text === "LMS · 92 / 2000바이트" && lenText("가".repeat(1001)).over === true && lenText("가").over === false);
console.log("■ 치환 — 빈 자리는 못 나간다(뼈대-11) · 「덧붙임」은 비면 줄째 사라진다");
const T = "[{{학원명}}] {{학생명}} 학생 등록\n아이디 {{학생아이디}}\n{{덧붙임}}\n끝";
ok("다 채우면 그대로 · 남는 {{ }} 가 없다", (() => { const r = fill(T, { 학원명: "클로이영어", 학생명: "강민서", 학생아이디: "chloe5678", 덧붙임: "셔틀 3시 20분" }); return r.missing.length === 0 && !/\{\{/.test(r.text) && r.text.includes("셔틀 3시 20분"); })());
ok("덧붙임이 비면 그 줄이 사라진다(빈 줄이 안 남는다)", (() => { const r = fill(T, { 학원명: "클로이영어", 학생명: "강민서", 학생아이디: "chloe5678" }); return r.missing.length === 0 && r.text === "[클로이영어] 강민서 학생 등록\n아이디 chloe5678\n끝"; })(), JSON.stringify(fill(T, { 학원명: "a", 학생명: "b", 학생아이디: "c" }).text));
ok("덧붙임 아닌 자리가 비면 missing 으로 돌려주고 자리를 그대로 둔다 — 부르는 쪽이 막는다", (() => { const r = fill(T, { 학생명: "강민서" }); return r.missing.join() === "학원명,학생아이디" && r.text.includes("{{학원명}}"); })());
ok("비어도 되는 자리는 둘 — 「덧붙임」(등록 안내)과 「한 줄」((뎌-2) 갈래마다의 한 줄) · 빈 칸(공백)도 빈 것으로 본다", OPTIONAL.join() === "덧붙임,한 줄" && fill("a\n{{덧붙임}}\nb", { 덧붙임: "   " }).text === "a\nb");
console.log("■ 솔라피 — 서명 · 짐 · 답");
const a = solapiAuth({ key: "K", secret: "S", date: "2026-09-10T00:00:00.000Z", salt: "abc" });
ok("서명 = HMAC-SHA256(secret, date + salt) · 머리글에 열쇠·때·소금·서명", a.signature === "b26f7025c99a7dcc6efcb9e3bc0d8b240e40493c4f884b0843a1c9afb06281b5" && a.header === `HMAC-SHA256 apiKey=K, date=2026-09-10T00:00:00.000Z, salt=abc, signature=${a.signature}`, a.header);
let threw = false; try { solapiAuth({ key: "", secret: "S" }); } catch { threw = true; }
ok("열쇠가 없으면 던진다(조용히 안 보낸 척하지 않는다)", threw);
ok("짐 — 번호는 숫자만 · 짧으면 SMS(제목 없음) · 길면 LMS + 제목", (() => { const s = smsBody({ to: "010-1234-5678", from: "010-0000-0000", text: "가나다" }); const l = smsBody({ to: "01012345678", from: "01000000000", text: "가".repeat(46), subject: "[클로이영어] 첫 등원 안내" }); return s.message.to === "01012345678" && s.message.type === "SMS" && !("subject" in s.message) && l.message.type === "LMS" && l.message.subject === "[클로이영어] 첫 등원 안내"; })());
threw = false; try { smsBody({ to: "01012345678", from: "01000000000", text: "가".repeat(1001) }); } catch { threw = true; }
ok("2000바이트를 넘으면 던진다 · 받는 번호가 휴대전화가 아니어도 · 발신번호가 없어도", threw && (() => { let a2 = false, b2 = false; try { smsBody({ to: "02-123-4567", from: "01000000000", text: "가" }); } catch { a2 = true; } try { smsBody({ to: "01012345678", from: "", text: "가" }); } catch { b2 = true; } return a2 && b2; })());
ok("답 — 2xx + 2000 대면 접수(messageId) · 아니면 까닭 한 줄(열쇠는 안 적는다)", readSolapi({ statusCode: "2000", messageId: "M1" }, 200).ok === true && readSolapi({ statusCode: "2000", messageId: "M1" }, 200).id === "M1" && readSolapi({ errorCode: "ValidationError", errorMessage: "발신번호가 등록되지 않았습니다" }, 400).why === "솔라피 400 ValidationError — 발신번호가 등록되지 않았습니다" && readSolapi(null, 500).ok === false, readSolapi({ errorCode: "ValidationError", errorMessage: "발신번호가 등록되지 않았습니다" }, 400).why);
console.log("■ 문구 — 화면이 고치는 것 다섯");
ok("문구 다섯 — 등록·상담 안내 둘((커))과 (뎌-2) 늦은 귀가·수강료·월간 리포트 셋 · 이름 · 모르는 갈래는 열쇠 그대로", TEMPLATES.length === 5 && templateName("sms_welcome") === "첫 등원 안내" && templateName("sms_guide") === "상담 안내" && templateName("nope") === "nope");
console.log("■ (뎌-2) 앱 알림과 함께 문자로도 — 켠 갈래만");
ok("문자로도 갈 수 있는 갈래는 셋(늦은 귀가 · 수강료 · 월간 리포트) · 규칙에 든 것만 나간다 · 아무 갈래나 켜지지 않는다",
  SMS_ALSO.map(([k]) => k).join() === "late,fee,monthly" && smsAlso(["late", "fee"], "late") === true && smsAlso(["late"], "fee") === false && smsAlso(["daily"], "daily") === false);
ok("갈래마다의 「한 줄」 — 늦귀가는 시각·사유 · 수강료는 달·금액(세 자리 쉼표) · 월간은 그 달 · 재료가 없으면 빈 글(그 줄이 사라진다)",
  lateLine({ until_at: "21:40:00", reason: "단어 재시험" }) === "오늘 21:40 귀가 예정 · 단어 재시험" && lateLine({ until_at: "21:40" }) === "오늘 21:40 귀가 예정"
  && feeLine("2026-09", 320000) === "9월 수강료 320,000원" && feeLine("2026-09", null) === "9월 수강료" && monthlyLine("2026-09") === "9월 리포트입니다" && lateLine({}) === "",
  `${lateLine({ until_at: "21:40:00", reason: "단어 재시험" })} / ${feeLine("2026-09", 320000)}`);
ok("「한 줄」과 「덧붙임」은 비면 그 줄이 통째로 사라진다(치환 자리가 남으면 못 나간다 — 뼈대-11 의 반대쪽)", OPTIONAL.includes("한 줄") && OPTIONAL.includes("덧붙임")
  && fill("가\n{{한 줄}}\n나", {}).text === "가\n나" && fill("가\n{{한 줄}}\n나", { "한 줄": "오늘 21:40" }).text === "가\n오늘 21:40\n나");
{ const notify = strip(readFileSync("lib/notify.js", "utf8")), send = strip(readFileSync("lib/send.js", "utf8")), fee = strip(readFileSync("lib/fee.js", "utf8")), rep = strip(readFileSync("lib/report.js", "utf8"));
  ok("문자도 **나가는 길 한 곳**(lib/notify.js)에서 함께 나간다 — 손 셋은 「한 줄」만 준다(대전제-7)",
    /smsAlong\(/.test(notify) && /smsLine/.test(send) && /smsLine/.test(fee) && /smsLine/.test(rep) && !/sendOne\(/.test(send + fee + rep));
  ok("문자가 안 돼도 앱 알림은 이미 나갔다 — smsAlong 은 던지지 않고 까닭만 돌려준다(자취는 sms 가 남긴다)", /catch \(e\) \{ return \{ skipped:/.test(notify));
  ok("어느 갈래를 문자로 보낼지는 **규칙 한 줄**(send.sms_kinds)에서 읽는다 — 코드에 안 박는다(뼈대-5)", /ruleList\(svc, "send\.sms_kinds"\)/.test(notify) && /"send\.sms_kinds"/.test(send));
  ok("켤 수 있는 갈래 목록은 한 벌(SMS_ALSO) — 화면·손·검사가 같은 것을 본다(원칙-1)", (() => { const tpl = strip(readFileSync("app/send/templates.js", "utf8"));
    return /SMS_ALSO/.test(tpl) && /SMS_ALSO/.test(send) && !/\[\s*\[\s*"late"/.test(tpl); })());
  ok("걷기가 갈래 토글을 눌러본다 — 켜고 · 새로 읽어도 켜져 있고 · 다시 눌러 끈다", (() => { const w = strip(readFileSync("scripts/e2e/today.mjs", "utf8"));
    return /data-act=sms-kind/.test(w) && /문자로도: 늦은 귀가/.test(w) && /문자로도 보내는 갈래가 없습니다/.test(w); })()); }
console.log(`\n■ 문자 판단 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
