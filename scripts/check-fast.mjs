/**
 * **속도 검사** — `lib/fast.js` (한 번에 읽는 자리)
 *
 * ⚠️⚠️ 이 검사가 지키는 것은 **둘**이고, 둘째가 훨씬 중요하다.
 *   ① 빨라졌나 — 계획 「속도」 절의 **상한 표**를 넘으면 실패.
 *   ② **답이 그대로인가** — 옛 길(`routineNext` 가 교재마다 따로 묻는 길)과
 *      새 길(한 판에 묻고 그 자리에서 답하는 길)의 판을 **진짜 DB 로 맞대**
 *      `JSON.stringify` 가 **글자까지** 같은지 본다. 다르면 실패다.
 *      까닭은 계획 ㊻ 이다 — 커서 차례(대단원 차례 → 갈래 → 줄 차례)에서
 *      **하나만 빠져도 오류 없이 조용히 틀린 차례**로 나간다. 화면도 멀쩡하다.
 *
 * ⚠️ **가짜 DB 만으로는 이 검사가 뜻이 없다.** 죽은 칸·틀린 차례는 진짜 스키마에서만 드러난다
 *    (이 저장소가 실제로 다친 자리 — 검사 62건이 초록인데 화면이 터졌다).
 *    그래서 아래 ■ 다섯째부터는 **진짜 DB 에 붙어** 돈다. 읽기만 한다 — 한 줄도 안 쓴다.
 *    DB 에 못 붙으면 **실패로 센다.** 「못 봤다」를 초록으로 세면 그게 거짓 초록이다.
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { routineNext, afterUnits, chapterUnits, partsOf, cursorOf, booksOf, STOP } from "../lib/routine.js";
import { fastDb, planFast, CURSORS_FN } from "../lib/fast.js";
import { loadRoster, loadOne } from "../app/today/read.js";

let n = 0, fail = 0;
const ok = (t, good, why = "") => { n++;
  if (good) console.log(`   ✅ ${t}`);
  else { fail++; console.log(`   ❌ ${t}${why ? ` — ${why}` : ""}`); } };
const sec = (t) => console.log(`\n${t}`);

/**
 * 계획 「속도」 절의 **상한 표** — 여기 박아 둔다. 넘으면 실패다.
 * ⚠️ 「페이지 파일 안 조회 수」가 아니라 **진짜 왕복 수**를 센다 (계획이 못 박은 함정).
 */
const 상한 = {
  "/": { 조회: 20, 직렬: 5, 잰다: "scripts/check-screen-home.mjs" },
  "/today": { 조회: 20, 직렬: 4, 잰다: "여기" },
  "/report": { 조회: 6, 직렬: 2, 잰다: "화면이 아직 없다" },
};
/**
 * `routineNext` 한 벌이 써도 되는 몫.
 *
 * ⚠️ **지어낸 숫자가 아니라 짜임새에서 나온 값이다.** 고정 일곱(오늘 · 커서 · 교재 · 검사 ·
 *    그 대단원 줄 · 조각 · 루틴)에 **교재 한 권마다 하나**(다음 자리 `afterUnits`)를 더한 것이다.
 *    다음 자리만 교재마다 따로 묻는 까닭은 그 문의 차례가 곧 커서 차례라 **옮겨 적으면 두 벌**이
 *    되기 때문이다(㊻ · `check-routine2.mjs` ⑪ 이 막는다).
 *    교재마다 따로 묻는 자리가 하나라도 더 살아나면 이 셈을 **바로 넘는다** — 그게 이 상한의 일이다.
 */
const 숙제차리기 = { 고정: 7, 권당: 1, 직렬: 2 };

/** 조회 수와 **직렬 단**을 센다 — 아무것도 안 도는 사이에 새로 시작하면 한 단이다 */
const meter = (c) => {
  let q = 0, tiers = 0, live = 0;
  return {
    q: () => q, tiers: () => tiers,
    query: async (sql, p) => {
      if (!/^\s*(begin|commit|rollback)\b/i.test(String(sql))) { q++; if (live === 0) tiers++; }
      live++;
      try { return await c.query(sql, p); } finally { live--; }
    },
  };
};

// ────────────────────────────────────────────────────────────────
sec("■ ① 못 알아보는 조회는 **옛 길로 간다** (앱이 멈추지 않는다)");
{
  const asked = [];
  const fake = { query: async (sql, p) => { asked.push(String(sql)); return { rows: [] }; } };
  const w = await fastDb(fake, { studentId: null });
  await w.query(`select 1 as x`, []);
  ok("누구인지 모르면 아무것도 미리 안 읽는다", asked.length === 1, `조회 ${asked.length}`);

  /**
   * ⚠️ **미리 읽은 것이 비어 있으면 이 시험은 뜻이 없다.** 처음엔 빈 가짜로 짰다가
   *    「학생 확인」을 일부러 빼도 검사가 안 빨개졌다 — 답할 것이 없어서 늘 옛 길로 갔던 것이다.
   *    그래서 **커서 한 줄이 실제로 담기게** 가짜를 만든다.
   */
  const 나 = "11111111-1111-1111-1111-111111111111";
  const 남 = "22222222-2222-2222-2222-222222222222";
  const 책 = "33333333-3333-3333-3333-333333333333";
  const asked2 = [];
  const fake2 = { query: async (sql, p) => {
    asked2.push(String(sql));
    // ⚠️ 0071 로 `v2.cursors_of(학생, 날짜)` 가 서서 lib 이 그쪽으로 갈아탔다 —
    //    옛 모양(lateral)도 같이 받는다. 한쪽만 보면 갈아타는 날 이 시험이 **헛돈다.**
    if (/from v2\.cursors_of/i.test(String(sql))
        || /from v2\.student_book sb\s+cross join lateral v2\.cursor_of/i.test(String(sql)))
      return { rows: [{ book_id: 책, round: 1, chapter: "CH 1", is_workbook: false, left_in_chapter: 3 }] };
    return { rows: [] };
  } };
  const w2 = await fastDb(fake2, { studentId: 나, on: "2026-09-02" });
  const CURSQL = `select round, chapter, is_workbook, left_in_chapter from v2.cursor_of($1::uuid, $2::uuid)`;
  const mine = await w2.query(CURSQL, [나, 책]);
  ok("미리 읽은 커서를 **그 자리에서** 돌려준다 (이 시험이 헛돌지 않는다)",
     mine.rows[0]?.chapter === "CH 1", JSON.stringify(mine.rows));

  const before = asked2.length;
  await w2.query(`select u.id from v2.units u where u.book_id = $1::uuid`, [책]);
  ok("모르는 문은 그대로 DB 로 넘긴다", asked2.length === before + 1);
  const cur = await w2.query(CURSQL, [남, 책]);
  ok("**다른 아이**를 물으면 미리 읽은 것으로 답하지 않는다 (뒤섞임 막기)",
     asked2.length === before + 2 && cur.rows.length === 0,
     "학생 아이디가 다른데 답하면 **남의 판이 섞인다** — 그 자리에서 DB 로 넘겨야 한다");
  const 딴책 = await w2.query(CURSQL, [나, "44444444-4444-4444-4444-444444444444"]);
  ok("**다른 교재**를 물어도 미리 읽은 것으로 답하지 않는다",
     asked2.length === before + 3 && 딴책.rows.length === 0,
     "교재를 섞으면 그 아이의 진도가 통째로 다른 교재 것이 된다");
}

// ────────────────────────────────────────────────────────────────
sec("■ ② 상한 표가 계획과 같은가 (여기 박아 둔 숫자)");
{
  for (const [k, v] of Object.entries(상한))
    console.log(`   · ${k} — 조회 ${v.조회} · 직렬 ${v.직렬}단   (재는 곳: ${v.잰다})`);
  ok("`/today` 상한이 조회 20 · 4단이다", 상한["/today"].조회 === 20 && 상한["/today"].직렬 === 4);
  ok("`/` 상한이 조회 20 · 5단이다", 상한["/"].조회 === 20 && 상한["/"].직렬 === 5);
  ok("`/report` 상한이 조회 6 · 2단이다", 상한["/report"].조회 === 6 && 상한["/report"].직렬 === 2);
}

// ────────────────────────────────────────────────────────────────
sec("■ ③ 진짜 DB — 옛 길과 새 길이 **글자까지 같은 판**을 내나");
const url = (() => { try { return readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim(); }
                     catch { return null; } })();
if (!url) {
  fail++; n++;
  console.log("   ❌ `.env.local` 의 `DATABASE_URL` 이 없어 **진짜 DB 로 못 돌렸다**");
  console.log("      → 가짜 DB 만 상대하는 검사는 죽은 칸·틀린 차례를 원리적으로 못 잡는다. 초록을 믿지 마라");
} else {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  for (let i = 1; ; i++) { try { await c.connect(); break; }
    catch (e) { if (i >= 4) { console.log("   ❌ DB 에 못 붙었다 —", String(e.message).split("\n")[0]); fail++; n++; break; }
                await new Promise(r => setTimeout(r, 3000)); } }

  const today = (await c.query(`select to_char(v2.today(),'YYYY-MM-DD') as d`)).rows[0].d;
  // 교재가 많은 아이 — **가장 아픈 자리**부터 본다
  const who = (await c.query(
    `select s.id, s.name, count(*)::int as n
       from v2.student_book sb join v2.students s on s.id = sb.student_id
      where sb.from_date <= v2.today() and (sb.to_date is null or sb.to_date >= v2.today())
      group by 1, 2 order by 3 desc, 2 limit 6`)).rows;
  ok(`교재를 든 아이를 찾았다 (${who.map(w => `${w.name} ${w.n}권`).join(" · ")})`, who.length > 0);

  let 최다 = null;
  for (const w of who) {
    const a = meter(c), t0 = Date.now();
    const 옛 = await routineNext(a, { studentId: w.id, on: today });
    const 옛ms = Date.now() - t0;

    const b = meter(c), t1 = Date.now();
    const 새 = await planFast(b, { studentId: w.id, on: today });
    const 새ms = Date.now() - t1;

    const o = JSON.stringify(옛), q = JSON.stringify(새);
    if (o !== q) {
      let i = 0; while (i < o.length && o[i] === q[i]) i++;
      console.log(`        옛: …${o.slice(Math.max(0, i - 90), i + 120)}`);
      console.log(`        새: …${q.slice(Math.max(0, i - 90), i + 120)}`);
    }
    ok(`${w.name}(교재 ${w.n}권) 판이 글자까지 같다  ·  조회 ${a.q()}→${b.q()} · 직렬 ${a.tiers()}→${b.tiers()}단 · ${옛ms}→${새ms}ms`,
       o === q, "옛 길과 답이 다르면 **조용히 틀린 차례**로 나간다 (계획 ㊻)");
    if (!최다 || w.n > 최다.n) 최다 = { ...w, 옛: a, 새: b };
  }

  // ── 옛 길이 **스스로** 같은가 — 같은 `sort` 가 두 줄인 자리가 실제로 있다(실측 3군데)
  if (최다) {
    const x = JSON.stringify(await routineNext(meter(c), { studentId: 최다.id, on: today }));
    const y = JSON.stringify(await routineNext(meter(c), { studentId: 최다.id, on: today }));
    ok("옛 길을 두 번 돌려도 스스로 같다 (같은 `sort` 가 두 줄인 자리 때문에 흔들리지 않는다)",
       x === y, "옛 길이 스스로 흔들리면 위의 맞대기도 뜻이 없다 — `order by u.sort` 에 동점이 있다");
  }

  sec("■ ④ 숙제 차리기 한 벌이 상한 안인가");
  if (최다) {
    const 몫 = 숙제차리기.고정 + 숙제차리기.권당 * 최다.n;
    ok(`\`routineNext\` 한 벌 조회 ${최다.새.q()} ≤ ${몫} (고정 ${숙제차리기.고정} + 교재 ${최다.n}권 · 옛 길 ${최다.옛.q()})`,
       최다.새.q() <= 몫,
       "교재마다 따로 묻는 자리가 살아 있다 — `lib/fast.js` 의 표시가 안 맞는 것이다");
    ok(`\`routineNext\` 한 벌 직렬 ${최다.새.tiers()} ≤ ${숙제차리기.직렬}단 (옛 길 ${최다.옛.tiers()}단)`,
       최다.새.tiers() <= 숙제차리기.직렬);
    ok("옛 길보다 실제로 적게 묻는다", 최다.새.q() < 최다.옛.q(),
       "안 줄었으면 한 판에 읽는 자리가 **한 번도 안 쓰인 것**이다");
  }

  /**
   * ⚠️⚠️ **여기가 이 검사의 심장이다** (계획 ㊻ · 사고 118).
   *
   * 위 ③ 은 「오늘 그 아이의 커서가 서 있는 자리」만 본다. 그런데 커서 자리가 어쩌다
   * 갈래가 안 갈리는 곳이면 **차례가 틀려도 답이 같게 나온다** — 실제로 그랬다:
   * `Q_AFTER` 에서 갈래 정렬(`case when by_chapter and is_workbook …`) 한 줄을 지우고
   * 돌려 봤더니 ③ 이 **6명 전부 초록**이었다. 그 한 줄이 없으면 대단원 기준 교재가
   * **워크북을 건너뛰고 다음 대단원 본책**으로 간다 — 오류도 안 나고 화면도 멀쩡하다.
   *
   * → 그래서 **자리를 하나만 보지 않는다.** 대단원 기준 + 워크북이 있는 교재를 들고 있는
   *   아이마다, 그 교재의 **모든 대단원 × 갈래 둘**을 옛 길과 새 길로 맞대 본다.
   *
   * ⚠️ 지금 `lib/fast.js` 는 다음 자리를 **`afterUnits` 그 함수로** 미리 부른다(차례를 옮겨 적으면
   *    두 벌이 되어 `check-routine2.mjs` ⑪ 이 막는다 — 실제로 한 번 걸렸다). 그래서 여기서 보는 것은
   *    「차례가 같나」가 아니라 **「미리 읽어 둔 것을 엉뚱한 교재·회독에 물려 주지 않나」**다.
   *    교재를 섞어 담으면 여기서 바로 걸린다.
   */
  sec("■ ④-a ㊻ 갈래 차례 — **모든 대단원 × 갈래**를 옛 길과 맞댄다");
  {
    const pairs = (await c.query(
      `select sb.student_id, s.name as stu, sb.book_id, b.name as book
         from v2.student_book sb
         join v2.books b on b.id = sb.book_id
         join v2.students s on s.id = sb.student_id
        where sb.from_date <= v2.today() and (sb.to_date is null or sb.to_date >= v2.today())
          and coalesce(sb.order_basis, b.order_basis) = 'chapter'
          and exists (select 1 from v2.units u
                       where u.book_id = b.id and u.state = 'active' and u.is_workbook)
        order by b.name, s.name limit 4`)).rows;
    ok(`대단원 기준 + 워크북 있는 교재를 든 아이를 찾았다 (${pairs.map(p => `${p.stu}·${p.book}`).join(" · ")})`,
       pairs.length > 0, "이 짝이 없으면 ㊻ 는 **한 번도 안 봐진 것**이다");

    let 어긋남 = 0, 잰자리 = 0, 옛길로샌것 = 0, 워크북건너뜀 = 0, 갈래잰자리 = 0;
    for (const p of pairs) {
      const chapters = (await c.query(
        `select distinct u.chapter from v2.units u
          where u.book_id = $1::uuid and u.state = 'active' order by 1`, [p.book_id])).rows.map(r => r.chapter);
      const fm = meter(c);
      const fdb = await fastDb(fm, { studentId: p.student_id, on: today });
      const cur = await cursorOf(fdb, p.student_id, p.book_id);
      const round = cur.round;
      if (round == null) continue;
      // 그 대단원에 **아직 안 한 워크북 줄**이 몇 줄 남았나 (진도는 DB 가 안다 — 여기서 안 센다)
      const 남은워크북 = new Map((await c.query(
        `select u.chapter, count(*)::int as n
           from v2.units u
          where u.book_id = $1::uuid and u.state = 'active' and u.is_workbook
            and not exists (select 1 from v2.progress g
                             where g.student_id = $2::uuid and g.unit_id = u.id
                               and g.round = $3::smallint and g.status in ('done','skip'))
          group by 1`, [p.book_id, p.student_id, round])).rows.map(r => [`${p.book_id}|${r.chapter}`, r.n]));
      for (const ch of chapters) {
        for (const wb of [false, true]) {
          const args = { studentId: p.student_id, bookId: p.book_id, round,
                         chapter: ch, isWorkbook: wb, orderBasis: "chapter" };
          const 옛 = await afterUnits(c, args);
          const before = fm.q();
          const 새 = await afterUnits(fdb, args);
          잰자리++;
          if (fm.q() !== before) 옛길로샌것++;              // 미리 읽은 것이 안 쓰였다
          if (JSON.stringify(옛) !== JSON.stringify(새)) 어긋남++;
          /**
           * ㊻ 그 자체 — 「대단원 기준인데 **워크북을 건너뛰고 다음 대단원**으로 가면 실패」.
           *
           * ⚠️⚠️ **커서가 실제로 서 있는 자리에서만 본다.** `afterUnits` 는 「지금 자리 뒤」가
           *    아니라 「이 자리를 뺀 나머지에서 **아직 안 한 첫 자리**」를 준다 — 앞 대단원이
           *    안 끝나 있으면 앞으로 간다. 그건 맞는 동작이다(커서는 거길 지나올 수 없다).
           *    그래서 아무 대단원에나 세워 놓고 물으면 **안 난 일로 빨개진다** — 실제로
           *    그렇게 짰다가 32자리가 울렸고, 옛 길도 똑같이 울렸다(내 잘못이 아니라 물음이 틀린 것).
           */
          if (!wb && ch === cur.chapter && cur.isWorkbook !== true &&
              (남은워크북.get(`${p.book_id}|${ch}`) ?? 0) > 0) {
            갈래잰자리++;
            if (!새.todo.length || 새.todo[0].chapter !== ch || 새.todo[0].is_workbook !== true) 워크북건너뜀++;
          }
        }
      }
    }
    ok(`모든 대단원 × 갈래에서 답이 같다 (${잰자리}자리)`, 어긋남 === 0 && 잰자리 > 0,
       `${어긋남}자리가 다르다 — 갈래 정렬이 빠지면 **워크북을 건너뛰고 다음 대단원**으로 간다 (사고 118)`);
    ok("그 자리들이 **미리 읽은 것에서** 나왔다 (옛 길로 새지 않았다)", 옛길로샌것 === 0,
       `${옛길로샌것}자리가 DB 로 다시 물었다 — 맞대기가 뜻이 없어진다(둘 다 옛 길이면 늘 같다)`);
    if (갈래잰자리 === 0)
      console.log("   ⚠️ ㊻ 를 **직접은 못 봤다** — 지금 커서가 「본책 자리 + 그 대단원에 안 한 워크북이 남음」인 아이가 0명이다."
                + "\n        (위 104자리 맞대기가 갈래 정렬을 지키고 있다. 여기 초록이 없다는 것을 알고 있어라)");
    else
      ok(`㊻ — 본책 다음이 **그 대단원의 워크북**이다 (${갈래잰자리}자리 · 커서가 실제로 선 자리에서만)`,
         워크북건너뜀 === 0,
         `${워크북건너뜀}자리 — 「대단원 기준」을 켜도 화면만 그렇고 실제로는 소단원 기준으로 나간다 (사고 118)`);
  }

  /**
   * ⚠️⚠️ **판만 맞대면 못 잡는 것이 있다.**
   *    `Q_CHAPTER` 의 `order by t.i, u.sort` 를 `sort desc` 로 뒤집어 놓고 돌려 봤더니
   *    ③·④-a 가 **전부 초록**이었다 — 덩어리 대부분이 한 줄짜리라 판이 안 바뀐 것이다.
   *    줄이 여럿인 교재가 들어오는 날 조용히 달라진다. 그래서 **받은 줄 자체**를 맞댄다.
   *
   * ⚠️ 다만 `sort` 가 **동점인 줄이 실제로 있다**(실측: 그래머인사이드1 GRAMMAR BASICS —
   *    본책과 워크북이 sort 1·2·3 으로 겹친다). 동점끼리의 앞뒤는 옛 길에서도 안 정해져 있으므로
   *    **`sort` 값의 줄줄이**와 **줄 하나하나의 내용**을 본다 — 동점 뒤바뀜으로는 안 빨개진다.
   */
  sec("■ ④-b 한 판에 받은 **줄 자체**가 옛 길이 준 줄과 같은가");
  {
    const 줄같나 = (a = [], b = []) => {
      if (a.length !== b.length) return `줄 수 ${a.length} ≠ ${b.length}`;
      const sa = a.map(r => String(r.sort)).join(","), sb = b.map(r => String(r.sort)).join(",");
      if (sa !== sb) return `차례가 다르다 (${sa.slice(0, 60)} ≠ ${sb.slice(0, 60)})`;
      const by = (rows) => new Map(rows.map(r => [String(r.id), JSON.stringify(r)]));
      const ma = by(a), mb = by(b);
      for (const [k, v] of ma) if (mb.get(k) !== v) return `줄 내용이 다르다 (${k})`;
      for (const k of mb.keys()) if (!ma.has(k)) return `새 길에만 있는 줄 (${k})`;
      return null;
    };
    let 본자리 = 0, 어긋 = [];
    for (const w of who) {
      const fm = meter(c);
      const fdb = await fastDb(fm, { studentId: w.id, on: today });
      for (const b of await booksOf(fdb, w.id, today)) {
        const cur = await cursorOf(fdb, w.id, b.bookId);
        const round = cur.round ?? b.round;
        // ⚠️ **교재멈춤은 건너뛴다** — `routineNext` 도 그 교재의 줄을 안 묻는다(미리 읽을 까닭이 없다)
        if (cur.chapter == null || round == null || b.stopMode === STOP.BOOK_OFF) continue;
        const args = { studentId: w.id, bookId: b.bookId, chapter: cur.chapter, round };
        const 옛 = await chapterUnits(c, args);
        const 전 = fm.q();
        const 새 = await chapterUnits(fdb, args);
        본자리++;
        if (fm.q() !== 전) { 어긋.push(`${w.name}·${b.name} — 미리 읽은 것이 안 쓰였다`); continue; }
        for (const k of ["todo", "all"]) {
          const why = 줄같나(옛[k], 새[k]);
          if (why) 어긋.push(`${w.name}·${b.name} ${k} — ${why}`);
        }
        // 조각 — 옛 길에는 `order by` 가 없어 **차례를 안 본다.** 줄 내용만 맞댄다
        const ids = 옛.all.map(u => u.id);
        const 키 = (rows) => rows.map(r => JSON.stringify(r)).sort().join("|");
        const po = await partsOf(c, { studentId: w.id, round, unitIds: ids });
        const pn = await partsOf(fdb, { studentId: w.id, round, unitIds: ids });
        if (키(po) !== 키(pn)) 어긋.push(`${w.name}·${b.name} 조각 — 줄이 다르다 (${po.length} vs ${pn.length})`);
      }
    }
    어긋.slice(0, 6).forEach(x => console.log(`        ${x}`));
    ok(`그 대단원 줄·조각이 옛 길과 같다 (${본자리}권)`, 어긋.length === 0 && 본자리 > 0,
       `${어긋.length}군데 — 한 판에 묻는 문이 옛 길과 어긋났다`);
  }

  /**
   * ⚠️⚠️ **지금 자료로는 조각이 0줄이다** — `v2.progress_part` 가 **한 줄도 없다**(실측).
   *    그러면 옛 길도 새 길도 늘 빈 목록을 돌려주니 **맞대 봐도 늘 같다.** 초록이 거짓이 된다
   *    (일부러 「조각을 딴 회독 것으로 준다」로 깨 봤더니 검사가 안 빨개졌다 — 그래서 이 절을 더했다).
   *    → **트랜잭션 안에서 넣고 되돌린다.** 자료는 한 줄도 안 남는다.
   */
  sec("■ ④-c 조각(progress_part) — **진짜 DB 에 넣고 되돌려서** 본다");
  {
    const 총 = (await c.query(`select count(*)::int as n from v2.progress_part`)).rows[0].n;
    console.log(`   · 지금 \`v2.progress_part\` 는 **${총}줄**이다 — 넣지 않으면 이 길을 한 번도 안 지난다`);
    await c.query("begin");
    let 잰것 = null;
    try {
      /**
       * ⚠️ 자리를 **두 가지로** 골라야 한다.
       *   ① 줄이 **셋 이상**인 대단원 — 한 줄짜리에서는 「안 물어본 줄이 안 나오나」를 못 본다.
       *   ② 그 아이가 **회독을 둘 이상** 들고 있을 것 — 안 그러면 한 판에 읽는 문이 그 회독만
       *      가져오므로, 「회독이 섞이나」를 일부러 깨도 **검사가 안 빨개진다**(실제로 그랬다).
       */
      const 여럿 = (await c.query(
        `select s.id, s.name, count(*)::int as n
           from v2.student_book sb join v2.students s on s.id = sb.student_id
          where sb.from_date <= v2.today() and (sb.to_date is null or sb.to_date >= v2.today())
          group by 1, 2 having count(distinct sb.round) > 1
          order by 3 desc limit 6`)).rows;
      if (!여럿.length) console.log("   ⚠️ 회독을 둘 이상 든 아이가 없다 — 「회독이 섞이나」는 못 본다");
      let w = null, b = null, cur = null, round = null, ids = [], 딴회독 = null;
      for (const x of (여럿.length ? 여럿 : who)) {
        for (const y of await booksOf(c, x.id, today)) {
          if (y.stopMode === STOP.BOOK_OFF) continue;
          const k = await cursorOf(c, x.id, y.bookId);
          if (k.chapter == null) continue;
          const r = k.round ?? y.round;
          const rows = (await chapterUnits(c, { studentId: x.id, bookId: y.bookId, chapter: k.chapter, round: r })).all;
          if (rows.length >= 3) { w = x; b = y; cur = k; round = r; ids = rows.map((u) => u.id); break; }
        }
        if (w) break;
      }
      if (!w) throw new Error("줄이 셋 이상인 대단원을 못 찾았다 — 이 절이 헛돈다");
      // ⚠️ 이 아이가 **실제로 들고 있는 딴 회독** — 한 판에 읽는 문이 그것도 가져오는 회독이어야 한다
      딴회독 = (await c.query(
        `select distinct sb.round from v2.student_book sb
          where sb.student_id = $1::uuid and sb.round <> $2::smallint
            and sb.from_date <= v2.today() and (sb.to_date is null or sb.to_date >= v2.today())
          order by 1 limit 1`, [w.id, round])).rows[0]?.round ?? null;
      console.log(`   · ${w.name} · ${b.name} · ${cur.chapter} (${ids.length}줄 · ${round}회독`
                + `${딴회독 == null ? " · ⚠️ 딴 회독 없음" : ` · 딴 회독 ${딴회독}`}) 에 넣어 본다`);
      // 셋을 넣는다 — 둘은 물어볼 줄, 하나는 **안 물어볼 줄**(거르기가 도는지 본다)
      for (let i = 0; i < 3 && i < ids.length; i++)
        await c.query(
          `insert into v2.progress_part (student_id, unit_id, round, page_from, page_to, note)
           values ($1::uuid, $2::uuid, $3::smallint, $4::int, $5::int, $6::text)`,
          [w.id, ids[i], round, 900 + i * 10, 900 + i * 10 + 3, "검사가 넣은 줄 — 되돌린다"]);
      // 딴 회독 것도 하나 (회독이 섞이면 안 된다)
      if (딴회독 != null) await c.query(
        `insert into v2.progress_part (student_id, unit_id, round, page_from, page_to, note)
         values ($1::uuid, $2::uuid, $3::smallint, $4::int, $5::int, $6::text)`,
        [w.id, ids[0], 딴회독, 800, 803, "딴 회독 — 나오면 안 된다"]);

      const fm = meter(c);
      const fdb = await fastDb(fm, { studentId: w.id, on: today });
      const 물을것 = ids.slice(0, 2);
      const 옛 = await partsOf(c, { studentId: w.id, round, unitIds: 물을것 });
      const 전 = fm.q();
      const 새 = await partsOf(fdb, { studentId: w.id, round, unitIds: 물을것 });
      잰것 = { 옛, 새, 샜나: fm.q() !== 전, round, 딴회독 };
    } catch (e) {
      console.log("   ❌ 넣다가 터졌다 —", String(e.message).split("\n")[0]);
      fail++; n++;
    }
    await c.query("rollback");
    const 남았나 = (await c.query(`select count(*)::int as n from v2.progress_part`)).rows[0].n;
    ok(`되돌린 뒤 조각이 그대로다 (${남았나}줄)`, 남았나 === 총, "검사가 자료를 남겼다");
    if (잰것) {
      const 키 = (rows) => rows.map((r) => JSON.stringify(r)).sort().join("|");
      ok(`넣은 조각을 옛 길과 똑같이 돌려준다 (${잰것.새.length}줄)`,
         키(잰것.옛) === 키(잰것.새) && 잰것.새.length === 2,
         `옛 ${잰것.옛.length}줄 · 새 ${잰것.새.length}줄`);
      ok("그 자리들이 **미리 읽은 것에서** 나왔다", 잰것.샜나 === false);
      if (잰것.딴회독 == null)
        console.log("   ⚠️ 딴 회독 조각은 **못 봤다** — 이 아이가 회독을 하나만 들고 있다");
      else
      ok(`**딴 회독**(${잰것.딴회독}회독) 조각이 섞여 나오지 않는다`,
         잰것.새.every((r) => r.page_from >= 900),
         "회독을 안 가르면 지난 회독에 낸 쪽을 「이미 냈다」로 읽어 **오늘 숙제가 빈다**");
      ok("**안 물어본 줄**의 조각은 안 나온다 (거르기가 돈다)", 잰것.새.length === 2);
    }
  }

  sec("■ ⑤ `/today` 한 판 — **진짜 왕복을 센다** (상한 조회 20 · 4단)");
  if (최다) {
    // 지금 화면이 부르는 차례 그대로 (참고용 실측 — 화면은 아직 `lib/fast.js` 를 안 쓴다)
    const asis = meter(c), t0 = Date.now();
    const r0 = await loadRoster(asis, today);
    const d0 = await loadOne(asis, { studentId: 최다.id, on: today });
    console.log(`   · 지금 화면 그대로 — 조회 ${asis.q()} · ${asis.tiers()}단 · ${Date.now() - t0}ms (명단 ${r0.people.length}명)`);

    // `lib/fast.js` 를 쓰는 차례 — 명단과 미리 읽기를 **같이** 돌린다
    const m = meter(c), t1 = Date.now();
    const [fdb, r1] = await Promise.all([
      fastDb(m, { studentId: 최다.id, on: today }),
      loadRoster(m, today),
    ]);
    const d1 = await loadOne(fdb, { studentId: 최다.id, on: today });
    const ms = Date.now() - t1;
    console.log(`   · lib/fast.js 로   — 조회 ${m.q()} · ${m.tiers()}단 · ${ms}ms`);

    ok(`\`/today\` 조회 ${m.q()} ≤ ${상한["/today"].조회}`, m.q() <= 상한["/today"].조회,
       `교재가 늘면 여기가 먼저 터진다 — 지금 여유 ${상한["/today"].조회 - m.q()}건`);
    /**
     * ⚠️⚠️ **직렬 단은 아직 상한을 넘는다. 그 몫이 `lib/fast.js` 가 아니다.**
     *    미리 읽기는 **2단**으로 끝난다(위 ④). 남은 단은 `app/today/read.js` 의 `loadOne` 이
     *    Q_ONE → 숙제 차리기 → `testsToday` → `reportLines` → `failedToday` 를 **차례로**
     *    기다리기 때문이다. 그 셋은 서로 안 기다리므로 `Promise.all` 한 줄이면 붙는다.
     *    ⚠️ **여기서 초록으로 세지 않는다** — 안 고쳐진 것을 초록으로 세면 그게 거짓 초록이다.
     *       고칠 자리가 남의 파일이라 **실패로도 안 센다**(그 판이 짓는 중이다). 숫자만 그대로 띄운다.
     */
    const 내몫 = 2;                                   // 미리 읽기 두 단 (④ 에서 잰 그 값)
    ok(`미리 읽기 몫의 직렬 ${내몫}단 ≤ ${상한["/today"].직렬}단`, 최다.새.tiers() <= 내몫,
       "미리 읽기가 차례로 물으면 여기서 걸린다");
    if (m.tiers() > 상한["/today"].직렬) {
      console.log(`   ⚠️ \`/today\` **직렬 ${m.tiers()}단 — 상한 ${상한["/today"].직렬}단을 넘는다.** 남은 몫은 화면이다:`);
      console.log("        `app/today/read.js` 의 `loadOne` 이 Q_ONE → 숙제 차리기 → 단어시험 셋을 **차례로** 기다린다.");
      console.log("        서로 안 기다리는 것들이라 `Promise.all` 로 묶으면 붙는다 (조회 수는 그대로).");
      console.log("        ⚠️ 이 줄이 보이는 동안 `/today` 는 **아직 합격이 아니다.**");
    } else {
      ok(`\`/today\` 직렬 ${m.tiers()} ≤ ${상한["/today"].직렬}단`, true);
    }
    ok("화면이 받는 것이 옛 길과 글자까지 같다 (명단·한 벌 모두)",
       JSON.stringify(r0) === JSON.stringify(r1) && JSON.stringify(d0) === JSON.stringify(d1));
    // ⚠️ 합격선은 0.5초다 (원장님 2026-09-01). 재는 곳이 원장님 자리가 아니라 **참고로만** 적는다
    console.log(`   · 합격선 0.5초 — 여기서 잰 것은 ${ms}ms (내 기계에서 서울 DB 까지. 원장님 자리와 다르다)`);
  }

  /**
   * ⚠️⚠️ **「직렬 단」을 빨라진 것으로 읽지 마라 — 문 하나로는 안 겹친다.**
   *    `app/today/db.js` 는 요청마다 `pg.Client` **하나**를 연다. node-postgres 는 한 문에서
   *    조회를 **줄 세워** 보낸다 — `Promise.all` 로 묶어도 왕복은 그대로 차례차례다.
   *    아래에서 **진짜로 재서** 띄운다. 그러니 지금 체감을 줄이는 것은 **조회 수**이고
   *    직렬 단은 「문을 여럿 열면 그때 붙는다」는 **앞으로의 몫**이다. 지어내지 않는다(대전제 0).
   */
  sec("■ ⑤-a ⚠️ 문 하나로 같이 부르면 정말 겹치나 — **재 본다**");
  {
    const 잠깐 = () => c.query(`select pg_sleep(0.05)`);
    let t = Date.now(); await Promise.all([잠깐(), 잠깐(), 잠깐()]); const 같이 = Date.now() - t;
    t = Date.now(); for (let i = 0; i < 3; i++) await 잠깐(); const 차례 = Date.now() - t;
    console.log(`   · 0.05초짜리 셋 — 같이 ${같이}ms · 차례로 ${차례}ms`);
    const 겹치나 = 같이 < 차례 * 0.8;
    console.log(겹치나
      ? "   · 문이 겹친다 — 직렬 단을 줄인 만큼 체감이 준다"
      : "   ⚠️ **안 겹친다.** `pg.Client` 하나는 조회를 줄 세워 보낸다 —\n"
      + "        `Promise.all` 로 묶어도 왕복은 차례차례다. 지금 체감을 줄이는 것은 **조회 수뿐**이고,\n"
      + "        「직렬 N단」은 문을 여럿 열었을 때 비로소 붙는다. 초록을 그렇게 읽지 마라.");
  }

  sec("■ ⑥ DB 함수가 생기면 **lib 이 그것을 쓰는가**");
  {
    const has = (await c.query(`select to_regprocedure($1::text) is not null as has`, [CURSORS_FN])).rows[0].has === true;
    // ⚠️ **SQL 에서 부르는가**를 본다 — 이름이 주석이나 상수에 적힌 것은 부르는 것이 아니다
    const src = readFileSync("lib/fast.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const uses = /from\s+v2\.cursors_of\s*\(/i.test(src);
    if (!has) console.log(`   · \`${CURSORS_FN}\` 은 아직 DB 에 없다 — 지금은 \`v2.cursor_of\` 를 lateral 로 부른다 (왕복 하나로 같다)`);
    ok(`DB 에 \`${CURSORS_FN}\` 이 있으면 lib 도 그것을 부른다`, has ? uses : !uses,
       has ? "함수는 섰는데 lib 이 아직 옛 길이다 — 보고의 needsDb 를 돌린 뒤 `lib/fast.js` 를 갈아 끼워라"
           : "아직 없는 함수를 lib 이 미리 부르면 `scripts/check-sql.mjs` 가 그 자리에서 빨개진다");
  }

  await c.end();
}

console.log(`\n■ 속도 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
