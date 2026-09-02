/** 로그인 화면 검사 — **글자로만 훑지 않고 판단을 실제로 돌린다.**
 *
 *  보는 것
 *    ① 파일 다섯이 제자리에 있는가
 *    ② `@chloe-eng.internal` 이 **lib/auth.js 밖에 없는가** (화면이 직접 붙이면 실패)
 *    ③ 아이디→이메일 판단을 **lib/auth.js 에서 부르는가** (제 손으로 짓지 않는가)
 *    ④ ⚠️ 대전제 12 — 비밀번호를 만들거나 바꾸거나 초기화하는 자리가 **하나도 없는가**
 *    ⑤ ⚠️ 폰 규칙 — 입력 16px 이상 · autoFocus 없음 · fixed 잠금 · pushState · portal · alert 없음
 *    ⑥ 역할→첫 화면 표가 **한 벌인가** (`/parent`·`/me` 가 lib 밖에 박혀 있지 않은가 — 원칙 1)
 *    ⑦ `homeFor` 를 **돌려서** 본다 — 모르는 역할·`__proto__` 함정 포함
 *    ⑧ 가짜 Supabase 를 끼워 `roleById` 를 돌린다 — 못 읽을 때 **역할을 지어내지 않는가**
 *    ⑨ 문지기 짜임 — 비켜 갈 것들 · 쿠키 옮겨 싣기 · 고리 방지
 *    ⑩ **진짜 DB 로** — v2.profiles 의 role 값이 내 표와 같은가
 *    ⑪ ⚠️ **진짜 `middleware()` 를 노드로 돌린다** — 2026-09-02 에 잡힌 사고 셋을 그대로 재현한다
 *    ⑫ 화면 글이 **실측과 어긋나지 않는가** (지어낸 까닭 · 예외 빠진 아이디 규칙)
 *    ⑬ ⚠️ **닫는 길** — 로그인한 사람이 서는 화면마다 로그아웃 단추가 있는가 (대전제 10)
 *    ⑭ `homeFor` 의 null 이 주소로 새지 않는가 (부르는 자리마다 `knownRole` 로 먼저 가르는가)
 *
 *  ⚠️ 이 검사가 초록이어도 **지금 로그인은 실제로 안 된다.** 코드 밖의 두 가지가 비어 있다.
 *     끝에 「■ 코드로는 못 고치는 것」 으로 매번 세워 준다 — 그 줄을 지우지 마라.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { HOME, homeFor, knownRole, keys, roleById, SCHEMA } from "../lib/supabase-server.js";

let fail = 0, n = 0;
const ok = (t, c, why = "") => {
  n++;
  if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
  else console.log(`   ✅ ${t}`);
};

/** ⚠️ 한 자리가 죽어도 나머지를 끝까지 본다 (안 감싸면 뒤의 진짜 실패를 아무도 못 본다) */
const sec = async (title, fn) => {
  console.log(title);
  try { await fn(); }
  catch (e) { n++; fail++; console.log(`   ❌ 이 자리가 도중에 죽었다 — ${e?.message ?? e}`); }
};

const FILES = {
  page: "app/login/page.js",
  actions: "app/login/actions.js",
  lib: "lib/supabase-server.js",
  mw: "middleware.js",
  self: "scripts/check-loginpage.mjs",
};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
/** ⚠️ 주석 속의 경고 글까지 「위반」으로 세면 경고를 적을수록 검사가 빨개진다 — 주석은 지우고 본다 */
const 코드만 = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/** `const css = ...` 로 적은 css 의 몸통. 못 찾으면 null (⑫·⑬ 이 같이 쓴다 — 판단은 한 벌) */
const css몸통 = (s) => {
  const 머리 = "const css = `";
  const 시작 = s.indexOf(머리), 끝 = s.lastIndexOf("`;");
  return 시작 >= 0 && 끝 > 시작 ? s.slice(시작 + 머리.length, 끝) : null;
};

/** app/ 밑의 .js 를 전부 훑는다 (「그 자리가 앱에 하나뿐인가」를 세려면 전수를 봐야 한다) */
const 앱파일 = (dir = "app") =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? 앱파일(`${dir}/${e.name}`) : e.name.endsWith(".js") ? [`${dir}/${e.name}`] : []);

const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)]));
const code = Object.fromEntries(Object.entries(src).map(([k, s]) => [k, 코드만(s)]));

await sec("■ ① 파일 다섯이 제자리에 있는가", async () => {
  for (const [k, p] of Object.entries(FILES)) ok(p, src[k].length > 0, "없다");
});

await sec("■ ② 속 도메인은 lib/auth.js 한 곳뿐인가 (화면이 직접 붙이면 실패)", async () => {
  const 도메인 = "chloe-eng" + ".internal";
  ok("lib/auth.js 가 그 글자를 갖고 있다", read("lib/auth.js").includes(도메인));
  // ⚠️ **주석은 빼고 본다.** 「여기서 붙이지 마라」라는 경고를 적었다고 검사가 빨개지면
  //    다들 경고를 지우게 된다. 지켜야 할 것은 **도는 코드**에 그 글자가 없는 것이다.
  for (const k of ["page", "actions", "lib", "mw"])
    ok(`${FILES[k]} 의 코드엔 그 글자가 없다`, !code[k].includes(도메인),
       "화면이 도메인을 직접 붙이면 두 벌이 된다");
});

await sec("■ ③ 아이디→이메일 판단을 lib/auth.js 에서 부르는가", async () => {
  ok("actions.js 가 toLoginEmail 을 들여온다", /from\s+["']@\/lib\/auth["']/.test(code.actions)
     && /toLoginEmail/.test(code.actions));
  ok("actions.js 가 toLoginEmail 을 실제로 부른다", /toLoginEmail\s*\(/.test(code.actions));
  // 제 손으로 이메일을 짓는 흔적 — `@` 를 붙여 만드는 자리가 없어야 한다
  ok("화면·동작이 이메일을 제 손으로 짓지 않는다",
     !/`\s*\$\{[^}]*\}\s*@/.test(code.actions + code.page + code.mw),
     "문자열에 @ 를 이어 붙이는 자리가 있다");
});

await sec("■ ④ ⚠️ 대전제 12 — 비밀번호를 건드리는 자리가 하나도 없는가", async () => {
  const 금지 = [
    ["updateUser", /\.updateUser\s*\(/],
    ["resetPasswordForEmail", /resetPasswordForEmail/],
    ["signUp", /\.signUp\s*\(/],
    ["admin.createUser", /admin\s*\.\s*createUser/],
    ["must_change_pw", /must_change_pw/],
    ["setSession(직접)", /\.setSession\s*\(/],
  ];
  for (const [이름, re] of 금지) {
    const 걸린 = ["page", "actions", "lib", "mw"].filter((k) => re.test(code[k]));
    ok(`${이름} 을 안 쓴다`, 걸린.length === 0, 걸린.map((k) => FILES[k]).join(", "));
  }
  ok("로그인·로그아웃 말고 다른 인증 호출이 없다",
     (code.actions.match(/supabase\.auth\.\w+/g) ?? [])
       .every((c) => /signInWithPassword|signOut|getUser/.test(c)),
     (code.actions.match(/supabase\.auth\.\w+/g) ?? []).join(" "));
  // ⚠️ 서비스 열쇠로 로그인 클라이언트를 만들면 RLS 를 통째로 지나친다 — 남의 아이 자료가 열린다
  ok("서비스 열쇠를 로그인 자리에서 안 쓴다",
     !/SERVICE_ROLE/.test(code.page + code.actions + code.lib + code.mw));
});

await sec("■ ⑤ ⚠️ 폰 규칙", async () => {
  const p = code.page;
  ok("autoFocus 를 안 건다", !/autoFocus/.test(p), "열자마자 자판이 튀어 화면이 뛴다");
  ok("position:fixed 스크롤 잠금이 없다", !/position\s*:\s*fixed/.test(p));
  ok("history.pushState 를 안 쓴다", !/pushState/.test(p));
  ok("createPortal 을 안 쓴다", !/createPortal/.test(p));
  ok("alert / confirm 을 안 쓴다", !/\b(alert|confirm)\s*\(/.test(p));

  // 글씨 크기를 **숫자로** 본다 — 16px 밑이면 아이폰이 확대하고 닫아도 확대가 남는다
  const px = [...p.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  ok(`px 로 적힌 글씨가 전부 16 이상 (${px.join("/") || "없음"})`,
     px.length > 0 && px.every((v) => v >= 16), px.filter((v) => v < 16).join(","));
  const coarse = /@media\s*\(\s*pointer\s*:\s*coarse\s*\)\s*\{([\s\S]*?)\n\}/.exec(p);
  ok("(pointer:coarse) 규칙이 있다", Boolean(coarse));
  if (coarse) {
    const cpx = [...coarse[1].matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    ok(`손가락 화면 글씨도 16 이상 (${cpx.join("/") || "없음"})`,
       cpx.length > 0 && cpx.every((v) => v >= 16));
  }
  ok("입력칸에 rem 로 글씨 크기를 주지 않았다 (rem 은 설정에 따라 16 밑으로 내려간다)",
     !/\.card\s+input\s*\{[^}]*font-size\s*:\s*[\d.]+rem/.test(p));

  // ⚠️⚠️ 2026-09-02 사고 — 다크 블록이 **글씨만** 바꾸고 바탕색을 어디에도 안 정했다.
  //    `color-scheme` 선언이 없으면 브라우저 기본 바탕은 흰색이라, 다크모드 폰에서
  //    **흰 바탕에 흰 글씨**가 된다 (실측 대비 약 1.19:1 — 제목·딱지·접기가 전부 안 보였다).
  //    이 화면의 대상이 **한 번도 로그인한 적 없는 학부모 20명**이라 아무도 못 알아챈다.
  //    app/layout.js 도 바탕을 안 정한다(themeColor 는 브라우저 띠 색이지 페이지 바탕이 아니다).
  ok("color-scheme 를 선언한다 (안 하면 다크모드에서 바탕이 흰색으로 남는다)",
     /color-scheme\s*:\s*[^;}]*dark/.test(p), "「:root{color-scheme:light dark}」가 없다");
  ok("밝은 자리에서 html·body 바탕색을 명시한다",
     /(^|[\s{};,])(html|body)[^{}]*\{[^}]*background\s*:/.test(p.split("@media")[0]),
     "바탕이 투명하면 브라우저 기본색(흰색)이 그대로 나온다");
  const 다크 = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{([\s\S]*?)\n\}/.exec(p);
  ok("다크 블록이 있다", Boolean(다크));
  if (다크) {
    ok("다크 블록이 글자색을 바꾼다면 **바탕색도 같이 바꾼다**",
       !/color\s*:/.test(다크[1]) || /background\s*:/.test(다크[1]),
       "글씨만 밝게 바꾸면 흰 바탕에 흰 글씨가 된다 — 2026-09-02 에 실제로 그랬다");
  }
});

await sec("■ ⑥ 역할→첫 화면 표가 한 벌인가 (원칙 1)", async () => {
  for (const k of ["actions", "mw"]) {
    const 박힌 = ["/parent", "/me"].filter((s) => new RegExp(`["'\`]${s}["'\`]`).test(code[k]));
    ok(`${FILES[k]} 에 첫 화면 주소가 박혀 있지 않다`, 박힌.length === 0, 박힌.join(" "));
  }
  ok("actions.js 가 homeFor 를 부른다", /homeFor\s*\(/.test(code.actions));
  ok("middleware.js 가 homeFor 를 부른다", /homeFor\s*\(/.test(code.mw));
});

await sec("■ ⑦ homeFor 를 돌려 본다", async () => {
  ok("원장 → /", homeFor("principal") === "/", homeFor("principal"));
  ok("강사 → /", homeFor("instructor") === "/", homeFor("instructor"));
  ok("학부모 → /parent", homeFor("parent") === "/parent", homeFor("parent"));
  ok("학생 → /me", homeFor("student") === "/me", homeFor("student"));
  // ⚠️⚠️ 2026-09-02 사고 — 예전에는 모르는 역할에 `/` 를 줬고, 이 검사가 그걸 **✅ 로 축복했다.**
  //    그런데 `/` 는 「모르겠다」 자리가 아니라 **원장·강사 첫 화면**이다 (위 principal·instructor).
  //    즉 「지어내지 않는다」고 적어 놓고 실제로는 **「너는 직원이다」라고 지어내고 있었다.**
  //    대시보드 담당이 `app/page.js` 를 놓는 날, 역할 없는 학생·학부모 폰에 원장 화면이 뜬다.
  //    → 모르면 **주소를 안 준다(null)**. 이 줄을 다시 `=== "/"` 로 되돌리지 마라.
  ok("모르는 역할 → null (원장 화면 주소를 주지 않는다)", homeFor("사장님") === null, String(homeFor("사장님")));
  ok("역할이 null 이면 → null", homeFor(null) === null, String(homeFor(null)));
  // ⚠️ 표를 그냥 객체(`{}`)로 바꾸면 여기서 잡힌다 — 객체면 함수·객체가 주소 자리로 새어 나온다
  ok("__proto__ 로 와도 주소가 안 나온다", homeFor("__proto__") === null, String(homeFor("__proto__")));
  ok("constructor 로 와도 주소가 안 나온다", homeFor("constructor") === null, String(homeFor("constructor")));
  ok("모든 첫 화면은 / 로 시작하는 앱 안 주소다",
     [...HOME.values()].every((v) => typeof v === "string" && /^\/[a-z]*$/.test(v)),
     [...HOME.values()].join(" "));
  ok("knownRole — 아는 넷만 참", ["principal", "instructor", "parent", "student"].every(knownRole)
     && !knownRole("사장님") && !knownRole(null) && !knownRole("__proto__"));
});

await sec("■ ⑧ 역할 읽기 — 못 읽을 때 지어내지 않는가 (가짜 Supabase)", async () => {
  const 가짜 = (답) => ({
    schema: (s) => {
      ok(`v2 스키마를 물어본다 (${s})`, s === SCHEMA, s);
      return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => 답 }) }) }) };
    },
  });
  {
    const r = await roleById(가짜({ data: { role: "parent", state: "active" }, error: null }), "x");
    ok("제대로 읽으면 역할이 나온다", r.role === "parent" && r.why === "ok", JSON.stringify(r));
  }
  {
    // ⚠️ 2026-09-02 실측으로 지금 **늘** 나는 오류다
    const r = await roleById(가짜({ data: null, error: { code: "PGRST106", message: "Invalid schema: v2" } }), "x");
    ok("v2 미노출이면 역할은 null 이고 까닭을 말한다",
       r.role === null && r.why === "v2-not-exposed" && /Exposed schemas/.test(r.msg), JSON.stringify(r));
  }
  {
    const r = await roleById(가짜({ data: null, error: null }), "x");
    ok("v2.profiles 에 줄이 없으면 역할은 null", r.role === null && r.why === "no-row", JSON.stringify(r));
  }
  {
    const r = await roleById(가짜({ data: null, error: { code: "42501", message: "permission denied" } }), "x");
    ok("읽기가 막히면 역할은 null", r.role === null && r.why === "read-failed", JSON.stringify(r));
  }
  // 지어낸 역할이 첫 화면으로 이어지지 않는지 — 못 읽으면 **아무 주소도 안 나온다**
  ok("못 읽은 역할(null)은 어떤 첫 화면 주소도 주지 않는다", homeFor(null) === null);

  // ⚠️ 2026-09-02 사고 — `signIn` 이 `const { role } = ...` 로 **why·msg 를 버렸다.**
  //    판단은 까닭을 정확히 쥐고 있는데(no-row · v2-not-exposed) 화면엔 아무 말도 안 남고
  //    `/` 404 로 떨어졌다. 오류도 안내도 없어 며칠간 아무도 모른다 (대전제 0 위반).
  ok("actions.js 가 역할을 못 읽었는지 확인한다 (knownRole)", /knownRole\s*\(/.test(code.actions),
     "역할 없는 사람을 그냥 redirect 하면 404 에 갇힌다");
  ok("actions.js 가 roleOf 에서 까닭(why)까지 꺼낸다",
     /const\s*\{[^}]*\bwhy\b[^}]*\}\s*=\s*await\s+roleOf\s*\(/.test(code.actions),
     "why 를 버리면 화면에 아무 말도 못 남긴다");
});

await sec("■ ⑨ 문지기 짜임", async () => {
  const m = code.mw;
  ok("matcher 가 있다", /export\s+const\s+config/.test(m));
  for (const x of ["_next/static", "api/", "sw\\\\.js", "manifest\\\\.json"])
    ok(`${x.replace(/\\\\/g, "")} 를 비켜 간다`, m.includes(x),
       "여기를 로그인 화면으로 되돌리면 그 자리가 조용히 죽는다");
  ok("리다이렉트에 쿠키를 옮겨 싣는다", /carry\?\.cookies\.getAll\(\)/.test(m),
     "안 실으면 보내자마자 다시 로그아웃 — 고리에 빠진다");
  ok("같은 자리로는 안 보낸다 (고리 방지)", /to\s*===\s*request\.nextUrl\.pathname/.test(m));
  ok("setAll 이 요청과 응답 둘 다에 싣는다",
     /request\.cookies\.set/.test(m) && /res\.cookies\.set/.test(m));
  ok("보낼 때 물음표 뒤를 버린다 (주소에 개인정보가 남지 않게)", /url\.search\s*=\s*""/.test(m));
  ok("로그인 안 했으면 /login 으로 보낸다", /if\s*\(!user\)/.test(m) && /LOGIN/.test(m));
  ok("역할은 필요할 때만 읽는다 (매 요청 왕복 두 배 방지)",
     (m.match(/roleById\s*\(/g) ?? []).length >= 1 && !/roleById[\s\S]{0,80}?const\s+\{\s*data\s*\}/.test(m));
  ok("열쇠가 없어도 문은 잠근 채로 둔다", /keys\(\)\.ok/.test(m));
  ok("탈출구가 있다 (/login?switch=1)", /switch/.test(m) && /searchParams\.get/.test(m));
  // ⚠️ 2026-09-02 사고 — 되돌림이 **307** 이었다. 307 은 메서드를 유지해서 로그인된 폰이
  //    로그인 폼을 한 번 더 내면 그 POST 가 `/parent` 로 그대로 날아가 500 이 떴다.
  ok("되돌림을 303 으로 준다 (307 이면 POST 가 다시 날아간다)",
     /NextResponse\.redirect\s*\([^)]*,\s*303\s*\)/.test(m),
     "NextResponse.redirect(url) 의 기본값은 307 이다");
});

/** ⑪ ⚠️ **진짜 `middleware()` 를 노드로 돌린다.**
 *
 *  글자로만 훑으면 「knownRole 이 어딘가 적혀 있다」까지밖에 못 본다. 2026-09-02 에 난 사고는
 *  **적혀 있는데 그 자리에 안 적혀 있어서** 났다. 그래서 여기서는 실제로 돌려 상태코드와
 *  Location 을 본다. 돌리려면 두 가지를 속여야 한다:
 *    · `@/lib/supabase-server` → 진짜 lib 을 그대로 내보내되 `makeSupabase`·`keys` 만 가짜로
 *      (인증 서버·DB 왕복 없이 「이 사람은 누구다」를 이 검사가 정한다)
 *    · `@/…` 와 `next/server` → 노드가 못 푸는 이름이라 풀어 준다
 *  둘 다 **불러오기 갈고리(loader hook)** 로 한다 — 코드는 한 줄도 안 고친다.
 */
await sec("■ ⑪ 진짜 문지기를 돌린다 (2026-09-02 사고 재현)", async () => {
  const ROOT = pathToFileURL(process.cwd() + "/").href;
  const REAL = new URL("lib/supabase-server.js", ROOT).href;
  const SHIM = "data:text/javascript," + encodeURIComponent(`
    export * from ${JSON.stringify(REAL)};
    export function keys(){ return { url:"http://t", key:"k", ok:true }; }
    export function makeSupabase(){
      return {
        auth:{ getUser: async () => ({ data:{ user: globalThis.__문지기.user }, error:null }) },
        schema: () => ({ from: () => ({ select: () => ({
          eq: () => ({ maybeSingle: async () => globalThis.__문지기.row }) }) }) }),
      };
    }
  `);
  register("data:text/javascript," + encodeURIComponent(`
    const ROOT=${JSON.stringify(ROOT)}, SHIM=${JSON.stringify(SHIM)};
    export function resolve(spec, ctx, next){
      if (spec === "@/lib/supabase-server") return { url: SHIM, shortCircuit: true, format: "module" };
      if (spec.startsWith("@/")) return next(new URL(spec.slice(2) + ".js", ROOT).href, ctx);
      if (spec === "next/server") return next("next/server.js", ctx);
      return next(spec, ctx);
    }
  `));
  const { NextRequest } = await import("next/server.js");
  const { middleware } = await import(new URL("middleware.js", ROOT).href);

  const 없음 = { data: null, error: null };                                   // v2.profiles 에 줄이 없다
  const 미노출 = { data: null, error: { code: "PGRST106", message: "Invalid schema: v2" } };
  const 학부모 = { data: { role: "parent", state: "active" }, error: null };
  const 원장 = { data: { role: "principal", state: "active" }, error: null };
  const 돌린다 = async (path, { user = null, row = 없음, method = "GET" } = {}) => {
    globalThis.__문지기 = { user, row };
    const r = await middleware(new NextRequest(new Request("http://t" + path, { method })));
    return { s: r.status, loc: r.headers.get("location") };
  };
  const 나 = { id: "00000000-0000-0000-0000-000000000000" };

  {
    const r = await 돌린다("/parent");
    ok(`로그인 안 했으면 /login 으로 (${r.s} ${r.loc})`, r.s === 303 && /\/login$/.test(r.loc ?? ""));
  }
  {
    // ⚠️⚠️ **사고 ①** — 역할 없는 사람이 `/login` 에서 `/` 로 튀었다. `/` 는 `app/page.js` 가 없어
    //    404 고, 다시 `/login` 을 열어도 또 `/` 로 튀어 **무한이었다.** 홈 화면에 깐 앱에는
    //    주소창도 뒤로가기도 없어(대전제 10) 스스로 빠져나올 길이 없었다.
    const r = await 돌린다("/login", { user: 나 });
    ok(`역할 없는 사람은 로그인 화면에 그대로 선다 (${r.s} ${r.loc})`, r.s === 200 && !r.loc,
       "여기서 되돌리면 404 무한 고리다 — 실측으로 그랬다");
  }
  {
    // ⚠️⚠️ **사고 ②** — `/` 는 「모르겠다」 자리가 아니라 원장 첫 화면이다.
    //    역할이 정말 없는 사람을 여기 두면 `app/page.js` 가 놓이는 날 원장 화면이 그대로 열린다.
    const r = await 돌린다("/", { user: 나 });
    ok(`역할 없는 사람은 뿌리(원장 화면)에 안 남는다 (${r.s} ${r.loc})`,
       r.s === 303 && /\/login$/.test(r.loc ?? ""));
    const 되돌아온곳 = await 돌린다("/login", { user: 나 });
    ok("그리고 그 길이 고리가 아니다 (/ → /login → 멈춤)", 되돌아온곳.s === 200 && !되돌아온곳.loc);
  }
  {
    // ⚠️ 못 읽은 까닭이 **설정 탈**(v2 미노출)이면 옮기지 않는다 — 전원에게 나는 일이라
    //    옮기면 원장님까지 대시보드에서 쫓겨난다. 「모른다」와 「없다」를 가르는 자리다.
    const r = await 돌린다("/", { user: 나, row: 미노출 });
    ok(`v2 미노출이면 뿌리에서 안 쫓아낸다 (${r.s})`, r.s === 200 && !r.loc,
       "설정 탈로 원장님을 대시보드에서 쫓아내면 안 된다");
  }
  {
    const r = await 돌린다("/login", { user: 나, row: 학부모 });
    ok(`학부모는 /login 에서 제 화면으로 (${r.s} ${r.loc})`, r.s === 303 && /\/parent$/.test(r.loc ?? ""));
  }
  {
    // ⚠️⚠️ **사고 ④ — 2026-09-02, 확인자가 「재현 못 했다」를 뒤집은 자리.**
    //    「역할이 **제대로 있는** 사람」은 `/login` 에 **설 수가 없다.** 아래처럼 전부 되돌려진다.
    //    그러니 로그아웃 단추가 로그인 화면에만 있으면 그 사람에겐 **닫는 길이 없는 것과 같다**
    //    (홈 화면에 깐 앱엔 주소창도 뒤로가기도 없다 — 대전제 10).
    //    → 그래서 ⑬ 이 「첫 화면마다 로그아웃 단추」를 요구한다. 두 검사는 한 사고의 앞뒤다.
    for (const [role, addr] of HOME) {
      const r = await 돌린다("/login", { user: 나, row: { data: { role, state: "active" }, error: null } });
      ok(`${role} 는 /login 에 못 선다 → 첫 화면 ${addr} 에 닫는 길이 있어야 한다 (${r.s} ${r.loc})`,
         r.s === 303 && new RegExp(addr === "/" ? "/$" : `${addr}$`).test(r.loc ?? ""),
         "여기가 303 이 아니게 되면 ⑬ 의 요구도 다시 봐야 한다");
    }
  }
  {
    // ⚠️⚠️ **사고 ③** — 307 이면 브라우저가 **POST 를 그대로 다시 보낸다.** 실측 응답 500
    //    (`Failed to find Server Action …`). 뒤로가기로 되살아난 로그인 화면에서 한 번 더 누르면 난다.
    const r = await 돌린다("/login", { user: 나, row: 학부모, method: "POST" });
    ok(`되돌림이 303 이다 — 307 이면 POST 가 /parent 로 다시 날아간다 (${r.s})`, r.s === 303);
  }
  {
    const r = await 돌린다("/login?switch=1", { user: 나, row: 학부모 });
    ok(`탈출구 /login?switch=1 은 되돌리지 않는다 (${r.s})`, r.s === 200 && !r.loc);
  }
  {
    const r = await 돌린다("/", { user: 나, row: 원장 });
    ok(`원장은 뿌리에 그대로 있는다 (${r.s})`, r.s === 200 && !r.loc);
  }
});

/** ⑫ 화면 글이 실측과 어긋나면 원장님 일이 늘고 학부모는 길을 잃는다 (대전제 0·3) */
await sec("■ ⑫ 화면 글이 실측과 어긋나지 않는가", async () => {
  // ⚠️ **주석은 지우고 본다.** 「예전엔 이렇게 틀리게 적었다」라는 경고를 주석에 남겼다고
  //    검사가 빨개지면 다들 그 경고를 지우게 된다. 지켜야 할 것은 **화면에 뜨는 글**이다.
  const p = code.page;
  // ⚠️ 2026-09-02 사고 — 「앱에 전화번호가 저장되어 있지 않아(48명 전원)」이라고 적었는데 틀렸다.
  //    `v2.profiles.phone` 이 48명 전원 빈 것은 맞지만 **`login_id` 에 학부모 20명의 전화번호가
  //    그대로 들어 있다**(아이디가 있는 사람 41명). 이대로 두면 원장님이 48명 번호를 손으로
  //    다시 모아야 한다고 믿는다 — 없던 원장 일이 생긴다.
  ok("「전화번호가 저장되어 있지 않다」고 적지 않는다",
     !/전화번호가\s*저장되어\s*있지\s*않/.test(p),
     "학부모 아이디가 곧 전화번호다 — 앱 안에 있다");
  ok("「48명 전원」을 아이디 안내의 까닭으로 쓰지 않는다", !/48명\s*전원[^\n]*아이디/.test(p));
  // ⚠️ 실측 — `v2.profiles` 에 `chloe8729-2` 가 있고 `auth.users` 에 `chloe####-#` 가 2개다.
  //    이 안내가 없으면 그 아이들은 형·누나 아이디를 치고, 오류 글이 틀린 규칙을 다시 가리킨다.
  ok("형제·자매 `-2` 아이디 예외를 적어 뒀다", /-2/.test(p) && /형제/.test(p),
     "뒤 4자리가 겹치는 아이가 실제로 있다 (chloe8729-2)");
  ok("로그아웃(탈출구) 단추가 화면에 있다", /<LogoutButton/.test(p) && /로그아웃/.test(p),
     "한 벌짜리 단추(app/logout-button.js)를 이 화면에서도 그려야 한다 — ⑬ 참고");

  // ⚠️ 화면이 「-2 를 쳐 보세요」라고 시켰으면 **판단이 그걸 받아야** 한다.
  //    안 받으면 안내대로 쳤는데도 안 들어가고, 그 집은 길이 완전히 막힌다.
  const { toLoginEmail } = await import("../lib/auth.js");
  const 형제 = toLoginEmail("chloe0515-2");
  ok("판단이 -2 붙은 아이디를 받아 준다", 형제.ok === true && 형제.typedAs === "id",
     `${형제.ok} / ${형제.why ?? ""}`);

  // ⚠️ 2026-09-02 사고 — 위 css 는 template literal 이라, 그 안에 backtick 을 하나라도 쓰면
  //    문자열이 거기서 끊겨 **빌드가 깨진다.** 검사는 글자만 훑어서 초록이었는데 빌드가 죽었다.
  const 몸통 = css몸통(src.page);
  ok("css 문자열 안에 backtick 이 없다 (있으면 문자열이 끊겨 빌드가 깨진다)",
      몸통 !== null && !몸통.includes("`"),
     몸통 === null ? "css 문자열을 못 찾았다" : "css 주석에 backtick 을 쓰지 마라");
});

/** ⑬ ⚠️⚠️ **닫는 길** — 대전제 10: 홈 화면에 깐 앱에는 주소창도 뒤로가기도 없다.
 *
 *  2026-09-02 사고 — 로그아웃 단추가 `/login` 에**만** 있었다. 그런데 문지기는
 *  **역할이 제대로 있는 사람을 `/login` 에서 제 첫 화면으로 되돌린다**(303).
 *  진짜 next 서버로 재현(`next build && next start -p 3111`, 가짜 인증서버로 role=parent):
 *      curl -H 'Cookie: sb-…-auth-token=…' /login  → `303 See Other · location: /parent`
 *      curl -H 'Cookie: …'                /parent  → 글자는 「우리 아이 / 준비 중입니다.」뿐,
 *                                                    `로그아웃` **0개**
 *      grep -rn 'switch=1'                         → 주석 두 줄뿐, 화면에 링크 0개
 *  → 어머니 폰 하나로 두 아이를 보는 집은 **계정을 바꿀 길이 아예 없었다.**
 *  이 자리는 「/me·/parent 담당이 하겠지」로 미룰 수 없다 — 미룬 판에서 그대로 안 고쳐졌다.
 */
await sec("■ ⑬ ⚠️ 닫는 길 — 서는 화면마다 로그아웃 단추가 있는가 (대전제 10)", async () => {
  const BTN = "app/logout-button.js";
  const btnSrc = read(BTN);
  const btn = 코드만(btnSrc);
  ok(`${BTN} 이 있다 (로그아웃 단추 한 벌이 사는 자리)`, btnSrc.length > 0, "없다");
  ok("그 단추가 서버 동작 signOut 을 부른다 (제 손으로 로그아웃을 짓지 않는다)",
     /from\s+["']\.\/login\/actions["']/.test(btn) && /action=\{signOut\}/.test(btn),
     "쿠키를 여기서 직접 지우면 두 벌이 된다");

  // ⚠️⚠️ 사고 재현 — HOME 표에 있는 **모든 첫 화면**에 닫는 길이 있어야 한다.
  //    표에 역할이 늘면 이 검사도 저절로 늘어난다 (검사에 주소를 두 벌로 적지 않는다).
  for (const [role, addr] of HOME) {
    const f = `app${addr === "/" ? "" : addr}/page.js`;
    if (!existsSync(f)) {
      console.log(`   · ${role} → ${addr} — ${f} 가 아직 없다. **놓는 날 이 단추부터 넣어라**`);
      continue;
    }
    const s = 코드만(read(f));
    ok(`${role} 첫 화면 ${f} 에 닫는 길이 있다`,
       /<LogoutButton/.test(s) && /logout-button/.test(s),
       "여기 없으면 그 사람은 홈 화면에 깐 앱에서 계정을 못 바꾼다 — 실측으로 그랬다");
  }

  // 원칙 1 — 로그아웃 **폼을 그리는 자리**가 앱 전체에 하나뿐이어야 한다.
  //          두 벌이 되면 한쪽만 고쳐져, 화면마다 닫는 길이 조용히 달라진다.
  const 그리는곳 = 앱파일().filter((f) => /action=\{signOut\}/.test(코드만(read(f))));
  ok(`로그아웃 폼을 그리는 자리가 하나뿐이다 (${그리는곳.join(" ") || "없음"})`,
     그리는곳.length === 1 && 그리는곳[0] === BTN, "두 벌이면 원칙 1 위반이다");

  // ⚠️ 폰 규칙 — 이 단추는 로그인 화면 밖(글씨 규칙이 없는 화면)에도 놓인다. 스스로 지켜야 한다.
  const px = [...btn.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  ok(`단추 글씨가 16px 이상 (${px.join("/") || "없음"})`, px.length > 0 && px.every((v) => v >= 16),
     "16 밑이면 사파리가 화면을 확대하고 닫아도 확대가 남는다");
  const mh = [...btn.matchAll(/min-height\s*:\s*(\d+)px/g)].map((m) => Number(m[1]));
  ok(`단추 높이가 44px 이상 (${mh.join("/") || "없음"})`, mh.length > 0 && mh.every((v) => v >= 44),
     "44 밑이면 손가락으로 못 누른다");
  // ⚠️ 색을 지어내면 그 화면 바탕과 안 맞아 **다크모드에서 흰 바탕에 흰 글씨**가 된다.
  //    (2026-09-02 에 로그인 화면에서 실제로 났던 사고 — 대비 1.19:1)
  ok("단추 색을 지어내지 않는다 (color:inherit)",
     /color\s*:\s*inherit/.test(btn) && !/(^|[^-])color\s*:\s*#/.test(btn),
     "놓이는 화면의 글자색을 따라가야 한다 — app/globals.css 값을 베끼면 두 벌이다");
  ok(`${BTN} 에 첫 화면 주소가 박혀 있지 않다 (원칙 1)`,
     !["/parent", "/me"].some((s) => new RegExp(`["'\`]${s}["'\`]`).test(btn)));
  const 몸통2 = css몸통(btnSrc);
  ok("단추 css 문자열 안에 backtick 이 없다 (있으면 문자열이 끊겨 빌드가 깨진다)",
     몸통2 !== null && !몸통2.includes("`"),
     몸통2 === null ? "css 문자열을 못 찾았다" : "css 주석에 backtick 을 쓰지 마라");
});

/** ⑭ `homeFor` 는 모르는 역할에 **null** 을 준다 (⑦). 그 null 이 주소 자리로 새면
 *  `url.pathname = null` 이 `/null` 이 되어 엉뚱한 404 로 날아간다.
 *  → 부르는 자리마다 `knownRole` 로 먼저 가르거나, 받는 쪽이 주소인지 확인해야 한다.
 *  지난 판에서 내가 「새로 생긴 위험」으로 적어만 두고 못 막았던 자리다 — 여기서 막는다.
 */
await sec("■ ⑭ homeFor 의 null 이 주소로 새지 않는가", async () => {
  const 후보 = [...앱파일(), "middleware.js", ...readdirSync("lib").filter((f) => f.endsWith(".js")).map((f) => `lib/${f}`)];
  const 부르는곳 = 후보.filter((f) => /homeFor\s*\(/.test(코드만(read(f))) && f !== "lib/supabase-server.js");
  ok(`homeFor 를 부르는 자리 (${부르는곳.join(" ") || "없음"})`, 부르는곳.length > 0, "아무도 안 부른다");
  for (const f of 부르는곳)
    ok(`${f} 이 knownRole 로 먼저 가른다`, /knownRole\s*\(/.test(코드만(read(f))),
       "모르는 역할에 null 이 나오는데 그걸 그냥 주소로 쓰면 /null 로 날아간다");
  // 마지막 방벽 — 받는 쪽(go)이 주소가 아닌 값을 막는다
  ok("middleware 의 go() 가 「/ 로 시작하는 문자열」이 아니면 아무 데도 안 보낸다",
     /typeof\s+to\s*!==\s*["']string["']/.test(code.mw) && /startsWith\s*\(\s*["']\/["']\s*\)/.test(code.mw));
});

await sec("■ ⑩ 진짜 DB — v2.profiles 의 role 값이 내 표와 같은가", async () => {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  for (let i = 1; ; i++) { try { await c.connect(); break; }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
  try {
    const 제약 = (await c.query(
      `select pg_get_constraintdef(oid) d from pg_constraint
        where conrelid = 'v2.profiles'::regclass and conname = 'profiles_role_check'`)).rows[0]?.d ?? "";
    for (const r of HOME.keys())
      ok(`DB 가 '${r}' 를 역할로 인정한다`, 제약.includes(`'${r}'`), 제약.slice(0, 90));
    const 실제 = (await c.query(`select distinct role from v2.profiles order by 1`)).rows.map((x) => x.role);
    ok(`DB 에 있는 역할이 전부 내 표에 있다 (${실제.join(",")})`, 실제.every(knownRole),
       실제.filter((r) => !knownRole(r)).join(","));
    // ⚠️ 접근 규칙이 자기 줄을 읽게 열어 두는가 — 막히면 역할을 못 읽어 아무도 제 화면으로 못 간다
    const 정책 = (await c.query(
      `select polname from pg_policy where polrelid = 'v2.profiles'::regclass`)).rows.map((x) => x.polname);
    ok(`profiles 에 자기 줄 읽기 규칙이 있다 (${정책.join(",")})`, 정책.includes("self_read"));

    const 실측 = (await c.query(`
      select p.role, count(*)::int n, count(u.last_sign_in_at)::int signed
        from v2.profiles p join auth.users u on u.id = p.id group by 1 order by 1`)).rows;
    console.log("   · 실측 — 한 번이라도 로그인한 사람");
    실측.forEach((r) => console.log(`       ${r.role.padEnd(11)} ${r.signed}/${r.n}`));

    // ⚠️ 화면 글(⑫)이 **지금도 사실인가**를 DB 에 되물어 본다. 사실이 바뀌면 글도 고쳐야 한다.
    const 글근거 = (await c.query(`
      select (select count(*) from v2.profiles where login_id ~ '^01[0-9]{8,9}$')::int 전화꼴아이디,
             (select count(*) from v2.profiles where login_id ~ '-[0-9]$')::int 뒤에숫자붙은아이디,
             (select count(*) from auth.users where email ~ '^chloe[0-9]+-[0-9]@')::int 계정쪽,
             (select count(*) from v2.profiles where coalesce(phone,'') <> '')::int phone칸`)).rows[0];
    ok(`학부모 아이디가 전화번호다 — 앱 안에 번호가 있다 (${글근거.전화꼴아이디}명)`,
       글근거.전화꼴아이디 > 0,
       "0 이 되면 「누구인지 확인할 길이 없다」는 까닭도 다시 봐야 한다");
    ok(`형제 -2 아이디 예외가 아직 있다 (프로필 ${글근거.뒤에숫자붙은아이디} · 계정 ${글근거.계정쪽})`,
       글근거.뒤에숫자붙은아이디 > 0 || 글근거.계정쪽 > 0,
       "없어졌으면 화면의 -2 안내를 지워야 한다 — 없는 규칙을 알려주면 안 된다");
    console.log(`   · 실측 — v2.profiles.phone 이 채워진 사람 ${글근거.phone칸}명 ` +
                `(그래도 login_id 에 전화번호 ${글근거.전화꼴아이디}개가 남아 있다)`);
  } finally { await c.end(); }
});

// ── 코드로는 못 고치는 것 (⚠️ 이 자리를 지우지 마라 — 지금 로그인이 실제로 안 되는 까닭이다)
const 막힌것 = [];
if (!keys(process.env).ok && !/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(read(".env.local")))
  막힌것.push("NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local 에 없다 → 로그인 화면은 떠도 **아무도 못 들어간다**");
try {
  const env = readFileSync(".env.local", "utf8");
  const u = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1].trim();
  const k = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1].trim();
  if (u && k) {
    const res = await fetch(`${u}/rest/v1/profiles?select=role&limit=1`, {
      headers: { apikey: k, Authorization: `Bearer ${k}`, "Accept-Profile": "v2" },
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      막힌것.push(
        `PostgREST 가 v2 스키마를 안 내보낸다 (${b.code || res.status}) → 로그인은 돼도 ` +
        `**역할을 못 읽어** 학부모·학생이 제 화면으로 못 간다`);
    }
  }
} catch { /* 인터넷이 없으면 그냥 넘어간다 — 이건 검사가 아니다 */ }
if (!existsSync("app/page.js"))
  막힌것.push(
    "app/page.js 가 없다 → 원장이 로그인하면 첫 화면 `/` 가 404 다 (대시보드 담당 자리). " +
    "⚠️ 놓는 날 `<LogoutButton/>` 을 같이 넣어라 — 안 넣으면 원장님도 계정을 못 바꾼다 (⑬)");

console.log("\n■ 코드로는 못 고치는 것 (이 검사는 초록이어도 아래가 남아 있으면 로그인이 안 된다)");
막힌것.length
  ? 막힌것.forEach((x) => console.log(`   ⚠️ ${x}`))
  : console.log("   ✅ 없음 — 실제로 로그인이 된다");

console.log(`\n■ 로그인 화면 검사 ${n}건 · 실패 ${fail} · 못 고치는 것 ${막힌것.length}건`);
process.exit(fail ? 1 : 0);
