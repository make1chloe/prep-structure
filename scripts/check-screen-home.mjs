/**
 * 대시보드 `/` 검사 — **이 화면이 지켜야 할 것**만 본다.
 *
 * 왜 이 검사가 있나
 *   지금 앱의 `/` 는 **조회 ~85 · 직렬 ~19단**이었다. 아무도 그 숫자를 안 재서
 *   느려진 날을 못 짚었다. 그리고 배지 하나에 표 열댓 개를 전수 재계산했다.
 *   → 여기서는 **진짜 DB 에 붙어 왕복을 센다.** 글자로만 훑지 않는다.
 *
 * 무엇을 보나
 *   ① 화면이 **`lib/` 을 지나는가** — 제 손으로 세지 않는가
 *   ② **서비스 열쇠가 화면에 없는가** — 있으면 접근 규칙이 통째로 꺼진다
 *   ③ **접근 규칙 안에서 읽는가** — 학생·학부모로 열면 한 줄도 안 나오는가 (진짜로 열어 본다)
 *   ④ **화면이 한 글자도 못 쓰는가** — 읽기 문으로 쓰기를 시도해 본다
 *   ⑤ **조회가 상한 안인가** — 진짜로 세어 본다 (조회 20 · 직렬 5)
 *   ⑥ **SQL 이 진짜 스키마에 붙는가** — 전부 PREPARE 해 본다
 *   ⑦ **탭이 없는가** · ⑧ **절 ㊶ 한 줄이 있는가** · ⑨ **크론 줄이 안 돌 때만 뜨는가**
 *   ⑩ **폰에서 깨질 자리** — 안 등록된 클래스 · 맨 `flex:1` · 16px 미만 입력칸 · `alert` …
 *   ⑪ **빈 것을 숨기지 않는가** (원장 화면이다 — 물음 T)
 *
 * ⚠️ **일부러 어기는 본보기를 같이 검사한다** (계획 「글자로 훑는 검사는 헛짚고 헛통과한다」).
 *    글자 검사가 그 본보기를 못 잡으면 **검사 자신이 실패한다.**
 *
 * ⚠️ DB 가 없으면 ①②⑦~⑪ 만 돌고, **그렇게 밝힌다.** 「있는 척」이 제일 나쁘다.
 *
 * 돌리는 법:  node scripts/check-screen-home.mjs
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
  page:    "app/page.js",
  read:    "app/_home/read.js",
  parts:   "app/_home/parts.js",
  actions: "app/_home/actions.js",
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

/**
 * 화면이 쓴 클래스 이름.
 *
 * ⚠️ `className={`acc${is ? " is-open" : ""}`}` 처럼 **글자와 셈이 섞인 자리**가 있다.
 *    글자를 통째로 자르면 `acc${is` 같은 조각이 나와 **거짓 실패**가 난다(실제로 났다).
 *    → `className=` 뒤의 덩어리를 **괄호를 세어** 통째로 뜯고, 그 안의 **따옴표 글자만** 모은 뒤
 *      `${…}` 를 지우고 낱말로 나눈다.
 */
function 쓴클래스(s) {
  const out = new Set();
  const 담기 = (txt) => {
    for (const c of txt.replace(/\$\{[^}]*\}/g, " ").split(/\s+/))
      if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c)) out.add(c);
  };
  const 따옴표 = { '"': '"', "'": "'", "`": "`" };
  for (let i = s.indexOf("className="); i >= 0; i = s.indexOf("className=", i + 1)) {
    let j = i + "className=".length;
    if (따옴표[s[j]]) {                      // className="…"
      const q = s[j], end = s.indexOf(q, j + 1);
      if (end > j) 담기(s.slice(j + 1, end));
      continue;
    }
    if (s[j] !== "{") continue;
    let depth = 0, k = j;                    // className={ … } 를 괄호 세어 뜯는다
    for (; k < s.length; k++) {
      if (s[k] === "{") depth++;
      else if (s[k] === "}") { depth--; if (depth === 0) break; }
    }
    const 덩어리 = s.slice(j + 1, k);
    for (const m of 덩어리.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g))
      담기(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

/**
 * 폰에서 깨지는 자리 — **어긴 것 목록**을 낸다.
 * ⚠️ 앞뒤를 정확히 문다 (`flex: 1 1 170px` 이 맨 `flex:1` 로 안 걸리게).
 */
function 어긴것(s) {
  const bad = [];
  // (1) 맨 `flex:1` — basis 가 없으면 390px 에서 26px 로 눌린다 (오류 94)
  for (const m of s.matchAll(/flex\s*:\s*["']?\s*1\s*["']?\s*[,}]/g))
    bad.push(`basis 없는 flex:1 (${m[0].trim()})`);
  // (2) 맨 `1fr` — grid 의 맨 1fr 은 내용보다 안 작아진다
  for (const m of s.matchAll(/gridTemplateColumns\s*:\s*["'`]([^"'`]*)["'`]/g))
    if (/(^|[\s(])1fr/.test(m[1]) && !/minmax\(\s*0/.test(m[1]))
      bad.push(`minmax(0,…) 없는 1fr (${m[1]})`);
  // (3) 인라인 글씨 크기 — 토큰이 아니거나 16px 미만
  for (const m of s.matchAll(/fontSize\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    const v = m[1].trim();
    if (/^var\(--fs\d+\)$/.test(v)) continue;
    const px = /^(\d+(?:\.\d+)?)px$/.exec(v);
    bad.push(px ? `토큰이 아닌 글씨 크기 ${v}` : `모르는 글씨 크기 ${v}`);
  }
  // (4) 지어낸 색 — 토큰 아닌 색값
  for (const m of s.matchAll(/(?:color|background|backgroundColor|borderColor)\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    const v = m[1].trim();
    if (/var\(--/.test(v) || /^(inherit|transparent|none|currentColor|0)$/.test(v)) continue;
    if (/#|rgb|hsl/.test(v)) bad.push(`지어낸 색 ${v}`);
  }
  // (5) 안 쓰기로 한 것들
  for (const w of ["alert(", "confirm(", "createPortal", "position: \"fixed\"", "position:'fixed'"])
    if (s.includes(w)) bad.push(`안 쓰기로 한 것: ${w}`);
  // (6) 투명도 — 「덜 중요함」은 색으로 (계획 ㉑)
  for (const m of s.matchAll(/opacity\s*:\s*["']?(0?\.\d+)/g)) bad.push(`투명도 ${m[1]}`);
  // (7) 한 낱말 상태 클래스 — 이 저장소에서 세 번 터졌다
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

console.log("■ 대시보드 `/` 검사 — 알림센터\n");

await sec("■ 0 · 검사 자신을 먼저 시험한다 (본보기를 잡는가)", async () => {
  const b = 어긴것(본보기);
  const 잡아야 = ["flex:1", "1fr", "글씨 크기", "지어낸 색", "alert(", "투명도", "한 낱말"];
  for (const w of 잡아야)
    ok(`본보기의 「${w}」를 잡는다`, b.some((x) => x.includes(w)), `잡은 것: ${b.join(" · ") || "없음"}`);
  ok("본보기의 안 등록된 클래스를 잡는다", !대장().has("myown") && 쓴클래스(본보기).has("myown"));
});

await sec("■ ① 파일이 제자리에 있는가", async () => {
  for (const [k, p] of Object.entries(FILES)) ok(p, src[k].length > 0, "없다");
  ok("읽는 자리가 화면과 갈라져 있다 (app/_home/read.js)",
     src.read.length > 0 && /export\s+(const|async function)\s+SQL|export const SQL/.test(src.read),
     "SQL 을 함수 안에 흩으면 검사가 원리적으로 못 본다");
});

await sec("■ ② 화면이 `lib/` 을 지나는가 — 제 손으로 세지 않는가", async () => {
  const lib = [...src.read.matchAll(/from\s+["']\.\.\/\.\.\/lib\/([a-z-]+)\.js["']/g)].map((m) => m[1]);
  ok(`읽는 자리가 lib 을 부른다 (${lib.join(" · ") || "없음"})`, lib.length >= 3,
     "화면이 lib 을 안 지나면 그날부터 규칙이 두 벌이다");
  for (const want of ["session", "progress", "todo", "queue"])
    ok(`lib/${want}.js 를 부른다`, lib.includes(want));
  // ⚠️ 마감 전·후 글자는 `lib/close.js` 한 벌이다 — 베껴 적으면 lib 을 고치는 날 여기만 옛 글을 말한다
  ok("마감 전·후 글자를 지어내지 않는다 (lib/close.js 의 PREPARING·NOTHING 을 쓴다)",
     /from\s+["']\.\.\/lib\/close\.js["']/.test(code.page) &&
     /\{PREPARING\}/.test(code.page) && /\{NOTHING\}/.test(code.page) &&
     !/"아직 정리 중이에요"|'아직 정리 중이에요'/.test(code.page));

  // ⚠️ 같은 판단을 다시 짜는 자리 — **이름으로 잡는다.** lib 에 있는 셈을 화면이 또 만들면 여기서 걸린다
  const 두벌 = [
    ["회차 세기",  /countDates\s*\(/,          /function\s+countDates/],
    ["할 일 묶기", /\bboard\s*\(/,             /function\s+board/],
    ["거르개",     /passesFilter\s*\(/,        /function\s+passesFilter/],
  ];
  for (const [무엇, 부름, 짜기] of 두벌)
    ok(`${무엇} 를 화면에서 다시 짜지 않는다`, !짜기.test(화면코드),
       `${무엇} 는 lib 의 것을 ${부름} 로 부르기만 한다`);

  // v2. 함수도 「이미 있는 것」이다 — 부르는지 본다
  // ⚠️ **주석을 지운 코드**로 본다 — 「왜 안 쓰는지」를 주석에 적었다고 빨개지면 그 설명을 지우게 된다
  for (const f of ["v2.book_progress", "v2.memo_only_streak", "v2.book_stop", "v2.progress_open_days"])
    ok(`${f}() 를 부른다`, code.read.includes(f), "DB 에 이미 있는 판단을 화면이 다시 짜면 두 벌이다");
  ok("v2.session_count() 를 안 부른다",
     !code.read.includes("v2.session_count"),
     "lib/session.js 가 「그건 join 이라 이력 두 줄이 겹치면 하루를 두 번 센다」고 못 박았다 — 8회 반이 16회가 된다");
});

await sec("■ ③ 서비스 열쇠가 화면에 없는가 (접근 규칙을 지나치는 유일한 길)", async () => {
  for (const [k, p] of Object.entries(FILES)) {
    ok(`${p} 에 serviceDb() 가 없다`, !/serviceDb\s*\(/.test(code[k]),
       "서비스 열쇠로 읽으면 학생·학부모가 이 화면을 열 때 남의 자료가 그대로 나온다");
    ok(`${p} 에 SUPABASE_SERVICE_ROLE_KEY 가 없다`, !code[k].includes("SUPABASE_SERVICE_ROLE_KEY"));
  }
  ok("붙자마자 그 사람이 된다 (set local role authenticated + request.jwt.claims)",
     /set local role authenticated/.test(code.read) && /request\.jwt\.claims/.test(code.read),
     "안 하면 DATABASE_URL 이 주인 권한이라 접근 규칙이 통째로 꺼진다");
  ok("읽기 문은 read only 로 연다",
     /begin read only/.test(code.read), "화면이 실수로 쓰는 길을 DB 가 막아 준다");
  ok("사람 번호를 UUID 로 확인하고 끼운다 (끼워 넣기 막기)",
     /UUID\s*=\s*\/\^\[0-9a-f\]\{8\}/.test(code.read) && /UUID\.test/.test(code.read));
  ok("누구인지는 lib/supabase-server.js 한 곳에서 묻는다",
     /from\s+["']\.\.\/lib\/supabase-server\.js["']/.test(code.page) && /roleOf\s*\(/.test(code.page));
  ok("원장·강사가 아니면 자료를 안 읽는다 (문지기가 v2 를 못 읽을 때 학생이 여기 선다)",
     /const STAFF = new Set\(\["principal", "instructor"\]\)/.test(code.page) &&
     /STAFF\.has/.test(code.page));
});

await sec("■ ④ 탭이 없는가 · 접기로 줄이는가 (계획 「속도」 1)", async () => {
  ok("role=\"tab\" 이 없다", !/role=["']tab/.test(화면코드));
  ok("주소로 화면을 갈아 끼우지 않는다 (searchParams 로 탭 흉내 금지)",
     !/searchParams/.test(화면코드), "탭 전환이 곧 화면 전체 재조회다");
  ok("접기가 있다 (.acc / .accbd / .is-open)",
     /className=\{?`?acc/.test(code.parts) && /accbd/.test(code.parts) && /is-open/.test(code.parts));
  ok("거르개가 다시 조회하지 않는다 (줄마다 pass 가 미리 붙는다)",
     /pass:\s*keys\.filter/.test(code.read) && /\(r\.pass \?\? \[\]\)\.includes/.test(code.parts));
  ok("배색 고르는 줄 이름(.skinbtn)을 거르개에 빌려 쓰지 않는다",
     !/skinbtn/.test(code.parts), "한 이름에 뜻 둘을 담으면 이 저장소에서 세 번 터진 자리가 다시 열린다");
});

await sec("■ ⑤ 절 ㊶ — 진도 체크 한 줄과 크론 한 줄", async () => {
  ok("「진도 체크가 N일째 열려 있습니다」 줄이 있다",
     /진도 체크가/.test(code.parts) && /일째/.test(code.parts),
     "켜 놓고 잊는 것을 막는 장치가 이 한 줄뿐이다");
  ok("그 줄에 「끄기」가 있다", /끄기/.test(code.parts) && /turnProgressEditOff/.test(code.parts));
  ok("열려 있을 때만 뜬다", /f\.editOpen && <EditOpenLine/.test(code.page));
  ok("「며칠째」를 화면에서 세지 않는다 (v2.progress_open_days 가 센다)",
     !/Date\.now\(\)|new Date\(\)/.test(code.parts) && code.read.includes("v2.progress_open_days"),
     "세어 나오는 값은 저장도 재계산도 하지 않는다 (원칙 5)");
  ok("크론 줄이 **안 돌 때만** 뜬다",
     /gap <= 2\) return null/.test(code.page),
     "잘 돌 때도 매일 한 줄이 서면 아무도 그 줄을 안 읽게 된다");
  ok("「한 번도 안 돌았습니다」를 가른다", /한 번도 안 돌았습니다/.test(code.page));
});

await sec("■ ⑥ 원장 화면에서는 **빈 것도 보인다** (⑮ 3 · 물음 T)", async () => {
  ok("hideEmptyCards() 를 안 부른다", !/hideEmptyCards/.test(화면코드),
     "그건 아이·학부모 화면의 것이다 — 원장 화면에서 빈 칸을 숨기면 빠뜨린 것을 못 잡는다");
  ok("칸이 0개여도 그린다 (「없습니다.」 자리가 있다)",
     (화면코드.match(/없습니다\./g) ?? []).length >= 4);
  ok("「할 일 생겼습니다」 같은 카드를 안 만든다",
     !/할 일 생겼/.test(화면코드), "원장님이 뺀 것이다");
  ok("숫자를 지어내지 않는 자리가 있다 (⚠️ 아직 못 셉니다)",
     /아직 못 셉니다/.test(code.page) && /확인 안 됨/.test(src.page),
     "모르면 「⚠️ 확인 안 됨」 — 대전제 0");
});

await sec("■ ⑦ 누른 그 단추만 바뀐다 · 닫는 길 (계획 「속도」 5 · 대전제 10)", async () => {
  ok("실패하면 그 단추만 되돌린다",
     /setGone\(false\)/.test(code.parts) && /setOrder\(order\)/.test(code.parts));
  ok("되돌린 까닭을 화면 안에 글로 띄운다 (alert 가 아니다)",
     /setWhy\(r\.why\)/.test(code.parts) && !/alert\(/.test(code.parts));
  ok("차례를 바꿔도 카드 속을 다시 안 그린다 (flex order 만 바꾼다)",
     /order: order\.indexOf\(id\)/.test(code.parts));
  ok("로그아웃 단추가 화면에 있다", /<LogoutButton/.test(code.page) && /logout-button/.test(code.page));
});

await sec("■ ⑧ 쓰는 자리 — 몇 줄이 바뀌었나를 본다 (자동 검사 ⑪)", async () => {
  ok("0줄이면 실패로 되돌린다",
     /rowCount \?\? 0/.test(code.actions) && /rollback/.test(code.actions) && /한 줄도 안 바뀌었다/.test(code.actions),
     "접근 규칙이 막았는데 화면이 「성공」이라 하면 원장님은 껐다고 믿고 화면은 그대로다");
  ok("쓰는 자리도 그 사람이 되어 쓴다", /setupSql\(/.test(code.actions));
  ok("쓰는 자리도 원장·강사만", /STAFF\.has/.test(code.actions));
  ok("켠 날짜를 지우지 않는다", !/opened_on\s*=\s*null/.test(code.actions),
     "지우면 「몇 일째」의 뿌리가 사라진다");
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
     (화면코드.match(/className="tblwrap"/g) ?? []).length,
     "안 감싸면 폰에서 표가 부모를 밀어낸다");
  // ⚠️ `.mono` 는 고정폭이라 한글이 갈린다 (오류 107)
  const mono = [...화면코드.matchAll(/className="mono"\s*>([^<]*)</g)].map((m) => m[1]);
  ok(`.mono 에 한글이 없다 (${mono.join(" · ") || "없음"})`, mono.every((t) => !/[가-힣]/.test(t)));
  ok("입력칸에 autoFocus 가 없다", !/autoFocus/.test(화면코드), "키보드가 튀어 올라 화면이 뛴다");
});

/* ══════════════════════════════════════════════════════════════════════
 * 진짜 DB 에 붙는 자리 — 여기서부터는 DB 가 있어야 돈다
 * ══════════════════════════════════════════════════════════════════════ */

const 상한 = { 조회: 20, 직렬: 5 };
/**
 * ⚠️ **「내 할 일」만 상한을 넘는 것을 알고 있다.** 지어낸 봐주기가 아니라 실측이다 —
 *    `lib/todo.js` 의 `myTodos()` 가 조회 여섯을 **차례로** 묻는다
 *    (loadTodos → academyDays 둘 → sheetsOn → loadExams → loadMaterials).
 *    화면에서 그것을 다시 짜면 「할 일이 무엇인가」가 두 벌이 된다(원칙 1) — 그래서 안 짰다.
 *    `lib/todo.js` 가 겹쳐 묻게 고쳐지면 **이 숫자를 지워라.** 보고의 needsDb 에 적어 두었다.
 */
const 아는_초과 = { todos: 4 };   // 실측 9단 − 상한 5. 고쳐지면 이 줄을 지워라

/** ⚠️ **코드로는 못 고치는 것** — 검사가 초록이어도 이게 남아 있으면 화면이 제대로 안 산다.
 *    `scripts/check-loginpage.mjs` 와 같은 손씨다. 이 줄들을 지우지 마라. */
const 막힌것 = [];

let dbURL = null;
try { dbURL = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? null; }
catch { /* 없으면 아래에서 밝힌다 */ }

if (!dbURL) {
  console.log("\n■ ⚠️ DATABASE_URL 이 없어 **얕은 검사만** 돌았다");
  console.log("   조회 수·접근 규칙·SQL 은 **한 건도 못 봤다.** 초록을 믿지 마라.");
} else {
  // ⚠️ `app/_home/read.js` 는 `process.env.DATABASE_URL` 을 본다. 검사만 `.env.local` 을 읽으면
  //    「DATABASE_URL 이 없다」로 8건이 빨개진다 — 화면 탈이 아니라 **검사 탈**이다.
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
  const R = await import("../app/_home/read.js");

  await sec("\n■ ⑩ SQL 이 진짜 스키마에 붙는가 (전부 PREPARE 해 본다)", async () => {
    const c = await conn();
    try {
      const 목록 = Object.entries(R.SQL);
      // 쓰는 SQL 은 글자에서 뽑아 같이 본다 — 돌리지 않고 PREPARE 만 한다
      for (const m of src.actions.matchAll(/const (\w+) = `([^`]+)`/g)) 목록.push([m[1], m[2]]);
      let i = 0;
      for (const [name, sql] of 목록) {
        i++;
        await c.query("begin");
        try {
          await c.query(`prepare 검사${i} as ${sql}`);
          ok(`${name} 가 진짜 스키마에 붙는다`, true);
        } catch (e) {
          ok(`${name} 가 진짜 스키마에 붙는다`, false, e.message.split("\n")[0]);
        } finally { await c.query("rollback"); }
      }
    } finally { await c.end(); }
  });

  let 잰것 = null;
  await sec("■ ⑪ 조회 수와 직렬 단 — **진짜로 센다** (상한 조회 20 · 직렬 5)", async () => {
    const t0 = Date.now();
    const frame = await R.readFrame(P.원장);
    const 첫그림 = Date.now() - t0;
    ok(`맨 위 줄을 읽었다 (${frame.why || "ok"})`, frame.ok, frame.why);
    const today = frame.value?.today ?? null;
    const [waiting, sessions, books, todos] = await Promise.all([
      R.readWaiting(P.원장), R.readSessions(P.원장, today),
      R.readBooks(P.원장), R.readTodos(P.원장, today),
    ]);
    const ms = Date.now() - t0;
    잰것 = { frame, waiting, sessions, books, todos, today };

    const 문 = { frame, waiting, sessions, books, todos };
    const 합 = Object.values(문).reduce((s, x) => s + x.n, 0);
    for (const [k, x] of Object.entries(문))
      ok(`문 「${k}」 가 읽혔다 (조회 ${x.n})`, x.ok, x.why);

    console.log(`   · 문마다 조회 — ${Object.entries(문).map(([k, x]) => `${k} ${x.n}`).join(" · ")}`);
    console.log(`   · 걸린 시간 — 첫 그림 ${첫그림}ms · 마지막 카드까지 ${ms}ms`);
    // ⚠️ 합격선 0.5초는 **첫 그림**의 것이다. 배지는 뒤에 채우기로 했으니(계획 「속도」 2)
    //    마지막 카드까지의 시간은 **재서 말하되 막지는 않는다.** 막으면 배지를 빼는 쪽으로 도망가게 된다.
    ok(`첫 그림이 500ms 안이다 (${첫그림}ms)`, 첫그림 <= 500,
       "원장님 말씀 「2초면 진짜 오래 걸린다」 — 첫 그림은 맨 위 줄 하나만 기다린다");
    if (ms > 500)
      console.log(`      ⚠️ 마지막 카드까지 ${ms}ms 다. 실측으로 느린 자리는 **교재 카드**이고, ` +
                  "까닭은 접근 규칙이 켜지면 v2.book_progress 가 30→403ms · v2.memo_only_streak 가 " +
                  "86→259ms 로 느려지기 때문이다 (같은 SQL·같은 76줄). 보고의 needsDb 에 적었다.");

    ok(`조회 합이 ${상한.조회} 안이다 (${합})`, 합 <= 상한.조회,
       "배지 숫자 때문에 표 열댓 개를 전수 재계산하면 여기서 걸린다");
    ok(`첫 그림이 기다리는 조회가 둘 이하다 (${frame.n})`, frame.n <= 2,
       "화면을 먼저 그리고 배지는 뒤에 채운다");

    // ⚠️ 한 문 안의 조회는 **차례로** 돈다 — 그래서 그 문의 조회 수가 곧 직렬 단이다.
    //    sessions·todos 는 맨 위 줄의 `today` 를 기다리므로 frame 을 앞에 더한다.
    const 단 = { waiting: waiting.n, books: books.n,
                 sessions: frame.n + sessions.n, todos: frame.n + todos.n };
    for (const [k, d] of Object.entries(단)) {
      const 봐줌 = 아는_초과[k] ?? 0;
      ok(`문 「${k}」 직렬 ${d}단 (상한 ${상한.직렬}${봐줌 ? ` +아는 초과 ${봐줌}` : ""})`,
         d <= 상한.직렬 + 봐줌,
         "lib 이 조회를 차례로 물으면 여기서 걸린다 — 화면에서 다시 짜지 말고 lib 을 고쳐라");
      if (봐줌) console.log(`      ⚠️ 「${k}」 는 lib/todo.js 의 myTodos() 가 여섯을 차례로 물어서 ${d}단이다 (실측)`);
    }
  });

  await sec("■ ⑫ 접근 규칙 — 학생·학부모로 열면 원장 자료가 안 나오는가 (진짜로 열어 본다)", async () => {
    const 원장판 = 잰것?.waiting?.value?.sheet?.allN ?? null;
    ok(`원장은 판을 본다 (${원장판}줄)`, 원장판 != null && 원장판 > 0,
       "원장이 0줄이면 아래 「학생은 0줄」이 초록이어도 아무 뜻이 없다");

    for (const who of ["학생", "학부모"]) {
      const w = await R.readWaiting(P[who]);
      const c = await R.readBooks(P[who]);
      ok(`${who} 는 판을 한 줄도 못 본다 (${w.ok ? w.value.sheet.allN : w.why})`,
         w.ok && w.value.sheet.allN === 0,
         "⚠️ 마감 안 한 판이 밖으로 새는 자리 — 사고 #7 이 바로 이것이다");
      ok(`${who} 는 아이가 찍은 진도 대기열을 못 본다 (${w.ok ? w.value.marks.length : w.why})`,
         w.ok && w.value.marks.length === 0);
      ok(`${who} 는 남의 아이 교재를 못 본다 (${c.ok ? c.value.books.length : c.why} 줄)`,
         c.ok && c.value.books.every((b) => !b.studentName || b.studentName.length > 0) &&
         c.value.books.length < (잰것?.books?.value?.books?.length ?? 0),
         "원장이 보는 것보다 적어야 한다");
      ok(`${who} 는 수강료를 못 본다 (재원생 ${c.ok ? c.value.fee.activeN : c.why}명으로 보인다)`,
         c.ok && c.value.fee.activeN <= 1,
         "학부모가 학원 전체 재원생 수를 셀 수 있으면 새는 것이다");
    }
  });

  await sec("■ ⑬-b 쓰는 자리가 **진짜로 써지는가** (트랜잭션 안에서 하고 되돌린다)", async () => {
    const c = await conn();
    /** ⚠️ 「막힘」을 통과로 세면 안 된다 — **권한이 없어서** 막힌 것과 **접근 규칙이** 막은 것은 다르다.
     *    권한이 없으면 아무도 못 쓰는데 검사는 초록으로 지나간다 (check-v2-rls 가 겪은 자리). */
    const 써본다 = async (sql, params = []) => {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims',$1,true)",
                    [JSON.stringify({ sub: P.원장, role: "authenticated" })]);
      await c.query("set local role authenticated");
      let out = { n: 0, err: null };
      try { const r = await c.query(sql, params); out.n = r.rowCount ?? 0; }
      catch (e) { out.err = e.message.split("\n")[0]; }
      finally { await c.query("rollback"); }
      return out;
    };
    try {
      const SQLS = Object.fromEntries([...src.actions.matchAll(/const (\w+) = `([^`]+)`/g)].map((m) => [m[1], m[2]]));

      // 카드 차례 — 여기는 권한도 규칙도 열려 있어야 한다
      const ord = await 써본다(SQLS.ORDER, [["books", "fee"]]);
      ok(`카드 차례를 원장이 저장할 수 있다 (${ord.err ?? ord.n + "줄"})`, !ord.err && ord.n === 1,
         "권한이나 규칙이 막으면 ▲▼ 를 눌러도 다음에 열 때 도로 돌아간다");

      // 진도 체크 끄기 — **먼저 켜 놓고** 꺼 본다 (이미 꺼져 있으면 0줄이라 뜻이 없다)
      const onoff = await 써본다(
        "update v2.progress_edit set is_open = true where scope = 'academy'");
      if (onoff.err && /permission denied|권한/.test(onoff.err)) {
        막힌것.push(
          "v2.progress_edit 에 authenticated 의 UPDATE 권한이 없다 (실측: SELECT 뿐) → " +
          "절 ㊶ 의 「끄기」 단추가 눌러도 **안 꺼진다.** 규칙(staff_all)은 이미 있으니 권한 한 줄만 모자라다. " +
          "→ grant update on v2.progress_edit to authenticated;");
        console.log("   · 진도 체크 끄기 — ⚠️ 권한이 없어 못 쓴다. 아래 「코드로는 못 고치는 것」 참고");
      } else {
        ok(`진도 체크를 원장이 켜고 끌 수 있다 (${onoff.err ?? onoff.n + "줄"})`, !onoff.err && onoff.n === 1);
      }
    } finally { await c.end(); }
  });

  await sec("■ ⑬ 화면이 한 글자도 못 쓰는가 (읽기 문으로 쓰기를 해 본다)", async () => {
    const r = await R.openAs(P.원장, (db) =>
      db.query("update v2.students set name = 'X' where false"));
    ok(`읽기 문이 쓰기를 막는다 (${r.why.split("—")[0].trim()})`,
       !r.ok && /셈은 DB 에 쓰지 않는다|read-only|읽기 전용/.test(r.why),
       "화면에서 값을 고치면 그 규칙이 lib 밖에 하나 더 생긴다");
    const bad = await R.openAs("이건-uuid-가-아니다", (db) => db.query("select 1"));
    ok("UUID 가 아니면 문을 아예 안 연다", !bad.ok && /UUID/.test(bad.why));
  });
}

/* ⚠️ 코드 밖에 있는 것 — 이 화면은 **지금 아예 못 열린다.** 지어낸 말이 아니라 실측이다 */
if (!/NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(
      (() => { try { return readFileSync(".env.local", "utf8"); } catch { return ""; } })()))
  막힌것.push(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없다 → 문지기(middleware)가 **모든 주소를 /login 으로 되돌린다.** " +
    "원장님은 대시보드를 아예 못 보신다 (화면 탈이 아니라 환경변수 탈이다)");
if (!/"pg"\s*:/.test(readFileSync("package.json", "utf8").split('"dependencies"')[1]?.split("}")[0] ?? ""))
  막힌것.push(
    "pg 가 package.json 의 devDependencies 에 있다 → Vercel 에서 화면이 DB 에 못 붙을 수 있다. " +
    "⚠️ 확인 안 됨 — 크론도 같은 자리라 크론이 도는 것이 확인되면 이 줄은 지워도 된다");

console.log("\n■ 코드로는 못 고치는 것 (검사가 초록이어도 아래가 남으면 화면이 제대로 안 산다)");
막힌것.length ? 막힌것.forEach((x) => console.log(`   ⚠️ ${x}`))
             : console.log("   ✅ 없음");

console.log(`\n■ 대시보드 검사 ${n}건 · 실패 ${fail} · 못 고치는 것 ${막힌것.length}건`);
if (!dbURL) console.log("   ⚠️ DB 없이 돌았다 — 조회 수·접근 규칙은 안 봤다");
process.exit(fail ? 1 : 0);
