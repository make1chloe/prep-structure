/** 학생 14 판단 한 벌(순수, DB 없음 — 목업 14 · 답 ⑩(하원 날짜별) · 원장님 9/3 「퇴원해도 줄은 남는다」 · 대전제-12). 한 벌(student_board)의 재료로 KPI 여섯 · 교재 막대 · 성적 줄·약한 영역 · 이 달 출결 · 단원평가 알약 · 지나온 것 · 재원 기간 · 목록 줄 · 고치기 양식 읽기를 센다 */
import { md, seoulDate } from "./dash-plan.js";
import { examShort, wrongSummary, gradeByCuts, cutsFor, gradeText, questionsFor, withTrend } from "./score-plan.js";
import { classText } from "./schedule-plan.js";
import { stopOn, STOP } from "./routine-plan.js";
export const STATE = Object.freeze([["active", "재원"], ["paused", "쉼"], ["left", "퇴원"]]);
export const stateName = (k) => STATE.find(([x]) => x === k)?.[1] ?? k;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
/** 「2024.03 ~ 재원 2년 7개월」 · 「2024.03 ~ 2026.05 퇴원」 · 들어온 날이 없으면 「들어온 날 없음」 */
export function tenureText(st, today) {
  if (!st?.joined_on) return st?.state === "left" ? `퇴원${st.left_on ? ` ${String(st.left_on).slice(0, 7).replace("-", ".")}` : ""}` : "들어온 날 없음";
  const ym = (d) => String(d).slice(0, 7).replace("-", ".");
  if (st.state === "left") return `${ym(st.joined_on)} ~ ${st.left_on ? ym(st.left_on) : ""} 퇴원`;
  const end = today ?? st.joined_on; const months = (Number(end.slice(0, 4)) - Number(st.joined_on.slice(0, 4))) * 12 + (Number(end.slice(5, 7)) - Number(st.joined_on.slice(5, 7)));
  const y = Math.floor(months / 12), mo = months % 12;
  return `${ym(st.joined_on)} ~ 재원 ${y ? `${y}년 ` : ""}${mo}개월`;
}
/** 학년 글 「중2」 */
export const gradeText2 = (level, grade) => (grade == null || grade === "" ? "" : `${level === "high" ? "고" : level === "middle" ? "중" : level === "elem" ? "초" : ""}${grade}`);
export const classLine = (c) => (c ? classText({ nickname: c.nickname, weekdays: c.weekdays ?? [], start_time: c.start_time }) : "반 없음");
/** KPI 여섯 — 숙제 % · 단어 통과율 · 단원평가 n/m · 출석 n/m(결석 k) · 3주 안 늦귀가 · 이달 경고(반성문). 재료가 0이면 「—」 */
export function kpis(k = {}, rules = {}) {
  const hw = pct(k.hw_done ?? 0, k.hw_total ?? 0), word = pct(k.word_pass ?? 0, k.word_total ?? 0);
  const repeat = parseInt(rules["late.repeat_count"] ?? "3", 10) || 3, days = parseInt(rules["late.repeat_days"] ?? "21", 10) || 21;
  const warnN = Number(k.warn?.count ?? 0), disposal = k.warn?.today_disposal ?? null, due = Boolean(k.warn?.due);
  return [
    { key: "hw", emo: "📘", big: hw == null ? "—" : `${hw}%`, small: "이번 달 숙제", bad: hw != null && hw < 70 },
    { key: "word", emo: "🔤", big: word == null ? "—" : `${word}%`, small: "단어 통과율", bad: word != null && word < 70 },
    { key: "ut", emo: "📝", big: k.ut_total ? `${k.ut_pass}/${k.ut_total}` : "—", small: "단원평가 통과", bad: Boolean(k.ut_total) && k.ut_pass < k.ut_total / 2 },
    { key: "att", emo: "🕘", big: k.att_total ? `${k.att_present}/${k.att_total}` : "—", small: `출석${k.att_absent ? ` · 결석 ${k.att_absent}` : ""}`, bad: Number(k.att_absent ?? 0) >= 2 },
    { key: "late", emo: "⏰", big: `${k.late21 ?? 0}회`, small: `늦귀가 · ${days}일 안`, bad: Number(k.late21 ?? 0) >= repeat },
    { key: "warn", emo: "⚠️", big: `${warnN}회`, small: `경고 · 이달${due ? " — 반성문 때" : disposal ? " — 반성문 1" : ""}`, bad: warnN >= 3 || due },
  ];
}
/** 교재 막대 — 「5 / 18」 · 「28%」 · 상태 꼬리표(stopOn 한 곳) */
export function bookLines(books = [], today) {
  return books.map((b) => { const st = stopOn(b, today); return { id: b.id, book_id: b.book_id, name: b.name, sub: `${b.round}회독 · ${b.order_basis === "chapter" ? "대단원 진행" : "소단원 진행"}${b.cursor ? ` · 지금 ${b.cursor}` : ""}`, done: Number(b.done ?? 0), total: Number(b.total ?? 0), pct: b.total ? Math.round((Number(b.done) / Number(b.total)) * 100) : 0, state: st, stateName: STOP.find(([k]) => k === st)?.[1] ?? st }; });
}
/** 성적 줄 — 짧은 이름 · 원점수 · 등급(학교 것 › 컷으로) · 틀린 영역(많은 순 · 첫째는 miss — 문항표는 적힌 것 › 모의고사 표준) · 추이(같은 갈래 지난 회차 대비 ▲▼ — 07·09 와 같은 한 벌 withTrend) */
export function scoreRows(scores = []) {
  return withTrend(scores.filter((s) => s.exam).map((s) => { const e = { ...s.exam, questions: s.exam.questions ?? [] }; const g = s.grade ?? gradeByCuts(s.raw, cutsFor(e)); const sum = wrongSummary(s.wrongs ?? [], questionsFor(e)); return { id: s.id, title: examShort(e), raw: s.raw, full: s.full_score ?? 100, grade: g == null ? "—" : gradeText(e.level, g), sum, pending: s.confirmed === false, kind: e.scope === "national" ? "mock" : "school", on: s.taken_on ?? s.exam.english_on ?? s.exam.term_from }; }));
}
/** 약한 영역 — 최근 N번(기본 3) 연속 같은 영역이 1등이면 「세 번 연속 어법에서 가장 많이 틀립니다」 */
export function weakText(rows = [], n = 3) {
  const tops = rows.slice(0, n).map((r) => r.sum?.[0]?.kind).filter(Boolean);
  if (tops.length < n || new Set(tops).size !== 1) return null;
  return { kind: tops[0], text: `${n === 3 ? "세" : n} 번 연속 ${tops[0]}에서 가장 많이 틀립니다`, hint: `${tops[0]} 교재 배정을 볼까요` };
}
const ATT_ICON = { present: ["✓", "i-ok"], late: ["⏰", "i-late"], absent: ["✕", "i-abs"], early: ["↩", "i-late"], online: ["💻", "i-ok"], makeup: ["↻", "i-mk"], off: ["·", "i-cls"] };
const hhmm = (ts) => (ts ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts)) : null);
/** 이 달 출결 — 날마다 아이콘 + 등원·하원 시각(답 ⑩ 하원 날짜별 기록) */
export function attendRow(list = []) { return list.filter((a) => a.attend).map((a) => { const [icon, cls] = ATT_ICON[a.attend] ?? ["?", "i-cls"]; return { date: a.date, attend: a.attend, icon, cls, title: `${md(a.date)} ${a.attend}${a.arrived_at ? ` · 등원 ${hhmm(a.arrived_at)}` : ""}${a.left_at ? ` · 하원 ${hhmm(a.left_at)}` : ""}`, arrived: hhmm(a.arrived_at), left: hhmm(a.left_at) }; }); }
/** 단원평가 알약 — 「관계사 21/25」 통과선으로 ok/bad */
export function unitChips(list = [], passPct = 80) { return list.filter((u) => u.state === "scored" && u.correct != null).map((u) => ({ id: u.id, text: `${u.topic ?? "분류 없음"} ${u.correct}/${u.q_count}`, ok: u.correct * 100 >= (u.q_count ?? 0) * passPct })); }
/** 지나온 것 — 등원 · 반 이동 · 교재 잇기·회독 올림 · 상담을 한 줄로 합쳐 새것부터 */
export function historyLines(h = {}, st = {}) {
  const out = [];
  if (st.joined_on) out.push({ on: st.joined_on, title: "등원", small: st.memo ? String(st.memo).split("\n")[0] : "", tag: null });
  if (st.state === "left" && st.left_on) out.push({ on: st.left_on, title: "퇴원", small: "줄은 남습니다(9/3)", tag: null });
  for (const c of h.classes ?? []) out.push({ on: c.from_date, title: "반", small: `${classLine(c.class)}${c.to_date ? ` ~ ${md(c.to_date)}` : ""}`, tag: c.to_date ? null : "이 날부터 회차·수강료가 갈립니다" });
  for (const b of h.books ?? []) out.push({ on: b.from_date, title: b.round > 1 ? "회독 올림" : "교재 잇기", small: `${b.name} ${b.round}회독${b.to_date ? ` ~ ${md(b.to_date)}` : ""}`, tag: b.round > 1 ? `${b.round - 1}회독 진도도 남음` : null });
  for (const c of h.consults ?? []) out.push({ on: seoulDate(c.at), title: "상담", small: `${c.way ?? ""}${c.body ? ` · ${String(c.body).slice(0, 40)}` : ""}`, tag: null });
  const rank = (x) => (x.title === "등원" ? 0 : 1);   // 같은 날이면 등원이 맨 뒤(첫 출발이 바닥)
  return out.sort((a, b) => String(b.on).localeCompare(String(a.on)) || rank(b) - rank(a)).map((x) => ({ ...x, ym: String(x.on).slice(0, 7).replace("-", ".") }));
}
/** 목록 줄 — 재원·퇴원 세어 알약 · 찾기(이름·학교·반) · 퇴원생은 뒤로 */
export function listRows(list = [], { q = "", show = "active" } = {}) {
  const needle = String(q ?? "").trim().toLowerCase();
  const rows = list.map((s) => ({ ...s, classText: classLine(s.class), gradeText: gradeText2(s.level, s.grade), booksText: (s.books ?? []).join(" · ") || "교재 없음", lastConsult: s.last_consult ? md(seoulDate(s.last_consult)) : "—", stateName: stateName(s.state) }));
  const filtered = rows.filter((s) => (show === "all" ? true : show === "left" ? s.state === "left" : s.state !== "left")).filter((s) => !needle || [s.name, s.school, s.classText, s.gradeText].some((x) => String(x ?? "").toLowerCase().includes(needle)));
  return { rows: filtered, active: list.filter((s) => s.state === "active").length, left: list.filter((s) => s.state === "left").length, paused: list.filter((s) => s.state === "paused").length };
}
/** 형제 알약 「👨‍👩‍👦 형 강민준(고1)」 — 이름과 학년만(누가 형인지는 모른다) */
export const siblingText = (sibs = []) => (sibs.length ? `👨‍👩‍👦 ${sibs.map((s) => `${s.name}${gradeText2(s.level, s.grade) ? `(${gradeText2(s.level, s.grade)})` : ""}`).join(" · ")}` : "");
const digits = (s) => String(s ?? "").replace(/[^0-9]/g, "");
/** 고치기 양식 읽기 — 이름 필수 · 학년 1~6(초)·1~3 · 전화는 숫자만(10~11자리) · 들어온 날은 날짜 */
export function parseStudent({ name, grade, schoolId, phone, parentPhone, memo, joinedOn }) {
  const nm = String(name ?? "").trim(); if (!nm) throw new Error("이름을 적으세요");
  const g = grade === "" || grade == null ? null : Number(grade); if (g != null && (!Number.isInteger(g) || g < 1 || g > 6)) throw new Error("학년은 1~6");
  const ph = digits(phone), pp = digits(parentPhone);
  if (ph && (ph.length < 10 || ph.length > 11)) throw new Error("아이 전화는 숫자 10~11자리"); if (pp && (pp.length < 10 || pp.length > 11)) throw new Error("학부모 전화는 숫자 10~11자리");
  if (joinedOn && !/^\d{4}-\d{2}-\d{2}$/.test(String(joinedOn))) throw new Error(`날짜가 아닙니다: ${joinedOn}`);
  return { name: nm, grade: g, school_id: schoolId || null, phone: ph || null, parent_phone: pp || null, memo: String(memo ?? "").trim() || null, joined_on: joinedOn || null };
}
/** 학생 아이디 제안 — 「chloe」 + 전화 뒤 4자리(없으면 오늘 MMDD). 꼴은 DB 한 곳(0034·0100 profiles_login_id_shape: chloe + 숫자 넷 · 폰 뒤 4자리가 겹치는 형제는 -2·-3 — 옛 앱 resolveLoginId 가 그렇게 냈고 실 DB 에 있다(2026-09-07)) */
export function suggestLoginId(st = {}, today = "") { const d = digits(st.phone || st.parent_phone).slice(-4); return `chloe${d || String(today).slice(5, 7) + String(today).slice(8, 10)}`; }
export const parseLoginId = (raw) => { let id = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, ""); if (/^[0-9]{4}$/.test(id)) id = `chloe${id}`; if (!/^chloe[0-9]{4}(-[0-9]{1,2})?$/.test(id)) throw new Error("학생 아이디는 chloe + 숫자 넷(예 chloe0515 · 폰 뒤 4자리가 겹치는 형제는 chloe0515-2)"); return id; };
/** 비밀번호 초기화를 해도 되나 — 앱이 발급한 계정만(대전제-12: 이관된 재원생·학부모 계정은 전환일까지 안 건드린다) */
export const canReset = (p) => Boolean(p?.issued_by_app);
export { md };
