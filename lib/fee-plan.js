/** 수강료 판단 한 벌(순수, 목업 13) — 단가 줄(언제부터 얼마: 학생 › 반 › 학년별 기준) · 특강은 회차만큼 · 그 달 줄(금액·받은 날·상태) · 합계 · 금액을 바꾸면 이 달부터 새 단가 줄(처음-1 돈의 이력) · 결제선생 엑셀 읽기(열 이름 후보).
 *  청구액은 저장하지 않는다 — 받은 금액(payment.amount)과 받은 날만 적는다(대전제-5 · 인수인계 s13 「금액 넣고 받은 날 체크가 전부」) */
import { LEVEL_CHAR } from "./neis-plan.js";
import { classText, sessionsOf } from "./schedule-plan.js";
import { plusDays } from "./day-plan.js";
export const won = (n) => (n == null || n === "" ? "" : `${Number(n).toLocaleString("ko-KR")}원`);
export const parseWon = (s) => { const d = String(s ?? "").replace(/[^\d-]/g, ""); return d ? parseInt(d, 10) : null; };
export const STATE = Object.freeze({ paid: "받음", unpaid: "안 받음", none: "금액 없음" });
/** 옛 설정 tuition.byGrade 의 열쇠 — 「중2」 「고1」 */
export const gradeKey = (level, grade) => (grade ? `${LEVEL_CHAR[level] ?? ""}${grade}` : null);
const lastOf = (ym) => plusDays(plusDays(`${ym}-01`, 31).slice(0, 7) + "-01", -1);
const alive = (rules, ym) => rules.filter((r) => r.from_date <= lastOf(ym) && (!r.to_date || r.to_date >= `${ym}-01`)).sort((a, b) => String(b.from_date).localeCompare(String(a.from_date)));
/** 이 아이의 이 달 단가 줄 — 학생 줄 › 반 줄. 없으면 null */
export function ruleFor(student, rules = [], ym) {
  const live = alive(rules, ym);
  const mine = live.find((r) => r.student_id === student.id); if (mine) return { ...mine, source: "학생" };
  for (const c of student.classes ?? []) { const cr = live.find((r) => r.class_id === c.id && !r.student_id); if (cr) return { ...cr, source: "반", class: c }; }
  return null;
}
/** 제안 금액 — 단가 줄(특강은 단가 × 그 달 회차) › 학년별 기준. 없으면 null(「아직 안 적음」) */
export function suggested(student, rules = [], byGrade = {}, ym) {
  const r = ruleFor(student, rules, ym);
  if (r) {
    if (r.per_session) { const cls = r.class ?? (student.classes ?? []).find((c) => c.kind === "special") ?? null; const n = cls ? sessionsOf(cls).n : 0; return { amount: r.amount * n, source: `${r.source} 단가 ${won(r.amount)} × ${n}회`, perSession: true, sessions: n }; }
    return { amount: r.amount, source: `${r.source} 단가`, perSession: false };
  }
  const k = gradeKey(student.level, student.grade), g = k != null ? byGrade?.[k] : null;
  if (g != null && g !== "") return { amount: Number(g), source: `학년 기준 ${k}`, perSession: false };
  return { amount: null, source: null, perSession: false };
}
/** 그 달 줄 — 아이마다 반 · 금액(받은 금액이 있으면 그것, 없으면 제안) · 받은 날 · 상태 */
export function rowsOf(board, ym) {
  const rules = board.rules ?? [], pays = board.payments ?? [], byGrade = board.by_grade ?? {};
  return (board.students ?? []).map((st) => {
    const pay = pays.find((p) => p.student_id === st.id) ?? null, sug = suggested(st, rules, byGrade, ym);
    const amount = pay?.amount ?? sug.amount;
    const classes = st.classes ?? [];
    return { student_id: st.id, name: st.name, classes, classText: classes.map((c) => classText(c)).join(" · ") || "반 없음", special: classes.filter((c) => c.kind === "special").map((c) => sessionsOf(c).n),
             amount, suggested: sug.amount, source: sug.source, paid_on: pay?.paid_on ?? null, method: pay?.method ?? null, payment_id: pay?.id ?? null,
             state: amount == null ? "none" : pay?.paid_on ? "paid" : "unpaid" };
  });
}
export function totals(rows = []) {
  const sum = rows.filter((r) => r.amount != null).reduce((n, r) => n + Number(r.amount), 0);
  const unpaidRows = rows.filter((r) => r.state === "unpaid");
  return { sum, unpaid: unpaidRows.reduce((n, r) => n + Number(r.amount), 0), unpaidCount: unpaidRows.length, noneCount: rows.filter((r) => r.state === "none").length, paidCount: rows.filter((r) => r.state === "paid").length };
}
/** 금액을 바꾸면 단가 줄도 — 반·학년 기준과 같으면 아이 줄이 필요 없다 · 같은 아이 줄이 있으면 이 달부터 새 줄(지난달은 소급 안 됨, 처음-1) · 특강 회차제 줄은 안 건드린다 */
export function ruleChanges(student, rules = [], byGrade = {}, ym, amount) {
  if (amount == null) return { close: null, update: null, insert: null };
  const m1 = `${ym}-01`, live = alive(rules, ym), mine = live.find((r) => r.student_id === student.id) ?? null;
  const base = suggested(student, rules.filter((r) => r.student_id !== student.id), byGrade, ym).amount;
  if (mine?.per_session) return { close: null, update: null, insert: null };
  if (mine && Number(mine.amount) === Number(amount)) return { close: null, update: null, insert: null };
  if (!mine && base != null && Number(base) === Number(amount)) return { close: null, update: null, insert: null };
  if (mine && mine.from_date === m1) return { close: null, update: { id: mine.id, amount }, insert: null };
  return { close: mine ? { id: mine.id, to_date: plusDays(m1, -1) } : null, update: null, insert: { student_id: student.id, from_date: m1, amount, per_session: false } };
}
// ── 결제선생 같은 수납 엑셀 읽기 — 열 이름을 정확히 맞추라고 안 한다(후보 중 하나면 읽는다)
const pick = (row, keys) => { for (const k of Object.keys(row)) { const key = String(k).replace(/\s/g, ""); if (keys.some((c) => key === c || key.includes(c))) { const v = row[k]; if (v != null && String(v).trim() !== "") return String(v).trim(); } } return ""; };
export function parseDate(v, fallbackYear) {
  const t = String(v ?? "").trim(); if (!t) return null;
  const full = t.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/); if (full) return `${full[1]}-${String(full[2]).padStart(2, "0")}-${String(full[3]).padStart(2, "0")}`;
  const md = t.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})/); if (md && fallbackYear) return `${fallbackYear}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
  return null;
}
const toYM = (v, paidOn, fallbackYear) => { const s = String(v ?? "").trim(); const ym = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})/); if (ym) return `${ym[1]}-${String(ym[2]).padStart(2, "0")}`; const only = s.match(/^(\d{1,2})\s*월?$/); if (only) return `${fallbackYear}-${String(only[1]).padStart(2, "0")}`; return paidOn ? paidOn.slice(0, 7) : null; };
const UNPAID = ["미납", "미결제", "미수", "실패", "취소", "환불", "대기"];
/** 한 줄 → { name, ym, amount, paidOn, method, paid } */
export function parsePaymentRow(row, fallbackYear) {
  const name = pick(row, ["학생명", "학생이름", "이름", "성명", "학생"]);
  const paidOn = parseDate(pick(row, ["결제일", "납부일", "수납일", "입금일", "결제일시"]), fallbackYear);
  const ym = toYM(pick(row, ["청구월", "수강월", "해당월", "귀속월", "월"]), paidOn, fallbackYear);
  const status = pick(row, ["상태", "결제상태", "납부상태", "수납상태"]);
  const amount = parseWon(pick(row, ["결제금액", "납부금액", "수납액", "금액", "청구금액"]));
  const method = pick(row, ["결제수단", "수단", "결제방법"]) || null;
  const unpaid = UNPAID.some((w) => status.includes(w)), paid = !unpaid && (Boolean(paidOn) || /완료|성공|결제|납부|수납/.test(status));
  return { name, ym, amount, paidOn: paid ? paidOn : null, method, paid, status: status || null };
}
export const parseSheet = (rows = [], fallbackYear) => rows.map((r) => parsePaymentRow(r, fallbackYear)).filter((r) => r.name);
/** 엑셀로 내보낼 줄 */
export const exportRows = (rows = [], ym) => rows.map((r) => ({ 월: ym, 학생: r.name, 반: r.classText, 금액: r.amount ?? "", "받은 날": r.paid_on ?? "", 상태: STATE[r.state] }));

/** 학년별 기준(옛 설정 tuition.byGrade — 13 이 단가 줄 없는 아이의 제안에 쓴다) — 열쇠 열둘 · 값은 원 · 비우면 없앤다(0원이 아니다) · 4단계-4 */
export const GRADE_KEYS = Object.freeze(["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"]);
export function parseByGrade(f = {}) {
  const out = {};
  for (const k of GRADE_KEYS) { const raw = String(f[k] ?? "").trim(); if (raw === "") continue; const v = raw.replace(/[^\d]/g, ""); const n = Number(v); if (v === "" || !Number.isInteger(n) || n <= 0) throw new Error(`${k} 금액이 이상합니다: ${raw}`); out[k] = n; }
  return out;
}
/** 수납 방법 — 엑셀(결제선생)이 적어 주는 것과 같은 말. 화면에서는 이 넷 중에서 고른다 */
export const METHODS = Object.freeze(["계좌", "카드", "현금", "기타"]);
/** 지난달 안 받은 집 알약 글 — 「지난달 안 받음 1명 · 200,000원」 · 없으면 빈 글(알약 안 뜸) */
export const prevUnpaidText = (p) => (p?.n ? `지난달 안 받음 ${p.n}명 · ${won(p.sum)}` : "");
