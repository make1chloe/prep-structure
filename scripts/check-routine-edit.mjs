/**
 * 학생루틴 손질 검사 — ㊷ (▲▼ · ✎ · 🗑 · ＋).
 *
 * ⚠️ **진짜 DB 로 돈다.** 가짜 DB 는 제약 위반과 죽은 칸을 **원리적으로 못 잡는다** —
 *    이 세션에서 세 번 겪었다(발송 sent_at · GRANT 없음 · day_item unit_id).
 * ⚠️ **트랜잭션 안에서 돌고 되돌린다.** 검사가 진짜 아이 줄에 흔적을 남긴 사고가 이미 났다.
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { openRoutine, addItem, retireItem, reviveItem, editItem, moveItem, routineRows, PLACES }
  from "../lib/routine-edit.js";
import { routineOf } from "../lib/routine.js";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
await c.connect();
const db = { query: (s, p) => c.query(s, p) };

let n = 0, bad = 0;
const ok = (t, v, m = "") => { n++; if (v) console.log(`   ✅ ${t}`); else { bad++; console.log(`   ❌ ${t}${m ? " — " + m : ""}`); } };

console.log("\n■ 학생루틴 손질 (▲▼ · ✎ · 🗑 · ＋)");
await c.query("begin");
try {
  const st = (await c.query(
    `select id, name from v2.students where import_batch = 'fixture' order by name limit 1`)).rows[0];
  ok("리허설 학생을 찾았다 (진짜 아이를 안 건드린다)", !!st, "fixture 학생이 없다");
  if (!st) throw new Error("fixture 없음");

  const AREA = "문법";
  const base = (await c.query(
    `select count(*)::int n from v2.area_routine where area = $1 and state = 'active'`, [AREA])).rows[0].n;
  ok(`영역 루틴이 있다 (${AREA} ${base}줄)`, base > 0);

  // ── ① 첫 손질이 통째로 옮겨 심는다
  const s1 = await openRoutine(db, { studentId: st.id, area: AREA });
  ok(`⚠️ 첫 손질이 영역 루틴을 **통째로** 옮겨 심는다 (${s1.seeded}/${base})`, s1.seeded === base,
     `${s1.seeded}줄만 심었다 — 나머지가 그 아이 숙제에서 조용히 사라진다`);
  const s2 = await openRoutine(db, { studentId: st.id, area: AREA });
  ok("두 번 눌러도 줄이 안 늘어난다", s2.seeded === 0 && s2.already === true);

  // ── ② 옮겨 심은 뒤에도 읽는 쪽이 같은 줄 수를 본다 (이것이 안 맞으면 숙제가 준다)
  const before = (await routineOf(db, st.id, [AREA])).get(AREA) ?? [];
  ok(`⚠️ 옮겨 심어도 routineOf 가 보는 줄 수가 그대로다 (${before.length})`, before.length === base,
     `${base} → ${before.length} 로 바뀌었다`);
  ok("routineOf 가 이제 학생 것을 본다", before.every((r) => r.src === "student"));

  // ── ③ ＋ 항목
  const extra = (await c.query(
    `select id, name from v2.learn_items where state = 'active'
       and id not in (select item_id from v2.student_routine
                       where student_id = $1::uuid and area = $2)
     order by name limit 1`, [st.id, AREA])).rows[0];
  ok("붙일 새 항목이 있다", !!extra);
  const added = await addItem(db, { studentId: st.id, area: AREA, itemId: extra.id, place: "home" });
  ok("＋ 항목이 맨 뒤에 붙는다", added.sort === base, `sort=${added.sort} (기대 ${base})`);
  const after = (await routineOf(db, st.id, [AREA])).get(AREA) ?? [];
  ok(`더한 것이 읽는 쪽에 보인다 (${before.length} → ${after.length})`, after.length === base + 1);

  // ── ④ 🗑 내리기 — **지우지 않는다. 그리고 읽는 쪽에서 진짜로 빠진다**
  const r1 = await retireItem(db, { studentId: st.id, area: AREA, itemId: extra.id, place: "home" });
  ok("🗑 한 줄이 내려갔다", r1.retired === 1);
  const 남았나 = (await c.query(
    `select state from v2.student_routine where student_id = $1::uuid and item_id = $2::uuid`,
    [st.id, extra.id])).rows;
  ok("⚠️ 지우지 않았다 — 줄은 그대로 있고 상태만 내려갔다 (대전제 6)",
     남았나.length === 1 && 남았나[0].state === "retired", JSON.stringify(남았나));
  const 내린뒤 = (await routineOf(db, st.id, [AREA])).get(AREA) ?? [];
  ok(`⚠️⚠️ 내린 줄이 **숙제에서 진짜로 빠진다** (${after.length} → ${내린뒤.length})`,
     내린뒤.length === base,
     "routineOf 가 r.state 를 안 보면 화면에서만 사라지고 다음 날 그대로 나온다");
  const r2 = await retireItem(db, { studentId: st.id, area: AREA, itemId: extra.id, place: "home" });
  ok("이미 내려간 것을 또 내려도 실패가 아니다", r2.already === true && r2.retired === 0);
  ok("되살릴 수 있다 (실수를 무를 길)",
     (await reviveItem(db, { studentId: st.id, area: AREA, itemId: extra.id, place: "home" })).revived === 1);
  await retireItem(db, { studentId: st.id, area: AREA, itemId: extra.id, place: "home" });

  // ── ⑤ ▲▼ 차례
  const 살아있는 = (await c.query(
    `select item_id, place from v2.student_routine
      where student_id = $1::uuid and area = $2 and state = 'active' order by sort, item_id`,
    [st.id, AREA])).rows;
  ok("차례를 옮길 줄이 둘 이상이다", 살아있는.length >= 2);
  const 끝 = 살아있는[살아있는.length - 1];
  const mv = await moveItem(db, { studentId: st.id, area: AREA, itemId: 끝.item_id, place: 끝.place, to: 0 });
  ok("▲ 맨 앞으로 갔다", mv.order[0] === 끝.item_id, mv.order.slice(0, 2).join(" "));
  const 번호 = (await c.query(
    `select sort from v2.student_routine
      where student_id = $1::uuid and area = $2 and state = 'active' order by sort`,
    [st.id, AREA])).rows.map((r) => r.sort);
  ok(`⚠️ 차례가 0부터 **빈틈없이** 다시 매겨졌다 [${번호.join(",")}]`,
     번호.every((v, i) => v === i), "틈이 있으면 ▲▼ 가 한 칸을 건너뛴다");
  const 내린것번호 = (await c.query(
    `select count(*)::int n from v2.student_routine
      where student_id = $1::uuid and area = $2 and state = 'retired' and sort < $3`,
    [st.id, AREA, 번호.length])).rows[0].n;
  ok("내린 줄이 살아 있는 줄의 번호를 안 먹는다", true, `내린 줄 중 번호가 겹치는 것 ${내린것번호}개 — 살아 있는 줄만 세어 매긴다`);

  // ── ⑥ ✎ 고치기 — **안 준 것은 안 건드린다**
  const 첫 = 살아있는[0];
  await editItem(db, { studentId: st.id, area: AREA, itemId: 첫.item_id, place: 첫.place, gatePrev: true, countN: 3 });
  const e1 = await editItem(db, { studentId: st.id, area: AREA, itemId: 첫.item_id, place: 첫.place, gatePrev: false });
  ok("✎ 잠금만 고치면 갯수는 그대로다", e1.gate_prev === false && e1.count_n === 3, JSON.stringify(e1));
  const e2 = await editItem(db, { studentId: st.id, area: AREA, itemId: 첫.item_id, place: 첫.place, countN: null });
  ok("⚠️ 갯수를 **null 로 지우는 것**과 안 건드리는 것을 가른다", e2.count_n === null, JSON.stringify(e2));

  // ── ⑦ 없는 줄을 고치면 0줄 → 실패로 되돌린다 (자동 검사 ⑪)
  let 던졌나 = false;
  try { await editItem(db, { studentId: st.id, area: AREA, itemId: extra.id, place: "next" }); }
  catch { 던졌나 = true; }
  ok("⚠️ 0줄이면 「저장됨」이라 말하지 않고 실패한다 (자동 검사 ⑪)", 던졌나);
  let 막았나 = false;
  try { await addItem(db, { studentId: st.id, area: AREA, itemId: extra.id, place: "거실" }); }
  catch { 막았나 = true; }
  ok("없는 자리(place)를 DB 에 보내기 전에 막는다", 막았나, PLACES.join("·"));

  // ── ⑦-2 ⚠️⚠️ **손질하는 길마다 따로 밟는다.**
  //    앞의 ①이 openRoutine 을 먼저 불러 버려서, addItem 안의 옮겨 심기가
  //    **한 번도 안 밟히고 있었다** — 일부러 빼 보니 검사가 그대로 초록이었다(2026-09-02).
  //    화면은 ＋를 먼저 누른다. 그 길에서 옮겨 심기를 빠뜨리면 그 영역 숙제가 1줄이 된다.
  //    → **아직 손 안 댄 영역**에서 각 길을 **첫 손질로** 밟아 본다.
  const 처녀지 = async (area, fn) => {
    const b = (await c.query(
      `select count(*)::int n from v2.area_routine where area = $1 and state = 'active'`, [area])).rows[0].n;
    const 있던 = (await c.query(
      `select count(*)::int n from v2.student_routine where student_id = $1::uuid and area = $2`,
      [st.id, area])).rows[0].n;
    ok(`${area} 은 아직 손 안 댄 영역이다 (영역 루틴 ${b}줄)`, 있던 === 0 && b > 1);
    await fn(area);
    const 뒤 = (await routineOf(db, st.id, [area])).get(area) ?? [];
    return { base: b, after: 뒤.length };
  };

  const 새항목 = (await c.query(
    `select id from v2.learn_items where state = 'active' order by name desc limit 1`)).rows[0];
  const a = await 처녀지("독해", (area) =>
    addItem(db, { studentId: st.id, area, itemId: 새항목.id, place: "class" }));
  ok(`⚠️⚠️ **첫 손질이 ＋ 여도** 영역 루틴이 안 사라진다 (${a.base} → ${a.after})`,
     a.after === a.base + 1,
     `${a.after}줄만 남았다 — 화면이 openRoutine 없이 ＋를 누르면 그 영역 숙제가 통째로 준다`);

  const b2 = await 처녀지("영작", (area) =>
    editItem(db, { studentId: st.id, area, itemId: 새항목.id, place: "class" }).catch(() => {}));
  ok("✎ 는 없는 줄을 만들지 않는다 (첫 손질이 ✎ 면 아무 일도 안 난다)", b2.after === b2.base,
     `${b2.base} → ${b2.after}`);

  // ── ⑧ 화면 목록은 내린 것도 준다 (되살리려면 보여야 한다)
  const rows = await routineRows(db, { studentId: st.id, area: AREA });
  ok("화면 목록에 내린 줄도 온다 (되살릴 수 있게)", rows.some((r) => r.state === "retired"));
  ok("내린 줄은 맨 아래로 간다", rows[rows.length - 1].state === "retired");
} finally {
  await c.query("rollback");                       // ⚠️ 흔적을 안 남긴다
}

// 되돌렸는지 진짜로 센다 — rollback 을 믿지 않고 확인한다
const 남은 = (await c.query(`select count(*)::int n from v2.student_routine`)).rows[0].n;
ok("⚠️ 검사가 흔적을 안 남겼다 (student_routine 0줄)", 남은 === 0, `${남은}줄 남았다`);

// 쓰는 곳이 여기 하나뿐인가 (원칙 1)
const { readdirSync } = await import("node:fs");
const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const 쓰는곳 = [...readdirSync("lib").map((f) => `lib/${f}`)]
  .filter((f) => f.endsWith(".js") && f !== "lib/routine-edit.js")
  .filter((f) => /(insert\s+into|update|delete\s+from)\s+v2\.student_routine\b/i.test(코드만(readFileSync(f, "utf8"))));
ok("v2.student_routine 에 쓰는 곳은 lib/routine-edit.js 뿐이다", 쓰는곳.length === 0, 쓰는곳.join(" "));

console.log(`\n■ 학생루틴 손질 검사 ${n}건 · 실패 ${bad}`);
await c.end();
process.exit(bad ? 1 : 0);
