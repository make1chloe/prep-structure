/**
 * 클래스카드 판정 검사 (확정 ⑱ · 원장님 답 3).
 *
 * ⚠️⚠️ **제일 중요한 것은 「확장과 짝이 맞나」다.**
 *    모드 목록·칸 이름이 확장과 어긋나면 판정이 **조용히 0개**가 되거나
 *    안 켠 모드를 미달로 읽는다 — 오류는 안 난다.
 */
import { readFileSync, existsSync } from "node:fs";
import { Client } from "pg";
import { MODES, MODE_NAME, judgeSet, judgeDay, setTypeName, CANNOT_JUDGE } from "../lib/classcard.js";

let n = 0, bad = 0, 모름 = 0;
const ok = (t, v, m = "") => { n++; console.log(v ? `   ✅ ${t}` : (bad++, `   ❌ ${t}${m ? " — " + m : ""}`)); };
const 못봄 = (t) => { 모름++; console.log(`   🔎 ${t}`); };

console.log("\n■ 클래스카드 판정");

/* ── ① 확장과 짝이 맞나 — **실물 파일을 연다** */
{
  const 확장 = "/Users/chloe_mac/Library/CloudStorage/GoogleDrive-bdyj10@gmail.com/내 드라이브/AI자동화/클로드코드/classcard-extension/background.js";
  if (!existsSync(확장)) {
    못봄("확장 파일을 못 찾았다 — 짝이 맞는지 **확인 못 함**(대전제 0). 경로가 바뀌었으면 이 검사를 고쳐라");
  } else {
    const t = readFileSync(확장, "utf8");
    const m = /const\s+MODES\s*=\s*\[([^\]]+)\]/.exec(t);
    const 확장모드 = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
    ok("확장에서 모드 목록을 뽑았다", !!확장모드, "background.js 의 MODES 를 못 읽었다");
    ok(`⚠️ 모드 목록이 확장과 **글자까지 같다** (${확장모드?.length}개)`,
       JSON.stringify(확장모드) === JSON.stringify([...MODES]),
       `확장 ${JSON.stringify(확장모드)} vs lib ${JSON.stringify([...MODES])}`);
    ok("⚠️ 확장이 **켠 모드만** 담는다 (goal_yn=1) — 그래서 lib 도 켠 것만 본다",
       /goal_yn`\]\)\s*===\s*"1"/.test(t) || /_goal_yn/.test(t));
    ok("확장이 보내는 칸 이름이 lib 이 읽는 것과 같다 (goals·got)",
       /goals\[m\]\s*=/.test(t) && /got\[m\]\s*=/.test(t));
    ok("세트 갈래는 1 단어 · 2 문장", /set_type/.test(t) && setTypeName("1") === "단어" && setTypeName("2") === "문장");
    ok("모르는 갈래는 「모름」이라 말한다 (지어내지 않는다)", setTypeName("9") === "모름");
  }
}

/* ── ② ⚠️ 안 켠 모드를 미달로 읽지 않는다 — 이것이 틀리면 늘 「3~4개 미달」이 뜬다 */
{
  const r = judgeSet({ goals: { match: 3000 }, got: { match: 3200 }, complete: true });
  ok("⚠️⚠️ 안 켠 모드는 **판정 대상이 아니다**", r.state === "met" && r.judged.length === 1,
     JSON.stringify(r));
  ok("켠 모드만 셌다", r.judged.length === 1 && r.judged[0] === "match");
  const r2 = judgeSet({ goals: {}, got: {}, complete: true });
  ok("목표를 안 걸었으면 **미달이 아니다**", r2.state === "nogoal" && r2.short.length === 0);
}

/* ── ③ 미달·안 끝냄을 가른다 */
{
  const s = judgeSet({ goals: { match: 3000, mem: 4000 }, got: { match: 2800, mem: 4100 }, complete: true });
  ok("모자란 모드만 뽑는다", s.state === "short" && s.short.length === 1 && s.short[0].mode === "match");
  ok("얼마나 모자란지 센다", s.short[0].gap === 200);
  ok("사람 말로 적는다", /매칭 2800\/3000/.test(s.why), s.why);
  const u = judgeSet({ goals: { match: 3000 }, got: {}, complete: false });
  ok("⚠️ 「안 끝냈다」와 「목표 미달」은 **다른 사실**이다", u.state === "undone");
  const z = judgeSet({ goals: { match: 3000 }, got: { match: 0 }, complete: true });
  ok("끝냈는데 0점이면 미달이다", z.state === "short" && z.short[0].got === 0);
  ok("점수가 없으면 0으로 본다 (끝냈다고 했으므로)",
     judgeSet({ goals: { mem: 10 }, got: {}, complete: true }).state === "short");
}

/* ── ④ 하루 셈 — **세기만 한다. 저장하지 않는다**(원칙 5) */
{
  const d = judgeDay([
    { goals: { match: 3000 }, got: { match: 2000 }, complete: true },
    { goals: { mem: 10 }, got: { mem: 50 }, complete: true },
    { goals: { mem: 10 }, got: {}, complete: false },
    { goals: {}, got: {}, complete: true },
  ]);
  ok("미달·넘김·안끝냄·목표없음을 따로 센다",
     d.short === 1 && d.met === 1 && d.undone === 1 && d.nogoal === 1, JSON.stringify(d).slice(0, 90));
  ok("⚠️ 원장님을 부를 때만 부른다 (미달 또는 안 끝냄)", d.needsCall === true);
  ok("다 넘겼으면 안 부른다",
     judgeDay([{ goals: { mem: 1 }, got: { mem: 5 }, complete: true }]).needsCall === false);
  ok("빈 것도 안 터진다", judgeDay(null).sets.length === 0 && judgeDay(undefined).needsCall === false);
}

/* ── ⑤ ⚠️ 못 하는 것을 하는 척하지 않는다 (대전제 0) */
{
  ok("3초훈련·스크램블·드릴을 **판정 못 한다고 밝힌다**", CANNOT_JUDGE.length >= 3);
  ok("그 셋이 모드 목록에 안 들어가 있다",
     !MODES.some((m) => /scramble|3초|drill/i.test(m)));
  const 글 = CANNOT_JUDGE.map((x) => x.why).join(" ");
  ok("모르는 것은 「확인 안 됨」이라 적었다", /확인 안 됨/.test(글));
}

/* ── ⑥ 판정이 여기 한 곳뿐인가 (원칙 1) */
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (d, out = []) => { for (const f of readdirSync(d)) {
    if ([".next", "node_modules"].includes(f)) continue;
    const p = `${d}/${f}`;
    statSync(p).isDirectory() ? walk(p, out) : /\.(js|mjs)$/.test(f) && out.push(p); } return out; };
  const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // ⚠️ 무늬를 좁게 문다. `got` 은 흔한 이름이라(도장 담는 그릇 등) 헐겁게 물면
  //    엉뚱한 화면이 잡히고, 헛짚는 검사는 결국 꺼진다.
  //    → **클래스카드 자리인 것이 분명할 때만** 잡는다: goals 와 got 을 같이 쓰거나
  //      확장의 칸 이름(`*_goal_score`)을 들고 있거나, 모드 이름으로 판정하고 있을 때.
  const 딴데서 = [...walk("lib"), ...walk("app")]
    .filter((f) => !f.endsWith("lib/classcard.js"))
    .filter((f) => { const t = 코드만(readFileSync(f, "utf8"));
      // ⚠️ **읽는 것과 판정하는 것을 가른다.** 값을 조회하고 그리는 것은 화면의 일이다 —
      //    그것까지 잡으면 화면이 점수를 못 띄우고, 헛짚는 검사는 결국 꺼진다.
      //    판정이란 ① 목표와 실제를 **견주거나** ② 모드 목록을 **다시 적는** 것이다.
      if (/_goal_score|goal_yn/.test(t)) return true;                    // 확장 칸 이름을 직접 읽음
      const 견줌 = /(got|a)\s*(\[|\.)[^)\n]{0,24}[<>]=?[^)\n]{0,24}(goal|g)\s*(\[|\.)/.test(t)
                || /(goal|g)\s*(\[|\.)[^)\n]{0,24}[<>]=?[^)\n]{0,24}(got|a)\s*(\[|\.)/.test(t);
      const 목록다시 = (t.match(/["'](mem|recall|spell|speaking|match)["']/g) ?? []).length >= 2;
      return 견줌 || 목록다시;
    });
  ok("목표·점수를 딴 데서 안 판정한다", 딴데서.length === 0, 딴데서.join(" "));
}

/* ── ⑦ 진짜 DB — 담을 자리가 있나 */
{
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  const cols = (await c.query(
    `select column_name, data_type from information_schema.columns
      where table_schema='v2' and table_name='cc_planner'`)).rows;
  const has = (k, t) => cols.some((r) => r.column_name === k && (!t || r.data_type === t));
  ok("goals·got 가 jsonb 로 있다", has("goals", "jsonb") && has("got", "jsonb"));
  ok("complete·set_type 도 있다", has("complete") && has("set_type"));
  const n0 = (await c.query(`select count(*)::int n from v2.cc_planner`)).rows[0].n;
  못봄(`cc_planner 가 ${n0}줄 — **진짜 자료로는 아직 못 돌려 봤다**(확장을 아직 새 앱에 안 물렸다)`);
  await c.end();
}

console.log(`\n■ 클래스카드 검사 ${n}건 · 실패 ${bad} · 못 본 것 ${모름}건`);
process.exit(bad ? 1 : 0);
