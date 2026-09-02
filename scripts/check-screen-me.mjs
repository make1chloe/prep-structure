/**
 * 학생 화면(`app/me`) 검사 — **이 화면이 지켜야 할 것**만 본다.
 *
 * 왜 이 검사가 따로 있나
 *   `scripts/check-layout.mjs` 는 `app/globals.css` 만 본다. 화면 파일은 아무도 안 본다.
 *   그런데 이 화면에서 새는 것은 CSS 가 아니라 **규칙**이다 —
 *   원장 메모가 아이 값에 실리거나, 화면이 lib 을 안 지나고 스스로 판정하거나,
 *   서비스 열쇠로 남의 아이 자료를 읽거나, ❗ 가 진도를 바꿔 버리거나.
 *
 * 무엇을 보나
 *   1부 글자 훑기   — 새는 자리·두 벌 되는 자리·금지 목록
 *   2부 실제로 돌려 — derive 의 셈을 **진짜 불러** 답을 맞대어 본다
 *   3부 진짜 브라우저 — 320·390·768·1400 폭으로 그려서 잰다
 *   4부 ⚠️ **일부러 어긴 본보기**를 같이 넣어 **검사가 그것을 잡는지까지** 확인한다.
 *        못 잡으면 이 검사가 실패한다 — 「있는 척」이 검사가 없는 것보다 나쁘다.
 *
 * ⚠️ 3부의 크롬 몰이는 `check-layout.mjs` 의 것과 **같은 짜임을 두 벌 적은 것**이다.
 *    그 파일은 남의 담당이라 손대지 못해 내보내(export) 쓸 수가 없었다.
 *    → `scripts/_chrome.mjs` 로 한 벌 빼는 것이 옳다. **notes 에 적어 두었다.**
 *
 * 돌리는 법:  node scripts/check-screen-me.mjs
 */
import { readFileSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL(process.cwd() + "/").href;

/** `@/lib/...` 를 노드가 알아듣게 — `check-loginpage.mjs` 가 쓰는 것과 같은 손잡이 */
register("data:text/javascript," + encodeURIComponent(`
  const ROOT=${JSON.stringify(ROOT)};
  export function resolve(spec, ctx, next){
    if (spec.startsWith("@/")) return next(new URL(spec.slice(2) + ".js", ROOT).href, ctx);
    return next(spec, ctx);
  }
`));

let fail = 0, n = 0;
const ok = (t, cond, why = "") => {
  n++;
  if (cond) console.log(`   ✅ ${t}`);
  else { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
};
const sec = async (title, fn) => {
  console.log("\n" + title);
  try { await fn(); }
  catch (e) { n++; fail++; console.log(`   ❌ 이 자리가 도중에 죽었다 — ${e?.stack ?? e}`); }
};

const 읽기 = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
/** ⚠️ 주석 속 경고 글을 「위반」으로 세면 **경고를 적을수록 검사가 빨개진다.** 주석은 지우고 본다 */
const 코드만 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const 내파일 = () =>
  readdirSync("app/me", { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".js"))
    .map((e) => `app/me/${e.name}`);

const src = Object.fromEntries(내파일().map((p) => [p, 읽기(p)]));
const code = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, 코드만(v)]));
const 모두 = Object.values(code).join("\n");

/* ══════════════════════════════════════════════════════════════════════
 * 1부 — 글자 훑기
 * ══════════════════════════════════════════════════════════════════════ */

await sec("■ ① 파일이 제자리에 있는가", async () => {
  for (const p of ["app/me/page.js", "app/me/read.js", "app/me/actions.js",
                   "app/me/screen.js", "app/me/derive.js", "app/me/style.js"])
    ok(p, (src[p] ?? "").length > 0, "없다");
  // ⚠️ 이 화면 담당은 `app/me` 아래만 만든다 — 밖에 파일을 흘리면 남의 담당과 부딪힌다
  ok("app/me 밖에 흘린 파일이 없다", !existsSync("app/me-extra.js"));
});

await sec("■ ② 닫는 길 — 로그아웃 단추 (대전제 10)", async () => {
  const s = code["app/me/page.js"] ?? "";
  ok("page.js 에 <LogoutButton /> 이 있다", /<LogoutButton/.test(s) && /logout-button/.test(s),
     "홈 화면에 깐 앱에는 주소창도 뒤로가기도 없다 — 여기 없으면 계정을 못 바꾼다");
  ok("로그아웃 폼을 여기서 다시 짓지 않는다 (원칙 1)", !/action=\{signOut\}/.test(모두),
     "app/logout-button.js 한 벌뿐이어야 한다");
});

await sec("■ ③ ⚠️ 서비스 열쇠를 화면에서 안 쓴다 (접근 규칙을 지나쳐 버린다)", async () => {
  for (const bad of ["serviceDb", "SERVICE_ROLE", "lib/db"])
    ok(`${bad} 를 안 쓴다`, !모두.includes(bad),
       "서비스 열쇠로 읽으면 남의 아이 자료가 이 화면에 그대로 뜬다");
  ok('pg 를 직접 안 불러온다', !/from\s+["']pg["']/.test(모두));
  ok("쿠키로 만든 클라이언트만 쓴다 (serverClientFromStore)",
     /serverClientFromStore/.test(code["app/me/read.js"] ?? "") &&
     /serverClientFromStore/.test(code["app/me/actions.js"] ?? ""));
});

await sec("■ ④ ⚠️ 화면이 스스로 역할을 가르는가 (문지기가 안 봐준다)", async () => {
  const r = code["app/me/read.js"] ?? "";
  ok('read.js 가 role !== "student" 를 스스로 가른다', /role\s*!==\s*["']student["']/.test(r),
     "실측 — 학부모 세션으로 GET /me 가 200 이다. 문지기는 「첫 화면」만 고른다");
  ok("actions.js 도 같은 잣대로 막는다", /role\s*!==\s*["']student["']/.test(code["app/me/actions.js"] ?? ""));
});

await sec("■ ⑤ ⚠️ 원장 메모가 아이 값에 **키째로** 없는가 (사고 #7 과 같은 모양)", async () => {
  // ⚠️ 칸 이름을 여기 손으로 적지 않는다 — `lib/close.js` 의 STAFF_ONLY 를 **읽어서** 맞댄다.
  //    손으로 적으면 그 목록이 늘어난 날 이 검사만 옛 목록을 본다(두 벌).
  const { STAFF_ONLY } = await import(new URL("lib/close.js", ROOT).href);
  const 읽는곳 = src["app/me/read.js"] ?? "";
  for (const 표 of Object.keys(STAFF_ONLY))
    for (const 칸 of STAFF_ONLY[표])
      ok(`read.js 가 ${표}.${칸} 을 안 고른다`, !new RegExp(`\\b${칸}\\b`).test(코드만(읽는곳)),
         "화면에서 숨기는 것이 아니라 **값에 아예 안 실어야** 한다");
  ok("staff_note 라는 글자가 app/me 어디에도 없다", !/staff_note/.test(모두));
});

await sec("■ ⑥ 화면이 lib 을 지나는가 (제 손으로 판정하지 않는다)", async () => {
  const 부른것 = [...모두.matchAll(/from\s+["']@\/lib\/([a-z-]+)["']/g)].map((m) => m[1]);
  ok(`lib 을 실제로 부른다 (${[...new Set(부른것)].join(" · ") || "없음"})`, 부른것.length >= 3);
  // 마감 글은 lib/close.js 한 벌 — 화면이 그 글자를 다시 적으면 두 벌이 된다
  ok("「아직 정리 중이에요」를 화면이 직접 안 적는다",
     !/["']아직 정리 중이에요["']/.test(모두.replace(/from\s+["']@\/lib\/close["']/g, "")) ||
     /from\s+["']@\/lib\/close["']/.test(code["app/me/read.js"] ?? ""),
     "lib/close.js 의 PREPARING 을 받아 써야 한다");
  ok("커서(지금 어디)를 화면에서 다시 안 센다 — v2.cursor_of 를 부른다",
     /rpc\(["']cursor_of["']/.test(code["app/me/read.js"] ?? ""));
  ok("진도율을 화면에서 다시 안 센다 — v2.book_progress 를 부른다",
     /rpc\(["']book_progress["']/.test(code["app/me/read.js"] ?? ""));
  ok("진도 체크 열림을 화면에서 다시 안 조합한다 — v2.can_edit_progress 를 부른다",
     /rpc\(["']can_edit_progress["']/.test(code["app/me/read.js"] ?? ""));
});

await sec("■ ⑦ 탭이 없는가 (탭 전환 = 화면 전체 재조회)", async () => {
  ok('role="tab" 이 없다', !/role\s*=\s*["']tab/.test(모두));
  ok("달을 넘길 때 다시 조회하지 않는다 (석 달치를 한 번에 읽는다)",
     /앞달/.test(code["app/me/read.js"] ?? "") && /뒷달/.test(code["app/me/read.js"] ?? ""));
});

await sec("■ ⑧ 조회 수가 상한 안인가", async () => {
  const r = code["app/me/read.js"] ?? "";
  // ⚠️ `read.js` 는 `next/headers` 를 부르므로 맨 노드로는 **불러올 수 없다.**
  //    전에는 `import(...).catch(() => ({}))` 로 삼키고 **지어낸 기본값(14·6)** 으로 쟀다 —
  //    파일의 진짜 상한과 다른 숫자를 재고 있었다. 글자에서 그대로 뽑는다.
  const 숫자 = (이름) => {
    const m = new RegExp(`export const ${이름}\\s*=\\s*(\\d+)`).exec(r);
    if (!m) throw new Error(`app/me/read.js 에 ${이름} 이 없다 — 상한을 잴 근거가 없다`);
    return Number(m[1]);
  };
  const 상한 = 숫자("조회_상한"), 책상한 = 숫자("교재_상한");
  // 조회 자리 = `물어본다(` 를 부른 곳. 교재마다 도는 두 자리는 **책상한 배**로 센다
  const 자리 = (r.match(/물어본다\(/g) || []).length;
  const 고리안 = (r.split("for (const b of 배정들)")[1] ?? "").split("\n  }")[0];
  const 고리자리 = (고리안.match(/물어본다\(/g) || []).length;
  const 최대 = (자리 - 고리자리) + 고리자리 * 책상한;
  ok(`조회 자리 ${자리}개 · 교재 ${책상한}권까지면 최대 ${최대}번 (상한 ${상한})`, 최대 <= 상한,
     "아이 폰에서 눈에 띄게 느려진다 — 교재 상한을 줄이거나 DB 함수로 묶어라");
  ok("DB 를 읽는 자리가 read.js 하나뿐이다",
     Object.entries(code).every(([p, s]) =>
       p === "app/me/read.js" || p === "app/me/actions.js" || !/\.(from|rpc)\(/.test(s)),
     "화면 컴포넌트가 직접 읽으면 조회 수를 아무도 못 센다");
  ok("모든 조회가 `물어본다(` 를 지난다 (세는 자리를 안 빠져나간다)",
     (r.match(/q\(\)\.(from|rpc)\(/g) || []).length === (r.match(/물어본다\(/g) || []).length);
});

await sec("■ ⑨ 아이가 쓰는 자리가 넷뿐인가", async () => {
  const a = code["app/me/actions.js"] ?? "";
  const 쓴표 = [...a.matchAll(/from\(["']([a-z_]+)["']\)[\s\S]{0,200}?\.(update|upsert|insert)\(/g)].map((m) => m[1]);
  const 허락 = new Set(["day_item", "progress", "progress_flag", "screen_pref"]);
  ok(`쓰는 표: ${[...new Set(쓴표)].join(" · ") || "없음"}`, 쓴표.every((t) => 허락.has(t)),
     "아이가 쓸 수 있는 자리는 접근 규칙이 연 넷뿐이다");
  ok("지우는 길을 안 연다", !/\.delete\(/.test(모두), "v2 는 delete 권한이 회수돼 있다(0017)");
  ok("비밀번호를 건드리는 함수가 없다 (대전제 12)",
     !/updateUser|resetPasswordForEmail|signUp\(/.test(모두));
});

await sec("■ ⑩ ⚠️ ❗ 가 진도를 안 바꾸는가 (오류 102 · 표 4-7)", async () => {
  const a = src["app/me/actions.js"] ?? "";
  const 이의몸통 = (a.split("export async function 이의달기")[1] ?? "").split("\n}")[0];
  ok("이의달기가 progress_flag 에만 넣는다", /from\(["']progress_flag["']\)/.test(이의몸통));
  ok("이의달기가 v2.progress 를 한 줄도 안 건드린다",
     !/from\(["']progress["']\)/.test(이의몸통),
     "아이가 스스로 되돌리게 하면 잘못 건드리는 길이 다시 열린다");
  ok("이의를 아이가 스스로 못 닫는다 (seen_at·outcome 을 안 싣는다)",
     !/seen_at/.test(이의몸통) && !/outcome/.test(이의몸통));
});

await sec("■ ⑪ ⚠️ 진도 쓰기가 접근 규칙과 **같은 잣대**인가", async () => {
  const a = src["app/me/actions.js"] ?? "";
  const 몸통 = (a.split("export async function 진도찍기")[1] ?? "").split("\n}")[0];
  ok('last_by: "student" 를 반드시 싣는다', /last_by:\s*["']student["']/.test(몸통));
  ok("confirmed: false 를 반드시 싣는다 (= 확인 기다리는 중)", /confirmed:\s*false/.test(몸통));
  ok("회독을 지어내지 않는다 (없으면 거절한다)", /Number\.isInteger/.test(몸통) && /회독/.test(몸통));

  // ⚠️ 화면의 목록과 **접근 규칙 원문**을 맞대어 본다. 두 벌이 갈리면 여기서 잡힌다
  const rls = 읽기("supabase/migrations/0016_rls_rest.sql");
  const m = /child_done[\s\S]*?slot in \(([^)]*)\)/.exec(rls);
  const 규칙칸 = m ? m[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort() : null;
  const { 아이가_찍는_칸 } = await import(new URL("app/me/derive.js", ROOT).href);
  ok(`아이가 찍는 칸이 접근 규칙과 같다 (규칙 ${규칙칸?.join("·") ?? "못 읽음"} · 화면 ${[...아이가_찍는_칸].sort().join("·")})`,
     !!규칙칸 && JSON.stringify(규칙칸) === JSON.stringify([...아이가_찍는_칸].sort()),
     "화면이 더 열면 눌러도 거절당하고, 더 닫으면 아이가 못 찍는다");

  const rls2 = 읽기("supabase/migrations/0052_progress_fix.sql");
  ok("「원장이 찍은 줄은 아이가 못 덮는다」가 규칙에 있다 (절 ㊶ ③)",
     /last_by = 'student' or status = 'none'/.test(rls2));
});

await sec("■ ⑫ 금지 목록 (대전제)", async () => {
  for (const [이름, re] of [
    ["alert", /\balert\s*\(/], ["confirm", /\bconfirm\s*\(/],
    ["createPortal", /createPortal/], ["history.pushState", /pushState/],
    ["position:fixed", /position\s*:\s*fixed/],
  ]) ok(`${이름} 을 안 쓴다`, !re.test(모두));
  ok("타이머·오답노트를 안 만든다", !/setInterval|오답노트/.test(모두),
     "아이가 스스로 눌러야 쌓이는 것이라 시켜서 켜면 숫자만 늘고 뜻이 없다");
});

/* ══════════════════════════════════════════════════════════════════════
 * 2부 — 셈을 **진짜 불러** 본다
 * ══════════════════════════════════════════════════════════════════════ */
const D = await import(new URL("app/me/derive.js", ROOT).href);

await sec("■ ⑬ 차례대로 — 앞엣것을 끝내야 다음이 열린다 (화면에서만 막는다)", async () => {
  const r = D.차례대로([
    { id: 1, status: "none" }, { id: 2, status: "none" }, { id: 3, status: "none" },
  ]);
  ok("첫째만 열린다", r[0].열림 === true && r[1].열림 === false && r[2].열림 === false);
  const r2 = D.차례대로([{ id: 1, status: "done" }, { id: 2, status: "none" }, { id: 3, status: "none" }]);
  ok("첫째를 끝내면 둘째가 열린다", r2[1].열림 === true && r2[2].열림 === false);
  ok("끝낸 줄은 늘 열려 있다 (되돌려 볼 수 있어야 한다)", r2[0].열림 === true);
  ok("차례 번호가 붙는다", r2.map((x) => x.차례).join() === "1,2,3");
});

await sec("■ ⑭ ⚠️ 접힌 것도 **분자에 그대로 든다** (절 ⑮-2)", async () => {
  const 줄 = [{ status: "done" }, { status: "done" }, { status: "none" }];
  const s = D.센다(줄);
  ok(`끝 ${s.끝} / 전체 ${s.전체}`, s.끝 === 2 && s.전체 === 3 && s.남음 === 1,
     "접기는 **보이는 것만** 바꾸지 세는 것을 안 바꾼다");
});

await sec("■ ⑮ 빈 카드 — **마감해야** 「없음」으로 굳는다 (물음 T)", async () => {
  const { familyDayLabel, PREPARING, NOTHING } = await import(new URL("lib/close.js", ROOT).href);
  // ⚠️ derive 의 갈래와 lib/close.js 의 글을 **맞대어** 본다. 두 벌이 갈리면 여기서 잡힌다
  const 표 = [
    { 있나: false, 마감: false, 글: PREPARING, 갈래: "preparing" },
    { 있나: false, 마감: true, 글: NOTHING, 갈래: "hide" },
    { 있나: true, 마감: true, 글: null, 갈래: "show" },
  ];
  for (const t of 표) {
    const 갈래 = D.카드어떻게(t.있나, t.마감);
    const 글 = familyDayLabel(t.마감 ? { closed_at: "2026-09-02T00:00:00Z" } : {}, { hasContent: t.있나 });
    ok(`있나=${t.있나} 마감=${t.마감} → ${갈래} · 「${글 ?? "글 없음"}」`,
       갈래 === t.갈래 && 글 === t.글,
       "마감 안 한 날과 진짜 없는 날이 아이에게 똑같아 보이면 안 된다");
  }
});

await sec("■ ⑯ 진도 줄 — 아이가 덮을 수 있나 · 확인 기다리는 중 · 「쌤/내가」", async () => {
  ok("닫혀 있으면 아무것도 못 덮는다", D.아이가덮을수있나(null, false) === false);
  ok("빈 줄은 채운다", D.아이가덮을수있나(null, true) === true);
  ok("status='none' 인 줄은 누구 것이든 채운다",
     D.아이가덮을수있나({ status: "none", last_by: "staff" }, true) === true);
  ok("⚠️ 원장이 찍은 줄은 **못 덮는다**",
     D.아이가덮을수있나({ status: "done", last_by: "staff" }, true) === false);
  ok("검사가 찍은 줄도 못 덮는다",
     D.아이가덮을수있나({ status: "done", last_by: "check" }, true) === false);
  ok("아이가 찍은 줄은 아이가 다시 고친다",
     D.아이가덮을수있나({ status: "done", last_by: "student" }, true) === true);
  ok("아이가 찍고 확인 전이면 노란 테두리",
     D.확인기다리는중({ last_by: "student", confirmed: false }) === true &&
     D.확인기다리는중({ last_by: "student", confirmed: true }) === false);
  ok("줄마다 「쌤/내가」",
     D.누가찍었나({ status: "done", last_by: "staff" }) === "쌤" &&
     D.누가찍었나({ status: "done", last_by: "check" }) === "쌤" &&
     D.누가찍었나({ status: "done", last_by: "student" }) === "내가" &&
     D.누가찍었나({ status: "none", last_by: "staff" }) === null);
  ok("표시가 셋이다 (○ ◐ ·) — **소단원마다** (오류 101)",
     D.표시들.map((t) => t.key).join() === "done,doing,none");
});

await sec("■ ⑰ ⚠️ 「언제쯤 끝나나」 — 못 세면 **지어내지 않는다**", async () => {
  const 수업이력 = [{ from_date: "2020-01-01", to_date: null, weekdays: [1, 3, 5] }];
  const 새내기 = D.언제끝나나({ 오늘: "2026-09-02", 남은단원: 40, 완료날들: ["2026-08-30"], 다닌날: 20, 수업이력 });
  ok(`두 달 못 채우면 「아직 셀 수 없습니다」 — ${새내기.why}`,
     새내기.state === "tooNew" && 새내기.on === null && /아직 셀 수 없습니다/.test(새내기.why));

  const 적음 = D.언제끝나나({ 오늘: "2026-09-02", 남은단원: 40, 완료날들: ["2026-08-30"], 다닌날: 200, 수업이력 });
  ok(`최근에 한 것이 적으면 못 센다 — ${적음.why}`, 적음.state === "tooFew" && 적음.on === null);

  const 날들 = [];
  for (let i = 1; i <= 24; i++) 날들.push(D.요일 ? 날더하기("2026-09-02", -i * 2) : null);
  const 셀수있음 = D.언제끝나나({ 오늘: "2026-09-02", 남은단원: 20, 완료날들: 날들, 다닌날: 300, 수업이력 });
  ok(`셀 수 있으면 날짜가 나온다 — ${셀수있음.state} ${셀수있음.on ?? ""}`,
     셀수있음.state === "ok" && /^\d{4}-\d{2}-\d{2}$/.test(셀수있음.on ?? ""));
  ok("끝난 교재는 「다 했어요」", D.언제끝나나({ 오늘: "2026-09-02", 남은단원: 0 }).state === "done");
  ok("모르는 것은 저장하지 않는다 — 셈만 하고 값을 안 남긴다",
     !/insert|upsert/.test(코드만(읽기("app/me/derive.js"))));
});

function 날더하기(d, n) {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

await sec("■ ⑱ 카드 차례 — 카드가 사라지지 않는다", async () => {
  ok("저장값이 없으면 기본 차례", D.순서입히기(null).join() === [...D.카드들].join());
  ok("모르는 이름은 버린다", !D.순서입히기(["없는것", "today"]).includes("없는것"));
  ok("빠진 이름은 뒤에 붙는다 (카드가 사라지지 않는다)",
     D.순서입히기(["today"]).length === D.카드들.length);
  ok("▲ 로 한 칸 위", D.한칸옮기기(["a", "b", "c"], "b", "up").join() === "b,a,c");
  ok("맨 위에서 더 밀어도 그대로", D.한칸옮기기(["a", "b"], "a", "up").join() === "a,b");
  ok("끌어 옮기기", D.끌어옮기기(["a", "b", "c"], "c", "a").join() === "c,a,b");
});

await sec("■ ⑲ 달력 — 마감 안 한 날을 **빈 칸으로 두지 않는다** (절 ⑯ 1번)", async () => {
  const 칸 = D.달력칸({
    오늘: "2026-09-02", first: "2026-09-01", last: "2026-09-30",
    판들: [{ date: "2026-09-01", attend: "present", closed_at: "x", day_item: [] }],
    수업이력: [{ from_date: "2026-01-01", to_date: null, weekdays: [1, 2, 3] }],
    시험들: [{ id: "e1", name: "2학기 중간", english_on: "2026-09-15" }],
    재원시작: "2026-08-01",
  });
  const 찾기 = (d) => 칸.find((c) => c && c.date === d);
  ok("마감한 날은 closed", 찾기("2026-09-01")?.상태 === "closed");
  ok("수업했는데 판이 안 온 날은 「정리 중」", 찾기("2026-09-02")?.상태 === "open");
  ok("앞날 수업일은 「예정」", 찾기("2026-09-08")?.상태 === "plan");
  ok("시험날이 그 칸에 붙는다", 찾기("2026-09-15")?.시험들.length === 1);
  ok("첫 주 앞의 빈 자리가 요일만큼 있다", 칸.filter((c) => c === null).length === D.요일("2026-09-01"));
  ok("재원 시작 전은 안 보여준다 (파기와 부딪힌다)",
     D.달력칸({ 오늘: "2026-09-02", first: "2026-07-01", last: "2026-07-31", 판들: [], 수업이력: [],
                시험들: [], 재원시작: "2026-08-01" }).filter(Boolean).every((c) => c.상태 === "before"));
});

/* ══════════════════════════════════════════════════════════════════════
 * 3부 — 스타일을 글자로 훑는다 (+ 4부: 일부러 어긴 본보기를 잡는가)
 * ══════════════════════════════════════════════════════════════════════ */

/** css 한 벌에서 「어긴 것」 목록을 낸다. 내 style.js 는 0건이어야 하고, 본보기는 많이 나와야 한다 */
function 스타일훑기(css) {
  const bad = [];
  const s = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const add = (why) => bad.push(why);

  // ⚠️ 새 색을 만들지 않는다 — 토큰만
  for (const m of s.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) add(`색을 지어냈다: ${m[0]}`);
  for (const m of s.matchAll(/\brgba?\([^)]*\)/g)) add(`색을 지어냈다: ${m[0]}`);
  // ⚠️ 새 글씨 크기를 만들지 않는다
  for (const m of s.matchAll(/font-size\s*:\s*([^;}]+)/g))
    if (!/var\(--fs\d+\)/.test(m[1])) add(`글씨 크기를 지어냈다: ${m[1].trim()}`);
  // ⚠️ 오류 94 — basis 없는 flex:1 은 390px 에서 26px 로 눌린다
  for (const m of s.matchAll(/flex\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (/^\d+(\s+\d+)?$/.test(v)) add(`basis 없는 flex: ${v}`);
    if (/^\d+\s+\d+\s+0(px)?$/.test(v)) add(`basis 0 인 flex: ${v}`);
  }
  // ⚠️ grid 의 **맨** 1fr 은 내용보다 안 작아진다 (달력이 부모 밖으로 69px 나갔던 자리).
  //    ⚠️ `minmax(92px,1fr)` 은 맨 것이 아니다 — 바닥이 있으면 상자가 굴려 준다.
  //    그래서 `minmax(...)` 를 **먼저 지우고** 남은 1fr 만 본다 (globals.css 의 .cal 이 그 모양이다).
  for (const m of s.matchAll(/grid-template-columns\s*:\s*([^;}]+)/g)) {
    const 남은 = m[1].replace(/minmax\([^)]*\)/g, " ");
    if (/(^|[\s(,])1fr/.test(남은)) add(`맨 1fr: ${m[1].trim()}`);
  }
  // ⚠️ 투명도로 흐리게 하지 않는다 (끄는 중만 봐준다)
  for (const m of s.matchAll(/([^{}]*)\{[^}]*opacity\s*:\s*0?\.\d+/g))
    if (!/is-drag/.test(m[1])) add(`투명도로 흐리게: ${m[1].trim()}`);
  if (/position\s*:\s*fixed/.test(s)) add("position:fixed 를 썼다");
  // ⚠️ 누르는 것은 44px 아래로 안 내려간다
  for (const m of s.matchAll(/min-height\s*:\s*(\d+)px/g))
    if (Number(m[1]) < 44) add(`누르는 것이 ${m[1]}px 다 (44 아래)`);
  // ⚠️ 클래스 이름은 전부 me- 앞가지 · 한 낱말 상태 이름 금지
  for (const m of s.matchAll(/\.([-A-Za-z_][-\w]*)/g)) {
    const c = m[1];
    if (/^is-/.test(c)) continue;
    if (["wrap", "card", "row", "col", "pill", "chip", "sunk", "muted", "num", "btn", "lbl",
         "cal", "calday", "calwrap", "acc", "accbd", "tbl", "tblwrap"].includes(c)) continue;
    if (!/^me-/.test(c)) add(`me- 앞가지가 없는 클래스: .${c}`);
    if (/^(open|on|off|sel|active|done|new|hide|show)$/i.test(c)) add(`한 낱말 상태 이름: .${c}`);
  }
  return bad;
}

await sec("■ ⑳ 스타일이 토큰만 쓰는가", async () => {
  const { css } = await import(new URL("app/me/style.js", ROOT).href);
  const bad = 스타일훑기(css);
  ok(`app/me/style.js 가 규칙을 하나도 안 어긴다${bad.length ? " — " + bad.slice(0, 6).join(" · ") : ""}`,
     bad.length === 0);

  // ⚠️ 4부 — **일부러 어긴 본보기**를 같은 검사에 넣어 본다. 못 잡으면 검사가 없는 것과 같다
  const 본보기 = `
    .me-x{color:#ff0000;font-size:13px;flex:1;opacity:.5;position:fixed;min-height:20px}
    .bad-name{color:var(--fg)}
    .me-g{display:grid;grid-template-columns:repeat(7,1fr)}
  `;
  const 잡은것 = 스타일훑기(본보기);
  for (const [이름, re] of [
    ["지어낸 색", /색을 지어냈다/], ["지어낸 글씨 크기", /글씨 크기를 지어냈다/],
    ["basis 없는 flex", /basis 없는 flex/], ["투명도", /투명도로 흐리게/],
    ["position:fixed", /position:fixed/], ["작은 단추", /44 아래/],
    ["me- 없는 클래스", /me- 앞가지가 없는/], ["맨 1fr", /맨 1fr/],
  ]) ok(`본보기의 「${이름}」을 잡았다`, 잡은것.some((b) => re.test(b)), 잡은것.join(" | "));
});

/* ══════════════════════════════════════════════════════════════════════
 * 5부 — 진짜 브라우저로 그려서 잰다 (320 · 390 · 768 · 1400)
 * ══════════════════════════════════════════════════════════════════════ */
const WIDTHS = [320, 390, 768, 1400];
const COARSE = new Set([320, 390, 768]);      // ⚠️ 아이패드(768)도 손가락 기계다 (오류 104)
const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => existsSync(p)) || null;

/** ⚠️ 화면 파일에서 클래스 이름을 그대로 따온 본이다. 글자는 **진짜 길이**로 넣는다 —
 *    Lorem ipsum 으로는 안 깨지고 진짜 단원 이름(90자대)으로는 깨진다 */
const 긴단원 = "PART 2 어법 › UNIT 03 관계사 › 관계대명사 what 과 관계부사 where 의 쓰임 구별하기 › Practice";
const 긴교재 = "어법끝 START 실력다지기 개정판";

const 화면본 = (깨진스타일 = "") => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>${읽기("app/globals.css")}</style>
<style>__MYCSS__</style>
<style>${깨진스타일}</style>
</head><body><main class="wrap">
<header class="me-head"><h1>이시은님, 안녕하세요</h1><span class="me-when num">2026년 9월 2일 (화)</span></header>
<div class="me-why"><b>화면이 비어 보이면 아래 까닭입니다.</b><ul><li>보강은 이 달력에 안 옵니다 — v2.makeup 에 아이 접근 규칙이 없습니다(0016). 원장님 화면에만 있어요.</li></ul></div>
<div class="me-cards">
  <div class="card">
    <div class="me-tool me-right"><span class="me-sub me-grip">⠿ 끌어서 옮기기</span>
      <button class="me-sq">▲</button><button class="me-sq">▼</button></div>
    <div class="me-cardhd"><span class="me-ttl">오늘 할 것</span><span class="pill pillinfo num">1 / 4</span><span class="chip">왔음</span></div>
    <p class="sunk">오늘은 관계사를 했고, 숙제는 워크북 2쪽입니다. 다음 시간에 단어시험이 있어요.</p>
    <section class="me-group">
      <div class="me-cardhd"><span class="me-ttl me-ttl2">학원에서 할 것</span><span class="pill pilloff num">0 / 2</span></div>
      <p class="me-sub">위에서부터 하나씩 해요. 앞엣것을 끝내야 다음 것이 열립니다.</p>
      <ul class="me-list">
        <li class="me-item"><span class="me-seq num">1</span><span class="me-body">
          <span class="me-name">숙제채점하고 오답 고치기</span>
          <span class="me-sub"><b>${긴교재}</b> · ${긴단원} · p.150~153</span>
          <span class="me-sub">이번 범위 · 12~19p, 짝수만</span></span>
          <span class="me-act"><span class="pill pilloff">학원에서 하는 것은 쌤이 확인합니다.</span></span></li>
        <li class="me-item is-later"><span class="me-seq num">2</span><span class="me-body">
          <span class="me-name">클래스카드 문장훈련</span><span class="me-sub">앞엣것을 끝내면 열려요.</span></span>
          <span class="me-act"><span class="pill pilloff">학원에서 하는 것은 쌤이 확인합니다.</span></span></li>
      </ul>
      <details class="me-fold" open><summary>다 한 것 2개 — 눌러서 보기</summary>
        <ul class="me-list me-mt"><li class="me-item is-done"><span class="me-seq num">3</span>
          <span class="me-body"><span class="me-name">단어시험</span><span class="me-sub">${긴단원}</span></span>
          <span class="me-act"><span class="pill pillok">다 함</span></span></li></ul></details>
    </section>
    <section class="me-group">
      <div class="me-cardhd"><span class="me-ttl me-ttl2">집에서 할 것</span><span class="pill pilloff num">0 / 1</span></div>
      <p class="me-sub">다 한 것은 ○ 을 눌러 주세요. ⚠️ 한 번 누르면 되돌릴 수 없어요.</p>
      <ul class="me-list"><li class="me-item"><span class="me-body">
        <span class="me-name">워크북 풀기</span><span class="me-sub">${긴교재} · ${긴단원}</span></span>
        <span class="me-act"><button class="me-sq">○ 다 했어요</button></span></li></ul>
    </section>
  </div>
  <div class="card">
    <div class="me-cardhd"><span class="me-ttl">내 교재</span><span class="pill pillwarn">진도 체크가 열려 있어요</span></div>
    <p class="me-sub">내가 한 데까지 ○ ◐ 로 찍어 주세요. 쌤이 확인하면 노란 테두리가 없어져요.</p>
    <div class="me-book">
      <div class="me-cardhd"><span class="me-ttl me-ttl2">${긴교재}</span><span class="chip num">2회독</span>
        <span class="pill pillinfo num">18 / 96</span></div>
      <div class="me-bar"><span style="width:19%"></span></div>
      <p class="sunk">이대로면 <b class="num">2026년 12월 14일 (월)</b>쯤 끝나요 <span class="me-sub">(예상이에요 · 최근 8주 속도로 셌습니다)</span><br>
        <span class="me-sub">⚠️ 휴강은 아이 화면에 안 내려와서 셈에 못 넣었어요 — 실제로는 조금 더 걸릴 수 있어요.</span></p>
      <div class="me-chap is-open"><button class="me-chaphd"><span class="me-chapnm">PART 2 어법 · 관계사와 접속사</span>
        <span class="pill pillinfo">지금 여기</span><span class="pill pilloff num">3 / 9</span><span>▾</span></button>
        <div class="me-chapbd">
          <div class="me-unit is-wait"><span class="me-body"><span class="me-name">UNIT 03 관계대명사 what</span>
            <span class="me-sub">Practice · 워크북</span></span><span class="chip">내가</span>
            <span class="pill pillwarn">확인 기다리는 중</span>
            <span class="me-mark"><button class="me-mk is-sel">○</button><button class="me-mk">◐</button><button class="me-mk">·</button></span>
            <button class="me-sq">❗</button></div>
          <div class="me-unit is-locked"><span class="me-body"><span class="me-name">${긴단원}</span></span>
            <span class="chip">쌤</span>
            <span class="me-mark"><button class="me-mk" disabled>○</button><button class="me-mk" disabled>◐</button><button class="me-mk" disabled>·</button></span>
            <button class="me-sq">❗</button></div>
          <div class="me-flag"><p class="me-sub">무엇이 잘못됐나요? ⚠️ 여기서 알려도 <b>진도는 바로 안 바뀌어요.</b></p>
            <label class="me-radio"><input type="radio" name="k"> 안 했는데 「했음」으로 돼 있어요</label>
            <label class="me-radio"><input type="radio" name="k"> 했는데 「안 함」으로 돼 있어요</label>
            <label class="lbl" for="say">하고 싶은 말 (안 써도 돼요)</label>
            <textarea id="say" placeholder="예: 1~5번만 했어요"></textarea>
            <div class="row me-right me-mt"><button class="btn btnghost">그만두기</button><button class="btn btnmain">쌤에게 알리기</button></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<section class="card me-mt4">
  <div class="me-calhd"><button class="me-sq">◀</button><span class="me-calnm num">2026년 9월</span><button class="me-sq">▶</button></div>
  <div class="calwrap"><div class="me-dow"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
  <div class="cal">${Array.from({ length: 30 }, (_, i) =>
    `<div class="calday"><span class="me-dnum num">${i + 1}</span>${i === 1 ? '<span class="pill pillinfo">오늘</span>' : ""}<span class="me-dot">${i % 3 === 0 ? "수업함 · 정리 중" : i % 3 === 1 ? "왔음 · 숙제 2" : "수업 예정"}</span></div>`).join("")}</div></div>
  <p class="me-sub">⚠️ 앞날에 보이는 것은 <b>「할 예정」</b>이에요.</p>
</section>
<!-- ⚠️ 로그아웃 단추는 여기 안 넣는다 — 그 css 는 app/logout-button.js 안에 있어 이 본에 안 실린다.
     빈 단추로 넣으면 「높이 22px」로 늘 빨개진다. 그 단추는 check-loginpage.mjs ⑬ 이 따로 잰다 -->
</main></body></html>`;

/** 페이지 안에서 도는 자. ⚠️ 이 글은 template literal 안이라 **역따옴표를 쓰면 안 된다** */
const 재는자 = `(() => {
  const S = (e) => getComputedStyle(e);
  const nm = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\\s+/).join(".") : "");
  const KOR = /[가-힣]/;
  const hit = [];
  const put = (k, e, why) => hit.push({ k, el: nm(e), why });
  const scrollBox = (e) => { const s = S(e); return /(auto|scroll)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflowY); };
  const inScrollBox = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (scrollBox(a)) return true; return false; };
  for (const e of document.querySelectorAll("main *")) {
    const s = S(e), r = e.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden") continue;
    if (r.width < 1 && r.height < 1) continue;
    const p = e.parentElement;
    if (p && p !== document.body && !scrollBox(p)) {
      const pr = p.getBoundingClientRect();
      if (r.right - pr.right > 1 || pr.left - r.left > 1)
        put(1, e, "부모 밖으로 " + Math.round(Math.max(r.right - pr.right, pr.left - r.left)) + "px");
    }
    if (s.position !== "fixed" && (r.right - innerWidth > 1 || r.left < -1) && !inScrollBox(e))
      put(2, e, "화면(" + innerWidth + "px) 밖으로 " + Math.round(Math.max(r.right - innerWidth, -r.left)) + "px");
    if (e.tagName === "BUTTON") {
      if (r.height > 0 && r.height < 43) put(3, e, "단추 높이 " + Math.round(r.height) + "px — 손가락으로 못 누른다");
      if (r.height > 58 && r.width < 120) put(4, e, Math.round(r.width) + "x" + Math.round(r.height) + " — 단추가 세로로 늘어났다");
    }
    if (Number(s.opacity) < 1 && !e.classList.contains("is-drag")) put(5, e, "opacity " + s.opacity);
    const own = [...e.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join("").trim();
    if (own && KOR.test(own) && own.length > 6) {
      const fs = parseFloat(s.fontSize);
      if (r.width > 0 && r.width < fs * 3 && r.height > fs * 4) put(6, e, "글자가 세로로 쌓였다 (" + Math.round(r.width) + "x" + Math.round(r.height) + ")");
    }
  }
  const 글치는칸 = [...document.querySelectorAll("input, textarea, select")]
    .filter((e) => !/^(checkbox|radio|range)$/.test(e.type || ""));
  const io = 글치는칸.map((e) => parseFloat(S(e).fontSize));
  return JSON.stringify({ hit, io, w: innerWidth });
})()`;

async function 브라우저열기() {
  const dir = mkdtempSync(join(tmpdir(), "chk-me-"));
  const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "about:blank"],
    { stdio: ["ignore", "ignore", "ignore"] });
  let port = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const f = join(dir, "DevToolsActivePort");
    if (existsSync(f)) { const s = readFileSync(f, "utf8").split("\n"); if (s[0]?.trim()) { port = s[0].trim(); break; } }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) { proc.kill(); throw new Error("크롬이 디버깅 포트를 안 열었다"); }
  // ⚠️ 폭마다 **새 탭**이다 — 손가락 흉내는 한 번 켜면 그 탭에서 되돌아가지 않는다(check-layout 실측)
  const newPage = async () => {
    const tgt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(tgt.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
    let id = 0; const waiting = new Map();
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Page.enable"); await send("Runtime.enable");
    const close = async () => { try { ws.close(); } catch {} try { await fetch(`http://127.0.0.1:${port}/json/close/${tgt.id}`); } catch {} };
    return { send, close };
  };
  return { newPage, close: () => proc.kill() };
}

async function 재기(br, html, width, coarse) {
  const pg = await br.newPage();
  await pg.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  if (coarse) await pg.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await pg.send("Emulation.setEmulatedMedia", {
    features: [{ name: "pointer", value: coarse ? "coarse" : "fine" },
               { name: "any-pointer", value: coarse ? "coarse" : "fine" },
               { name: "hover", value: coarse ? "none" : "hover" }],
  });
  await pg.send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) });
  await new Promise((r) => setTimeout(r, 350));
  const res = await pg.send("Runtime.evaluate", { expression: 재는자, returnByValue: true, awaitPromise: true });
  await pg.close();
  if (res.result?.exceptionDetails) throw new Error("페이지 안 검사가 터졌다: " + JSON.stringify(res.result.exceptionDetails).slice(0, 300));
  return JSON.parse(res.result.result.value);
}

await sec("■ ㉑ 진짜 브라우저로 그려서 잰다", async () => {
  if (!CHROME) {
    // ⚠️ 「있는 척」이 제일 나쁘다 — 브라우저가 없으면 **못 쟀다고 말하고 실패시킨다**
    ok("크롬이 있어야 이 자리를 잴 수 있다", false, "크롬·크로미움·엣지가 없다 (설치하면 이 자리가 돈다)");
    return;
  }
  const { css } = await import(new URL("app/me/style.js", ROOT).href);
  const 본 = (깨짐) => 화면본(깨짐).replace("__MYCSS__", css);
  const br = await 브라우저열기();
  try {
    for (const w of WIDTHS) {
      const coarse = COARSE.has(w);
      const r = await 재기(br, 본(""), w, coarse);
      const 종류 = { 1: "부모 밖으로", 2: "화면 밖으로", 3: "작은 단추", 4: "늘어난 단추", 5: "투명도", 6: "세로로 쌓인 글자" };
      const 줄 = r.hit.map((h) => `${종류[h.k]}: ${h.el} — ${h.why}`);
      ok(`${w}px — 어긴 것 0건${줄.length ? "\n        " + 줄.slice(0, 6).join("\n        ") : ""}`, r.hit.length === 0);
      ok(`${w}px — 폭을 제대로 받았다 (${r.w}px)`, r.w === w);
      const 바닥 = coarse ? 16 : 14;
      ok(`${w}px — 입력칸 글씨가 ${바닥}px 이상 (${r.io.join("/") || "없음"})`,
         r.io.length > 0 && r.io.every((v) => v >= 바닥),
         coarse ? "16 밑이면 사파리가 화면을 확대하고 닫아도 확대가 남는다" : "PC 에서 둘레보다 커 보이면 안 된다");
    }

    // ⚠️ **일부러 어긴 본보기** — 브라우저 검사가 그것을 잡는지까지 확인한다
    const 깨짐 = `.me-body{flex:1 1 0}
      .me-sq{min-height:20px}
      .me-item{opacity:.5}
      .me-book{width:2400px}
      .me-name{display:block;width:14px}`;
    const b = await 재기(br, 본(깨짐), 390, true);
    const 있나 = (k) => b.hit.some((h) => h.k === k);
    ok("본보기의 「부모 밖으로 삐져나감」을 잡았다", 있나(1), JSON.stringify(b.hit.slice(0, 3)));
    ok("본보기의 「화면 밖으로 나감」을 잡았다", 있나(2));
    ok("본보기의 「작은 단추」를 잡았다", 있나(3));
    ok("본보기의 「투명도」를 잡았다", 있나(5));
    ok("본보기의 「세로로 쌓인 글자」를 잡았다", 있나(6), JSON.stringify(b.hit.filter((h) => h.k === 6).slice(0, 2)));
  } finally { br.close(); }
});

console.log(`\n■ 학생 화면 검사 ${n}건 · 실패 ${fail}`);
if (fail) {
  console.log("\n■ 코드로는 못 고치는 것 (이 줄을 지우지 마라)");
  console.log("   · PostgREST 가 v2 스키마를 안 내보낸다 → 이 화면의 모든 조회가 PGRST106 으로 막힌다");
  console.log("   · .env.local 에 NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없다 → 아무도 로그인 못 한다");
  process.exit(1);
}
