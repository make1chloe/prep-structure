/**
 * **올리기 전에 진짜 파서로 돌려본다.**
 *
 * 이 앱에서 엑셀은 조용히 실패한다 — 오류 없이 줄이 사라지고, 값이 바뀌고,
 * 열 하나가 안 맞아 통째로 0줄이 된다. 눈으로는 못 잡으니 여기서 잡는다.
 *
 * 새 함정을 겪으면 여기 한 줄 늘린다. 그러면 다음에 같은 데서 안 넘어진다.
 *
 * 쓰는 법:  node .claude/skills/엑셀정리/scripts/check.mjs <파일…>
 *           (저장소 뿌리에서 돌린다 — lib/ 를 불러와야 한다)
 */
import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import { parseTextbookAoA, TEXTBOOK_HEADERS } from "../../../../lib/importTextbook.js";
import { parseUnitAoA, UNIT_HEADERS, unitLabel, rangeMangled } from "../../../../lib/importUnit.js";
import { parseAoA, TEMPLATE_HEADERS } from "../../../../lib/importParse.js";
import { parseClassAoA, CLASS_HEADERS } from "../../../../lib/importClass.js";
import { bookKey } from "../../../../lib/bookName.js";
import { AREA_ORDER } from "../../../../lib/bookSort.js";

let bad = 0;
const no = (m) => { console.log(`  ✗ ${m}`); bad = 1; };
const ok = (m) => console.log(`  ${m}`);

/** 앱과 **똑같이** 읽는다 — 첫 시트만, 값은 고치지 않고 (lib/readSheet) */
function read(f) {
  const wb = XLSX.read(readFileSync(f), { type: "buffer", raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return {
    sheets: wb.SheetNames,
    aoa: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" })
      .map((r) => (r || []).map((c) => (c == null ? "" : String(c)))),
  };
}

const KINDS = [
  { key: "교재", parse: parseTextbookAoA, headers: TEXTBOOK_HEADERS, id: (r) => r.name },
  { key: "단원", parse: parseUnitAoA, headers: UNIT_HEADERS, id: (r) => r.textbook },
  { key: "학생", parse: parseAoA, headers: TEMPLATE_HEADERS, id: (r) => r.name },
  { key: "반", parse: parseClassAoA, headers: CLASS_HEADERS, id: (r) => r.name },
];

const files = process.argv.slice(2);
if (!files.length) { console.log("파일을 하나 이상 주세요."); process.exit(2); }

const found = [];
for (const f of files) {
  const { sheets, aoa } = read(f);
  const head = aoa[0] || [];
  console.log(`\n████ ${f.split("/").pop()}`);
  if (sheets.length > 1) {
    // 앱은 첫 시트만 읽는다 — 우리 것이 아니면 통째로 0줄이 된다
    no(`시트가 ${sheets.length}개입니다 [${sheets.join(", ")}] — 앱은 「${sheets[0]}」 하나만 읽습니다`);
  }
  console.log(`  머리줄: ${head.join(" · ")}`);

  // 어느 갈래인지 — 알아본 열이 가장 많은 것으로 본다
  let best = null;
  for (const k of KINDS) {
    const r = k.parse(aoa);
    const known = (r.fields || []).filter(Boolean).length;
    if (known && (!best || known > best.known)) best = { ...k, r, known };
  }
  if (!best || best.r.rows.length === 0) {
    no("어느 업로드에도 안 맞습니다 (알아본 열이 없거나 줄이 0개)");
    continue;
  }
  ok(`${best.key} 업로드용 — 알아본 열 ${best.known}/${head.filter(Boolean).length} · ${best.r.rows.length}줄`);
  const unknown = head.filter((h, i) => h && !best.r.fields[i]);
  if (unknown.length) no(`못 알아본 열: ${unknown.join(" · ")}`);
  found.push({ file: f, ...best });

  // ── 갈래마다 더 보는 것 ────────────────────────────
  if (best.key === "교재") {
    const badArea = best.r.rows.filter((b) => b.area && !AREA_ORDER.includes(b.area));
    if (badArea.length) no(`모르는 영역: ${[...new Set(badArea.map((b) => b.area))].join(" · ")} (아는 것: ${AREA_ORDER.join("·")})`);
    else ok("영역이 전부 아는 것입니다");
  }

  if (best.key === "단원") {
    const rows = best.r.rows;
    /**
     * **엑셀이 「1-25」 를 1월 25일로 고쳐 쓴다.** 그러면 그 단원의 분량이
     * 영영 틀린 채로 남는데 오류는 안 난다.
     */
    const m = rows.filter((r) => rangeMangled(r.question_range));
    if (m.length) no(`문항범위가 날짜로 바뀐 줄 ${m.length}개 — 엑셀에서 그 열을 「텍스트」 로 두고 다시 저장하세요`);
    else ok("문항범위가 날짜로 안 바뀌었습니다");

    // 분량이 하나도 없으면 숙제 낼 때 「얼마나」 를 알 수 없다
    const noSize = rows.filter((r) => !r.total_pages && !r.question_count && !r.word_count);
    if (noSize.length) no(`분량(쪽·문항·단어)이 없는 줄 ${noSize.length}개 — 예: ${noSize.slice(0, 3).map((r) => `${r.textbook} ${unitLabel(r).label}`).join(" · ")}`);
    else ok("모든 줄에 분량이 있습니다");

    /**
     * **덮어써지는 줄.** bulkAddUnits 는 (교재·부모·이름) 이 같으면 같은
     * 단원으로 보고 **고친다.** 활동명은 안 본다 — 그래서 활동만 다른 두
     * 줄은 하나로 합쳐지고, 뒤엣것이 앞엣것을 덮는다.
     */
    const seen = new Set(); let dup = 0; const sample = [];
    rows.forEach((r) => {
      const leaf = r.small || r.mid || r.big || "";
      const k = [r.textbook, r.big, r.mid, leaf, r.name, r.question_no].join("|");
      if (seen.has(k)) { dup++; if (sample.length < 3) sample.push(k.replace(/\|/g, " ▸ ")); }
      else seen.add(k);
    });
    if (dup) no(`겹쳐서 덮어써질 줄 ${dup}개 — ${sample.join(" / ")}`);
    else ok(`겹치는 줄 없음 (${rows.length}줄 → 단원 ${seen.size}개)`);

    const per = new Map();
    rows.forEach((r) => per.set(r.textbook, (per.get(r.textbook) || 0) + 1));
    console.log("  교재별:");
    [...per].forEach(([n, c]) => console.log(`    ${String(c).padStart(4)}  ${n}`));
  }
}

// ── 파일끼리 맞물리나 ────────────────────────────────
const books = found.find((x) => x.key === "교재");
const units = found.find((x) => x.key === "단원");
if (books && units) {
  console.log("\n████ 두 파일이 맞물리나");
  // 「리딩튜터」 와 「리딩 튜터」 는 같은 책이다 (lib/bookName)
  const have = new Set(books.r.rows.map((b) => bookKey(b.name)));
  const want = [...new Set(units.r.rows.map((u) => u.textbook))];
  const orphan = want.filter((n) => !have.has(bookKey(n)));
  if (orphan.length) no(`교재 파일에 없는 교재: ${orphan.join(" · ")} — 이대로 올리면 영역·레벨이 빈 채로 생깁니다`);
  else ok("단원의 교재가 모두 교재 파일에 있습니다");
  const empty = books.r.rows.map((b) => b.name).filter((n) => !want.some((x) => bookKey(x) === bookKey(n)));
  if (empty.length) ok(`(참고) 단원이 없는 교재: ${empty.join(" · ")}`);
  ok("올리는 차례: ① 교재 → ② 단원");
}

console.log(bad ? "\n❌ 이대로 올리면 조용히 어긋납니다" : "\n✅ 그대로 올려도 됩니다");
process.exit(bad);
