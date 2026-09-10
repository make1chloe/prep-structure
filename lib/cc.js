/** 🃏 클래스카드 받는 손 — 확장이 보낸 짐을 v2.cc_planner 에 적는다(**서버 자신**만 · 0031 의 표를 그대로 쓴다 · 새 표 없음).
 *  열쇠는 연동(v2.integration) 'classcard' 줄의 token — 원장님이 설정 🔌 연동 열쇠에서 넣고 고친다(확정-72 · 코드·SQL 로 안 넣는다).
 *  판단(짐 읽기·모드·목표 대 실제)은 lib/cc-plan.js(순수) 한 벌 · 받는 길은 app/api/cc/route.js 하나(대전제-7 과 같은 뜻).
 *  **안 이은 아이디**는 막지 않고 센다 — 그 이름을 연동 줄의 last_error 에 남겨, 원장님이 14 에서 이어 주시면 다음 짐부터 들어간다. */
import { createHash, timingSafeEqual } from "node:crypto";
import { db, serviceClient } from "./supabase.js";
import { changed, row, rows } from "./sqlError.js";
import { parsePayload } from "./cc-plan.js";
/** 열쇠 견주기 — 길이가 달라도 시간이 안 새게 해시로 견준다(둘 다 없으면 거짓) */
export function sameToken(a, b) {
  const x = String(a ?? ""), y = String(b ?? ""); if (!x || !y) return false;
  const h = (s) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(x), h(y));
}
export async function ccToken(svc = serviceClient()) {
  const r = row(await db(svc).from("integration").select("config").eq("id", "classcard").maybeSingle(), "클래스카드 열쇠를 못 읽음");
  return String(r?.config?.token ?? "").trim() || null;
}
/** 짐 받기 — 이은 아이의 줄만 적고(같은 아이·날·세트는 덮어쓴다), 마감일 달력에 그날을 남긴다.
 *  마지막으로 받은 때(연동 줄 last_ok_at)는 대시보드 「수신이 N일째 없습니다」가 읽는다(0153 은 cc_planner 의 fetched_at 을 본다 — 둘 다 이 손이 남긴다) */
export async function receive(svc, body, now = new Date()) {
  const { people, dropped, rows: got } = parsePayload(body);
  const at = now.toISOString();
  const idxs = [...new Set(people.map((p) => p.cc_user_idx))];
  const links = idxs.length ? rows(await db(svc).from("cc_student").select("student_id,cc_user_idx").in("cc_user_idx", idxs), "이은 아이") : [];
  const by = new Map(links.map((l) => [l.cc_user_idx, l.student_id]));
  const put = [], dues = new Map(), unlinked = [];
  for (const p of people) {
    const sid = by.get(p.cc_user_idx);
    if (!sid) { unlinked.push(p.cc_login_id ? `${p.cc_login_id}(${p.cc_user_idx})` : p.cc_user_idx); continue; }
    for (const r of p.rows) { put.push({ student_id: sid, ...r, fetched_at: at }); dues.set(`${sid}|${r.date}`, { student_id: sid, date: r.date }); }
  }
  if (put.length) changed(await db(svc).from("cc_planner").upsert(put, { onConflict: "student_id,date,set_name" }).select("id"), "받은 것을 못 적음");
  if (dues.size) changed(await db(svc).from("cc_due").upsert([...dues.values()], { onConflict: "student_id,date", ignoreDuplicates: true }).select("student_id"), "마감일을 못 적음", { zero: "ok" });   /* 0줄 허용 — 이미 있는 날이면 안 바뀐다 */
  const why = [unlinked.length ? `안 이은 클래스카드 아이디 ${unlinked.length}: ${unlinked.slice(0, 5).join(" · ")}` : null,
               dropped.length ? `못 읽은 줄 ${dropped.length}` : null].filter(Boolean).join(" · ") || null;
  changed(await db(svc).from("integration").upsert({ id: "classcard", last_ok_at: at, last_error: why }).select("id"), "받은 때를 못 적음");
  return { got, saved: put.length, linked: people.length - unlinked.length, unlinked, dropped };
}
/** (뎌-4) 그날 그 아이들의 플래너 줄 — 오늘 수업 01 의 🃏 카드가 그린다. **화면 파도에 태운다**(속도-1 · 조회 하나) */
export async function ccDay(sb, studentIds, date) {
  const ids = [...new Set((studentIds ?? []).filter(Boolean))];
  if (!ids.length) return [];
  return rows(await db(sb).from("cc_planner").select("id,student_id,date,set_name,set_type,complete,learn_status,cards,goals,got,skipped_at,fetched_at")
    .eq("date", date).in("student_id", ids).order("set_name"), "클래스카드 플래너");
}
/** (뎌-4) 「⏭ 목표 미달 넘기기」 — **앱이 스스로 안 넘긴다**(확정-⑱). 원장님이 누른 것만 적고, 다시 누르면 되돌린다.
 *  줄을 지우지 않는다(대전제-6) · 확장이 다시 받아 적어도 이 자국은 안 지워진다(보내는 칸에 없다) */
export async function ccSkip(sb, id, on, who = null) {
  if (!id) throw new Error("어느 줄인지가 없습니다");
  const patch = on ? { skipped_at: new Date().toISOString(), skip_by: who ?? null } : { skipped_at: null, skip_by: null };
  changed(await db(sb).from("cc_planner").update(patch).eq("id", id).select("id,skipped_at"), "넘긴 것을 못 적음");
  return { id, skipped: Boolean(on) };
}
/** 그 아이의 클래스카드 아이디(학생 14 가 그린다) — 없으면 null */
export async function ccOf(sb, studentId) {
  if (!studentId) return null;
  return row(await db(sb).from("cc_student").select("cc_user_idx,cc_login_id,updated_at").eq("student_id", studentId).maybeSingle(), "클래스카드 아이디를 못 읽음");
}
/** 아이 ↔ 클래스카드 아이디 잇기(학생 14) — 아이마다 한 줄(student_id 가 열쇠) · **다시 이으면 덮어쓴다**(대전제-6 — 줄을 지우지 않는다 · 잘못 이었으면 바른 아이디로 다시 잇는다) */
export async function linkCc(sb, studentId, ccUserIdx, ccLoginId = null) {
  const idx = String(ccUserIdx ?? "").trim(); if (!idx) throw new Error("클래스카드 아이디를 적어 주세요");
  if (idx.length > 40) throw new Error("클래스카드 아이디가 너무 깁니다");
  changed(await db(sb).from("cc_student").upsert({ student_id: studentId, cc_user_idx: idx, cc_login_id: String(ccLoginId ?? "").trim() || null, updated_at: new Date().toISOString() }, { onConflict: "student_id" }).select("student_id"), "클래스카드 아이디를 못 이음");
  return { cc_user_idx: idx };
}
