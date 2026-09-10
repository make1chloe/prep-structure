/** 알림 판단 한 벌(순수) — 밖으로 나가는 길은 lib/notify.js 한 곳(대전제-7), 여기는 그 길이 쓰는 셈만: 갈래 이름 · 잠금화면 문구 · 스위치(NOTIFY_SINK) · 받는 기기 고르기 · 방해금지.
 *  화면(클라이언트)과 서버가 같은 것을 본다 */
import { seoulTime, plusDays, seoulStamp } from "./day-plan.js";
/** 갈래 → 안내 이름(옛 앱 lib/notify.js LABEL 의 말 그대로 — 어머니가 보시던 말). 등원·하원은 원장님 2026-08-23 */
export const LABEL = Object.freeze({ daily: "수업 안내", late: "늦은 귀가 안내", arrival: "등원 안내", leave: "하원 안내", plan_absent: "결석 예정 안내", plan_late: "지각 예정 안내", monthly: "월간 리포트", notice: "공지사항", welcome: "첫 등원 안내", video: "영상 안내", score: "성적 입력 안내", fee: "수강료 안내", schedule: "수업 일정 안내", guide: "상담 안내" });   // score·fee 는 4단계-2a(16 재촉 · 13 안내) · schedule 은 4단계-3b(12 그 달 일정 확정 → 학부모 · ㉚ 9/7)
export const KIND_NAMES = Object.freeze(Object.keys(LABEL));
export const labelOf = (kind) => LABEL[kind] ?? null;
/** 잠금화면에 적을 말 — 내용은 앱을 열어야 보인다(원장님 2026-08-07 「미리보기에서 내용 알 수 없게 해줘 … 눌러서 어플 들어와야 알 수 있게」). 자취(notify_log)에 본문 칸이 없는 까닭 */
export const OPEN_TO_SEE = "앱에서 확인해주세요.";
/** 제목 — 「[클로이영어] 수업 안내」(원장님 2026-08-07 「[클로이영어] 공지사항 이거면 됐지」). 이미 붙어 있으면 다시 안 붙인다 */
export function titleFor(kind, academy = "클로이영어") {
  const t = labelOf(kind); if (!t) throw new Error(`알림 갈래가 아닙니다: ${kind}`);
  const a = String(academy ?? "").trim();
  return !a || t.startsWith(`[${a}]`) ? t : `[${a}] ${t}`;
}
/** 한 통의 짐 — 다섯 칸(public/sw.js 계약: title · body · tag · url · r). r 은 자취 번호 — 폰이 받은 때·누른 때를 이 번호로 회신한다 */
export const payloadFor = ({ kind, academy, url = "/parent", tag = null, r = null }) => ({ title: titleFor(kind, academy), body: OPEN_TO_SEE, tag: tag ?? `chloe-${kind}`, url, r });
/** 스위치 — off(기본: 자취만 남기고 안 보낸다 · 미리보기·리허설이 학부모 폰에 뜨는 일이 구조적으로 없다) · self(학원 사람 기기에만 — 원장님 폰 시험) · live(진짜) */
export const SINKS = Object.freeze(["off", "self", "live"]);
export function sinkOf(env = {}) {
  const v = String(env.NOTIFY_SINK ?? "off").trim().toLowerCase();
  if (!SINKS.includes(v)) throw new Error(`NOTIFY_SINK 가 이상합니다: ${v} (off · self · live 중 하나)`);
  return v;
}
/** 이 기기에 보내도 되나 — 스위치와 기기 주인(학원 사람인가)으로만 정한다 */
export const mayPush = (sink, { staff = false } = {}) => sink === "live" || (sink === "self" && staff);
/** 받을 기기 고르기 — 학부모 기기(parent_student → push_sub.profile_id) + who=all 이면 아이 기기(push_sub.student_id). 끈 기기는 없는 것. 한 기기에 두 번 안 보낸다(아이 폰에 어머니가 로그인해 둔 집) */
export function pickDevices({ subs = [], parents = [], studentId = null, who = "parent" } = {}) {
  const seen = new Set(), out = [];
  for (const s of subs) {
    if (s.revoked_at) continue;
    const isParent = who !== "student" && parents.includes(s.profile_id), isChild = (who === "all" || who === "student") && studentId && s.student_id === studentId;   // student = 아이 기기만(공지 「학생」 · 4단계-6)
    if (!isParent && !isChild) continue;
    if (seen.has(s.endpoint)) continue;
    seen.add(s.endpoint); out.push(s);
  }
  return out;
}
const mins = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? "").trim()); if (!m) return null; return Number(m[1]) * 60 + Number(m[2]); };
/** 방해금지 — from 부터 to 전까지(밤을 넘는 창도). 시작·끝이 같거나 비면 방해금지 없음 */
export function inQuiet(hhmm, from, to) {
  const x = mins(hhmm), a = mins(from), b = mins(to);
  if (x == null || a == null || b == null || a === b) return false;
  return a < b ? x >= a && x < b : x >= a || x < b;
}
/** 미룰 때 — 서울 날짜의 to 가 아직 안 왔으면 오늘 to, 지났으면 내일 to (ISO) */
export function quietUntil(nowIso, seoulDate, to) { return seoulTime(nowIso) < to ? seoulStamp(seoulDate, to) : seoulStamp(plusDays(seoulDate, 1), to); }
