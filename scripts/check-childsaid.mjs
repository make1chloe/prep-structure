/** 표-9 「아이가 값을 쓰는 자리에는 DB 쪽 잠금」((사2) 2026-09-11 — 0단계에서 지웠던 옛 check-childsaid 를 다시 세운다).
 *  규칙은 **허용 목록이 아니라 차이 비교**다: 「그 한두 칸만 빼고 옛 줄과 견줘 다르면 거절」.
 *  까닭 — 접근 규칙(RLS)의 with_check 는 **바뀐 뒤 줄만** 본다. 그래서 아이가 제 줄을 집어
 *  student_id 를 남의 것으로 옮겨도 with_check 는 통과한다(옮긴 뒤에도 조건은 맞으니까).
 *  실제로 score·file_link 이 그렇게 열려 있었고(0160 에서 막음), 지키는 검사가 없어 아무도 못 봤다.
 *  그래서 여기서 센다: **아이·학부모가 UPDATE 할 수 있는 표는 전부** 차이 비교 트리거를 가진다.
 *  진짜 DB 에 물어본다(DATABASE_URL) — 글자만 보면 마이그레이션을 지나친 표를 못 잡는다. */
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("check-childsaid ⏭ DATABASE_URL 이 없어 건너뜀 — 초록이 아니다"); process.exit(0); }
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: /supabase|amazonaws/.test(url) ? { rejectUnauthorized: false } : false });
await c.connect();
const q = async (s, p = []) => (await c.query(s, p)).rows;

/** 아이·학부모가 UPDATE 할 수 있는 표 — 원장·강사·조교·서버 자신 것은 뺀다(이름으로 가르지 않고 정책을 읽는다) */
const pols = await q(`
  select tablename, policyname, cmd, coalesce(with_check,'') as chk
  from pg_policies where schemaname='v2' and cmd in ('UPDATE','ALL')
    and policyname !~ 'staff|svc|principal|service|admin'
  order by tablename, policyname`);
/** 차이 비교 트리거가 붙은 표 — 「to_jsonb(new) - '칸' … is distinct from」 꼴이어야 한다(허용 목록이 아니다) */
const guards = await q(`
  select c.relname as tbl, p.prosrc as src
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace ns on ns.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid
  where ns.nspname='v2' and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16`);   // BEFORE(2) UPDATE(16) — 4 는 INSERT 다(처음에 그걸 골라 다 빨갰다)
const diffOf = new Map(guards.filter((g) => /to_jsonb\(new\)[\s\S]{0,200}is distinct from[\s\S]{0,200}to_jsonb\(old\)/.test(g.src)).map((g) => [g.tbl, g.src]));

console.log("■ 표-9 — 아이가 쓰는 표마다 **차이 비교** 잠금");
const 쓰는표 = [...new Set(pols.map((p) => p.tablename))];
/** 제 것 하나뿐이라 옮길 곳이 없는 표 — 줄이 곧 주인이다(profile_id = auth.uid()) · 까닭을 적어 둔다 */
const OWNED = {
  push_sub: "제 기기 줄(profile_id = auth.uid()) — 남에게 옮길 칸이 없다",
  screen_pref: "제 화면 차례(profile_id = auth.uid()) — 남의 것이 될 수 없다",
  video_view: "제가 본 구간(student_id = 내 아이) — 옮겨도 제 것 안에서다",
  progress: "with_check 가 student_id 를 **못 박는다**(my_own_student) — 남에게 옮길 수 없고, 제 진도 안에서 찍는 것이 곧 하라는 일이다",
  role_access: "원장만 쓴다(policyname 에 principal 이 없어 여기 들어왔다 — my_role() = principal 을 건다)",
  rule: "원장만 쓴다 — 같은 결",
};
for (const t of 쓰는표) {
  const why = OWNED[t];
  if (why) { ok(`${t} — 차이 비교가 없어도 되는 까닭이 적혀 있다: ${why}`, true); continue; }
  ok(`${t} — 「그 칸만 빼고 다르면 거절」 트리거가 있다(허용 목록이 아니라 차이 비교)`, diffOf.has(t),
     `아이가 UPDATE 할 수 있는데 차이 비교가 없다 — with_check 는 **바뀐 뒤 줄만** 봐서 student_id 를 남의 것으로 옮겨도 통과한다. day_item_child_guard 와 같은 꼴로 막아라`);
}
console.log("■ 잠금이 제대로 생겼나");
for (const [t, src] of diffOf) {
  ok(`${t} — 서버 자신(로그인한 사람이 없을 때)과 학원 사람은 지나간다(크론·마이그레이션이 안 막힌다)`, /auth\.uid\(\)/.test(src) && /is_staff\(\)/.test(src) && /return new;/.test(src), src.slice(0, 120).replace(/\s+/g, " "));
  ok(`${t} — 거절할 때 **우리 말로** 말한다(42501)`, /raise exception '[^']*[가-힣]/.test(src) && /42501/.test(src));
}
console.log("■ with_check 가 true 인 곳이 없다 — 「바뀐 뒤 아무 줄이나 돼도 좋다」는 뜻이다");
const wide = pols.filter((p) => p.chk.trim() === "true" && !OWNED[p.tablename] && !diffOf.has(p.tablename));
ok("with_check = true 인 아이 쪽 정책 0(차이 비교로 막힌 것은 뺀다)", wide.length === 0, wide.map((p) => `${p.tablename}.${p.policyname}`).join(", "));

await c.end();
console.log(`\n■ 아이 쓰기 잠금 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
