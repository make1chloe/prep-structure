/** 엑셀 왕복 검사 — **글자로 훑지 않고 실제로 돌린다.**
 *
 *  가짜 DB 를 끼워 `lib/excel.js` 를 부르고, 진짜 `.xlsx` 를 굽고 다시 읽는다.
 *  (엑셀이 `12/30` 을 날짜 숫자로 저장하는 사고는 **파일을 진짜로 구워야** 재현된다)
 *
 *  규칙 아홉을 전부 센다 — 계획 「엑셀 왕복 — 기존 자료를 올릴 수 있게」
 *  ＋ 자동 검사 ⑰(한 교재에 단원 나무가 두 벌) · ⑪(0줄이면 실패).
 */
import XLSX from "xlsx";
import { readFileSync, existsSync } from "node:fs";
import {
  SHEETS, BLANK, ID_HEAD, splitDots, parseItems, readDate, readYm,
  headOf, dateHeadsOf, downloadRows, makeWorkbook, readWorkbook,
  preview, apply, undo, loadPicks, needsYears, compareOnly,
} from "../lib/excel.js";

let fail = 0, n = 0;
const ok = (t, cond, why = "") => {
  n++;
  if (!cond) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
  else console.log(`   ✅ ${t}`);
};

/* ══════════════════════════════════════════════════════════════
   가짜 DB — v2 의 진짜 제약을 그대로 담고, 무엇이 실제로 나갔는지 센다
   ══════════════════════════════════════════════════════════════ */

// v2 에서 그대로 읽어 온 제약 (2026-09-02). 검사용 밑감이다
const CON = {
  books: [
    "CHECK ((area = ANY (ARRAY['문법'::text, '의미덩어리'::text, '독해'::text, '영작'::text, '내신'::text, '블록구문'::text, '단어'::text])))",
    "CHECK ((chunk_depth = ANY (ARRAY['chapter'::text, 'mid'::text, 'sub'::text])))",
    "CHECK ((order_basis = ANY (ARRAY['chapter'::text, 'sub'::text])))",
    "CHECK ((state = ANY (ARRAY['active'::text, 'paused'::text, 'stopped'::text])))",
  ],
  units: ["CHECK ((state = ANY (ARRAY['active'::text, 'hidden'::text])))"],
  learn_items: ["CHECK ((state = ANY (ARRAY['active'::text, 'retired'::text])))"],
  material_type: ["CHECK ((state = ANY (ARRAY['active'::text, 'retired'::text])))"],
  area_routine: [
    "CHECK ((area = ANY (ARRAY['문법'::text, '의미덩어리'::text, '독해'::text, '영작'::text, '내신'::text, '블록구문'::text, '단어'::text])))",
    "CHECK ((place = ANY (ARRAY['class'::text, 'home'::text, 'both'::text])))",
  ],
  score: [
    "CHECK ((by_who = ANY (ARRAY['staff'::text, 'student'::text])))",
    "CHECK ((kind = ANY (ARRAY['school'::text, 'mock'::text, 'unit'::text])))",
    "CHECK ((show_to = ANY (ARRAY['staff'::text, 'student'::text, 'parent'::text, 'both'::text])))",
  ],
  payment: [],
};
const NEED = {                      // NOT NULL 인데 기본값이 없는 칸 (v2 실측)
  books: ["name"], units: ["book_id", "chapter", "activity", "sort"],
  learn_items: ["name"], material_type: ["name"],
  area_routine: ["area", "item_id", "place", "sort"],
  score: ["student_id", "kind"], payment: ["student_id", "ym"],
};

function fakeDb(seed = {}) {
  const T = {
    books: [], units: [], learn_items: [], material_type: [], area_routine: [],
    score: [], payment: [], students: [], schools: [], exams: [],
    book_alias: [], excel_run: [], excel_row: [], ...seed,
  };
  const con = seed.__con || CON;
  const need = seed.__need || NEED;
  const wrote = [];                 // ⚠️ 미리보기가 DB 를 건드리면 여기 쌓인다
  let uid = 1000, runId = 0, rowId = 0;
  const nextId = () => `id-${++uid}`;

  async function query(sql, p = []) {
    const s = String(sql).replace(/\s+/g, " ").trim();

    if (s.includes("pg_constraint"))
      return { rows: (con[p[0]] || []).map((def) => ({ def })) };
    if (s.includes("information_schema.columns"))
      return { rows: (need[p[0]] || []).map((x) => ({ column_name: x })) };

    let m = /^select \* from v2\.(\w+) where (\w+) = any\(\$1\)$/.exec(s);
    if (m) return { rows: (T[m[1]] || []).filter((r) => (p[0] || []).includes(String(r[m[2]]))) };

    m = /^select \* from v2\.(\w+)$/.exec(s);
    if (m) return { rows: T[m[1]] || [] };

    m = /^select id, name from v2\.(\w+)$/.exec(s);
    if (m) return { rows: (T[m[1]] || []).map((r) => ({ id: r.id, name: r.name })) };

    m = /^select (\w+) as id, alias from v2\.(\w+)$/.exec(s);
    if (m) return { rows: (T[m[2]] || []).map((r) => ({ id: r[m[1]], alias: r.alias })) };

    m = /^select \* from v2\.excel_row where run_id = \$1/.exec(s);
    if (m) return { rows: T.excel_row.filter((r) => r.run_id === p[0]).sort((a, b) => b.id - a.id) };

    if (s.startsWith("insert into v2.excel_run")) {
      const id = ++runId; T.excel_run.push({ id, sheet: p[0], tbl: p[1] });
      return { rows: [{ id }], rowCount: 1 };
    }
    if (s.startsWith("insert into v2.excel_row")) {
      const op = /'insert'/.test(s) ? "insert" : "update";
      T.excel_row.push({ id: ++rowId, run_id: p[0], tbl: p[1], row_id: p[2], op,
                         before: op === "update" ? p[3] : null });
      return { rows: [], rowCount: 1 };
    }

    m = /^insert into v2\.(\w+) \((.+?)\) values \((.+?)\) returning id$/.exec(s);
    if (m) {
      if (seed.__blockInsert) return { rows: [], rowCount: 0 };   // 접근 규칙이 막았다
      const cols = m[2].split(",").map((x) => x.trim());
      const row = { id: nextId() };
      cols.forEach((cc, i) => { row[cc] = p[i]; });
      (T[m[1]] = T[m[1]] || []).push(row);
      wrote.push({ op: "insert", tbl: m[1] });
      return { rows: [{ id: row.id }], rowCount: 1 };
    }

    m = /^update v2\.(\w+) set (.+) where id = \$1$/.exec(s);
    if (m) {
      if (seed.__blockUpdate) return { rows: [], rowCount: 0 };   // ⚠️ 자동 검사 ⑪
      const row = (T[m[1]] || []).find((r) => String(r.id) === String(p[0]));
      if (!row) return { rows: [], rowCount: 0 };
      m[2].split(",").forEach((piece) => {
        const mm = /^\s*(\w+) = \$(\d+)\s*$/.exec(piece);
        if (mm) row[mm[1]] = p[Number(mm[2]) - 1];
      });
      wrote.push({ op: "update", tbl: m[1] });
      return { rows: [], rowCount: 1 };
    }
    throw new Error("가짜 DB 가 모르는 SQL — " + s);
  }
  return { T, wrote, query };
}

const B1 = "b-3800", B2 = "b-olim";
const seedBooks = () => ({
  books: [
    { id: B1, code: "G020", name: "3800제 1", area: "문법", publisher: "마더텅",
      pub_year: 2024, level: null, price: 15000, buy_url: "http://x/1",
      chunk_depth: "sub", order_basis: "sub", unit_test: false, state: "active", import_batch: null },
    { id: B2, code: "R011", name: "올림포스 독해기본2", area: "독해", publisher: "EBS",
      pub_year: 2025, level: null, price: 9800, buy_url: "http://x/2",
      chunk_depth: "mid", order_basis: "sub", unit_test: false, state: "active", import_batch: null },
  ],
  book_alias: [{ book_id: B1, alias: "3800제1", source: "교재안내" }],
});

/* ══════════════════════════════════════════════════════════════ */
console.log("■ `·` 로 자르기 — 대괄호 안은 건너뛴다 (실측: 61종 → 40종)");
{
  const cell = "클카 문장훈련[입해석 · 낭독 · 녹음] · 구두테스트 · 클카 단어훈련[스크램블 · 암기]";
  ok("대괄호를 존중하면 3조각", splitDots(cell).length === 3, splitDots(cell).join(" | "));
  ok(`\`·\` 로만 자르면 ${cell.split("·").length}조각으로 깨진다 (안 고쳤을 때의 모습)`,
     cell.split("·").length > splitDots(cell).length,
     `${cell.split("·").length} vs ${splitDots(cell).length}`);
  const items = parseItems(cell);
  ok("항목 이름과 체크리스트가 갈린다",
     items[0].name === "클카 문장훈련" && items[0].checks.length === 3,
     JSON.stringify(items[0]));
  ok("대괄호 짝이 안 맞으면 broken (지어내지 않는다)",
     parseItems("클카 문장훈련[입해석")[0].broken === true);
  ok("가운뎃점이 달라도 자른다 (ㆍ)", splitDots("가ㆍ나").length === 2);
}

console.log("\n■ 규칙 7 — 날짜는 글자 YYYY-MM-DD 한 꼴만");
{
  ok("엑셀 날짜 숫자를 안 받는다", readDate(46021).ok === false);
  ok("Date 를 안 받는다", readDate(new Date()).ok === false);
  ok("12/30 을 안 받는다", readDate("12/30").ok === false);
  ok("3/4 를 안 받는다", readDate("3/4").ok === false);
  ok("두 자리 연도를 안 받는다 (26-01-02)", readDate("26-01-02").ok === false);
  ok("0 을 안 채운 것도 안 받는다 (2026-1-2)", readDate("2026-1-2").ok === false);
  ok("없는 날을 안 받는다 (2026-02-30)", readDate("2026-02-30").ok === false);
  ok("2026-03-01 은 받는다", readDate("2026-03-01").value === "2026-03-01");
  ok("달은 YYYY-MM 만 (2026-08)", readYm("2026-08").ok === true && readYm("2026-8").ok === false);
  ok("날짜가 든 표는 「몇 년 것인가」를 먼저 묻는다",
     needsYears("score") === true && needsYears("learn_items") === false);
}

console.log("\n■ 규칙 1 — 내려받은 파일을 그대로 올리면 아무것도 안 바뀐다 (왕복)");
{
  const db = fakeDb({
    ...seedBooks(),
    learn_items: [
      { id: "i1", name: "클카 문장훈련", method: "입으로", tool: "폰",
        checks: ["입해석", "낭독", "녹음"], state: "active", sort: 1, import_batch: "excel" },
      { id: "i2", name: "구두테스트", method: null, tool: null,
        checks: null, state: "active", sort: 2, import_batch: "excel" },
    ],
  });
  const d = await downloadRows(db, "learn_items");
  ok("첫 칸이 줄 번호다 (규칙 2)", d.head[0] === ID_HEAD, d.head[0]);
  const buf = makeWorkbook({ ...d, title: d.title });
  const back = readWorkbook(buf);
  const p = await preview(db, "learn_items", back);
  ok("생김 0 · 바뀜 0 · 손 안 댐 2 · 보류 0",
     p.counts.add === 0 && p.counts.change === 0 && p.counts.same === 2 && p.counts.hold === 0,
     JSON.stringify(p.counts) + " " + p.hold.map((h) => h.why).join(" / "));
  ok("체크리스트가 `·` 로 나갔다가 그대로 돌아온다",
     p.counts.change === 0 && back.rows[0]["체크리스트"] === "입해석 · 낭독 · 녹음",
     String(back.rows[0]["체크리스트"]));
  ok("미리보기는 DB 를 한 줄도 안 건드린다 (바로 저장하지 않는다 · 규칙 4)",
     db.wrote.length === 0, JSON.stringify(db.wrote));
}

console.log("\n■ 규칙 7 — .xlsx 를 **진짜로 구워** 엑셀 날짜 사고를 재현한다");
{
  const db = fakeDb({
    students: [{ id: "s1", name: "이서윤" }],
    score: [], __con: { ...CON }, __need: { ...NEED },
  });
  // 엑셀이 `12/30` 을 저장하는 그 모양 — 날짜 일련번호 + 날짜 서식
  const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  const head = ["번호", "학생번호", "학생", "갈래", "본날", "과목", "원점수"];
  const aoa = [head,
    ["", "", "이서윤", "school", null, "영어", 92],     // ← 아래에서 날짜 숫자로 채운다
    ["", "", "이서윤", "school", "12/30", "영어", 88],  // 텍스트 서식이면 글자로 남는다
    ["", "", "이서윤", "school", "2026-03-01", "국어", 70],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["E2"] = { t: "n", v: serial(2026, 12, 30), z: "m/d/yy" };   // 엑셀이 실제로 넣는 값
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "성적");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const f = readWorkbook(buf);
  ok("엑셀이 저장한 날짜는 **숫자로** 온다 (여기서 Date 로 바꾸면 조용히 통과한다)",
     typeof f.rows[0]["본날"] === "number", typeof f.rows[0]["본날"]);

  const p = await preview(db, "score", f, { years: [2026, 2026] });
  ok("날짜 숫자 줄이 보류된다", p.hold.some((h) => h.at === 2), JSON.stringify(p.hold.map((h) => h.at)));
  ok("12/30 글자 줄도 보류된다", p.hold.some((h) => h.at === 3));
  ok("2026-03-01 줄만 살아남는다", p.counts.hold === 2 && p.counts.add === 1,
     JSON.stringify(p.counts));

  const p2 = await preview(db, "score", f, { years: [2024, 2025] });
  ok("파일 연도 범위 밖이면 보류 (2026-03-01 도)", p2.counts.hold === 3 && p2.counts.add === 0,
     JSON.stringify(p2.counts));
  const p3 = await preview(db, "score", f);
  ok("「몇 년 것인가」를 안 적으면 날짜 든 줄이 전부 보류", p3.counts.hold === 3,
     JSON.stringify(p3.counts));

  // 내려받기는 날짜를 **글자로** 내보낸다
  const db2 = fakeDb({ students: [{ id: "s1", name: "이서윤" }],
    score: [{ id: "sc1", student_id: "s1", exam_id: null, kind: "school",
              taken_on: new Date(2026, 2, 1), subject: "영어", raw: 92, full_score: 100,
              grade: 1, percentile: null, by_who: "staff", confirmed: true,
              show_to: "both", note: null }] });
  const d = await downloadRows(db2, "score");
  ok("날짜 열이 내려받기에 표시된다", dateHeadsOf("score").includes("본날"));
  const rt = readWorkbook(makeWorkbook({ ...d, title: "성적" }));
  ok("내려받은 날짜는 **글자** 2026-03-01 이다",
     rt.rows[0]["본날"] === "2026-03-01", JSON.stringify(rt.rows[0]["본날"]));
  const p4 = await preview(db2, "score", rt, { years: [2026, 2026] });
  ok("그 파일을 도로 올려도 안 바뀐다 (pg 의 Date 와 글자를 같게 본다)",
     p4.counts.change === 0 && p4.counts.same === 1,
     JSON.stringify(p4.counts) + " " + JSON.stringify(p4.change));
}

console.log("\n■ 규칙 5 — ⚠️ 빈 칸은 「지우라」가 아니라 「손대지 말라」");
{
  // 사고 자리: 머리줄에 교재비·구매링크가 있고 값이 전부 빈 파일
  const db = fakeDb(seedBooks());
  const file = { head: ["번호", "교재명", "교재비", "구매링크"],
                 rows: [{ 번호: B1, 교재명: "3800제 1", 교재비: null, 구매링크: null },
                        { 번호: B2, 교재명: "올림포스 독해기본2", 교재비: "", 구매링크: "" }] };
  const p = await preview(db, "books", file);
  ok("빈 칸 4개가 「손 안 댐」으로 센다", p.untouchedCells === 4, String(p.untouchedCells));
  ok("이관이 가져온 교재비·구매링크를 **NULL 로 안 덮는다**",
     p.counts.change === 0 && p.counts.same === 2, JSON.stringify(p.counts));
  const r = await apply(db, "books", p, { ownerOk: true });
  ok("저장한 뒤에도 교재비가 그대로다", db.T.books[0].price === 15000, String(db.T.books[0].price));
  ok("미리보기 줄에 「(비움)」 안내가 뜬다",
     p.lines.some((l) => l.includes(BLANK)), p.lines.join("\n"));

  // 정말 지우려면 표식을 적는다
  const db2 = fakeDb(seedBooks());
  const p2 = await preview(db2, "books",
    { head: ["번호", "교재비"], rows: [{ 번호: B1, 교재비: BLANK }] });
  ok("「(비움)」이라 적으면 그때만 지운다",
     p2.counts.change === 1 && p2.change[0].diffs[0].to === null, JSON.stringify(p2.change));
  await apply(db2, "books", p2, { ownerOk: true });
  ok("실제로 NULL 이 됐다", db2.T.books[0].price === null, String(db2.T.books[0].price));

  const p3 = await preview(db2, "books",
    { head: ["번호", "교재명"], rows: [{ 번호: B1, 교재명: BLANK }] });
  ok("꼭 채울 칸은 「(비움)」으로도 못 지운다 (보류)", p3.counts.hold === 1,
     JSON.stringify(p3.counts));
}

console.log("\n■ 규칙 2·3 — 번호로 가리킨다 · 없는 것을 임의로 안 만든다");
{
  const db = fakeDb({
    ...seedBooks(),
    units: [{ id: "u1", book_id: B2, chapter: "CH1", mid: "Gateway", sub: null,
              activity: "본책", is_workbook: false, sort: 10, page_start: 1, page_end: 4,
              q_count: null, q_range: null, gist: null, state: "active", import_batch: "excel" }],
  });
  const head = ["번호", "교재번호", "교재명", "대단원", "중단원", "소단원", "활동명", "순번"];
  const mk = (o) => ({ 번호: "", 교재번호: "", 교재명: "", 대단원: "", 중단원: "",
                       소단원: "", 활동명: "", 순번: "", ...o });

  const p = await preview(db, "units", { head, rows: [
    mk({ 번호: "u1", 교재번호: B2, 대단원: "CH1", 중단원: "Gateway", 활동명: "본책", 순번: 10 }),
    mk({ 교재번호: B2, 대단원: "CH1", 중단원: "Gateway", 활동명: "워크북", 순번: 11 }),
    mk({ 교재명: "3800제1", 대단원: "CH1", 활동명: "본책", 순번: 1 }),      // 별칭으로 찾는다
    mk({ 교재명: "없는 교재", 대단원: "CH1", 활동명: "본책", 순번: 1 }),
  ] });
  ok("번호가 있으면 고치기 (같은 줄이 새로 안 생긴다)",
     p.counts.same === 1 || p.counts.change === 1, JSON.stringify(p.counts));
  ok("번호가 없으면 새로 만들기 후보", p.counts.add === 2, JSON.stringify(p.counts));
  ok("별칭으로도 교재를 찾는다 (어느 이름도 다른 이름을 안 덮는다)",
     p.add.some((a) => a.vals.book_id === B1), JSON.stringify(p.add.map((a) => a.vals.book_id)));
  ok("없는 교재는 **보류**한다 (앱이 임의로 안 만든다)",
     p.counts.hold === 1 && /없는 교재/.test(p.hold[0].why), JSON.stringify(p.hold));
  ok("보류 단추의 **기본**이 「다른 이름으로 등록」이다",
     p.hold[0].choices?.[0] === "다른 이름으로 등록", JSON.stringify(p.hold[0].choices));

  // 번호 칸을 통째로 뺀 파일 — 자연키로 찾아 같은 줄이 두 번 안 생긴다
  const p2 = await preview(db, "units", {
    head: head.filter((h) => h !== "번호"),
    rows: [mk({ 교재번호: B2, 대단원: "CH1", 중단원: "Gateway", 활동명: "본책", 순번: 10 })] });
  ok("번호 칸이 없어도 자연키로 찾아 안 늘린다", p2.counts.add === 0 && p2.counts.same === 1,
     JSON.stringify(p2.counts));

  // 앱에 없는 번호
  const p3 = await preview(db, "units", { head, rows: [mk({ 번호: "없는번호", 교재번호: B2 })] });
  ok("앱에 없는 번호는 보류", p3.counts.hold === 1, JSON.stringify(p3.hold));

  // 이름이 두 개 걸리면 보류
  const db4 = fakeDb({ books: [
    { id: "x1", name: "쓰작1", state: "active" }, { id: "x2", name: "쓰작1", state: "active" }] });
  const p4 = await preview(db4, "units", { head, rows: [mk({ 교재명: "쓰작1", 대단원: "CH1", 활동명: "본책", 순번: 1 })] });
  ok("같은 이름이 둘이면 보류 (오타·개정판·동명이인)",
     p4.counts.hold === 1 && /2개다/.test(p4.hold[0].why), JSON.stringify(p4.hold));

  // 「만들자」를 안 누르면 안 만든다
  const before = db.T.units.length;
  const r1 = await apply(db, "units", p, { ownerOk: true });
  ok("「만들자」를 안 누르면 한 줄도 안 만든다",
     r1.added === 0 && db.T.units.length === before, JSON.stringify(r1.skipped));
  const r2 = await apply(db, "units", p, { ownerOk: true, create: true, unattended: true });
  ok("⚠️ 무인 재적재는 **어떤 경우에도** 안 만든다", r2.added === 0, String(r2.added));
  const r3 = await apply(db, "units", p, { ownerOk: true, create: true });
  ok("「만들자」를 누르면 그때 만든다", r3.added === 2, String(r3.added));
  ok("새로 만든 줄에 `excel` 묶음이 찍힌다",
     db.T.units.filter((u) => u.import_batch === "excel").length === 3,
     JSON.stringify(db.T.units.map((u) => u.import_batch)));
}

console.log("\n■ 자연키가 여러 벌 — 교재ID 는 37권 중 12권만 있다 (실측)");
{
  const db = fakeDb(seedBooks());
  const p = await preview(db, "books", { head: ["교재ID", "교재명", "레벨"], rows: [
    { 교재ID: "G020", 교재명: "3800제 1", 레벨: "중2" }] });
  ok("교재ID 가 있으면 그걸로 짝을 찾는다", p.counts.change === 1, JSON.stringify(p.counts));
  const p2 = await preview(db, "books", { head: ["교재명", "레벨"], rows: [
    { 교재명: "올림포스 독해기본2", 레벨: "고1" }] });
  ok("교재ID 가 없으면 이름으로 찾는다 (같은 교재가 두 벌 안 선다)",
     p2.counts.change === 1 && p2.counts.add === 0, JSON.stringify(p2.counts));
  const p3 = await preview(db, "books", { head: ["레벨"], rows: [{ 레벨: "고1" }] });
  ok("가릴 칸이 아예 없으면 **그 까닭으로** 보류한다 (아무 줄이나 안 고친다)",
     p3.counts.hold === 1 && /가릴 칸이 모자라다/.test(p3.hold[0].why), JSON.stringify(p3.hold));

  // ⚠️ 교재ID 가 **둘 다 빈** 교재가 있을 때가 진짜 위험한 자리다
  const db4 = fakeDb({ books: [
    { id: "n1", code: null, name: "쓰작1", area: "영작", state: "active" },
    { id: "n2", code: null, name: "쓰작2", area: "영작", state: "active" }] });
  const p4 = await preview(db4, "books", { head: ["교재명", "레벨"], rows: [{ 교재명: "쓰작2", 레벨: "중2" }] });
  ok("교재ID 가 빈 교재가 여럿이어도 이름으로 **그 한 줄만** 고친다",
     p4.counts.change === 1 && p4.change[0].id === "n2", JSON.stringify(p4.counts) + JSON.stringify(p4.hold));
}

console.log("\n■ 규칙 6 — 고르는 값은 **DB 에서 읽는다** (여기 두 벌로 안 적는다)");
{
  const db = fakeDb(seedBooks());
  const picks = await loadPicks(db, "books");
  ok("제약을 읽어 목록을 만든다", picks.area?.includes("단어") && picks.state?.length === 3,
     JSON.stringify(picks.area));
  const p = await preview(db, "books",
    { head: ["번호", "영역"], rows: [{ 번호: B1, 영역: "듣기" }] });
  ok("목록에 없는 값은 보류", p.counts.hold === 1, JSON.stringify(p.hold));

  // ⚠️ DB 를 고치면 엑셀도 따라간다 — 두 벌이 아니라는 증거
  const db2 = fakeDb({ ...seedBooks(),
    __con: { ...CON, books: [...CON.books, "CHECK ((area = ANY (ARRAY['듣기'::text])))"]
      .filter((x) => !/'문법'/.test(x)) } });
  const p2 = await preview(db2, "books",
    { head: ["번호", "영역"], rows: [{ 번호: B1, 영역: "듣기" }] });
  ok("DB 목록을 바꾸면 엑셀도 그대로 따라간다", p2.counts.hold === 0, JSON.stringify(p2.hold));

  // 제약이 아예 없으면 — 엑셀이 화면 제약을 뚫는 유일한 길이다
  const db3 = fakeDb({ ...seedBooks(), __con: { books: [] } });
  const p3 = await preview(db3, "books",
    { head: ["번호", "영역"], rows: [{ 번호: B1, 영역: "아무거나" }] });
  ok("고르는 값 제약이 DB 에 없으면 그 줄을 보류한다",
     p3.counts.hold === 1 && /제약이 DB 에 없다/.test(p3.hold[0].why), JSON.stringify(p3.hold));
  ok("미리보기가 그 사실을 한 줄로 띄운다",
     p3.picksMissing.includes("영역"), JSON.stringify(p3.picksMissing));
}

console.log("\n■ 규칙 9 — 파일에서 줄을 지워도 앱에서는 안 지워진다");
{
  const db = fakeDb({ material_type: [
    { id: "m1", name: "어법 정리본", steps: ["make", "print"], state: "active", sort: 1 },
    { id: "m2", name: "본문 빈칸", steps: ["make"], state: "active", sort: 2 },
    { id: "m3", name: "서술형 대비", steps: ["make"], state: "active", sort: 3 }] });
  const p = await preview(db, "material_type",
    { head: ["번호", "자료종류"], rows: [{ 번호: "m1", 자료종류: "어법 정리본" }] });
  ok("파일에 없는 기존 줄 2개를 센다", p.missing === 2, String(p.missing));
  ok("그 줄이 **늘 한 줄**로 뜬다",
     p.lines.filter((l) => l.includes("파일에 없는 기존 줄")).length === 1, p.lines.join("\n"));
  await apply(db, "material_type", p, {});
  ok("저장해도 지워지지 않는다 (대전제 6)", db.T.material_type.length === 3,
     String(db.T.material_type.length));

  const p2 = await preview(db, "material_type", {
    head: ["번호"], rows: db.T.material_type.map((r) => ({ 번호: r.id })) });
  ok("0 일 때도 그 줄은 뜬다 (조용히 사라지지 않는다)",
     p2.missing === 0 && p2.lines.some((l) => l.includes("파일에 없는 기존 줄 0개")),
     p2.lines.join("\n"));
}

console.log("\n■ 규칙 4 — 미리보기 네 숫자 · 앱이 모르는 칸");
{
  const db = fakeDb({ material_type: [
    { id: "m1", name: "어법 정리본", steps: ["make"], state: "active", sort: 1 },
    { id: "m2", name: "본문 빈칸", steps: ["make"], state: "active", sort: 2 }] });
  const p = await preview(db, "material_type", {
    head: ["번호", "자료종류", "차례", "상태", "쪽수"],
    rows: [{ 번호: "m1", 자료종류: "어법 정리본", 차례: 5, 상태: "active", 쪽수: 3 },
           { 번호: "m2", 자료종류: "본문 빈칸", 차례: 2, 상태: "active", 쪽수: 1 },
           { 번호: "", 자료종류: "듣기 스크립트", 차례: 3, 상태: "active", 쪽수: 2 },
           { 번호: "", 자료종류: "새 자료", 차례: "셋", 상태: "active", 쪽수: 1 }] });
  ok("생김 1 · 바뀜 1 · 손 안 댐 1 · 보류 1",
     p.counts.add === 1 && p.counts.change === 1 && p.counts.same === 1 && p.counts.hold === 1,
     JSON.stringify(p.counts));
  ok("앱이 모르는 칸을 **버리지 않고 말한다**", p.unknownHeads.includes("쪽수"),
     JSON.stringify(p.unknownHeads));
  ok("무엇이 바뀌는지 옛 값과 같이 보여준다",
     p.change[0].diffs[0].from === 1 && p.change[0].diffs[0].to === 5,
     JSON.stringify(p.change[0].diffs));
}

console.log("\n■ 엑셀 병합 — 대·중단원이 비면 윗줄에서 이어받는다");
{
  const db = fakeDb(seedBooks());
  const head = ["교재번호", "대단원", "중단원", "활동명", "순번"];
  const p = await preview(db, "units", { head, rows: [
    { 교재번호: B2, 대단원: "CH1", 중단원: "Gateway", 활동명: "본책", 순번: 1 },
    { 교재번호: B2, 대단원: "", 중단원: "", 활동명: "워크북", 순번: 2 }] });
  ok("빈 대·중단원 2칸을 이어받는다", p.filled === 2, String(p.filled));
  ok("이어받아 두 줄 다 선다 (줄이 조용히 사라지지 않는다)", p.counts.add === 2,
     JSON.stringify(p.counts));
  ok("이어받은 칸 수를 미리보기에 적는다",
     p.lines.some((l) => l.includes("이어받은")), p.lines.join("\n"));

  const p2 = await preview(db, "units", { head, rows: [
    { 교재번호: B2, 대단원: "", 중단원: "", 활동명: "본책", 순번: 1 }] });
  ok("이어받을 윗줄이 없으면 **보류**한다 (삼키지 않는다)", p2.counts.hold === 1,
     JSON.stringify(p2.hold));
}

console.log("\n■ ⚠️ 자동 검사 ⑰ — 한 교재의 단원은 한 곳에서만 들어온다");
{
  const db = fakeDb({ ...seedBooks(), units: [
    { id: "u1", book_id: B1, chapter: "CH1", mid: null, sub: null, activity: "본책",
      is_workbook: false, sort: 1, state: "active", import_batch: "import" }] });
  const head = ["교재번호", "대단원", "활동명", "순번"];
  const p = await preview(db, "units", { head, rows: [
    { 교재번호: B1, 대단원: "CH2", 활동명: "본책", 순번: 2 },
    { 교재번호: B2, 대단원: "CH1", 활동명: "본책", 순번: 1 }] });
  ok("이관이 이미 넣은 교재의 줄은 **전부 보류**",
     p.counts.hold === 1 && p.hold[0].twoSource === B1, JSON.stringify(p.hold));
  ok("이관이 안 넣은 교재는 그대로 선다", p.counts.add === 1, JSON.stringify(p.counts));
  const r = await apply(db, "units", p, { ownerOk: true, create: true });
  ok("저장해도 그 교재에 엑셀 줄이 안 생긴다 (단원 나무가 두 벌로 안 선다)",
     db.T.units.filter((u) => u.book_id === B1).length === 1,
     String(db.T.units.filter((u) => u.book_id === B1).length));

  // 그 교재의 엑셀은 **적재가 아니라 대조 기준**이다 — 짝 없는 줄을 목록으로 뽑는다
  const db2 = fakeDb({ ...seedBooks(), units: [
    { id: "u1", book_id: B1, chapter: "CH1", mid: null, sub: null, activity: "본책",
      is_workbook: false, sort: 1, state: "active", import_batch: "import" },
    { id: "u2", book_id: B1, chapter: "CH9", mid: null, sub: null, activity: "본책",
      is_workbook: false, sort: 9, state: "active", import_batch: "import" }] });
  const cmp = await compareOnly(db2, "units", { head, rows: [
    { 교재번호: B1, 대단원: "CH1", 활동명: "본책", 순번: 1 },
    { 교재번호: B1, 대단원: "CH2", 활동명: "본책", 순번: 2 }] });
  ok("파일에만 있는 줄을 뽑는다 (옛 앱에서 먼저 고칠 것)",
     cmp.onlyInFile.length === 1 && /CH2/.test(cmp.onlyInFile[0].what), JSON.stringify(cmp.onlyInFile));
  ok("앱에만 있는 줄도 뽑는다", cmp.onlyInApp.some((x) => /CH9/.test(x)), JSON.stringify(cmp.onlyInApp));
}

console.log("\n■ 표마다 주인이 다르다 — 막지 말고 **묻는다**");
{
  const db = fakeDb({ material_type: [] });
  const p = await preview(db, "material_type", { head: ["자료종류"], rows: [{ 자료종류: "새것" }] });
  ok("엑셀이 주인인 표는 안 묻는다", p.ask === null);
  const db2 = fakeDb(seedBooks());
  const p2 = await preview(db2, "books", { head: ["번호", "레벨"], rows: [{ 번호: B1, 레벨: "중2" }] });
  ok("이관이 주인인 표는 미리보기에 묻는 줄이 뜬다", !!p2.ask && p2.lines.some((l) => l.includes("❓")));
  const r = await apply(db2, "books", p2, {});
  ok("답을 안 받으면 저장 안 한다 (막는 게 아니라 묻는다)",
     r.ok === false && !!r.ask, JSON.stringify(r));
  const r2 = await apply(db2, "books", p2, { ownerOk: true });
  ok("답을 받으면 저장한다", r2.ok === true && r2.changed === 1, JSON.stringify(r2));
}

console.log("\n■ 규칙 8 — 올린 묶음 번호 · 되돌리기 (지우지 않고 상태로 내린다)");
{
  const db = fakeDb({ material_type: [
    { id: "m1", name: "어법 정리본", steps: ["make"], state: "active", sort: 1 }] });
  const p = await preview(db, "material_type", {
    head: ["번호", "자료종류", "차례"],
    rows: [{ 번호: "m1", 자료종류: "어법 정리본", 차례: 9 },
           { 번호: "", 자료종류: "새 자료", 차례: 2 }] });
  const r = await apply(db, "material_type", p, { create: true, note: "8월 자료종류" });
  ok("올린 묶음 번호가 남는다", !!r.runId, JSON.stringify(r));
  ok("바뀐 줄의 **옛 값**을 남긴다",
     db.T.excel_row.some((x) => x.op === "update" && /"sort":1/.test(String(x.before))),
     JSON.stringify(db.T.excel_row));
  const u = await undo(db, r.runId);
  ok("되돌리면 옛 값으로 돌아온다", db.T.material_type[0].sort === 1,
     String(db.T.material_type[0].sort));
  ok("새로 만든 줄은 **지우지 않고 상태로 내린다**",
     db.T.material_type[1].state === "retired" && db.T.material_type.length === 2,
     JSON.stringify(db.T.material_type[1]));
  ok("되돌린 수를 말한다", u.back === 1 && u.downed === 1, JSON.stringify(u));

  // 상태 칸이 없는 표는 **못 되돌린다**고 정직하게 말한다
  const db2 = fakeDb({ learn_items: [{ id: "i1", name: "구두테스트", state: "active" }],
                       area_routine: [] });
  const p2 = await preview(db2, "area_routine", {
    head: ["영역", "항목", "자리", "차례"],
    rows: [{ 영역: "문법", 항목: "구두테스트", 자리: "class", 차례: 1 }] });
  const r2 = await apply(db2, "area_routine", p2, { create: true });
  const u2 = await undo(db2, r2.runId);
  ok("상태 칸이 없으면 「못 되돌린다」고 말한다 (조용히 지우지 않는다)",
     u2.cannot.length === 1 && !!u2.note, JSON.stringify(u2));
}

console.log("\n■ 자동 검사 ⑪ — 0줄이면 성공이라고 말하지 않는다");
{
  const db = fakeDb({ __blockUpdate: true, material_type: [
    { id: "m1", name: "어법 정리본", steps: ["make"], state: "active", sort: 1 }] });
  const p = await preview(db, "material_type",
    { head: ["번호", "차례"], rows: [{ 번호: "m1", 차례: 9 }] });
  let threw = null;
  try { await apply(db, "material_type", p, {}); } catch (e) { threw = e; }
  ok("접근 규칙이 막아 0줄이면 실패로 되돌린다", !!threw, String(threw));

  const db2 = fakeDb({ __blockInsert: true, material_type: [] });
  const p2 = await preview(db2, "material_type", { head: ["자료종류"], rows: [{ 자료종류: "새것" }] });
  let threw2 = null;
  try { await apply(db2, "material_type", p2, { create: true }); } catch (e) { threw2 = e; }
  ok("넣기가 0줄이어도 실패로 되돌린다", !!threw2, String(threw2));
}

console.log("\n■ 규칙 6 을 **진짜 DB 에서** 확인한다 (엑셀은 화면 제약을 뚫는 유일한 길이다)");
{
  const envPath = new URL("../.env.local", import.meta.url).pathname;
  const url = existsSync(envPath)
    ? (readFileSync(envPath, "utf8").match(/DATABASE_URL=(.+)/) || [])[1]?.trim() : null;
  if (!url) {
    fail++; n++;
    console.log("   ❌ .env.local 의 DATABASE_URL 을 못 읽어 **규칙 6 을 확인 못 했다**");
  } else {
    const { Client } = await import("pg");
    const cl = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                            connectionTimeoutMillis: 15000 });
    let up = false;
    for (let i = 1; i <= 4 && !up; i++) {
      try { await cl.connect(); up = true; }
      catch (e) { if (i === 4) { fail++; n++; console.log("   ❌ DB 에 못 붙어 규칙 6 을 확인 못 했다 — " + e.message); }
                  else await new Promise((r) => setTimeout(r, 3000)); }
    }
    if (up) {
      const db = { query: (sql, p) => cl.query(sql, p) };
      const seen = new Set();
      for (const [key, s] of Object.entries(SHEETS)) {
        const picks = await loadPicks(db, s.table);
        const need = await import("../lib/excel.js").then((m) => m.loadNeed(db, s.table));
        for (const col of s.cols) {
          if (!col.pick) continue;
          const tag = `${s.table}.${col.col}`;
          if (seen.has(tag)) continue;
          seen.add(tag);
          ok(`${tag} — 고르는 값이 DB 에 걸려 있다`, Array.isArray(picks[col.col]),
             "제약이 없다. 엑셀이 목록에 없는 값을 그대로 넣는다");
        }
        ok(`${key} — 표 정의의 칸이 v2 에 실제로 있다`, need instanceof Set);
      }
      // 표 정의가 지어낸 칸을 가리키지 않는가
      const real = await cl.query(
        `select table_name, column_name from information_schema.columns where table_schema='v2'`);
      const has = new Set(real.rows.map((r) => `${r.table_name}.${r.column_name}`));
      const ghosts = [];
      for (const s of Object.values(SHEETS))
        for (const col of s.cols)
          if (!has.has(`${s.table}.${col.col}`)) ghosts.push(`${s.table}.${col.col}`);
      ok("표 정의에 **지어낸 칸이 없다**", ghosts.length === 0, ghosts.join(" · "));

      // 규칙 8 — 올린 묶음 표. **아직 없다.** 없으면 큰 소리로 알리고(검사로는 안 센다),
      // 생기고 나면 그때부터 칸까지 지킨다. ⚠️ 없는 동안 `apply()` 는 그 자리에서 터진다
      if (!has.has("excel_run.id")) {
        console.log("   ⚠️ v2.excel_run·v2.excel_row 가 **아직 없다** — 그동안 올리기(apply)는");
        console.log("      그 자리에서 실패한다. 미리보기·내려받기는 된다. (보고 needsDb 의 SQL)");
      } else {
        for (const cc of ["excel_run.id", "excel_run.sheet", "excel_run.tbl",
                          "excel_row.run_id", "excel_row.tbl", "excel_row.row_id",
                          "excel_row.op", "excel_row.before"])
          ok(`v2.${cc} 가 있다 (규칙 8 되돌리기)`, has.has(cc));
      }
      await cl.end();
    }
  }
}

console.log(`\n■ 엑셀 왕복 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
