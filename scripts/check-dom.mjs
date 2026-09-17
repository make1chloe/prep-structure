/** 화면 DOM 규칙의 글자 검사(검사-72 · (라) 2026-09-08) — 지킴이 없던 규칙 다섯이 실제로 새어 있었다(confirm 6곳 · datalist 1곳 · 글씨 opacity 3곳): 대전제-10·검사-④ alert/confirm/prompt 0(한 번 더 묻기는 화면 안 Sure 하나) · 대전제-9 pushState·body 스크롤 잠금 0 · createPortal 은 오늘 01 줄 끝 저장줄 하나(폰-6) · 0-7 datalist 0(아이폰에서 안 보인다 — 있는 값은 칩으로) · 폰-9·확정-㉖ 글씨 opacity 0(색으로 말한다 · 아이콘 투명도는 목업 CSS 몫) · 대전제-10 전면 화면(mdlov)마다 닫는 길. 주석은 먼저 지운다(폰-5) */
import { readFileSync, readdirSync, statSync } from "node:fs"; import { join } from "node:path";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const src = [...files("lib"), ...files("app")].map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const where = (re) => src.filter(([, s]) => re.test(s)).map(([p]) => p);
console.log("■ 화면 DOM 규칙(글자)");
const dlg = where(/(?<![\w.$])(?:window\.)?(?:alert|confirm|prompt)\(/);
ok("대전제-10·검사-④ alert/confirm/prompt 0 · 한 번 더 묻기는 화면 안(Sure · 「아니요」가 늘 산다)", dlg.length === 0, dlg.join(", "));
const sureUse = src.filter(([p, s]) => !p.endsWith("_shell/sure.js") && /<Sure\b/.test(s)).map(([p]) => p);
ok(`Sure 를 쓰는 화면 ${sureUse.length}곳(수강료 다 받음 · 루틴 항목 삭제·교재 끝내기 · 반 닫기 · 달 확정 · 공지 보내기) · 물음 줄 부품(data-act=sure-yes)은 sure.js 하나`, sureUse.length >= 5 && where(/data-act="sure-yes"/).length === 1 && where(/data-act="sure-yes"/)[0] === "app/_shell/sure.js", sureUse.join(", ") + " · sure-yes: " + where(/data-act="sure-yes"/).join(", "));
const noHook = src.filter(([p, s]) => !p.endsWith("_shell/sure.js") && /<Sure\b/.test(s) && !/useSure\(\)/.test(s)).map(([p]) => p);
ok("Sure 를 그리는 파일마다 useSure() 가 있다(빠지면 sure 가 없어 화면이 통째로 터진다. 게이트 66 이 /ops 에서 잡음)", noHook.length === 0, noHook.join(", "));
const hist = where(/history\.(pushState|replaceState)\(|\bpushState\(/);
ok("대전제-9 history.pushState/replaceState 로 닫기 0", hist.length === 0, hist.join(", "));
const lock = where(/body\.style\b|document\.body\.classList|body\.setAttribute\(["']style/);
ok("대전제-9 position:fixed 스크롤 잠금 0(body.style·body class 로 스크롤을 못 잠근다. 전면 화면은 목업 .mdlov)", lock.length === 0, lock.join(", "));
const portals = src.filter(([, s]) => /createPortal\(/.test(s)).map(([p, s]) => `${p}×${(s.match(/createPortal\(/g) ?? []).length}`);
ok("대전제-9 createPortal 은 오늘 01 줄 끝 저장줄 하나뿐(app/today/row.js · 줄의 직접 자식이라야 sticky 가 줄 안에 붙는다 · 폰-6 · 예외 하나)", portals.length === 1 && portals[0] === "app/today/row.js×1", portals.join(", "));
const dl = where(/<datalist\b|\blist=["'{]/);
ok("0-7 datalist 0(아이폰에서 안 보인다. 있는 값은 칩으로 · 영상 폴더)", dl.length === 0, dl.join(", "));
const op = src.filter(([p]) => p.startsWith("app/")).filter(([, s]) => /\bopacity\b/.test(s)).map(([p]) => p);
ok("폰-9·확정-㉖ 글씨를 opacity 로 흐리게 0 · 색(--mute·--faint)으로 말한다 · 아이콘 투명도는 목업 CSS 몫", op.length === 0, op.join(", "));
const modals = src.filter(([, s]) => /className="mdlov"|className=\{[^}]*mdlov/.test(s)); const noClose = modals.filter(([, s]) => !/닫기|data-act="close"/.test(s)).map(([p]) => p);
ok(`대전제-10 전면 화면(mdlov ${modals.length}파일)마다 닫는 길이 화면 안에 있다(「닫기」)`, modals.length > 0 && noClose.length === 0, noClose.join(", "));
const css = readFileSync("app/globals.css", "utf8");
const ALLOW = [".sortrow .sel"];   /* 목업이 정한 자손 규칙 — 그 안에 같은 이름의 다른 부품이 안 들어간다 */
const desc = [...css.matchAll(/([^,{}\n]*?) \.(open|on|act|sel|hi|closed|done)\b[^{,]*\{/g)].map((m) => m[0].replace(/\{$/, "").trim()).filter((s) => !ALLOW.includes(s));
ok("폰-9 클래스 이름 겹침 · 자손 선택자 끝이 맨 상태 이름(.open .on .act .sel .hi .closed .done)인 규칙 0(상태 이름은 요소에 붙인다: button.open · .acc.open · 9/8 원장님 폰이 잡음: 02b 펼친 대단원이 줄의 펴기 단추 규칙에 물려 파랗게 칠해졌다)", desc.length === 0, desc.join(" | "));
/* (어72) 서버 화면이 **눌리는 조각**(「use client」)에 함수를 건네면 그 화면이 통째로 안 열린다 —
   Next 가 「Functions cannot be passed directly to Client Components」로 막고, 07 이 <Oops> 만 그렸다(2026-09-17 게이트가 잡음).
   카드 틀(Card)처럼 부품을 넘기고 싶으면 서버 쪽에서 틀을 씌우고 조각은 속만 그린다. */
const RAW = new Map([...files("app"), ...files("lib")].map((p) => [p.replace(/\\/g, "/"), readFileSync(p, "utf8")]));
const isClient = (p) => /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(RAW.get(p) ?? "");
const resolve = (from, rel) => { const a = from.split("/").slice(0, -1); for (const seg of rel.split("/")) { if (seg === ".") continue; if (seg === "..") a.pop(); else a.push(seg); } return a.join("/"); };
const handed = [];
for (const [p, body] of RAW) {
  if (isClient(p) || !p.startsWith("app/")) continue;
  const code = strip(body);
  for (const m of code.matchAll(/import\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g)) {
    const target = resolve(p, m[2]); if (!isClient(target)) continue;
    const names = [...m[1].matchAll(/([A-Z][A-Za-z0-9_]*)(?:\s+as\s+([A-Z][A-Za-z0-9_]*))?/g)].map((x) => x[2] ?? x[1]);
    for (const name of new Set(names)) for (const tag of code.matchAll(new RegExp(`<${name}\\b([^>]*)`, "g"))) {
      for (const at of tag[1].matchAll(/([A-Za-z][A-Za-z0-9_]*)=\{\s*(?:async\b|function\b|\([^)]*\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>|([A-Z][a-z][A-Za-z0-9_]*)\s*\})/g))
        handed.push(`${p} <${name} ${at[1]}=`);
    }
  }
}
ok("서버 화면이 눌리는 조각(use client)에 함수를 안 건넨다(건네면 그 화면이 통째로 안 열린다 · 틀은 서버 쪽에서 씌운다)", handed.length === 0, [...new Set(handed)].join(", "));
console.log(`\n■ 화면 DOM 검사 ${n}건 · 실패 ${bad}`); process.exit(bad ? 1 : 0);
