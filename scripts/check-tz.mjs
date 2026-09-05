/** 시간대 검사 — ① 마이그레이션에 `current_date`·`now()::date` 가 있으면 실패. ② lib·app 의 날짜 글자 셈이 프로세스 시간대에 기대면 실패(검사-㊴).
 *  ⚠️ 서울과 UTC 는 9시간 차이라 **밤 9시 이후 하루가 어긋난다.** Vercel 은 UTC 로 돈다 — `new Date(d+"T00:00:00+09:00").getDay()` 는 거기서 하루 전 요일이다(2026-09-05 걷기 캡처 「9월 6일 토」가 잡음). */
process.env.TZ = "UTC";   // ⚠️ 여기서 UTC 로 돌려 본다 — 서울에서만 맞는 셈을 잡으려고
import { readdirSync, readFileSync } from "node:fs";
import { weekday, weekdayName, plusDays } from "../lib/day-plan.js";
const bad=[];
for (const f of readdirSync("supabase/migrations").filter(x=>x.endsWith(".sql"))) {
  const s=readFileSync("supabase/migrations/"+f,"utf8");
  s.split("\n").forEach((l,i)=>{
    if (/^\s*--/.test(l)) return;
    if (/current_date|now\(\)::date|current_timestamp::date/.test(l))
      bad.push(`${f}:${i+1}  ${l.trim().slice(0,80)}`);
  });
}
console.log("■ 시간대 — 서울 아닌 오늘을 쓰는 자리");
bad.length ? bad.forEach(x=>console.log("   ❌",x)) : console.log("   ✅ 없음");
console.log("■ 날짜 글자 셈 — UTC 프로세스에서도 서울 달력과 같은가 (lib/day-plan.js 한 벌)");
const ok = (what, cond, got) => { if (cond) console.log("   ✅", what); else { bad.push(what); console.log("   ❌", what, "—", got); } };
ok("2026-09-06 은 일요일(0)", weekday("2026-09-06") === 0, weekday("2026-09-06"));
ok("2026-09-05 는 토(6) · 이름 「토」", weekday("2026-09-05") === 6 && weekdayName("2026-09-05") === "토", weekdayName("2026-09-05"));
ok("30일 전 — 2026-09-06 → 2026-08-07", plusDays("2026-09-06", -30) === "2026-08-07", plusDays("2026-09-06", -30));
ok("달 넘김 — 2026-09-29 + 3 → 2026-10-02", plusDays("2026-09-29", 3) === "2026-10-02", plusDays("2026-09-29", 3));
ok("날짜 아닌 글자는 던진다", (() => { try { weekday("2026-9-6"); return false; } catch { return true; } })(), "안 던짐");
// 흩어진 셈 — 날짜 글자에 시간대를 붙여 지역 메서드로 읽는 자리는 lib/day-plan.js 밖에 없어야 한다
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === "node_modules" ? [] : walk(`${d}/${e.name}`)) : /\.(js|mjs)$/.test(e.name) ? [`${d}/${e.name}`] : []);
for (const f of [...walk("lib"), ...walk("app")]) {
  if (f === "lib/day-plan.js") continue;
  const s = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
  s.split("\n").forEach((l, i) => { if (/\.getDay\(\)|\.getDate\(\)|\.setDate\(|\.getMonth\(\)|T00:00:00\+09:00/.test(l)) bad.push(`${f}:${i + 1} 시간대에 기대는 날짜 셈 — lib/day-plan.js 의 weekday·plusDays 를 쓴다: ${l.trim().slice(0, 90)}`); });
}
const spread = bad.filter((x) => /시간대에 기대는/.test(x));
spread.length ? spread.forEach((x) => console.log("   ❌", x)) : console.log("   ✅ 흩어진 셈 없음(lib·app)");
console.log(`\n   → 오늘은 **v2.today()** 하나로만 · 요일·며칠 뒤는 lib/day-plan.js 하나로만 센다`);
process.exit(bad.length?1:0);
