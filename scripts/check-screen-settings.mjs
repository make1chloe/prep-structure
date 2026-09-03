/**
 * 설정 `/settings` 검사 — **이 화면이 지켜야 할 것**만 본다.
 *
 * 왜 이 검사가 있나
 *   이 저장소가 실제로 다친 자리는 「가짜 DB 만 상대하는 검사가 초록인데 화면을 켜면 터졌다」였다.
 *   그래서 여기서는 **진짜 DB 에 붙어** ① SQL 을 PREPARE 하고 ② 조회를 세고
 *   ③ 학생·학부모로 열어 보고 ④ **쓰기를 트랜잭션 안에서 진짜로 돌린 뒤 rollback** 한다.
 *
 * 무엇을 보나
 *   ① 파일이 제자리에 · ② 화면이 `lib/`·`v2.` 을 지나는가 (새 판단을 안 만드는가)
 *   ③ 서비스 열쇠가 없는가 · 접근 규칙 안에서 읽는가
 *   ④ 배색 다섯이 `app/globals.css` 와 **정확히 같은가** · 되살리기를 베끼지 않았는가
 *   ⑤ 절 ㊶ — 켠 날짜가 **다시 켜도 안 덮이는가** · 「언제까지」 칸이 없는가
 *   ⑥ 절 ㊺-b — 고등 6주 · 중등 4주
 *   ⑦ 착각을 안 만드는가 — 새 문구·새 규칙 만들기가 없는가
 *   ⑧ 대전제 12 — 비밀번호 자리가 없는가
 *   ⑨ 폰에서 깨질 자리 · 대장에 없는 클래스
 *   ⑩~⑭ 진짜 DB — PREPARE · 조회 수 · 접근 규칙 · **진짜 쓰기** · 읽기 문이 쓰기를 막는가
 *   ⑮ 화면이 말한 「아직 안 쓰인다」가 **지금도 사실인가**
 *
 * ⚠️ **일부러 어기는 본보기를 같이 검사한다.** 글자 검사가 그 본보기를 못 잡으면
 *    **검사 자신이 실패한다.**
 *
 * ⚠️ DB 가 없으면 글자 검사만 돌고, **그렇게 밝힌다.** 「있는 척」이 제일 나쁘다.
 *
 * 돌리는 법:  node scripts/check-screen-settings.mjs
 */
import { readFileSync, existsSync } from "node:fs";

let fail = 0, n = 0;
const ok = (t, c, why = "") => {
  n++;
  if (c) console.log(`   ✅ ${t}`);
  else { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
};
const sec = async (title, fn) => {
  console.log(title);
  try { await fn(); }
  catch (e) { n++; fail++; console.log(`   ❌ 이 자리가 도중에 죽었다 — ${e?.message ?? e}`); }
};

const FILES = {
  page:    "app/settings/page.js",
  read:    "app/settings/read.js",
  parts:   "app/settings/parts.js",
  actions: "app/settings/actions.js",
};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

/** ⚠️ 주석을 먼저 지운다. 「예전엔 이렇게 틀렸다」는 경고가 주석에 있다고 빨개지면
 *    다들 그 경고를 지우게 된다. 지켜야 할 것은 **도는 코드**다. */
const 코드만 = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
   .replace(/(^|[^:])\/\/[^\n]*/g, (m, a) => a + " ".repeat(m.length - a.length));

const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)]));
const code = Object.fromEntries(Object.entries(src).map(([k, s]) => [k, 코드만(s)]));
const 화면코드 = [code.page, code.read, code.parts, code.actions].join("\n");

/* ══════════════════════════════════════════════════════════════════════
 * 글자로 훑는 자 — **본보기로 먼저 시험한다**
 * ══════════════════════════════════════════════════════════════════════ */

/** 등록된 클래스 이름 — `app/globals.css` 의 「이름 대장」이 유일한 한 벌이다 */
function 대장() {
  const css = read("app/globals.css");
  return new Set([...css.matchAll(/@이름\s+\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]));
}

/** 화면이 쓴 클래스 이름 — `className={…}` 안의 **따옴표 글자만** 모은다 */
function 쓴클래스(s) {
  const out = new Set();
  const 담기 = (txt) => {
    for (const c of txt.replace(/\$\{[^}]*\}/g, " ").split(/\s+/))
      if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c)) out.add(c);
  };
  const 따옴표 = { '"': '"', "'": "'", "`": "`" };
  for (let i = s.indexOf("className="); i >= 0; i = s.indexOf("className=", i + 1)) {
    let j = i + "className=".length;
    if (따옴표[s[j]]) {
      const q = s[j], end = s.indexOf(q, j + 1);
      if (end > j) 담기(s.slice(j + 1, end));
      continue;
    }
    if (s[j] !== "{") continue;
    let depth = 0, k = j;
    for (; k < s.length; k++) {
      if (s[k] === "{") depth++;
      else if (s[k] === "}") { depth--; if (depth === 0) break; }
    }
    for (const m of s.slice(j + 1, k).matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g))
      담기(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

/**
 * 폰에서 깨지는 자리 — **어긴 것 목록**을 낸다.
 * ⚠️ `app/_home` 검사와 **같은 자**다. 화면마다 다른 자를 쓰면 화면마다 다른 규칙이 산다.
 */
function 어긴것(s) {
  const bad = [];
  for (const m of s.matchAll(/flex\s*:\s*["']?\s*1\s*["']?\s*[,}]/g))
    bad.push(`basis 없는 flex:1 (${m[0].trim()})`);
  for (const m of s.matchAll(/gridTemplateColumns\s*:\s*["'`]([^"'`]*)["'`]/g))
    if (/(^|[\s(])1fr/.test(m[1]) && !/minmax\(\s*0/.test(m[1]))
      bad.push(`minmax(0,…) 없는 1fr (${m[1]})`);
  for (const m of s.matchAll(/fontSize\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    const v = m[1].trim();
    if (/^var\(--fs\d+\)$/.test(v)) continue;
    bad.push(`토큰이 아닌 글씨 크기 ${v}`);
  }
  for (const m of s.matchAll(/(?:color|background|backgroundColor|borderColor)\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    const v = m[1].trim();
    if (/var\(--/.test(v) || /^(inherit|transparent|none|currentColor|0)$/.test(v)) continue;
    if (/#|rgb|hsl/.test(v)) bad.push(`지어낸 색 ${v}`);
  }
  for (const w of ["alert(", "confirm(", "createPortal", 'position: "fixed"', "position:'fixed'"])
    if (s.includes(w)) bad.push(`안 쓰기로 한 것: ${w}`);
  for (const m of s.matchAll(/opacity\s*:\s*["']?(0?\.\d+)/g)) bad.push(`투명도 ${m[1]}`);
  for (const m of s.matchAll(/className=[{"'`][^"'`]*\b(open|on|sel|active)\b/g))
    bad.push(`한 낱말 상태 클래스: ${m[1]}`);
  return bad;
}

/** ⚠️ **일부러 어기는 본보기.** 검사가 이걸 못 잡으면 검사 자신이 실패한다 */
const 본보기 = `
  <div className="wrap open" style={{ flex: 1, fontSize: "13px", color: "#ff0000", opacity: .5 }}>
    <div style={{ gridTemplateColumns: "repeat(3, 1fr)" }} />
    <button onClick={() => alert("hi")} className="myown" />
  </div>`;

/* ══════════════════════════════════════════════════════════════════════ */

console.log("■ 설정 `/settings` 검사 — 거의 안 여는 화면\n");

await sec("■ 0 · 검사 자신을 먼저 시험한다 (본보기를 잡는가)", async () => {
  const b = 어긴것(본보기);
  for (const w of ["flex:1", "1fr", "글씨 크기", "지어낸 색", "alert(", "투명도", "한 낱말"])
    ok(`본보기의 「${w}」를 잡는다`, b.some((x) => x.includes(w)), `잡은 것: ${b.join(" · ") || "없음"}`);
  ok("본보기의 안 등록된 클래스를 잡는다", !대장().has("myown") && 쓴클래스(본보기).has("myown"));
});

await sec("■ ① 파일이 제자리에 있는가", async () => {
  for (const [k, p] of Object.entries(FILES)) ok(p, src[k].length > 0, "없다");
  ok("읽는 자리가 화면과 갈라져 있다 (SQL 이 한 곳에 모여 있다)",
     /export const SQL = \{/.test(src.read),
     "SQL 을 함수 안에 흩으면 `check-sql.mjs` 도 이 검사도 **원리적으로** 못 본다");
  ok("SQL 에 `${…}` 가 없다",
     !/\$\{/.test((src.read.match(/export const SQL = \{[\s\S]*?\n\};/) ?? [""])[0]),
     "글자를 끼워 넣으면 기계로 검사할 수가 없다");
});

await sec("■ ② 화면이 `lib/`·`v2.` 을 지나는가 — 새 판단을 안 만드는가", async () => {
  const lib = [...src.read.matchAll(/from\s+["']\.\.\/\.\.\/lib\/([a-z-]+)\.js["']/g)].map((m) => m[1]);
  for (const want of ["queue", "notify"])
    ok(`lib/${want}.js 를 부른다 (${lib.join(" · ") || "없음"})`, lib.includes(want));
  ok("「이 문구를 지금 보내면 막히나」를 화면에서 다시 짜지 않는다 (findHole 을 부른다)",
     /findHole\s*\(/.test(code.read) && !/\\\{\\\{/.test(화면코드),
     "발송을 막는 규칙이 두 벌이 되면 한쪽을 고치는 날 다른 쪽이 거짓말을 한다");
  ok("「이 규칙의 주기를 아는가」를 화면에서 다시 짜지 않는다 (cycleOf 를 부른다)",
     /cycleOf\s*\(/.test(code.read) && !/function\s+cycleOf/.test(화면코드));
  for (const f of ["v2.progress_open_days", "v2.can_edit_progress", "v2.today()", "v2.me()"])
    ok(`${f} 을(를) 부른다`, 화면코드.includes(f),
       "DB 에 이미 있는 판단을 화면이 다시 짜면 두 벌이다");
  ok("「며칠째」를 화면에서 세지 않는다",
     !/new Date\(|Date\.now\(/.test(code.parts) && !/new Date\(|Date\.now\(/.test(code.page),
     "세어 나오는 값은 저장도 재계산도 하지 않는다 (원칙 5)");

  // ⚠️ 「끄기」는 대시보드에 **이미 있다.** 두 벌로 적으면 한쪽만 고치는 날 어긋난다.
  // ⚠️⚠️ `where … and is_open = false` 는 **끄는 것이 아니라 켜기의 자물쇠**다 (아래 ⑤).
  //    그래서 `set …` 과 `where …` 를 **갈라서** 본다. 안 가르면 이 검사가
  //    「자물쇠를 빼라」고 시키는 꼴이 되어, 켠 날짜가 매번 덮이는 사고를 검사가 만든다.
  const 세팅절 = [...code.actions.matchAll(/\bset\b([\s\S]*?)(?:\bwhere\b|\breturning\b|`)/gi)]
    .map((m) => m[1]);
  ok("진도 체크 「끄기」를 새로 짜지 않았다 (app/_home 의 turnProgressEditOff 를 부른다)",
     /turnProgressEditOff/.test(code.actions) && !세팅절.some((s) => /is_open\s*=\s*false/i.test(s)),
     "`update … set is_open = false` 가 이 화면에도 있으면 그것이 두 벌째다 (원칙 1)");
  ok("꺼진 규칙도 읽는다 (`where active` 를 안 건다)",
     !/from v2\.auto_rule[\s\S]{0,80}where\s+active/.test(code.read),
     "꺼진 규칙이 안 보이면 **다시 켤 수가 없다** — 그래서 lib/queue.js 의 autoRules() 를 안 쓴다");
});

await sec("■ ③ 서비스 열쇠가 없는가 · 접근 규칙 안에서 읽는가", async () => {
  for (const [k, p] of Object.entries(FILES)) {
    ok(`${p} 에 serviceDb() 가 없다`, !/serviceDb\s*\(/.test(code[k]),
       "서비스 열쇠로 읽으면 학생이 이 주소를 열 때 학원 설정이 그대로 나온다");
    ok(`${p} 에 SUPABASE_SERVICE_ROLE_KEY 가 없다`, !code[k].includes("SUPABASE_SERVICE_ROLE_KEY"));
  }
  ok("붙자마자 그 사람이 된다 (set local role authenticated + request.jwt.claims)",
     /set local role authenticated/.test(code.read) && /request\.jwt\.claims/.test(code.read));
  ok("읽기 문은 read only 로 연다", /begin read only/.test(code.read));
  ok("쓰기 문은 read only 를 뺀다", /replace\("begin read only;", "begin;"\)/.test(code.actions));
  ok("사람 번호를 UUID 로 확인하고 끼운다 (끼워 넣기 막기)",
     /UUID\.test\(id\)/.test(code.read) && /UUID\s*=\s*\/\^\[0-9a-f\]\{8\}/.test(code.read));
  ok("누구인지는 lib/supabase-server.js 한 곳에서 묻는다",
     /from\s+["']\.\.\/\.\.\/lib\/supabase-server\.js["']/.test(code.page) && /roleOf\s*\(/.test(code.page));
  // ⚠️ 철자가 아니라 **규칙**을 본다 (대전제-4). 위 check-screen-home 주석과 같은 까닭이다
  /* ⚠️ 화면이 `blockedBy()` 한 벌로 막게 바뀌었다(0088 · 원장님 2026-09-03) —
   *    이제 `canSettings` 라는 **이름**이 화면에 없을 수도 있다. 이름이 아니라 **규칙**을 본다:
   *    「lib 의 판단을 지나는가」. 안 그러면 화면이 제 손으로 역할을 가르게 된다(대전제-4). */
  ok("원장·강사가 아니면 자료를 안 읽는다",
     /\bisStaff\s*\(|\bcanSettings\s*\(|\bblockedBy\s*\(|\bcanFor\s*\(/.test(code.page) &&
     /\bisStaff\s*\(|\bcanSettings\s*\(|\bblockedBy\s*\(|\bcanFor\s*\(/.test(code.actions));
  ok("⚠️ 화면이 **제 손으로 역할 목록을 만들지 않는다** (대전제-4)",
     !/new Set\(\s*\[[^\]]*(principal|instructor)/.test(code.page) &&
     !/new Set\(\s*\[[^\]]*(principal|instructor)/.test(code.actions));
  ok("쓰는 자리가 0줄이면 실패로 되돌린다 (자동 검사 ⑪)",
     /rowCount \?\? 0/.test(code.actions) && /rollback/.test(code.actions) &&
     /한 줄도 안 바뀌었다/.test(code.actions),
     "접근 규칙이 막았는데 「저장됨」이라 하면 원장님은 바꿨다고 믿고 값은 그대로다");
});

await sec("■ ④ 배색 다섯 (계획 ㉖)", async () => {
  const css = read("app/globals.css");
  const 씨에스에스 = new Set([...css.matchAll(/\[data-skin="([a-z]+)"\]/g)].map((m) => m[1]));
  // ⚠️ `SKINS` 덩어리만 본다. `{ id: … }` 로 훑으면 학생별 예외·학교급까지 배색으로 세어
  //    **검사가 스스로 거짓 실패**를 만든다 (실제로 그렇게 났다)
  const 덩어리 = (src.read.match(/export const SKINS = \[([\s\S]*?)\n\];/) ?? ["", ""])[1];
  const 화면 = [...덩어리.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
  ok(`배색이 다섯이다 (${화면.join(" · ") || "없음"})`, 화면.length === 5);
  const 없는 = 화면.filter((x) => !씨에스에스.has(x));
  ok("고를 수 있는 배색이 전부 globals.css 에 있다", 없는.length === 0,
     `${없는.join(" · ")} — 이름을 더해도 그 배색은 **안 먹는다**`);
  const 빠진 = [...씨에스에스].filter((x) => !화면.includes(x));
  ok("globals.css 에 있는 배색이 하나도 안 빠졌다", 빠진.length === 0, 빠진.join(" · "));

  ok("누르면 그 자리에서 바뀐다 (document.documentElement.dataset.skin)",
     /document\.documentElement\.dataset\.skin\s*=/.test(code.parts));
  ok("고른 것을 브라우저에 남긴다 (localStorage.setItem('skin'))",
     /localStorage\.setItem\(["']skin["']/.test(code.parts));
  ok("서버에 안 남긴다 (각자 고른다 — ㉖)",
     !/skin/i.test(code.actions) && !/skin/i.test((src.read.match(/export const SQL = \{[\s\S]*?\n\};/) ?? [""])[0]),
     "서버에 두면 원장님이 고른 배색이 아이 폰에도 간다");

  // ⚠️ 되살리기는 layout.js 에 **이미 있다.** 베끼면 한쪽만 고치는 날 흰 화면이 번쩍인다
  const layout = read("app/layout.js");
  ok("되살리기 한 줄이 app/layout.js 에 그대로 있다",
     /localStorage\.getItem\('skin'\)/.test(layout) && /dataset\.skin\s*=\s*s/.test(layout),
     "이 줄이 없으면 첫 그림이 흰 화면으로 번쩍인다");
  ok("설정 화면이 그 한 줄을 베끼지 않았다",
     !/dangerouslySetInnerHTML/.test(화면코드),
     "되살리기가 두 곳이 되면 한쪽만 고치는 날 배색이 어긋난다");
});

await sec("■ ⑤ 절 ㊶ — 진도 체크 켜고 끄기", async () => {
  ok("켤 때 **켠 날짜**를 DB 가 찍는다 (opened_on = v2.today())",
     /opened_on = v2\.today\(\)/.test(code.actions),
     "켠 날짜가 없으면 「12일째 열려 있습니다」를 못 센다 — 잊는 것을 막는 장치가 그것뿐이다");
  ok("⚠️ **이미 켜져 있으면 안 건드린다** (and is_open = false)",
     /where scope = 'academy' and is_open = false/.test(code.actions),
     "안 걸면 다시 누를 때마다 켠 날짜가 오늘로 새로 찍혀 「며칠째」가 영영 안 자란다");
  ok("켠 날짜를 지우지 않는다", !/opened_on\s*=\s*null/.test(code.actions),
     "지우면 「몇 일째」의 뿌리가 사라진다");
  ok("화면이 오늘 날짜를 지어내지 않는다 (DB 가 준 opened_on 을 받아 쓴다)",
     /openedOn/.test(code.parts) && /returning opened_on/.test(code.actions));
  ok("「언제까지」 칸이 없다 (날짜 자동 만료를 안 쓴다 — 원장님 확정)",
     !/until|expire|만료|언제까지/.test(code.actions) && !/until|expire|만료/.test(code.read),
     "날짜로 꺼지면 원장님이 「그 관리화면에서 on off 하고 싶어」 하신 것과 어긋난다");
  ok("학생별 예외가 세 낱말뿐이다 (follow · on · off)",
     /new Set\(\["follow", "on", "off"\]\)/.test(code.actions),
     "DB 의 검사 제약(0008)과 같은 낱말이어야 한다");
  ok("「지금 고칠 수 있나」를 화면에서 조합하지 않는다",
     !/mode === ["']follow["']\s*\?/.test(화면코드),
     "`v2.can_edit_progress()` 한 곳이 판정한다 — 조합하면 학생 화면과 두 벌이 된다");
});

await sec("■ ⑥ 절 ㊺-b — 교재 멈춤 고등 6주 · 중등 4주", async () => {
  ok("학교급이 셋뿐이다 (elem · middle · high)",
     /new Set\(\["elem", "middle", "high"\]\)/.test(code.actions));
  ok("주 수를 정수로만 받는다", /Number\.isInteger/.test(code.actions));
  ok("고등 6주 · 중등 4주가 화면 글에 있다",
     /고등 6주/.test(src.page) && /중등 4주/.test(src.page));
});

await sec("■ ⑦ 「표에 줄을 더하면 채워진다」는 착각을 안 만드는가 (계획 (e) ⑧)", async () => {
  /* ⚠️ 이 규칙의 뜻은 「**코드가 채우는 표**에 화면이 줄을 만들지 마라」다(계획 (e) ⑧) —
   *    만들어 봤자 그 갈래를 읽는 코드가 없으면 한 번도 안 돌고 「고쳤다」는 착각만 남는다.
   * ⚠️⚠️ `v2.role_access` 는 **그 반대다.** 원장님이 웹에서 정하시는 값이고
   *    (원장님 2026-09-03 「내가 웹상에서 설정 할 수 있게 해」), 채우는 것이 **화면의 일**이다.
   *    그래서 그 표만 뺀다 — **표 이름을 여기 손으로 적어 뺀 것**이라, 다른 표를 더하면 다시 빨개진다. */
  const 만드는표 = [...code.actions.matchAll(/insert\s+into\s+v2\.([a-z0-9_]+)/gi)].map((m) => m[1]);
  const 안될표 = 만드는표.filter((t) => t !== "role_access");
  ok("설정 화면이 **코드가 채우는 표**에는 줄을 안 만든다 (role_access 만 예외)",
     안될표.length === 0,
     `만드는 표: ${안될표.join(" · ")} — 갈래를 읽는 코드가 없으면 만들어도 한 번도 안 돈다`);
  ok("⚠️ 그 예외가 **원장님이 웹에서 정하시는 표** 하나뿐이다",
     만드는표.every((t) => t === "role_access"), 만드는표.join(" · "));
  ok("**채우는 것은 코드다**를 화면이 말한다", /채우는 것은 코드/.test(src.page));
  ok("지우는 자리가 없다 (대전제 6)", !/delete\s+from/i.test(code.actions));
});

await sec("■ ⑧ 대전제 12 — 비밀번호 자리가 없는가", async () => {
  ok("비밀번호를 바꾸거나 되돌리는 자리가 없다",
     !/password|비밀번호를 바꾸|resetPassword|updateUser/i.test(code.page + code.parts + code.actions + code.read),
     "설정에 그 단추가 서면 원장님이 아이 계정을 대신 만지게 되고 「누가 눌렀나」가 뜻을 잃는다");
  ok("왜 없는지를 화면이 말한다", /대전제 12/.test(src.page));
});

await sec("■ ⑨ 폰에서 깨질 자리", async () => {
  const reg = 대장();
  for (const [k, p] of Object.entries(FILES)) {
    const b = 어긴것(code[k]);
    ok(`${p} 가 규칙을 안 어긴다`, b.length === 0, b.join(" · "));
    const 모르는 = [...쓴클래스(code[k])].filter((c) => !reg.has(c));
    ok(`${p} 가 대장에 없는 클래스를 안 쓴다`, 모르는.length === 0, 모르는.join(" · "));
  }
  ok("표는 .tblwrap 안에 있다",
     (화면코드.match(/className="tbl"/g) ?? []).length ===
     (화면코드.match(/className="tblwrap"/g) ?? []).length);
  const mono = [...화면코드.matchAll(/className="mono"\s*>([^<]*)</g)].map((m) => m[1]);
  ok(`.mono 에 한글이 없다 (${mono.join(" · ") || "없음"})`, mono.every((t) => !/[가-힣]/.test(t)),
     "고정폭 글꼴에 한글이 없어 한 줄 안에서 글꼴이 갈린다 (오류 107)");
  ok("입력칸에 autoFocus 가 없다", !/autoFocus/.test(화면코드));
  ok("탭이 없다", !/role=["']tab/.test(화면코드) && !/searchParams/.test(화면코드),
     "탭 전환이 곧 화면 전체 재조회다");
});

/* ══════════════════════════════════════════════════════════════════════
 * 진짜 DB — 여기서부터는 DB 가 있어야 돈다
 * ══════════════════════════════════════════════════════════════════════ */

const 상한 = { 조회: 8 };
const 막힌것 = [];

let dbURL = null;
try { dbURL = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? null; }
catch { /* 없으면 아래에서 밝힌다 */ }

if (!dbURL) {
  console.log("\n■ ⚠️ DATABASE_URL 이 없어 **얕은 검사만** 돌았다");
  console.log("   조회 수·접근 규칙·SQL·쓰기는 **한 건도 못 봤다.** 초록을 믿지 마라.");
} else {
  process.env.DATABASE_URL ??= dbURL;
  const { Client } = await import("pg");
  const conn = async () => {
    const c = new Client({ connectionString: dbURL, ssl: { rejectUnauthorized: false },
                           connectionTimeoutMillis: 20000 });
    await c.connect(); return c;
  };
  const P = {
    원장:   "00000000-0000-4000-8000-000000000001",
    학생:   "00000000-0000-4000-8000-000000000003",
    학부모: "00000000-0000-4000-8000-000000000004",
  };
  const R = await import("../app/settings/read.js");
  /** 쓰는 SQL — 글자에서 뽑는다 (`actions.js` 는 "use server" 라 node 가 못 불러온다) */
  const WSQL = Object.fromEntries(
    [...src.actions.matchAll(/const (\w+) = `([^`]+)`/g)].map((m) => [m[1], m[2]]));

  await sec("\n■ ⑩ SQL 이 진짜 스키마에 붙는가 (읽기·쓰기 전부 PREPARE)", async () => {
    const c = await conn();
    try {
      const 목록 = [...Object.entries(R.SQL), ...Object.entries(WSQL)];
      // ⚠️ 「몇 개인가」로 세지 않는다 — 나중에 쓰는 자리가 하나 늘면 **멀쩡한 코드가 빨개진다.**
      //    봐야 할 것은 **아래에서 진짜로 돌려 볼 다섯이 다 뽑혔나**다
      const 있어야 = ["EDIT_ON", "STUDENT_MODE", "STOP_WEEKS", "TEMPLATE", "RULE"];
      const 빠진 = 있어야.filter((x) => !WSQL[x]);
      ok(`아래에서 돌려 볼 SQL 을 다 뽑았다 (${Object.keys(WSQL).join(" · ")})`,
         빠진.length === 0,
         `${빠진.join(" · ")} 를 못 뽑았다 — 못 뽑으면 아래 「진짜 쓰기」가 **아무것도 안 보고 초록이 된다**`);
      let i = 0;
      for (const [name, sql] of 목록) {
        i++;
        await c.query("begin");
        try { await c.query(`prepare 설정검사${i} as ${sql}`); ok(`${name} 가 진짜 스키마에 붙는다`, true); }
        catch (e) { ok(`${name} 가 진짜 스키마에 붙는다`, false, e.message.split("\n")[0]); }
        finally { await c.query("rollback"); }
      }
    } finally { await c.end(); }
  });

  let 잰것 = null;
  await sec("■ ⑪ 조회 수 — **진짜로 센다** (상한 조회 8)", async () => {
    const t0 = Date.now();
    const r = await R.readSettings(P.원장);
    const ms = Date.now() - t0;
    잰것 = r;
    ok(`원장으로 설정을 읽었다 (${r.why || "ok"})`, r.ok, r.why);
    console.log(`   · 조회 ${r.n}회 · ${ms}ms · 학생 ${r.value?.students?.length ?? "?"}명 · ` +
                `멈춤 ${r.value?.stop?.length ?? "?"}줄 · 문구 ${r.value?.msg?.length ?? "?"}줄 · ` +
                `규칙 ${r.value?.rules?.length ?? "?"}줄`);
    ok(`조회가 ${상한.조회} 안이다 (${r.n})`, r.n <= 상한.조회);
    ok("원장은 학생을 본다 (0명이면 아래 「학생은 0명」이 뜻이 없다)",
       (r.value?.students?.length ?? 0) > 0);
    ok("교재 멈춤 기본이 세 줄 다 있다", (r.value?.stop?.length ?? 0) === 3);
    const high = r.value?.stop?.find((x) => x.level === "high")?.weeks;
    const mid = r.value?.stop?.find((x) => x.level === "middle")?.weeks;
    console.log(`   · 지금 값 — 고등 ${high}주 · 중등 ${mid}주`);
  });

  await sec("■ ⑫ 접근 규칙 — 학생·학부모로 열면 학원 설정이 안 나오는가 (진짜로 열어 본다)", async () => {
    for (const who of ["학생", "학부모"]) {
      const r = await R.readSettings(P[who]);
      ok(`${who} 계정으로도 문은 열린다 (${r.why || "ok"})`, r.ok, r.why);
      if (!r.ok) continue;
      ok(`${who} 계정은 교재 멈춤 기본을 한 줄도 못 본다 (${r.value.stop.length}줄)`, r.value.stop.length === 0);
      ok(`${who} 계정은 문구를 한 줄도 못 본다 (${r.value.msg.length}줄)`, r.value.msg.length === 0);
      ok(`${who} 계정은 되풀이 규칙을 한 줄도 못 본다 (${r.value.rules.length}줄)`, r.value.rules.length === 0);
      ok(`${who} 계정은 학원 전체 학생 명단을 못 본다 (${r.value.students.length}명)`,
         r.value.students.length < (잰것?.value?.students?.length ?? 0),
         "학부모가 학원 전체 재원생 수를 셀 수 있으면 새는 것이다");
    }
    // ⚠️ 이것은 **일부러 열어 둔 것**이다 — 아이 화면이 「지금 내가 찍을 수 있나」를 알아야 한다
    console.log("   · 진도 체크 켬/끔은 누구나 읽는다 (v2.progress_edit 의 read_pe) — 일부러 그렇다");
  });

  await sec("■ ⑬ 쓰는 자리가 **진짜로 써지는가** (트랜잭션 안에서 하고 되돌린다)", async () => {
    const c = await conn();
    const 원장으로 = async (fn) => {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims',$1,true)",
                    [JSON.stringify({ sub: P.원장, role: "authenticated" })]);
      await c.query("set local role authenticated");
      try { return await fn(); }
      finally { await c.query("rollback"); }
    };
    const 써본다 = async (sql, params = []) => {
      try { const r = await c.query(sql, params); return { n: r.rowCount ?? 0, rows: r.rows, err: null }; }
      catch (e) { return { n: 0, rows: [], err: e.message.split("\n")[0] }; }
    };
    try {
      /* ⑤ 켠 날짜가 다시 켜도 안 덮이는가 — **이 검사가 이 화면의 핵심이다** */
      await 원장으로(async () => {
        const off = await 써본다("update v2.progress_edit set is_open = false where scope = 'academy'");
        if (off.err && /permission denied/i.test(off.err)) {
          막힌것.push("v2.progress_edit 에 authenticated 의 UPDATE 권한이 없다 → 켜기·끄기가 안 된다");
          console.log("   · ⚠️ 권한이 없어 진도 체크를 못 써 본다");
          return;
        }
        const on1 = await 써본다(WSQL.EDIT_ON);
        ok(`꺼진 것을 켤 수 있다 (${on1.err ?? on1.n + "줄"})`, !on1.err && on1.n === 1, on1.err);
        const 처음날 = on1.rows?.[0]?.opened_on ?? null;
        const on2 = await 써본다(WSQL.EDIT_ON);
        ok(`⚠️ **이미 켜져 있으면 0줄이다** (${on2.err ?? on2.n + "줄"}) — 켠 날짜가 안 덮인다`,
           !on2.err && on2.n === 0,
           "여기가 1줄이면 다시 누를 때마다 「며칠째」가 0 으로 되돌아간다");
        const 지금날 = (await 써본다(
          "select opened_on::text as d from v2.progress_edit where scope='academy'")).rows?.[0]?.d ?? null;
        ok(`켠 날짜가 그대로다 (${처음날} → ${지금날})`, 처음날 != null && 처음날 === 지금날);
      });

      /* 학생별 예외 */
      await 원장으로(async () => {
        const id = (await 써본다("select id from v2.students where state='active' limit 1")).rows?.[0]?.id;
        ok("학생 하나를 골랐다 (없으면 아래가 뜻이 없다)", Boolean(id));
        if (!id) return;
        const w = await 써본다(WSQL.STUDENT_MODE, [id, "on"]);
        ok(`학생별 진도 체크를 원장이 바꿀 수 있다 (${w.err ?? w.n + "줄"})`, !w.err && w.n === 1, w.err);
        const bad = await 써본다(WSQL.STUDENT_MODE, [id, "아무거나"]);
        ok("DB 도 모르는 값을 거절한다 (검사 제약)", Boolean(bad.err),
           "화면만 막으면 엑셀·SQL 로 들어오는 값이 그냥 들어간다");
      });

      /* 교재 멈춤 */
      await 원장으로(async () => {
        const w = await 써본다(WSQL.STOP_WEEKS, ["high", 6]);
        ok(`교재 멈춤 기본을 원장이 바꿀 수 있다 (${w.err ?? w.n + "줄"})`, !w.err && w.n === 1, w.err);
        // ⚠️ 화면은 0~52 로 막지만 **DB 에는 그 제약이 없다** — 있는 척하지 않고 재 본다
        const 넘김 = await 써본다(WSQL.STOP_WEEKS, ["high", 999]);
        if (!넘김.err && 넘김.n === 1)
          막힌것.push("v2.stop_rule.weeks 에 값 제약이 없다 (999 가 그냥 들어간다) → " +
                      "「고르는 값은 DB 에도 건다」(계획 (d)) 를 아직 못 지킨다. " +
                      "→ alter table v2.stop_rule add constraint stop_rule_weeks_ok check (weeks between 0 and 52);");
      });

      /* 문구·규칙 — **지금 0줄이라** 트랜잭션 안에서 한 줄 넣고 고쳐 본다 (죽은 칸을 잡으려고) */
      await 원장으로(async () => {
        const t = await 써본다(
          `insert into v2.msg_template(kind, title, body) values ('검사용', 'ㄱ', 'ㄴ') returning id`);
        ok(`문구 한 줄을 세웠다 (${t.err ?? "ok"})`, !t.err && t.rows.length === 1, t.err);
        if (t.rows?.[0]?.id) {
          const w = await 써본다(WSQL.TEMPLATE, [t.rows[0].id, "제목", "본문"]);
          ok(`문구를 고칠 수 있다 (${w.err ?? w.n + "줄"})`, !w.err && w.n === 1, w.err);
        }
        const r = await 써본다(
          `insert into v2.auto_rule(kind, name, cron) values ('검사용', '검사용 규칙', '매주') returning id`);
        ok(`되풀이 규칙 한 줄을 세웠다 (${r.err ?? "ok"})`, !r.err && r.rows.length === 1, r.err);
        if (r.rows?.[0]?.id) {
          const w = await 써본다(WSQL.RULE, [r.rows[0].id, JSON.stringify({ n: 3 }), true]);
          ok(`규칙의 임계값을 고칠 수 있다 (${w.err ?? w.n + "줄"})`, !w.err && w.n === 1, w.err);
        }
      });

      /* ⚠️ 되돌아갔는지 **확인한다.** 안 확인하면 검사가 진짜 자료를 바꿔 놓고 초록이 된다 */
      const 남은 = await 써본다(
        `select (select count(*) from v2.msg_template)::int m,
                (select count(*) from v2.auto_rule)::int a,
                (select is_open from v2.progress_edit where scope='academy') o`);
      console.log(`   · 되돌린 뒤 — 문구 ${남은.rows?.[0]?.m}줄 · 규칙 ${남은.rows?.[0]?.a}줄 · ` +
                  `진도 체크 ${남은.rows?.[0]?.o}`);
      ok("검사가 넣은 줄이 안 남았다 (rollback 이 진짜로 됐다)",
         남은.rows?.[0]?.m === 0 && 남은.rows?.[0]?.a === 0,
         "⚠️ 검사가 진짜 자료를 바꿔 놓았다");
    } finally { await c.end(); }
  });

  await sec("■ ⑭ 읽기 문이 한 글자도 못 쓰는가", async () => {
    const r = await R.openAs(P.원장, (db) =>
      db.query("update v2.stop_rule set weeks = 1 where false"));
    ok(`읽기 문이 쓰기를 막는다 (${String(r.why).split("—")[0].trim()})`,
       !r.ok && /셈은 DB 에 쓰지 않는다|read-only|읽기 전용/.test(r.why));
    const bad = await R.openAs("이건-uuid-가-아니다", (db) => db.query("select 1"));
    ok("UUID 가 아니면 문을 아예 안 연다", !bad.ok && /UUID/.test(bad.why));
  });
}

/* ══════════════════════════════════════════════════════════════════════
 * ⑮ 화면이 말한 「아직 안 쓰인다」가 **지금도 사실인가**
 *
 * ⚠️ 이 자리는 **버그에 기대는 검사가 아니다.** 화면에 적은 정직한 문장이 사실과
 *    어긋나는 날 빨개져서 **그 문장을 고치라고** 말한다. 기능을 막는 것이 아니다.
 * ══════════════════════════════════════════════════════════════════════ */
await sec("\n■ ⑮ 화면이 말한 「아직 안 쓰인다」가 지금도 사실인가", async () => {
  const { readdirSync } = await import("node:fs");
  const 훑기 = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") 훑기(p, out); }
      else if (p.endsWith(".js")) out.push(p);
    }
    return out;
  };
  const 파일 = [...훑기("lib"), ...훑기("app")].filter((p) => !p.startsWith("app/settings/"));

  const 멈춤 = 파일.filter((p) => /stop_rule/.test(코드만(readFileSync(p, "utf8"))));
  ok(`「교재 멈춤 값을 읽는 코드가 아직 없다」가 사실이다 (${멈춤.join(" · ") || "0곳"})`,
     멈춤.length === 0,
     "이제 읽는 곳이 생겼다 → app/settings/page.js 의 「이 값을 읽는 코드가 아직 없습니다」 를 지워라");
  ok("그 말이 화면에 적혀 있다", /이 값을 읽는 코드가 아직 없습니다/.test(src.page));

  // 치환 자리를 **채우는** 코드 — `lib/notify.js` 는 남아 있으면 **막기만** 한다
  const 채움 = 파일.filter((p) => /replace\([^)]*\\\{\\\{|\{\{\s*\w+\s*\}\}/.test(코드만(readFileSync(p, "utf8"))));
  ok(`「치환 자리를 채우는 코드가 아직 없다」가 사실이다 (${채움.join(" · ") || "0곳"})`,
     채움.length === 0,
     "이제 채우는 곳이 생겼다 → app/settings/page.js 의 「채우는 코드가 아직 한 곳도 없습니다」 를 고쳐라");
  ok("그 말이 화면에 적혀 있다", /채우는 코드가 아직 한 곳도 없습니다/.test(src.page));
});

console.log("\n■ 코드로는 못 고치는 것 (검사가 초록이어도 아래가 남으면 화면이 제대로 안 산다)");
막힌것.length ? 막힌것.forEach((x) => console.log(`   ⚠️ ${x}`))
             : console.log("   ✅ 없음");

console.log(`\n■ 설정 검사 ${n}건 · 실패 ${fail} · 못 고치는 것 ${막힌것.length}건`);
if (!dbURL) console.log("   ⚠️ DB 없이 돌았다 — 조회 수·접근 규칙·쓰기는 안 봤다");
process.exit(fail ? 1 : 0);
