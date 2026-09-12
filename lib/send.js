/** 발송 10 한 벌 — 손(큐 handlers 다섯) · 발송 판 읽기(파도 6 · 2단) · 지금 보내기 · 예약(확정-㉕) · 다시 보내기 · 백스톱(속도-3).
 *  밖으로 나가는 길은 lib/notify.js 하나(대전제-7) — 여기는 「무엇을 누구에게」만 정해 그 길을 부른다. 판단은 lib/send-plan.js(순수).
 *  방해금지(규칙 send.quiet_from · send.quiet_to)면 가족 알림을 끝나는 때로 미룬다 — 큐 next_at 을 옮길 뿐, 잃지 않는다 */
import { db, serviceClient } from "./supabase.js";
import { handlers, beforeRun, enqueue, runDue } from "./queue.js";
import { notify } from "./notify.js";
import { ruleMap } from "./rule.js";
import { today as todayOf } from "./day.js";
import { seoulTime } from "./day-plan.js";
import { seoulDate } from "./dash-plan.js";
import { inQuiet, quietUntil, sinkOf, sinkSafe } from "./notify-plan.js";
import { KINDS, unfilled, lateRows, dailyRows, autoRows, scheduledRows, sentRows, failGroups, whenAt } from "./send-plan.js";
import { TEMPLATES, lenText, lateLine, SMS_ALSO } from "./sms-plan.js";   // (커) ✉️ 문자 문구 — 글자 수·갈래는 화면과 같은 셈
import { changed, rows, row as row0 } from "./sqlError.js";
import { sendMonthlyDue } from "./report.js";
import { remindFeeDue } from "./fee.js";
import { isYm } from "./report-plan.js";
/** 방해금지면 미룬다 — 가족 알림 전부. 규칙 줄 시작·끝이 같으면(리허설 씨앗 00:00·00:00) 방해금지 없음 */
async function quietGate(svc) {
  const r = await ruleMap(svc, ["send.quiet"]);
  const now = new Date().toISOString();
  if (!inQuiet(seoulTime(now), r["send.quiet_from"], r["send.quiet_to"])) return null;
  return { deferUntil: quietUntil(now, seoulDate(now), r["send.quiet_to"]), why: `방해금지(${r["send.quiet_from"]}~${r["send.quiet_to"]})라 미룸` };
}
const family = (fn) => async (payload, ctx) => (await quietGate(ctx.sb)) ?? fn(payload, ctx);
async function sheetOf(svc, id) {
  const { data, error } = await db(svc).from("day_sheet").select("id,student_id,date,closed_at,comment").eq("id", id).maybeSingle();
  if (error) throw new Error(`판을 못 읽음: ${error.message}`); if (!data) throw new Error(`판이 없습니다: ${id}`);
  return data;
}
// ── 손 — 크론·백스톱·지금 보내기가 runDue 로 부른다(뼈대-9). 손이 없는 갈래는 큐가 실패로 남긴다
handlers[KINDS.daily] = family(async ({ sheet_id }, { sb, row }) => {
  const s = await sheetOf(sb, sheet_id);
  if (!s.closed_at) throw new Error("아직 마감 안 함 — 안 나갑니다");
  const holes = unfilled(s.comment); if (holes.length) throw new Error(`안 채운 치환 자리 — {{${holes.join("}} {{")}}}`);   // 뼈대-11: 보내지 않고 원장님께 되돌린다
  return notify(sb, { kind: "daily", studentId: s.student_id, sheetId: s.id, tag: `daily-${s.id}`, why: { table: "day_sheet", id: s.id }, jobId: row.id });
});
handlers[KINDS.late] = family(async ({ sheet_id, late_id }, { sb, row }) => { const s = await sheetOf(sb, sheet_id);
  const late = row0(await db(sb).from("late_stay").select("until_at,reason").eq("id", late_id).maybeSingle(), "늦귀가 줄");   // (뎌-2) 문자 「한 줄」 — 그 갈래를 아는 자리가 채운다
  return notify(sb, { kind: "late", studentId: s.student_id, sheetId: s.id, tag: `late-${late_id}`, why: { table: "late_stay", id: late_id }, jobId: row.id, smsLine: lateLine(late) }); });
handlers[KINDS.arrival] = family(async ({ student_id, arrival_id }, { sb, row }) => notify(sb, { kind: "arrival", studentId: student_id, tag: `arrival-${arrival_id}`, why: { table: "arrival", id: arrival_id }, jobId: row.id }));
handlers[KINDS.leave] = family(async ({ student_id, arrival_id }, { sb, row }) => notify(sb, { kind: "leave", studentId: student_id, tag: `leave-${arrival_id}`, why: { table: "arrival", id: arrival_id }, jobId: row.id }));
handlers[KINDS.plan] = family(async ({ student_id, kind, plan_id }, { sb, row }) => notify(sb, { kind: kind === "absent" ? "plan_absent" : "plan_late", studentId: student_id, tag: `plan-${plan_id}`, why: { table: kind === "absent" ? "makeup" : "late_plan", id: plan_id }, jobId: row.id }));
/** 예약이 때가 되면 큐로 — 한 바퀴 앞에 돈다(크론·백스톱·지금 보내기 모두). sent_at 은 「큐에 넘긴 때」, 실제로 나간 때는 자취(notify_log.sent_at) */
export async function promoteScheduled(svc) {
  const now = new Date().toISOString();
  const { data, error } = await db(svc).from("scheduled_send").select("id,kind,sheet_id,student_id,body").lte("at", now).is("sent_at", null).is("cancelled_at", null);
  if (error) throw new Error(`예약을 못 읽음: ${error.message}`);
  let n = 0;
  for (const r of data ?? []) {
    if (r.kind === "daily" && r.sheet_id) await enqueue(svc, KINDS.daily, { sheet_id: r.sheet_id, scheduled_id: r.id }, { table: "scheduled_send", id: r.id });
    else if (r.kind === "monthly" && r.student_id && isYm(r.body)) await sendMonthlyDue(svc, r.student_id, r.body);   // (어) 그때 상태로 — 이미 보낸 리포트는 건너뛴다
    else if (r.kind === "fee" && r.student_id && isYm(r.body)) await remindFeeDue(svc, r.student_id, r.body);   // (어) 그때 상태로 — 이미 받은 수강료는 건너뛴다
    else continue;   // 손이 없는 갈래는 그대로 둔다(누가 봐도 안 나간 채로)
    changed(await db(svc).from("scheduled_send").update({ sent_at: now }, { count: "exact" }).eq("id", r.id), "예약을 못 넘김");
    n++;
  }
  return n;
}
if (!beforeRun.includes(promoteScheduled)) beforeRun.push(promoteScheduled);
/** 백스톱(속도-3) — 화면이 열릴 때 뒤에서 한 바퀴(next after — 렌더를 안 막는다). 크론이 하루에 한 번 더 돈다. 터져도 화면은 산다 */
export async function backstop() {
  try { const svc = serviceClient(); return await runDue(svc, await todayOf(svc)); }
  catch (e) { console.error("발송 백스톱:", e?.message ?? e); return null; }
}
/** 발송 판 — 파도 2(속도-상한 발송 6: 껍질 1 · 로그인 1 · 오늘 1 · 오늘 판 1 · send_board 1 = 5): 오늘 판 ∥ 한 벌(큐 · 자취 · 예약 · 닿는 길 · 규칙). 전부 학원 사람 자격 */
export async function sendBoard(sb, date, env = process.env) {
  const [sheetsQ, boardQ, phQ] = await Promise.all([
    db(sb).from("day_sheet").select("id,date,student_id,class_id,attend,closed_at,comment,comment_kind,comment_cap,students(name),late_stay(id,reason,until_at,sent_at)").eq("date", date).order("student_id"),
    db(sb).rpc("send_board", { p_on: date }),
    db(sb).from("placeholder").select("key,note,example,sort").order("sort"),   // 뼈대-8 치환 자리 설명은 표에
  ]);
  if (boardQ.error) throw new Error(`발송 판을 못 읽음: ${boardQ.error.message}`);
  const b = boardQ.data ?? {};
  const placeholders = phQ.error ? [] : (phQ.data ?? []);   // 표가 없는 DB(㉖ 전)면 빈 목록
  const now = new Date().toISOString();
  const sheets = rows(sheetsQ, "오늘 판").map((s) => ({ ...s, student_name: s.students?.name ?? "?", late: (s.late_stay ?? [])[0] ?? null }));
  const jobs = b.jobs ?? [], logs = b.logs ?? [], sch = b.scheduled ?? [], rules = b.rules ?? {};
  const sw = sinkSafe(env);   // (려) 스위치가 이상해도 화면은 연다 — 보내는 자리는 sinkOf 가 그대로 막는다
  return { date, now, rules, sink: sw.sink, sinkBad: sw.bad, reach: b.reach ?? null,
           late: lateRows(sheets, logs), daily: dailyRows(sheets, logs, sch, jobs), auto: autoRows(jobs, now), scheduled: scheduledRows(sch, jobs, sheets, now, date), sent: sentRows(logs), failWhy: failGroups(logs), placeholders,
           templates: b.templates ?? [], smsReady: Boolean(b.sms_ready), smsKinds: String(rules["send.sms_kinds"] ?? "").split(",").map((x) => x.trim()).filter(Boolean) };   // (커) ✉️ 문자 문구 · 문자 길(솔라피) — 판에 얹었다(조회를 안 늘린다)
}
async function closedSheets(sb, sheetIds) {
  const ids = [...new Set((sheetIds ?? []).filter(Boolean))]; if (!ids.length) throw new Error("고른 것이 없습니다");
  const { data, error } = await db(sb).from("day_sheet").select("id,closed_at,comment").in("id", ids);
  if (error) throw new Error(`판을 못 읽음: ${error.message}`);
  const bad = ids.map((id) => { const s = (data ?? []).find((x) => x.id === id); return !s ? "없는 판" : !s.closed_at ? "마감 안 한 판" : unfilled(s.comment).length ? "치환 자리 안 채운 판" : null; }).filter(Boolean);
  if (bad.length) throw new Error(`${[...new Set(bad)].join(" · ")} — 마감하고 치환 자리를 채운 뒤 보냅니다`);
  return ids;
}
/** 📨 선택한 것 지금 보내기 — 마감한 판만 → 큐 → 바로 한 바퀴(서버 답을 기다린다, 속도-5) */
export async function sendNow(sb, sheetIds) {
  const ids = await closedSheets(sb, sheetIds);
  for (const id of ids) await enqueue(sb, KINDS.daily, { sheet_id: id }, { table: "day_sheet", id });
  const svc = serviceClient();
  return runDue(svc, await todayOf(svc));
}
/** ⏰ 예약 — 오늘 저녁 · 내일 아침 · 직접. 같은 판에 살아 있는 예약이 둘일 수 없다(0075 유일 인덱스) */
export async function schedule(sb, sheetIds, choice, custom, by, today) {
  const ids = await closedSheets(sb, sheetIds);
  const at = whenAt(choice, today, await ruleMap(sb, ["send."]), custom);
  if (at <= new Date().toISOString()) throw new Error("지난 때입니다 — 「지금 보내기」를 쓰세요");
  const { data, error } = await db(sb).from("scheduled_send").insert(ids.map((sheet_id) => ({ kind: "daily", sheet_id, at, created_by: by ?? null }))).select("id");
  if (error) throw new Error(error.code === "23505" ? "이미 예약된 판이 있습니다 — 예약된 것에서 취소한 뒤 다시" : `예약을 못 넣음: ${error.message}`);
  return { n: (data ?? []).length, at };
}
/** (어) 월간 리포트·수강료 안내 예약(확정-㉕) — 아이·달로 맨다(body = 달). 살아 있는 예약은 아이·갈래·달마다 하나(0151 색인). 때가 되면 promoteScheduled 가 그때 상태로 보낸다 */
export async function scheduleFor(sb, kind, ym, studentIds, choice, custom, by, today) {
  if (!["monthly", "fee"].includes(kind)) throw new Error(`예약할 수 있는 갈래가 아닙니다: ${kind}`);
  if (!isYm(ym)) throw new Error(`달이 아닙니다: ${ym}`);
  const ids = [...new Set((studentIds ?? []).filter(Boolean))]; if (!ids.length) throw new Error("예약할 아이가 없습니다");
  const at = whenAt(choice, today, await ruleMap(sb, ["send."]), custom);
  if (at <= new Date().toISOString()) throw new Error("지난 때입니다 — 「지금 보내기」를 쓰세요");
  const { data, error } = await db(sb).from("scheduled_send").insert(ids.map((student_id) => ({ kind, student_id, body: ym, at, created_by: by ?? null }))).select("id");
  if (error) throw new Error(error.code === "23505" ? "이미 예약된 아이가 있습니다 — 발송 10 의 예약된 것에서 취소한 뒤 다시" : `예약을 못 넣음: ${error.message}`);
  return { n: (data ?? []).length, at };
}
/** 예약 취소 — 지우지 않고 cancelled_at(대전제-6). 0줄이면 실패(검사-⑪) */
export async function cancelScheduled(sb, id) {
  const { data, error } = await db(sb).from("scheduled_send").update({ cancelled_at: new Date().toISOString() }).eq("id", id).is("sent_at", null).is("cancelled_at", null).select("id");
  if (error) throw new Error(`취소 못 함: ${error.message}`);
  if (!(data ?? []).length) throw new Error("이미 나갔거나 취소된 예약입니다");
}
/** 다시 보내기 — 자취의 why 그대로 같은 갈래의 일을 큐에 다시 넣고 바로 한 바퀴 */
export async function resend(sb, logId) {
  const { data: l, error } = await db(sb).from("notify_log").select("id,kind,student_id,sheet_id,why").eq("id", logId).maybeSingle();
  if (error) throw new Error(`자취를 못 읽음: ${error.message}`); if (!l) throw new Error("자취가 없습니다");
  const id = l.why?.id ?? null;
  const job = l.kind === "daily" ? [KINDS.daily, { sheet_id: l.sheet_id }]
    : l.kind === "late" ? [KINDS.late, { sheet_id: l.sheet_id, late_id: id }]
    : l.kind === "arrival" || l.kind === "leave" ? [KINDS[l.kind], { student_id: l.student_id, arrival_id: id }]
    : l.kind === "plan_absent" || l.kind === "plan_late" ? [KINDS.plan, { student_id: l.student_id, kind: l.kind === "plan_absent" ? "absent" : "late", plan_id: id }]
    : null;
  if (!job) throw new Error(`다시 보낼 수 없는 갈래: ${l.kind}`);
  await enqueue(sb, job[0], job[1], l.why ?? null);
  const svc = serviceClient();
  return runDue(svc, await todayOf(svc));
}
/** (커) ✉️ 문자 문구 저장 — 원장님이 발송 10 에서 고친다(확정-71). 틀은 v2.msg_template 한 곳(0154) · 치환 자리는 그대로 둔다(보낼 때 채운다) */
/** (뎌-2) 앱 알림과 **함께 문자로도** 보낼 갈래 — 발송 10 에서 켜고 끈다(규칙 send.sms_kinds 한 줄 · 코드에 안 박는다) */
export async function setSmsKinds(sb, kinds) {
  const list = [...new Set((Array.isArray(kinds) ? kinds : []).map(String))].filter((k) => SMS_ALSO.some(([x]) => x === k));
  changed(await db(sb).from("rule").update({ value: list.join(",") }).eq("key", "send.sms_kinds").select("key"), "문자 갈래를 못 적음");
  return { kinds: list };
}
export async function saveTemplate(sb, kind, body) {
  if (!TEMPLATES.some(([k]) => k === kind)) throw new Error(`고칠 수 있는 문구가 아닙니다: ${kind}`);
  const text = String(body ?? "").trim(); if (!text) throw new Error("문구가 비었습니다");
  const len = lenText(text); if (len.over) throw new Error(`문자가 너무 깁니다 — ${len.text}`);
  changed(await db(sb).from("msg_template").update({ body: text, updated_at: new Date().toISOString() }).eq("kind", kind).select("kind"), "문구를 못 적음");
  return { kind, ...len };
}
