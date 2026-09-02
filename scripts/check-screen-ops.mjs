/**
 * 운영 화면 검사 — `app/ops` 가 **지켜야 할 것**만 본다.
 *
 * 무엇을 지키나 (하나하나 계획의 어느 줄인지 적는다)
 *   ①  화면이 `lib/` 을 **지난다**                판단은 lib 에 산다 (원칙 1)
 *   ②  화면이 **새 판단을 안 만든다**              ⚠️ 특히 **청구액**(오류 대장 83)
 *   ③  반 명단은 `v2.student_classes()` 로만       자동 검사 ⑮ (`class_member` 직접 조회 금지)
 *   ④  **탭이 없다**                              §속도 1 (탭 전환 = 화면 전체 재조회)
 *   ⑤  `alert`/`confirm` · `position:fixed` · `pushState` · `createPortal` 이 없다
 *   ⑥  **서비스 열쇠를 화면에서 안 쓴다**           쓰면 접근 규칙을 통째로 지나간다
 *   ⑦  **역할을 스스로 본다**                      문지기가 역할로 화면을 안 지킨다
 *   ⑧  **발송을 화면이 안 한다**                   밖으로 나가는 길은 `lib/notify.js` 하나 (대전제 7)
 *   ⑨  **지우는 길이 없다**                        대전제 6 — 지우지 않고 상태로 내린다
 *   ⑩  **오늘은 `v2.today()` 하나로**              `current_date` 는 UTC 라 밤 9시 이후 하루가 어긋난다
 *   ⑪  **금액이 비면 `null`** 이다 (0 이 아니다)   `v2.payment.amount` 주석 — **진짜 DB 로 확인한다**
 *   ⑫  **퇴원생은 재원 기간만**                    ⑯ 3 · 물음 V (파기와 부딪힌다)
 *   ⑬  **단가 줄을 하나로 고르지 않는다**          우선순위가 계획서에도 DB 에도 없다
 *   ⑭  SQL 이 **진짜 스키마**를 지난다             죽은 칸을 글자로 훑어서는 못 잡는다
 *   ⑮  **조회 수를 센다**                          `db.js` 의 `QUERY_CAP`
 *   ⑯  `ops.css` 가 배색 규칙을 안 어긴다          오류 94·100·106·107 · ㉑ · ㉜
 *   ⑰  클래스 **대장이 양쪽으로 맞는다**
 *   ⑱  320·390·768·1400 에서 **진짜로 그려** 잰다
 *
 * ⚠️ 그리고 **일부러 어기는 본보기**를 같이 넣어 검사가 그것을 잡는지까지 본다(3부).
 *    못 잡으면 이 검사가 실패한다 — 「초록인데 화면은 깨져 있음」이 제일 나쁘다.
 *
 * 돌리는 법:  node scripts/check-screen-ops.mjs
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = "app/ops";
const CSS = `${DIR}/ops.css`;
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
const files = readdirSync(DIR).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, readFileSync(`${DIR}/${f}`, "utf8")]));
/** ⚠️ 주석을 **먼저 지운다.** 안 지우면 「안 쓴다」고 적어 둔 주석이 위반으로 잡힌다 */
const bare = Object.fromEntries(files.map((f) => [f,
  src[f].replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")]));
const allBare = Object.values(bare).join("\n");
const allSrc = Object.values(src).join("\n");

console.log("■ 운영 화면 검사  (app/ops)");
say(`파일 ${files.length}개 — ${files.join(" · ")}`);

/* ══ 1부 — 글자로 훑는다 ═════════════════════════════════════════════ */
console.log("\n■ 1부 — 화면이 규칙을 지키는가");

// ① 화면이 lib 을 지난다
const MUST_CALL = [
  ["studentSessions", "특강 회차 — 그 아이가 그 날 그 반이었을 때만 센다 (lib/session.js)"],
  ["DOW_NAME",        "요일 이름 한 벌 — 반 이름을 짓는 재료 (lib/session.js)"],
  ["monthLabel",      "「2026년 8월」 (lib/monthly.js)"],
  ["assertYm",        "char(7) 에 빈칸 붙어 저장되던 자리를 막는다 (lib/monthly.js)"],
];
for (const [fn, why] of MUST_CALL) {
  ok(`화면이 \`${fn}\` 을 쓴다 — ${why}`, new RegExp(`\\b${fn}\\b`).test(allBare));
}
ok("모든 판단이 `lib/` 에서 온다 (`../../lib/` 만 들여온다)",
   [...allBare.matchAll(/from\s+"([^"]+)"/g)]
     .map((m) => m[1])
     .filter((p) => p.startsWith(".."))
     .every((p) => p.startsWith("../../lib/") || p === "../logout-button"),
   "화면 밖에서 lib 아닌 것을 들여온다");

/**
 * 화면 감사자 — ⚠️ 이 함수는 **본보기로도 돌려 본다**(3부). 못 잡으면 검사가 실패한다.
 * @returns [{code, why}]
 */
function auditScreen(text) {
  const bad = [];
  const add = (code, why) => bad.push({ code, why });
  const RULES = [
    ["S1", /SUPABASE_SERVICE_ROLE_KEY|serviceDb/,
     "서비스 열쇠를 화면에서 쓴다 — 접근 규칙을 통째로 지나간다"],
    ["S2", /from\s+v2\.class_member\b/i,
     "반 명단을 직접 조회한다 (자동 검사 ⑮) — v2.student_classes()/class_roster() 를 지나야 한다"],
    // ⚠️⚠️ 오류 대장 83 — 「회차 × 단가 = 청구액」이 통째로 틀렸던 자리
    ["S3", /(amount|단가|unit|price|fee|rate)\w*\s*\*|\*\s*\w*(sessions|session|회차|count|total|n)\b/i,
     "청구액을 화면이 곱해 만든다 — 정규는 월정액이고 특강도 곱셈은 화면 일이 아니다 (오류 83)"],
    // ⚠️ **이 화면에는 「청구액」이라는 값이 아예 없다.** 이름이 생기는 순간 누군가 채운다.
    //    S3 은 곱셈 모양을 보고, 이건 **이름 자체**를 막는다 — 곱셈을 안 써도 만들 수 있기 때문이다
    ["S13", /\b(bill|charge|invoice|due|owed|amountDue|totalDue|청구액)\s*[:=]/,
     "「청구액」이라는 값을 화면이 만든다 — 이 화면에 그런 값은 없다 (오류 83)"],
    ["S4", /staff_note/,
     "원장 전용 메모 칸 이름이 화면에 있다 — lib/close.js 한 곳뿐이다 (사고 #7)"],
    ["S5", /NOTIFY_SINK|require\(['"]web-push|from\s+['"]web-push/,
     "발송을 화면이 스스로 판단·발사한다 — 밖으로 나가는 길은 lib/notify.js 하나다 (대전제 7)"],
    ["S6", /(^|[^.\w])(alert|confirm)\s*\(/,
     "alert/confirm 을 쓴다 — 브라우저 알림창이 뜨면 자동화가 그 자리에서 멈춘다"],
    ["S7", /position\s*:\s*["']?fixed|history\.pushState|createPortal/,
     "position:fixed · pushState · createPortal 을 쓴다 — 닫는 길은 언제나 화면 안에 (대전제 10)"],
    ["S8", /role\s*=\s*["']tab["']|[?&]tab=|<Tabs|useTab\b/,
     "탭이 있다 — 탭 전환은 화면 전체 재조회다 (§속도 1)"],
    ["S9", /current_date|now\(\)::date/,
     "서울 아닌 오늘을 쓴다 — UTC 와 9시간 차이라 밤 9시 이후 하루가 어긋난다. v2.today() 하나로"],
    ["S10", /insert\s+into\s+v2\.progress\b|from\s+v2\.cursor_of|quiz_passed/i,
     "남의 판단(진도·커서·통과)을 화면이 직접 짠다"],
    ["S11", /revalidatePath|revalidateTag/,
     "한 번 누를 때마다 화면 전체를 다시 조회한다 (§속도 5 — 누른 그 단추만 바뀐다)"],
    ["S12", /delete\s+from\s+v2\./i,
     "지우는 길을 냈다 — 대전제 6(지우지 않고 상태로 내린다)"],
  ];
  for (const [code, re, why] of RULES) if (re.test(text)) add(code, why);
  return bad;
}

{
  const bad = auditScreen(allBare);
  ok("화면이 금지된 자리를 하나도 안 밟는다", bad.length === 0);
  bad.forEach((b) => console.log(`        [${b.code}] ${b.why}`));
}

// ⑦ 역할을 스스로 본다
ok("화면이 역할을 **스스로** 본다 (문지기는 역할로 안 지킨다)",
   /staffOnly\(\)/.test(bare["page.js"] ?? "") && /staffOnly\(\)/.test(bare["actions.js"] ?? ""));
ok("서버 동작이 전부 한 문(`run`)을 지나 역할·문열기를 거친다",
   (bare["actions.js"] ?? "").split("export async function").slice(1)
     .every((b) => /return\s+run\(/.test(b)),
   "run() 을 안 지나는 서버 동작이 있다");
// ⚠️ 「몇 군데 있나」로 세면 **한 군데가 빠져도 통과한다** (일부러 하나 지워 보고 알았다).
//    쓰는 동작 **하나하나**가 0줄 확인을 들고 있는지 본다 (자동 검사 ⑪).
{
  const blocks = (bare["actions.js"] ?? "").split(/export async function /).slice(1)
    .map((b) => ({ name: b.slice(0, Math.max(0, b.indexOf("("))), body: b }))
    .filter((b) => /insert\s+into\s+v2\.|update\s+v2\./i.test(b.body));
  // ⚠️ `no_rows` 와 `NO_ROWS`(트랜잭션 안에서 던질 때 붙이는 표시)를 **둘 다** 인정한다
  const naked = blocks.filter((b) => !/no_rows/i.test(b.body)).map((b) => b.name);
  ok(`쓰는 서버 동작 ${blocks.length}개가 **하나도 빠짐없이** 0줄이면 실패로 되돌린다 (자동 검사 ⑪)`,
     blocks.length >= 6 && naked.length === 0,
     naked.length ? `0줄 확인이 없는 것: ${naked.join(" · ")}` : `쓰는 동작이 ${blocks.length}개뿐이다`);
}

// ③ 반 명단 · ⑫ 재원 기간
ok("반 명단은 `v2.student_classes()` 를 지난다 (자동 검사 ⑮)",
   /v2\.student_classes\(/.test(bare["read.js"] ?? ""));
ok("⑫ 수납이 **재원 기간**으로 잘린다 (퇴원생 — 파기와 부딪힌다)",
   /state\s*<>\s*'active'[\s\S]{0,400}?student_classes/.test(bare["read.js"] ?? ""));
ok("⑫ 상담도 **그 상담이 있던 날**에 반이 있었는지로 잘린다",
   /student_classes\(c\.student_id,\s*\(c\.at at time zone 'Asia\/Seoul'\)::date\)/.test(bare["read.js"] ?? ""));
ok("못 그린 줄은 **개수를 밝힌다** (대전제 0 · 지우지 않는다)",
   /hidden_left/.test(bare["read.js"] ?? "") && /hiddenLeft/.test(bare["page.js"] ?? "")
   && /consult\.hidden/.test(bare["page.js"] ?? ""));

// ② 청구액을 안 만든다 — **말로도 못 박아 둔다**
ok("② 화면이 「청구액을 안 만든다」를 원장님께 그대로 말한다 (오류 83)",
   /곱셈은 이 화면이 안 합니다|곱셈은 화면이 안 한다/.test(allSrc));
ok("② 「금액이 비면 0원이 아니라 **아직 안 적음**」이 화면에 있다",
   /아직 안 적음/.test(allSrc));
ok("② **정규는 월정액**이라는 말이 화면에 있다",
   /정규는 월정액|정규 수강료는 월정액/.test(allSrc));

// ⑬ 단가 줄을 하나로 고르지 않는다
ok("⑬ 단가 줄을 **하나로 고르지 않는다** (우선순위가 어디에도 없다)",
   !/order by[^;]*fee_rule[^;]*limit 1/i.test(bare["read.js"] ?? "")
   && /json_agg\([\s\S]{0,600}?from v2\.fee_rule/.test(bare["read.js"] ?? ""));
ok("⑬ 겹치면 **겹쳤다고 말한다**", /겹칩니다|겹친/.test(allSrc));

// ⑧ 발송을 화면이 안 한다 — 그리고 **왜 안 하는지 화면이 말한다**
ok("⑧ 발송 단추를 안 만들고, **왜 안 만들었는지 화면이 말한다**",
   /lib\/notify\.js/.test(allSrc) && /안 만들었습니다/.test(allSrc));

// ⑨ 지우는 길이 없다
ok("⑨ 지우는 단추가 없다 (대전제 6 — 지우지 않고 상태로 내린다)",
   !/지우기|삭제/.test(allSrc.replace(/지우지\s*않|안 지운|못 지운|지울 수 없/g, "")));

/* ══ 2부 — `ops.css` 를 훑는다 ═════════════════════════════════════ */
console.log("\n■ 2부 — ops.css 가 배색·레이아웃 규칙을 지키는가");

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

/** ⚠️ 이 감사자도 **본보기로 돌려 본다**(3부). 못 잡으면 검사가 실패한다 */
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
    if (d.prop === "font-family" && /mono|menlo|consolas|courier/i.test(d.val) && !/\.mono\b/.test(r.sel))
      add("C6", `${r.sel} — 한글이 드는 자리에 고정폭 글꼴을 걸었다`);
    // C8 붙박이·고정 — 닫는 길은 언제나 화면 안에 (대전제 10)
    if (d.prop === "position" && /fixed/.test(d.val))
      add("C8", `${r.sel} { position: fixed } — 화면 안에 닫는 길을 두어야 한다`);
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
  ok("ops.css 가 규칙을 하나도 안 어긴다", a.bad.length === 0);
  a.bad.forEach((b) => console.log(`        [${b.code}] ${b.why}`));

  // ⑰ 대장이 양쪽으로 맞는가
  const defined = new Set();
  for (const r of a.rules) for (const m of r.sel.matchAll(/\.(op-[A-Za-z0-9-]+)/g)) defined.add(m[1]);
  const registry = new Set([...raw.matchAll(/@이름\s+\.(op-[A-Za-z0-9-]+)/g)].map((m) => m[1]));
  const used = new Set([...allSrc.matchAll(/\b(op-[A-Za-z0-9-]+)\b/g)].map((m) => m[1]));

  const noReg = [...defined].filter((c) => !registry.has(c));
  ok("ops.css 의 모든 클래스가 **이름 대장**에 있다", noReg.length === 0, noReg.join(" "));
  const unused = [...defined].filter((c) => !used.has(c));
  ok("ops.css 가 정의한 클래스를 화면이 **다 쓴다**", unused.length === 0,
     `안 쓰는 것: ${unused.join(" ")}`);
  const undef = [...used].filter((c) => !defined.has(c));
  ok("화면이 쓰는 `op-` 클래스가 ops.css 에 **다 있다**", undef.length === 0,
     `정의 없는 것: ${undef.join(" ")}`);

  // 좁은 화면 규칙이 맨 끝인가 (오류 100)
  const lastMedia = [...raw.matchAll(/@media[^{]*\{/g)].pop();
  ok("폭 규칙이 파일 **맨 끝**에 있다 (뒤에 같은 특정도 규칙이 오면 밀린다 — 오류 100)",
     !!lastMedia && raw.slice(lastMedia.index).indexOf("@media") === 0);
}

/* ══ 3부 — 일부러 어기는 본보기를 검사가 잡는가 ══════════════════════ */
console.log("\n■ 3부 — 일부러 어긴 본보기를 검사가 **잡는가**");
{
  const 나쁜css = `
  .op-bad1 { color: #ff0000; }
  .op-bad2 { font-size: 13.5px; }
  .op-bad3 { opacity: .45; }
  .op-bad4 { flex: 1; }
  .op-bad5 { display: grid; grid-template-columns: repeat(7, 1fr); }
  .op-bad6 { font-family: Menlo, monospace; }
  .op-bad8 { position: fixed; bottom: 0; }
  .open    { display: block; }`;
  const got = new Set(auditCss(나쁜css).bad.map((b) => b.code));
  const wantCss = [["C1", "새 색"], ["C2", "0.5px 단 글씨 크기"], ["C3", "투명도로 흐리게"],
                   ["C4", "basis 없는 flex:1"], ["C5", "맨 1fr grid"], ["C6", "한글에 고정폭"],
                   ["C7", "한 낱말 상태 클래스"], ["C8", "position:fixed"]];
  for (const [code, name] of wantCss) ok(`CSS 본보기의 「${name}」을 잡았다`, got.has(code));

  const 나쁜화면 = `
    import { serviceDb } from "../../lib/db.js";
    const A = "select * from v2.class_member where x=1";
    const owed = p.amount * s.total;
    const charge = feeRule.amount;
    const memo = row.staff_note;
    const sink = process.env.NOTIFY_SINK;
    function q(){ if (confirm("정말?")) alert("했다"); }
    const css = "position:fixed"; history.pushState({}, "", "/x"); createPortal(a, b);
    const t = <div role="tab" />;
    const D = "select current_date";
    const P = "insert into v2.progress (x) values (1)";
    revalidatePath("/ops");
    const X = "delete from v2.payment where id=$1";`;
  const got2 = new Set(auditScreen(나쁜화면).map((b) => b.code));
  const wantS = [["S1", "서비스 열쇠"], ["S2", "반 명단 직접 조회"], ["S3", "청구액 곱셈"],
                 ["S4", "원장 전용 메모 칸"], ["S5", "발송 스위치 직접 읽기"], ["S6", "alert/confirm"],
                 ["S7", "fixed·pushState·portal"], ["S8", "탭"], ["S9", "UTC 오늘"],
                 ["S10", "남의 판단"], ["S11", "화면 전체 재조회"], ["S12", "지우기"],
                 ["S13", "「청구액」이라는 값 자체"]];
  for (const [code, name] of wantS) ok(`화면 본보기의 「${name}」을 잡았다`, got2.has(code));
}

/* ══ 4부 — 진짜 DB · 진짜 조회 수 ═══════════════════════════════════ */
console.log("\n■ 4부 — 진짜 DB 로 (SQL 이 사는가 · 조회를 몇 번 하는가 · 빈 금액이 null 인가)");

const dbUrl = (() => {
  try { return readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? null; }
  catch { return null; }
})();

if (!dbUrl) {
  fail++;
  console.log("   ❌ `.env.local` 의 `DATABASE_URL` 이 없어 **진짜 스키마를 못 물어봤다** — 있는 척하지 않는다");
} else {
  const { Client } = await import("pg");
  const { SQL, loadHead, loadFee, loadInquiry, loadConsult, loadSpecial, classLabel } =
    await import("../app/ops/read.js");
  const { QUERY_CAP, SPECIAL_BUDGET } = await import("../app/ops/db.js");
  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  let live = true;
  try { await c.connect(); } catch (e) { live = false; fail++; console.log(`   ❌ DB 에 못 붙었다 — ${e.message.split("\n")[0]}`); }

  if (live) {
    // ⑭ SQL 이 진짜 스키마를 지나는가 — 죽은 칸은 여기서 터진다
    let i = 0;
    for (const [name, sql] of Object.entries(SQL)) {
      try {
        await c.query(`prepare _o${i} as ${sql}`);
        await c.query(`deallocate _o${i}`);
        ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, true);
      } catch (e) { ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, false, e.message.split("\n")[0]); }
      i++;
    }

    // ⑦ 접근 규칙을 흉내 낸 채로 도는가 — 화면이 여는 문과 **같은 방법**
    const pid = (await c.query(
      "select id from v2.profiles where role='principal' order by created_at limit 1")).rows[0]?.id;
    ok("원장 계정이 있다 (없으면 이 화면을 열 사람이 없다)", !!pid);

    if (pid) {
      await c.query(`select set_config('request.jwt.claims', '{"sub":"${pid}","role":"authenticated"}', false);`
                  + ` set role authenticated;`);
      ok("`set role authenticated` 로 갈아탔다 (화면이 접근 규칙 밖으로 안 나간다)",
         (await c.query("select current_user u")).rows[0].u === "authenticated");

      // ⚠️ **화면 것과 lib 것을 갈라 센다.** 안 가르면 「화면이 몇 번 묻나」를 못 잡는다
      let q = 0, mine = 0;
      const db = { query: (s, p) => {
        const t = String(s);
        if (!/^\s*(begin|commit|rollback)\b/i.test(t)) { q++; if (/\/\*\s*ops:/.test(t)) mine++; }
        return c.query(s, p);
      } };

      const t0 = Date.now();
      const head = await loadHead(db, null);
      const fee = await loadFee(db, head.ym);
      const inq = await loadInquiry(db);
      const con = await loadConsult(db, null);
      ok("기본 화면이 쓰는 조회는 **넷**이다 (머리 · 수납 · 문의 · 상담)", q === 4 && mine === 4,
         `모두 ${q}번 · 화면 것 ${mine}번`);
      const sp = await loadSpecial(db, fee.people, head.ym, head.today, { budget: SPECIAL_BUDGET });
      const ms = Date.now() - t0;
      say(`${head.ym} — 아이 ${fee.people.length}명 · 특강 아이 ${fee.people.filter((p) => p.special.length).length}명 `
        + `· 문의 ${inq.length}건 · 상담 ${con.byStudent.length}명 / 최근 ${con.rows.length}줄`);
      say(`조회 ${q}번 · ${ms}ms  (상한 ${QUERY_CAP})`);
      ok(`⑮ 조회가 상한(${QUERY_CAP}) 안이다`, q <= QUERY_CAP, `${q}번`);
      ok("특강 회차를 **아이마다** 셌고, 못 센 아이는 이름이 남는다",
         sp.asked + sp.skipped.length === fee.people.filter((p) => p.special.length).length,
         `물어본 ${sp.asked} · 못 센 ${sp.skipped.length}`);
      ok("특강 회차 조회가 **정해 둔 자리 안**에서 끝난다", sp.used <= SPECIAL_BUDGET,
         `${sp.used}/${SPECIAL_BUDGET}`);
      // 정규 아이는 회차를 안 센다 — 월정액이라 필요 없다 (오류 83)
      ok("정규만 다니는 아이는 회차를 **안 센다** (월정액 — 오류 83)",
         fee.people.filter((p) => !p.special.length).every((p) => !sp.byStudent.has(p.studentId)));

      // ⑪ **빈 금액이 null 인가** — 진짜 줄로 확인한다
      const nullRow = (await c.query(
        `select p.ym, s.name from v2.payment p join v2.students s on s.id = p.student_id
          where p.amount is null limit 1`)).rows[0];
      if (nullRow) {
        const f2 = await loadFee(db, nullRow.ym);
        const who = f2.people.find((p) => p.name === nullRow.name);
        ok(`⑪ 금액이 빈 줄(${nullRow.name}·${nullRow.ym})이 **null 로** 온다 — 0 이 아니다`,
           !!who && who.paymentId != null && who.amount === null,
           who ? `amount=${JSON.stringify(who.amount)}` : "그 아이가 줄에 안 섰다");
      } else {
        // ⚠️ 없는 것을 「통과」로 세지 않는다 — 무엇을 못 봤는지 밝힌다
        say("⚠️ 금액이 빈 수납 줄이 DB 에 하나도 없어 ⑪ 을 진짜 줄로 못 봤다 (글자 검사만 통과)");
      }

      // ⑫ 재원 기간 자물쇠가 **실제로 가르는가** — 퇴원생이 없어도 장치는 확인할 수 있다
      const anyKid = (await c.query(
        `select id, name from v2.students where state = 'active' order by name limit 1`)).rows[0];
      if (anyKid) {
        const inSpan = (await c.query(
          `select count(*)::int n from v2.student_classes($1::uuid, v2.today())`, [anyKid.id])).rows[0].n;
        const outSpan = (await c.query(
          `select count(*)::int n from v2.student_classes($1::uuid, '1900-01-01'::date)`, [anyKid.id])).rows[0].n;
        ok("⑫ 재원 기간 자물쇠가 날짜로 **진짜 가른다** (재원 밖은 0줄)",
           inSpan > 0 && outSpan === 0, `안 ${inSpan} · 밖 ${outSpan}`);
      }

      // 반 이름 — 요일·시각에서 저절로 지어진다 (반에는 이름 칸이 없다)
      ok("반 이름이 **요일·시각**에서 지어진다 (반에 이름 칸이 없다 — 0002)",
         head.classes.length === 0 || head.classes.every((x) => /[월화수목금토일]|정규|특강/.test(x.label)),
         head.classes.map((x) => x.label).join(" "));
      ok("`classLabel` 이 요일 이력이 없는 반에도 답을 낸다 (빈 이름을 안 만든다)",
         classLabel({ kind: "special" }) === "특강" && classLabel({ kind: "regular" }) === "정규");

      say(`단가 줄 ${head.rules.length}개 · 반 ${head.classes.length}개 · 학교 ${head.schools}개`);
      if (head.rules.length === 0)
        say("⚠️ `v2.fee_rule` 이 **0줄**이다 — 화면이 「단가 줄 없음」으로 밝힌다 (금액은 손으로 적을 수 있다)");
      if (head.schools === 0)
        say("⚠️ `v2.schools` 가 **0줄**이다 — 등록 전환이 학교를 못 붙이고, 화면이 그렇게 말한다");
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
    if ((e.tagName === "BUTTON" || e.classList.contains("btn"))
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

/**
 * **펴면 진짜 보이나** — ⚠️ 오늘 화면이 실제로 한 번 당한 자리다.
 * globals 의 `.accbd` 를 빌려 쓰면 `display:none` 이 기본이라 `<details open>` 이어도 안 보이는데,
 * 화면 검사는 「안 보이는 것」은 잴 것이 없어 **0건으로 지나간다.**
 */
const FOLD_PROBE = `(() => {
  const out = [];
  for (const d of document.querySelectorAll("details.op-fold")) {
    d.open = true;
    for (const bd of d.children) {
      if (bd.tagName === "SUMMARY") continue;
      const s = getComputedStyle(bd), r = bd.getBoundingClientRect();
      out.push({ cls: bd.className, display: s.display, h: Math.round(r.height) });
    }
  }
  return JSON.stringify(out);
})()`;

/** 좌우 짝이 진짜로 서나 · 폰에서 위아래로 접히나 */
const PAIR_PROBE = `(() => {
  const p = document.querySelector(".op-pair");
  const s = getComputedStyle(p);
  const kids = [...p.children].map((e) => Math.round(e.getBoundingClientRect().top));
  return JSON.stringify({ cols: s.gridTemplateColumns.split(" ").length, sameRow: kids[0] === kids[1] });
})()`;

if (!CHROME) {
  fail++;
  console.log("   ❌ 브라우저가 없어 **화면을 실제로 그려 보지 못했다** — 있는 척하지 않는다");
} else {
  // ⚠️ 「Lorem ipsum」으로는 안 깨진다. **진짜 상담 글·진짜 이름**으로 깨진다
  let longBody = "■ 학부모 말씀\n· 어머님이 영어 가르치심\n· 아이가 엄마한테 물어봐도 잘 안 된다고 하심";
  let longName = "구도은";
  if (dbUrl) {
    try {
      const { Client } = await import("pg");
      const c2 = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
      await c2.connect();
      longBody = (await c2.query("select body t from v2.consult where body is not null order by length(body) desc limit 1")).rows[0]?.t ?? longBody;
      longName = (await c2.query("select name t from v2.students order by length(name) desc limit 1")).rows[0]?.t ?? longName;
      await c2.end();
    } catch { /* 위 4부가 이미 실패로 세웠다 */ }
  }

  const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
  const fld = (id, label, extra = "") =>
    `<div class="grow"><label class="lbl" for="${id}">${label}</label><input id="${id}" class="fld"${extra}></div>`;

  const payLine = (i) => `<div class="op-line">
    <span class="op-nm">${esc(longName)}</span><span class="chip">2학년</span>
    <span class="chip">월·수 17:00</span>
    ${i === 1 ? '<span class="pill pillinfo">특강 화·목 14:20</span><span class="pill pillinfo num">특강 7회 — 회차만큼 받습니다</span>' : ""}
    ${i === 2 ? '<span class="pill pillwarn">단가 줄 없음</span>'
              : '<span class="chip">반 350,000원/월 (2026-03-01~지금)</span>'}
    ${i === 3 ? '<span class="pill pillwarn">단가 줄이 둘 이상 겹칩니다 — 어느 것이 이기는지 정해진 데가 없습니다</span>' : ""}
    ${fld(`amt-${i}`, "금액", ' inputmode="numeric" value="350000"')}
    ${fld(`on-${i}`, "받은 날", ' type="date"')}
    ${fld(`how-${i}`, "받은 길")}
    ${fld(`memo-${i}`, "메모")}
    <button class="btn btnmain">저장</button></div>`;

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>운영 본보기</title>
<style>${readFileSync("app/globals.css", "utf8")}</style><style>${readFileSync(CSS, "utf8")}</style>
</head><body><main class="wrap"><div class="stack">
<div class="op-head"><h1>운영</h1><span class="num">2026-09-02</span>
  <span class="muted">돈 · 상담 · 신규</span>
  <span class="pill pillwarn">지난 달(2026년 8월)을 보고 있습니다</span></div>

<section class="card"><div class="cardhd">🆕 신규 문의 <span class="num">진행 중 3건</span></div>
  <div class="col"><div class="row">
    ${fld("iq-name", "이름")}${fld("iq-phone", "전화", ' type="tel"')}${fld("iq-school", "학교")}
    ${fld("iq-grade", "학년")}${fld("iq-way", "알게 된 길")}</div>
    <label class="lbl" for="iq-body">통화에서 들은 것</label>
    <textarea id="iq-body" class="fld" rows="3"></textarea>
    <div class="row"><button class="btn btnmain">적어 두기</button></div>
    <p class="op-note">⚠️ 「바로 안내 보내기」 단추를 여기에 <b>안 만들었습니다.</b>
      밖으로 나가는 길은 <b>lib/notify.js</b> 한 곳뿐입니다.</p>
    <div class="op-list">
      <div class="op-line"><span class="op-nm">${esc(longName)}</span>
        <a class="chip" href="tel:010-0000-0000">010-0000-0000</a>
        <span class="chip">신정중 2학년</span><span class="chip">검색</span>
        <span class="num muted">2026-08-08</span><span class="pill pillinfo">방문상담</span>
        <p class="op-body grow">${esc(longBody)}</p>
        <div class="row"><button class="btn btnghost">문의</button><button class="btn btnghost">레벨테스트</button>
          <button class="btn btnmain">방문상담</button><button class="btn btnghost">안 옴</button></div>
        <details class="op-fold grow"><summary class="op-foldhd">등록 전환 — 아이 줄을 세우고 문의를 잇습니다</summary>
          <div class="op-foldbd"><div class="row">
            <div class="grow"><label class="lbl" for="cl-1">반 (안 고르면 소속을 안 만듭니다)</label>
              <select id="cl-1" class="fld"><option>— 나중에 —</option><option>정규 월·수 17:00</option></select></div>
            ${fld("fd-1", "언제부터 — 소속은 기간이 열쇠입니다", ' type="date"')}</div>
            <p class="op-note">같은 이름의 아이가 이미 있습니다 — ${esc(longName)}.
              아이 줄은 <b>지울 수 없습니다</b>. 그래도 새로 만들려면 아래를 한 번 더 누르세요.</p>
            <div class="row"><button class="btn btnmain">그래도 만든다</button></div></div></details>
      </div>
    </div>
  </div>
  <details class="op-fold"><summary class="op-foldhd">끝난 문의 <span class="num">50건</span>
    <span class="muted">등록 20 · 안 옴 30</span></summary>
    <div class="op-foldbd"><div class="op-list">
      <div class="op-line"><span class="op-nm">${esc(longName)}</span><span class="pill pillok">등록</span>
        <span class="pill pillok">아이 줄 있음 — ${esc(longName)}</span></div></div></div></details>
</section>

<section class="card"><div class="cardhd">💳 수강료 <span class="num">2026년 8월</span></div>
  <p class="op-mon"><a class="btn btnghost" href="#">◀ 2026-07</a>
    <span class="num">2026-08-01 ~ 2026-08-31</span>
    <a class="btn btnghost" href="#">2026-09 ▶</a><a class="btn btnghost" href="#">이번 달로</a></p>
  <div class="stack">
    <p class="op-kv"><span class="chip">줄에 선 아이</span><span class="num">25명</span>
      <span class="chip">수납 줄 없음</span><span class="num">5</span>
      <span class="chip">금액 안 적음</span><span class="num">1</span>
      <span class="chip">받은 날 빔</span><span class="num">0</span>
      <span class="chip">받은 금액 합</span><span class="num">6,650,000원</span></p>
    <p class="op-note"><b>금액이 비면 0원이 아니라 「아직 안 적음」</b>입니다 — 청구를 안 만듭니다.
      <br />⚠️ <b>정규는 월정액</b>이라 회차와 무관합니다. <b>특강만 회차만큼</b> 받습니다 —
      그래도 <b>곱셈은 이 화면이 안 합니다.</b></p>
  </div>
  <details class="op-fold"><summary class="op-foldhd">단가 — 「언제부터 얼마」 <span class="num">2줄</span></summary>
    <div class="op-foldbd">
      <p class="op-note">단가는 <b>고치지 않고 쌓습니다.</b></p>
      <div class="op-list"><div class="op-line"><span class="op-nm">정규 월·수 17:00</span>
        <span class="chip">반</span><span class="num">350,000원</span><span class="chip">월정액</span>
        <span class="num">2026-03-01 ~ 지금</span><button class="btn btnghost">끝 찍기</button></div></div>
      <div class="row">
        <div class="grow"><label class="lbl" for="fr-who">누구 것</label>
          <select id="fr-who" class="fld"><option>— 고르세요 —</option></select></div>
        ${fld("fr-amt", "얼마", ' inputmode="numeric"')}
        ${fld("fr-from", "언제부터", ' type="date"')}
        ${fld("fr-to", "언제까지 (비우면 지금까지)", ' type="date"')}</div>
      <label class="op-kv"><input type="checkbox"><span class="grow">회차만큼 받는다 (특강)</span></label>
      <div class="row"><button class="btn btnmain">한 줄 쌓기</button></div></div></details>
  <div class="op-list">${[0, 1, 2, 3].map(payLine).join("")}</div>
  <p class="op-note">퇴원한 아이의 수납 줄 <b>2개</b>를 안 그렸습니다 — 재원 기간 밖입니다.
    줄은 <b>그대로 있습니다</b>.</p>
</section>

<section class="card"><div class="cardhd">🗒 상담일지 <span class="num">${esc(longName)} · 21줄</span></div>
  <div class="row">${Array.from({ length: 12 }, (_, i) =>
    `<a class="op-who${i === 1 ? " is-sel" : ""}" href="#"><span>${esc(longName)}</span>
      <span class="muted num">${i + 1}줄 · 2026-08-06</span></a>`).join("")}</div>
  <div class="op-pair">
    <div class="col">
      <label class="lbl" for="cs-body">${esc(longName)} — 상담 내용</label>
      <textarea id="cs-body" class="fld" rows="5"></textarea>
      <div class="row">${fld("cs-way", "어떻게")}${fld("cs-at", "언제 (비우면 지금)", ' type="datetime-local"')}
        <button class="btn btnmain">적기</button></div>
    </div>
    <div class="op-list">
      <div class="op-line"><span class="num muted">2026-08-21 12:56</span><span class="chip">전화</span>
        <p class="op-body grow">${esc(longBody)}</p></div>
      <div class="op-line"><span class="num muted">2026-08-06 14:46</span>
        <span class="pill pillwarn">내용이 비어 있습니다</span></div>
    </div>
  </div>
</section>

<details class="op-fold"><summary class="op-foldhd">
  <span class="pill pillok">조회 16번 (상한 24)</span></summary>
  <div class="op-foldbd"><p class="mono">ops:head · ops:fee · ops:inquiry · ops:consult</p></div></details>
</div></main></body></html>`;

  const dir = mkdtempSync(join(tmpdir(), "chk-ops-"));
  const page = join(dir, "ops.html");
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

      const pair = JSON.parse((await send("Runtime.evaluate", { expression: PAIR_PROBE, returnByValue: true })).result.result.value);
      if (w <= 900) ok(`${w}px — 좌우 짝이 **위아래로** 접힌다`, pair.cols === 1 && !pair.sameRow);
      else ok(`${w}px — 좌우 짝이 **좌우로** 선다`, pair.cols === 2 && pair.sameRow);

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

console.log(`\n■ 운영 화면 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
