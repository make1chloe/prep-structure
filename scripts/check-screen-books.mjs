/**
 * 교재 화면 검사 — `app/books` 가 **지켜야 할 것**만 본다.
 *
 * 무엇을 지키나 (하나하나 계획의 어느 줄인지 적는다)
 *   ①  화면이 `lib/` 을 **지난다**              판단은 lib 에 산다 (원칙 1)
 *   ②  화면이 **새 판단을 안 만든다**            단원 이름·커서·멈춤을 화면이 다시 짓지 않는다
 *   ③  **단원 입구가 하나다**                    확정 ⑤ — 화면이 세 번째 입구가 되면 나무가 두 벌
 *   ④  **지우는 길이 없다**                      대전제 6 — 🗑 는 상태로 내리는 것이다 (㊷)
 *   ⑤  **탭이 없다**                            §속도 1 (탭 전환 = 화면 전체 재조회)
 *   ⑥  `alert`/`confirm` · `position:fixed` · `pushState` · `createPortal` 이 없다
 *   ⑦  **서비스 열쇠를 화면에서 안 쓴다**
 *   ⑧  **역할을 스스로 본다**                    문지기가 역할로 화면을 안 지킨다
 *   ⑨  **고르는 값을 화면에 두 벌로 안 적는다**   진짜 DB 제약과 이름표를 견준다
 *   ⑩  엑셀 미리보기가 **「파일에 없는 기존 줄 N개 — 손대지 않음」을 늘** 띄운다 (규칙 9)
 *   ⑪  SQL 이 **진짜 스키마**를 지난다            죽은 칸을 글자로 훑어서는 못 잡는다
 *   ⑫  **조회 수를 센다**                        탭이 없으니 첫 조회가 여럿이다 — 감추지 않는다
 *   ⑬  `books.css` 가 배색 규칙을 안 어긴다      오류 94·100·106·107 · ㉑ · ㉜
 *   ⑭  클래스 **대장이 양쪽으로 맞는다**
 *   ⑮  320·390·768·1400 에서 **진짜로 그려** 잰다
 *   ⑯  ⚠️ **`xlsx` 함정** — 빌드는 경고만 내고 런타임에 터지는 자리 (아래 6부)
 *
 * ⚠️ 그리고 **일부러 어기는 본보기**를 같이 넣어 검사가 그것을 잡는지까지 본다(3부).
 *    못 잡으면 이 검사가 실패한다 — 「초록인데 화면은 깨져 있음」이 제일 나쁘다.
 *
 * 돌리는 법:  node scripts/check-screen-books.mjs
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname, relative } from "node:path";
import { previewLines, BLANK } from "../lib/excel.js";

const DIR = "app/books";
const CSS = `${DIR}/books.css`;
const WIDTHS = [320, 390, 768, 1400];

let fail = 0, n = 0;
const ok = (t, cond, why = "") => {
  n++;
  if (cond) console.log(`   ✅ ${t}`);
  else { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
};
const say = (t) => console.log(`   · ${t}`);

/* ══ 0. 파일 모으기 ══════════════════════════════════════════════════ */
if (!existsSync(DIR)) { console.log(`■ ${DIR} 가 없다`); process.exit(1); }

/** `app/books` 아래 `.js` 를 전부 (`excel/route.js` 까지) */
function jsUnder(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...jsUnder(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}
const files = jsUnder(DIR);
const src = Object.fromEntries(files.map((f) => [f, readFileSync(f, "utf8")]));
const bare = Object.fromEntries(files.map((f) => [f,
  src[f].replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")]));
const allBare = Object.values(bare).join("\n");
const allSrc = Object.values(src).join("\n");
const at = (name) => bare[`${DIR}/${name}`] ?? "";

console.log("■ 교재 화면 검사  (app/books)");
say(`파일 ${files.length}개 — ${files.map((f) => relative(DIR, f)).join(" · ")}`);

const MUST_FILES = ["page.js", "read.js", "actions.js", "ui.js", "db.js", "who.js", "labels.js", "excel/route.js"];
for (const f of MUST_FILES) ok(`\`${DIR}/${f}\` 가 있다`, existsSync(`${DIR}/${f}`));
ok(`\`${CSS}\` 가 있다`, existsSync(CSS));

/* ══ 1부 — 글자로 훑는다 ═════════════════════════════════════════════ */
console.log("\n■ 1부 — 화면이 규칙을 지키는가");

// ① 화면이 lib 을 지난다
const MUST_CALL = [
  ["loadPicks",    "고르는 값을 **DB 에서** 읽는다 (엑셀 규칙 6 · 원칙 1)"],
  ["preview",      "엑셀 미리보기 — 바로 저장하지 않는다 (규칙 4)"],
  ["previewLines", "「몇 줄 생김·바뀜·손 안 댐·보류」 + 「파일에 없는 기존 줄」 (규칙 9)"],
  ["compareOnly",  "이관이 주인인 단원표는 **대조 기준**이다 (확정 ⑤)"],
  ["apply",        "올리기 — 「만들자」를 눌러야 만든다 (규칙 3)"],
  ["undo",         "묶음 통째로 되돌리기 (규칙 8)"],
  ["readWorkbook", "엑셀 읽기 한 벌"],
  ["makeWorkbook", "엑셀 굽기 한 벌 — 내려받기와 올리기가 같은 모양 (규칙 1)"],
  ["downloadRows", "내려받기 — **모든 표에 둔다** (확정 ⑤)"],
  ["splitDots",    "`·` 가르기 한 벌 — 체크리스트·걸음을 화면이 따로 가르지 않는다"],
  ["STOP",         "멈춤 세 낱말의 **값** (⑬ · lib/routine.js)"],
  ["stepLabel",    "자료 종류 걸음 이름 (lib/todo.js)"],
  ["SHEETS",       "엑셀 표 이름·주인 (확정 ⑤)"],
];
for (const [fn, why] of MUST_CALL)
  ok(`화면이 \`${fn}\` 을 지난다 — ${why}`, new RegExp(`\\b${fn}\\b`).test(allBare));

// 화면 밖으로 나가는 들여오기는 **`lib/` 뿐이다**
{
  const bad = [];
  for (const f of files)
    for (const m of bare[f].matchAll(/from\s+"([^"]+)"/g)) {
      const p = m[1];
      if (!p.startsWith(".")) continue;                       // 꾸러미는 상관없다
      const abs = resolve(dirname(f), p);
      const rel = relative(resolve("."), abs);
      if (rel.startsWith(`${DIR}/`) || rel === DIR) continue;  // 내 폴더 안
      if (rel.startsWith("lib/")) continue;                    // lib 은 된다
      bad.push(`${relative(DIR, f)} → ${p}`);
    }
  ok("화면 밖으로 나가는 들여오기가 **`lib/` 뿐이다** (남의 화면 폴더를 안 본다)",
     bad.length === 0, bad.join(" · "));
}

/**
 * 글자 감사자 — ⚠️ **본보기로도 돌려 본다**(3부). 못 잡으면 검사가 실패한다.
 */
function auditSrc(text) {
  const bad = [];
  const add = (code, why) => bad.push({ code, why });
  const t = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  // S1 알림창 — 뜨면 자동화가 그 자리에서 멈춘다
  if (/(^|[^.\w])alert\s*\(/.test(t)) add("S1", "`alert(` 을 쓴다");
  if (/(^|[^.\w])confirm\s*\(/.test(t)) add("S1", "`confirm(` 을 쓴다");
  // S2 닫는 길이 화면 밖으로 나가는 것들
  if (/position\s*:\s*["']?fixed/.test(t)) add("S2", "`position:fixed` 를 쓴다");
  if (/history\.pushState/.test(t)) add("S2", "`history.pushState` 를 쓴다");
  if (/createPortal/.test(t)) add("S2", "`createPortal` 을 쓴다");
  // S3 서비스 열쇠 — 쓰면 접근 규칙을 통째로 지나간다
  if (/SUPABASE_SERVICE_ROLE_KEY|serviceDb/.test(t)) add("S3", "서비스 열쇠를 화면에서 쓴다");
  // S4 지우지 않는다 (대전제 6) — 🗑 는 상태로 내리는 것이다 (㊷)
  if (/\bdelete\s+from\b/i.test(t)) add("S4", "`delete from` 이 있다 — 지우지 않는다(대전제 6)");
  // S5 탭이 없다 (§속도 1)
  if (/role\s*=\s*["']tab["']|[?&]tab=|<Tabs\b|useTab\b/.test(t)) add("S5", "탭이 있다");
  // S6 남의 한 벌을 화면이 직접 만짐
  if (/staff_note/.test(t)) add("S6", "원장 전용 메모 칸 이름이 화면에 있다 — lib/close.js 한 곳뿐이다");
  if (/NOTIFY_SINK/.test(t)) add("S6", "발송 스위치를 화면이 읽는다 — lib/notify.js 한 곳뿐이다");
  if (/from\s+v2\.class_member\b/i.test(t)) add("S6", "반 명단을 직접 조회한다 — v2.class_roster() 를 지나야 한다");
  // S7 커서는 lib/routine.js 가 부른다
  if (/v2\.cursor_of\s*\(/.test(t)) add("S7", "커서를 화면이 직접 부른다 — lib/routine.js 것이다");
  // S8 단원 이름을 화면이 조립한다 — 이름은 v2.unit_label 한 벌이다
  if (/["'`][^"'`]*›[^"'`]*["'`]\s*\+|\+\s*["'`][^"'`]*›/.test(t))
    add("S8", "단원 이름을 글자로 이어 붙인다 — `v2.unit_label` 이 짓는다");
  // S9 단원 입구가 하나다 (확정 ⑤)
  if (/insert\s+into\s+v2\.units\b/i.test(t))
    add("S9", "화면이 단원을 만든다 — 한 교재의 단원은 한 곳에서만 들어온다(확정 ⑤)");
  if (/insert\s+into\s+v2\.books\b/i.test(t))
    add("S9", "화면이 교재를 만든다 — 대전제 1대로 옛 앱에 만든다");
  // S10 진도·커서를 화면이 쓴다
  if (/(insert\s+into|update)\s+v2\.progress\b/i.test(t))
    add("S10", "진도를 화면이 직접 쓴다 — lib/progress.js 한 벌이다");
  return bad;
}

{
  const bad = auditSrc(allSrc);
  ok("화면 소스가 규칙을 하나도 안 어긴다", bad.length === 0);
  bad.forEach((b) => console.log(`        [${b.code}] ${b.why}`));
}

// ⑧ 역할을 스스로 본다
ok("`page.js` 가 역할을 **스스로** 본다", /staffOnly\(\)/.test(at("page.js")));
ok("`actions.js` 가 역할을 **스스로** 본다", /staffOnly\(\)/.test(at("actions.js")));
ok("`excel/route.js` 가 역할을 **스스로** 본다 (문지기는 역할로 주소를 안 지킨다)",
   /staffOnly\(\)/.test(bare[`${DIR}/excel/route.js`] ?? ""));
ok("서버 동작이 **전부** 한 문(`run`)을 지나 역할·문열기를 거친다",
   at("actions.js").split("export async function").slice(1).every((b) => /return\s+run\(/.test(b)),
   at("actions.js").split("export async function").slice(1)
     .filter((b) => !/return\s+run\(/.test(b)).map((b) => b.slice(0, 30).trim()).join(" · "));

// ④ 지우는 길이 없다 + 🗑 는 상태로 내린다
ok("🗑 가 **상태로 내리는 것**이다 (`state` 를 바꾼다 — 지우지 않는다, ㊷·대전제 6)",
   /update v2\.learn_items set state/.test(at("actions.js"))
   && /update v2\.units set state/.test(at("actions.js")));
ok("되살리는 길이 있다 (내린 것을 다시 `active` 로)",
   /되살/.test(src[`${DIR}/ui.js`] ?? ""));

// ⑫ 조회 수를 감추지 않는다
ok("화면이 **조회 수를 띄운다** (상한을 넘으면 그대로 밝힌다)",
   /QUERY_CAP/.test(at("page.js")) && /물은 횟수|상한/.test(src[`${DIR}/page.js`] ?? ""));

// 문 여는 방법이 오늘 화면과 **갈리지 않았나** — 두 벌인 것을 검사가 안다
{
  const mine = at("db.js");
  const theirs = existsSync("app/today/db.js")
    ? readFileSync("app/today/db.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, " ") : null;
  const key = (s) => (s.match(/set_config\('request\.jwt\.claims'[\s\S]{0,200}?set role authenticated;/) ?? [""])[0]
    .replace(/\s+/g, " ");
  ok("문 여는 방법이 `app/today/db.js` 와 **같다** (두 벌이라 갈리면 여기서 잡는다)",
     theirs === null || (key(mine) !== "" && key(mine) === key(theirs)),
     "한쪽만 고쳤다 — `lib/` 로 한 벌 내려야 한다");
  ok("문을 연 뒤 **반드시 닫는다** (`finally` 에 `end()`)",
     /finally\s*\{[\s\S]{0,120}end\(\)/.test(at("page.js")) && /finally\s*\{[\s\S]{0,120}end\(\)/.test(at("actions.js")));
}

/* ══ 2부 — 엑셀 왕복이 규칙 9 를 지키는가 (실제로 돌려서) ═══════════ */
console.log("\n■ 2부 — 엑셀 미리보기가 「파일에 없는 기존 줄」을 **늘** 띄우는가 (규칙 9)");
{
  const mk = (missing) => previewLines({
    title: "단원표", table: "units", owner: "이관", ask: null,
    counts: { add: 0, change: 0, same: 0, hold: 0 },
    missing, untouchedCells: 0, filled: 0, unknownHeads: [], picksMissing: [], hold: [],
  });
  const zero = mk(0), some = mk(7);
  const line = /파일에 없는 기존 줄 (\d+)개 — 손대지 않음/;
  ok("0개일 때도 그 줄이 **뜬다** (원장님이 「엑셀에서 지웠으니 없어졌겠지」를 바로잡는 유일한 자리)",
     zero.some((l) => line.test(l) && line.exec(l)[1] === "0"));
  ok("7개일 때 그 줄이 **7** 로 뜬다", some.some((l) => line.exec(l)?.[1] === "7"));
  ok("「값을 지우려면 (비움)」 안내가 같이 뜬다", zero.some((l) => l.includes(BLANK)));
  ok("화면이 그 줄들을 **그대로** 띄운다 (다시 세지 않는다 — 원칙 1)",
     /pre\.lines\.join/.test(src[`${DIR}/ui.js`] ?? ""));
  ok("**미리보기 없이는 저장 단추가 안 눌린다** (규칙 4 — 바로 저장하지 않는다)",
     /disabled=\{busy \|\| !pre\}/.test(src[`${DIR}/ui.js`] ?? ""));
  ok("「만들자」를 안 누르면 **안 만든다** (규칙 3)",
     /create\s*\?\s*"1"\s*:\s*"0"/.test(src[`${DIR}/ui.js`] ?? "")
     && /create\s*=\s*String\(form\.get\("create"\)/.test(at("actions.js")));
  ok("주인이 다르면 **묻고 답을 받는다** (확정 ⑤)",
     /ownerOk/.test(at("actions.js")) && /p\.ask/.test(at("actions.js")));
  ok("미리보기 뒤 DB 가 바뀌면 **안 넣는다**",
     /seenAdd|seen\.add/.test(at("actions.js")) && /moved/.test(at("actions.js")));
}

/* ══ 3부 — 일부러 어긴 본보기를 검사가 잡는가 ══════════════════════ */
console.log("\n■ 3부 — 일부러 어긴 본보기를 검사가 **잡는가**");
{
  const 본보기 = `
    function a(){ alert("x"); }
    const s = { position: "fixed" };
    history.pushState({}, "", "/x");
    const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
    await db.query("delete from v2.learn_items where id=$1");
    <div role="tab" />
    const m = row.staff_note;
    const sink = NOTIFY_SINK;
    await db.query("select * from v2.class_member");
    await db.query("select * from v2.cursor_of($1,$2)");
    const label = u.chapter + " › " + u.sub;
    await db.query("insert into v2.units(book_id) values ($1)");
    await db.query("update v2.progress set status='done'");
  `;
  const got = new Set(auditSrc(본보기).map((b) => b.code));
  const want = [["S1", "알림창"], ["S2", "붙박이·주소 밀어넣기"], ["S3", "서비스 열쇠"],
                ["S4", "지우기"], ["S5", "탭"], ["S6", "남의 한 벌"], ["S7", "커서 직접 부르기"],
                ["S8", "단원 이름 조립"], ["S9", "단원 입구 두 벌"], ["S10", "진도 직접 쓰기"]];
  for (const [code, name] of want) ok(`본보기의 「${name}」을 잡았다`, got.has(code));
}

/* ══ 4부 — books.css 를 훑는다 ═════════════════════════════════════ */
console.log("\n■ 4부 — books.css 가 배색·레이아웃 규칙을 지키는가");

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

function parseRules(s, media = "") {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("{", i);
    if (open < 0) break;
    const pre = s.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < s.length && depth > 0) { const c = s[j]; if (c === "{") depth++; else if (c === "}") depth--; j++; }
    const body = s.slice(open + 1, j - 1);
    if (pre.startsWith("@")) {
      if (/^@(media|supports|container)\b/.test(pre)) out.push(...parseRules(body, media ? `${media} ${pre}` : pre));
    } else if (pre) out.push({ sel: pre.replace(/\s+/g, " "), body, media });
    i = j;
  }
  return out;
}
function decls(body) {
  const out = []; let buf = "", par = 0;
  for (const c of body) {
    if (c === "(") par++; else if (c === ")") par--;
    if (c === ";" && par === 0) { out.push(buf); buf = ""; } else buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out.map((d) => { const k = d.indexOf(":"); return k < 0 ? null
    : { prop: d.slice(0, k).trim().toLowerCase(), val: d.slice(k + 1).trim() }; }).filter(Boolean);
}

/** ⚠️ 이 감사자도 **본보기로 돌려 본다**(5부). 못 잡으면 검사가 실패한다 */
function auditCss(raw) {
  const bad = [];
  const add = (code, why) => bad.push({ code, why });
  const rules = parseRules(stripComments(raw)).map((r) => ({ ...r, d: decls(r.body) }));

  for (const r of rules) for (const d of r.d) {
    if (/(^|-)(color|background|background-color|border-color|box-shadow|outline-color)$/.test(d.prop)
        && /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(d.val))
      add("C1", `${r.sel} { ${d.prop}: ${d.val} } — 새 색을 만들었다. \`var(--…)\` 토큰을 써라`);
    if (d.prop === "font-size" && !/var\(--fs\d+\)/.test(d.val))
      add("C2", `${r.sel} { font-size: ${d.val} } — 크기는 \`var(--fsN)\` 열 종뿐이다 (오류 106)`);
    if (d.prop === "opacity" && d.val.trim() !== "1")
      add("C3", `${r.sel} { opacity: ${d.val} } — 「덜 중요함」은 색으로 말한다 (㉑)`);
    if (d.prop === "flex" && /^\s*1\s*$/.test(d.val))
      add("C4", `${r.sel} { flex: 1 } — basis 가 없다. 390px 에서 26px 로 눌린다 (오류 94)`);
    if (d.prop === "flex" && /^\s*\d+\s+\d+\s+0(px|%)?\s*$/.test(d.val))
      add("C4", `${r.sel} { flex: ${d.val} } — basis 가 0 이다 (오류 94)`);
    if (/^grid(-template(-columns|-rows)?)?$/.test(d.prop) && /\b1fr\b/.test(d.val) && !/minmax\(/.test(d.val))
      add("C5", `${r.sel} { ${d.prop}: ${d.val} } — 맨 \`1fr\` 이다. \`minmax(0,1fr)\` 이라야 한다 (㉜)`);
    if (d.prop === "font-family" && /mono|menlo|consolas|courier/i.test(d.val))
      add("C6", `${r.sel} — 한글이 드는 자리에 고정폭 글꼴을 걸었다 (오류 107)`);
    if (d.prop === "position" && /fixed/.test(d.val))
      add("C8", `${r.sel} { position: fixed } — 닫는 길이 화면 밖으로 나간다 (대전제 10)`);
  }
  for (const r of rules)
    for (const m of r.sel.matchAll(/\.([A-Za-z][A-Za-z0-9-]*)/g))
      if (/^(open|on|sel|off|active|done|new)$/.test(m[1]))
        add("C7", `${r.sel} — 한 낱말 상태 클래스 \`.${m[1]}\` 는 금지다. \`is-\` 를 붙여라 (오류 49·92)`);
  return { bad, rules };
}

{
  const raw = readFileSync(CSS, "utf8");
  const a = auditCss(raw);
  ok("books.css 가 규칙을 하나도 안 어긴다", a.bad.length === 0);
  a.bad.forEach((b) => console.log(`        [${b.code}] ${b.why}`));

  // ⑭ 대장이 양쪽으로 맞는가
  const defined = new Set();
  for (const r of a.rules) for (const m of r.sel.matchAll(/\.(bk-[A-Za-z0-9-]+)/g)) defined.add(m[1]);
  const registry = new Set([...raw.matchAll(/@이름\s+\.(bk-[A-Za-z0-9-]+)/g)].map((m) => m[1]));
  const used = new Set([...allSrc.matchAll(/\b(bk-[A-Za-z0-9-]+)\b/g)].map((m) => m[1]));

  const noReg = [...defined].filter((c) => !registry.has(c));
  ok("books.css 의 모든 클래스가 **이름 대장**에 있다", noReg.length === 0, noReg.join(" "));
  const unused = [...defined].filter((c) => !used.has(c));
  ok("books.css 가 정의한 클래스를 화면이 **다 쓴다**", unused.length === 0, `안 쓰는 것: ${unused.join(" ")}`);
  const undef = [...used].filter((c) => !defined.has(c));
  ok("화면이 쓰는 `bk-` 클래스가 books.css 에 **다 있다**", undef.length === 0, `정의 없는 것: ${undef.join(" ")}`);

  // 좁은 화면 규칙이 맨 끝인가 (오류 100)
  const lastMedia = [...raw.matchAll(/@media[^{]*\{/g)].pop();
  ok("폭 규칙이 파일 **맨 끝**에 있다 (뒤에 같은 특정도 규칙이 오면 밀린다 — 오류 100)",
     !!lastMedia && raw.slice(lastMedia.index).indexOf("@media") === 0);
}

/* ══ 5부 — 일부러 어긴 CSS 본보기를 잡는가 ═════════════════════════ */
console.log("\n■ 5부 — 일부러 어긴 CSS 본보기를 검사가 **잡는가**");
{
  const 본보기 = `
  .bk-bad1 { color: #ff0000; }
  .bk-bad2 { font-size: 13.5px; }
  .bk-bad3 { opacity: .45; }
  .bk-bad4 { flex: 1; }
  .bk-bad5 { display: grid; grid-template-columns: repeat(7, 1fr); }
  .bk-bad6 { font-family: Menlo, monospace; }
  .bk-bad8 { position: fixed; }
  .open    { display: block; }`;
  const got = new Set(auditCss(본보기).bad.map((b) => b.code));
  const want = [["C1", "새 색"], ["C2", "0.5px 단 글씨 크기"], ["C3", "투명도로 흐리게"],
                ["C4", "basis 없는 flex:1"], ["C5", "맨 1fr grid"], ["C6", "한글에 고정폭"],
                ["C7", "한 낱말 상태 클래스"], ["C8", "position:fixed"]];
  for (const [code, name] of want) ok(`본보기의 「${name}」을 잡았다`, got.has(code));
}

/* ══ 6부 — ⚠️ `xlsx` 함정 ═════════════════════════════════════════
 * 실측 2026-09-02 — `lib/excel.js` 는 `import XLSX from "xlsx"` 로 **기본 내보내기**를 받는데
 * `xlsx` 꾸러미의 ESM 빌드(`xlsx.mjs`)에는 `export default` 가 **0건**이다.
 * Node 로 그냥 부르면 `main`(CJS)이 잡혀 되므로 `scripts/check-excel.mjs` 는 **초록인데**,
 * 웹팩은 `module` 을 잡아 `XLSX` 가 `undefined` 가 되고 **런타임에** 터진다:
 *   `TypeError: Cannot read properties of undefined (reading 'utils')`
 * → `lib/excel.js` 가 `import * as XLSX` 로 바뀌거나, `next.config.mjs` 가
 *   `serverExternalPackages` 에 `xlsx` 를 두거나, 둘 중 하나라야 한다.
 * ══════════════════════════════════════════════════════════════════ */
console.log("\n■ 6부 — 엑셀이 **번들 안에서도** 사는가 (`xlsx` 기본 내보내기 함정)");
{
  const mjs = existsSync("node_modules/xlsx/xlsx.mjs") ? readFileSync("node_modules/xlsx/xlsx.mjs", "utf8") : null;
  const hasDefault = mjs === null ? true : /export\s+default\b/.test(mjs);
  const libSrc = existsSync("lib/excel.js") ? readFileSync("lib/excel.js", "utf8") : "";
  const nsImport = /import\s+\*\s+as\s+XLSX\s+from\s+["']xlsx["']/.test(libSrc);
  const cfg = existsSync("next.config.mjs") ? readFileSync("next.config.mjs", "utf8") : "";
  const external = /serverExternalPackages\s*:\s*\[[^\]]*["']xlsx["']/.test(cfg);
  say(`xlsx.mjs 의 \`export default\` ${hasDefault ? "있음" : "**없음**"} · ` +
      `lib/excel.js 는 ${nsImport ? "이름공간(import * as)" : "기본(import XLSX)"} 들여오기 · ` +
      `next.config.mjs 바깥 꾸러미 ${external ? "있음" : "없음"}`);
  ok("엑셀이 웹팩 번들에서 살아 있다 (`import * as` 이거나 `serverExternalPackages` 에 xlsx 가 있다)",
     hasDefault || nsImport || external,
     "빌드는 경고만 내고 지나가지만 `makeWorkbook`/`readWorkbook` 이 런타임에 " +
     "`Cannot read properties of undefined (reading 'utils')` 로 터진다");
}

/* ══ 7부 — 진짜 DB ═════════════════════════════════════════════════ */
console.log("\n■ 7부 — 진짜 DB 로 (SQL 이 사는가 · 고르는 값 · 조회를 몇 번 하는가)");

const dbUrl = (() => {
  try { return readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? null; }
  catch { return null; }
})();

let longBook = "일관성 있는 기준 영문법";
let longUnit = "CHAPTER 06 심경 변화 및 장문 › 유형 16 심경 변화 파악 · 유형 17 장문 독해";

if (!dbUrl) {
  fail++;
  console.log("   ❌ `.env.local` 의 `DATABASE_URL` 이 없어 **진짜 스키마를 못 물어봤다** — 있는 척하지 않는다");
} else {
  const { Client } = await import("pg");
  const { SQL, loadAll, treeOf, LABEL, LABEL_FOR } = await import("../app/books/read.js");
  const { QUERY_CAP } = await import("../app/books/db.js");
  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  let live = true;
  try { await c.connect(); } catch (e) { live = false; fail++; console.log(`   ❌ DB 에 못 붙었다 — ${e.message.split("\n")[0]}`); }

  if (live) {
    // ⑪ SQL 이 진짜 스키마를 지나는가 — 죽은 칸은 여기서 터진다
    let i = 0;
    for (const [name, sql] of Object.entries(SQL)) {
      try {
        await c.query(`prepare _b${i} as ${sql}`);
        await c.query(`deallocate _b${i}`);
        ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, true);
      } catch (e) { ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, false, e.message.split("\n")[0]); }
      i++;
    }

    // 접근 규칙을 흉내 낸 채로 — 화면이 여는 문과 **같은 방법**
    const pid = (await c.query("select id from v2.profiles where role='principal' order by name limit 1")).rows[0]?.id;
    ok("원장 계정이 있다 (없으면 이 화면을 열 사람이 없다)", !!pid);
    if (pid) {
      await c.query(`select set_config('request.jwt.claims', '{"sub":"${pid}","role":"authenticated"}', false);`
                  + ` set role authenticated;`);
      ok("`set role authenticated` 로 갈아탔다 (화면이 접근 규칙 밖으로 안 나간다)",
         (await c.query("select current_user u")).rows[0].u === "authenticated");

      let q = 0;
      const db = { query: (s, p) => { if (!/^\s*(begin|commit|rollback)\b/i.test(String(s))) q++; return c.query(s, p); } };

      // 교재를 안 고른 첫 화면
      const t0 = Date.now();
      const bare0 = await loadAll(db, {});
      const q0 = q, ms0 = Date.now() - t0;
      say(`교재를 안 골랐을 때 — 조회 ${q0}번 · ${ms0}ms · 교재 ${bare0.books.length}권`);
      ok(`첫 조회가 상한(${QUERY_CAP}) 안이다`, q0 <= QUERY_CAP, `${q0}번`);

      // 단원이 가장 많은 교재를 골라 본다
      const big = (await c.query(
        `select book_id id, count(*)::int n from v2.units where state='active' group by 1 order by 2 desc limit 1`)).rows[0];
      q = 0;
      const t1 = Date.now();
      const d = await loadAll(db, { bookId: big?.id ?? null });
      say(`단원 ${big?.n ?? 0}줄짜리 교재를 골랐을 때 — 조회 ${q}번 · ${Date.now() - t1}ms`);
      ok(`교재를 골라도 상한(${QUERY_CAP}) 안이다`, q <= QUERY_CAP, `${q}번`);
      ok("교재를 고르면 조회가 **딱 하나** 는다 (단원 나무 하나)", q === q0 + 1, `${q0} → ${q}`);

      // ⑨ 고르는 값을 화면에 두 벌로 안 적었나 — **진짜 제약과 견준다**
      {
        const miss = [];
        for (const [tbl, col, key] of LABEL_FOR) {
          const r = await c.query(
            `select pg_get_constraintdef(c.oid) d from pg_constraint c
               join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
              where n.nspname='v2' and t.relname=$1 and c.contype='c'`, [tbl]);
          const def = r.rows.map((x) => String(x.d)).find((x) => new RegExp(`\\(?${col}\\s*=\\s*ANY`).test(x));
          if (!def) { miss.push(`${tbl}.${col} — DB 에 고르는 값 제약이 **없다**`); continue; }
          const vals = [...def.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
          for (const v of vals) if (!(v in (LABEL[key] ?? {}))) miss.push(`${tbl}.${col} = ${v} → 이름표 없음`);
          for (const v of Object.keys(LABEL[key] ?? {})) if (!vals.includes(v)) miss.push(`${tbl}.${col} — 이름표에만 있는 값 ${v}`);
        }
        ok("이름표가 **진짜 DB 제약과 딱 맞는다** (한쪽에만 있는 값 0개 — 계획 「고르는 값을 두 벌로 적지 않는다」)",
           miss.length === 0, miss.join(" · "));
      }
      ok("고르는 값을 **DB 에서 읽어** 왔다 (화면에 목록을 안 적었다)",
         (d.picks.books?.area ?? []).length > 0 && (d.picks.area_routine?.place ?? []).length > 0);

      // 단원 나무가 **세 겹**인가
      {
        const tree = treeOf(d.tree);
        const threeDeep = tree.length > 0 && tree.every((ch) => ch.mids.length > 0
          && ch.mids.every((m) => Array.isArray(m.subs) && m.subs.length > 0));
        ok("단원 나무가 **대 › 중 › 소 세 겹**이다 (중단원이 비어도 겹을 안 없앤다)", threeDeep,
           `대단원 ${tree.length}개`);
        const sum = tree.reduce((a, ch) => a + ch.n, 0);
        ok("나무가 줄을 하나도 안 잃는다", sum === d.tree.length, `${sum} ≠ ${d.tree.length}`);
        say(`고른 교재 — 대단원 ${tree.length}개 · 줄 ${d.tree.length}개 · ` +
            `중단원 없는 자리 ${tree.reduce((a, ch) => a + ch.mids.filter((m) => m.empty).length, 0)}개`);
      }

      // ㉙ — 기준이 뜻 있는 교재는 워크북이 있는 것뿐이다
      {
        const wb = d.books.filter((b) => b.units_wb > 0);
        say(`워크북이 있어 「대단원 기준/소단원 기준」이 **뜻이 있는** 교재 ${wb.length}권 · ` +
            `그중 대단원 기준 ${wb.filter((b) => b.order_basis === "chapter").length}권`);
        ok("워크북이 없는 교재에는 화면이 「뜻 없음」을 밝힌다",
           /워크북 없음 · 뜻 없음/.test(src[`${DIR}/page.js`] ?? ""));
      }

      // ⑬ 멈춤은 v2.book_stop 이 판정한다 — 화면이 다시 안 센다
      {
        const stopped = d.books.filter((b) => b.hw_off > 0 || b.book_off > 0);
        say(`지금 멈춘 배정이 있는 교재 ${stopped.length}권 · 배정이 있는 교재 ${d.books.filter((b) => b.assigned > 0).length}권`);
        ok("멈춤을 `v2.book_stop()` 이 판정한다 (화면·JS 가 다시 세지 않는다)",
           /v2\.book_stop\(/.test(at("read.js"))
           && !/stop_until|stop_exam_id/.test(at("page.js") + at("ui.js")));
      }

      // 대전제 0 — 무엇이 없어서 비었나를 **숫자로** 안다
      say(`무엇이 없어서 비었나 — 영역 없는 교재 ${(d.empty.no_area ?? []).length}권 · ` +
          `단원 0줄 교재 ${d.empty.books_no_units}권 · 학생 루틴 ${d.empty.student_routine_rows}줄 · ` +
          `내려둔 항목 ${d.empty.items_retired}개 · 자료 종류 ${d.materialType.length}종 · 영상 ${d.video.length}개`);
      ok("빈 자리를 **예쁘게 넘기지 않고 까닭을 적는다** (대전제 0)",
         /무엇이 없어서 비었나/.test(src[`${DIR}/page.js`] ?? ""));

      // 화면에 실제로 들어갈 **진짜 긴 글자** (6부 그림에 쓴다)
      longBook = (await c.query("select name t from v2.books order by length(name) desc limit 1")).rows[0]?.t ?? longBook;
      longUnit = (await c.query(
        "select v2.unit_label(id) t from v2.units order by length(v2.unit_label(id)) desc limit 1")).rows[0]?.t ?? longUnit;
    }
    await c.end();
  }
}

/* ══ 8부 — 진짜 브라우저로 그려 잰다 ═══════════════════════════════ */
console.log("\n■ 8부 — 320·390·768·1400 에서 **진짜로 그려** 잰다");

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => existsSync(p)) || null;

const AUDIT = `(() => {
  const S = (e) => getComputedStyle(e);
  const nm = (e) => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\\s+/).join(".") : "")
                  + " «" + (e.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24) + "»";
  const box = (e) => { const s = S(e); return /(auto|scroll|hidden)/.test(s.overflowX) || /(auto|scroll|hidden)/.test(s.overflowY); };
  const scrollX = (e) => /(auto|scroll)/.test(S(e).overflowX);
  const anc = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (box(p)) return true; return false; };
  const hit = [];
  const put = (k, e, why) => hit.push({ k, el: nm(e), why });
  const els = [...document.querySelectorAll("body *")];
  for (const e of els) {
    const s = S(e), r = e.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden") continue;
    const fixed = s.position === "absolute" || s.position === "fixed";
    const leaf = e.children.length === 0;
    const own = [...e.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join("").trim();
    const p = e.parentElement;
    if (p && p !== document.body && p !== document.documentElement && !fixed && !box(p)) {
      const pr = p.getBoundingClientRect(), right = pr.left + p.clientLeft + p.clientWidth;
      if (r.width > 0 && r.right - right > 1) put(1, e, "부모보다 " + Math.round(r.right - right) + "px 오른쪽으로 나감");
    }
    if (leaf && own && r.width > 0 && r.width < 80 && r.height > r.width * 2.2 && r.height > 30) {
      const rg = document.createRange(); rg.selectNodeContents(e);
      const lines = [...rg.getClientRects()].filter((x) => x.width > .5 && x.height > .5);
      const chars = own.replace(/\\s/g, "").length;
      if (lines.length >= 3 && chars / lines.length <= 2.5)
        put(3, e, Math.round(r.width) + "px 폭에 " + lines.length + "줄 — 글자가 세로로 쌓였다");
    }
    const hidden = (r.width < 2 && r.height < 2) || (s.clipPath && s.clipPath !== "none");
    if (!/^(input|textarea|select)$/.test(e.tagName.toLowerCase()) && !scrollX(e) && !hidden
        && e.scrollWidth - e.clientWidth > 1 && e.clientWidth > 0)
      put(4, e, "안쪽 글이 " + e.scrollWidth + "px 인데 칸은 " + e.clientWidth + "px — 뒤가 잘린다");
    if (!fixed && r.width > 0 && (r.right - innerWidth > 1 || r.left < -1) && !anc(e))
      put(5, e, "화면(" + innerWidth + "px) 밖으로 나감");
    if ((e.tagName === "BUTTON" || e.classList.contains("btn") || e.classList.contains("bk-op"))
        && r.height > 58 && r.width < 120 && r.width > 0)
      put(6, e, Math.round(r.width) + "×" + Math.round(r.height) + " — 단추가 세로로 늘어났다");
    if (Number(s.opacity) < 1 && !e.classList.contains("is-drag"))
      put(8, e, "opacity " + s.opacity + " — 「덜 중요함」은 색으로 말한다");
  }
  return JSON.stringify(hit);
})()`;

/** ⚠️ 펴면 **진짜 보이나** — 안 보이면 화면 검사는 잴 것이 없어 0건으로 지나간다 */
const FOLD_PROBE = `(() => {
  const out = [];
  for (const d of document.querySelectorAll("details.bk-fold, details.bk-ch")) {
    d.open = true;
    for (const bd of d.children) {
      if (bd.tagName === "SUMMARY") continue;
      const s = getComputedStyle(bd), r = bd.getBoundingClientRect();
      out.push({ cls: bd.className, display: s.display, h: Math.round(r.height) });
    }
  }
  return JSON.stringify(out);
})()`;

/** 표가 가로로 구르고 **머리가 붙나** (넓은 화면) / 폰에서는 안 붙는다 (㉜ 1) */
const TABLE_PROBE = `(() => {
  const w = document.querySelector(".tblwrap"), th = document.querySelector(".tbl th");
  return JSON.stringify({
    overflowX: getComputedStyle(w).overflowX, overflowY: getComputedStyle(w).overflowY,
    thPos: getComputedStyle(th).position, minW: getComputedStyle(document.querySelector(".tbl")).minWidth,
  });
})()`;

if (!CHROME) {
  fail++;
  console.log("   ❌ 브라우저가 없어 **화면을 실제로 그려 보지 못했다** — 있는 척하지 않는다");
} else {
  const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
  const ops = `<span class="bk-ops"><button class="bk-op">▲</button><button class="bk-op">▼</button><button class="bk-op">🗑</button></span>`;
  const row = (nm2) => `<div class="bk-line"><span class="num muted">3</span><span class="grow">${esc(nm2)}</span>
      <span class="chip">학원+숙제</span><span class="pill pilloff">항목이 내려져 있어 이 줄은 안 뜹니다</span>
      <span class="num muted">지난 기록 803줄</span>${ops}</div>`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>교재 본보기</title>
<style>${readFileSync("app/globals.css", "utf8")}</style><style>${readFileSync(CSS, "utf8")}</style>
</head><body><main class="wrap"><div class="stack">
<div class="bk-head"><h1>교재</h1><span class="num muted">2026-09-02</span><span class="grow"></span>
  <a class="btn btnghost" href="#">← 대시보드</a></div>
<div class="card"><div class="cardhd">⚠️ 무엇이 없어서 비었나</div>
  <ul><li><b>영역이 안 붙은 교재 8권</b> — 루틴은 영역에 붙으므로 배정이 한 줄도 안 나갑니다. ${esc(longBook)}</li>
      <li><b>단원이 0줄인 교재 60권</b></li></ul></div>
<div class="card"><div class="cardhd">교재 <span class="num">162권</span><span class="muted">이름을 누르면 그 교재가 아래에 섭니다</span></div>
  <p class="bk-why">⚠️ 「대단원 기준 / 소단원 기준」은 워크북이 있는 11권에서만 뜻이 있습니다.</p>
  <div class="tblwrap"><table class="tbl"><thead><tr>
    <th class="hdstick">교재</th><th class="hdstick">영역</th><th class="hdstick">배정 겹</th>
    <th class="hdstick">도는 차례</th><th class="hdstick">단원</th><th class="hdstick">지금 배정</th>
    <th class="hdstick">교재 상태</th></tr></thead>
    <tbody>${Array.from({ length: 12 }, (_, i) => `<tr>
      <td><a class="bk-name${i === 1 ? " is-sel" : ""}" href="#">${esc(longBook)}</a></td>
      <td>문법</td><td>소단원</td><td>대단원 기준 <span class="pilloff pill">워크북 없음 · 뜻 없음</span></td>
      <td class="num">203<span class="chip">워크북 78</span><span class="pill pilloff">내림 2</span></td>
      <td class="num"><span class="pill pillok">돌아감 4</span><span class="pill pillwarn">숙제멈춤 6</span><span class="pill pillbad">교재멈춤 1</span></td>
      <td><span class="pill pillok">쓰는 중</span></td></tr>`).join("")}</tbody></table></div></div>
<div class="card"><div class="cardhd">${esc(longBook)}<span class="chip">문법</span>
    <span class="num muted">단원 203줄 · 대단원 12개 · 워크북 78줄</span><span class="grow"></span>
    <a class="btn btnghost" href="#">닫기</a></div>
  <div class="bk-form"><div class="bk-grid">
    <label><span class="lbl">영역 — 루틴이 여기에 붙는다</span><select class="fld"><option>문법</option></select></label>
    <label><span class="lbl">배정 겹 — 한 번에 내는 최소 덩어리</span><select class="fld"><option>소단원</option></select></label>
    <label><span class="lbl">도는 차례</span><select class="fld"><option>대단원 기준</option></select></label>
    <label><span class="lbl">교재 상태</span><select class="fld"><option>쓰는 중</option></select></label></div>
    <p class="bk-why">워크북 <b>78줄</b>이 있어 이 칸이 <b>실제로 갈립니다</b>. ⚠️ 워크북은 <b>대단원 전체를 한 번에</b> 냅니다.</p>
    <div class="row"><button class="btn btnmain">저장</button></div></div>
  <h3>단원 나무 — 대 › 중 › 소</h3>
  <div class="bk-tree">${Array.from({ length: 3 }, (_, i) => `
    <details class="bk-ch" open><summary class="bk-foldhd"><span class="bk-unit">${esc(longUnit)}</span>
      <span class="num muted">15줄</span><span class="chip">워크북 7</span><span class="pill pilloff">내림 1</span></summary>
      <div class="bk-foldbd"><div class="bk-mid">
        <div class="bk-sub"><span class="bk-unit"><span class="muted">중단원 없음</span></span><span class="num muted">2줄</span></div>
        <div class="bk-sub"><span class="bk-unit">${esc(longUnit)}</span><span class="chip">워크북</span>
          <span class="num muted">p.124-132 · 24문항</span><span class="pill pilloff">내림</span>
          <span class="bk-ops"><button class="bk-op">🗑</button></span></div>
      </div></div></details>`).join("")}</div></div>
<details class="bk-fold" open><summary class="bk-foldhd"><span>🧩 루틴</span>
    <span class="num">기본루틴 78 · 영역 루틴 41 · 학생 루틴 0</span></summary>
  <div class="bk-foldbd stack">
    <p class="bk-why">⚠️ 🗑 는 <b>지우는 것이 아니라 「안 씀」으로 내리는 것</b>입니다. 되살릴 수 있습니다.</p>
    ${row("클카 문장훈련[입해석 · 낭독 · 녹음]")}${row("오답 스스로 고치기")}${row("단원평가 대비 복습")}
    <details class="bk-fold"><summary class="bk-foldhd">✎ 고치기</summary>
      <div class="bk-foldbd bk-form"><div class="bk-grid">
        <label><span class="lbl">이름</span><input class="fld" value="문답노트"></label>
        <label><span class="lbl">준비물</span><input class="fld"></label></div>
        <label><span class="lbl">하는 법</span><textarea class="fld" rows="2"></textarea></label>
        <div class="row"><button class="btn">저장</button></div></div></details>
  </div></details>
<details class="bk-fold" open><summary class="bk-foldhd"><span>📥 엑셀 왕복</span><span class="muted">내려받기 · 미리보기 · 저장</span></summary>
  <div class="bk-foldbd"><div class="bk-form">
    <div class="bk-grid"><label><span class="lbl">표</span><select class="fld"><option>단원표 — 주인 이관</option></select></label>
      <label><span class="lbl">파일 (.xlsx)</span><input class="fld" type="file"></label></div>
    <div class="row"><a class="btn btnghost" href="#">내려받기</a><button class="btn">미리보기</button>
      <button class="btn btnghost">대조만</button><button class="btn btnmain">이대로 저장</button></div>
    <div class="bk-pre">■ 미리보기 — 단원표 (units) · 주인: 이관
   새로 생김      12줄
   바뀜           3줄
   손 안 댐       188줄
   보류           0줄
   파일에 없는 기존 줄 0개 — 손대지 않음 (엑셀에서 줄을 지워도 앱에서는 안 지워진다)
   빈 칸이라 손 안 댄 칸 0개 — 값을 지우려면 「(비움)」이라고 적는다</div>
  </div></div></details>
<details class="bk-fold"><summary class="bk-foldhd"><span>이 화면이 서버에 물은 횟수</span>
  <span class="pill pillok">13번 / 상한 14</span></summary>
  <div class="bk-foldbd"><ul><li><code class="mono">books:list</code></li></ul></div></details>
</div></main></body></html>`;

  const dir = mkdtempSync(join(tmpdir(), "chk-books-"));
  const page = join(dir, "books.html");
  writeFileSync(page, html);
  say(`본보기 화면: file://${page}`);

  const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${dir}/u`, "about:blank"],
    { stdio: ["ignore", "ignore", "ignore"] });
  let port = null;
  for (const t0 = Date.now(); Date.now() - t0 < 20000;) {
    const f = join(dir, "u", "DevToolsActivePort");
    if (existsSync(f)) { const s = readFileSync(f, "utf8").split("\n"); if (s[0]?.trim()) { port = s[0].trim(); break; } }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) { fail++; console.log("   ❌ 크롬이 디버깅 포트를 안 열었다"); proc.kill(); }
  else {
    for (const w of WIDTHS) {
      const tgt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
      const ws = new WebSocket(tgt.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
      let id = 0; const waiting = new Map();
      ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
      const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
      await send("Page.enable"); await send("Runtime.enable");
      // ⚠️ `mobile:true` 를 쓰면 크롬이 레이아웃 폭을 내용에 맞춰 늘려 320px 검사가 통째로 죽는다
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await send("Emulation.setTouchEmulationEnabled", { enabled: w < 1400, maxTouchPoints: w < 1400 ? 5 : 0 });
      await send("Page.navigate", { url: "file://" + page });
      for (let i2 = 0; i2 < 60; i2++) {
        const r = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
        if (r.result?.result?.value === "complete") break;
        await new Promise((r2) => setTimeout(r2, 100));
      }
      await new Promise((r) => setTimeout(r, 120));

      const got = JSON.parse((await send("Runtime.evaluate", { expression: AUDIT, returnByValue: true })).result.result.value);
      ok(`${w}px — 화면이 0건`, got.length === 0);
      got.slice(0, 8).forEach((h) => console.log(`        [${h.k}] ${h.el} — ${h.why}`));

      const folds = JSON.parse((await send("Runtime.evaluate", { expression: FOLD_PROBE, returnByValue: true })).result.result.value);
      ok(`${w}px — 접기를 펴면 속이 **진짜 보인다** (안 보이면 오류 없이 그냥 없는 것이 된다)`,
         folds.length > 0 && folds.every((f) => f.display !== "none" && f.h > 0),
         folds.filter((f) => f.display === "none" || !f.h).map((f) => `${f.cls}:${f.display}`).join(" "));

      const tbl = JSON.parse((await send("Runtime.evaluate", { expression: TABLE_PROBE, returnByValue: true })).result.result.value);
      if (w <= 700)
        ok(`${w}px — 폰에서는 표 머리를 **안 붙인다** (붙이면 표 밖으로 튀어나와 다른 카드를 덮는다 — ㉜ 1)`,
           tbl.thPos === "static");
      else
        ok(`${w}px — 표 머리가 **붙는다** (상자가 세로로도 굴러야 붙는다)`,
           tbl.thPos === "sticky" && /(auto|scroll)/.test(tbl.overflowY));
      ok(`${w}px — 표가 `.trim() + ` \`min-width: max-content\` 라 칸이 안 짜부라진다`,
         tbl.minW === "max-content" || /px$/.test(tbl.minW));

      const fs = JSON.parse((await send("Runtime.evaluate", {
        expression: `JSON.stringify([...document.querySelectorAll("input,textarea,select")].map(e=>parseFloat(getComputedStyle(e).fontSize)))`,
        returnByValue: true })).result.result.value);
      if (w < 1400) ok(`${w}px — 입력칸 글씨가 16px 이상 (손가락 기계는 그 밑이면 강제 확대한다)`,
                       fs.every((v) => v >= 16), fs.join(" "));

      const taps = JSON.parse((await send("Runtime.evaluate", {
        expression: `JSON.stringify([...document.querySelectorAll(".bk-op")].map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];}))`,
        returnByValue: true })).result.result.value);
      if (w < 1400) ok(`${w}px — ▲▼🗑 가 손가락으로 눌리는 크기다 (44px)`,
                       taps.length > 0 && taps.every(([bw, bh]) => bw >= 44 && bh >= 44), JSON.stringify(taps.slice(0, 4)));

      try { ws.close(); } catch { /* 이미 닫힘 */ }
      await fetch(`http://127.0.0.1:${port}/json/close/${tgt.id}`).catch(() => {});
    }
    proc.kill();
  }
}

console.log(`\n■ 교재 화면 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
