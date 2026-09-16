/** 등원·하원 검사(검사-㊺ · 목업 07 🕘 · 0078·0083) — 순수 판단 lib/arrival-plan.js: 걸음 셋 + 집에 가요 · 도착은 가장 이른 등원 걸음 · 지각 분은 반 시작과 견줘(유예 분) · 학원 회선(IPv4 그대로 · IPv6 앞 4덩어리 · ::ffff: · 빈 목록은 아무도 못 찍음) · 요청 주소 읽기 · 반 고르기(하나·둘·보강·없음) · 「앞으로」 줄 · 학원 줄의 차례 */
import { readFileSync, readdirSync } from "node:fs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 폰-5 · lib 글자를 훑기 전에 주석을 지운다
import { STEPS, LEAVE, stepName, arrivalState, arrivalTimes, lateMinutes, ipKey, ipAllowed, clientIp, classChoice, futureLines, classSteps, homeSteps, timerText } from "../lib/arrival-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
console.log("■ 걸음");
ok("걸음 셋 핸드폰·출석·숙제 + 집에 가요(4)", STEPS.map(([, v]) => v).join(",") === "핸드폰 냈어요,출석,숙제 냈어요" && LEAVE === 4 && stepName(4) === "집에 가요" && stepName(2) === "출석");
const rows = [{ step: 2, at: "2026-09-06T08:02:00Z" }, { step: 1, at: "2026-09-06T08:00:30Z" }, { step: 4, at: "2026-09-06T13:10:00Z" }];
const st = arrivalState(rows);
ok("도착은 가장 이른 등원 걸음(핸드폰 17:00) · 하원은 4 · 찍은 걸음 집합", st.arrivedAt === "2026-09-06T08:00:30Z" && st.leftAt === "2026-09-06T13:10:00Z" && st.arrived && st.left && st.done.has(2) && !st.done.has(3));
ok("아무것도 안 찍었으면 아직", !arrivalState([]).arrived && arrivalState([]).arrivedAt === null && !arrivalState([{ step: 4, at: "x" }]).arrived);
console.log("■ 지각 분 · 세어 나온다(원칙-5)");
ok("17:12 도착 · 17:00 시작 · 유예 0 → 12분 · 유예 15 → 0 · 정시 → 0 · 시작 모르면 0", lateMinutes("2026-09-06T08:12:00Z", "17:00", 0) === 12 && lateMinutes("2026-09-06T08:12:00Z", "17:00", 15) === 0 && lateMinutes("2026-09-06T08:00:00Z", "17:00:00", 0) === 0 && lateMinutes("2026-09-06T08:12:00Z", null, 0) === 0);
console.log("■ 학원 회선");
ok("IPv4 그대로 · IPv6 앞 4덩어리 · ::ffff: 꼴은 v4", ipKey("1.2.3.4") === "1.2.3.4" && ipKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd") === "2001:db8:1:2" && ipKey("::ffff:10.0.0.9") === "10.0.0.9");
ok("목록에 있으면 통과 · 같은 /64 도 통과 · 없으면 막힘 · 빈 목록은 아무도 못 찍음 · 주소 없으면 막힘", ipAllowed("1.2.3.4", ["1.2.3.4"]) && ipAllowed("2001:db8:1:2:1:1:1:1", ["2001:db8:1:2:9:9:9:9"]) && !ipAllowed("1.2.3.5", ["1.2.3.4"]) && !ipAllowed("1.2.3.4", []) && !ipAllowed(null, ["1.2.3.4"]));
const H = (m) => (k) => m[k] ?? null;
ok("요청 주소 · x-forwarded-for 의 첫 것 · 없으면 x-real-ip · 없으면 null", clientIp(H({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" })) === "5.6.7.8" && clientIp(H({ "x-real-ip": "9.9.9.9" })) === "9.9.9.9" && clientIp(H({})) === null);
console.log("■ 반 고르기 · 앞으로 · 차례");
ok("반 하나면 그것 · 둘이면 고른다(답 ⑫) · 보강뿐이면 반 없음 · 아무것도 없으면 none", classChoice([{ id: "a", kind: "regular", start: "17:00" }]).classId === "a" && classChoice([{ id: "a", kind: "regular" }, { id: "b", kind: "regular" }]).pick === true && classChoice([{ id: null, kind: "makeup", start: "14:00" }]).makeup === true && classChoice([]).none === true);
const fut = futureLines({ absences: [{ of_date: "2026-10-14", state: "set", on_date: "2026-10-18", at_time: "14:00:00" }, { of_date: "2026-09-01", state: "todo" }, { of_date: "2026-10-20", state: "cancelled" }], lates: [{ date: "2026-10-19", minutes: 30 }], today: "2026-09-06" });
ok("「10/14 수 결석 예정 · 보강 10/18 14:00」 · 「10/19 월 30분 지각 예정」 · 지난 것·물린 것은 뺀다 · 날짜 차례", fut.map((f) => f.text).join(" | ") === "10/14 수 결석 예정 · 보강 10/18 14:00 | 10/19 월 30분 지각 예정", fut.map((f) => f.text).join(" | "));
const steps = classSteps([{ id: "c", sort: 3 }, { id: "a", sort: 1, said_done_at: "x" }, { id: "b", sort: 2 }]);
ok("학원 줄 차례 · 끝낸 것 done · 첫 안 끝낸 줄 now · 그 뒤 locked(0084 ⑱)", steps.map((s) => `${s.id}:${s.state}`).join(",") === "a:done,b:now,c:locked");
const hs = (items) => homeSteps(items).map((s) => `${s.id}:${s.state}`).join(",");
ok("숙제 줄(확정-㉒ · 4단계-5) · 아무 때나 누른다 · 🔒(gate_prev) 줄만 바로 앞 숙제 줄을 끝내야 열린다 · 앞 줄을 끝내면 열린다 · 끝낸 🔒 줄은 done · 첫 줄의 🔒 는 뜻이 없다", hs([{ id: "a", sort: 1 }, { id: "b", sort: 2, gate_prev: true }, { id: "c", sort: 3 }]) === "a:now,b:locked,c:now" && hs([{ id: "a", sort: 1, said_done_at: "x" }, { id: "b", sort: 2, gate_prev: true }]) === "a:done,b:now" && hs([{ id: "b", sort: 2, gate_prev: true, said_done_at: "x" }, { id: "a", sort: 1 }]) === "a:now,b:done" && hs([{ id: "a", sort: 1, gate_prev: true }]) === "a:now", hs([{ id: "a", sort: 1 }, { id: "b", sort: 2, gate_prev: true }, { id: "c", sort: 3 }]));
const G = (id, item, sort, extra = {}) => ({ id, item_id: item, sort, ...extra });
ok("「앞엣것」은 앞 항목이다. 소단원마다 줄이 서도(문장훈련 ×2 → 워크북 ×2) 🔒 워크북 둘은 문장훈련 둘을 다 끝내야 열린다 · 하나만 끝내면 아직 · 같은 항목끼리는 서로 안 잠근다", hs([G("a1", "A", 1), G("a2", "A", 2), G("b1", "B", 3, { gate_prev: true }), G("b2", "B", 4, { gate_prev: true })]) === "a1:now,a2:now,b1:locked,b2:locked" && hs([G("a1", "A", 1, { said_done_at: "x" }), G("a2", "A", 2), G("b1", "B", 3, { gate_prev: true })]) === "a1:done,a2:now,b1:locked" && hs([G("a1", "A", 1, { said_done_at: "x" }), G("a2", "A", 2, { said_done_at: "x" }), G("b1", "B", 3, { gate_prev: true }), G("b2", "B", 4, { gate_prev: true })]) === "a1:done,a2:done,b1:now,b2:now", hs([G("a1", "A", 1, { said_done_at: "x" }), G("a2", "A", 2), G("b1", "B", 3, { gate_prev: true })]));
console.log("■ (어35) 학원 줄 타이머(원장님 9/15 「학생페이지 타이머 짓는다」)");
ok("타이머 글 · 하는 중 「▶ m:ss」 · 끝 「⏱ N분」(끝 − 시작 · 1분 미만은 1분 · 끝은 ended_at 없으면 said_done_at) · 시작 안 했으면 null · 시계가 뒤로 가도 0:00", timerText({ started_at: "2026-09-15T10:00:00Z" }, Date.parse("2026-09-15T10:03:07Z")) === "▶ 3:07" && timerText({ started_at: "2026-09-15T10:00:00Z", ended_at: "2026-09-15T10:12:20Z" }) === "⏱ 12분" && timerText({ started_at: "2026-09-15T10:00:00Z", said_done_at: "2026-09-15T10:00:10Z" }) === "⏱ 1분" && timerText({}) === null && timerText({ started_at: "2026-09-15T10:00:00Z" }, Date.parse("2026-09-15T09:59:00Z")) === "▶ 0:00");
const ts = classSteps([{ id: "a", sort: 1, said_done_at: "x", started_at: "s" }, { id: "b", sort: 2, started_at: "s" }, { id: "c", sort: 3 }]);
ok("classSteps · 시작했지만 안 끝낸 줄(b)은 now + running · 끝낸 줄은 done(running 아님) · 뒤는 locked", ts.map((s) => `${s.id}:${s.state}${s.running ? "*" : ""}`).join() === "a:done,b:now*,c:locked");
console.log("■ (어48) 출결 곁의 도착·하원 시각 · 누가 찍었나(원장님 9/16 「출석, 지각, 하원은 시간이 기록되게해」)");
{ const t = arrivalTimes([{ step: 2, at: "2026-09-16T08:02:00Z", stamped_by: "student" }, { step: 1, at: "2026-09-16T08:00:30Z", stamped_by: "student" }, { step: 4, at: "2026-09-16T13:10:00Z", stamped_by: "staff" }]);
  ok("도착은 가장 이른 등원 걸음(17:00 · 앱이 찍음) · 하원은 걸음 4(22:10 · 원장이 찍음) · 이름까지", t.in.at === "17:00" && t.in.by === "student" && t.in.name === "앱" && t.out.at === "22:10" && t.out.by === "staff" && t.out.name === "원장", JSON.stringify(t));
  ok("안 찍었으면 null · 찍은이가 비면 아이가 찍은 것으로 본다(옛 줄 · 0169 앞)", arrivalTimes([]).in === null && arrivalTimes([]).out === null && arrivalTimes([{ step: 2, at: "2026-09-16T08:02:00Z" }]).in.by === "student" && arrivalTimes([{ step: 4, at: "2026-09-16T13:10:00Z" }]).in === null); }
console.log("■ (어55) 잘못 누른 하원을 취소(원장님 9/16 「하원버튼 실수할거같으니 강조해주고, 다시 누르면 취소가능하게」)");
{ const arr = strip(readFileSync("lib/arrival.js", "utf8"));
  const migs = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).map((f) => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
  ok("취소하는 손은 lib/arrival clearStamp 하나 · **학원 사람이 찍은 줄만** 내린다(아이 앱이 찍은 시각은 1차 기준이라 시각 고치기로만 바꾼다)",
    /export async function clearStamp\(/.test(arr) && /\.eq\("stamped_by", "staff"\)/.test(arr) && /아이 앱이 찍은 것은 취소할 수 없습니다/.test(arr));
  ok("**지우지 않는다**(대전제-6) · undone_at 을 찍어 내리고(0170) · 다시 찍으면 staffStamp 가 그 칸을 null 로 덮어 되살린다 · 앱 어디에도 arrival delete 0",
    /update\(\{ undone_at: new Date\(\)\.toISOString\(\) \}\)/.test(arr) && /\.is\("undone_at", null\)\.select\("id"\)/.test(arr)
    && /undone_at: null/.test(arr) && !/from\("arrival"\)[\s\S]{0,80}\.delete\(\)/.test(arr)
    && /alter table v2\.arrival add column if not exists undone_at timestamptz/.test(migs));
  ok("(어55b) **붙여넣기 SQL 이 아직 안 들어갔어도 화면은 선다** — 읽기는 lib/arrival-plan liveArrival 한 곳을 거쳐 칸이 없으면 안 거르고 읽고, 쓰기(staffStamp)는 칸 없이 한 번 더 넣는다(2026-09-16 학생 화면이 「column arrival.undone_at does not exist」 로 통째로 깨졌다 · 코드가 SQL 보다 먼저 배포됐다)",
    /export async function liveArrival\(make\)/.test(readFileSync("lib/arrival-plan.js", "utf8"))
    && /\/undone_at\/\.test\(r\?\.error\?\.message \?\? ""\)/.test(readFileSync("lib/arrival-plan.js", "utf8"))
    && /if \(\/undone_at\/\.test\(got\?\.error\?\.message \?\? ""\)\) got = await put\(base\);/.test(arr));
  { const FILES = ["lib/me.js", "lib/day.js", "lib/parent.js", "lib/cal.js"];
    const 샌곳 = FILES.filter((f) => /(?<!liveArrival\(\(\) => )db\(sb\)\.from\("arrival"\)\.select/.test(strip(readFileSync(f, "utf8"))));
    const 감싼곳 = FILES.filter((f) => /liveArrival\(\(\) => db\(sb\)\.from\("arrival"\)\.select/.test(strip(readFileSync(f, "utf8"))));
    ok(`취소한 줄은 **읽는 자리 전부**가 liveArrival 하나를 거친다 · 맨손으로 읽으면 취소한 하원이 그 화면에만 살아 있거나(칸 있을 때) 화면이 통째로 깨진다(칸 없을 때) · 지금 ${감싼곳.length}곳`,
      감싼곳.length === FILES.length && 샌곳.length === 0, 샌곳.join(" · ")); } }
console.log(`\n■ 등원·하원 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
