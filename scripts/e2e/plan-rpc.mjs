/**
 * **배정·등원 줄 수술(0165 plan_many)의 계약을 실 DB 왕복으로 본다**
 * (배정줄수술 v2 §4-C4). check-rpc.mjs 와 같은 판 — RPC 단독 계약 검사
 * (프로덕션 경로의 deadItems 선필터는 별개 층이다).
 */
import { sign } from "./token.mjs";

const API = process.env.E2E_API || "http://127.0.0.1:55442";
const STAFF = "11111111-1111-1111-1111-111111111111";
const STUDENT = "aaaaaaa1-0000-0000-0000-000000000001";
const DATE = "2000-01-02";

let bad = 0;
const ok = (m) => console.log(`  ${m}`);
const no = (m) => { bad++; console.log(`  ✗ ${m}`); };

const jwt = sign({ sub: STAFF, role: "authenticated" });
async function rest(method, path, body) {
  const r = await fetch(`${API}/rest/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, data };
}
const rpc = (groups) => rest("POST", "/rpc/plan_many", { p_report_id: repId, p_groups: groups });
const rows = async (st) => {
  const r = await rest("GET", `/daily_report_items?daily_report_id=eq.${repId}${st ? `&status=eq.${st}` : ""}&select=id,homework_item_id,status,inclass_sort,carry_next,range_note,changed_at,student_done_at&order=inclass_sort`);
  return r.data || [];
};

console.log("\n== 배정·등원 줄 수술 (plan_many) ==");

let repId = null;
{
  const r = await rest("POST", "/daily_reports", { student_id: STUDENT, date: DATE });
  repId = r.data?.[0]?.id || null;
}
let A = null, B = null;
{
  const r = await rest("GET", "/homework_items?select=id&limit=2");
  [A, B] = [(r.data || [])[0]?.id, (r.data || [])[1]?.id];
  if (!B) {
    const c = await rest("POST", "/homework_items", { name: "배정수술검사용", category: "기타" });
    B = c.data?.[0]?.id || null;
  }
}
if (!repId || !A || !B) { no(`판을 못 만들었습니다 (rep=${repId} A=${A} B=${B})`); process.exit(1); }

// ① 행 id 불변 + 「다 했어요」 생존 — 같은 목록 재저장에도 행이 제자리
await rpc({ assigned: [{ item_id: A, range_note: "3과" }, { item_id: B }] });
let r1 = await rows("assigned");
const idA = r1.find((x) => x.homework_item_id === A)?.id;
await rest("PATCH", `/daily_report_items?id=eq.${idA}`, { student_done_at: "2000-01-02T10:00:00Z" });
await rpc({ assigned: [{ item_id: A, range_note: "3과" }, { item_id: B }] });
let r2 = await rows("assigned");
const a2 = r2.find((x) => x.homework_item_id === A);
if (a2?.id === idA && a2?.student_done_at) ok("재저장에도 행 id 불변 · 「다 했어요」 생존");
else no(`행이 갈렸거나 다했어요 소실 (id ${idA}→${a2?.id}, done ${a2?.student_done_at})`);

// ②③ changed_at — 처음 주는 숙제 null · 무변경 재저장 그대로
if (r1.every((x) => x.changed_at === null)) ok("처음 주는 숙제 — changed_at null");
else no("첫 저장에 changed_at 이 찍혔습니다");
if (a2?.changed_at === null) ok("무변경 재저장 — changed_at 그대로(null)");
else no(`무변경인데 changed_at=${a2?.changed_at}`);

// ④ 범위 바꾸면 changed_at + 반환 changed
{
  const r = await rpc({ assigned: [{ item_id: A, range_note: "4과" }, { item_id: B }] });
  const ch = r.data?.changed || [];
  const a3 = (await rows("assigned")).find((x) => x.homework_item_id === A);
  if (a3?.changed_at && ch.includes(A)) ok("범위 변경 — changed_at 갱신 + 반환 changed 포함");
  else no(`변경 감지 실패 (changed_at=${a3?.changed_at}, changed=${JSON.stringify(ch)})`);
}

// ⑤ 목록서 빼면 그 행만 delete, 남은 행 id 불변
await rpc({ assigned: [{ item_id: A, range_note: "4과" }] });
{
  const r = await rows("assigned");
  if (r.length === 1 && r[0].homework_item_id === A && r[0].id === idA)
    ok("목록서 뺀 것만 지워지고 남은 행은 제자리");
  else no(`전체 교체가 이상합니다 (${r.length}행)`);
}

// ⑥ inclass 키만 보내면 assigned 무접촉
await rpc({ inclass: [{ item_id: A, sort: 0, carry_next: true }, { item_id: B, sort: 1 }] });
{
  const asg = await rows("assigned");
  const inc = await rows("inclass");
  if (asg.length === 1 && inc.length === 2) ok("그룹 무접촉 계약 — inclass 만 교체, assigned 그대로");
  else no(`무접촉 위반 (assigned ${asg.length}, inclass ${inc.length})`);
  // ⑦ 같은 항목이 assigned+inclass 동시 성립 + sort·carry 기록
  const ia = inc.find((x) => x.homework_item_id === A);
  if (ia?.carry_next === true && ia?.inclass_sort === 0) ok("sort·carry_next 기록 + 두 그룹 동시 성립");
  else no(`sort/carry 기록 실패 (${JSON.stringify(ia)})`);
}

// ⑧ 죽은 FK = 전체 거절 + 기존 무손상 (RPC 단독 계약)
{
  const r = await rpc({ inclass: [{ item_id: "00000000-0000-0000-0000-00000000dead", sort: 0 }] });
  const inc = await rows("inclass");
  if (r.status >= 400 && inc.length === 2) ok("죽은 이름표 — 전부-또는-무 거절, 기존 무손상");
  else no(`죽은 FK 가 통과했거나 기존이 상했습니다 (HTTP ${r.status}, inclass ${inc.length})`);
}

// ⑨ 검사행은 세 그룹 전체 교체에도 생존
await rest("POST", "/rpc/check_many", { p_report_id: repId, p_items: [{ item_id: A, status: "done", note: null }] });
await rpc({ assigned: [], inclass: [], plan_next: [] });
{
  const done = await rows("done");
  if (done.length === 1) ok("검사행은 목록 교체에 무접촉 (check_many 소관)");
  else no(`검사행이 상했습니다 (${done.length})`);
}

// ⑩ 어휘 밖 그룹 키 거절
{
  const r = await rpc({ verified: [] });
  if (r.status >= 400) ok("어휘 밖 그룹 키 거절");
  else no("어휘 밖 그룹이 통과했습니다");
}

await rest("DELETE", `/daily_reports?id=eq.${repId}`);

if (bad) { console.log("\n❌ 배정·등원 줄 수술이 계약과 다릅니다"); process.exit(1); }
console.log("\n✅ 배정·등원 줄 수술 통과");
