/** 내신대비 한 판을 **직접 차려서** 돌린다 — 원장님 2026-09-12 「직접 가상의 내신대비 자료 할일 시함일 배정해서 돌려」.
 *  재기(month.mjs)와 달리 여기서는 **내가 손으로 다 넣는다**: 시험일 → 범위 → 지금 멈춤 → 자료 셋(갈래 다르게) →
 *  아이 배정 → 단계 밀기(만들기·인쇄·배부·풀이·채점) → 나눠주기 → 05 할 일(표·보드·새 할 일·단원평가) →
 *  01 시험 카드 → 16 성적 → 07 아이 화면에서 받은 것이 보이나.
 *  ⚠️ 검사가 아니다. **막힌 곳**을 적는다(막힘 · 두번 · 빈화면 · 군더더기 · 길없음 · 좋음). 앱 코드는 안 고친다.
 *  쓰기: node scripts/e2e/prep.mjs */
import fs from "node:fs";
import { launch } from "../_browser.mjs";
const APP = process.env.E2E_APP ?? "http://127.0.0.1:3300";
const SHOT = ".tmp/prep"; fs.mkdirSync(SHOT, { recursive: true });
const 학교 = "zz_시험_중학교", 학년 = "2", 시험이름 = "내신대비 돌리기 2학기 기말";
const 날 = (n) => { const d = new Date(Date.now() + 9 * 3600000 + n * 86400000); return d.toISOString().slice(0, 10); };
const 요일 = (s) => "일월화수목금토"[new Date(s + "T00:00:00+09:00").getDay()];
const 적은것 = [], 쪽오류 = []; let 컷 = 0;
const 아이콘 = { 막힘: "🚧", 두번: "🔁", 빈화면: "⬜", 군더더기: "🗯", 길없음: "🕳", 좋음: "✅" };
const 적기 = (갈래, 어디, 글) => { 적은것.push({ 갈래, 어디, 글 }); console.log(`      ${아이콘[갈래] ?? "·"} ${어디} — ${글}`); };

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(/fonts\.g(oogleapis|static)\.com/, (r) => r.abort());
const p = await ctx.newPage();
p.on("pageerror", (e) => 쪽오류.push(String(e.message).slice(0, 160)));
const 오류줄 = async () => (await p.locator("main [role=alert]:visible").allTextContents()).join(" / ").replace(/\s+/g, " ").trim();
const 찍기 = async (이름) => p.screenshot({ path: `${SHOT}/${String(++컷).padStart(2, "0")}-${이름}.png`, fullPage: true }).catch(() => {});
async function 열기(url, 이름) {
  const t0 = Date.now();
  await p.goto(APP + url, { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {});
  console.log(`\n── ${이름}  ${url}  (${Date.now() - t0}ms)`);
  const e = await 오류줄(); if (e) 적기("막힘", 이름, `열자마자 오류줄: ${e}`);
}
async function 누름(loc, 어디, 무엇) {
  const 전 = await 오류줄();
  try { await loc.click({ timeout: 8000 }); } catch (e) { 적기("막힘", 어디, `「${무엇}」를 못 눌렀습니다 — ${String(e.message).split("\n")[0].slice(0, 100)}`); return false; }
  await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(800);
  const 후 = await 오류줄();
  if (후 && 후 !== 전) { 적기("막힘", 어디, `「${무엇}」 뒤 오류줄: ${후}`); return false; }
  return true;
}
const 글 = async (sel) => (await p.locator(sel).textContent().catch(() => "")).replace(/\s+/g, " ").trim();

// 시험을 **앞날**에 둔다 — 내신대비는 시험 전에 하는 일이다
const 시험시작 = 날(12), 시험끝 = 날(15), 영어일 = 날(13);
console.log(`\n■■ 내신대비 한 판 — 영어 시험일 ${영어일}(${요일(영어일)}) · 기간 ${시험시작}~${시험끝} · 앱 ${APP}\n`);

// ══ 0. 로그인 ═══════════════════════════════════════════════════════════════
await p.goto(APP + "/login");
await p.fill("#id-staff", "zz_principal@e2e.test"); await p.fill("#pw-staff", "e2e-pass");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {}), p.click("form:has(#id-staff) button[type=submit]")]);
if (new URL(p.url()).pathname.startsWith("/login")) { console.log("로그인 실패 — 멈춥니다"); await b.close(); process.exit(1); }
console.log("0. 원장으로 들어왔습니다");

// ══ 1. 시험일을 손으로 넣는다 (12b) — 이미 있으면 그 회차로 이어 간다(두 번 돌려도 된다) ═══
await 열기("/schedule/exams", "06b — 이 회차가 이미 있나");
const 이미 = (await p.locator("[data-g=exam-card]").filter({ hasText: 시험이름 }).count()) > 0;
if (이미) console.log("   ⏭ 같은 회차가 이미 있습니다(앞 판에서 넣은 것) — 넣지 않고 그 회차로 이어 갑니다");
else {
await 열기("/schedule/import", "12b — 시험일 손으로");
await 누름(p.locator("[data-act=manual-open]"), "12b", "+ 손으로 넣기");
{ const f = p.locator("[data-g=exam-form]");
  const opts = await f.locator("select[aria-label=학교] option").allTextContents();
  const s = opts.find((o) => o.includes(학교));
  if (!s) 적기("막힘", "12b", `아이 학교 「${학교}」가 목록에 없습니다`);
  else await f.locator("select[aria-label=학교]").selectOption({ label: s });
  await f.locator("input[aria-label=학년]").fill(학년);
  await f.locator("input[aria-label='시험 이름']").fill(시험이름);
  await f.locator("input[aria-label=시작]").fill(시험시작);
  await f.locator("input[aria-label=끝]").fill(시험끝);
  await f.locator("input[aria-label='영어 시험일']").fill(영어일);
  await 누름(f.locator("[data-act=exam-save]"), "12b", "저장"); } }
await 찍기("시험일-넣음");

// ══ 2. 범위를 넣는다 (06b) ══════════════════════════════════════════════════
await 열기("/schedule/exams", "06b — 범위 두 줄");
const 회차 = p.locator("[data-g=exam-card]").filter({ hasText: 시험이름 });
if (!(await 회차.count())) { 적기("막힘", "06b", "넣은 회차가 안 보입니다 — 멈춥니다"); await b.close(); process.exit(1); }
console.log(`   보는 아이: ${await 회차.locator("[data-g=takers]").textContent().catch(() => "?")}`);
await 누름(회차.locator("[data-act=scope-open]"), "06b", "+ 범위");
{ const sf = 회차.locator("[data-g=scope-form]");
  const bopts = await sf.locator("[data-g=scope-book] option").allTextContents();
  const 책 = bopts.find((o) => /문법책|교과서|리허설/.test(o)) ?? bopts[1];
  if (!책) 적기("빈화면", "06b 범위", "고를 교재가 없습니다");
  else { await sf.locator("[data-g=scope-book]").selectOption({ label: 책 });
         await sf.locator("[data-g=scope-chapter]").first().waitFor({ timeout: 8000 }).catch(() => 적기("막힘", "06b 범위", "교재를 골랐는데 대단원이 안 떴습니다"));
         const ch = sf.locator("[data-g=scope-chapter]"); if (await ch.count()) await ch.first().locator("input").check(); }
  await sf.locator("input[aria-label='글로 적는 범위']").fill("교과서 Lesson 7~8 본문 · 워크북 p.88-104 · 부교재 어휘 1200-1400");
  await 누름(sf.locator("[data-act=scope-save]"), "06b", "더하기"); }
console.log(`   범위 ${await 회차.locator("[data-g=scope]").count()}줄`);
// 내신으로 들어간다 — 교재를 멈춘다
{ const 잠김 = await 회차.locator("[data-act=stop-now]").isDisabled().catch(() => true);
  if (잠김) 적기("막힘", "06b", "「지금 멈춤」이 잠겨 있습니다 — 영어 시험일을 넣었는데도");
  else { await 누름(회차.locator("[data-act=stop-now]"), "06b", "지금 멈춤");
         const m = await 글("[data-g=msg]"); console.log(`   ${m}`);
         // 0권 자체는 맞을 수 있다(교재가 이미 다른 회차에 묶였을 때). 막힌 것은 **까닭을 안 말할 때**다(대전제-0 · 검사-86)
         if (/교재 0권/.test(m) && !/안 건드린 것|영어 시험일 없음|숨긴 회차|물린 회차/.test(m)) 적기("막힘", "06b", "「지금 멈춤」이 0권인데 까닭을 안 말합니다");
         else if (/교재 0권/.test(m)) console.log("   ✅ 0권이지만 화면이 까닭과 하실 일까지 말합니다"); } }
await 찍기("범위-멈춤");

// ══ 3. 내신 자료 셋을 만들고 배정한다 (04) ══════════════════════════════════
await 열기("/schedule/exams/prep", "04 — 내신 자료 만들기");
{ const pick = p.locator("[data-g=exam-pick]");
  if (await pick.count()) { const opts = await pick.locator("option").allTextContents();
    const o = opts.find((x) => x.includes(시험이름.slice(0, 8)));
    if (o) await pick.selectOption({ label: o }); else 적기("막힘", "04", "회차 고르개에 이 시험이 없습니다"); }
  else 적기("길없음", "04", "회차를 고를 자리가 없습니다"); }
await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(600);
console.log(`   D-day: ${await 글("[data-g=dday]")} · 보는 아이 ${await 글("[data-g=takers]")}`);
if (await p.locator("[data-g=no-material]").count()) console.log("   자료: 아직 없습니다(맞습니다 — 지금부터 만듭니다)");

const 자료들 = [
  { 이름: "요지·주제 정리", 항목: "Lesson 7 본문 요지, Lesson 8 본문 요지, 필자 주장, 빈칸 추론" },
  { 이름: "어법 포인트", 항목: "동사 형 변형, 어순, 접속사, 지시어, 분사구문" },
  { 이름: "어휘 시험지", 항목: "1200-1300 단어, 1300-1400 단어, 숙어 30" },
];
let 만든수 = 0;
for (const z of 자료들) {
  if (!(await 누름(p.locator("[data-act=add-open]"), "04", "+ 자료"))) break;
  const m = p.locator("[data-g=add]");
  const topts = await m.locator("select[aria-label='자료 종류'] option").allTextContents();
  const t = topts.find((x) => x && x !== "고르기");
  if (!t) { 적기("막힘", "04 + 자료", "자료 종류가 하나도 없습니다 — 종류를 먼저 만들 길이 화면에 없습니다"); await 누름(m.locator("button", { hasText: "닫기" }).first(), "04", "닫기"); break; }
  await m.locator("select[aria-label='자료 종류']").selectOption({ label: t });
  await m.locator("input[aria-label='갈래 이름']").fill(z.이름);
  await m.locator("textarea[aria-label=항목]").fill(z.항목);
  const 아이칸 = m.locator("[data-g=add-students] input.ck");
  const n아이 = await 아이칸.count();
  if (!n아이) 적기("빈화면", "04 + 자료", "배정할 아이가 하나도 없습니다 — 회차에 보는 아이가 안 붙었습니다");
  for (let i = 0; i < n아이; i++) await 아이칸.nth(i).check();
  if (await 누름(m.locator("[data-act=add-save]"), "04 + 자료", `저장(${z.이름})`)) { 만든수++; console.log(`   ✎ ${z.이름} — 항목 ${z.항목.split(",").length}개 · 아이 ${n아이}명`); }
}
await 찍기("자료-셋");
console.log(`   자료 ${만든수}갈래 · 할 일 ${await 글("[data-g=todo-count]")} · 나무 ${await 글("[data-g=tree-count]")}`);
if (만든수 && !(await p.locator("[data-g=todo-row]").count())) 적기("빈화면", "04", "자료를 만들었는데 할 일이 한 줄도 안 섰습니다(만들기·인쇄·배부가 저절로 서야 합니다)");

// 단계 밀기 — 만들기 → 인쇄 → 배부
{ const rows = p.locator("[data-g=todo-row]");
  const n = await rows.count();
  console.log(`   저절로 선 할 일 ${n}줄`);
  for (let i = 0; i < Math.min(n, 6); i++) {
    const r = rows.nth(i), t = (await r.textContent()).replace(/\s+/g, " ").trim().slice(0, 60);
    if (await r.locator("[data-act=todo-done]").count()) await 누름(r.locator("[data-act=todo-done]").first(), "04 할 일", `다 함 — ${t}`);
  } }
await 찍기("자료-단계밀기");
// 나눠주기
{ const hand = p.locator("[data-act=hand]");
  if (await hand.count()) { await 누름(hand.first(), "04", "나눠주기"); console.log(`   ${await 글("[data-g=msg]")}`); }
  else {   // 아직 안 만든 자료는 배부 단추가 없다(만들기 → 인쇄 → 배부 차례). 그러면 화면이 **언제 가는지**를 말해야 한다(대전제-0)
    const nx = p.locator("[data-g=next-step]");
    if (!(await nx.count())) 적기("길없음", "04", "아직 못 나눠주는데 「다음 · 언제」 줄도 없습니다 — 아이에게 언제 가는지 알 길이 없습니다");
    else console.log(`   ✅ 아직 배부 차례가 아닙니다 — 자료 줄이 스스로 말합니다: ${(await nx.first().textContent()).trim()}`); } }
await 찍기("자료-나눠줌");

// ══ 4. 05 할 일 — 표·보드·새 할 일·단원평가 ═════════════════════════════════
await 열기("/schedule/todo", "05 할 일");
console.log(`   할 일 ${await 글("[data-g=count]")} · 밀린 것 ${await 글("[data-g=overdue]")}`);
if (!(await p.locator("[data-g=row], [data-g=card]").count())) 적기("빈화면", "05", "04 에서 만든 자료가 할 일로 하나도 안 보입니다");
await 누름(p.locator("[data-act=view-board]"), "05", "▦ 보드");
await 찍기("할일-보드");
await 누름(p.locator("[data-act=view-table]"), "05", "⊞ 표");
// 새 할 일(글)
if (await 누름(p.locator("[data-act=new-open]"), "05", "+ 새 할 일")) {
  const nm = p.locator("[data-g=new-menu]");
  if (await nm.locator("[data-act=new-note]").count()) {
    await 누름(nm.locator("[data-act=new-note]"), "05", "글로 적기");
    const inp = p.locator("[data-g=new-note] input, input[aria-label='할 일']").first();
    if (await inp.count()) { await inp.fill("기말 대비 오답노트 양식 인쇄해서 반별로 나눠 두기");
      await 누름(p.locator("[data-act=note-save]"), "05", "저장"); }
    else 적기("막힘", "05", "「글로 적기」를 눌렀는데 적을 칸이 안 떴습니다");
  } else 적기("길없음", "05", "+ 새 할 일 에 「글로 적기」가 없습니다");
}
// 단원평가 내기
if (await p.locator("[data-act=new-unit-test]").count()) {
  await 누름(p.locator("[data-act=new-open]"), "05", "+ 새 할 일(단원평가)");
  await 누름(p.locator("[data-act=new-unit-test]"), "05", "단원평가");
  const uf = p.locator("[data-g=new-unit-test]");
  if (await uf.count()) { const q = uf.locator("input[aria-label='문항 수']"); if (await q.count()) await q.fill("20");
    await 누름(p.locator("[data-act=unit-test-save]"), "05", "단원평가 내기"); }
}
await 찍기("할일-표");
console.log(`   ${await 글("[data-g=msg]")}`);

// ══ 5. 01 오늘 수업 — 시험 카드에 범위가 붙었나 ═════════════════════════════
await 열기("/today", "01 오늘 수업 — 🔤 시험 카드");
{ const 내신 = p.locator("[data-g=source] button", { hasText: "내신" });   // 갈래를 「내신」으로 눌러야 범위 고르개가 나온다(안 눌러 보고 「없다」고 적던 것을 고침)
  if (!(await 내신.count())) console.log("   ⏭ 오늘 판에 🔤 시험 카드가 없습니다 — 이 회차를 보는 아이가 오늘 수업에 없습니다");
  else if (!(await 내신.first().isEnabled())) 적기("빈화면", "01", `「내신」을 못 누릅니다 — ${(await 내신.first().getAttribute("title")) ?? "까닭 없음"}`);
  else { await 누름(내신.first(), "01", "갈래 · 내신");
    const t = (await p.locator("main").textContent()).replace(/\s+/g, " ");
    if (/Lesson 7~8|워크북 p\.88|CH|›/.test(t)) console.log("   ✅ 시험 카드에 내가 넣은 범위가 붙었습니다");
    else 적기("빈화면", "01", "「내신」을 눌렀는데 06b 에서 넣은 범위가 안 보입니다"); } }
await 찍기("오늘-시험카드");

// ══ 6. 16 성적 — 시험 뒤 점수 ═══════════════════════════════════════════════
await 열기("/scores", "16 성적");
{ const t = (await p.locator("main").textContent()).replace(/\s+/g, " ");
  if (t.includes(시험이름.slice(0, 8))) console.log("   ✅ 성적 화면에 이 회차가 떴습니다(점수 넣을 자리)");
  else 적기("빈화면", "16", "방금 만든 회차가 성적 화면에 없습니다 — 시험이 아직 안 지나서일 수 있습니다"); }
await 찍기("성적");

// ══ 7. 04 로 돌아와 — 표가 어떻게 보이나 ════════════════════════════════════
await 열기("/schedule/exams/prep", "04 — 다 차린 뒤");
await 찍기("자료-다차림");
{ const t = (await p.locator("main").textContent()).replace(/\s+/g, " ");
  console.log(`   ${t.slice(0, 300)}`); }

// ══ 끝 ══════════════════════════════════════════════════════════════════════
console.log("\n\n■■ 막힌 곳\n");
if (!적은것.length) console.log("   없습니다 — 시험일·범위·자료 셋·배정·단계·할 일까지 한 번에 돌았습니다.");
적은것.forEach((x, i) => console.log(`   ${i + 1}. ${아이콘[x.갈래]} [${x.갈래}] ${x.어디} — ${x.글}`));
if (쪽오류.length) { console.log("\n■ 브라우저 오류\n"); [...new Set(쪽오류)].forEach((x) => console.log(`   ${x}`)); }
console.log(`\n캡처 ${컷}장: ${SHOT}/`);
await b.close();
