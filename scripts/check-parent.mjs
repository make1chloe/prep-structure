/** 학부모 화면 검사(검사-㊽ · 목업 09) — 순수 판단 lib/parent-plan.js: 숙제 % · 오늘 수업 꼬리표(시험 N/N · 숙제 %) · 오늘 늦게 갑니다(보낸 것만 · 실제 하원이 찍히면 바뀐다) · 보낸 것 줄 · 오늘 등원·하원 한 줄 · 다음 시간 시험(개수 정한 것만) */
import { readFileSync } from "node:fs";
import { homeworkPct, sheetTags, todayLate, sentLines, todayArrival, nextQuizLines, feeLine, noticeLines } from "../lib/parent-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const today = "2026-09-06";
console.log("■ 오늘 수업 꼬리표");
ok("숙제 % — ○ 2 · △ 1 → 67 · 검사한 줄이 없으면 null(아직·none 은 안 센다)", homeworkPct([{ status: "done" }, { status: "done" }, { status: "weak" }, { status: "none" }, {}]) === 67 && homeworkPct([{ status: "none" }]) === null);
const sheet = { date: "2026-09-06", check: [{ status: "done" }, { status: "done" }, { status: "done" }, { status: "done" }, { status: "missing" }] };
const tags = sheetTags(sheet, [{ kind: "word", total: 20, wrong: 3, taken_on: "2026-09-06", passed: false }, { kind: "sentence", total: 14, wrong: 0, taken_on: "2026-09-05", passed: true }, { kind: "word", total: null, taken_on: "2026-09-06" }]);
ok("「단어 17/20」(그날 본 것만 · 개수 없는 것 제외) · 「숙제 80%」(80 부터 on) · 못 넘은 시험은 on 아님", tags.map((t) => `${t.text}${t.on ? "*" : ""}`).join(",") === "단어 17/20,숙제 80%*", JSON.stringify(tags));
console.log("■ 늦귀가 안내 · 보낸 것");
const fam = [{ id: "a", on_date: "2026-09-06", until_at: "22:20:00", reason: "워크북 나머지", sent_at: "2026-09-06T10:41:00Z", left_at: null }, { id: "b", on_date: "2026-09-03", until_at: "21:40:00", reason: "문장훈련", sent_at: "2026-09-03T10:00:00Z", left_at: "21:52:00" }];
ok("오늘 것 — 「22:20 예정」 · 사유 · 「19:41에 받았습니다」 · 아직 하원 안 함", JSON.stringify(todayLate(fam, today)) === JSON.stringify({ until: "22:20", reason: "워크북 나머지", sentAt: "19:41", left: null }));
ok("실제 하원이 찍히면 left 에 시각 · 오늘 것이 없으면 null", todayLate([{ ...fam[0], left_at: "22:31:00" }], today).left === "22:31" && todayLate(fam, "2026-09-07") === null);
ok("보낸 것 — 오늘 것은 빼고 최근 것부터 「9/3 늦귀가 안내 — 21:40 예정 · 21:52 하원」", sentLines(fam, today).map((s) => s.text).join(" | ") === "9/3 늦귀가 안내 — 21:40 예정 · 21:52 하원");
console.log("■ 오늘 등원·하원 · 다음 시간 시험");
ok("등원 찍힘 · 하원 전 → 「정시 등원」 「17:02 도착 · 하원 아직」 · 지각 판이면 알약 「지각」", todayArrival([{ step: 2, at: "2026-09-06T08:02:00Z" }], { attend: "present" }).text === "17:02 도착 · 하원 아직" && todayArrival([{ step: 2, at: "2026-09-06T08:02:00Z" }], { attend: "present" }).pillOn && todayArrival([{ step: 2, at: "2026-09-06T08:12:00Z" }], { attend: "late" }).pill === "지각");
ok("등원도 판도 없으면 null(카드 숨김 · 확정-⑮)", todayArrival([], null) === null);
const nq = nextQuizLines([{ id: "q1", kind: "word", total: 20, cut_pct: 90, source: "book", books: { name: "중등3800제3" }, units: { chapter: "CH5", short: "부정사" } }, { id: "q2", kind: "sentence", total: null }]);
ok("다음 시간 시험 — 「단어 20개」 「중등3800제3 · CH5 › 부정사 · 통과 90%」 · 개수 없는 것은 안 보낸다", nq.length === 1 && nq[0].b === "단어 20개" && nq[0].small === "중등3800제3 · CH5 › 부정사 · 통과 90%", JSON.stringify(nq));
console.log("■ 💰 이 달 수강료 · 📨 내게 온 자취(4단계-2a)");
const fl = feeLine({ ym: "2026-09", amount: 300000, paid_on: "2026-09-07", method: "계좌" }, "2026-09");
ok("수납 줄이 있으면 「9월 수강료 300,000원」 · 받음 9/7 · 작은 글에 방법 · 없거나 금액이 비면 null(카드 안 뜸)", fl.text === "9월 수강료 300,000원" && fl.paid === true && fl.pill === "받음 9/7" && fl.small === "9/7 받았습니다 · 계좌" && feeLine(null, "2026-09") === null && feeLine({ ym: "2026-09", amount: null }, "2026-09") === null, JSON.stringify(fl));
ok("아직 안 받았으면 알약 「아직」 · 안내 글", feeLine({ ym: "2026-09", amount: 200000, paid_on: null }, "2026-09").pill === "아직" && feeLine({ amount: 200000 }, "2026-10").text === "10월 수강료 200,000원");
const nl = noticeLines([{ id: 1, kind: "daily", url: "/parent", sent_at: "2026-09-06T12:30:00+00:00", opened_at: "2026-09-06T13:05:00+00:00" }, { id: 2, kind: "fee", url: "/parent#fee", sent_at: "2026-09-07T01:00:00+00:00", opened_at: null }, { id: 3, kind: "late", url: null, sent_at: null }]);
ok("실제로 나간 것만(sent_at) · 「9/6 데일리리포트 · 읽음 13:05」 · 「9/7 수강료 안내 · 안 읽음」 · url 없으면 /parent · 자취만 남은 것(리허설)은 빠진다", nl.length === 2 && nl[0].text === "9/6 데일리리포트" && nl[0].small === "읽음 13:05" && nl[1].text === "9/7 수강료 안내" && nl[1].small === "안 읽음" && nl[1].url === "/parent#fee" && noticeLines().length === 0, JSON.stringify(nl));
console.log("■ (서2) 형제 — 달력 안에서 바로 바꾼다(글자 검사)");
{ const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 폰-5 — 주석 속 글자를 읽지 않는다
  const cal = strip(readFileSync("app/_shell/calview.js", "utf8")), pcal = strip(readFileSync("app/parent/cal/page.js", "utf8")), me = strip(readFileSync("app/me/cal/page.js", "utf8"));
  ok("학부모 달력이 CalView 에 형제(kids)를 넘긴다 — 없으면 「달력 → 학부모 → 칩 → 달력」 네 걸음이 된다", /<CalView[^>]*\bkids=\{kids\}/.test(pcal), pcal.match(/<CalView[^>]*>/)?.[0]?.slice(0, 120) ?? "없음");
  ok("달력 머리는 형제가 둘 이상일 때만 세그 · 하나면 이름 알약 그대로(아이 달력은 형제가 없다)", /kids\.length > 1/.test(cal) && /data-g="cal-kids"/.test(cal) && !/kids=/.test(me));
  ok("형제 링크는 보던 달·날을 그대로 들고 간다(?m · ?d · ?s) — 아이를 바꾸면 그 달 처음으로 튕기지 않는다", /kidLink\s*=\s*\(id\)\s*=>\s*`\$\{base\}\?m=\$\{d\.ym\}[\s\S]{0,60}&s=\$\{id\}`/.test(cal), cal.match(/const kidLink[^\n]*/)?.[0]?.slice(0, 160) ?? "없음"); }
console.log(`\n■ 학부모 화면 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
