/** 앱 전체가 설명하지 않는다 — 검사-88((어14) · 대전제-15 를 01 밖으로. 원장님 2026-09-14 「ㅇㅇ가가가 무조건가」).
 *  2026-09-14 실측(01 뺀 32 화면): ⓘ 7 · 마우스 대면 설명 26 · 「~합니다」 설명 문장 29 · 14자 넘는 단추 6 · 960 폭 6 → 걷은 뒤 ⓘ 1 · 설명 title 0 · 문장 5(빈 자리 상태 글) · 긴 단추 0 · 960 0.
 *  남긴 예외 둘(늘어나면 여기서 잡힌다): ① 발송 10 「켜는 법」 ⓘ — 앱 쓰임이 아니라 Vercel 에서 켜는 법 ② 잘린 글의 원문을 대는 title={…}(내용이지 설명이 아니다). 글자 검사는 주석을 먼저 지운다(폰-5) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.js$/.test(f) ? [p] : []; });
const src = files("app").filter((p) => !p.includes("/api/")).map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const 한글 = (t) => t.replace(/[^가-힣]/g, "").length;
const noExpr = (t) => { let o = "", d = 0; for (const ch of t) { if (ch === "{") d++; else if (ch === "}") { if (d > 0) d--; } else if (d === 0) o += ch; } return o; };
function labels(s) { const out = []; let i = 0; while ((i = s.indexOf("<button", i)) !== -1) { let j = i + 7, d = 0; for (; j < s.length; j++) { const ch = s[j]; if (ch === "{") d++; else if (ch === "}") d--; else if (ch === ">" && d === 0) break; } const end = s.indexOf("</button>", j); if (end === -1) break; const tag = s.slice(i, j); out.push({ tag, text: noExpr(s.slice(j + 1, end)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() }); i = end + 9; } return out; }
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
console.log("■ 앱 전체 — 설명하지 않는다 · 이름이 말한다(대전제-15)");
const tips = src.filter(([, s]) => /<Tip\b/.test(s)).map(([p]) => p);
ok("ⓘ Tip 은 발송 10 「켜는 법」 하나뿐(앱 밖 Vercel 켜는 법 — 예외 ①)", tips.length === 1 && tips[0] === "app/send/board.js", tips.join(", "));
const deadImport = src.filter(([, s]) => /^import Tip from/m.test(s) && !/<Tip\b/.test(s)).map(([p]) => p);
ok("안 쓰는 Tip import 0", deadImport.length === 0, deadImport.join(", "));
// html 요소(<span <a <div …)의 여는 태그를 중괄호 깊이를 세며 끝까지 읽는다 — 태그 안 {a > b} 식을 만나면 <[^>]*> 가 끊겨 title 을 못 보던 구멍((어16) — 성적 ▲ 꼬리표의 title 셋이 숨어 있었다). 부품(<Card title=)의 title 은 제목이지 설명이 아니라 안 센다
function htmlTags(s) { const out = []; let i = 0; while ((i = s.indexOf("<", i)) !== -1) { if (!/[a-z]/.test(s[i + 1] ?? "")) { i++; continue; } let j = i + 1, d = 0; for (; j < s.length; j++) { const ch = s[j]; if (ch === "{") d++; else if (ch === "}") d--; else if (ch === ">" && d === 0) break; } out.push(s.slice(i, j)); i = j; } return out; }
const titles = src.flatMap(([p, s]) => htmlTags(s).flatMap((t) => [...t.matchAll(/\stitle="([^"]*)"/g)].map((m) => `${p}: ${m[1].slice(0, 40)}`)));
ok("마우스 대면 뜨는 설명(글자 title=\"…\") 0 — 폰엔 마우스가 없다 · 잘린 글의 원문을 대는 title={…} 만 남는다(예외 ②)", titles.length === 0, titles.slice(0, 5).join(" | "));
const dyn = src.flatMap(([p, s]) => htmlTags(s).filter((t) => /\stitle=\{/.test(t)).map(() => p));
ok(`내용을 대는 title={…} ≤ 3(지금 ${dyn.length} — 발송 10 자취 원문 · 학생 14 자료 이름 · 문자틀 note)`, dyn.length <= 3, dyn.join(", "));
const texts = src.flatMap(([p, s]) => [...s.matchAll(/(?:className="note[^"]*"[^>]*>|<small[^>]*>|placeholder="?)([^<{"]*)/g)].map((m) => [p, m[1].trim()]).filter(([, t]) => 한글(t) >= 2));
const explain = texts.filter(([, t]) => /(합니다|됩니다|십시오|세요|입니다)[.)]?$/.test(t) || /(합니다|됩니다) —/.test(t));
ok(`note·small·placeholder 의 「~합니다」 문장 ≤ 6(지금 ${explain.length} — 남은 것은 빈 자리 상태 글 「교재를 고르세요」류 · 9/14 걷기 전 29)`, explain.length <= 6, explain.map(([p, t]) => `${p.split("/").slice(1, 3).join("/")}: ${t.slice(0, 30)}`).join(" | "));
const longBtn = src.flatMap(([p, s]) => labels(s).filter((b) => 한글(b.text) >= 1 && b.text.length > 14 && !/className="donehead/.test(b.tag)).map((b) => `${p}: ${b.text}`));
ok("14자 넘는 단추 이름 0(접기 머리 .donehead 는 요약 줄이라 뺀다)", longBtn.length === 0, longBtn.join(" | "));
// (어16) 아이·학부모 화면은 「~요」 말투라 위 잣대가 못 쟀다(2026-09-14 실측 설명 문장 71 → 걷은 뒤 상태 글만) — 열두 자 넘는 「~요·~다」 문장이 설명이다(「낼 숙제가 없어요」 같은 상태 글은 짧다)
const kidFiles = src.filter(([p]) => /^app\/(me|parent)\//.test(p) || /^app\/_shell\/(bell|askcard|noticecard|calview|upload|photo|asband)\.js$/.test(p));
const kidTexts = kidFiles.flatMap(([p, s]) => [...s.matchAll(/(?:className="note[^"]*"[^>]*>|<small[^>]*>|placeholder="?|hint="|<p[^>]*>)([^<{"]*)/g)].map((m) => [p, m[1].trim()]).filter(([, t]) => 한글(t) >= 12));
const kidExplain = kidTexts.filter(([, t]) => /(요|다|니다|세요)[.)]?$/.test(t) || / — .{6,}/.test(t));
ok(`아이·학부모 화면(07·08·19·달력·09 + 공용 조각)의 열두 자 넘는 「~요·~다」 설명 문장 ≤ 4(지금 ${kidExplain.length} — 남은 것은 🔔 알림 켜는 길·막힌 까닭 · 학부모 결석 안내 방침)`, kidExplain.length <= 4, kidExplain.map(([p, t]) => `${p.split("/").slice(1, 3).join("/")}: ${t.slice(0, 32)}`).join(" | "));
const w960 = src.filter(([, s]) => /maxWidth: 960\b/.test(s)).map(([p]) => p);
ok("학원 화면 폭 960 은 0 — 1100 부터(원장님 9/13 「pc부터」 · 01 은 1400 두 열)", w960.length === 0, w960.join(", "));
console.log(`\n■ 앱 전체 말 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
