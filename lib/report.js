/** 📊 월간 리포트 손(4단계-2b) — 원장 판 · 한마디 적기 · 보내기(숫자를 굳히고 알림). 알림 길은 lib/notify 하나 · 판단은 lib/report-plan */
import { db } from "./supabase.js";
import { notify } from "./notify.js";
import { monthlyLine } from "./sms-plan.js";   // (뎌-2) 문자 「한 줄」
import { isYm, sendable } from "./report-plan.js";
import { changed } from "./sqlError.js";
export async function monthlyBoard(sb, ym) {
  if (!isYm(ym)) throw new Error(`달이 아닙니다: ${ym}`);
  const { data, error } = await db(sb).rpc("monthly_board", { p_ym: ym });
  if (error) throw new Error(`월간 판을 못 읽음: ${error.message}`);
  if (!data) throw new Error("월간 리포트는 학원 사람의 화면입니다");
  return data;
}
/** 덧붙일 한마디 — 손 떼면 저장. 이미 보낸 달은 못 고친다(학부모가 본 글 — monthly_report 는 보낸 뒤 굳힌다) */
export async function saveBody(sb, studentId, ym, body) {
  if (!isYm(ym)) throw new Error(`달이 아닙니다: ${ym}`);
  const { data: cur, error: e1 } = await db(sb).from("monthly_report").select("id,sent_at").eq("student_id", studentId).eq("ym", ym).maybeSingle();
  if (e1) throw new Error(`리포트 줄을 못 읽음: ${e1.message}`);
  if (cur?.sent_at) throw new Error("이미 보낸 달입니다 — 학부모가 본 글은 고치지 않습니다");
  changed(await db(sb).from("monthly_report").upsert({ student_id: studentId, ym, body: String(body ?? "").trim() || null }, { onConflict: "student_id,ym" , count: "exact" }), "한마디를 못 적음");
  return { saved: true };
}
/** 📨 보내기 — 고른 아이(없으면 아직 안 보낸 아이 전부): 그 달 숫자를 굳혀 리포트 줄에 적고(sent_at) 학부모 알림(monthly). 리포트 줄이 먼저 — 알림이 실패해도 리포트는 서고 자취가 ✕ 로 말한다 */
/** 굳히고 알린다 — 지금 보내기(판에서)와 예약(크론 · 판 없이)이 같은 한 벌 */
async function freezeAndNotify(svc, w, { studentId, ym, body, numbers, name = "" }) {
  const now = new Date().toISOString();
  const { data: row, error } = await db(w).from("monthly_report").upsert({ student_id: studentId, ym, body: body ?? null, frozen: numbers, sent_at: now }, { onConflict: "student_id,ym" }).select("id").single();
  if (error) throw new Error(`${name || "아이"}의 리포트를 못 굳힘: ${error.message}`);
  return notify(svc, { kind: "monthly", studentId, url: "/parent#report", tag: `monthly-${ym}-${studentId}`, smsLine: monthlyLine(ym), why: { table: "monthly_report", id: row.id } });
}
/** (어) 예약 때가 되어 크론이 보낸다 — 판(monthly_board 는 학원 사람만)이 아니라 이 아이 숫자(month_report)로 · 이미 보냈으면 건너뛴다 · 마감한 날이 없으면 보낼 것이 없다 */
export async function sendMonthlyDue(svc, studentId, ym) {
  if (!isYm(ym)) throw new Error(`달이 아닙니다: ${ym}`);
  const [curQ, numQ] = await Promise.all([db(svc).from("monthly_report").select("id,body,sent_at").eq("student_id", studentId).eq("ym", ym).maybeSingle(), db(svc).rpc("month_report", { p_student: studentId, p_ym: ym })]);
  if (curQ.error) throw new Error(`리포트를 못 읽음: ${curQ.error.message}`); if (numQ.error) throw new Error(`월간 숫자를 못 셈: ${numQ.error.message}`);
  if (curQ.data?.sent_at) return { skipped: "이미 보냄", sent: 0, failed: 0, sink: null };
  const numbers = numQ.data ?? {}; if (!Number(numbers.closed_days ?? 0)) return { skipped: "마감한 날 없음", sent: 0, failed: 0, sink: null };
  return freezeAndNotify(svc, svc, { studentId, ym, body: curQ.data?.body ?? null, numbers });
}
export async function sendMonthly(svc, sb, ym, studentIds = null) {
  const b = await monthlyBoard(sb, ym);
  const pick = new Set((studentIds ?? []).filter(Boolean));
  const rows = pick.size ? b.rows.filter((r) => pick.has(r.student_id)) : sendable(b.rows);
  if (!rows.length) throw new Error("보낼 아이가 없습니다");
  let sent = 0, failed = 0, sink = null;
  for (const r of rows) {
    if (r.report?.sent_at) continue;   // 이미 보낸 아이는 건너뛴다(다시 보내기는 자취에서)
    const x = await freezeAndNotify(svc, sb, { studentId: r.student_id, ym, body: r.report?.body ?? null, numbers: r.numbers, name: r.name });
    sink = x.sink; sent += x.sent; failed += x.failed;
  }
  return { n: rows.filter((r) => !r.report?.sent_at).length, sent, failed, sink };
}
