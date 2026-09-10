/** 신규 상담 18 판단 한 벌(순수, DB 없음 — 목업 18 「전화 끊고 바로」 · 등록 전환 일곱). 한 벌(inquiry_board)의 문의를 칸 다섯(🔥 오늘 답할 것 · 상담 잡힘 · 레벨 봄 · 등록 · 안 옴)으로 가르고, 카드 줄(연락 가림 · 몇 시간째 · 일정 글)과 양식 읽기를 센다 */
import { parseLoginId } from "./student-plan.js";
import { md } from "./dash-plan.js";
export const STAGES = Object.freeze([["new", "🔥 오늘 답할 것"], ["visit", "상담 잡힘"], ["test", "레벨 봄"], ["joined", "등록"], ["dropped", "안 옴"]]);
export const stageName = (k) => STAGES.find(([x]) => x === k)?.[1] ?? k;
export const WAYS = Object.freeze([["phone", "전화"], ["site", "홈페이지 설문"], ["visit", "방문"], ["intro", "소개"]]);
export const wayName = (k) => WAYS.find(([x]) => x === k)?.[1] ?? (k || "");
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const seoul = (ts) => { const d = new Date(ts); const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(d).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hm: `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`, wd: WD[d.getUTCDay()] }; };
/** 「9/3 수 16:00」 */
export function whenText(ts) { if (!ts) return ""; const s = seoul(ts); const wd = WD[new Date(`${s.date}T00:00:00Z`).getUTCDay()]; return `${md(s.date)} ${wd} ${s.hm}`; }
/** 「어제 21:14」 · 「오늘 09:10」 · 「8/22」 */
export function agoText(ts, today) { if (!ts) return ""; const s = seoul(ts); const n = Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${s.date}T00:00:00Z`)) / 86400000); return n === 0 ? `오늘 ${s.hm}` : n === 1 ? `어제 ${s.hm}` : md(s.date); }
/** 「12시간째 답 안 함」 — 들어온 때부터 지금까지 */
export function unansweredText(createdAt, now) { const h = Math.max(0, Math.floor((new Date(now) - new Date(createdAt)) / 3600000)); return h < 1 ? "방금 들어옴 — 답 안 함" : h < 48 ? `${h}시간째 답 안 함` : `${Math.floor(h / 24)}일째 답 안 함`; }
/** 연락 가림 「010-****-1234」 */
export const maskPhone = (p) => { const d = String(p ?? "").replace(/[^0-9]/g, ""); if (d.length < 8) return d ? "****" : ""; return `${d.slice(0, 3)}-****-${d.slice(-4)}`; };
/** 칸 다섯 — 문의를 단계로 가른다. 답 안 한 것(new · answered_at 없음)은 hot */
export function columnsOf(inquiries = [], today, now = null) {
  const nowIso = now ?? `${today}T12:00:00+09:00`;
  const card = (q) => ({ ...q, sub: [q.grade ? `${q.grade}학년` : null, q.school].filter(Boolean).join(" · ") || wayName(q.way), hot: q.stage === "new" && !q.answered_at, when: agoText(q.created_at, today), wayText: wayName(q.way), phoneText: maskPhone(q.phone),
    why: q.stage === "new" ? (q.answered_at ? `안내 보냄 ${agoText(q.answered_at, today)}` : unansweredText(q.created_at, nowIso)) : q.stage === "visit" ? (q.test_at ? "일정이 원장 달력에 떠 있습니다" : "레벨테스트를 아직 안 잡았습니다") : q.stage === "test" ? (q.suggest ? "제안 교재가 있습니다 — 등록 전환" : "제안 교재를 적어 두세요") : q.stage === "joined" ? "등록 전환에서 일곱이 저절로 됐습니다" : (q.why ? q.why : "사유를 적어 두면 다음에 참고합니다"),
    visitText: q.visit_at ? whenText(q.visit_at) : "안 잡힘", testText: q.test_at ? (q.visit_at && seoul(q.test_at).date === seoul(q.visit_at).date ? `${whenText(q.test_at)} 같은 날` : whenText(q.test_at)) : "안 잡힘" });
  const cards = inquiries.map(card);
  return { columns: STAGES.map(([key, label]) => ({ key, label, cards: cards.filter((c) => c.stage === key), urgent: key === "new" })), unanswered: cards.filter((c) => c.hot).length };
}
/** 문의 양식 읽기 — 이름 필수 · 전화 숫자 10~11 · 학년 1~6 · 갈래 */
export function parseInquiry({ name, phone, studentPhone, school, grade, way, body }) {
  const nm = String(name ?? "").trim(); if (!nm) throw new Error("이름을 적으세요");
  const d = String(phone ?? "").replace(/[^0-9]/g, ""); if (!d || d.length < 10 || d.length > 11) throw new Error("학부모 전화를 숫자 10~11자리로");
  const sp = String(studentPhone ?? "").replace(/[^0-9]/g, ""); if (sp && (sp.length < 10 || sp.length > 11)) throw new Error("아이 전화는 숫자 10~11자리");
  const g = grade === "" || grade == null ? null : Number(grade); if (g != null && (!Number.isInteger(g) || g < 1 || g > 6)) throw new Error("학년은 1~6");
  const w = WAYS.some(([k]) => k === way) ? way : "phone";
  return { name: nm, phone: d, student_phone: sp || null, school: String(school ?? "").trim() || null, grade: g, way: w, body: String(body ?? "").trim() || null };
}
/** 등록 전환 일곱 — 무엇이 저절로 되나(화면 설명 · 검사) */
export const SEVEN = Object.freeze([["student", "학생 등록", "이름·학년·학교·연락처가 상담에서 그대로"], ["accounts", "계정 발급", "학생·학부모 둘 다 · 첫 비밀번호 0000"], ["class", "반 배정", "요일·시각을 고르면 회차가 그날부터"], ["books", "교재 잇기", "레벨 결과에서 제안 · 기준·회차는 루틴 11 에서"], ["routine", "루틴", "영역 루틴이 저절로 — 짤 것이 없습니다"], ["fee", "결제선생 등록", "할 일에 카드로 섭니다"], ["welcome", "첫 등원 안내", "준비물·시간표 — 학부모 계정으로(문자는 아직)"]]);
/** 전환 양식 읽기 — 반 필수 · 교재 0개 이상 · 아이디 · 들어온 날 */
export function parseConvert({ classId, bookIds = [], loginId, joinedOn, extra = null }) {
  if (!classId) throw new Error("반을 고르세요");
  const ids = [...new Set((bookIds ?? []).filter(Boolean))];
  const id = parseLoginId(loginId);   // 아이디 꼴은 student-plan 한 곳(chloe + 숫자 넷 · 형제 -2) — 여기 한 벌 더 있던 것을 걷었다(원칙-1 · 2026-09-07)
  if (joinedOn && !/^\d{4}-\d{2}-\d{2}$/.test(String(joinedOn))) throw new Error(`날짜가 아닙니다: ${joinedOn}`);
  const add = String(extra ?? "").trim();   // (커) 이 아이에게만 덧붙이는 말 — 첫 등원 안내 문자의 {{덧붙임}}(비면 그 줄이 사라진다)
  if (add.length > 300) throw new Error("덧붙일 말은 300자 안으로");
  return { classId, bookIds: ids, loginId: id, joinedOn: joinedOn || null, extra: add || null };
}
/** 학교 이름 → 학교 줄(있는 것만 · 「중학교」 없이 적어도 앞이 같으면) */
export function matchSchool(name, schools = []) { const n = String(name ?? "").trim(); if (!n) return null; return schools.find((s) => s.name === n) ?? schools.find((s) => s.name.startsWith(n) || n.startsWith(s.name)) ?? null; }
export { md };
