/** (머2) 오늘 수업 날짜 고르개 검사(검사-80) — 원장님 2026-09-10: 「오늘 수업에 진짜 오늘 수업이 아니어도 캘린더에서
 *  선택하면 해당날짜 수업에 대한 부분 불러오게 해줘 과거내역 고치거나 미래내용 미리 임시저장하게」.
 *  날짜 하나가 늘어나면 **조용히 셈이 흔들리는 자리**가 셋이라 글자로 지킨다:
 *  ① 다른 날을 열어보는 것만으로 판이 서면 숙제가 깔린다 ② 아직 안 한 수업을 마감하면 부모님께 글이 나간다
 *  ③ 월초 정리 띠가 그 날 것으로 바뀌면 오늘 할 일을 못 본다. */
import { readFileSync } from "node:fs";
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 주석 먼저(폰-5)
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const src = (f) => strip(readFileSync(f, "utf8"));
const page = src("app/today/page.js"), day = src("lib/day.js"), pick = src("app/today/daypick.js"), row = src("app/today/row.js"), walk = src("scripts/e2e/today.mjs");

console.log("■ 날짜를 골라 그 날 판을 연다");
ok("주소 하나로만 — `?d=YYYY-MM-DD` · 꼴이 아니면 오늘(엉뚱한 글자로 화면이 안 터진다)",
  /searchParams/.test(page) && /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(page) && /todayStr/.test(page));
ok("고르개는 go() 로 움직인다 — 띠가 켜진다(router.push 는 going.js 안에만 · 검사-71)", /useGo/.test(pick) && !/router\.push/.test(pick));
ok("오늘은 맨 주소(/today)로 — 즐겨찾기가 늘 오늘을 연다", /d === today \? "\/today"/.test(pick));

console.log("■ 조용히 흔들릴 자리 셋 — 막아 둔다");
ok("**다른 날은 판을 저절로 안 세운다** — 열어보기만 해도 숙제가 깔리면 셈이 흔들린다(출결을 누르면 그때 선다)",
  /roster\(sb, date, null, \{ open: date === todayStr \}\)/.test(page) && /\{ open = true \} = \{\}/.test(day) && /if \(open && missing\.length\)/.test(day));
ok("**앞으로 올 날은 못 마감한다** — 화면(단추 잠금)과 **손**(closeSheet) 둘 다. 화면만 잠그면 손이 안 잠긴다",
  /disabled=\{future\}/.test(row) && /export async function assertNotFuture/.test(day) && /await assertNotFuture\(sb, sheetId\)/.test(day)
  && /closeSheet[\s\S]{0,200}assertNotFuture/.test(day));
ok("**월초 정리 띠는 늘 오늘 것** — 지난 날을 열어도 그 날 띠가 뜨지 않는다", /warnBand\(sb, todayStr\)/.test(page));

console.log("■ 화면이 스스로 말한다(대전제-0)");
ok("다른 날이면 그렇게 말한다 — 지난 날은 「고칠 수 있다 · 마감한 판은 읽기만」 · 앞날은 「적어 두는 것은 다 된다 · 마감은 그 날에」",
  /data-g="other-day"/.test(page) && /임시저장|임시 저장/.test(page) && /읽기만/.test(page));
ok("마감 단추 옆 글도 앞날이면 바뀐다(왜 잠겼는지 그 자리에서)", /data-g="close-note"/.test(row) && /마감이 잠겨/.test(row));
ok("걷기가 눌러본다 — 어제로 · 내일로 · 오늘로 · 앞날은 마감이 잠김",
  /data-act=day-prev/.test(walk) && /data-act=day-next/.test(walk) && /data-act=day-today/.test(walk) && /data-g=close-note/.test(walk));
console.log(`\n■ 날짜 고르개 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
