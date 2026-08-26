/**
 * **검사 저장 수술(0163 check_many)의 계약을 실 DB 왕복으로 본다**
 * (계획서 v2 §3 — 검증 ⓐ·메모 3상태·자물쇠·「다 했어요」 보존).
 *
 * 코드 읽기 검사(54종)는 「그렇게 적혀 있나」 까지만 본다. 여기서는 진짜
 * Postgres 에 대고 눌러본다 — 제자리 고치기가 정말 행을 안 죽이는지,
 * 지우기가 정말 지워지는지. 판이 죽으면 앱 잘못이 아니니 up.sh 뒤에만
 * 돈다.
 */
import { readFileSync } from "node:fs";
import { sign } from "./token.mjs";

const API = process.env.E2E_API || "http://127.0.0.1:55442";
const STAFF = "11111111-1111-1111-1111-111111111111"; // 원장 (seed.sql)
const STUDENT = "aaaaaaa1-0000-0000-0000-000000000001";
const DATE = "2000-01-01"; // 아무 화면도 안 보는 옛날 — 검사 뒤 지운다

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
const rpc = (items) => rest("POST", "/rpc/check_many", { p_report_id: repId, p_items: items });
const rows = async () => {
  const r = await rest("GET", `/daily_report_items?daily_report_id=eq.${repId}&status=in.(done,weak,missing)&select=homework_item_id,status,check_note,student_done_at`);
  return r.data || [];
};

console.log("\n== 검사 저장 수술 (check_many) ==");

// 판 하나·항목 하나를 마련한다
let repId = null;
{
  const r = await rest("POST", "/daily_reports", { student_id: STUDENT, date: DATE });
  repId = r.data?.[0]?.id || null;
}
let itemId = null;
{
  const r = await rest("GET", "/homework_items?select=id&limit=1");
  itemId = r.data?.[0]?.id || null;
  if (!itemId) {
    const c = await rest("POST", "/homework_items", { name: "검사수술검사용", category: "기타" });
    itemId = c.data?.[0]?.id || null;
  }
}
if (!repId || !itemId) {
  no(`판을 못 만들었습니다 (rep=${repId} item=${itemId})`);
  process.exit(1);
}

// ① 제자리 고치기 — 두 번 찍어도 행은 하나 (0162 자물쇠 + on conflict)
await rpc([{ item_id: itemId, status: "done", note: null }]);
await rpc([{ item_id: itemId, status: "weak", note: null }]);
{
  const r = await rows();
  if (r.length === 1 && r[0].status === "weak") ok("○ 를 △ 로 고쳐도 행은 하나 (제자리 고치기)");
  else no(`행이 ${r.length}개, status=${r[0]?.status} (하나의 weak 여야 합니다)`);
}

// ② 「다 했어요」 보존 — 행이 안 죽으니 student_done_at 이 산다
await rest("PATCH", `/daily_report_items?daily_report_id=eq.${repId}&homework_item_id=eq.${itemId}&status=eq.weak`, { student_done_at: "2000-01-01T10:00:00Z" });
await rpc([{ item_id: itemId, status: "done", note: null }]);
{
  const r = await rows();
  if (r[0]?.student_done_at) ok("검사를 고쳐도 「다 했어요」 가 산다");
  else no("검사를 고치니 「다 했어요」 가 사라졌습니다");
}

// ③ 메모 3상태 — null=유지 / ''=지움 / 문자열=덮어씀
await rest("PATCH", `/daily_report_items?daily_report_id=eq.${repId}&homework_item_id=eq.${itemId}&status=eq.done`, { check_note: "조교메모" });
await rpc([{ item_id: itemId, status: "done", note: null }]);
{
  const r = await rows();
  if (r[0]?.check_note === "조교메모") ok("note null — 조교 메모가 산다 (유지)");
  else no(`note null 인데 메모가 「${r[0]?.check_note}」 (조교메모여야 합니다)`);
}
await rpc([{ item_id: itemId, status: "done", note: "새메모" }]);
{
  const r = await rows();
  if (r[0]?.check_note === "새메모") ok("note 문자열 — 덮어쓴다");
  else no(`note 덮어쓰기가 「${r[0]?.check_note}」`);
}
await rpc([{ item_id: itemId, status: "done", note: "" }]);
{
  const r = await rows();
  if (r[0]?.check_note === null) ok("note '' — 지운다");
  else no(`note '' 인데 「${r[0]?.check_note}」 가 남았습니다`);
}

// ④ 지우기 (검증 ⓐ) — status null 이면 그 검사행이 사라진다
await rpc([{ item_id: itemId, status: null, note: null }]);
{
  const r = await rows();
  if (r.length === 0) ok("status null — 검사행이 지워진다 (칩 재클릭·취소)");
  else no(`지우기 뒤에도 ${r.length}행이 남았습니다`);
}

// ⑤ 어휘 밖 — legacy verified 는 조용히 안 쓴다
{
  const r = await rpc([{ item_id: itemId, status: "verified", note: null }]);
  if (r.status >= 400) ok("어휘 밖 status 는 오류로 거절한다");
  else no("어휘 밖 status 가 조용히 들어갔습니다");
}

// ⑥ ○ 불가침 방벽이 코드에 있나 (검증 ⓓ 의 정적 반쪽 — RPC 는 do update
//    라 방벽은 호출부 선필터다. 이 필터가 지워지면 「안 낸 것 한 번에 ✕」
//    가 ○ 를 갈아엎는다)
{
  const src = readFileSync("app/check/actions.js", "utf8");
  if (src.includes("이미 찍힌 것은 건드리지 않는다")) ok("markMissing — ○ 불가침 선필터가 있다");
  else no("markMissing 의 ○ 불가침 선필터가 사라졌습니다");
}

// 검사용 판을 치운다 (cascade 로 항목도 같이)
await rest("DELETE", `/daily_reports?id=eq.${repId}`);

if (bad) { console.log("\n❌ 검사 저장 수술이 계약과 다릅니다"); process.exit(1); }
console.log("\n✅ 검사 저장 수술 통과");
