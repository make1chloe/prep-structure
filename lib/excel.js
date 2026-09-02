/**
 * 엑셀 왕복 — 내려받기 · 미리보기 · 올리기
 *
 * 계획 「엑셀 왕복 — 기존 자료를 올릴 수 있게」 규칙 1~9 를 **한 벌로** 담는다.
 * 화면마다 따로 만들면 규칙 5(빈 칸)와 규칙 7(날짜)이 한 화면씩 빠진다.
 *
 * ⚠️ **첫 재적재보다 먼저** 있어야 한다 (계획 1단계 4번).
 *
 * 붙는 법 — DB 는 `{ query(sql, params) => {rows, rowCount} }` 얕은 어댑터로 **받는다.**
 *          (검사가 가짜 DB 를 끼워 실제로 돌린다 · scripts/check-excel.mjs)
 *
 * ─────────────────────────────────────────────────────────────
 * 규칙 아홉 — 어디에 사는가
 *   1 내려받기와 올리기가 같은 모양      → downloadRows() · makeWorkbook() · readWorkbook()
 *   2 첫 칸은 줄 번호 · 남의 표도 번호로 → ID_HEAD · readRef()
 *   3 없는 것을 임의로 만들지 않는다     → hold(…, choices) · apply({create})
 *   4 저장 전 미리보기                   → preview() · previewLines()
 *   5 빈 칸은 「손대지 말라」            → readCell() 의 skip · BLANK
 *   6 고르는 값 제약은 **DB 에서 읽는다** → loadPicks()  (여기 적으면 두 벌이 된다 · 원칙 1)
 *   7 날짜는 글자 YYYY-MM-DD 한 꼴       → readDate() · readYm() · opts.years
 *   8 올린 묶음마다 번호 · 되돌리기      → apply() 의 excel_run/excel_row · undo()
 *   9 파일에서 지운 줄은 안 지워진다     → preview().missing (늘 한 줄)
 * ─────────────────────────────────────────────────────────────
 *
 * ⚠️ **이 파일은 v2.excel_run · v2.excel_row 두 표를 쓴다** (0057_excel_run.sql · 적용됨).
 *    그 표가 없으면 `apply()` 가 그 자리에서 **실패한다**(조용히 넘어가지 않는다).
 *    미리보기·내려받기는 그 표 없이도 돈다.
 * ⚠️ `import_batch` 는 **갈래**(fixture·rehearsal·excel·import) 넷뿐이라
 *    「이번에 올린 그 묶음」을 못 가리킨다. 되돌리기의 번호는 `excel_run.id` 다.
 */

import XLSX from "xlsx";

/** 값을 **지우려면** 이 표식을 적는다. 그냥 빈 칸은 「손대지 말라」다 (규칙 5) */
export const BLANK = "(비움)";

/** 내려받은 파일의 **첫 칸** — 이게 없으면 올릴 때마다 같은 줄이 새로 생긴다 (규칙 2) */
export const ID_HEAD = "번호";

/** 가운뎃점 — 엑셀에 섞여 들어오는 네 글자를 다 자른다.
 *  ⚠️ 잘못 잘라도 이름이 안 맞아 **보류**로 떨어지므로 넉넉히 받는 쪽이 안전하다 */
const DOTS = new Set(["·", "ㆍ", "‧", "•"]);

/* ══════════════════════════════════════════════════════════════
   ① 칸 읽기 — 규칙 5 · 7 · `·` 가르기
   ══════════════════════════════════════════════════════════════ */

/**
 * `·` 로 자르되 **대괄호 안의 `·` 는 건너뛴다.**
 * ⚠️ 이걸 안 하면 「클카 문장훈련[입해석 · 낭독 · 녹음]」이 세 조각으로 갈려
 *    이관 첫날 학습항목이 40종이 아니라 **61종**으로 선다 (실측).
 */
export function splitDots(s) {
  const out = [];
  let buf = "", depth = 0;
  for (const ch of String(s ?? "")) {
    if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    if (DOTS.has(ch) && depth === 0) { out.push(buf); buf = ""; continue; }
    buf += ch;
  }
  out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

/**
 * 루틴 칸 한 개 → 항목 목록.
 * 「클카 문장훈련[입해석 · 낭독 · 녹음]」 = 항목 「클카 문장훈련」 + 체크리스트 셋.
 * 대괄호 짝이 안 맞으면 `broken` 을 세워 **보류**로 보낸다 (지어내지 않는다).
 */
export function parseItems(s) {
  return splitDots(s).map((one) => {
    const open = (one.match(/\[/g) || []).length;
    const close = (one.match(/\]/g) || []).length;
    if (open !== close) return { name: one, checks: [], broken: true };
    const m = /^([^[]+)\[([^\]]*)\]\s*$/.exec(one);
    if (!m) return { name: one, checks: [], broken: open > 0 };
    return { name: m[1].trim(), checks: splitDots(m[2]), broken: false };
  });
}

/**
 * 날짜 — **글자 `YYYY-MM-DD` 한 꼴만** 받는다 (규칙 7).
 *
 * ⚠️ 「연도를 못 읽으면 보류」만으로는 `.xlsx` 에서 **한 줄도 안 걸린다.**
 *    엑셀은 셀에 `12/30` 을 치는 그 자리에서 올해를 붙여 **날짜 숫자**로 저장하므로
 *    파일이 앱에 닿을 때 연도는 언제나 읽힌다 — 그 연도가 틀렸을 뿐이다.
 *    그래서 숫자·Date 는 **값이 멀쩡해 보여도** 받지 않는다.
 */
export function readDate(v) {
  if (typeof v === "number")
    return { ok: false, why: "엑셀 날짜 숫자다 — 셀을 텍스트로 두고 2026-03-01 처럼 적는다" };
  if (v instanceof Date)
    return { ok: false, why: "엑셀 날짜 값이다 — 글자 2026-03-01 로 적는다" };
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
    return { ok: false, why: `날짜는 글자 YYYY-MM-DD 한 꼴만 받는다 — 「${s}」` };
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    return { ok: false, why: `없는 날이다 — 「${s}」` };
  return { ok: true, value: s, year: y };
}

/** 달 — `YYYY-MM`. 엑셀은 `2026-08` 도 날짜로 바꾼다. 날짜와 같은 잣대 */
export function readYm(v) {
  if (typeof v === "number" || v instanceof Date)
    return { ok: false, why: "엑셀이 달을 날짜로 바꿨다 — 셀을 텍스트로 두고 2026-08 로 적는다" };
  const s = String(v ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s))
    return { ok: false, why: `달은 글자 YYYY-MM 한 꼴만 받는다 — 「${s}」` };
  return { ok: true, value: s, year: Number(s.slice(0, 4)) };
}

const YES = new Set(["o", "y", "yes", "true", "1", "예", "참", "네", "ㅇ"]);
const NO = new Set(["x", "n", "no", "false", "0", "아니오", "거짓", "아니요", "ㄴ"]);

function readBool(v) {
  if (typeof v === "boolean") return { ok: true, value: v };
  const s = String(v ?? "").trim().toLowerCase();
  if (YES.has(s)) return { ok: true, value: true };
  if (NO.has(s)) return { ok: true, value: false };
  return { ok: false, why: `O/X 로 적는다 — 「${s}」` };
}

function readInt(v) {
  const s = String(v ?? "").trim().replace(/,/g, "");
  if (!/^-?\d+$/.test(s)) return { ok: false, why: `숫자가 아니다 — 「${s}」` };
  return { ok: true, value: Number(s) };
}

function readNum(v) {
  const s = String(v ?? "").trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, why: `숫자가 아니다 — 「${s}」` };
  return { ok: true, value: Number(s) };
}

/* ══════════════════════════════════════════════════════════════
   ② 표 정의 — 어떤 표를 엑셀로 주고받나
   ⚠️ 칸 이름은 **v2 의 진짜 칸**이다 (2026-09-02 DB 에서 확인).
      고르는 값 목록은 **여기 안 적는다** — DB 에서 읽는다 (규칙 6 · 원칙 1).
   ══════════════════════════════════════════════════════════════ */

const c = (col, head, more = {}) => ({ col, head, type: "text", ...more });

export const SHEETS = {
  /* ── 이관이 주인 (전환 뒤 앱) — 엑셀은 처음 채우기·대량 수정 ── */
  books: {
    table: "books", title: "교재", owner: "이관",
    keys: [["code"], ["name"]],        // 교재ID 가 있으면 그걸로, 없으면 이름으로 (실측: 37권 중 12권만 ID)
    cols: [
      c("code", "교재ID", { heads: ["교재코드"] }),
      c("name", "교재명", { heads: ["교재", "사용교재", "책제목"] }),
      c("area", "영역", { pick: true }),
      c("publisher", "출판사"),
      c("pub_year", "출판년도", { type: "int" }),
      c("level", "레벨"),
      c("price", "교재비", { type: "int" }),
      c("buy_url", "구매링크"),
      c("chunk_depth", "배정겹", { pick: true }),
      c("order_basis", "도는차례", { pick: true }),
      c("unit_test", "단원평가", { type: "bool" }),
      c("state", "상태", { pick: true }),
    ],
  },

  units: {
    table: "units", title: "단원표", owner: "이관",
    scopeCol: "book_id",              // 규칙 9 를 「파일에 든 교재」로만 견준다
    oneSourceCol: "book_id",          // ⚠️ 자동 검사 ⑰ — 한 교재의 단원은 한 곳에서만
    keys: [["book_id", "chapter", "mid", "sub", "activity"]],
    keyNullable: ["mid", "sub"],       // 중·소단원은 비어도 열쇠로 쓴다 (DB 도 nulls not distinct)
    cols: [
      c("book_id", "교재번호", { type: "ref", nameHead: "교재명",
        ref: { table: "books", alias: "book_alias", aliasIdCol: "book_id" } }),
      c("chapter", "대단원", { fill: true }),   // 엑셀 병합 — 비면 윗줄에서 이어받는다
      c("mid", "중단원", { fill: true }),
      c("sub", "소단원"),                        // ⚠️ 활동명을 복사해 넣지 않는다
      c("activity", "활동명"),
      c("is_workbook", "워크북", { type: "bool" }),
      c("sort", "순번", { type: "int" }),
      c("page_start", "시작페이지", { type: "int" }),
      c("page_end", "끝페이지", { type: "int" }),
      c("q_count", "문항수", { type: "int" }),
      c("q_range", "문항범위"),
      c("gist", "핵심내용"),
      c("state", "상태", { pick: true }),
    ],
  },

  learn_items: {
    table: "learn_items", title: "학습 항목", owner: "이관",
    keys: [["name"]],
    cols: [
      c("name", "항목", { heads: ["학습항목", "항목명"] }),
      c("method", "하는법"),
      c("tool", "준비물"),
      c("checks", "체크리스트", { type: "list" }),
      c("state", "상태", { pick: true }),
      c("sort", "차례", { type: "int" }),
    ],
  },

  students: {
    table: "students", title: "학생", owner: "이관",
    keys: [["name"]],                 // ⚠️ 동명이인이면 후보 둘 → 보류
    cols: [
      c("name", "이름"),
      c("school_id", "학교번호", { type: "ref", nameHead: "학교", ref: { table: "schools" } }),
      c("grade", "학년", { type: "int" }),
      c("state", "재원상태", { pick: true }),
      c("progress_edit", "진도수정", { pick: true }),
    ],
  },

  /* ── 엑셀이 주인 (확정 ⑤) ── */
  area_routine: {
    table: "area_routine", title: "영역 루틴", owner: "엑셀",
    keys: [["area", "item_id", "place"]],
    cols: [
      c("area", "영역", { pick: true }),
      c("item_id", "항목번호", { type: "ref", nameHead: "항목",
        ref: { table: "learn_items" } }),
      c("place", "자리", { pick: true }),
      c("required", "필수", { type: "bool" }),
      c("sort", "차례", { type: "int" }),
    ],
  },

  material_type: {
    table: "material_type", title: "자료 종류", owner: "엑셀",
    keys: [["name"]],
    cols: [
      c("name", "자료종류"),
      c("steps", "걸음", { type: "list" }),
      c("state", "상태", { pick: true }),
      c("sort", "차례", { type: "int" }),
    ],
  },

  quiz_style: {
    table: "quiz_style", title: "시험지 문항표", owner: "엑셀",
    keys: [["student_id", "book_id", "round", "kind"]],
    keyNullable: ["student_id", "book_id"],   // 학생·교재가 비면 「모두에게」다
    cols: [
      c("student_id", "학생번호", { type: "ref", nameHead: "학생", ref: { table: "students" } }),
      c("book_id", "교재번호", { type: "ref", nameHead: "교재명",
        ref: { table: "books", alias: "book_alias", aliasIdCol: "book_id" } }),
      c("round", "회독", { type: "int" }),
      c("kind", "갈래", { pick: true }),
      c("mc_meaning", "객관식뜻", { type: "int" }),
      c("sa_meaning", "주관식뜻", { type: "int" }),
      c("mc_word", "객관식단어", { type: "int" }),
      c("sa_word", "주관식단어", { type: "int" }),
      c("first_hint", "첫글자힌트", { type: "bool" }),
      c("units_per", "한번에단원수", { type: "int" }),
      c("s_way", "문장방식", { pick: true }),
      c("cut_pct", "통과선", { type: "int" }),
    ],
  },

  /* ── 날짜가 든 표 — 규칙 7 이 가장 위험한 자리 ── */
  schools: {
    table: "schools", title: "학교", owner: "이관",
    keys: [["name"]],
    cols: [
      c("name", "학교명"),
      c("level", "학교급", { pick: true }),
      c("neis_code", "나이스코드"),
      c("site_url", "홈페이지"),
      c("state", "상태", { pick: true }),
    ],
  },

  exams: {
    table: "exams", title: "시험 회차", owner: "이관",
    keys: [["source", "source_key"], ["scope", "school_id", "grade", "name"]],
    keyNullable: ["school_id", "grade"],
    cols: [
      c("scope", "갈래", { pick: true }),
      c("school_id", "학교번호", { type: "ref", nameHead: "학교", ref: { table: "schools" } }),
      c("grade", "학년", { type: "int" }),
      c("name", "시험이름"),
      c("term_from", "기간시작", { type: "date" }),
      c("term_to", "기간끝", { type: "date" }),
      c("english_on", "영어시험일", { type: "date" }),   // ⚠️ 손으로 치는 자리
      c("source", "출처", { pick: true }),
      c("source_key", "출처열쇠"),
      c("state", "상태", { pick: true }),
    ],
  },

  score: {
    table: "score", title: "성적", owner: "이관",
    keys: [["student_id", "kind", "taken_on", "subject"]],
    cols: [
      c("student_id", "학생번호", { type: "ref", nameHead: "학생", ref: { table: "students" } }),
      c("exam_id", "시험번호", { type: "ref", nameHead: "시험이름", ref: { table: "exams" } }),
      c("kind", "갈래", { pick: true }),
      c("taken_on", "본날", { type: "date" }),           // ⚠️ 가장 위험한 자리
      c("subject", "과목"),
      c("raw", "원점수", { type: "int" }),
      c("full_score", "만점", { type: "int" }),
      c("grade", "등급", { type: "int" }),
      c("percentile", "백분위", { type: "num" }),
      c("by_who", "적은이", { pick: true }),
      c("confirmed", "확인함", { type: "bool" }),
      c("show_to", "누구에게", { pick: true }),
      c("note", "메모"),
    ],
  },

  payment: {
    table: "payment", title: "수납", owner: "이관",
    keys: [["student_id", "ym"]],
    cols: [
      c("student_id", "학생번호", { type: "ref", nameHead: "학생", ref: { table: "students" } }),
      c("ym", "달", { type: "ym" }),
      c("amount", "금액", { type: "int" }),
      c("paid_on", "낸날", { type: "date" }),
      c("method", "방법"),
      c("note", "메모"),
      c("source", "출처"),
    ],
  },
};

/** 그 표가 「몇 년 것인가」를 먼저 물어야 하는가 (규칙 7 셋째) */
export function needsYears(sheetKey) {
  return spec(sheetKey).cols.some((x) => x.type === "date" || x.type === "ym");
}

function spec(sheetKey) {
  const s = SHEETS[sheetKey];
  if (!s) throw new Error(`모르는 표다 — ${sheetKey}`);
  return s;
}

/**
 * SQL 에 끼울 수 있는 **표의 흰 목록**.
 * ⚠️ 모양만 보면(`/^[a-z_]+$/`) 아무 표나 들어온다 — 되돌리기(`undo`)의 표 이름은
 *    **DB 에 적힌 값**에서 오므로, 거기가 열려 있으면 그게 구멍이다.
 */
const OK_TABLES = new Set(["excel_run", "excel_row"]);
const OK_COLS = new Set(["id", "alias"]);
for (const s of Object.values(SHEETS)) {
  OK_TABLES.add(s.table);
  if (s.scopeCol) OK_COLS.add(s.scopeCol);
  for (const col of s.cols) {
    OK_COLS.add(col.col);
    if (!col.ref) continue;
    OK_TABLES.add(col.ref.table);
    if (col.ref.alias) OK_TABLES.add(col.ref.alias);
    if (col.ref.aliasIdCol) OK_COLS.add(col.ref.aliasIdCol);
  }
}

function safeName(t) {
  if (!OK_TABLES.has(String(t))) throw new Error(`엑셀 왕복이 다루지 않는 표다 — ${t}`);
  return t;
}
function safeCol(x) {
  if (!OK_COLS.has(String(x))) throw new Error(`엑셀 왕복이 다루지 않는 칸이다 — ${x}`);
  return x;
}

/* ══════════════════════════════════════════════════════════════
   ③ DB 읽기 — 얕은 어댑터만 쓴다
   ══════════════════════════════════════════════════════════════ */

/**
 * 고르는 값 목록을 **DB 에서 읽는다** (규칙 6).
 * ⚠️ 여기 목록을 적어 두면 같은 값이 두 벌이 된다(원칙 1) —
 *    DB 를 고쳐도 엑셀이 옛 목록으로 통과시킨다.
 * 제약이 아예 없으면 `null` 을 준다. 그 칸이 든 줄은 **보류**한다 —
 * 엑셀은 화면 제약을 뚫는 유일한 길이라, 목록에 없는 값이 그대로 들어간다.
 */
export async function loadPicks(db, table) {
  const r = await db.query(
    `select pg_get_constraintdef(c.oid) as def
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'v2' and t.relname = $1 and c.contype = 'c'`,
    [safeName(table)]
  );
  const out = {};
  for (const row of r.rows || []) {
    const def = String(row.def || "");
    const m = /\(?([a-z_]+)\s*=\s*ANY\s*\(ARRAY\[(.+?)\]\)/s.exec(def);
    if (!m) continue;
    const vals = [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
    if (vals.length) out[m[1]] = vals;
  }
  return out;
}

/**
 * **꼭 채워야 하는 칸**도 DB 에서 읽는다 (NOT NULL 인데 기본값이 없는 칸).
 * ⚠️ 여기 목록으로 적어 두면 DB 를 고쳤을 때 두 벌이 어긋난다 (원칙 1).
 */
export async function loadNeed(db, table) {
  const r = await db.query(
    `select column_name from information_schema.columns
      where table_schema = 'v2' and table_name = $1
        and is_nullable = 'NO' and column_default is null`,
    [safeName(table)]
  );
  return new Set((r.rows || []).map((x) => x.column_name));
}

async function loadRows(db, table, scopeCol, scopeVals) {
  const t = safeName(table);
  if (scopeCol && scopeVals && scopeVals.length) {
    const r = await db.query(`select * from v2.${t} where ${safeCol(scopeCol)} = any($1)`, [scopeVals]);
    return r.rows || [];
  }
  const r = await db.query(`select * from v2.${t}`, []);
  return r.rows || [];
}

/** 남의 표를 이름으로 찾을 때 쓸 목록. 별칭 표가 있으면 같이 읽는다 (규칙 2·3) */
async function loadRef(db, ref) {
  const t = safeName(ref.table);
  const r = await db.query(`select id, name from v2.${t}`, []);
  const byName = new Map();
  const ids = new Set();
  const put = (name, id) => {
    const k = String(name ?? "").trim();
    if (!k) return;
    if (!byName.has(k)) byName.set(k, []);
    if (!byName.get(k).includes(id)) byName.get(k).push(id);
  };
  for (const x of r.rows || []) { put(x.name, x.id); ids.add(String(x.id)); }
  if (ref.alias) {
    const a = await db.query(
      `select ${safeCol(ref.aliasIdCol)} as id, alias from v2.${safeName(ref.alias)}`, []);
    for (const x of a.rows || []) put(x.alias, x.id);
  }
  return { byName, ids };
}

/* ══════════════════════════════════════════════════════════════
   ④ 내려받기 — 올리기와 **같은 모양** (규칙 1·2)
   ══════════════════════════════════════════════════════════════ */

/** 머리줄 — 첫 칸은 늘 번호. 남의 표는 번호 + (참고용) 이름 */
export function headOf(sheetKey) {
  const s = spec(sheetKey);
  const head = [ID_HEAD];
  for (const col of s.cols) {
    head.push(col.head);
    if (col.nameHead) head.push(col.nameHead);
  }
  return head;
}

/** 날짜·달 열 — 내려받기가 **텍스트로 고정**할 열 (규칙 7 첫째) */
export function dateHeadsOf(sheetKey) {
  return spec(sheetKey).cols
    .filter((x) => x.type === "date" || x.type === "ym")
    .map((x) => x.head);
}

function outCell(col, v0) {
  const v = v0 instanceof Date ? ymd(v0) : v0;      // ⚠️ pg 는 date 를 Date 로 준다
  if (v === null || v === undefined) return "";
  if (col.type === "bool") return v ? "O" : "X";
  if (col.type === "list") return Array.isArray(v) ? v.join(" · ") : String(v);
  return String(v).trim();
}

/** DB 줄 → 엑셀 줄. 남의 표 이름은 **참고용**이라 못 찾으면 비워 둔다 */
export function rowsToCells(sheetKey, dbRows, refNames = {}) {
  const s = spec(sheetKey);
  return (dbRows || []).map((r) => {
    const line = [r.id ?? ""];
    for (const col of s.cols) {
      line.push(outCell(col, r[col.col]));
      if (col.nameHead) line.push(refNames[col.col]?.get(String(r[col.col])) ?? "");
    }
    return line;
  });
}

/** 내려받기 한 벌 — **모든 표에 둔다**(주인과 무관하다) */
export async function downloadRows(db, sheetKey, opts = {}) {
  const s = spec(sheetKey);
  const rows = await loadRows(db, s.table, opts.scopeCol, opts.scopeVals);
  const refNames = {};
  for (const col of s.cols) {
    if (col.type !== "ref") continue;
    const r = await db.query(`select id, name from v2.${safeName(col.ref.table)}`, []);
    refNames[col.col] = new Map((r.rows || []).map((x) => [String(x.id), x.name]));
  }
  return { head: headOf(sheetKey), rows: rowsToCells(sheetKey, rows, refNames),
           dateHeads: dateHeadsOf(sheetKey), sheet: sheetKey, title: s.title };
}

/**
 * 엑셀 파일로 굽는다.
 * ⚠️ 날짜 열은 셀 서식을 **텍스트(`@`)** 로 고정한다 — 엑셀이 도로 날짜 숫자로 바꾸지 못하게.
 * ⚠️ **다만 그 고정은 이미 있는 줄에만 걸린다.** 원장님이 파일 맨 밑에 줄을 더해
 *    거기 `12/30` 을 치면 엑셀은 그 셀을 날짜 숫자로 저장한다.
 *    → 그래서 진짜 방어선은 **올릴 때 보류**(readDate)다. 둘을 같이 둔다.
 */
export function makeWorkbook({ head, rows, dateHeads = [], title = "표" }) {
  const dateAt = new Set(head.map((h, i) => (dateHeads.includes(h) ? i : -1)).filter((i) => i >= 0));
  const aoa = [head, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 1; r <= rows.length; r++) {
    for (const cIdx of dateAt) {
      const ref = XLSX.utils.encode_cell({ r, c: cIdx });
      const cell = ws[ref];
      if (!cell) continue;
      cell.t = "s";
      cell.v = String(cell.v ?? "");
      cell.z = "@";
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(title).slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/**
 * 올라온 파일을 읽는다.
 * ⚠️ `raw:true` · `cellDates:false` — 날짜 셀을 **날짜 숫자 그대로** 받는다.
 *    여기서 Date 로 바꿔 주면 `12/30` 이 「올해 12월 30일」로 조용히 통과한다.
 */
export function readWorkbook(buf, sheetName) {
  const wb = XLSX.read(buf, { type: "buffer", raw: true, cellDates: false });
  const name = sheetName || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`시트가 없다 — ${name}`);
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const head = (aoa[0] || []).map((x) => String(x ?? "").trim());
  const rows = aoa.slice(1).map((line) => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = line[i] ?? null; });
    return o;
  });
  return { head: head.filter(Boolean), rows, sheetName: name };
}

/* ══════════════════════════════════════════════════════════════
   ⑤ 미리보기 — **여기가 핵심이다.** 바로 저장하지 않는다 (규칙 4·9)
   ══════════════════════════════════════════════════════════════ */

const EMPTY = (v) => v === null || v === undefined || String(v).trim() === "";

/** ⚠️ pg 는 `date` 칸을 **JS Date** 로 준다. 그대로 견주면 멀쩡한 줄이 죄다 「바뀜」으로 선다 */
function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const norm = (v) => (v instanceof Date ? ymd(v) : v);

function sameVal(a0, b) {
  const a = norm(a0);
  if (Array.isArray(a) || Array.isArray(b))
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return String(a).trim() === String(b).trim();
}

/** 자연키 한 줄 — 빈 칸과 NULL 은 같게 본다 (DB 도 `nulls not distinct` 다) */
const KEY_SEP = "\u0001";   // ⚠️ 그냥 이어붙이면 「ab|c」와 「a|bc」가 같은 열쇠가 된다
const keyOf = (cols, o) => cols.map((k) => String(norm(o[k]) ?? "").trim()).join(KEY_SEP);

/**
 * 한 칸을 읽는다 — 규칙 5 의 세 갈래가 여기서 갈린다.
 *   skip  빈 칸        → **손대지 않는다** (지우라는 뜻이 아니다)
 *   blank `(비움)`     → NULL 로 지운다
 *   value 값
 *   hold  못 읽는다    → 그 줄을 보류
 */
function readCell(raw, col, ctx) {
  if (EMPTY(raw)) return { kind: "skip" };
  const s = typeof raw === "string" ? raw.trim() : raw;
  if (s === BLANK) return { kind: "blank" };

  if (col.pick) {
    const list = ctx.picks?.[col.col];
    if (!list)
      return { kind: "hold", why: `「${col.head}」의 고르는 값 제약이 DB 에 없다 — 엑셀이 목록에 없는 값을 그대로 넣는다 (규칙 6)` };
    if (!list.includes(String(s)))
      return { kind: "hold", why: `「${col.head}」에 없는 값 — 「${s}」 (되는 값: ${list.join(" · ")})` };
    return { kind: "value", value: String(s) };
  }

  switch (col.type) {
    case "int": { const r = readInt(s); return r.ok ? { kind: "value", value: r.value } : { kind: "hold", why: `${col.head} — ${r.why}` }; }
    case "num": { const r = readNum(s); return r.ok ? { kind: "value", value: r.value } : { kind: "hold", why: `${col.head} — ${r.why}` }; }
    case "bool": { const r = readBool(s); return r.ok ? { kind: "value", value: r.value } : { kind: "hold", why: `${col.head} — ${r.why}` }; }
    case "date": case "ym": {
      const r = col.type === "date" ? readDate(s) : readYm(s);
      if (!r.ok) return { kind: "hold", why: `${col.head} — ${r.why}` };
      if (!ctx.years)
        return { kind: "hold", why: `${col.head} — 이 파일이 **몇 년 것인지**를 먼저 적어야 한다 (규칙 7)` };
      if (r.year < ctx.years[0] || r.year > ctx.years[1])
        return { kind: "hold", why: `${col.head} — ${r.year}년은 이 파일의 범위(${ctx.years[0]}~${ctx.years[1]}) 밖이다` };
      return { kind: "value", value: r.value };
    }
    case "list": {
      const parts = parseItems(s);
      const bad = parts.find((p) => p.broken);
      if (bad) return { kind: "hold", why: `${col.head} — 대괄호 짝이 안 맞는다 「${bad.name}」` };
      return { kind: "value", value: parts.map((p) => p.name) };
    }
    default:
      return { kind: "value", value: String(s) };
  }
}

/** 남의 표 — **번호가 먼저다.** 비었을 때만 이름으로 찾고, 후보가 둘 이상이면 보류 (규칙 2·3) */
function readRef(row, col, ctx) {
  const num = row[col.head];
  if (!EMPTY(num)) {
    const s = String(num).trim();
    if (s === BLANK) return { kind: "blank" };
    if (!ctx.refs[col.col].ids.has(s))
      return { kind: "hold", why: `${col.head} 「${s}」 — 앱에 없는 번호다` };
    return { kind: "value", value: s };
  }
  const name = col.nameHead ? row[col.nameHead] : null;
  if (EMPTY(name)) return { kind: "skip" };
  const hits = ctx.refs[col.col].byName.get(String(name).trim()) || [];
  if (hits.length === 1) return { kind: "value", value: String(hits[0]) };
  if (hits.length > 1)
    return { kind: "hold", why: `「${name}」이 ${hits.length}개다 — 번호로 가리켜야 한다`,
             choices: ["고르기", "다른 이름으로 등록", "만들자"], pick: hits };
  // 0개 — ⚠️ 앱이 임의로 만들지 않는다. 기본 단추는 **「다른 이름으로 등록」**
  return { kind: "hold", why: `「${name}」이 앱에 없다`,
           choices: ["다른 이름으로 등록", "만들자"], want: String(name).trim(),
           refTable: col.ref.table };
}

/**
 * 미리보기 — 「몇 줄 생김 · 몇 줄 바뀜 · 몇 줄 손 안 댐 · 몇 줄 보류」.
 *
 * @param db      { query }
 * @param sheetKey  SHEETS 의 열쇠
 * @param file    { head, rows } — readWorkbook() 이 준 것
 * @param opts    { years:[from,to], ownerOk }
 */
export async function preview(db, sheetKey, file, opts = {}) {
  const s = spec(sheetKey);
  const head = (file.head || []).map((h) => String(h ?? "").trim());
  const fileRows = file.rows || [];

  // ⓪ 주인이 다르면 **막지 말고 묻는다** (확정 ⑤)
  const ask = s.owner === "엑셀" ? null
    : `이 표(${s.title})의 주인은 「${s.owner}」입니다. 엑셀은 처음 채우기·대량 수정용입니다. 그래도 올릴까요?`;

  // ① 머리줄 → 칸. 파일에 있는 칸만 고친다 (규칙 5)
  const used = new Map();          // col.col -> col
  const knownHeads = new Set([ID_HEAD]);
  for (const col of s.cols) {
    const names = [col.head, ...(col.heads || [])];
    if (col.nameHead) names.push(col.nameHead);
    const hit = names.find((n) => head.includes(n));
    if (hit) used.set(col.col, col);
    for (const n of names) knownHeads.add(n);
  }
  const unknownHeads = head.filter((h) => h && !knownHeads.has(h));

  // ② 고르는 값·꼭 채울 칸은 **DB 에서** 읽는다 (규칙 6 · 원칙 1)
  const picks = await loadPicks(db, s.table);
  const need = await loadNeed(db, s.table);

  // ③ 남의 표 목록
  const refs = {};
  for (const col of used.values())
    if (col.type === "ref") refs[col.col] = await loadRef(db, col.ref);

  // ④ 대·중단원 이어받기 — 엑셀 병합으로 빈 칸이 온다
  const fillCols = [...used.values()].filter((x) => x.fill);
  const last = {};
  let filled = 0;
  const rows = fileRows.map((r) => {
    const o = { ...r };
    for (const col of fillCols) {
      if (EMPTY(o[col.head])) { if (!EMPTY(last[col.head])) { o[col.head] = last[col.head]; filled++; } }
      else last[col.head] = o[col.head];
    }
    return o;
  });

  const ctx = { picks, refs, years: opts.years || null };

  // ⑤ 줄마다 읽는다
  const add = [], change = [], same = [], hold = [];
  let untouchedCells = 0;
  const seenIds = new Set(), seenKeys = new Set(), scopeVals = new Set();

  const parsed = rows.map((row, i) => {
    const at = i + 2;                       // 엑셀 줄 번호 (머리줄이 1)
    const vals = {}, clears = new Set(), whys = [];
    let choices = null;
    for (const col of used.values()) {
      const got = col.type === "ref" ? readRef(row, col, ctx) : readCell(row[col.head], col, ctx);
      if (got.kind === "skip") { untouchedCells++; continue; }
      if (got.kind === "blank") { clears.add(col.col); continue; }
      if (got.kind === "hold") { whys.push(got.why); if (got.choices) choices = got.choices; continue; }
      vals[col.col] = got.value;
    }
    return { at, row, vals, clears, whys, choices, id: EMPTY(row[ID_HEAD]) ? null : String(row[ID_HEAD]).trim() };
  });

  for (const p of parsed)
    if (s.scopeCol && p.vals[s.scopeCol]) scopeVals.add(p.vals[s.scopeCol]);

  // ⚠️ 견주는 자리를 파일에 든 교재로 좁힌다 — 안 그러면 규칙 9 의 「파일에 없는 기존 줄」이
  //    한 권을 올렸는데 **온 교재의 단원 수**로 뜬다. 좁힐 값이 하나도 없으면 견줄 것도 없다
  const existing = (s.scopeCol && scopeVals.size === 0)
    ? [] : await loadRows(db, s.table, s.scopeCol, [...scopeVals]);
  const byId = new Map(existing.map((r) => [String(r.id), r]));

  // 자연키는 **여러 벌**일 수 있다 — 교재는 교재ID 가 있으면 그걸로, 없으면 이름으로
  const nullOk = new Set(s.keyNullable || []);
  const byKey = s.keys.map((ks) => {
    const m = new Map();
    for (const r of existing) {
      const k = keyOf(ks, r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  });
  /** 그 줄을 어느 열쇠로 가리나 — 비어도 되는 칸 말고는 다 채워져야 쓴다 */
  const pickKeySet = (vals) =>
    s.keys.findIndex((ks) =>
      ks.every((k) => nullOk.has(k) || (k in vals && String(vals[k] ?? "").trim() !== "")));

  // ⚠️ 한 교재의 단원은 한 곳에서만 들어온다 (자동 검사 ⑰)
  const twoSource = new Set();
  if (s.oneSourceCol)
    for (const r of existing)
      if (r.import_batch === "import") twoSource.add(String(r[s.oneSourceCol]));

  for (const p of parsed) {
    if (p.whys.length) {
      hold.push({ at: p.at, why: p.whys.join(" / "), choices: p.choices, row: p.row });
      continue;
    }
    // ⚠️ 이관이 이미 그 교재의 단원을 넣었다 — 엑셀은 **대조 기준으로만** 쓴다
    const scope = s.oneSourceCol ? String(p.vals[s.oneSourceCol] ?? "") : "";
    if (scope && twoSource.has(scope)) {
      hold.push({ at: p.at, twoSource: scope, row: p.row, vals: p.vals,
        why: "이 교재의 단원은 **이관이 넣는다.** 엑셀은 대조 기준으로만 쓴다 — 새 앱에 줄을 만들지 않는다 (자동 검사 ⑰)" });
      continue;
    }

    // ⚠️ 꼭 채워야 하는 칸은 「(비움)」으로 못 지운다 — 저장할 때 터지기 전에 여기서 잡는다
    const cantClear = [...p.clears].filter((cc) => need.has(cc));
    if (cantClear.length) {
      hold.push({ at: p.at, why: `${cantClear.join(" · ")}는 비울 수 없는 칸이다`, row: p.row });
      continue;
    }

    let target = null;
    if (p.id) {
      target = byId.get(p.id) || null;
      if (!target) { hold.push({ at: p.at, why: `${ID_HEAD} 「${p.id}」이 앱에 없다`, row: p.row }); continue; }
    } else {
      const ki = pickKeySet(p.vals);
      if (ki < 0) {
        hold.push({ at: p.at, row: p.row,
          why: `어느 줄인지 가릴 칸이 모자라다 — ${ID_HEAD} 또는 ${s.keys.map((ks) => ks.join("+")).join(" / ")}` });
        continue;
      }
      const k = ki + "|" + keyOf(s.keys[ki], p.vals);
      const hits = byKey[ki].get(keyOf(s.keys[ki], p.vals)) || [];
      if (hits.length > 1) {
        hold.push({ at: p.at, why: `같은 줄이 앱에 ${hits.length}개다 — ${ID_HEAD}로 가리켜야 한다`, row: p.row });
        continue;
      }
      target = hits[0] || null;
      if (seenKeys.has(k)) { hold.push({ at: p.at, why: "파일 안에 같은 줄이 두 번 있다", row: p.row }); continue; }
      seenKeys.add(k);
    }

    if (target) {
      if (seenIds.has(String(target.id))) { hold.push({ at: p.at, why: "파일 안에서 같은 줄을 두 번 고친다", row: p.row }); continue; }
      seenIds.add(String(target.id));
      const diffs = [];
      for (const [colName, v] of Object.entries(p.vals))
        if (!sameVal(target[colName], v)) diffs.push({ col: colName, from: target[colName], to: v });
      for (const colName of p.clears)
        if (!EMPTY(target[colName])) diffs.push({ col: colName, from: target[colName], to: null });
      if (diffs.length) change.push({ at: p.at, id: String(target.id), diffs });
      else same.push({ at: p.at, id: String(target.id) });
    } else {
      // 새로 생길 줄 — ⚠️ 「만들자」를 눌러야 실제로 만든다 (규칙 3)
      // 꼭 채워야 하는 칸은 **DB 가 안다** (NOT NULL 인데 기본값이 없는 칸)
      const miss = [...need].filter((k) => !(k in p.vals));
      if (miss.length) { hold.push({ at: p.at, why: `새 줄인데 꼭 채울 칸이 비었다 — ${miss.join(" · ")}`, row: p.row }); continue; }
      add.push({ at: p.at, vals: p.vals });
    }
  }

  // ⑥ 규칙 9 — 파일에 없는 기존 줄. **늘 센다** (0 이어도 한 줄 띄운다)
  const missing = existing.filter((r) => !seenIds.has(String(r.id))).length;

  const p = {
    sheet: sheetKey, table: s.table, title: s.title, owner: s.owner, ask,
    add, change, same, hold,
    counts: { add: add.length, change: change.length, same: same.length, hold: hold.length },
    missing, untouchedCells, filled, unknownHeads,
    picksMissing: s.cols.filter((x) => x.pick && used.has(x.col) && !picks[x.col]).map((x) => x.head),
  };
  p.lines = previewLines(p);
  return p;
}

/** 사람이 읽을 줄 — 화면이 이걸 그대로 띄운다 */
export function previewLines(p) {
  const L = [];
  L.push(`■ 미리보기 — ${p.title} (${p.table}) · 주인: ${p.owner}`);
  if (p.ask) L.push(`   ❓ ${p.ask}`);
  L.push(`   새로 생김      ${p.counts.add}줄`);
  L.push(`   바뀜           ${p.counts.change}줄`);
  L.push(`   손 안 댐       ${p.counts.same}줄`);
  L.push(`   보류           ${p.counts.hold}줄`);
  // ⚠️ 규칙 9 — **늘** 한 줄. 원장님이 「엑셀에서 지웠으니 없어졌겠지」를 바로잡는 유일한 자리다
  L.push(`   파일에 없는 기존 줄 ${p.missing}개 — 손대지 않음 (엑셀에서 줄을 지워도 앱에서는 안 지워진다)`);
  L.push(`   빈 칸이라 손 안 댄 칸 ${p.untouchedCells}개 — 값을 지우려면 「${BLANK}」이라고 적는다`);
  if (p.filled) L.push(`   윗줄에서 이어받은 칸 ${p.filled}개 (엑셀 병합)`);
  if (p.unknownHeads.length)
    L.push(`   ⚠️ 앱이 모르는 칸 ${p.unknownHeads.length}개 — **저장 안 됨**: ${p.unknownHeads.join(" · ")}`);
  if (p.picksMissing.length)
    L.push(`   ⚠️ 고르는 값 제약이 DB 에 없는 칸: ${p.picksMissing.join(" · ")} (규칙 6)`);
  for (const h of p.hold.slice(0, 20)) L.push(`   ⏸ ${h.at}줄 — ${h.why}`);
  if (p.hold.length > 20) L.push(`   ⏸ … 그리고 ${p.hold.length - 20}줄 더`);
  return L;
}

/**
 * 이관이 주인인 교재의 단원표는 **적재가 아니라 대조 기준**이다.
 * 짝이 없는 줄을 목록으로 뽑아 **옛 앱에서 먼저 고친다.**
 */
export async function compareOnly(db, sheetKey, file, opts = {}) {
  const s = spec(sheetKey);
  const ks = s.keys[0];
  const label = (o) => ks.map((k) => String(norm(o[k]) ?? "").trim()).filter(Boolean).join(" › ");

  // 미리보기와 같은 길로 읽되, 저장 계획이 아니라 **짝 맞추기**만 한다
  const p = await preview(db, sheetKey, file, opts);
  const scope = [...new Set(p.hold.filter((h) => h.twoSource).map((h) => h.twoSource))];
  const existing = await loadRows(db, s.table, s.scopeCol, scope);
  const inApp = new Map(existing.map((r) => [label(r), r]));

  const seen = new Set();
  const onlyInFile = [];
  for (const h of p.hold) {
    if (!h.twoSource) continue;
    const name = label(h.vals || {});
    seen.add(name);
    if (!inApp.has(name)) onlyInFile.push({ at: h.at, what: name });
  }
  const onlyInApp = [...inApp.keys()].filter((k) => !seen.has(k));
  return {
    books: scope, appRows: inApp.size, fileRows: seen.size, onlyInFile, onlyInApp,
    note: "짝이 없는 줄은 **옛 앱에서 먼저 고친다.** 새 앱에는 줄을 만들지 않는다",
  };
}

/* ══════════════════════════════════════════════════════════════
   ⑥ 올리기 — 미리보기를 통과한 것만 (규칙 3·8·11)
   ══════════════════════════════════════════════════════════════ */

/**
 * @param opts { batch:'excel', create:false, unattended:false, ownerOk:false, note, who }
 *
 * ⚠️ `create` 는 원장님이 화면에서 **「만들자」를 누른 것**이다. 기본은 안 만든다 (규칙 3).
 * ⚠️ `unattended`(무인 재적재)는 **어떤 경우에도 새로 만들지 않는다.**
 * ⚠️ 고치는 줄의 `import_batch` 는 **안 건드린다** — 이관 줄을 `excel` 로 바꾸면
 *    재적재가 그 줄을 안 지워 옛 값이 영영 안 되살아난다.
 */
export async function apply(db, sheetKey, p, opts = {}) {
  const s = spec(sheetKey);
  if (s.owner !== "엑셀" && !opts.ownerOk)
    return { ok: false, ask: p.ask, why: "주인이 다르다 — 먼저 묻고 ownerOk 로 답을 받는다" };

  const unattended = !!opts.unattended;
  const create = unattended ? false : !!opts.create;
  const batch = opts.batch || "excel";

  const run = await db.query(
    `insert into v2.excel_run(sheet, tbl, note, who, unattended) values ($1,$2,$3,$4,$5) returning id`,
    [sheetKey, s.table, opts.note ?? null, opts.who ?? null, unattended]);
  const runId = run.rows?.[0]?.id;
  if (!runId) throw new Error("올린 묶음 번호를 못 받았다 — v2.excel_run 이 있는지 본다 (규칙 8)");

  const t = safeName(s.table);
  let added = 0, changed = 0;
  const skipped = [];

  for (const a of (create ? p.add : [])) {
    const cols = Object.keys(a.vals).map(safeCol);
    const sql = `insert into v2.${t} (${cols.join(",")}, import_batch) values (` +
      cols.map((_, i) => `$${i + 1}`).join(",") + `, $${cols.length + 1}) returning id`;
    const r = await db.query(sql, [...cols.map((k2) => a.vals[k2]), batch]);
    const id = r.rows?.[0]?.id;
    // ⚠️ 자동 검사 ⑪ — 0줄이면 성공이라고 말하지 않는다
    if (!id) throw new Error(`${a.at}줄이 안 들어갔다 — 접근 규칙이 막았을 수 있다`);
    await db.query(
      `insert into v2.excel_row(run_id, tbl, row_id, op, before) values ($1,$2,$3,'insert',null)`,
      [runId, s.table, String(id)]);
    added++;
  }
  if (!create && p.add.length)
    skipped.push(`새로 생길 ${p.add.length}줄 — 「만들자」를 안 눌렀다${unattended ? " (무인 재적재는 어떤 경우에도 안 만든다)" : ""}`);

  for (const ch of p.change) {
    const before = {};
    for (const d of ch.diffs) before[d.col] = d.from;
    const sets = ch.diffs.map((d, i) => `${safeCol(d.col)} = $${i + 2}`).join(", ");
    const r = await db.query(`update v2.${t} set ${sets} where id = $1`,
      [ch.id, ...ch.diffs.map((d) => d.to)]);
    const n = r.rowCount ?? (r.rows ? r.rows.length : 0);
    if (!n) throw new Error(`${ch.at}줄이 안 바뀌었다 — 접근 규칙이 막았을 수 있다`);
    await db.query(
      `insert into v2.excel_row(run_id, tbl, row_id, op, before) values ($1,$2,$3,'update',$4)`,
      [runId, s.table, String(ch.id), JSON.stringify(before)]);
    changed++;
  }

  return { ok: true, runId, added, changed, skipped,
           held: p.hold.length, untouched: p.same.length, missing: p.missing };
}

/**
 * 묶음 통째로 되돌리기 (규칙 8).
 * ⚠️ **지우지 않는다. 상태로 내린다** (대전제 6).
 *    상태 칸이 없는 표는 **못 되돌린다** — 지어내지 않고 그대로 말한다.
 */
// ⚠️ 「내린다」가 표마다 다른 글자다. 값이 진짜 있는지는 **DB 목록에 물어본다**(원칙 1) —
//    여기 적힌 글자가 DB 제약에 없으면 내리지 않고 「못 내렸다」로 센다
const DOWN = { books: "stopped", units: "hidden", learn_items: "retired",
               material_type: "retired", schools: "closed", exams: "cancelled",
               students: "paused" };

export async function undo(db, runId) {
  const run = (await db.query(
    `select id, undone_at from v2.excel_run where id = $1`, [runId])).rows?.[0];
  if (!run) throw new Error(`그런 묶음이 없다 — ${runId}`);
  // ⚠️ 두 번 되돌리면 그 사이에 앱에서 고친 값을 **옛 값으로 덮는다**
  if (run.undone_at)
    return { runId, back: 0, downed: 0, cannot: [], note: "이미 되돌린 묶음이다 — 다시 안 돌린다" };

  const rows = (await db.query(
    `select * from v2.excel_row where run_id = $1 order by id desc`, [runId])).rows || [];
  const picksOf = new Map();
  let back = 0, downed = 0;
  const cannot = [];
  for (const r of rows) {
    const t = safeName(r.tbl);
    if (r.op === "update") {
      const before = typeof r.before === "string" ? JSON.parse(r.before) : (r.before || {});
      const cols = Object.keys(before);
      if (!cols.length) continue;
      const sets = cols.map((k2, i) => `${safeCol(k2)} = $${i + 2}`).join(", ");
      await db.query(`update v2.${t} set ${sets} where id = $1`, [r.row_id, ...cols.map((k2) => before[k2])]);
      back++;
    } else {
      if (!picksOf.has(t)) picksOf.set(t, await loadPicks(db, t));
      const down = DOWN[r.tbl];
      if (!down || !picksOf.get(t).state?.includes(down)) {
        cannot.push(`${r.tbl} ${r.row_id}`);
        continue;
      }
      await db.query(`update v2.${t} set state = $2 where id = $1`, [r.row_id, down]);
      downed++;
    }
  }
  await db.query(`update v2.excel_run set undone_at = now() where id = $1`, [runId]);
  return { runId, back, downed, cannot,
           note: cannot.length
             ? `⚠️ 상태로 못 내린 줄 ${cannot.length}개 — 지우지 않는다(대전제 6). 손으로 봐야 한다`
             : null };
}
