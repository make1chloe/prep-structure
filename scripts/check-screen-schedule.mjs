/**
 * 일정 화면 검사 — `app/schedule` 이 **지켜야 할 것**만 본다.
 *
 * 무엇을 지키나 (하나하나 계획의 어느 줄인지 적는다)
 *   ①  화면이 `lib/` 을 **지난다**              판단은 lib 에 산다 (원칙 1)
 *   ②  화면이 **새 판단을 안 만든다**            8회 판정·회차 셈·통과 판정을 화면이 다시 짓지 않는다
 *   ③  반 명단은 `v2.class_roster()` 로만        자동 검사 ⑮ (이 저장소가 실제로 다친 자리)
 *   ④  **탭이 없다**                            §속도 1 (탭 전환 = 화면 전체 재조회)
 *   ⑤  `alert`/`confirm` · `position:fixed` · `pushState` · `createPortal` 이 없다
 *   ⑥  **서비스 열쇠를 화면에서 안 쓴다**         쓰면 접근 규칙을 통째로 지나간다
 *   ⑦  **역할을 스스로 본다**                    문지기가 역할로 화면을 안 지킨다
 *   ⑧  `staff_note` 와 발송 스위치가 **없다**   lib/close.js · lib/notify.js 밖에서 읽으면 안 된다
 *   ⑨  **보강 시각을 앱이 제안하지 않는다**       오류 82 (원장님: 「내가 고칠 수가 없잖아」)
 *   ⑩  **달력이 정상 수업을 안 띄운다**           오류 85 — 그리고 **사유별로 묶는다**(오류 86)
 *   ⑪  **전국 시험에 학교를 안 붙인다**           ㊲
 *   ⑫  SQL 이 **진짜 스키마**를 지난다            죽은 칸을 글자로 훑어서는 못 잡는다
 *   ⑬  **조회 수를 센다**                        §속도 표 — `/schedule` 은 조회 8 · 2단
 *   ⑭  `schedule.css` 가 배색 규칙을 안 어긴다    오류 94·100·106·107 · ㉑ · ㉜
 *   ⑮  클래스 **대장이 양쪽으로 맞는다**
 *   ⑯  320·390·768·1400 에서 **진짜로 그려** 잰다 — 달력 칸 **96px**(오류 87) ·
 *       아이콘 **15×15 고정**(오류 78) · 접기를 펴면 진짜 보이나
 *
 * ⚠️ 그리고 **일부러 어기는 본보기**를 같이 넣어 검사가 그것을 잡는지까지 본다(3부).
 *    못 잡으면 이 검사가 실패한다 — 「초록인데 화면은 깨져 있음」이 제일 나쁘다.
 *
 * 돌리는 법:  node scripts/check-screen-schedule.mjs
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = "app/schedule";
const CSS = `${DIR}/schedule.css`;
const WIDTHS = [320, 390, 768, 1400];
/** 계획 §속도 표 — `/schedule` 화면의 상한 */
const CAP = 8;

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

console.log("■ 일정 화면 검사  (app/schedule)");
say(`파일 ${files.length}개 — ${files.join(" · ")}`);

/* ══ 1부 — 글자로 훑는다 ═════════════════════════════════════════════ */
console.log("\n■ 1부 — 화면이 규칙을 지키는가");

// ① 화면이 lib 을 지난다
const MUST_CALL = [
  ["monthBoard",       "반마다 「이 달 몇 회」 · 8회 판정 (lib/session.js)"],
  ["makeupTargets",    "못 채운 반의 **아이마다** 몇 회 모자란가 (lib/session.js)"],
  ["MIN_SESSIONS",     "8회는 모든 반 공통 — 화면이 8을 박아 두지 않는다 (lib/session.js)"],
  ["myTodos",          "「내 할 일」 한 판 — 바깥 축은 할 일 종류 (lib/todo.js)"],
  ["FILTERS",          "거르개 한 줄 — 전체·전국 시험·시험 없는 것 (lib/todo.js)"],
  ["attendanceWrite",  "출결을 쓰는 단 한 벌 (lib/attend.js) — 결석·지각 예정도 여기로"],
  ["attendanceClear",  "예정을 **무른다** — 지우지 않는다 (lib/attend.js)"],
  ["LATE_PRESETS",     "지각 「얼마나」 — 화면이 10·20·30·60 을 스스로 정하지 않는다 (lib/attend.js)"],
  ["DOW_NAME",         "요일 이름 한 벌 (lib/session.js)"],
];
for (const [fn, why] of MUST_CALL)
  ok(`화면이 \`${fn}\` 을 부른다 — ${why}`, new RegExp(`\\b${fn}\\b`).test(allBare));

ok("모든 판단이 `lib/` 에서 온다 (`../../lib/` 만 들여온다)",
   [...allBare.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])
     .filter((p) => p.startsWith("..")).every((p) => p.startsWith("../../lib/")),
   "화면 밖에서 lib 아닌 것을 들여온다 (남의 화면 폴더를 들여오면 그 화면이 바뀌는 날 같이 죽는다)");

// ② 화면이 새 판단을 안 만든다
const FORBID_SRC = [
  [/from\s+v2\.class_member\b/i,  "반 명단을 직접 조회한다 (자동 검사 ⑮) — `v2.class_roster()` 를 지나야 한다"],
  [/from\s+v2\.cursor_of/i,       "커서를 화면이 직접 묻는다 — 커서 차례를 화면이 다시 짜면 안 된다"],
  [/from\s+v2\.session_count/i,   "DB 의 `session_count` 를 부른다 — 그것은 오늘 상한이 없고 겹친 요일을 두 번 센다 (lib/session.js 주석)"],
  [/quiz_passed|quiz_correct/i,   "통과 판정을 화면이 스스로 부른다 — lib/word.js 의 몫이다"],
  [/insert\s+into\s+v2\.day_sheet\b/i, "판을 화면이 직접 세운다 — `attendanceWrite` 한 벌만 쓴다"],
  [/insert\s+into\s+v2\.progress\b/i,  "진도를 화면이 직접 쓴다 — lib/progress.js 만 쓴다"],
  // ⚠️ 이 저장소가 실제로 다친 자리 둘
  [/staff_note/,                  "원장 전용 메모 칸 이름이 화면에 있다 — `lib/close.js` 한 곳뿐이다"],
  // ⚠️ 낱말을 글자 그대로 적으면 `scripts/check-notify.mjs` 가 이 파일을 잡는다 — 두 조각으로 짓는다
  [new RegExp("NOTIFY" + "_SINK"), "발송 스위치를 화면이 읽는다 — `lib/notify.js` 한 곳뿐이다"],
];
for (const [re, why] of FORBID_SRC) ok(`화면에 없어야 할 것: ${why}`, !re.test(allBare));

// ⚠️ 8회를 화면이 다시 판정하면 규칙이 두 벌이 된다 (`app/_home/read.js` 가 그렇게 두 벌이 됐다)
ok("화면이 **8회 판정을 다시 짓지 않는다** (`>= 8` · `- 8` 같은 셈이 없다)",
   !/(>=|<=|<|>|-)\s*8\b(?!\s*회)/.test(allBare.replace(/--fs\d+|fs8|\bs8\b/g, "")),
   "화면 안에 8 로 재는 셈이 있다 — `MIN_SESSIONS` 를 부르고 판정은 lib 이 한다");
ok("화면이 **회차를 스스로 세지 않는다** (`countDates` 를 직접 안 부른다)",
   !/\bcountDates\b/.test(allBare),
   "`monthBoard()` 를 부르면 `short`·`enough` 까지 lib 이 낸다 — `countDates` 만 부르면 판정이 두 벌이 된다");

// ③ 반 명단
ok("반 명단은 `v2.class_roster()` 를 지난다 (자동 검사 ⑮)", /v2\.class_roster\(/.test(allBare));

// ④ 탭이 없다
ok("탭이 없다 (§속도 1 — 탭 전환은 화면 전체 재조회다)",
   !/role\s*=\s*["']tab["']|[?&]tab=|<Tabs|useTab\b/.test(allBare));

// ⑤ 안 쓰기로 한 것들
const FORBID = [
  [/(^|[^.\w])alert\s*\(/,      "alert("],
  [/(^|[^.\w])confirm\s*\(/,    "confirm("],
  [/position\s*:\s*["']?fixed/, "position:fixed"],
  [/history\.pushState/,        "history.pushState"],
  [/createPortal/,              "createPortal"],
  [/autoFocus/,                 "autoFocus (키보드가 튀어 올라 화면이 뛴다)"],
];
for (const [re, name] of FORBID) ok(`\`${name}\` 을 안 쓴다`, !re.test(allBare));
// ⚠️ CSS 도 **주석을 먼저 지우고** 본다. 안 지우면 「fixed 안 쓴다」고 적어 둔 대장 글이 그대로 걸린다
const cssBare = readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
ok("`schedule.css` 에도 `position:fixed` 가 없다 (닫는 길은 언제나 화면 안에 — 대전제 10)",
   !/position\s*:\s*fixed/.test(cssBare));
ok("고른 날 판에 **닫는 길이 화면 안에** 있다", /닫기/.test(src["ui.js"] ?? ""));

// ⑥ 서비스 열쇠
ok("서비스 열쇠를 화면에서 안 쓴다 (`SUPABASE_SERVICE_ROLE_KEY` · `serviceDb`)",
   !/SUPABASE_SERVICE_ROLE_KEY|serviceDb/.test(allBare));
ok("문을 열자마자 **그 사람으로 갈아탄다** (`set role authenticated`)",
   /set role authenticated/.test(allBare));

// ⑦ 역할을 스스로 본다
ok("역할을 **스스로** 본다 (`staffOnly`) — 문지기는 첫 화면만 고른다",
   /staffOnly\s*\(/.test(bare["page.js"] ?? "") && /principal/.test(allBare));

// ⑧ 지각 「얼마나」 · 보강 시각
ok("**지각에는 「얼마나」가 있다** (㉔ · 오류 76) — 분 단추와 도착 시각 둘 다 있다",
   /LATE_PRESETS/.test(bare["ui.js"] ?? "") && /type="time"/.test(bare["ui.js"] ?? ""));
// ⑨ ⚠️⚠️ 오류 82 — **앱이 시각·날짜를 제안하면 원장님이 고칠 수가 없다.**
//    원장님: 「니가 시간이랑 일정을 잡으면 내가 고칠 수가 없잖아.」
//    그래서 화면 어디에도 **시각·날짜 글자가 기본값으로 박혀 있으면 안 된다.**
//    ⚠️ 「MakeupForm 의 그 한 줄」만 보면 안 된다 — 같은 모양의 줄이 다른 폼에도 있어
//       한쪽만 고쳐 놓아도 검사가 통과한다(실제로 그렇게 한 번 새어 나갔다).
{
  const uiBare = bare["ui.js"] ?? "";
  const bad = [
    ...[...uiBare.matchAll(/useState\(\s*["'](\d{1,2}:\d{2})["']\s*\)/g)].map((mm) => `useState("${mm[1]}")`),
    ...[...uiBare.matchAll(/(defaultValue|value)\s*=\s*\{?\s*["'](\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2})["']/g)]
        .map((mm) => `${mm[1]}="${mm[2]}"`),
    ...[...uiBare.matchAll(/\|\|\s*["'](\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2})["']/g)].map((mm) => `|| "${mm[1]}"`),
  ];
  ok("**보강 시각·날짜를 앱이 제안하지 않는다** (오류 82) — 시각·날짜 글자가 기본값으로 박힌 자리가 0곳",
     bad.length === 0, bad.join(" · "));
}
ok("보강 저장에 **「그날 몇 명까지」 같은 조건이 없다** — 빈 자리 셈은 보여 주기만 한다",
   !/(가득|정원|too many|자리가 없)/.test(bare["actions.js"] ?? ""));

// ⑩ 달력 — 정상 수업은 안 띄운다
ok("달력이 띄우는 갈래에 **정상 수업이 없다** (오류 85)",
   !/key:\s*"(class|lesson|수업)"/.test(src["read.js"] ?? ""));

/* ══ 2부 — `schedule.css` 를 훑는다 ═════════════════════════════════ */
console.log("\n■ 2부 — schedule.css 가 배색·레이아웃 규칙을 지키는가");

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
    // C2 새 글씨 크기를 만들지 않는다 (오류 106)
    if (d.prop === "font-size" && !/var\(--fs\d+\)/.test(d.val))
      add("C2", `${r.sel} { font-size: ${d.val} } — 크기는 \`var(--fsN)\` 열 종뿐이다`);
    // C3 투명도로 흐리게 하지 않는다 (계획 ㉑)
    if (d.prop === "opacity" && d.val.trim() !== "1")
      add("C3", `${r.sel} { opacity: ${d.val} } — 「덜 중요함」은 색으로 말한다`);
    // C4 늘어나는 칸에는 basis 를 준다 (오류 94)
    if (d.prop === "flex" && /^\s*1\s*$/.test(d.val))
      add("C4", `${r.sel} { flex: 1 } — basis 가 없다. 390px 에서 26px 로 눌린다`);
    if (d.prop === "flex" && /^\s*\d+\s+\d+\s+0(px|%)?\s*$/.test(d.val))
      add("C4", `${r.sel} { flex: ${d.val} } — basis 가 0 이다`);
    // C5 grid 의 맨 `1fr` 은 내용보다 안 작아진다 (㉜)
    if (/^grid(-template(-columns|-rows)?)?$/.test(d.prop) && /\b1fr\b/.test(d.val) && !/minmax\(/.test(d.val))
      add("C5", `${r.sel} { ${d.prop}: ${d.val} } — 맨 \`1fr\` 이다. \`minmax(0,1fr)\` 이라야 한다`);
    // C6 한글에 고정폭 글꼴 (오류 107)
    if (d.prop === "font-family" && /mono|menlo|consolas|courier/i.test(d.val) && !/\.mono\b/.test(r.sel))
      add("C6", `${r.sel} — 한글이 드는 자리에 고정폭 글꼴을 걸었다`);
    // C8 ⚠️ 오류 87 — 달력 칸이 작아 잘렸다. 96px 아래로 내리지 못한다
    if (/\.sc-(cell|out)\b/.test(r.sel) && d.prop === "min-height") {
      const px = parseFloat(d.val);
      if (!(px >= 96)) add("C8", `${r.sel} { min-height: ${d.val} } — 달력 칸은 96px 이상이라야 한다 (오류 87)`);
    }
    // C9 ⚠️ 오류 78 — 아이콘은 15×15 **고정**이다 (점은 길이가 제각각이었다)
    if (/\.sc-icon\b/.test(r.sel) && (d.prop === "width" || d.prop === "height") && d.val.trim() !== "15px")
      add("C9", `${r.sel} { ${d.prop}: ${d.val} } — 아이콘은 15×15 고정이다 (오류 78)`);
  }

  // C7 한 낱말 상태 클래스 (오류 49·92 — **세 번** 터졌다)
  for (const r of rules)
    for (const mm of r.sel.matchAll(/\.([A-Za-z][A-Za-z0-9-]*)/g))
      if (/^(open|on|sel|off|active|done|new)$/.test(mm[1]))
        add("C7", `${r.sel} — 한 낱말 상태 클래스 \`.${mm[1]}\` 는 금지다. \`is-\` 를 붙여라`);
  return { bad, rules };
}

{
  const raw = readFileSync(CSS, "utf8");
  const a = auditCss(raw);
  ok("schedule.css 가 규칙을 하나도 안 어긴다", a.bad.length === 0);
  a.bad.forEach((b) => console.log(`        [${b.code}] ${b.why}`));

  // ⑮ 대장이 양쪽으로 맞는가
  const defined = new Set();
  for (const r of a.rules) for (const mm of r.sel.matchAll(/\.(sc-[A-Za-z0-9-]+)/g)) defined.add(mm[1]);
  const registry = new Set([...raw.matchAll(/@이름\s+\.(sc-[A-Za-z0-9-]+)/g)].map((mm) => mm[1]));
  const used = new Set([...allSrc.matchAll(/\b(sc-[A-Za-z0-9-]+)\b/g)].map((mm) => mm[1]));

  const noReg = [...defined].filter((c) => !registry.has(c));
  ok("schedule.css 의 모든 클래스가 **이름 대장**에 있다", noReg.length === 0, noReg.join(" "));
  const unused = [...defined].filter((c) => !used.has(c));
  ok("schedule.css 가 정의한 클래스를 화면이 **다 쓴다**", unused.length === 0, `안 쓰는 것: ${unused.join(" ")}`);
  const undef = [...used].filter((c) => !defined.has(c));
  ok("화면이 쓰는 `sc-` 클래스가 schedule.css 에 **다 있다**", undef.length === 0, `정의 없는 것: ${undef.join(" ")}`);

  // 폭 규칙이 맨 끝인가 (오류 100)
  const lastMedia = [...raw.matchAll(/@media[^{]*\{/g)].pop();
  ok("폭 규칙이 파일 **맨 끝**에 있다 (뒤에 같은 특정도 규칙이 오면 밀린다 — 오류 100)",
     !!lastMedia && raw.slice(lastMedia.index).indexOf("@media") === 0);
}

/* ══ 3부 — 일부러 어긴 본보기를 검사가 **잡는가** ═══════════════════ */
console.log("\n■ 3부 — 일부러 어긴 본보기를 검사가 **잡는가**");
{
  const 본보기 = `
  .sc-bad1 { color: #ff0000; }
  .sc-bad2 { font-size: 13.5px; }
  .sc-bad3 { opacity: .45; }
  .sc-bad4 { flex: 1; }
  .sc-bad5 { display: grid; grid-template-columns: repeat(7, 1fr); }
  .sc-bad6 { font-family: Menlo, monospace; }
  .sc-cell { min-height: 76px; }
  .sc-icon { width: 12px; height: 12px; }
  .open    { display: block; }`;
  const got = new Set(auditCss(본보기).bad.map((b) => b.code));
  const want = [["C1", "새 색"], ["C2", "0.5px 단 글씨 크기"], ["C3", "투명도로 흐리게"],
                ["C4", "basis 없는 flex:1"], ["C5", "맨 1fr grid"], ["C6", "한글에 고정폭"],
                ["C7", "한 낱말 상태 클래스"], ["C8", "달력 칸 96px 미만 (오류 87)"],
                ["C9", "15×15 가 아닌 아이콘 (오류 78)"]];
  for (const [code, name] of want) ok(`본보기의 「${name}」을 잡았다`, got.has(code));

  // 글자 훑기도 본보기로 — ⚠️ 이 저장소가 실제로 다친 네 자리
  // ⚠️ 발송 스위치 낱말을 **글자 그대로** 이 파일에 두면 `scripts/check-notify.mjs` 가 잡는다
  const SINK = "NOTIFY" + "_SINK";
  const 나쁜코드 = `
    const a = staff_note; const b = process.env.${SINK};
    const r = await db.query("select * from v2.class_member where x=1");
    const c = await db.query("select * from v2.cursor_of(1)");
  `;
  const 잡힘 = FORBID_SRC.filter(([re]) => re.test(나쁜코드)).length;
  ok("일부러 어긴 코드 네 자리(`staff_note`·발송 스위치·반 명단 직접 조회·커서)를 잡았다", 잡힘 === 4, `${잡힘}건만 잡았다`);
}

/* ══ 4부 — 판단이 lib 것인지 · 달력이 사유별로 묶는지 (순수 함수) ═══ */
console.log("\n■ 4부 — 달력의 규칙 (오류 85·86 · ㊲)");
{
  const { calendarMarks, MARKS, monthDays, makeupLoad } = await import("../app/schedule/read.js");

  // ⚠️ 사람마다 한 줄이면 23명 날에 스물세 줄이 선다 (오류 86)
  const m = {
    holidays: [{ date: "2026-09-24", class_id: null, reason: "추석" }],
    makeups:  [{ on_date: "2026-09-10", name: "강민서", state: "set" },
               { on_date: "2026-09-10", name: "구도은", state: "set" },
               { on_date: "2026-09-11", name: "무른아이", state: "waived" }],
    planned:  [{ date: "2026-09-10", name: "김서은", attend: "absent" },
               { date: "2026-09-10", name: "박지호", attend: "absent" },
               { date: "2026-09-10", name: "이하람", attend: "late" }],
    exams:    [{ scope: "national", name: "9월 학력평가", english_on: "2026-09-02", school_name: "신정중" },
               { scope: "school", name: "2학기 중간", english_on: "2026-10-14", school_name: "옥련여고" }],
  };
  const got = calendarMarks(m);
  const d10 = got.get("2026-09-10") ?? [];
  const absent = d10.find((x) => x.key === "absent");
  ok("같은 날 결석 두 명이 **한 줄로 묶인다** (오류 86)",
     !!absent && absent.who.length === 2, JSON.stringify(d10.map((x) => [x.key, x.who])));
  ok("지각은 결석과 **다른 줄**이다 (「얼마나」가 다르다)", d10.some((x) => x.key === "late"));
  ok("무른 보강(`waived`)은 달력에 안 뜬다 — 지우지는 않았다(대전제 6)", !got.has("2026-09-11"));
  ok("휴강은 **사유로** 뜬다 (오류 85 — 정상 수업은 안 띄운다)",
     (got.get("2026-09-24") ?? []).some((x) => x.key === "off" && x.why.includes("추석")));

  // ⚠️ ㊲ — 전국 시험에 학교를 붙이면 학교마다 한 줄이 된다
  const nat = (got.get("2026-09-02") ?? []).find((x) => x.key === "exam");
  ok("**전국 시험에 학교를 안 붙인다** (㊲)",
     !!nat && nat.why.join("").includes("9월 학력평가") && !nat.why.join("").includes("신정중"),
     JSON.stringify(nat?.why));
  const sch = (got.get("2026-10-14") ?? []).find((x) => x.key === "exam");
  ok("학교 시험에는 **학교를 붙인다**", !!sch && sch.why.join("").includes("옥련여고"));

  ok("달력 갈래는 다섯뿐이다 — 휴강·보강·결석·지각·시험 (정상 수업이 없다)",
     MARKS.length === 5 && MARKS.map((x) => x.key).join(",") === "off,makeup,absent,late,exam");
  ok("무른 보강은 **빈 자리 셈에도** 안 든다", (makeupLoad(m)["2026-09-11"] ?? 0) === 0);

  const g = monthDays("2026-09");
  ok("2026-09 은 30일이고 1일이 화요일이다 (앞 빈칸 2개)", g.days.length === 30 && g.pad === 2);
}

/* ══ 5부 — 진짜 DB (SQL 이 사는가 · 조회를 몇 번 하는가) ════════════ */
console.log("\n■ 5부 — 진짜 DB 로");

const dbUrl = (() => {
  try { return readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? null; }
  catch { return null; }
})();

if (!dbUrl) {
  fail++;
  console.log("   ❌ `.env.local` 의 `DATABASE_URL` 이 없어 **진짜 스키마를 못 물어봤다** — 있는 척하지 않는다");
} else {
  const { Client } = await import("pg");
  const { SQL, loadMonth } = await import("../app/schedule/read.js");
  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  let live = true;
  try { await c.connect(); } catch (e) { live = false; fail++; console.log(`   ❌ DB 에 못 붙었다 — ${e.message.split("\n")[0]}`); }

  if (live) {
    // ⑫ SQL 이 진짜 스키마를 지나는가 — 죽은 칸은 여기서 터진다
    let i = 0;
    for (const [name, sql] of Object.entries(SQL)) {
      try {
        await c.query(`prepare _s${i} as ${sql}`);
        await c.query(`deallocate _s${i}`);
        ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, true);
      } catch (e) { ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, false, e.message.split("\n")[0]); }
      i++;
    }
    // ⚠️ 쓰는 SQL 도 **진짜로** 걸어 본다 — 죽은 칸·제약 위반은 가짜 DB 로는 못 잡는다
    let k = 0;
    for (const [name, sql] of Object.entries(pickSql(src["actions.js"] ?? ""))) {
      try {
        await c.query(`prepare _w${k} as ${sql}`);
        await c.query(`deallocate _w${k}`);
        ok(`쓰는 SQL \`${name}\` 이 진짜 스키마를 지난다`, true);
      } catch (e) { ok(`쓰는 SQL \`${name}\` 이 진짜 스키마를 지난다`, false, e.message.split("\n")[0]); }
      k++;
    }

    // ⑦ 접근 규칙을 그대로 걸고 — 화면이 여는 문과 **같은 방법**
    const pid = (await c.query("select id from v2.profiles where role='principal' order by name limit 1")).rows[0]?.id;
    ok("원장 계정이 있다 (없으면 이 화면을 열 사람이 없다)", !!pid);
    if (pid) {
      await c.query(`select set_config('request.jwt.claims', '{"sub":"${pid}","role":"authenticated"}', false);`
                  + ` set role authenticated;`);
      ok("`set role authenticated` 로 갈아탔다 (화면이 접근 규칙 밖으로 안 나간다)",
         (await c.query("select current_user u")).rows[0].u === "authenticated");

      // ⚠️ **화면 것과 lib 것을 갈라 센다.** 가르는 표는 SQL 앞머리의 `/* sc:… */` 토막주석이다
      let q = 0, mine = 0;
      const db = { query: (s, p) => {
        const t = String(s);
        if (!/^\s*(begin|commit|rollback)\b/i.test(t)) { q++; if (/\/\*\s*sc:/.test(t)) mine++; }
        return c.query(s, p);
      } };

      const t0 = Date.now();
      const r = await loadMonth(db, { ym: null });
      const ms = Date.now() - t0;
      say(`${r.m.ym} · 오늘 ${r.m.today} · 반 ${r.m.classes.length} · 명단 ${r.m.roster.length}줄 · ${ms}ms`);
      ok("**화면이 스스로 쓰는 조회는 하나뿐이다** (한 달치 한 벌)", mine === 1, `${mine}번`);
      // ⚠️⚠️ 미리 읽어 둔 한 벌이 lib/session.js 의 물음을 **전부** 받아야 한다.
      //    하나라도 새면 반마다 두 번씩 왕복이 늘어 상한을 곧바로 넘는다 (그냥 부르면 17번이다)
      ok("미리 읽어 둔 한 벌이 `lib/session.js` 의 물음을 **다 막았다** (못 막은 것 0)",
         r.missed === 0, `${r.missed}번이 진짜 DB 로 샜다 — lib 의 SQL 이 바뀌었는지 본다`);
      ok(`한 달을 열 때 조회가 상한(${CAP}) 안이다`, q <= CAP, `${q}번`);
      if (q > CAP) {
        ok("상한을 넘으면 화면이 그 사실을 **띄운다** (감추면 실패다)",
           /QUERY_CAP/.test(src["page.js"] ?? "") && /상한/.test(src["page.js"] ?? ""));
      }

      // ⑬ 회차 — **8회 판정은 그 달 전체로 한다** (오늘까지로 하면 매달 1일에 다 빨갛다)
      ok("반마다 회차가 나온다", r.board.length > 0, `${r.board.length}개 반`);
      ok("**8회 판정이 `total`(그 달 전체) 로 선다** — `done`(오늘까지)이 아니다",
         r.board.every((b) => b.enough === (b.total >= b.min)),
         JSON.stringify(r.board.map((b) => [b.done, b.total, b.enough])));
      ok("`min` 은 모든 반이 같다 (8회는 반마다 다르지 않다 — 원장님 확정)",
         new Set(r.board.map((b) => b.min)).size === 1);
      say(`이 달 회차: ${r.board.map((b) => b.total).join(" · ")} (모자란 반 ${r.board.filter((b) => !b.enough).length}개)`);
      ok("못 채운 반만 **아이 목록**을 낸다 (전체 보강일 하루가 아니다)",
         r.makeup.length === r.board.filter((b) => !b.enough).length);

      // ㊴ 내 할 일 — 바깥 축이 할 일 종류인가
      ok("「내 할 일」의 바깥 축이 **할 일 종류**다 (학교가 아니다)",
         r.todos.groups.map((g) => g.key).join(",") === "make,print,hand,unit_test,retest,score,repeat,other",
         r.todos.groups.map((g) => g.key).join(","));
      ok("옛 앱 학사일정은 **옆으로 치우고 세어서 말한다** (버리지 않는다)",
         typeof r.todos.aside?.n === "number");
      say(`내 할 일 ${r.todos.counts.open}건 · 학사일정 옆상자 ${r.todos.aside.n}줄 · 마감 지남 ${r.todos.late.length}건`);

      // ⚠️ 쓰기 권한 — 규칙이 열려 있어도 권한이 없으면 아무것도 못 쓴다
      const blocked = Object.entries(r.m.can_write ?? {}).filter(([, v]) => !v.ins && !v.upd).map(([t]) => t);
      ok("「쓸 수 있나」를 화면이 **DB 에 물어서** 안다 (글자로 박아 두지 않는다)",
         Object.keys(r.m.can_write ?? {}).length > 0);
      if (blocked.length) say(`⚠️ 지금 못 쓰는 표: ${blocked.join(" · ")}`);

      /* ⚠️⚠️ **진짜로 써 보고 되돌린다.**
       * 가짜 DB 만 상대하는 검사는 **죽은 칸·제약 위반을 못 잡는다** — 이 저장소가 이미 다친 자리다.
       * `begin … rollback` 안에서 실제로 한 줄씩 넣어 보고 **아무것도 안 남긴다.** */
      {
        const W = pickSql(src["actions.js"] ?? "");
        const stu = (await c.query("select id from v2.students where state='active' order by name limit 1")).rows[0]?.id;
        const cls = (await c.query("select id from v2.classes where state='active' order by created_at limit 1")).rows[0]?.id;
        const tdo = (await c.query("select id from v2.todo order by created_at limit 1")).rows[0]?.id;
        const day = `${r.m.ym}-15`;
        await c.query("begin");
        try {
          const mk = await c.query(W.SQL_MAKEUP_ADD, [stu, day, null, "19:00"]);
          ok("진짜로 **보강 한 줄이 들어간다** (제약을 지난다)", (mk.rows ?? []).length === 1);
          const wv = await c.query(W.SQL_MAKEUP_WAIVE, [mk.rows[0].id]);
          ok("진짜로 **보강을 'waived' 로 내린다** (지우지 않는다 — 대전제 6)", wv.rows?.[0]?.state === "waived");
          const hd = await c.query(W.SQL_HOLIDAY_ADD, [day, null, "검사용 휴강"]);
          ok("진짜로 **학원 전체 휴강 한 줄이 들어간다** (class_id 가 비어도 열쇠가 선다)", (hd.rows ?? []).length === 1);
          const st = await c.query(W.SQL_STAMP, [r.m.nextYm, cls, 1, pid]);
          ok("진짜로 **다음 달 도장 ①이 찍힌다** (step check 를 지난다)", (st.rows ?? []).length === 1);
          const st3 = await c.query(W.SQL_STAMP, [r.m.nextYm, cls, 3, pid]);
          ok("도장 ③도 찍힌다", (st3.rows ?? []).length === 1);
          if (tdo) {
            const td = await c.query(W.SQL_TODO_STATE, [[tdo], "done"]);
            ok("진짜로 **할 일 한 줄이 끝냄으로 바뀐다**", (td.rows ?? []).length === 1);
          }
          // ⚠️ 없는 시험에 넣으면 0줄이다. **그것을 「성공」이라 부르지 않는 것**이 화면 규칙이다(자동 검사 ⑪)
          const en = await c.query(W.SQL_ENGLISH_ON, [pid, day]);
          ok("없는 시험에 영어 시험일을 넣으면 **0줄**이다 (화면은 이걸 실패로 말한다)", (en.rows ?? []).length === 0);
        } finally {
          await c.query("rollback");
        }
        const left = (await c.query(
          "select (select count(*)::int from v2.makeup where on_date=$1::date and student_id=$2) m,"
          + " (select count(*)::int from v2.holiday where date=$1::date and reason='검사용 휴강') h,"
          + " (select count(*)::int from v2.month_confirm where ym=$3) s", [day, stu, r.m.nextYm])).rows[0];
        ok("되돌린 뒤 **아무것도 안 남았다** (검사가 진짜 자료를 더럽히지 않는다)",
           left.m === 0 && left.h === 0 && left.s === 0, JSON.stringify(left));
      }

      // ⚠️⚠️ 화면이 「못 하는 것」을 감추지 않는가 — 휴강 무르기·도장 풀기가 실제로 막혀 있다
      const noDel = (await c.query(
        `select t, has_table_privilege('v2.'||t,'delete') d from unnest(array['holiday','month_confirm']) t`)).rows;
      const 못지움 = noDel.filter((x) => !x.d).map((x) => x.t);
      if (못지움.length) {
        say(`⚠️ 지우기 권한 없음: ${못지움.join(" · ")} — 휴강·도장을 무를 길이 없다`);
        ok("화면이 「휴강을 무를 수 없다」를 **그대로 밝힌다** (할 수 있는 척하지 않는다)",
           /무르는 길이 아직 없습니다/.test(src["ui.js"] ?? ""));
        ok("화면이 「도장을 풀 수 없다」를 **그대로 밝힌다**",
           /푸는 길이 없습니다/.test(src["page.js"] ?? ""));
      }
    }
    await c.end();
  }
}

/** `actions.js` 안의 `const SQL_… = \`…\`` 를 뽑는다 — 쓰는 SQL 도 진짜로 걸어 본다 */
function pickSql(text) {
  const out = {};
  for (const mm of text.matchAll(/const\s+(SQL_[A-Z_]+)\s*=\s*`([\s\S]*?)`/g)) out[mm[1]] = mm[2];
  return out;
}

/* ══ 6부 — 진짜 브라우저로 그려 잰다 ════════════════════════════════ */
console.log("\n■ 6부 — 320·390·768·1400 에서 **진짜로 그려** 잰다");

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => existsSync(p)) || null;

/** 화면 검사 — `scripts/check-layout.mjs` 와 같은 잣대다 */
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
    /* ⚠️ 달력 칸(.sc-cell)은 **일부러** 96px 이상이다 (오류 87). 이 규칙은 「글만 든 단추가
       안 접혀 세로로 늘어난 것」을 잡으려는 것이라 달력 칸은 뺀다 — 대신 아래에서 따로 잰다 */
    if ((e.tagName === "BUTTON" || e.classList.contains("btn")) && !e.classList.contains("sc-cell")
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

/** 달력 — **칸은 96px 이상**(오류 87) · **아이콘은 15×15 고정**(오류 78) */
const CAL_PROBE = `(() => {
  const cells = [...document.querySelectorAll(".sc-cell")].map((e) => {
    const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; });
  const icons = [...document.querySelectorAll(".sc-icon")].map((e) => {
    const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  const wrap = document.querySelector(".calwrap");
  return JSON.stringify({ cells, icons, wrapScrolls: !!wrap && wrap.scrollWidth > wrap.clientWidth + 1 });
})()`;

/** 접기를 펴면 **진짜 보이나** — globals 의 `.accbd` 를 빌려 쓰면 오류 없이 그냥 안 보인다 */
const FOLD_PROBE = `(() => {
  const out = [];
  for (const d of document.querySelectorAll("details.sc-fold")) {
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
  // ⚠️ 「Lorem ipsum」으로는 안 깨진다. **진짜로 길게 적히는 글**로 깨진다
  let longName = "강민서, 구도은, 김서은, 박지호, 이하람, 서한결, 정유진";
  let longTodo = "옥련여고 2학기 중간 · 3과 본문 변형문제 만들기 (지문 11개)";
  if (dbUrl) {
    try {
      const { Client } = await import("pg");
      const c2 = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
      await c2.connect();
      longTodo = (await c2.query("select title t from v2.todo order by length(title) desc limit 1")).rows[0]?.t ?? longTodo;
      longName = (await c2.query(
        "select string_agg(name, ', ') t from (select name from v2.students where state='active' order by name limit 8) z"
      )).rows[0]?.t ?? longName;
      await c2.end();
    } catch { /* 위 5부가 이미 실패로 세웠다 */ }
  }

  const esc = (s) => String(s).replace(/[&<>]/g, (mm) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[mm]));
  const mark = (icon, label, who) =>
    `<span class="sc-mark"><span class="sc-icon">${icon}</span><span class="grow">${label} · ${esc(who)}</span></span>`;
  const cell = (d, inner = "") =>
    `<button class="sc-cell"><span class="sc-kv"><span class="num sc-daynum">${d}</span></span>${inner}</button>`;
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = i + 1;
    if (d === 10) return cell(d, mark("🅰", "결석", longName) + mark("⏰", "지각", "이하람"));
    if (d === 24) return cell(d, mark("🚫", "휴강", "추석 연휴"));
    if (d === 4) return cell(d, mark("🔁", "보강", "서한결") + mark("📝", "시험", "9월 학력평가"));
    return cell(d);
  }).join("");

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>일정 본보기</title>
<style>${readFileSync("app/globals.css", "utf8")}</style><style>${readFileSync(CSS, "utf8")}</style>
</head><body><main class="wrap"><div class="stack">
<div class="sc-head"><h1>일정</h1>
  <span class="sc-mon"><button class="btn btnghost">◀ 2026-08</button><span class="num">2026-09</span>
  <button class="btn btnghost">2026-10 ▶</button></span>
  <span class="muted">오늘 <span class="num">2026-09-02</span></span></div>
<div class="card"><div class="cardhd">① 이 달 회차 — 8회 채우기 <span class="pill pillbad">2개 반 모자람</span></div>
  <div class="tblwrap"><table class="tbl"><thead><tr class="hdstick">
    <th>반</th><th>지난 회차</th><th>앞날 예정</th><th>이 달 합</th><th>8회</th></tr></thead><tbody>
    ${["월수 17:00", "화목 14:50", "월수 19:30"].map((t, i) => `<tr>
      <td><span class="sc-kv"><b>${t.slice(0, 2)}</b><span class="num">${t.slice(3)}</span><span class="chip">정규</span></span></td>
      <td class="num">1</td><td class="num">7</td><td class="num">${8 - i}</td>
      <td>${i ? '<span class="pill pillbad">' + i + '회 모자람</span>' : '<span class="pill pillok">채움</span>'}</td>
    </tr>`).join("")}</tbody></table></div></div>
<div class="card"><div class="cardhd">② 보강 잡을 아이</div>
  <details class="sc-fold" open><summary class="sc-foldhd"><b>월수</b><span class="num">17:00</span>
    <span class="pill pillbad">1회 모자람</span><span class="chip">3명</span></summary>
    <div class="sc-foldbd"><div class="tblwrap"><table class="tbl">
      <thead><tr class="hdstick"><th>아이</th><th>수업</th><th>잡아 둔 보강</th><th>합</th><th>모자람</th></tr></thead>
      <tbody><tr><td>${esc(longName.split(",")[0])}</td><td class="num">7</td><td class="num">0</td>
        <td class="num">7</td><td><span class="pill pillbad">1회</span></td></tr></tbody></table></div></div></details></div>
<div class="card"><div class="cardhd">③ 달력 <span class="num">2026-09</span></div>
  <div class="col"><div class="calwrap">
    <div class="cal">${["일","월","화","수","목","금","토"].map((d) => `<div class="sc-dow">${d}</div>`).join("")}</div>
    <div class="cal"><div class="sc-out"></div><div class="sc-out"></div>${days}</div>
  </div>
  <p class="muted">정상 수업은 안 띄웁니다 — 휴강·보강·결석·지각·시험만 섭니다.</p>
  <div class="mdl sc-picked"><div class="cardhd"><span class="num">2026-09-10</span>
    <span class="muted">그날 수업 11명 · 잡아 둔 보강 2명</span></div>
    <p class="sc-kv"><span class="pill pillbad">결석</span><span class="grow">${esc(longName)}</span></p>
    <details class="sc-fold"><summary class="sc-foldhd">결석 · 지각 예정 넣기</summary><div class="sc-foldbd">
      <label class="lbl">누구</label><select class="fld"><option>고르세요</option></select>
      <div class="row"><button class="btn btnmain">결석 예정</button><button class="btn btnghost">지각 예정</button></div>
      <div class="row"><span class="muted">얼마나</span><button class="btn btnghost">10분</button>
        <button class="btn btnghost">20분</button><button class="btn btnghost">30분</button>
        <button class="btn btnghost">1시간</button></div>
      <label class="lbl">또는 도착 시각을 직접</label><input class="fld" type="time">
      <p class="sc-note">⚠️ 「얼마나」는 아직 저장되지 않습니다 — v2.day_sheet 에 담을 칸이 없습니다.</p>
    </div></details>
    <details class="sc-fold"><summary class="sc-foldhd">보강 잡기 — 시각도 직접 적습니다</summary>
      <div class="sc-foldbd"><div class="row">
        <div class="grow"><label class="lbl">시각 — 직접 적습니다</label><input class="fld" type="time"></div>
        <div class="grow"><label class="lbl">빠진 날</label><input class="fld" type="date"></div></div></div></details>
    <div class="mdlf"><button class="btn btnghost">닫기</button></div></div></div></div>
<div class="card"><div class="cardhd">④ 내 할 일 <span class="num">7</span>
  <span class="pill pillbad">마감 지남 6</span></div>
  <div class="row"><button class="btn btnmain">전체</button><button class="btn btnghost">전국 시험 (학평·수능)</button>
    <button class="btn btnghost">시험 없는 것</button></div>
  <div class="sc-pair">${["자료 만들기", "인쇄", "배부", "출제"].map((t, i) => `
    <div class="sc-bin"><p class="sc-binhd"><span class="sc-icon">✏️</span>${t} <span class="num">${i}</span></p>
      <div class="sc-todo"><span class="grow">${esc(longTodo)}</span><span class="num">2026-09-08</span>
        <span class="chip">D-6</span><span class="row"><button class="btn btnghost">끝냄으로</button></span></div></div>`).join("")}
  </div></div>
<div class="card"><div class="cardhd">⑤ 학교 · 시험</div>
  <p class="sc-note">시험 회차가 한 줄도 없습니다 — 들어오는 길은 셋입니다.</p></div>
<div class="card"><div class="cardhd">⑥ 다음 달(2026-10) 일정 확정 <span class="chip">도장 셋</span></div>
  <div class="sc-kv"><span class="grow"><b>월수</b> <span class="num">17:00</span></span>
    <span class="sc-stamp"><button class="btn btnghost">① 원장 안내</button>
      <button class="btn btnghost">② 학부모 확인</button><button class="btn btnghost">③ 원장 확정</button></span></div></div>
<details class="sc-fold"><summary class="sc-foldhd"><span class="pill pillok">조회 7번 (상한 8)</span></summary>
  <div class="sc-foldbd"><p class="muted">한 달치를 한 벌로 읽습니다.</p></div></details>
</div></main></body></html>`;

  const dir = mkdtempSync(join(tmpdir(), "chk-schedule-"));
  const page = join(dir, "schedule.html");
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
      ws.addEventListener("message", (e) => { const mm = JSON.parse(e.data); if (mm.id && waiting.has(mm.id)) { waiting.get(mm.id)(mm); waiting.delete(mm.id); } });
      const send = (method, params = {}) => new Promise((r) => { const i2 = ++id; waiting.set(i2, r); ws.send(JSON.stringify({ id: i2, method, params })); });
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

      const cal = JSON.parse((await send("Runtime.evaluate", { expression: CAL_PROBE, returnByValue: true })).result.result.value);
      ok(`${w}px — 달력 칸이 **96px 이상**이다 (오류 87 — 칸이 작아 잘렸다)`,
         cal.cells.length > 0 && cal.cells.every((x) => x.h >= 96),
         `가장 낮은 칸 ${Math.min(...cal.cells.map((x) => x.h))}px`);
      ok(`${w}px — 아이콘이 **15×15 고정**이다 (오류 78 — 점은 길이가 제각각이었다)`,
         cal.icons.length > 0 && cal.icons.every((x) => x.w === 15 && x.h === 15),
         JSON.stringify([...new Set(cal.icons.map((x) => `${x.w}x${x.h}`))]));
      if (w <= 390) ok(`${w}px — 달력이 **가로로 구른다** (칸 폭을 지킨다 — ㉜ 2)`, cal.wrapScrolls);

      const folds = JSON.parse((await send("Runtime.evaluate", { expression: FOLD_PROBE, returnByValue: true })).result.result.value);
      ok(`${w}px — 접기를 펴면 속이 **진짜 보인다** (안 보이면 오류 없이 그냥 없는 것이 된다)`,
         folds.length > 0 && folds.every((f) => f.display !== "none" && f.h > 0),
         folds.filter((f) => f.display === "none" || !f.h).map((f) => `${f.cls}:${f.display}`).join(" "));

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

console.log(`\n■ 일정 화면 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
