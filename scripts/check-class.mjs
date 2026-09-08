/** 반 판단 검사(4단계-3a) — lib/class-plan.js 순수 셈: 양식 읽기(이름·갈래·요일·시각·이 날부터) · 단가 읽기 · 요일·시각 글 · 반 한 줄 · 단가 글 · 넣을 아이 후보 · 그 시각 아이 수 글 */
import { parseClass, parseSchedule, parseClassFee, weekdayText, timeText, classLine, feeText, candidates, slotText, kindName } from "../lib/class-plan.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };
console.log("■ 양식 읽기");
const c = parseClass({ nickname: " 중2 월수 ", kind: "regular", weekdays: ["3", 1, 1, 9], start: "16:00", end: "17:30", fromDate: "2026-09-08" });
ok("이름은 다듬고 · 요일은 0~6 만 · 겹침 하나로 · 차례로(1,3) · 시각 · 이 날부터", c.nickname === "중2 월수" && c.kind === "regular" && c.weekdays.join() === "1,3" && c.start === "16:00" && c.end === "17:30" && c.fromDate === "2026-09-08", JSON.stringify(c));
ok("막는 것 — 이름 없음 · 갈래 아님 · 요일 없음 · 시각 꼴 · 끝이 앞 · 날짜 없음", threw(() => parseClass({ nickname: "", weekdays: [1], start: "16:00", end: "17:00", fromDate: "2026-09-08" })) && threw(() => parseClass({ nickname: "a", kind: "x", weekdays: [1], start: "16:00", end: "17:00", fromDate: "2026-09-08" })) && threw(() => parseSchedule({ weekdays: [], start: "16:00", end: "17:00", fromDate: "2026-09-08" })) && threw(() => parseSchedule({ weekdays: [1], start: "4시", end: "17:00", fromDate: "2026-09-08" })) && threw(() => parseSchedule({ weekdays: [1], start: "17:00", end: "16:00", fromDate: "2026-09-08" })) && threw(() => parseSchedule({ weekdays: [1], start: "16:00", end: "17:00", fromDate: "" })));
const f = parseClassFee({ amount: "150,000원", perSession: true, fromDate: "2026-10-01" });
ok("단가 — 「150,000원」 → 150000 · 회차제 · 이 날부터 · 0 이면 막는다", f.amount === 150000 && f.perSession === true && f.fromDate === "2026-10-01" && threw(() => parseClassFee({ amount: "0", fromDate: "2026-10-01" })));
console.log("■ 글");
const cls = { nickname: "매일 5:00 리허설", kind: "regular", schedule: { weekdays: [1, 3], start_time: "16:00:00", end_time: "17:30:00" }, members: [{ student_id: "a", name: "강민서" }] };
ok("요일·시각 글 「월·수 16:00~17:30」 · 반 한 줄 「매일 5:00 리허설 · 정규 · 월·수 16:00~17:30 · 1명」 · 시간표 없으면 「시간표 없음」", weekdayText([1, 3]) === "월·수" && timeText(cls.schedule) === "16:00~17:30" && classLine(cls) === "매일 5:00 리허설 · 정규 · 월·수 16:00~17:30 · 1명" && classLine({ nickname: "x", kind: "special", members: [] }) === "x · 특강 · 시간표 없음 · 0명" && kindName("special") === "특강");
ok("단가 글 — 「150,000원 × 회차 · 2026-10-01부터」 · 달마다 「/ 달」 · 없으면 안내", feeText({ amount: 150000, per_session: true, from_date: "2026-10-01" }) === "150,000원 × 회차 · 2026-10-01부터" && feeText({ amount: 300000, per_session: false, from_date: "2026-09-01" }) === "300,000원 / 달 · 2026-09-01부터" && feeText(null).startsWith("단가 없음"));
ok("넣을 아이 후보 — 재원생 중 이 반에 없는 아이", candidates([{ id: "a" }, { id: "b" }], [{ student_id: "a" }]).map((s) => s.id).join() === "b");
ok("그 시각 아이 수 — 「그 시각 4명 — 매일 반 3 · 보강 1 · 막지 않습니다」 · 비면 「그 시각 비어 있습니다」 · null 이면 빈 글", slotText({ classes: [{ nickname: "매일 반", n: 3 }], makeups: 1 }) === "그 시각 4명 — 매일 반 3 · 보강 1 · 막지 않습니다" && slotText({ classes: [], makeups: 0 }) === "그 시각 비어 있습니다" && slotText(null) === "");
console.log("■ 검사-⑮ 반 명단(class_member)을 직접 조회하는 자리 — 화면(app) 0 · lib 는 넷뿐((차) 2026-09-08 밤 — 옛 검사 check-session 은 0단계에서 지웠고 반 화면이 다시 선 뒤 여기서 다시 잰다)");
{ const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (f.endsWith(".js")) out.push(p); } return out; };
  const hits = (files) => files.filter((f) => /from\("class_member"\)/.test(readFileSync(f, "utf8")));
  const inApp = hits(walk("app")), inLib = hits(walk("lib")).map((f) => f.replace(/^lib\//, "")).sort();
  ok("화면(app)에서 class_member 를 직접 조회하는 곳 0 — 명단은 lib 손과 판 SQL 만 읽는다", inApp.length === 0, inApp.join(", "));
  ok("lib 에서 class_member 를 읽는 파일은 넷뿐(cal.js 재원 시작 · classes.js 반 명단 · plan.js 이 아이의 반 · student.js 반 옮기기) — 다섯째가 생기면 그 넷 중 하나를 쓴다(원칙-1)", inLib.join(",") === "cal.js,classes.js,plan.js,student.js", inLib.join(", ")); }
console.log(`\n■ 반 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
