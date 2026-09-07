/** 밖으로 나가는 길 — 이 한 곳(대전제-7). 자취(v2.notify_log)를 먼저 남기고, 스위치(NOTIFY_SINK)가 허락한 기기에만 보낸다.
 *  off(기본)면 자취에 sink=off 로 남고 sent_at 은 빈다 — 「안 보냈다」가 사실(0069). 미리보기·리허설이 학부모 폰에 진짜로 뜨는 일이 구조적으로 없다.
 *  self 면 학원 사람 기기에만(원장님 폰으로 시험) · live 면 진짜. 서버 자신(service role)만 부른다 — 사람은 notify_log 에 못 쓴다(0017).
 *  한 통 = 받는 사람(학부모 계정) 하나의 자취 한 줄. 기기가 여럿이면 짐마다 그 줄 번호(r)를 싣는다 — 폰이 받은 때·누른 때를 그 번호로 회신한다(mark_notify_seen) */
import { db } from "./supabase.js";
import { pushToAll } from "./push.js";
import { isStaff } from "./roles.js";
import { payloadFor, sinkOf, mayPush, pickDevices, labelOf, titleFor } from "./notify-plan.js";
const rows = (r, what) => { if (r?.error) throw new Error(`${what}을 못 읽음: ${r.error.message}`); return r?.data ?? []; };
async function integration(svc, id) { const { data, error } = await db(svc).from("integration").select("config").eq("id", id).maybeSingle(); if (error) throw new Error(`연동을 못 읽음 ${id}: ${error.message}`); return data?.config ?? null; }
/** 한 아이의 가족에게 알림 한 통. 돌려주는 것: { sink, logged, sent, failed } — 「한 통도 안 갔다」는 failed 로 보인다(조용히 성공처럼 안 돌아간다) */
export async function notify(svc, { kind, studentId, url = "/parent", tag = null, why = null, sheetId = null, jobId = null, who = "parent" }, env = process.env) {
  if (!labelOf(kind)) throw new Error(`알림 갈래가 아닙니다: ${kind}`);
  if (!studentId) throw new Error("누구의 알림인지(studentId)가 없습니다");
  const sink = sinkOf(env), now = new Date().toISOString();
  const [linksQ, academy, oldQ, childQ] = await Promise.all([
    db(svc).from("parent_student").select("parent_profile_id").eq("student_id", studentId),
    integration(svc, "academy"),
    jobId ? db(svc).from("notify_log").select("id,profile_id,sent_at").eq("job_id", jobId) : Promise.resolve({ data: [] }),
    who === "student" ? db(svc).from("students").select("profile_id").eq("id", studentId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // 받는 사람 — 학부모(기본) · who=all 이면 학부모 + 아이 기기 · who=student 면 아이 계정만(공지 「학생」 — 4단계-6: 자취도 아이 줄에)
  const parents = who === "student" ? [childQ?.data?.profile_id].filter(Boolean) : [...new Set(rows(linksQ, "학부모").map((l) => l.parent_profile_id).filter(Boolean))];
  if (childQ?.error) throw new Error(`아이 계정을 못 읽음: ${childQ.error.message}`);
  const title = titleFor(kind, academy?.name);
  const base = { student_id: studentId, kind, title, url, tag: tag ?? `chloe-${kind}`, sink, why, sheet_id: sheetId, job_id: jobId, sent_at: null };   // sent_at 은 실제로 나갔을 때만(0118 이 기본값 now() 를 걷었다 — 그래도 명시한다)
  // 자취 — 받는 사람마다 한 줄. 같은 일을 다시 시도하면 이미 있는 줄을 채운다(자취가 늘지 않게)
  const old = rows(oldQ, "자취");
  if (!parents.length) {
    if (!old.length) { const { error } = await db(svc).from("notify_log").insert({ ...base, profile_id: null, failed_at: now, fail_why: who === "student" ? "아이 계정이 없습니다" : "학부모 계정이 이 아이와 이어져 있지 않습니다" }); if (error) throw new Error(`자취를 못 남김: ${error.message}`); }
    return { sink, logged: 1, sent: 0, failed: 1, why: who === "student" ? "아이 계정 없음" : "학부모 계정 없음" };
  }
  const missing = parents.filter((p) => !old.some((o) => o.profile_id === p));
  const ins = missing.length ? await db(svc).from("notify_log").insert(missing.map((profile_id) => ({ ...base, profile_id }))).select("id,profile_id") : { data: [] };
  const logs = [...old, ...rows(ins, "자취")];
  const logOf = new Map(logs.map((l) => [l.profile_id, l.id]));
  // 기기 — 학부모 기기(+ who=all 이면 아이 기기). 스위치가 off 면 여기서 끝(자취만)
  if (sink === "off") return { sink, logged: logs.length, sent: 0, failed: 0 };
  const orParts = [`profile_id.in.(${parents.join(",")})`, ...(who === "all" || who === "student" ? [`student_id.eq.${studentId}`] : [])];
  const subsQ = await db(svc).from("push_sub").select("id,profile_id,student_id,endpoint,p256dh,auth,revoked_at").is("revoked_at", null).or(orParts.join(","));
  let devices = pickDevices({ subs: rows(subsQ, "기기"), parents, studentId, who });
  if (sink === "self" && devices.length) {   // 학원 사람 기기에만 — 원장님 폰 시험
    const owners = rows(await db(svc).from("profiles").select("id,role").in("id", [...new Set(devices.map((d) => d.profile_id))]), "기기 주인");
    devices = devices.filter((d) => mayPush(sink, { staff: isStaff(owners.find((o) => o.id === d.profile_id)?.role) }));
  }
  const keys = await integration(svc, "push");
  let res;
  try { res = devices.length ? await pushToAll(keys, devices, (d) => payloadFor({ kind, academy: academy?.name, url, tag: base.tag, r: logOf.get(d.profile_id) ?? null })) : { sentTo: [], gone: [], fails: [] }; }
  catch (e) {   // 열쇠가 없는 것 같은 통째 실패 — 자취에 남기고 큐 일도 실패로(원장님께 뜬다)
    await db(svc).from("notify_log").update({ failed_at: now, fail_why: String(e?.message ?? e).slice(0, 300) }).in("id", logs.map((l) => l.id));
    throw e;
  }
  if (res.gone.length) await db(svc).from("push_sub").update({ revoked_at: now }).in("id", res.gone);   // 끈 기기 — 지우지 않는다(대전제-6)
  let sent = 0, failed = 0;
  for (const [profileId, logId] of logOf) {
    const mine = devices.filter((d) => d.profile_id === profileId);
    const okDev = mine.filter((d) => res.sentTo.includes(d.id));
    const patch = okDev.length ? { sent_at: now, failed_at: null, fail_why: null }
      : { failed_at: now, fail_why: mine.length ? (res.fails.find((f) => f.profile_id === profileId)?.why ?? "보내지 못했습니다") : (sink === "self" ? "학원 사람 기기가 아니라 안 보냄(NOTIFY_SINK=self)" : "알림을 켠 기기가 없습니다") };
    if (okDev.length) sent++; else failed++;
    const { error } = await db(svc).from("notify_log").update(patch).eq("id", logId);
    if (error) throw new Error(`자취를 못 적음: ${error.message}`);
  }
  return { sink, logged: logs.length, sent, failed };
}
