/** 나이스 학사일정 판단 한 벌(순수, 목업 12b · 확정-㊲) — 주소 만들기 · 답 읽기 · 줄 → 일 · 이름 펴기 · 갈래(전국은 원장님의 낱말 목록 v2.exam_word 로) · 여러 날 잇기 · 회차 후보(학교 기간 · 전국 하루) · 출처 열쇠 · (저) 받아온 것과 있던 줄 견주기(기간이 옮겨진 회차는 옛 줄에 — 0152).
 *  망을 타지 않는다 — 인터넷 없이 검사한다(check-neis). 옛 앱 lib/neis.js 의 셈을 한 벌로 옮겼다(두 벌이 어긋났던 2026-08-09 사고) */
const NEIS = "https://open.neis.go.kr/hub";
export const ymd = (d) => String(d ?? "").replaceAll("-", "");
/** 20260302 → 2026-03-02 */
export function toDate(s) { const v = String(s ?? "").trim(); return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null; }
/** 학년도 — 3월 1일부터 다음 해 2월 말일까지. 1·2월이면 지난 3월에 시작한 학년도 */
export function schoolYear(today) {
  const y = Number(String(today).slice(0, 4)), m = Number(String(today).slice(5, 7));
  const start = m >= 3 ? y : y - 1, last = new Date(Date.UTC(start + 1, 2, 0)).getUTCDate();
  return { year: start, from: `${start}-03-01`, to: `${start + 1}-02-${String(last).padStart(2, "0")}` };
}
export function schoolUrl(key, name) { const p = new URLSearchParams({ Type: "json", pIndex: "1", pSize: "50", SCHUL_NM: name }); if (key) p.set("KEY", key); return `${NEIS}/schoolInfo?${p}`; }
export function scheduleUrl(key, { atpt, schul }, from, to, page = 1) {
  const p = new URLSearchParams({ Type: "json", pIndex: String(page), pSize: "1000", ATPT_OFCDC_SC_CODE: atpt, SD_SCHUL_CODE: schul, AA_FROM_YMD: ymd(from), AA_TO_YMD: ymd(to) });
  if (key) p.set("KEY", key);
  return `${NEIS}/SchoolSchedule?${p}`;
}
/** 학교 코드 한 칸(v2.schools.neis_code) = 「교육청코드:학교코드」 */
export const makeCode = (atpt, schul) => (atpt && schul ? `${atpt}:${schul}` : null);
export function parseCode(code) { const [atpt, schul] = String(code ?? "").split(":"); return atpt && schul ? { atpt, schul } : null; }
/** 나이스 답 읽기 — 잘 됐을 때 { 블록: [{head:[...]}, {row:[...]}] } · 안 됐을 때 { RESULT: {CODE, MESSAGE} }. 「데이터가 없습니다」(INFO-200)는 잘못이 아니다 */
export function readNeis(json, block) {
  if (!json) return { rows: [], code: null, message: "답이 비어 있어요.", empty: false };
  if (json.RESULT) { const { CODE, MESSAGE } = json.RESULT; return { rows: [], code: CODE ?? null, message: MESSAGE ?? "", empty: CODE === "INFO-200" }; }
  const box = json[block];
  if (!Array.isArray(box)) return { rows: [], code: null, message: "모르는 모양의 답이 왔어요.", empty: false };
  const head = box.find((x) => x?.head)?.head ?? [], result = head.find((x) => x?.RESULT)?.RESULT ?? {};
  const total = head.find((x) => x && "list_total_count" in x)?.list_total_count ?? null;
  return { rows: box.find((x) => x?.row)?.row ?? [], total: total == null ? null : Number(total), code: result.CODE ?? null, message: result.MESSAGE ?? "", empty: false };
}
export function whyFailed(code, message) {
  const M = { "INFO-200": "그 기간에는 학사일정이 없어요.", "ERROR-290": "나이스 인증키가 맞지 않아요. 연동(neis)의 key 를 다시 넣어주세요.", "ERROR-300": "필요한 값이 빠졌어요 (학교 코드나 기간).", "ERROR-333": "날짜 모양이 맞지 않아요.", "ERROR-336": "한 번에 너무 많이 달라고 했어요.", "ERROR-337": "오늘 쓸 수 있는 횟수를 다 썼어요. 내일 다시 해주세요.", "ERROR-500": "나이스 쪽에서 문제가 생겼어요. 잠시 뒤에 다시 해주세요.", "ERROR-600": "나이스가 지금 바빠요. 잠시 뒤에 다시 해주세요.", "INFO-300": "인증키가 없거나 승인되지 않았어요." };
  return M[code] ?? message ?? "나이스가 답하지 못했어요.";
}
export const toSchool = (r = {}) => ({ name: r.SCHUL_NM ?? "", atpt: r.ATPT_OFCDC_SC_CODE ?? "", atptName: r.ATPT_OFCDC_SC_NM ?? "", schul: r.SD_SCHUL_CODE ?? "", kind: r.SCHUL_KND_SC_NM ?? "", address: r.ORG_RDNMA ?? "" });
const GRADE_FIELD = ["ONE_GRADE_EVENT_YN", "TW_GRADE_EVENT_YN", "THREE_GRADE_EVENT_YN", "FR_GRADE_EVENT_YN", "FIV_GRADE_EVENT_YN", "SIX_GRADE_EVENT_YN"];
export const gradesOf = (row = {}) => GRADE_FIELD.flatMap((f, i) => (String(row[f] ?? "").trim().toUpperCase() === "Y" ? [i + 1] : []));
/** 학교 급 글자 — DB level(elem·middle·high) → 초·중·고 */
export const LEVEL_CHAR = Object.freeze({ elem: "초", middle: "중", high: "고" });
export const levelOf = (school = {}) => LEVEL_CHAR[school.level] ?? (/고/.test(school.name ?? "") ? "고" : /중/.test(school.name ?? "") ? "중" : /초/.test(school.name ?? "") ? "초" : "");
const gradeCount = (levelChar) => (levelChar === "초" ? 6 : 3);
const OFF = /(방학|휴업|휴교|휴일|재량|공휴|개교기념|개천절|한글날|광복절|현충일|삼일절|성탄|크리스마스|어린이날|설날|추석|부처님|석가탄신|신정|새해|대체휴)/, ASSESS = /(수행|성취도|진단평가|학업성취)/, SCHOOL_EXAM = /(고사|지필|시험|평가)/, SKIP = /(토요휴업일|토요휴무|휴업토요일)/;
/** 전국인가 — 원장님의 낱말 목록(v2.exam_word)으로만 판정한다(확정-㊲: 낱말 목록을 원장님이 고칠 수 있게) */
export const isNational = (name = "", words = []) => words.some((w) => w && String(name).includes(w));
/** 전국 이름 펴기 — 수능 · 모의고사(학평 = 모평 = 모의고사, 원장님 2026-08-07) */
export function commonName(name = "") {
  const s = String(name).replace(/[（(][^)）]*[)）]/g, " ").replace(/(고|중)?\s*[1-3]\s*[·,~\-]\s*[1-3]\s*(학년)?/g, " ").replace(/(고|중)\s*[1-3]\s*(학년)?/g, " ").replace(/[1-9]?[0-9]\s*월/g, " ").replace(/\s*(실시|시행|예정)\s*$/g, " ").replace(/\s+/g, " ").trim();
  if (/대학수학능력|수능/.test(s)) return "대학수학능력시험";
  if (/전국연합|학력평가|모의평가|모의고사|모평|학평/.test(s)) return "모의고사";
  return s || String(name).trim();
}
/** 내신 이름 펴기 — 1회고사 · 1차고사 · 제2차 지필평가 → 「1학기 중간고사」 꼴. 학기는 이름에 있으면 그것, 없으면 날짜로(3~7월 1학기) */
export function examName(name = "", date = "") {
  const raw = String(name).trim(); if (!raw) return raw;
  if (ASSESS.test(raw) || !SCHOOL_EXAM.test(raw)) return raw;
  const semIn = raw.match(/([12])\s*학기/), month = Number(String(date).slice(5, 7));
  const sem = semIn ? Number(semIn[1]) : month >= 3 && month <= 7 ? 1 : month ? 2 : null;
  if (!sem) return raw;
  if (/중간/.test(raw)) return `${sem}학기 중간고사`;
  if (/기말/.test(raw)) return `${sem}학기 기말고사`;
  const n = raw.match(/제?\s*([1-4])\s*[회차]/); if (!n) return raw;
  const num = Number(n[1]);
  if (num >= 3) return `2학기 ${num === 3 ? "중간" : "기말"}고사`;
  return `${sem}학기 ${num === 1 ? "중간" : "기말"}고사`;
}
/** 갈래 — 쉬는 날이 먼저(「대수능시험 휴업일」은 시험이 아니다) › 전국(낱말 목록) › 평가(수행·성취도 — 회차 아님) › 내신 지필 › 행사 */
export function kindOf(name = "", sbtr = "", words = []) {
  if (/휴업/.test(sbtr) || OFF.test(name)) return "off";
  if (isNational(name, words)) return "national";
  if (ASSESS.test(name)) return "assess";
  if (SCHOOL_EXAM.test(name)) return "exam";
  return "event";
}
/** 나이스 줄 하나 → 일 하나(없으면 null) */
export function toEvent(row = {}, school = {}, words = []) {
  const date = toDate(row.AA_YMD); let raw = String(row.EVENT_NM ?? "").trim();
  if (!raw && date && /휴업/.test(row.SBTR_DD_SC_NM ?? "")) { const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); if (dow !== 0 && dow !== 6) raw = "재량휴업일"; }
  if (!date || !raw || SKIP.test(raw)) return null;
  const kind = kindOf(raw, row.SBTR_DD_SC_NM ?? "", words);
  const name = kind === "national" ? commonName(raw) : kind === "exam" ? examName(raw, date) : raw;
  return { date, name, raw, kind, grades: gradesOf(row), level: levelOf(school), school_id: school.id ?? null, school: school.name ?? "", note: String(row.EVENT_CNTNT ?? "").trim() || null };
}
const nextDay = (d) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
/** 주말만 건너뛰어 이어지나(평일이 비면 끊긴 것) */
export function bridged(from, to) { let d = nextDay(from); for (let i = 0; i < 3; i++) { if (d === to) return true; const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); if (dow !== 0 && dow !== 6) return false; d = nextDay(d); } return false; }
/** 같은 날 같은 이름을 하나로(학년마다 한 줄씩 주는 학교) · 여러 날을 기간으로(주말은 건너뛴다) */
export function mergeRuns(events = []) {
  const same = new Map();
  for (const e of events) { const k = `${e.date}|${e.name}`; const had = same.get(k); if (!had) same.set(k, { ...e, grades: [...(e.grades ?? [])] }); else for (const g of e.grades ?? []) if (!had.grades.includes(g)) had.grades.push(g); }
  const sorted = [...same.values()].sort((a, b) => a.name.localeCompare(b.name, "ko") || a.date.localeCompare(b.date));
  const out = [];
  for (const e of sorted) {
    const last = out.at(-1);
    if (last && last.name === e.name && bridged(last.to, e.date)) { last.to = e.date; for (const g of e.grades) if (!last.grades.includes(g)) last.grades.push(g); continue; }
    out.push({ ...e, from: e.date, to: e.date, grades: [...e.grades] });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name, "ko"));
}
/** 학교 회차 후보 — 내신 지필 기간마다 한 줄(학년이 하나만이면 학년을 적는다). 출처 열쇠 = 학교코드:이름:시작날 */
export function examPeriods(runs = [], school = {}) {
  return runs.filter((r) => r.kind === "exam").map((r) => {
    const gs = [...new Set(r.grades)].filter((g) => g >= 1), one = gs.length === 1 && gs.length < gradeCount(r.level);
    return { scope: "school", school_id: school.id, school: school.name, grade: one ? gs[0] : null, name: r.name, term_from: r.from, term_to: r.to, source: "neis", source_key: `school:${school.code ?? ""}:${r.name}:${r.from}` };
  });
}
/** 전국 회차 후보 — 모의고사는 학년마다 하루씩(학년마다 시험지가 다르다) · 수능·나머지는 하루 한 줄. 학교가 아홉 곳이어도 열쇠가 같아 한 줄 */
export function nationalRows(runs = []) {
  const out = new Map();
  for (const r of runs.filter((x) => x.kind === "national")) {
    if (r.name === "모의고사" && r.level && r.level !== "초") {
      const gs = r.grades.length ? r.grades : [];
      for (const g of gs) { const key = `common:${ymd(r.from)}:모의고사:${r.level}${g}`; if (!out.has(key)) out.set(key, { scope: "national", school_id: null, grade: g, name: `${r.from.slice(0, 4)}년 ${Number(r.from.slice(5, 7))}월 ${r.level}${g} 모의고사`, term_from: r.from, term_to: r.from, english_on: r.from, source: "neis", source_key: key }); }
      continue;
    }
    const key = `common:${ymd(r.from)}:${r.name}`;
    if (!out.has(key)) out.set(key, { scope: "national", school_id: null, grade: null, name: r.name, term_from: r.from, term_to: r.to, english_on: r.name === "대학수학능력시험" ? r.from : null, source: "neis", source_key: key });
  }
  return [...out.values()];
}
/** 받아온 것 전부 → 넣을 줄들 + 건너뛴 셈. 한 학교의 줄은 rows 로 */
export function planImport(bySchool = [], words = []) {
  const exams = [], skipped = { off: 0, event: 0, assess: 0 }, nat = [];
  for (const { school, rows } of bySchool) {
    const events = (rows ?? []).map((r) => toEvent(r, school, words)).filter(Boolean);
    for (const e of events) if (e.kind in skipped) skipped[e.kind]++;
    const runs = mergeRuns(events);
    exams.push(...examPeriods(runs, school));
    nat.push(...runs.filter((r) => r.kind === "national"));
  }
  const seen = new Set();
  for (const n of nationalRows(nat)) if (!seen.has(n.source_key)) { seen.add(n.source_key); exams.push(n); }
  return { exams, skipped };
}
/** (저) 받아온 후보와 있던 나이스 줄 견주기(0152 · 확정-69) — 같은 회차(갈래·학교·학년·이름)인데 기간이 다르면 「날짜 바뀜」. 열쇠에 시작날이 들어 있어(examPeriods · nationalRows)
 *  시작이 옮겨지면 새 줄이 될 뻔한 것을 옛 줄에 잇는다(id 그대로 — 범위·안 봄·교재 멈춤이 붙어 있다). 옛 줄 하나는 한 번만 잇는다 · 그대로인 것과 새 것은 fresh(열쇠로 upsert) */
export function diffExams(existing = [], planned = []) {
  const keys = new Set(planned.map((p) => p.source_key)), used = new Set();
  const same = (e, p) => e.scope === p.scope && (e.school_id ?? null) === (p.school_id ?? null) && (e.grade ?? null) === (p.grade ?? null) && e.name === p.name;
  const changed = [], fresh = [];
  for (const p of planned) {
    const e = existing.find((x) => !used.has(x.id) && x.source_key === p.source_key) ?? existing.find((x) => !used.has(x.id) && (x.state ?? "active") === "active" && !keys.has(x.source_key) && same(x, p));
    if (e) used.add(e.id);
    if (e && (String(e.term_from ?? "") !== String(p.term_from ?? "") || String(e.term_to ?? "") !== String(p.term_to ?? ""))) changed.push({ id: e.id, source_key: p.source_key, scope: p.scope, school: p.school ?? null, name: p.name, prev_term_from: e.term_from, prev_term_to: e.term_to, term_from: p.term_from, term_to: p.term_to, english_on: e.english_on ?? null });
    else fresh.push(p);
  }
  return { changed, fresh };
}
