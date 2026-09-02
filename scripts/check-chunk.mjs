/** 분량 쪼개기 검사 — **조각으로 낸 것이 단원을 통째로 완료로 올리는가**가 핵심이다.
 *  계획 절 ⑳ · 자동 검사 ⑭. 이 사고는 오류가 안 나고 진도율은 오히려 좋아 보인다. */
import { chunkPlan, coveredBy, leftPages, statusFor, pageCount, lumpOf, rangeLabel } from "../lib/chunk.js";
import { Client } from "pg";
import { readFileSync } from "node:fs";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };
const P = (a, b) => ({ page_start: a, page_end: b });
const part = (a, b) => ({ pageFrom: a, pageTo: b });

console.log("■ 쪽 세기 — 여기서 하나 틀리면 「다 덮었다」가 통째로 틀린다");
ok("p.35~40 은 6쪽이다 (시작과 끝을 둘 다 센다)", pageCount(P(35, 40)) === 6, String(pageCount(P(35, 40))));
ok("p.35 한 쪽짜리는 1쪽", pageCount({ page_start: 35 }) === 1);
ok("쪽을 모르면 0", pageCount({}) === 0);
ok("여러 줄이 한 덩어리가 된다", JSON.stringify(lumpOf([P(35,40),P(41,46)])) === '{"from":35,"to":46}');

console.log("\n■ ⚠️ 조각으로 낸 것은 **완료로 안 올라간다** (자동 검사 ⑭)");
const wb = [P(35, 40), P(41, 46), P(47, 52)];
{
  const s = statusFor("done", wb, [part(35, 40)]);
  ok("6쪽만 내고 ○ 를 줘도 「하는 중」이다", s.status === "doing", s.status);
  ok("앱이 스스로 정한다 (원장님이 안 누른다)", s.auto === true);
  ok("남은 쪽을 말해 준다", /p\.41~52/.test(s.why), s.why);
}
{
  const s = statusFor("done", wb, [part(35, 40), part(41, 46), part(47, 52)]);
  ok("다 덮으면 **저절로** 완료가 된다", s.status === "done" && s.auto === true, s.status);
}
{
  const s = statusFor("done", wb, [part(35, 52)]);
  ok("한 번에 통째로 내도 완료가 된다", s.status === "done");
}
{
  const s = statusFor("done", [...wb, { page_start: null }], [part(35, 52)]);
  ok("⚠️ 쪽을 모르는 줄이 섞이면 **완료로 안 올린다**", s.status === "doing" && s.ask === true, JSON.stringify(s));
  ok("그때는 원장님께 물을 것이라고 말한다", /쪽수를 모르/.test(s.why));
}
{
  ok("✕ 는 진도를 안 올린다", statusFor("missing", wb, []).status === "none");
  ok("△ 는 「하는 중」까지", statusFor("weak", wb, []).status === "doing");
}

console.log("\n■ 남은 쪽 세기 — 가운데를 건너뛰어 내도 안 잃는다");
ok("가운데만 내면 앞뒤가 남는다",
   JSON.stringify(leftPages(wb, [part(41, 46)])) === "[[35,40],[47,52]]",
   JSON.stringify(leftPages(wb, [part(41, 46)])));
ok("겹쳐 내도 두 번 안 센다",
   JSON.stringify(leftPages(wb, [part(35, 44), part(40, 48)])) === "[[49,52]]",
   JSON.stringify(leftPages(wb, [part(35, 44), part(40, 48)])));
ok("차례가 뒤죽박죽이어도 같은 답",
   JSON.stringify(leftPages(wb, [part(47, 52), part(35, 40)])) === "[[41,46]]");
ok("범위 밖을 내도 안 터진다", Array.isArray(leftPages(wb, [part(100, 200)])));

console.log("\n■ 이번에 얼마를 낼까");
{
  const p = chunkPlan(wb, { pages: 6, parts: [] });
  ok("6쪽만 떼어 준다", JSON.stringify(p.give) === "[[35,40]]", JSON.stringify(p.give));
  ok("화면 글자가 그대로 아이에게 나간다", /p\.35~40/.test(p.label), p.label);
  ok("남은 것을 같이 띄운다 (지난번 어디까지 냈나)", /p\.41~52/.test(p.leftLabel), p.leftLabel);
}
{
  const p = chunkPlan(wb, { parts: [] });
  ok("안 정하면 남은 것 전부 — **통째가 기본**이다", p.pages === 18 && p.done === true, JSON.stringify(p.pages));
}
{
  const p = chunkPlan(wb, { pages: 999, parts: [] });
  ok("남은 것보다 많이 달라 해도 남은 만큼만", p.pages === 18);
  const q = chunkPlan(wb, { pages: 0, parts: [] });
  ok("0쪽을 달라 해도 최소 1쪽은 나간다 (조용히 0줄이 되지 않는다)", q.pages === 1, String(q.pages));
}
{
  const p = chunkPlan(wb, { pages: 6, parts: [part(41, 46)] });
  ok("가운데를 이미 냈으면 그 앞부터 이어 준다", JSON.stringify(p.give) === "[[35,40]]", JSON.stringify(p.give));
}
{
  const p = chunkPlan(wb, { pages: 6, parts: [part(35, 52)] });
  ok("다 냈으면 더 안 낸다", p.give.length === 0 && p.done === true, JSON.stringify(p));
}
{
  const p = chunkPlan(wb, { pages: 8, parts: [part(35, 40)] });
  ok("이어지지 않는 두 토막에 걸쳐도 정확히 8쪽", p.pages === 8 && p.give.flat().length === 2);
}

console.log("\n■ 진짜 교재 줄로 — 워크북은 대단원 통째다 (0062)");
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  const rows = (await c.query(`
    select b.name, u.chapter, u.sub, u.activity, u.is_workbook, u.page_start, u.page_end
      from v2.units u join v2.books b on b.id = u.book_id
     where b.name = '그래머인사이드3' and u.state = 'active' and u.is_workbook
       and u.chapter = 'Chapter 04 부정사' order by u.sort`)).rows;
  await c.end();
  ok("그 대단원 워크북 줄을 읽었다", rows.length > 0, String(rows.length));
  const p = chunkPlan(rows, { pages: 6, parts: [] });
  ok("진짜 줄로도 쪼개진다", p.give.length > 0 && /p\./.test(p.label), p.label);
  const all = chunkPlan(rows, { parts: [] });
  ok("통째로는 18쪽이다 (실측)", all.pages === 18, String(all.pages));
  const done = statusFor("done", rows, all.give.map(([a, b]) => part(a, b)));
  ok("통째로 내고 ○ 를 주면 완료가 된다", done.status === "done", done.status);
  const half = statusFor("done", rows, [part(35, 40)]);
  ok("⚠️ 6쪽만 내고 ○ 를 주면 **완료가 안 된다**", half.status === "doing", half.status);
} catch (e) {
  fail++; console.log("   ❌ 진짜 교재로 못 돌렸다 —", String(e.message).split("\n")[0]);
}

console.log(`\n■ 분량 쪼개기 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
