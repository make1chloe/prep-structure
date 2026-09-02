/**
 * 카드 차례 검사 (계획 ⑮ 1 · v2.screen_pref · lib/screens.js).
 *
 * ⚠️ **가장 중요한 검사는 「목록이 화면과 같은가」다.**
 *    lib 의 CARDS 가 화면의 실제 카드와 어긋나면, 저장값이 걸러져
 *    **그 카드가 차례에서 사라지거나 죽은 이름이 남는다** — 오류는 안 난다.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { CARDS, SCREENS, cardsOf, applyOrder, moveOne, moveTo, canUp, canDown,
         orderToSave, orderInLayout } from "../lib/screens.js";

let n = 0, bad = 0;
const ok = (t, v, m = "") => { n++; console.log(v ? `   ✅ ${t}` : (bad++, `   ❌ ${t}${m ? " — " + m : ""}`)); };
const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\n■ 카드 차례 (⑮ 1 — 사람마다 따로)");

/* ── ① ⚠️ 목록이 화면과 같은가 — 실물에서 뽑아 맞춘다 */
{
  const page = 코드만(readFileSync("app/page.js", "utf8"));
  const m = /const\s+ids\s*=\s*\[([^\]]+)\]/.exec(page);
  const 화면 = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
  ok("app/page.js 에서 카드 이름을 뽑았다", !!화면);
  ok(`⚠️ 대시보드 목록이 화면과 **글자까지 같다** (${화면?.length}개)`,
     JSON.stringify(화면) === JSON.stringify([...CARDS.home]),
     `화면 ${JSON.stringify(화면)} vs lib ${JSON.stringify([...CARDS.home])}`);

  // ⚠️ **상수끼리 견주지 않는다.** 목록이 lib 한 벌이 된 뒤로는 상수 비교가 늘 참이라
  //    검사가 헛돈다. 봐야 하는 것은 **화면이 진짜 그리는 카드**다 —
  //    `카드그리기` 의 열쇠가 그것이고, lib 목록에 없는 열쇠는 **영영 안 그려진다**
  //    (순서.map 이 목록에서 나오므로). 오류는 안 나고 그 카드만 조용히 사라진다.
  const sc = 코드만(readFileSync("app/me/screen.js", "utf8"));
  const m2 = /카드그리기\s*=\s*\{([\s\S]*?)\n  \};/.exec(sc);
  const 아이 = m2 ? [...m2[1].matchAll(/^\s{4}([\w가-힣]+)\s*:\s*\(\)\s*=>/gm)].map((x) => x[1]) : null;
  ok("app/me/screen.js 에서 그리는 카드를 뽑았다", !!아이 && 아이.length > 0, JSON.stringify(아이));
  ok(`⚠️ 학생 화면이 **그리는 카드**가 lib 목록과 같다 (${아이?.length}개)`,
     JSON.stringify([...(아이 ?? [])].sort()) === JSON.stringify([...CARDS.me].sort()),
     `그리는 것 ${JSON.stringify(아이)} vs lib ${JSON.stringify([...CARDS.me])} — 목록에 없는 카드는 영영 안 그려진다`);

  const pv = 코드만(readFileSync("app/parent/view.js", "utf8"));
  const 부모 = [...pv.matchAll(/toggle\("([a-z]+)"\)/g)].map((x) => x[1]);
  const 부모유일 = [...new Set(부모)];
  ok(`⚠️ 학부모 목록이 화면과 같다 (${부모유일.length}개)`,
     JSON.stringify([...부모유일].sort()) === JSON.stringify([...CARDS.parent].sort()),
     `화면 ${JSON.stringify(부모유일)} vs lib ${JSON.stringify([...CARDS.parent])}`);
}

/* ── ② 저장값을 안 믿는다 */
{
  const c = cardsOf(SCREENS.me);
  ok("모르는 이름은 버린다", !applyOrder(["today", "죽은것"], c).includes("죽은것"));
  ok("⚠️ 빠진 이름은 **뒤에 붙는다** (카드가 사라지면 원장님이 그 카드를 영영 못 본다)",
     applyOrder(["flags"], c).length === c.length, JSON.stringify(applyOrder(["flags"], c)));
  ok("겹친 이름이 두 번 안 선다", applyOrder(["today", "today"], c).filter((k) => k === "today").length === 1);
  ok("아무것도 없으면 기본 차례", JSON.stringify(applyOrder(null, c)) === JSON.stringify([...c]));
  ok("layout 꼴이 이상해도 안 터진다",
     orderInLayout(null).length === 0 && orderInLayout({ order: "x" }).length === 0);
}

/* ── ③ ▲▼ */
{
  const o = ["a", "b", "c"];
  ok("▲ 한 칸", JSON.stringify(moveOne(o, "b", "up")) === JSON.stringify(["b", "a", "c"]));
  ok("▼ 한 칸", JSON.stringify(moveOne(o, "b", "down")) === JSON.stringify(["a", "c", "b"]));
  ok("⚠️ 맨 위에서 ▲ 는 **그대로** (고리처럼 돌면 카드가 어디 갔는지 못 찾는다)",
     JSON.stringify(moveOne(o, "a", "up")) === JSON.stringify(o));
  ok("맨 아래에서 ▼ 는 그대로", JSON.stringify(moveOne(o, "c", "down")) === JSON.stringify(o));
  ok("모르는 이름을 밀면 그대로", JSON.stringify(moveOne(o, "zz", "up")) === JSON.stringify(o));
  ok("단추가 눌리는지 맞다", canUp(o, "b") && canDown(o, "b") && !canUp(o, "a") && !canDown(o, "c"));
  ok("끌어 놓기", JSON.stringify(moveTo(o, "c", "a")) === JSON.stringify(["c", "a", "b"]));
  ok("제자리에 놓으면 그대로", JSON.stringify(moveTo(o, "b", "b")) === JSON.stringify(o));
}

/* ── ④ 저장 전 거르기 */
{
  ok("⚠️ 빈 차례는 저장하지 않는다 (저장하면 다음에 열 때 기본으로 돌아간다)",
     orderToSave([], "me").ok === false);
  ok("모르는 화면이면 거절한다", orderToSave(["a"], "zz").ok === false);
  ok("아는 이름이 하나라도 있으면 저장한다", orderToSave(["books"], "me").ok === true);
}

/* ── ④-2 학부모 화면이 실제로 차례를 쓰는가 (확정 ⑮ — 셋 다) */
{
  const v = readFileSync("app/parent/view.js", "utf8");
  const 코드 = 코드만(v);
  ok("학부모 화면이 lib 의 판단을 쓴다", /from\s+["']@\/lib\/screens["']/.test(코드));
  ok(`여덟 카드에 차례가 물려 있다 (${(코드.match(/\{\.\.\.차례\(/g) ?? []).length}개)`,
     (코드.match(/\{\.\.\.차례\(/g) ?? []).length === CARDS.parent.length);
  ok("⚠️ **flex 로 감싸야 order 가 먹는다** (아니면 눌러도 아무 일도 안 난다)",
     /pr-deck/.test(코드) && /\.pr-deck\{display:flex/.test(v));
  ok("⚠️ 단추 안에 단추를 넣지 않았다 (브라우저가 바깥 것만 누른 것으로 친다)",
     !/<button[^>]*pr-acchd/.test(코드), "머리를 통째로 단추로 두면 ▲▼ 가 안 눌린다");
  const a = 코드만(readFileSync("app/parent/actions.js", "utf8"));
  ok("저장하는 손이 있다", /export async function saveCardOrder/.test(a));
  ok("⚠️ 0줄이면 「저장됨」이라 말하지 않는다 (자동 검사 ⑪)",
     /r\.data\?\.length/.test(a) || /!r\.data/.test(a));
  const pg = 코드만(readFileSync("app/parent/page.js", "utf8"));
  ok("화면까지 이어져 있다 (page → view)", /saveCardOrder=\{saveCardOrder\}/.test(pg));
  const rd = 코드만(readFileSync("app/parent/read.js", "utf8"));
  ok("저장한 차례를 읽어 온다", /screen_pref/.test(rd) && /cardOrder/.test(rd));
}

/* ── ⑤ 판단이 두 벌이 아닌가 (원칙 1) */
{
  const 화면들 = ["app/_home/parts.js", "app/me/derive.js", "app/parent/view.js", "app/page.js",
                  "app/parent/actions.js", "app/me/actions.js"];
  const 제손으로 = 화면들.filter((f) => {
    const t = 코드만(readFileSync(f, "utf8"));
    // 「차례를 저장값에 입히는 판단」을 화면이 제 손으로 다시 쓰고 있나
    return /filter\(\s*\(?\s*k\s*\)?\s*=>\s*\w+\.includes\(k\)\s*\)/.test(t)
        && !/from\s+["'][^"']*lib\/screens/.test(t);
  });
  ok("차례 판단을 화면이 제 손으로 다시 쓰지 않는다 (원칙 1)", 제손으로.length === 0, 제손으로.join(" "));
}

/* ── ⑥ 진짜 DB — 정책과 GRANT 는 짝이다 */
{
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  const g = (await c.query(
    `select privilege_type from information_schema.role_table_grants
      where table_schema='v2' and table_name='screen_pref' and grantee='authenticated'`)).rows.map((r) => r.privilege_type);
  ok("자기 차례를 넣고 고칠 수 있다", g.includes("INSERT") && g.includes("UPDATE") && g.includes("SELECT"), g.join(","));
  ok("지우기는 안 준다 (대전제 6)", !g.includes("DELETE"));
  const p = (await c.query(
    `select policyname, qual::text from pg_policies where schemaname='v2' and tablename='screen_pref'`)).rows;
  ok("⚠️ 남의 차례는 못 본다 (profile_id = auth.uid())",
     p.some((r) => /auth\.uid\(\)/.test(r.qual || "")), JSON.stringify(p));
  await c.end();
}

console.log(`\n■ 카드 차례 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
