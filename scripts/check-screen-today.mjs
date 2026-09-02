/**
 * 오늘 화면 검사 — `app/today` 가 **지켜야 할 것**만 본다.
 *
 * 무엇을 지키나 (하나하나 계획의 어느 줄인지 적는다)
 *   ①  화면이 `lib/` 을 **지난다**            판단은 lib 에 산다 (원칙 1 · 대전제)
 *   ②  화면이 **새 판단을 안 만든다**          진도·커서·통과 판정 SQL 이 화면에 없다
 *   ③  반 명단은 `v2.class_roster()` 로만      자동 검사 ⑮
 *   ④  **탭이 없다**                          §속도 1 (탭 전환 = 화면 전체 재조회)
 *   ⑤  `alert`/`confirm` · `position:fixed` · `pushState` · `createPortal` 이 없다
 *   ⑥  **서비스 열쇠를 화면에서 안 쓴다**       쓰면 접근 규칙을 통째로 지나간다
 *   ⑦  **역할을 스스로 본다**                  문지기가 역할로 화면을 안 지킨다(middleware 주석 실측)
 *   ⑧  학부모 값에 **원장 메모가 키째로 없다**   `lib/close.js` 를 실제로 돌려 확인 (사고 #7)
 *   ⑨  `day_item.memo` 는 **안 가린다**        그것은 아이 화면에 붙는 값이다 (⑨-a 4번)
 *   ⑩  **조회 수를 센다**                      §속도 — `/today` 는 조회 20 · 4단
 *   ⑪  SQL 이 **진짜 스키마**를 지난다          죽은 칸을 글자로 훑어서는 못 잡는다
 *   ⑫  `today.css` 가 배색 규칙을 안 어긴다     오류 94·100·106·107 · ㉑ · ㉜
 *   ⑬  클래스 **대장이 양쪽으로 맞는다**        정의만 있고 안 쓰거나, 쓰는데 정의가 없으면 실패
 *   ⑭  320·390·768·1400 에서 **진짜로 그려** 잰다
 *
 * ⚠️ 그리고 **일부러 어기는 본보기**를 같이 넣어 검사가 그것을 잡는지까지 본다(2부).
 *    못 잡으면 이 검사가 실패한다 — 「초록인데 화면은 깨져 있음」이 제일 나쁘다.
 *
 * 돌리는 법:  node scripts/check-screen-today.mjs
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sheetForFamily, itemsForFamily, STAFF_ONLY } from "../lib/close.js";

const DIR = "app/today";
const CSS = `${DIR}/today.css`;
const WIDTHS = [320, 390, 768, 1400];
/** 계획 §속도 — `/today` 화면의 상한 */
const CAP = 20;

let fail = 0, n = 0;
const ok = (t, cond, why = "") => {
  n++;
  if (cond) console.log(`   ✅ ${t}`);
  else { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
};
const say = (t) => console.log(`   · ${t}`);

/* ══ 0. 파일 모으기 ══════════════════════════════════════════════════ */
if (!existsSync(DIR)) { console.log(`■ ${DIR} 가 없다`); process.exit(1); }
const files = readdirSync(DIR).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(DIR, f), "utf8")]));
/** ⚠️ 주석을 **먼저 지운다.** 안 지우면 「`alert` 안 쓴다」고 적어 둔 주석이 그대로 걸린다 */
const bare = Object.fromEntries(files.map((f) => [f,
  src[f].replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")]));
const allBare = Object.values(bare).join("\n");
const allSrc = Object.values(src).join("\n");

console.log("■ 오늘 화면 검사  (app/today)");
say(`파일 ${files.length}개 — ${files.join(" · ")}`);

/* ══ 1부 — 글자로 훑는다 ═════════════════════════════════════════════ */
console.log("\n■ 1부 — 화면이 규칙을 지키는가");

// ① 화면이 lib 을 지난다
const MUST_CALL = [
  ["routineNext",      "②③ 을 차려 주는 한 벌 (lib/routine.js)"],
  ["attendanceWrite",  "출결을 쓰는 단 한 벌 (lib/attend.js)"],
  ["closeGate",        "마감 조건·미리보기 (lib/close.js)"],
  ["closeSheet",       "마감 (lib/close.js)"],
  ["fromCheck",        "검사 → 진도 (lib/progress.js)"],
  ["testsToday",       "오늘 볼 단어시험 (lib/word.js)"],
  ["failedToday",      "미통과 → 늦귀가 사유 (lib/word.js)"],
  ["lateReasonText",   "늦귀가 사유 한 줄 (lib/word.js)"],
  ["memoCovers",       "메모로 대신한 날 마감이 올릴 것 (lib/routine.js)"],
];
for (const [fn, why] of MUST_CALL) {
  ok(`화면이 \`${fn}\` 을 부른다 — ${why}`, new RegExp(`\\b${fn}\\b`).test(allBare));
}
ok("모든 판단이 `lib/` 에서 온다 (`../../lib/` 만 들여온다)",
   [...allBare.matchAll(/from\s+"([^"]+)"/g)]
     .map((m) => m[1])
     .filter((p) => p.startsWith("..") )
     .every((p) => p.startsWith("../../lib/")),
   "화면 밖에서 lib 아닌 것을 들여온다");

// ② 화면이 새 판단을 안 만든다
const FORBID_SQL = [
  [/insert\s+into\s+v2\.progress\b/i, "진도를 화면이 직접 쓴다 — lib/progress.js 만 쓴다"],
  [/update\s+v2\.progress\b/i,        "진도를 화면이 직접 고친다"],
  [/from\s+v2\.cursor_of/i,           "커서를 화면이 직접 묻는다 — lib/routine.js 가 부른다"],
  [/quiz_passed|quiz_correct/i,       "통과 판정을 화면이 스스로 부른다 — lib/word.js 가 부른다"],
  [/from\s+v2\.class_member\b/i,      "반 명단을 직접 조회한다 (자동 검사 ⑮) — v2.class_roster() 를 지나야 한다"],
  [/insert\s+into\s+v2\.day_sheet\b/i,"판을 화면이 직접 세운다 — attendanceWrite 한 벌만 쓴다"],
  // ⚠️ 원장 전용 메모 칸은 `lib/close.js` 밖 어디에도 이름이 못 나온다 (`scripts/check-close.mjs`).
  //    한 번 어겼다가 그 검사가 빨개졌다 — 여기서도 막아 두어 다시 안 새게 한다 (사고 #7)
  [/staff_note/,                      "원장 전용 메모 칸 이름이 화면에 있다 — lib/close.js 한 곳뿐이다 (사고 #7)"],
];
for (const [re, why] of FORBID_SQL) ok(`화면에 없어야 할 것: ${why}`, !re.test(allBare));

// ③ 반 명단
ok("반 명단은 `v2.class_roster()` 를 지난다 (자동 검사 ⑮)", /v2\.class_roster\(/.test(allBare));

// ④ 탭이 없다
ok("탭이 없다 (§속도 1 — 탭 전환은 화면 전체 재조회다)",
   !/role\s*=\s*["']tab["']|[?&]tab=|<Tabs|useTab\b/.test(allBare));

// ⑤ 안 쓰기로 한 것들
const FORBID = [
  [/(^|[^.\w])alert\s*\(/,        "alert("],
  [/(^|[^.\w])confirm\s*\(/,      "confirm("],
  [/position\s*:\s*["']?fixed/,   "position:fixed"],
  [/history\.pushState/,          "history.pushState"],
  [/createPortal/,                "createPortal"],
];
for (const [re, name] of FORBID) ok(`\`${name}\` 을 안 쓴다`, !re.test(allBare));
ok("`today.css` 에도 `position:fixed` 가 없다 (닫는 길은 언제나 화면 안에 있다 — 대전제 10)",
   !/position\s*:\s*fixed/.test(readFileSync(CSS, "utf8")));

// ⑥ 서비스 열쇠
ok("서비스 열쇠를 화면에서 안 쓴다 (`SUPABASE_SERVICE_ROLE_KEY` · `serviceDb`)",
   !/SUPABASE_SERVICE_ROLE_KEY|serviceDb/.test(allBare));

// ⑦ 역할을 스스로 본다
ok("화면이 역할을 **스스로** 본다 (문지기는 역할로 안 지킨다)",
   /staffOnly\(\)/.test(bare["page.js"] ?? "") && /staffOnly\(\)/.test(bare["actions.js"] ?? ""));
ok("서버 동작이 전부 한 문(`run`)을 지나 역할·문열기를 거친다",
   (bare["actions.js"] ?? "").split("export async function").slice(1)
     .every((b) => /return\s+run\(/.test(b)));

// ⑧⑨ 마감 가리기 — **실제로 돌려서** 본다
{
  const sheet = { id: "s1", student_id: "a", date: "2026-09-02", attend: "present",
                  closed_at: null, comment: "부모님께", staff_note: "원장만 볼 것" };
  const before = sheetForFamily(sheet, { role: "parent" });
  ok("마감 전 학부모 값에 `comment` 가 **키째로** 없다",
     !("comment" in before) && !("staff_note" in before));
  ok("마감 전 학부모에게 줄이 0개다", itemsForFamily([{ id: "i1" }], sheet, { role: "parent" }).length === 0);
  const after = sheetForFamily({ ...sheet, closed_at: "2026-09-02T12:00:00Z" }, { role: "parent" });
  ok("마감 뒤에도 `staff_note` 는 **키째로** 없다", !("staff_note" in after) && "comment" in after);
  ok("`day_item.memo` 는 원장 전용이 **아니다** (아이 화면에 그대로 붙는다 — ⑨-a 4번)",
     !(STAFF_ONLY.day_item ?? []).includes("memo"));
  ok("화면이 원장 메모를 학부모 쪽으로 내려보내는 자리가 없다 (원장 화면이라 읽기만 한다)",
     !/role\s*:\s*["'](parent|student)["']/.test(allBare));
}

/* ══ 2부 — `today.css` 를 훑는다 ════════════════════════════════════ */
console.log("\n■ 2부 — today.css 가 배색·레이아웃 규칙을 지키는가");

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** 중괄호를 세어 규칙을 뜯는다 (`@media` 안으로 들어간다) */
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

/** ⚠️ 이 감사자는 **본보기로도 돌려 본다**(3부). 못 잡으면 검사가 실패한다 */
function auditCss(raw) {
  const bad = [];
  const add = (code, why) => bad.push({ code, why });
  const rules = parseRules(stripComments(raw)).map((r) => ({ ...r, d: decls(r.body) }));

  for (const r of rules) for (const d of r.d) {
    // C1 새 색을 만들지 않는다 — 토큰만 쓴다
    if (/(^|-)(color|background|background-color|border-color|box-shadow|outline-color)$/.test(d.prop)
        && /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(d.val))
      add("C1", `${r.sel} { ${d.prop}: ${d.val} } — 새 색을 만들었다. \`var(--…)\` 토큰을 써라`);
    // C2 새 글씨 크기를 만들지 않는다
    if (d.prop === "font-size" && !/var\(--fs\d+\)/.test(d.val))
      add("C2", `${r.sel} { font-size: ${d.val} } — 크기는 \`var(--fsN)\` 열 종뿐이다 (오류 106)`);
    // C3 투명도로 흐리게 하지 않는다 (계획 ㉑)
    if (d.prop === "opacity" && d.val.trim() !== "1")
      add("C3", `${r.sel} { opacity: ${d.val} } — 「덜 중요함」은 색으로 말한다`);
    // C4 늘어나는 칸에는 basis 를 준다 (오류 94)
    if (d.prop === "flex" && /^\s*1\s*$/.test(d.val))
      add("C4", `${r.sel} { flex: 1 } — basis 가 없다. 390px 에서 26px 로 눌린다`);
    if (d.prop === "flex" && /^\s*\d+\s+\d+\s+0(px|%)?\s*$/.test(d.val))
      add("C4", `${r.sel} { flex: ${d.val} } — basis 가 0 이다 (오류 94)`);
    // C5 grid 의 맨 `1fr` 은 내용보다 안 작아진다 (㉜)
    if (/^grid(-template(-columns|-rows)?)?$/.test(d.prop) && /\b1fr\b/.test(d.val) && !/minmax\(/.test(d.val))
      add("C5", `${r.sel} { ${d.prop}: ${d.val} } — 맨 \`1fr\` 이다. \`minmax(0,1fr)\` 이라야 한다`);
    // C6 한글에 고정폭 글꼴 (오류 107)
    if (d.prop === "font-family" && /mono|menlo|consolas|courier/i.test(d.val) && !/\.mono\b|\.td-mono\b/.test(r.sel))
      add("C6", `${r.sel} — 한글이 드는 자리에 고정폭 글꼴을 걸었다`);
  }

  // C7 한 낱말 상태 클래스 (오류 49·92 — **세 번** 터졌다)
  for (const r of rules)
    for (const m of r.sel.matchAll(/\.([A-Za-z][A-Za-z0-9-]*)/g)) {
      const c = m[1];
      if (/^(open|on|sel|off|active|done|new)$/.test(c))
        add("C7", `${r.sel} — 한 낱말 상태 클래스 \`.${c}\` 는 금지다. \`is-\` 를 붙여라`);
    }
  return { bad, rules };
}

{
  const raw = readFileSync(CSS, "utf8");
  const a = auditCss(raw);
  ok("today.css 가 규칙을 하나도 안 어긴다", a.bad.length === 0);
  a.bad.forEach((b) => console.log(`        [${b.code}] ${b.why}`));

  // ⑬ 대장이 양쪽으로 맞는가
  const defined = new Set();
  for (const r of a.rules) for (const m of r.sel.matchAll(/\.(td-[A-Za-z0-9-]+)/g)) defined.add(m[1]);
  const registry = new Set([...raw.matchAll(/@이름\s+\.(td-[A-Za-z0-9-]+)/g)].map((m) => m[1]));
  const used = new Set([...allSrc.matchAll(/\b(td-[A-Za-z0-9-]+)\b/g)].map((m) => m[1]));

  const noReg = [...defined].filter((c) => !registry.has(c));
  ok("today.css 의 모든 클래스가 **이름 대장**에 있다", noReg.length === 0, noReg.join(" "));
  const unused = [...defined].filter((c) => !used.has(c));
  ok("today.css 가 정의한 클래스를 화면이 **다 쓴다**", unused.length === 0,
     `안 쓰는 것: ${unused.join(" ")}`);
  const undef = [...used].filter((c) => !defined.has(c));
  ok("화면이 쓰는 `td-` 클래스가 today.css 에 **다 있다**", undef.length === 0,
     `정의 없는 것: ${undef.join(" ")}`);

  // 좁은 화면 규칙이 맨 끝인가 (오류 100)
  const lastMedia = [...raw.matchAll(/@media[^{]*\{/g)].pop();
  ok("폭 규칙이 파일 **맨 끝**에 있다 (뒤에 같은 특정도 규칙이 오면 밀린다 — 오류 100)",
     !!lastMedia && raw.slice(lastMedia.index).indexOf("@media") === 0
       && !/}\s*[.#a-zA-Z][^@]*\{/.test(raw.slice(raw.lastIndexOf("}"))));
}

/* ══ 3부 — 일부러 어기는 본보기를 검사가 잡는가 ══════════════════════ */
console.log("\n■ 3부 — 일부러 어긴 본보기를 검사가 **잡는가**");
{
  const 본보기 = `
  .td-bad1 { color: #ff0000; }
  .td-bad2 { font-size: 13.5px; }
  .td-bad3 { opacity: .45; }
  .td-bad4 { flex: 1; }
  .td-bad5 { display: grid; grid-template-columns: repeat(7, 1fr); }
  .td-bad6 { font-family: Menlo, monospace; }
  .open    { display: block; }`;
  const got = new Set(auditCss(본보기).bad.map((b) => b.code));
  const want = [["C1", "새 색"], ["C2", "0.5px 단 글씨 크기"], ["C3", "투명도로 흐리게"],
                ["C4", "basis 없는 flex:1"], ["C5", "맨 1fr grid"], ["C6", "한글에 고정폭"],
                ["C7", "한 낱말 상태 클래스"]];
  for (const [code, name] of want) ok(`본보기의 「${name}」을 잡았다`, got.has(code));
}

/* ══ 4부 — 진짜 DB · 진짜 조회 수 ═══════════════════════════════════ */
console.log("\n■ 4부 — 진짜 DB 로 (SQL 이 사는가 · 조회를 몇 번 하는가)");

const dbUrl = (() => {
  try { return readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? null; }
  catch { return null; }
})();

if (!dbUrl) {
  fail++;
  console.log("   ❌ `.env.local` 의 `DATABASE_URL` 이 없어 **진짜 스키마를 못 물어봤다** — 있는 척하지 않는다");
} else {
  const { Client } = await import("pg");
  const { SQL, loadRoster, loadOne } = await import("../app/today/read.js");
  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  let live = true;
  try { await c.connect(); } catch (e) { live = false; fail++; console.log(`   ❌ DB 에 못 붙었다 — ${e.message.split("\n")[0]}`); }

  if (live) {
    // ⑪ SQL 이 진짜 스키마를 지나는가 — 죽은 칸은 여기서 터진다
    let i = 0;
    for (const [name, sql] of Object.entries(SQL)) {
      try {
        await c.query(`prepare _t${i} as ${sql}`);
        await c.query(`deallocate _t${i}`);
        ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, true);
      } catch (e) { ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, false, e.message.split("\n")[0]); }
      i++;
    }

    // ⑦ 접근 규칙을 흉내 낸 채로 도는가 — 화면이 여는 문과 **같은 방법**
    const pid = (await c.query("select id from v2.profiles where role='principal' order by name limit 1")).rows[0]?.id;
    ok("원장 계정이 있다 (없으면 이 화면을 열 사람이 없다)", !!pid);
    if (pid) {
      await c.query(`select set_config('request.jwt.claims', '{"sub":"${pid}","role":"authenticated"}', false);`
                  + ` set role authenticated;`);
      ok("`set role authenticated` 로 갈아탔다 (화면이 접근 규칙 밖으로 안 나간다)",
         (await c.query("select current_user u")).rows[0].u === "authenticated");

      // ⚠️ **화면 것과 lib 것을 갈라 센다.** 안 가르면 「화면이 몇 번 묻나」를 못 잡는다 —
      //    화면이 조회를 하나 더 늘려도 lib 이 스무 번 묻는 틈에 묻혀 아무도 못 알아챈다.
      //    가르는 표는 SQL 앞머리의 `/* today:… */` 토막주석이다 (read.js·actions.js 가 붙인다).
      let q = 0, mine = 0;
      const db = { query: (s, p) => {
        const t = String(s);
        if (!/^\s*(begin|commit|rollback)\b/i.test(t)) { q++; if (/\/\*\s*today:/.test(t)) mine++; }
        return c.query(s, p);
      } };

      const roster = await loadRoster(db, null);
      ok("명단만 볼 때 조회가 **하나**다", q === 1 && mine === 1, `모두 ${q}번 · 화면 것 ${mine}번`);
      q = 0; mine = 0;
      say(`오늘(${roster.on}) 수업 ${roster.people.length}명`);

      // ⚠️ 못 쓰는 표를 화면이 **알고 있는가** — 규칙은 열려 있고 권한이 없는 자리
      const blocked = Object.entries(roster.canWrite ?? {}).filter(([, v]) => !v.ins && !v.upd).map(([t]) => t);
      ok("「쓸 수 있나」를 화면이 **DB 에 물어서** 안다 (글자로 박아 두지 않는다)",
         Object.keys(roster.canWrite ?? {}).length > 0);
      if (blocked.length) say(`⚠️ 지금 못 쓰는 표: ${blocked.join(" · ")} (권한이 SELECT 뿐이다)`);

      // ⑩ 한 아이를 열었을 때 조회 수 — **감추지 않고 센다**
      const 많은아이 = (await c.query(
        `select sb.student_id id, count(*)::int n from v2.student_book sb
          where sb.from_date <= v2.today() and (sb.to_date is null or sb.to_date >= v2.today())
          group by 1 order by 2 desc limit 1`)).rows[0];
      if (많은아이) {
        q = 0; mine = 0;
        const t0 = Date.now();
        const d = await loadOne(db, { studentId: 많은아이.id, on: roster.on });
        const ms = Date.now() - t0;
        say(`교재 ${많은아이.n}권짜리 아이 하나 — 조회 ${q}번 · ${ms}ms`);
        ok("한 아이를 열 때 **화면이 스스로 쓰는** 조회는 하나뿐이다 (나머지는 lib 이 쓴다)",
           mine === 1, `${mine}번`);
        // ⚠️ 넘으면 **실패로 세우지 않고 밝힌다** — 줄이는 자리가 화면이 아니라 lib/DB 이기 때문이다.
        //    다만 화면이 그 숫자를 **감추면** 실패다.
        if (q > CAP) {
          say(`⚠️ 조회 ${q}번으로 상한 ${CAP}을 넘는다 — ${(d.plan.books ?? []).length}권을 교재마다 따로 묻는다`);
          ok("상한을 넘으면 화면이 그 사실을 **띄운다**",
             /QUERY_CAP|상한/.test(src["page.js"] ?? ""));
        } else ok(`한 아이를 열 때 조회가 상한(${CAP}) 안이다`, true, `${q}번`);
        ok("②③ 이 **차려져서** 온다 (손으로 채우는 자리가 아니다)",
           Array.isArray(d.plan.books), "routineNext 가 판을 안 돌려줬다");
        ok("항목마다 **단원이 붙어** 온다 (⑨-a 2번)",
           (d.plan.books ?? []).flatMap((b) => [...b.class, ...b.home, ...b.next])
             .every((r) => r.byMemo || (r.label ?? "") !== ""),
           "단원 없는 항목이 있다");
      }
    }
    await c.end();
  }
}

/* ══ 5부 — 진짜 브라우저로 그려 잰다 ════════════════════════════════ */
console.log("\n■ 5부 — 320·390·768·1400 에서 **진짜로 그려** 잰다");

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => existsSync(p)) || null;

/** 화면 검사 여섯 — `scripts/check-layout.mjs` 와 같은 잣대다 */
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
    if ((e.tagName === "BUTTON" || e.classList.contains("btn") || e.classList.contains("td-mark"))
        && r.height > 58 && r.width < 120 && r.width > 0)
      put(6, e, Math.round(r.width) + "×" + Math.round(r.height) + " — 단추가 세로로 늘어났다");
    if (Number(s.opacity) < 1 && !e.classList.contains("is-drag"))
      put(8, e, "opacity " + s.opacity + " — 「덜 중요함」은 색으로 말한다");
  }
  const byP = new Map();
  for (const e of els) {
    const s = S(e), r = e.getBoundingClientRect();
    if (s.display === "none" || s.display === "inline" || s.display === "contents" || s.visibility === "hidden") continue;
    if (s.position === "absolute" || s.position === "fixed" || s.position === "sticky") continue;
    if (r.width < 2 || r.height < 2 || !e.parentElement) continue;
    if (!byP.has(e.parentElement)) byP.set(e.parentElement, []);
    byP.get(e.parentElement).push([e, r]);
  }
  for (const [, l] of byP) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
    const [ea, ra] = l[i], [eb, rb] = l[j];
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 2 && h > 2) hit.push({ k: 2, el: nm(ea) + " ↔ " + nm(eb), why: "형제끼리 겹친다" });
  }
  return JSON.stringify(hit);
})()`;

/** 짝이 진짜로 좌우로 서나 · 폰에서 위아래로 접히나 (㉝) */
const PAIR_PROBE = `(() => {
  const p = document.querySelector(".td-pair");
  const s = getComputedStyle(p);
  const kids = [...p.children].map((e) => Math.round(e.getBoundingClientRect().top));
  return JSON.stringify({ cols: s.gridTemplateColumns.split(" ").length, sameRow: kids[0] === kids[1] });
})()`;

/**
 * **펴면 진짜 보이나** — ⚠️ 실제로 한 번 당한 자리다.
 * globals 의 `.accbd` 를 빌려 쓰면 `display:none` 이 기본이라 `<details open>` 이어도 안 보이는데,
 * 화면 검사는 「안 보이는 것」은 잴 것이 없어 **0건으로 지나간다.** 그래서 따로 잰다.
 */
const FOLD_PROBE = `(() => {
  const out = [];
  for (const d of document.querySelectorAll("details.td-fold")) {
    d.open = true;
    for (const bd of d.children) {
      if (bd.tagName === "SUMMARY") continue;
      const s = getComputedStyle(bd), r = bd.getBoundingClientRect();
      out.push({ cls: bd.className, display: s.display, h: Math.round(r.height) });
    }
  }
  return JSON.stringify(out);
})()`;

if (!CHROME) {
  fail++;
  console.log("   ❌ 브라우저가 없어 **화면을 실제로 그려 보지 못했다** — 있는 척하지 않는다");
} else {
  // ⚠️ 「Lorem ipsum」으로는 안 깨진다. **진짜 단원 이름**으로 깨진다
  let longUnit = "CHAPTER 06 심경 변화 및 장문 › 유형 16 심경 변화 파악 · 유형 17 장문 독해";
  let longBook = "일관성 있는 기준 영문법";
  if (dbUrl) {
    try {
      const { Client } = await import("pg");
      const c2 = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
      await c2.connect();
      longUnit = (await c2.query("select v2.unit_label(id) t from v2.units order by length(v2.unit_label(id)) desc limit 1")).rows[0]?.t ?? longUnit;
      longBook = (await c2.query("select name t from v2.books order by length(name) desc limit 1")).rows[0]?.t ?? longBook;
      await c2.end();
    } catch { /* 위 4부가 이미 실패로 세웠다 */ }
  }

  const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
  const marks = ["○", "△", "✕", "학원", "—"].map((g) => `<button class="td-mark">${g}</button>`).join("");
  const item = (nm2) => `<div class="td-item"><b>${esc(nm2)}</b><span class="chip">${esc(longBook)}</span>
      <span class="td-unit">${esc(longUnit)}</span><span class="num">p.124~132</span></div>`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>오늘 본보기</title>
<style>${readFileSync("app/globals.css", "utf8")}</style><style>${readFileSync(CSS, "utf8")}</style>
</head><body><main class="wrap"><div class="stack">
<div class="td-head"><h1>오늘</h1><span class="num">2026-09-02</span>
  <span class="pill pillwarn">지난 날짜 판입니다 — 참고용입니다</span></div>
<div class="card"><div class="cardhd">오늘 수업 <span class="num">10명</span></div>
  <div class="td-roster">${Array.from({ length: 10 }, (_, i) =>
    `<a class="td-who${i === 2 ? " is-sel" : ""}" href="#"><span>학생${i}</span>
      <span class="muted num">17:00 · 검사 3/7</span><span class="pill pillok">마감함</span></a>`).join("")}</div></div>
<div class="td-pair">
  <div class="card"><div class="cardhd">🔤 단어시험</div><p class="td-kv"><span class="chip">오늘 본 것</span>
    <span class="grow">단어 · ${esc(longBook)}</span><span class="num">28/30 · 93%</span>
    <span class="pill pillok">통과</span></p><p class="td-note">점수 줄이 없습니다 — 개수를 안 적었습니다.</p></div>
  <div class="card"><div class="cardhd">🃏 클래스카드 플래너</div>
    <div class="td-kv"><span class="grow">${esc(longUnit)}</span><span class="chip">문장</span>
      <span class="num">30장</span><span class="num">mem 82/90 · recall 71/90</span></div></div>
</div>
<div class="card"><div class="cardhd">① 숙제 검사</div>
  ${["숙제채점", "오답 고치기 (스스로)", "클카 문장훈련"].map((x) =>
    `<div class="td-item"><b>${x}</b><span class="td-unit">${esc(longUnit)}</span>
      <div class="td-marks">${marks}</div></div>`).join("")}</div>
<div class="card"><div class="cardhd">② 오늘 학습 · ③ 오늘 숙제</div>
  <p class="td-kv"><span class="chip">합계</span><span class="num">15쪽</span><span class="num">12문항</span></p>
  <div class="td-book"><div class="td-bookhd"><b>${esc(longBook)}</b><span class="chip">문법</span>
    <span class="num">1회독</span><span class="td-unit">${esc(longUnit)}</span>
    <span class="pill pillwarn">숙제멈춤 — 수업만 합니다</span></div>
    <p class="td-note">이 교재는 다음 단원이 없어 예습이 안 나갑니다.</p>
    <div class="td-side">
      <div class="td-slot"><p class="lbl">② 오늘 학습 (학원)</p>${item("클카 문장훈련")}${item("문제풀기")}</div>
      <div class="td-slot"><p class="lbl">③ 오늘 숙제 (집)</p>${item("문답노트")}${item("교재예습 · 예습")}</div>
    </div>
    <details class="td-fold" open><summary class="td-foldhd">조절 — 갯수 · 분량 · 뺄 항목 · 메모</summary>
      <div class="td-foldbd"><form><div class="row">
        <div class="grow"><label class="lbl">갯수</label><input type="number" value="2"></div>
        <div class="grow"><label class="lbl">분량 (쪽)</label><input type="number"></div></div>
        <div class="row"><div class="grow"><label class="lbl">학습 메모</label><input value=""></div>
        <div class="grow"><label class="lbl">숙제 메모</label><input value=""></div></div>
        <label class="td-kv"><input type="checkbox"><span class="grow">오답 고치기 (답 보고)</span>
          <span class="chip">학원+집</span></label>
        <div class="mdlf"><button class="btn btnmain">이대로 보기</button></div></form></div></details>
  </div></div>
<div class="td-pair">
  <div class="card"><div class="cardhd">📝 단원평가</div>
    <div class="td-kv"><span class="grow">간접의문문</span><span class="chip">made</span><span class="num">21/25</span></div></div>
  <div class="card"><div class="cardhd">🕘 늦귀가</div>
    <label class="lbl">남는 까닭</label><input class="fld" value="단어 82% 재시험">
    <div class="row"><div class="grow"><label class="lbl">예상 귀가</label><input class="fld" type="time"></div>
      <div class="grow"><label class="lbl">실제 하원</label><input class="fld" type="time"></div></div>
    <div class="row"><span class="muted">평소 하원 19:30 +</span>
      <button class="btn btnghost">20분</button><button class="btn btnghost">40분</button>
      <button class="btn btnghost">1시간</button></div>
    <p class="td-note">「보내기」 단추를 여기에 안 만들었습니다 — 발송은 lib/notify.js 한 곳을 지나야 합니다.</p></div>
</div>
<div class="td-pair">
  <div class="card"><div class="cardhd">📊 진도 · 영역 메모</div>
    <div class="td-kv"><span class="grow">${esc(longBook)}</span><span class="chip">문법</span>
      <span class="num">119/203</span><span class="pill pilloff">숙제멈춤</span></div>
    <p class="td-note">영역 메모를 담을 칸이 DB 에 없습니다.</p></div>
  <div class="card"><div class="cardhd">✉️ 부모님께 나갈 글</div>
    <label class="lbl">부모님께 나갈 글 — 마감하면 이 글이 그대로 보입니다</label>
    <textarea class="fld" rows="5"></textarea>
    <div class="row"><button class="btn btnmain">저장</button></div>
    <p class="td-note">원장님만 볼 메모 칸은 안 만들었습니다 — 그 칸을 읽는 길이 lib/close.js 한 곳으로 못 박혀 있습니다.</p></div>
</div>
<div class="card"><div class="cardhd">마감</div>
  <div class="mdl"><div class="cardhd">이대로 마감하면</div>
    <p class="td-kv"><b>${esc(longBook)}</b><span class="td-unit">${esc(longUnit)} 가 ○ 로 올라갑니다</span></p>
    <label class="td-kv"><input type="checkbox"><span class="pill pillbad">반드시</span>
      <span class="grow">늦귀가 1건을 아직 안 보냈습니다 — 안 보내고 마감하면 학부모는 모른 채 기다립니다</span></label>
    <div class="mdlf"><button class="btn btnghost">닫기</button><button class="btn btnmain">마감한다</button></div>
  </div></div>
<details class="td-fold"><summary class="td-foldhd"><span class="pill pillwarn">조회 25번 — 상한 20을 넘었습니다</span></summary>
  <div class="td-foldbd"><p class="mono">today:roster · today:one · v2.cursor_of</p></div></details>
</div></main></body></html>`;

  const dir = mkdtempSync(join(tmpdir(), "chk-today-"));
  const page = join(dir, "today.html");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(page, html);
  // 눈으로 보고 싶을 때 — 이 파일을 브라우저로 열면 지금 잰 그 화면이다
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

      const pair = JSON.parse((await send("Runtime.evaluate", { expression: PAIR_PROBE, returnByValue: true })).result.result.value);
      if (w <= 900) ok(`${w}px — 좌우 짝이 **위아래로** 접힌다 (㉝)`, pair.cols === 1 && !pair.sameRow);
      else ok(`${w}px — 좌우 짝이 **좌우로** 선다 (㉝)`, pair.cols === 2 && pair.sameRow);

      const fs = JSON.parse((await send("Runtime.evaluate", {
        expression: `JSON.stringify([...document.querySelectorAll("input,textarea,select")].map(e=>parseFloat(getComputedStyle(e).fontSize)))`,
        returnByValue: true })).result.result.value);
      if (w < 1400) ok(`${w}px — 입력칸 글씨가 16px 이상 (손가락 기계는 그 밑이면 강제 확대한다)`,
                       fs.every((v) => v >= 16), fs.join(" "));

      try { ws.close(); } catch { /* 이미 닫힘 */ }
      await fetch(`http://127.0.0.1:${port}/json/close/${tgt.id}`).catch(() => {});
    }
    proc.kill();
  }
}

console.log(`\n■ 오늘 화면 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
