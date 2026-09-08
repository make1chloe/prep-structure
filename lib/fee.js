/** 수강료 13 의 손 — 판 읽기(한 벌 fee_board) · 저장(받은 금액·받은 날 → payment · 금액이 달라지면 단가 줄도) · 결제선생 엑셀 올리기(이름으로 맞춘다). 판단은 lib/fee-plan.js(순수). 지우지 않는다(대전제-6) */
import { db } from "./supabase.js";
import { rowsOf, ruleChanges, parseWon, parseByGrade, METHODS } from "./fee-plan.js";
import { notify } from "./notify.js";
import { changed } from "./sqlError.js";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
const isYm = (ym) => /^\d{4}-\d{2}$/.test(String(ym ?? "")), isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
export async function feeBoard(sb, ym) {
  if (!isYm(ym)) throw new Error(`달이 아닙니다: ${ym}`);
  const { data, error } = await db(sb).rpc("fee_board", { p_ym: ym });
  if (error) throw new Error(`수강료 판을 못 읽음: ${error.message}`);
  if (!data) throw new Error("수강료는 학원 사람의 화면입니다");
  return data;
}
/** 저장 — 줄마다 { student_id, amount, paid_on }. 금액이 비면 「아직 안 적음」(0원이 아니다) · 단가 줄은 fee-plan 이 정한 대로 */
export async function savePayments(sb, ym, edits = [], board) {
  if (!isYm(ym)) throw new Error(`달이 아닙니다: ${ym}`);
  let saved = 0, ruled = 0;
  for (const e of edits) {
    const st = (board.students ?? []).find((s) => s.id === e.student_id); if (!st) throw new Error("재원생이 아닙니다");
    const amount = e.amount == null || e.amount === "" ? null : parseWon(e.amount);
    if (amount != null && (!Number.isInteger(amount) || amount < 0)) throw new Error(`금액이 이상합니다: ${e.amount}`);
    const paidOn = e.paid_on ? String(e.paid_on) : null; if (paidOn && !isDate(paidOn)) throw new Error(`받은 날이 날짜가 아닙니다: ${paidOn}`);
    if (paidOn && amount == null) throw new Error(`${st.name}: 금액 없이 받은 날만 적을 수 없습니다`);
    const method = e.method === undefined ? undefined : (String(e.method ?? "").trim() || null); if (method && !METHODS.includes(method)) throw new Error(`수납 방법이 아닙니다: ${method}`);
    changed(await db(sb).from("payment").upsert({ student_id: st.id, ym, amount, paid_on: paidOn, source: "manual", ...(method === undefined ? {} : { method }) }, { onConflict: "student_id,ym" }).select("id"), "수납을 못 적음"); saved++;
    const ch = ruleChanges(st, board.rules ?? [], board.by_grade ?? {}, ym, amount);
    if (ch.close) changed(await db(sb).from("fee_rule").update({ to_date: ch.close.to_date }).eq("id", ch.close.id).select("id"), "단가 줄을 못 닫음");
    if (ch.update) changed(await db(sb).from("fee_rule").update({ amount: ch.update.amount }).eq("id", ch.update.id).select("id"), "단가 줄을 못 고침");
    if (ch.insert) row(await db(sb).from("fee_rule").insert(ch.insert).select("id"), "단가 줄을 못 더함");
    if (ch.close || ch.update || ch.insert) ruled++;
  }
  return { saved, ruled };
}
/** 결제선생 엑셀 — 읽은 줄을 이름으로 재원생에 맞춰 그 달 수납으로. 같은 이름이 둘이면 못 맞춘다(이름을 고쳐 다시) */
export async function importPayments(sb, ym, parsed = [], board) {
  if (!isYm(ym)) throw new Error(`달이 아닙니다: ${ym}`);
  const students = board.students ?? [], unmatched = [], dup = []; let put = 0, skipped = 0;
  for (const r of parsed) {
    if (r.ym && r.ym !== ym) { skipped++; continue; }
    const hits = students.filter((s) => s.name.replace(/\s/g, "") === r.name.replace(/\s/g, ""));
    if (hits.length !== 1) { (hits.length ? dup : unmatched).push(r.name); continue; }
    if (r.amount == null) { skipped++; continue; }
    changed(await db(sb).from("payment").upsert({ student_id: hits[0].id, ym, amount: r.amount, paid_on: r.paidOn, method: r.method, source: "excel" }, { onConflict: "student_id,ym" }).select("id"), "수납을 못 적음"); put++;
  }
  return { put, skipped, unmatched: [...new Set(unmatched)], dup: [...new Set(dup)] };
}
export { rowsOf };

/** 💰 수강료 안내(13 · 4단계-2a) — 이 달 수납 줄이 있고(원장님이 금액을 적어 저장한 것) 아직 안 받은 집의 학부모에게. 적지 않은 금액(단가·학년 기준으로 세어 나온 것)은 학부모 화면에 없어 안 보낸다 · 알림 길 하나 · 자취 why 는 수납 줄 */
export async function remindFees(svc, sb, ym, board) {
  const rows = rowsOf(board, ym).filter((r) => r.state === "unpaid" && r.payment_id);
  let sent = 0, failed = 0, sink = null;
  for (const r of rows) { const x = await notify(svc, { kind: "fee", studentId: r.student_id, url: "/parent#fee", tag: `fee-${ym}-${r.student_id}`, why: { table: "payment", id: r.payment_id } }); sink = x.sink; sent += x.sent; failed += x.failed; }
  return { n: rows.length, sent, failed, sink };
}

/** 학년별 기준 적기(4단계-4) — 옛 설정 자리(v2.integration 'tuition' 의 config.byGrade) 그대로 쓴다(13 판이 거기서 읽는다 — 같은 값 두 곳을 만들지 않는다) */
export async function setByGrade(sb, f) {
  const byGrade = parseByGrade(f);
  const { data: cur, error: e1 } = await db(sb).from("integration").select("config").eq("id", "tuition").maybeSingle();
  if (e1) throw new Error(`설정을 못 읽음: ${e1.message}`);
  changed(await db(sb).from("integration").upsert({ id: "tuition", config: { ...(cur?.config ?? {}), byGrade } }, { onConflict: "id" , count: "exact" }), "학년별 기준을 못 적음");
  return { n: Object.keys(byGrade).length };
}
