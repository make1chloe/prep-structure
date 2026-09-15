/** 앱 전체가 설명하지 않는다 — 검사-88((어14) · 대전제-15 를 01 밖으로. 원장님 2026-09-14 「ㅇㅇ가가가 무조건가」).
 *  2026-09-14 실측(01 뺀 32 화면): ⓘ 7 · 마우스 대면 설명 26 · 「~합니다」 설명 문장 29 · 14자 넘는 단추 6 · 960 폭 6 → 걷은 뒤 ⓘ 1 · 설명 title 0 · 문장 5(빈 자리 상태 글) · 긴 단추 0 · 960 0.
 *  남긴 예외 둘(늘어나면 여기서 잡힌다): ① 발송 10 「켜는 법」 ⓘ — 앱 쓰임이 아니라 Vercel 에서 켜는 법 ② 잘린 글의 원문을 대는 title={…}(내용이지 설명이 아니다). 글자 검사는 주석을 먼저 지운다(폰-5) */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.js$/.test(f) ? [p] : []; });
const src = files("app").filter((p) => !p.includes("/api/")).map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const 한글 = (t) => t.replace(/[^가-힣]/g, "").length;   // (어17) 부품 속성(small= · note= · hint=)에 적힌 글도 센다 — 대시보드 17 에 설명 넷이 그렇게 숨어 있었다(세 번째 구멍)
const noExpr = (t) => { let o = "", d = 0; for (const ch of t) { if (ch === "{") d++; else if (ch === "}") { if (d > 0) d--; } else if (d === 0) o += ch; } return o; };
function labels(s) { const out = []; let i = 0; while ((i = s.indexOf("<button", i)) !== -1) { let j = i + 7, d = 0; for (; j < s.length; j++) { const ch = s[j]; if (ch === "{") d++; else if (ch === "}") d--; else if (ch === ">" && d === 0) break; } const end = s.indexOf("</button>", j); if (end === -1) break; const tag = s.slice(i, j); out.push({ tag, text: noExpr(s.slice(j + 1, end)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() }); i = end + 9; } return out; }
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
console.log("■ 앱 전체 · 설명하지 않는다 · 이름이 말한다(대전제-15)");
const tips = src.filter(([, s]) => /<Tip\b/.test(s)).map(([p]) => p);
ok("ⓘ Tip 은 발송 10 「켜는 법」 하나뿐(앱 밖 Vercel 켜는 법 · 예외 ①)", tips.length === 1 && tips[0] === "app/send/board.js", tips.join(", "));
const deadImport = src.filter(([, s]) => /^import Tip from/m.test(s) && !/<Tip\b/.test(s)).map(([p]) => p);
ok("안 쓰는 Tip import 0", deadImport.length === 0, deadImport.join(", "));
// html 요소(<span <a <div …)의 여는 태그를 중괄호 깊이를 세며 끝까지 읽는다 — 태그 안 {a > b} 식을 만나면 <[^>]*> 가 끊겨 title 을 못 보던 구멍((어16) — 성적 ▲ 꼬리표의 title 셋이 숨어 있었다). 부품(<Card title=)의 title 은 제목이지 설명이 아니라 안 센다
function htmlTags(s) { const out = []; let i = 0; while ((i = s.indexOf("<", i)) !== -1) { if (!/[a-z]/.test(s[i + 1] ?? "")) { i++; continue; } let j = i + 1, d = 0; for (; j < s.length; j++) { const ch = s[j]; if (ch === "{") d++; else if (ch === "}") d--; else if (ch === ">" && d === 0) break; } out.push(s.slice(i, j)); i = j; } return out; }
// (어39) 원장님 2026-09-15 「모를 거 같으면 tooltips 몰라? … 그냥 명사 1개 두 개로 끝내라」 · 툴팁(title="…")은 써도 되지만 **명사 하나 둘**(낱말 ≤ 2 · 한글 ≤ 8자 · 문장 아님)
const titles = src.flatMap(([p, s]) => htmlTags(s).flatMap((t) => [...t.matchAll(/\stitle="([^"]*)"/g)].map((m) => [p, m[1]])));
const longTitles = titles.filter(([, t]) => t.trim().split(/\s+/).length > 2 || 한글(t) > 8 || /(습니다|입니다|합니다|됩니다|세요|십시오)[.)]?$/.test(t.trim())).map(([p, t]) => `${p}: ${t.slice(0, 30)}`);
ok(`툴팁(title="…")은 명사 하나 둘 · 낱말 ≤ 2 · 8자 이하 · 문장 아님(지금 ${titles.length}개 중 긴 것 0)`, longTitles.length === 0, longTitles.slice(0, 5).join(" | "));
const dyn = src.flatMap(([p, s]) => htmlTags(s).filter((t) => /\stitle=\{/.test(t)).map(() => p));
ok(`내용을 대는 title={…} ≤ 4(지금 ${dyn.length} · 발송 10 자취 원문 · 발송 10 상태 아이콘 툴팁((어39) 명사 하나) · 학생 14 자료 이름 · 문자틀 note)`, dyn.length <= 4, dyn.join(", "));
const texts = src.flatMap(([p, s]) => [...s.matchAll(/(?:className="note[^"]*"[^>]*>|<small[^>]*>|placeholder="?|\s(?:small|note|hint|text|sub)=")([^<{"]*)/g)].map((m) => [p, m[1].trim()]).filter(([, t]) => 한글(t) >= 2));
const explain = texts.filter(([, t]) => /(합니다|됩니다|십시오|세요|입니다)[.)]?$/.test(t) || /(합니다|됩니다) · /.test(t));
ok(`note·small·placeholder 의 「~합니다」 문장 ≤ 6(지금 ${explain.length} · 남은 것은 빈 자리 상태 글 「교재를 고르세요」류 · 9/14 걷기 전 29)`, explain.length <= 6, explain.map(([p, t]) => `${p.split("/").slice(1, 3).join("/")}: ${t.slice(0, 30)}`).join(" | "));
// (어39) 대전제-21 「설명은 간접 표시로」(원장님 2026-09-15 「글 대신 기호·아이콘·취소선·투명도 … 그런 간접적 방식으로 설명을 대체하라는 거잖아」) · 화면 글 토큰(String · Template · JSXText · 주석 뺌)의 「~니다 · ~세요 · ~십시오」 문장을 **파일마다** 센다.
//   래칫: 파일마다 ≤ 기준(2026-09-15 실측 · 내려만 간다 · 없는 파일은 0) · 새 화면은 문장 없이 짓고, 고친 화면은 기준을 내린다. 상태는 아이콘·흐림·취소선·태그로, 글은 이름과 숫자로.
{ const espree = (await import("espree")).default ?? (await import("espree"));
  const SENT_MAX = { "app/books/board.js": 46, "app/settings/routine/board.js": 38, "app/ops/students/board.js": 36, "app/schedule/todo/board.js": 31, "app/schedule/grid/board.js": 27, "app/schedule/exams/board.js": 20, "app/schedule/exams/prep/board.js": 19, "app/today/row.js": 18, "lib/dash-plan.js": 18, "app/scores/board.js": 17, "app/schedule/panel.js": 16, "lib/comment-plan.js": 16, "app/schedule/classes/board.js": 14, "app/ops/files/board.js": 13, "app/ops/inquiry/board.js": 13, "app/settings/progress/board.js": 13, "lib/integration-plan.js": 13, "lib/todo-plan.js": 13, "app/schedule/import/board.js": 12, "lib/push-plan.js": 12, "app/books/videos/board.js": 11, "app/parent/page.js": 11, "lib/inquiry-plan.js": 11, "app/send/notice/board.js": 10, "app/today/page.js": 10, "lib/book-plan.js": 10, "lib/class-plan.js": 10, "lib/files-plan.js": 10, "app/ops/fee.js": 8, "app/page.js": 8, "lib/grid-plan.js": 8, "lib/cc-plan.js": 7, "app/send/templates.js": 6, "lib/score-plan.js": 6, "lib/student-plan.js": 6, "app/me/page.js": 5, "app/ops/actions.js": 5, "app/send/board.js": 5, "app/send/monthly/board.js": 5, "lib/day-plan.js": 5, "lib/exam-plan.js": 5, "lib/video-plan.js": 5, "app/login/page.js": 4, "app/ops/inquiry/page.js": 4, "app/ops/students/page.js": 4, "app/password/actions.js": 4, "app/password/page.js": 4, "app/schedule/page.js": 4, "app/scores/actions.js": 4, "lib/neis-plan.js": 4, "lib/schedule-plan.js": 4, "lib/site-plan.js": 4, "lib/sms-plan.js": 4, "app/_shell/oops.js": 3, "app/_shell/schoolscard.js": 3, "app/books/actions.js": 3, "app/books/page.js": 3, "app/books/videos/page.js": 3, "app/login/actions.js": 3, "app/ops/files/page.js": 3, "app/push/actions.js": 3, "app/schedule/classes/page.js": 3, "app/schedule/exams/page.js": 3, "app/schedule/exams/prep/page.js": 3, "app/schedule/grid/page.js": 3, "app/schedule/import/page.js": 3, "app/schedule/todo/page.js": 3, "app/scores/page.js": 3, "app/send/monthly/page.js": 3, "app/send/notice/page.js": 3, "app/send/page.js": 3, "app/settings/progress/page.js": 3, "app/settings/routine/page.js": 3, "app/today/prep.js": 3, "lib/notify-plan.js": 3, "lib/quiz-plan.js": 3, "app/_shell/asband.js": 2, "app/_shell/bell.js": 2, "app/_shell/upload.js": 2, "app/me/actions.js": 2, "app/settings/access/page.js": 2, "app/settings/actions.js": 2, "app/settings/ipcard.js": 2, "app/settings/keys.js": 2, "app/today/band.js": 2, "lib/cal-plan.js": 2, "lib/notice-plan.js": 2, "lib/parent-plan.js": 2, "lib/routine-plan.js": 2, "lib/send-plan.js": 2, "app/_shell/answer-actions.js": 1, "app/_shell/pref-actions.js": 1, "app/_shell/school-actions.js": 1, "app/_shell/scopeform.js": 1, "app/books/videos/actions.js": 1, "app/me/videos/page.js": 1, "app/ops/files/actions.js": 1, "app/ops/inquiry/actions.js": 1, "app/ops/students/actions.js": 1, "app/parent/actions.js": 1, "app/schedule/actions.js": 1, "app/schedule/classes/actions.js": 1, "app/schedule/exams/actions.js": 1, "app/schedule/exams/prep/actions.js": 1, "app/schedule/grid/actions.js": 1, "app/schedule/todo/actions.js": 1, "app/send/actions.js": 1, "app/send/monthly/actions.js": 1, "app/send/notice/actions.js": 1, "app/settings/page.js": 1, "app/settings/progress/actions.js": 1, "app/settings/routine/actions.js": 1, "app/today/actions.js": 1, "lib/fee-plan.js": 1, "lib/late-plan.js": 1 };
  const scan = [...files("app").filter((p) => !p.includes("/api/")), ...readdirSync("lib").filter((f) => /-plan\.js$|^menu\.js$/.test(f)).map((f) => "lib/" + f)].map((p) => p.replace(/\\/g, "/"));
  const cnt = {}; let total = 0;
  for (const f of scan) { let toks; try { toks = espree.parse(readFileSync(f, "utf8"), { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, tokens: true }).tokens; } catch { continue; }
    for (const t of toks) if (["String", "Template", "JSXText"].includes(t.type) && /(니다|세요|십시오)/.test(t.value)) { cnt[f] = (cnt[f] ?? 0) + 1; total++; } }   // 「~니다」 전부(나갑니다 · 갑니다도) + 「~세요 · ~십시오」
  const over = Object.entries(cnt).filter(([f, c]) => c > (SENT_MAX[f] ?? 0)).map(([f, c]) => `${f} ${c} > ${SENT_MAX[f] ?? 0}`);
  const base = Object.values(SENT_MAX).reduce((a, b) => a + b, 0);
  ok(`화면 글의 「~니다 · ~세요」 문장 · 파일마다 기준 이하(지금 ${total} · 기준 ${base} · 내려만 간다 · 새 파일은 0)`, over.length === 0, over.slice(0, 6).join(" | "));
  const slack = Object.entries(SENT_MAX).filter(([f, m]) => (cnt[f] ?? 0) < m).map(([f, m]) => `${f} ${cnt[f] ?? 0}/${m}`);
  if (slack.length) console.log(`   ↓ 기준을 내릴 수 있는 파일 ${slack.length}: ${slack.slice(0, 8).join(" · ")}`); }
const longBtn = src.flatMap(([p, s]) => labels(s).filter((b) => 한글(b.text) >= 1 && b.text.length > 14 && !/className="donehead/.test(b.tag)).map((b) => `${p}: ${b.text}`));
ok("14자 넘는 단추 이름 0(접기 머리 .donehead 는 요약 줄이라 뺀다)", longBtn.length === 0, longBtn.join(" | "));
// (어16) 아이·학부모 화면은 「~요」 말투라 위 잣대가 못 쟀다(2026-09-14 실측 설명 문장 71 → 걷은 뒤 상태 글만) — 열두 자 넘는 「~요·~다」 문장이 설명이다(「낼 숙제가 없어요」 같은 상태 글은 짧다)
const kidFiles = src.filter(([p]) => /^app\/(me|parent)\//.test(p) || /^app\/_shell\/(bell|askcard|noticecard|calview|upload|photo|asband)\.js$/.test(p));
const kidTexts = kidFiles.flatMap(([p, s]) => [...s.matchAll(/(?:className="note[^"]*"[^>]*>|<small[^>]*>|placeholder="?|\s(?:small|note|hint|text|sub)="|<p[^>]*>)([^<{"]*)/g)].map((m) => [p, m[1].trim()]).filter(([, t]) => 한글(t) >= 12));
const kidExplain = kidTexts.filter(([, t]) => /(요|다|니다|세요)[.)]?$/.test(t) || / · .{6,}/.test(t));
ok(`아이·학부모 화면(07·08·19·달력·09 + 공용 조각)의 열두 자 넘는 「~요·~다」 설명 문장 ≤ 4(지금 ${kidExplain.length} · 남은 것은 🔔 알림 켜는 길·막힌 까닭 · 학부모 결석 안내 방침)`, kidExplain.length <= 4, kidExplain.map(([p, t]) => `${p.split("/").slice(1, 3).join("/")}: ${t.slice(0, 32)}`).join(" | "));
const w960 = src.filter(([, s]) => /maxWidth: 960\b/.test(s)).map(([p]) => p);
ok("학원 화면 폭 960 은 0 · 학원 화면은 1400 · 카드 목록은 두 열 .frame.cols(원장님 9/13 「pc부터」 · 9/14 「pc에서 배치가 비효율적이야」 · (어19) · 1100 은 check-phone 이 잡는다)", w960.length === 0, w960.join(", "));
// (어18) 「회차」는 수업 회차만(원장님 2026-09-14 「나는 회차를 수업 회차를 세는데만 써. 시험고르기로 바꾸든 용어를 바꿔」) — 학교 시험은 「시험」·「학교 시험」·「시험 고르기」. 주석을 지운 코드(app + api + lib)에서 시험을 뜻하는 「회차」 꼴을 찾는다
const allSrc = [...files("app"), ...files("lib")].map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const examWord = /회차 고르기|시험 회차|회차가 없|회차가 아|지난 회차|이 회차|본 회차|그 회차|고른 회차|회차의 |회차를 고|회차에서 범위|회차 판/;
const examHits = allSrc.flatMap(([p, s]) => s.split("\n").filter((l) => examWord.test(l)).map((l) => `${p}: ${l.trim().slice(0, 60)}`));
ok("「회차」는 수업 회차뿐 · 학교 시험을 회차라 부르는 글 0(「시험」·「학교 시험」·「시험 고르기」로 · 06b 이름 「🏫 학교 시험」)", examHits.length === 0 && /🏫 학교 시험/.test(readFileSync("app/_shell/sibs.js", "utf8")), examHits.slice(0, 5).join(" | "));
// (어22) 「—」 안 쓴다(대전제-18 · 원장님 2026-09-15 「— 이 표시좀 쓰지마 쓸데가리없어」) · 개발 표기(규칙 번호 · 날짜 ①②)는 화면에 안 샌다 — 화면에 닿는 토큰(String · Template · JSXText)만 · 주석은 뺀다
{ const espree = (await import("espree")).default ?? (await import("espree"));
  const libFiles = readdirSync("lib").filter((f) => /\.js$/.test(f)).map((f) => "lib/" + f);
  const dash = [], dev = [];
  for (const f of [...files("app").filter((p) => !p.includes("/api/")), ...libFiles]) {
    let toks; try { toks = espree.parse(readFileSync(f, "utf8"), { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, tokens: true }).tokens; } catch (e) { dash.push(`${f}: 파싱 실패 ${e.message}`); continue; }   // parse(tokens) — tokenize 만 쓰면 템플릿 안 ?. 에서 갈라진다(day-plan)
    for (const t of toks) { if (!["String", "Template", "JSXText"].includes(t.type)) continue;
      if (t.value.includes("—")) dash.push(`${f}: ${t.value.replace(/\s+/g, " ").slice(0, 60)}`);
      if (/확정-|\(어\d+\)|\d\/\d+ ?[①-⑳]|원칙-\d|대전제-\d|검사-\d|남긴 것 \d/.test(t.value)) dev.push(`${f}: ${t.value.replace(/\s+/g, " ").slice(0, 60)}`); } }
  ok("화면에 닿는 글자에 「—」 0(대전제-18 — 앱 · lib 오류 글 · 주석은 뺌)", dash.length === 0, dash.slice(0, 6).join(" | "));
  ok("화면에 닿는 글자에 개발 표기 0(확정-N · (어N) · 9/5 ⑨ · 원칙-N · 대전제-N · 검사-N — 05 「새로 만들기 — 한 곳(9/5 ⑨)」가 새고 있었다)", dev.length === 0, dev.slice(0, 6).join(" | ")); }
console.log(`\n■ 앱 전체 말 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
