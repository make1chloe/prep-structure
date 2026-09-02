/**
 * 아이의 「다 했어요」 — **누가 무엇을 쓸 수 있나 · 누가 무엇을 볼 수 있나**
 * (0082 · 0084 · 원칙-1 · 표-9 · 표-10 · 사고 #7).
 *
 * ⚠️ **진짜 DB 로 돈다.** 이 자리는 권한 벽이라 가짜 DB 로는 원리적으로 못 본다 —
 *    벽을 한 번도 안 밟기 때문이다.
 * ⚠️ 트랜잭션 안에서 돌고 되돌린다. `import_batch='fixture'` 줄로만 쓴다.
 * ⚠️ 터져도 되돌린다 — uncaughtException·unhandledRejection 에도 rollback 을 건다.
 *
 * 2026-09-03 에 더한 것 (규칙-어긋난곳 ⑱ · ㉑ · ⑮)
 *   · **학원 줄(slot='class')에도 아이가 찍는다** — 안 되면 둘째 줄부터 영영 안 열린다
 *   · **학부모는 못 찍는다** — 원장님 「절대안돼」. 앱 길이 아니라 **DB 문**을 밟는다
 *   · **마감 안 한 판을 아이는 보고 학부모는 못 본다** — 사고 #7 의 방벽은 학부모 쪽에만 있다
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
await c.connect();

// ⚠️ 무슨 일이 나도 되돌린다 — 던지고 죽으면 fixture 줄이 진짜 DB 에 남는다
const 되돌리고죽기 = async (e) => {
  try { await c.query("rollback"); } catch {}
  console.log("   ❌ 검사가 터졌다 —", String(e?.message ?? e).split("\n")[0]);
  try { await c.end(); } catch {}
  process.exit(1);
};
process.on("uncaughtException", 되돌리고죽기);
process.on("unhandledRejection", 되돌리고죽기);

let n = 0, bad = 0;
const ok = (t, v, m = "") => { n++; console.log(v ? `   ✅ ${t}` : (bad++, `   ❌ ${t}${m ? " — " + m : ""}`)); };
const 해 = async (sql, par) => {
  await c.query("savepoint s");
  try { const r = await c.query(sql, par); await c.query("release savepoint s"); return { 됨: true, 줄: r.rowCount }; }
  catch (e) { await c.query("rollback to s"); return { 됨: false, 왜: e.message.split("\n")[0] }; }
};
const 셈 = async (sql, par) => {
  await c.query("savepoint s");
  try { const r = await c.query(sql, par); await c.query("release savepoint s"); return { 됨: true, 줄: r.rows.length }; }
  catch (e) { await c.query("rollback to s"); return { 됨: false, 줄: -1, 왜: e.message.split("\n")[0] }; }
};

console.log("\n■ 아이 「다 했어요」 ↔ 원장님 ○ — 다른 칸인가 · 누구까지 여는가");
await c.query("begin");
try {
  // ⚠️ **학부모가 이어진 리허설 아이**를 먼저 고른다 — 안 그러면 학부모 걸음이 통째로 안 돈다.
  //    (실측: fixture 아이 둘 중 `zz_시험_남의아이` 에는 학부모가 없다. 이름순으로 집으면 그 아이가 뽑힌다)
  const st = (await c.query(
    `select s.id, s.profile_id from v2.students s
      where s.import_batch = 'fixture' and s.profile_id is not null
      order by (exists (select 1 from v2.parent_student ps where ps.student_id = s.id)) desc, s.name
      limit 1`)).rows[0];
  // ⚠️ 학부모는 **그 아이에게 이어진 사람**이어야 뜻이 있다 — 아무 학부모나 쓰면 늘 0줄이라 헛통과한다
  const 학부모 = (await c.query(
    `select ps.parent_profile_id id from v2.parent_student ps
      join v2.profiles p on p.id = ps.parent_profile_id and p.role='parent' and p.state='active'
      where ps.student_id = $1 limit 1`, [st.id])).rows[0];
  const 원장 = (await c.query(
    `select id from v2.profiles where role in ('principal','instructor') and state='active'
      order by (role='principal') desc limit 1`)).rows[0];
  ok("리허설 아이 · 그 아이의 학부모 · 원장 계정을 찾았다", !!st && !!학부모 && !!원장,
     JSON.stringify({ 아이: !!st, 학부모: !!학부모, 원장: !!원장 }));
  // ⚠️ **못 밟았으면 초록을 주지 않는다**(대전제-0) — 셋 중 하나라도 없으면 여기서 끝낸다
  if (!st || !학부모 || !원장) throw new Error("리허설 계정이 모자라 학부모 걸음을 못 밟는다");

  const u = (await c.query(`select id from v2.units where state='active' limit 1`)).rows[0];
  const it = (await c.query(`select id from v2.learn_items where state='active' limit 1`)).rows[0];

  // ⚠️ **마감하지 않은 판**으로 시작한다 — 0084 의 「아이는 등원하면 바로 본다」를 밟으려면 그래야 한다
  let sh = (await c.query(`select id from v2.day_sheet where student_id=$1 and date=v2.today()`, [st.id])).rows[0];
  if (!sh) sh = (await c.query(`insert into v2.day_sheet (student_id,date,attend,import_batch)
     values ($1,v2.today(),'present','fixture') returning id`, [st.id])).rows[0];
  else await c.query(`update v2.day_sheet set closed_at=null where id=$1`, [sh.id]);

  const 집 = (await c.query(`insert into v2.day_item (sheet_id,slot,item_id,unit_id,range_note,sort)
     values ($1,'home',$2,$3,'1-10쪽',77) returning id`, [sh.id, it.id, u.id])).rows[0];
  // ⚠️ **학원 줄을 반드시 하나 둔다** — 이 줄이 없으면 ⑱ 의 경로가 아예 안 돈다(폰-5)
  const 학원 = (await c.query(`insert into v2.day_item (sheet_id,slot,item_id,unit_id,range_note,sort)
     values ($1,'class',$2,$3,'11-20쪽',78) returning id`, [sh.id, it.id, u.id])).rows[0];

  let 지금누구 = null;
  const 되기 = async (id) => {
    지금누구 = id;
    await c.query(`select set_config('request.jwt.claims', '{"sub":"${id}","role":"authenticated"}', true)`);
    await c.query("set local role authenticated");
  };
  const 서버로 = async () => {
    지금누구 = null;
    await c.query("reset role");
    await c.query(`select set_config('request.jwt.claims','',true)`);
  };
  /**
   * **서버 눈으로** 한 줄 읽고 원래 손으로 돌아온다.
   * ⚠️ 왜 필요한가 — 접근 규칙이 막히면 아이 손으로는 그 줄이 **0줄**로 온다.
   *    그러면 `rows[0].said_done_at` 이 터져서 검사가 「빨간 줄」이 아니라 **crash** 로 죽는다.
   *    무엇이 틀렸는지 못 말하는 검사는 없느니만 못하다(대전제-0). 그래서 확인은 서버 눈으로 한다.
   */
  const 서버값 = async (sql, par) => {
    const 앞 = 지금누구;
    await 서버로();
    const r = await c.query(sql, par);
    if (앞) await 되기(앞);
    return r.rows[0] ?? null;
  };

  /* ══ 아이 ══════════════════════════════════════════════════════ */
  await 되기(st.profile_id);

  // ── ⑮ 마감 전에도 제 판을 본다 (원장님 2026-09-03 「출석하면 바로」)
  ok("⚠️ 아이는 **마감 안 한 제 판**을 본다 (0084)",
     (await 셈(`select id from v2.day_sheet where id=$1`, [sh.id])).줄 === 1,
     "안 보이면 아이는 마감할 때까지 오늘 할 것을 못 본다");
  ok("아이는 마감 안 한 판의 **줄도** 본다",
     (await 셈(`select id from v2.day_item where sheet_id=$1`, [sh.id])).줄 === 2);

  // ── ② 원장님 ○ 은 원장님 것이다
  //    ⚠️ 「거절됐나」가 아니라 **「값이 진짜 안 바뀌었나」**를 본다. 줄이 안 보여 0줄로 지나가는 것도
  //       막힌 것이긴 하지만, 우리가 지켜야 하는 것은 **status 가 아이 손에 안 바뀌는 것**이다.
  const 동그라미못준다 = async (id, 어디) => {
    const r = await 해(`update v2.day_item set status='done' where id=$1`, [id]);
    const 뒤 = await 서버값(`select status from v2.day_item where id=$1`, [id]);
    ok(`⚠️⚠️ 아이가 ${어디}에서 **원장님 ○ 을 스스로 못 준다** (예전에는 됐다 — 검사 목록에서 사라졌다)`,
       (r.됨 === false || r.줄 === 0) && 뒤?.status !== "done",
       JSON.stringify({ ...r, 뒤: 뒤?.status ?? null }));
  };
  await 동그라미못준다(집.id, "집 줄");
  await 동그라미못준다(학원.id, "학원 줄");

  // ── ① 집 줄
  ok("아이가 집 줄에 「다 했어요」를 누를 수 있다",
     (await 해(`update v2.day_item set said_done_at=now() where id=$1`, [집.id])).됨 === true);

  // ── ⑱ 학원 줄 — 여기가 오늘 고친 자리다
  const 학원찍기 = await 해(`update v2.day_item set said_done_at=now() where id=$1`, [학원.id]);
  ok("⚠️⚠️ 아이가 **학원 줄(slot=class)에도** 「다 했어요」를 누른다 (0084 · ⑱)",
     학원찍기.됨 === true && 학원찍기.줄 === 1, JSON.stringify(학원찍기));
  ok("학원 줄에 시각이 진짜로 찍혔다 (차례를 여는 것이 이 칸이다)",
     (await 서버값(`select said_done_at a from v2.day_item where id=$1`, [학원.id]))?.a != null);

  // ── 표-10 시각은 서버가 정한다
  const 값 = (await 서버값(`select said_done_at a from v2.day_item where id=$1`, [집.id]))?.a;
  await 해(`update v2.day_item set said_done_at='2020-01-01' where id=$1`, [집.id]);
  const 값2 = (await 서버값(`select said_done_at a from v2.day_item where id=$1`, [집.id]))?.a;
  ok("⚠️ **시각은 서버가 정한다** — 아이가 보낸 값을 안 믿는다 (표-10)",
     값2 != null && !String(값2).includes("2020"), String(값2));
  ok("이미 누른 것은 시각이 안 바뀐다", 값 != null && String(값) === String(값2));
  ok("⚠️ 아이 손으로는 **못 내린다** (원장님께 말씀드려야 한다)",
     (await 해(`update v2.day_item set said_done_at=null where id=$1`, [집.id])).됨 === false);
  ok("⚠️⚠️ **그 칸만 빼고 비교한다** — 범위를 몰래 못 고친다 (표-9)",
     (await 해(`update v2.day_item set said_done_at=now(), range_note='1-100쪽' where id=$1`, [집.id])).됨 === false);
  const 남 = await 해(`update v2.day_item set said_done_at=now() where sheet_id <> $1`, [sh.id]);
  ok("남의 줄은 한 줄도 못 건드린다", 남.됨 === true && 남.줄 === 0, JSON.stringify(남));

  /* ══ 학부모 — 원장님 「절대안돼」 (㉑) ═══════════════════════════ */
  await 되기(학부모.id);
  ok("⚠️⚠️ 학부모는 **마감 안 한 판을 못 본다** (사고 #7 — 유일하게 밖으로 샌 사고)",
     (await 셈(`select id from v2.day_sheet where id=$1`, [sh.id])).줄 === 0);
  ok("학부모는 마감 안 한 판의 줄도 못 본다",
     (await 셈(`select id from v2.day_item where sheet_id=$1`, [sh.id])).줄 === 0);

  // ⚠️ **아직 안 누른 줄**로 밟는다 — 이미 찍힌 줄이면 문지기가 「시각 안 바뀜」으로 지나가
  //    0줄이 아니라 1줄이 되어 **헛통과**한다(폰-5 ②)
  const 새줄 = (await c.query(`select id from v2.day_item where sheet_id=$1 and said_done_at is null limit 1`, [sh.id])).rows;
  await 서버로();
  const 안찍힌 = 새줄.length ? 새줄[0]
    : (await c.query(`insert into v2.day_item (sheet_id,slot,item_id,unit_id,sort)
        values ($1,'next',$2,$3,79) returning id`, [sh.id, it.id, u.id])).rows[0];
  await 되기(학부모.id);
  const 부모찍기 = await 해(`update v2.day_item set said_done_at=now() where id=$1`, [안찍힌.id]);
  ok("⚠️⚠️ **학부모는 「다 했어요」를 못 누른다** (0줄 또는 거절) — 원장님 「절대안돼」",
     부모찍기.됨 === false || 부모찍기.줄 === 0, JSON.stringify(부모찍기));

  /* ══ 마감한 뒤 — 학부모는 보되 여전히 못 누른다 ═════════════════ */
  await 서버로();
  await c.query(`update v2.day_sheet set closed_at=now() where id=$1`, [sh.id]);
  await 되기(학부모.id);
  ok("마감하면 학부모도 판을 본다 (여기는 그대로다)",
     (await 셈(`select id from v2.day_sheet where id=$1`, [sh.id])).줄 === 1);
  const 부모찍기2 = await 해(`update v2.day_item set said_done_at=now() where id=$1`, [안찍힌.id]);
  ok("⚠️ **마감 뒤에도** 학부모는 못 누른다",
     부모찍기2.됨 === false || 부모찍기2.줄 === 0, JSON.stringify(부모찍기2));

  /* ══ 원장님 ═══════════════════════════════════════════════════ */
  await 되기(원장.id);
  ok("원장님은 검사 ○ 을 준다",
     (await 해(`update v2.day_item set status='done' where id=$1`, [집.id])).됨 === true);
  const 둘 = await 서버값(
    `select status, said_done_at is not null said from v2.day_item where id=$1`, [집.id]);
  ok("⚠️⚠️ **두 사실이 따로 남는다** (한 칸에 두 뜻이 아니다 — 원칙-1)",
     둘?.status === "done" && 둘?.said === true, JSON.stringify(둘));

  /* ══ 서버 (검사·마이그레이션) ══════════════════════════════════ */
  await 서버로();
  ok("⚠️ jwt 없는 자리(검사·마이그레이션)는 **안 막힌다** — 막으면 검사가 통째로 죽는다",
     (await 해(`update v2.day_item set range_note='서버' where id=$1`, [집.id])).됨 === true);
} finally { await c.query("rollback").catch(() => {}); }

/* ── 되돌린 뒤 **정말 안 남았는지 세어서** 확인한다 ─────────────── */
{
  const 남은 = (await c.query(`select count(*)::int n from v2.day_item where said_done_at is not null`)).rows[0].n;
  ok("⚠️ 검사가 「다 했어요」 흔적을 안 남겼다", 남은 === 0, `${남은}줄`);
  const 판 = (await c.query(`select count(*)::int n from v2.day_sheet where closed_at is not null`)).rows[0].n;
  ok("⚠️ 검사가 판을 마감한 채로 두지 않았다", 판 === 0, `${판}판`);
  const 줄 = (await c.query(
    `select count(*)::int n from v2.day_item where range_note in ('1-10쪽','11-20쪽','서버')`)).rows[0].n;
  ok("⚠️ 검사가 만든 day_item 이 안 남았다", 줄 === 0, `${줄}줄`);
}

/* ── 접근 규칙이 진짜 그렇게 서 있나 (문서가 아니라 **DB 를** 읽는다) ── */
{
  const p = (await c.query(
    `select qual, with_check from pg_policies
      where schemaname='v2' and tablename='day_item' and policyname='child_said'`)).rows[0];
  ok("child_said 정책이 서 있다", !!p);
  const 둘 = `${p?.qual ?? ""} ${p?.with_check ?? ""}`;
  ok("⚠️ 정책이 **학원 줄(class)을 연다** (⑱)", /'class'/.test(둘), 둘);
  ok("⚠️ 정책이 **sheet_mine** 을 쓴다 — 학부모가 안 든다 (㉑)",
     /sheet_mine/.test(둘) && !/sheet_visible\s*\(/.test(둘),
     "sheet_visible 은 my_students() 를 지나 **학부모가 든다**");

  const s = (await c.query(
    `select qual from pg_policies where schemaname='v2' and tablename='day_sheet' and policyname='own_sheet'`)).rows[0];
  ok("⚠️ 판 읽기 규칙이 **가르는 함수 한 벌**을 지난다 (원칙-1)",
     /sheet_visible_to/.test(s?.qual ?? ""), s?.qual ?? "없음");
  const 두벌 = (await c.query(
    `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='v2' and p.proname='sheet_visible_to'`)).rows[0].n;
  ok("가르는 함수가 **한 개**다 (두 벌이면 잣대가 갈린다)", 두벌 === 1, `${두벌}개`);
}

/* ── 앱이 옛 칸을 다시 쓰지 않는가 ─────────────────────────────── */
{
  const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const me = 코드만(readFileSync("app/me/actions.js", "utf8"));
  ok("⚠️ 아이 화면이 `status` 를 **안 쓴다** (그 칸은 원장님 것이다)",
     !/update\([^)]*status\s*:/.test(me) && /said_done_at/.test(me),
     "아이 화면이 status 를 쓰면 0082 를 통째로 무르는 것이다");
  ok("⚠️ 「다 했어요」가 DB 가 정한 시각을 **돌려준다** (⑰ — 받아 놓고 버리면 화면이 안 바뀐다)",
     /return\s*\{\s*ok:\s*true,\s*said_done_at/.test(me));
  const day = 코드만(readFileSync("lib/day.js", "utf8"));
  ok("⚠️ 다시 굳혀도 **아이가 누른 줄은 안 건드린다**",
     /said_done_at is null/.test(day),
     "안 넣으면 아이가 「1-10쪽 다 했어요」 한 뒤 범위가 바뀌어도 아무도 못 알아챈다");
}

console.log(`\n■ 아이 「다 했어요」 검사 ${n}건 · 실패 ${bad}`);
await c.end();
process.exit(bad ? 1 : 0);
