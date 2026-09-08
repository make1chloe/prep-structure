/** 📊 월간 리포트 손(4단계-2b) — 원장 판 · 한마디 적기 · 보내기(숫자를 굳히고 알림). 알림 길은 lib/notify 하나 · 판단은 lib/report-plan */
import { db } from "./supabase.js";
import { notify } from "./notify.js";
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
export async function sendMonthly(svc, sb, ym, studentIds = null) {
  const b = await monthlyBoard(sb, ym);
  const pick = new Set((studentIds ?? []).filter(Boolean));
  const rows = pick.size ? b.rows.filter((r) => pick.has(r.student_id)) : sendable(b.rows);
  if (!rows.length) throw new Error("보낼 아이가 없습니다");
  let sent = 0, failed = 0, sink = null; const now = new Date().toISOString();
  for (const r of rows) {
    if (r.report?.sent_at) continue;   // 이미 보낸 아이는 건너뛴다(다시 보내기는 자취에서)
    const { data: row, error } = await db(sb).from("monthly_report").upsert({ student_id: r.student_id, ym, body: r.report?.body ?? null, frozen: r.numbers, sent_at: now }, { onConflict: "student_id,ym" }).select("id").single();
    if (error) throw new Error(`${r.name}의 리포트를 못 굳힘: ${error.message}`);
    const x = await notify(svc, { kind: "monthly", studentId: r.student_id, url: "/parent#report", tag: `monthly-${ym}-${r.student_id}`, why: { table: "monthly_report", id: row.id } });
    sink = x.sink; sent += x.sent; failed += x.failed;
  }
  return { n: rows.filter((r) => !r.report?.sent_at).length, sent, failed, sink };
}
