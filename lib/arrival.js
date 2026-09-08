/** 등원·하원 쓰기 한 벌(아이 화면 07) — 관문(학원 회선, v2.integration arrival) → 등원 표(v2.arrival)에 한 줄(아이 자격 — 시각·날짜는 DB 문지기가 서버 시계로, 표-10)
 *  → 출석(2)이면 판 세우기·출결은 **서버 자신(service role)이 원장 손과 같은 길(ensureSheet·attendanceWrite)로** — 아이 자격은 판을 못 깐다(sheet_book·day_item 은 학원 사람만)
 *  → 어머니께 알림은 큐(arrival_notice · leave_notice — 실제 발송 손은 10). 판단(도착 시각·지각 분·회선)은 lib/arrival-plan.js(순수) */
import { db } from "./supabase.js";
import { ensureSheet } from "./day.js";
import { attendanceWrite } from "./attend.js";
import { enqueue } from "./queue.js";
import { STEPS, LEAVE, ipAllowed, lateMinutes } from "./arrival-plan.js";
import { changed } from "./sqlError.js";
/** 제 학생 줄 — 아이 계정 하나에 학생 하나 */
export async function myStudent(sb, profileId) {
  const { data, error } = await db(sb).from("students").select("id,name,grade,school_id,schools(name,level)").eq("profile_id", profileId).eq("state", "active").limit(1).maybeSingle();
  if (error) throw new Error(`내 학생 줄을 못 읽음: ${error.message}`);
  if (!data) throw new Error("학생 줄이 없습니다 — 원장님이 「재원생」에서 이 계정을 아이와 이어야 합니다");
  return data;
}
/** 등원 설정 — 학원 회선 주소들 · 유예 분(0078). 줄이 없으면 던진다(조용히 통과하지 않는다) */
export async function arrivalCfg(sb) {
  const { data, error } = await db(sb).from("integration").select("config").eq("id", "arrival").maybeSingle();
  if (error) throw new Error(`등원 설정을 못 읽음: ${error.message}`);
  if (!data) throw new Error("등원 설정 줄이 없다(integration arrival) — 0078 의 씨앗을 본다");
  return { ips: Array.isArray(data.config?.ips) ? data.config.ips : [], graceMin: Number(data.config?.graceMin) || 0 };
}
/** 원장님이 학원에서 한 번 누른다 — 그 자리의 주소를 학원 회선에 더한다(답 ⑨ 「로그인한 아이피를 자동 인식해 추가·저장」) */
export async function allowIp(sb, ip, note = "") {
  if (!ip) throw new Error("주소를 못 읽었습니다");
  const cfg = await arrivalCfg(sb);
  if (cfg.ips.includes(ip)) return { added: false, ips: cfg.ips };
  const ips = [...cfg.ips, ip];
  changed(await db(sb).from("integration").update({ config: { ips, graceMin: cfg.graceMin, note }, updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", "arrival"), "학원 회선을 못 적음");
  return { added: true, ips };
}
/** 아이가 걸음을 찍는다. sb = 아이 자격(등원 표) · svc = 서버 자신(판·출결·큐) */
export async function stamp(sb, svc, { studentId, step, classId = null, date, ip, start = null }) {
  const n = Number(step);
  if (!STEPS.some(([k]) => k === n) && n !== LEAVE) throw new Error(`걸음이 아닙니다: ${step}`);
  const cfg = await arrivalCfg(svc);
  if (!ipAllowed(ip, cfg.ips)) throw new Error("학원 와이파이에서만 눌러집니다");
  const { data: row, error } = await db(sb).from("arrival").insert({ student_id: studentId, date, step: n }).select("id,at").single();   // 시각·날짜는 문지기(arrival_stamp)가 서버 시계로 덮는다
  if (error) throw new Error(error.code === "23505" ? "이미 찍었어요" : `못 찍음: ${error.message}`);
  if (n === 2) {
    const s = await ensureSheet(svc, studentId, classId, date);   // 원장 손과 같은 길 — 검사 줄·루틴이 같이 선다
    if (!s.closed_at) await attendanceWrite(svc, s.id, lateMinutes(row.at, start, cfg.graceMin) > 0 ? "late" : "present");
    await enqueue(svc, "arrival_notice", { student_id: studentId, date, arrival_id: row.id }, { table: "arrival", id: row.id });
  }
  if (n === LEAVE) await enqueue(svc, "leave_notice", { student_id: studentId, date, arrival_id: row.id }, { table: "arrival", id: row.id });
  return { at: row.at };
}
