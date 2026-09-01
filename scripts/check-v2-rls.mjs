/**
 * v2 접근 규칙 검사 — 리허설 계정 5개로만 돈다 (대전제 12).
 * 진짜 재원생·학부모 계정은 **한 번도 안 건드린다.**
 * 읽기·쓰기 둘 다 보고, 쓰기는 트랜잭션 안에서 하고 무조건 되돌린다.
 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for (let i=1;;i++){ try{ await c.connect(); break;}catch(e){ if(i>=4) throw e; await new Promise(r=>setTimeout(r,3000)); } }

const P = {
  원장:   "00000000-0000-4000-8000-000000000001",
  강사:   "00000000-0000-4000-8000-000000000002",
  학생:   "00000000-0000-4000-8000-000000000003",
  학부모: "00000000-0000-4000-8000-000000000004",
};
const S = { 내아이:"00000000-0000-4000-9000-000000000001", 남의아이:"00000000-0000-4000-9000-000000000002" };
const ok=[], bad=[];

async function as(pid, sql, params=[]) {
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:pid, role:"authenticated"})]);
  await c.query("set local role authenticated");
  let out={n:0, err:null};
  try { const r = await c.query(sql, params);
        out.n = r.rows[0]?.n !== undefined ? Number(r.rows[0].n) : r.rowCount; }
  catch(e){ out.err = e.message.split("\n")[0]; }
  finally { await c.query("rollback"); }
  return out;
}
/**
 * ⚠️ 「막힘」을 통과로 세면 안 된다 — **권한이 없어서** 막힌 것과
 *    **접근 규칙이** 막은 것은 다르다. 권한이 없으면 아무도 못 보는데
 *    검사는 초록으로 지나간다. 그래서 오류 글을 보고 가른다.
 */
function must(name, r, want, byGrant=false) {
  const noGrant = r.err && /permission denied|권한/.test(r.err);
  if (noGrant) {
    if (byGrant) { ok.push(`✅ ${name} — 권한으로 막음 (일부러 그렇게 했다)`); return; }
    bad.push(`❌ ${name} — ⚠️ **권한이 없어서** 막힘 (규칙 검사가 아니다): ${r.err.slice(0,60)}`); return;
  }
  const got = r.err ? "규칙이 막음" : r.n;
  const pass = r.err ? want===0 : r.n===want;
  (pass?ok:bad).push(`${pass?"✅":"❌"} ${name} — ${got} (바라는 값 ${want})`);
}

console.log("■ v2 접근 규칙 — 리허설 계정으로만\n");

// ── 읽기 ────────────────────────────────────────────────
must("학생이 남의 아이를 보는가",
  await as(P.학생, `select count(*)::int n from v2.students where id=$1`, [S.남의아이]), 0);
must("학생이 자기를 보는가",
  await as(P.학생, `select count(*)::int n from v2.students where id=$1`, [S.내아이]), 1);
must("학생이 남의 계정을 보는가",
  await as(P.학생, `select count(*)::int n from v2.profiles where id<>$1`, [P.학생]), 0);
must("학생이 남의 반을 보는가",
  await as(P.학생, `select count(*)::int n from v2.classes where id='00000000-0000-4000-a000-000000000002'`), 0);
must("학생이 자기 반을 보는가",
  await as(P.학생, `select count(*)::int n from v2.classes`), 1);
must("학생이 감사 기록을 보는가",
  await as(P.학생, `select count(*)::int n from v2.audit`), 0);
must("학부모가 자기 아이를 보는가",
  await as(P.학부모, `select count(*)::int n from v2.students where id=$1`, [S.내아이]), 1);
must("학부모가 남의 아이를 보는가",
  await as(P.학부모, `select count(*)::int n from v2.students where id=$1`, [S.남의아이]), 0);
must("강사가 아이를 다 보는가",
  await as(P.강사, `select count(*)::int n from v2.students where import_batch='fixture'`), 2);

// ── 쓰기 ────────────────────────────────────────────────
must("학생이 자기를 원장으로 올리는가",
  await as(P.학생, `update v2.profiles set role='principal' where id=$1`, [P.학생]), 0);
must("학생이 원장을 끌어내리는가",
  await as(P.학생, `update v2.profiles set role='student' where id=$1`, [P.원장]), 0);
must("학생이 자기 이름을 고치는가",
  await as(P.학생, `update v2.profiles set name='x' where id=$1`, [P.학생]), 0);
must("학생이 남의 아이를 자기 것으로 갈아끼우는가",
  await as(P.학생, `update v2.students set profile_id=$1 where id=$2`, [P.학생, S.남의아이]), 0);
must("학부모가 남의 아이를 자기 아이로 붙이는가",
  await as(P.학부모, `insert into v2.parent_student(parent_profile_id,student_id) values($1,$2)`, [P.학부모, S.남의아이]), 0);
must("학생이 반 명단을 고치는가",
  await as(P.학생, `update v2.class_member set to_date=null`), 0);
// 감사 기록은 **권한 자체를 안 준다** — 규칙보다 한 겹 위에서 막는다
must("학생이 감사 기록을 지우는가",
  await as(P.학생, `delete from v2.audit`), 0, true);
must("원장도 감사 기록을 지우는가",
  await as(P.원장, `delete from v2.audit`), 0, true);
must("원장이 아이를 고치는가",
  await as(P.원장, `update v2.students set grade=3 where id=$1`, [S.내아이]), 1);

/* ───── 진도 — 새 앱이 전부 매다는 자리 ───── */
const U = (await c.query(`select id from v2.units limit 1`)).rows[0]?.id;
if (U) {
  const 열기 = async v => c.query(`update v2.progress_edit set is_open=$1, opened_on=case when $1 then current_date end where scope='academy'`,[v]);

  await 열기(false);
  must("[닫힘] 아이가 진도를 찍는가",
    await as(P.학생, `insert into v2.progress(student_id,unit_id,round,status,last_by,confirmed)
      values($1,$2,1,'done','student',false)`, [S.내아이, U]), 0);

  await 열기(true);
  must("[열림] 아이가 진도를 찍는가",
    await as(P.학생, `insert into v2.progress(student_id,unit_id,round,status,last_by,confirmed)
      values($1,$2,1,'done','student',false)`, [S.내아이, U]), 1);
  must("[열림] 아이가 **확인 끝난 것처럼** 찍는가",
    await as(P.학생, `insert into v2.progress(student_id,unit_id,round,status,last_by,confirmed)
      values($1,$2,1,'done','staff',true)`, [S.내아이, U]), 0);
  must("[열림] 아이가 남의 진도를 찍는가",
    await as(P.학생, `insert into v2.progress(student_id,unit_id,round,status,last_by,confirmed)
      values($1,$2,1,'done','student',false)`, [S.남의아이, U]), 0);

  // 원장이 찍어 둔 줄
  await c.query(`insert into v2.progress(student_id,unit_id,round,status,last_by,confirmed)
    values($1,$2,1,'done','staff',true) on conflict (student_id,unit_id,round)
    do update set last_by='staff', confirmed=true, status='done'`,[S.내아이,U]);
  must("[열림] ⭐ 아이가 **원장님이 찍은 줄**을 덮는가",
    await as(P.학생, `update v2.progress set status='none' where student_id=$1 and unit_id=$2`, [S.내아이,U]), 0);
  must("[열림] 아이가 진도를 지우는가",
    await as(P.학생, `delete from v2.progress where student_id=$1`, [S.내아이]), 0, true);
  must("[열림] 아이가 ❗ 를 다는가",
    await as(P.학생, `insert into v2.progress_flag(student_id,unit_id,kind,said)
      values($1,$2,'not_done','아직 안 했어요')`, [S.내아이,U]), 1);
  must("[열림] 아이가 ❗ 를 **스스로 처리**하는가",
    await as(P.학생, `insert into v2.progress_flag(student_id,unit_id,kind,outcome)
      values($1,$2,'not_done','changed')`, [S.내아이,U]), 0);
  await 열기(false);
  await c.query(`delete from v2.progress where student_id=$1`,[S.내아이]);
}

console.log("■ 통과"); ok.forEach(x=>console.log("  ",x));
console.log("\n■ 새는 자리"); bad.length ? bad.forEach(x=>console.log("  ",x)) : console.log("   없음");
console.log(`\n합계 — 통과 ${ok.length} · 샘 ${bad.length}`);
await c.end();
process.exit(bad.length ? 1 : 0);
