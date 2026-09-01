/**
 * 접근 규칙 검사 — 학생·학부모인 척해서 **남의 것이 0줄인지** 본다.
 *
 * 계획의 자동 검사 ⑧. 화면을 못 믿는 까닭은 간단하다 —
 * 화면은 안 보여줘도 **DB 가 주면 새는 것**이다.
 *
 * ⚠️ 읽기만 한다. SET ROLE + SELECT 뿐이고 아무것도 안 고친다.
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl:{rejectUnauthorized:false} });

const bad = [];
const ok  = [];

/** 그 사람인 척하고 한 번 물어본다 */
async function asUser(profileId, sql, params=[]) {
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: profileId, role: "authenticated" })]);
  await c.query("select set_config('role','authenticated',true)");
  await c.query("set local role authenticated");
  let rows;
  try { rows = (await c.query(sql, params)).rows; }
  finally { await c.query("rollback"); }
  return rows;
}

function judge(name, n, want=0, why="") {
  const pass = n === want;
  (pass ? ok : bad).push(`${pass?"✅":"❌"} ${name} — ${n}줄 (바라는 값 ${want})${why?" · "+why:""}`);
}

await c.connect();

// 누구로 흉내낼지 고른다
const stu = (await c.query(`select p.id pid, s.id sid, s.name
  from public.profiles p join public.students s on s.profile_id = p.id
  where p.role='student' limit 1`)).rows[0];
const par = (await c.query(`select p.id pid, ps.student_id sid
  from public.profiles p join public.parent_student ps on ps.parent_profile_id = p.id
  where p.role='parent' limit 1`)).rows[0];

console.log("■ 흉내낼 사람");
console.log("   학생 :", stu ? stu.name : "(못 찾음)");
console.log("   학부모:", par ? "찾음" : "(못 찾음)");
console.log();

if (stu) {
  const n1 = (await asUser(stu.pid,
    `select count(*)::int n from public.daily_reports where student_id <> $1`, [stu.sid]))[0].n;
  judge("학생이 남의 판을 보는가", n1);

  const n2 = (await asUser(stu.pid,
    `select count(*)::int n from public.scores where student_id <> $1`, [stu.sid]))[0].n;
  judge("학생이 남의 성적을 보는가", n2);

  const n3 = (await asUser(stu.pid,
    `select count(*)::int n from public.student_notes where student_id <> $1`, [stu.sid]))[0].n;
  judge("학생이 남의 상담·메모를 보는가", n3);

  const n4 = (await asUser(stu.pid,
    `select count(*)::int n from public.daily_reports
      where student_id = $1 and closed_at is null`, [stu.sid]))[0].n;
  judge("학생이 **마감 안 한** 자기 판을 보는가", n4, 0, "사고 #7");

  const n5 = (await asUser(stu.pid, `select count(*)::int n from public.payments`))[0].n;
  judge("학생이 수강료를 보는가", n5);
}

if (par) {
  const m1 = (await asUser(par.pid,
    `select count(*)::int n from public.daily_reports where student_id <> $1`, [par.sid]))[0].n;
  judge("학부모가 남의 아이 판을 보는가", m1);

  const m2 = (await asUser(par.pid,
    `select count(*)::int n from public.daily_reports
      where student_id = $1 and closed_at is null`, [par.sid]))[0].n;
  judge("학부모가 **마감 안 한** 판을 보는가", m2, 0, "사고 #7");

  const m3 = (await asUser(par.pid, `select count(*)::int n from public.student_notes`))[0].n;
  judge("학부모가 상담·원장 메모를 보는가", m3);

  const m4 = (await asUser(par.pid, `select count(*)::int n from public.profiles where role='student'`))[0].n;
  judge("학부모가 아이 계정 줄을 보는가", m4, 0, "안 보이는 것이 안전하다");
}

/* ───── 쓰기 쪽 — 트랜잭션 안에서 해 보고 무조건 되돌린다 ───── */
async function tryWrite(profileId, sql, params=[]) {
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: profileId, role: "authenticated" })]);
  await c.query("set local role authenticated");
  let n = 0, err = null;
  try { n = (await c.query(sql, params)).rowCount; }
  catch (e) { err = e.message.split("\n")[0]; }
  finally { await c.query("rollback"); }     // ⚠️ 무조건 되돌린다
  return { n, err };
}
function judgeWrite(name, r, why="") {
  const blocked = r.err !== null || r.n === 0;
  (blocked ? ok : bad).push(`${blocked?"✅":"❌"} ${name} — ${r.err ? "막힘(오류)" : r.n+"줄 고쳐짐"}${why?" · "+why:""}`);
}

console.log("■ 쓰기 — 해 보고 되돌립니다 (아무것도 안 남습니다)");
if (stu) {
  judgeWrite("학생이 자기 검사 결과를 고치는가",
    await tryWrite(stu.pid,
      `update public.daily_report_items set status='done'
        where id in (select i.id from public.daily_report_items i
                     join public.daily_reports r on r.id=i.daily_report_id
                     where r.student_id=$1 limit 1)`, [stu.sid]),
    "아이가 ○ 를 스스로 찍으면 안 된다");
  // ⚠️ 아이가 **자기가 넣은**(source='form') 성적을 고치는 것은 **정상**이다.
  //    막아야 하는 것은 **원장님이 넣은 것**을 고치는 것.
  judgeWrite("학생이 **원장님이 넣은** 성적을 고치는가",
    await tryWrite(stu.pid,
      `update public.scores set raw_score=100
        where student_id=$1 and coalesce(source,'') <> 'form'`, [stu.sid]),
    "아이가 넣은 것은 고쳐도 된다");
  judgeWrite("학생이 남의 성적을 넣는가",
    await tryWrite(stu.pid,
      `insert into public.scores(student_id, kind, taken_on, raw_score)
       select id, 'mock', current_date, 100 from public.students where id <> $1 limit 1`, [stu.sid]));
  judgeWrite("학생이 자기 역할을 올리는가",
    await tryWrite(stu.pid,
      `update public.profiles set role='principal' where id=$1`, [stu.pid]),
    "자기 승격");
  judgeWrite("학생이 남의 판을 고치는가",
    await tryWrite(stu.pid,
      `update public.daily_reports set comment='x' where student_id <> $1`, [stu.sid]));
}
if (par) {
  judgeWrite("학부모가 판을 고치는가",
    await tryWrite(par.pid, `update public.daily_reports set comment='x' where student_id=$1`, [par.sid]));
  judgeWrite("학부모가 수강료를 고치는가",
    await tryWrite(par.pid, `update public.payments set amount=0`, []));
  judgeWrite("학부모가 자기 역할을 올리는가",
    await tryWrite(par.pid, `update public.profiles set role='principal' where id=$1`, [par.pid]));
}


console.log("■ 통과");  ok.forEach(x=>console.log("  ",x));
console.log("\n■ 새는 자리"); bad.length ? bad.forEach(x=>console.log("  ",x)) : console.log("   없음");
console.log(`\n합계 — 통과 ${ok.length} · 샘 ${bad.length}`);
await c.end();
process.exit(bad.length ? 1 : 0);
