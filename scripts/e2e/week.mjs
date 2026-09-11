/** 첫 주 돌려보기 — 원장님 2026-09-11 「모든 기능을 한번씩 눌러보고 · 실제 수업 시뮬레이션은
 *  전학생에게 1주일 돌려봐 · 내신정규모두 · 시험일 시험범위 등은 가상으로 입력해서」
 *  + 「전학생=모든학생」 — 앱이 이제 막 서는 **첫 주**다. 지난 진도·지난 성적·시험 범위가 하나도 없다.
 *
 *  ⚠️ 이것은 검사가 아니다(scripts/check-* · today.mjs 가 검사다). 여기서는 **막힌 곳**을 적는다:
 *     ① 막힘(눌렀는데 안 됨·오류) ② 두 번(같은 값을 또 넣게 함) ③ 빈 화면(왜 비었는지 화면이 말 안 함)
 *     ④ 군더더기(읽을 것이 너무 많다) ⑤ 길 없음(메뉴에서 못 닿는다) ⑥ 좋음
 *     — 원장님 2026-09-11 「누락된 페이지나 메뉴, 불필요한 설명, 불편한 메뉴나 동선, 사용자가 파악하기 어려운 구조 등을 찾아서 개선해」
 *  끝에 번호 매긴 목록으로 낸다. 앱 코드는 한 줄도 안 고친다(테스트용 뒷문 금지).
 *  쓰기: node scripts/e2e/week.mjs            (PC 1280 · 기본)
 */
import fs from "node:fs";
import { launch } from "../_browser.mjs";
const APP = process.env.E2E_APP ?? "http://127.0.0.1:3300";
const W = Number(process.env.WEEK_W ?? 1280), H = 900;
const SHOT = ".tmp/week"; fs.mkdirSync(SHOT, { recursive: true });
const 아이 = "zz_첫주_전학생", 전화 = "01099887766", 학교 = "zz_시험_중학교", 학년 = "2";

// ── 적기 ────────────────────────────────────────────────────────────────────
const 적은것 = []; let 걸음수 = 0;
const 아이콘 = { 막힘: "🚧", 두번: "🔁", 빈화면: "⬜", 군더더기: "🗯", 길없음: "🕳", 좋음: "✅" };
const 적기 = (갈래, 어디, 글) => { 적은것.push({ 갈래, 어디, 글 }); console.log(`      ${아이콘[갈래] ?? "·"} ${어디} — ${글}`); };
const 쪽오류 = [];

// ── 걷기 도우미 ─────────────────────────────────────────────────────────────
const ms = async (fn) => { const t = Date.now(); await fn(); return Date.now() - t; };
const 본문 = async (p) => (await p.locator("main").textContent().catch(() => "")).replace(/\s+/g, " ").trim();
const 오류줄 = async (p) => (await p.locator("main [role=alert]:visible").allTextContents()).join(" / ").replace(/\s+/g, " ").trim();
async function 열기(p, url, 이름) {
  const t = await ms(async () => { await p.goto(APP + url, { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {}); });
  console.log(`\n── ${이름}  ${url}  (${t}ms)`);
  const e = await 오류줄(p); if (e) 적기("막힘", 이름, `열자마자 오류줄: ${e}`);
  return t;
}
const 찍기 = async (p, 이름) => p.screenshot({ path: `${SHOT}/${String(++걸음수).padStart(2, "0")}-${이름}.png`, fullPage: true }).catch(() => {});
/** 누르고 서버 답을 기다린다 — 낙관적 갱신이라 화면은 먼저 바뀐다. 오류줄이 새로 떴으면 적는다 */
async function 누름(p, loc, 어디, 무엇) {
  const 전 = await 오류줄(p);
  try { await loc.click({ timeout: 8000 }); } catch (e) { 적기("막힘", 어디, `「${무엇}」를 못 눌렀습니다 — ${String(e.message).split("\n")[0].slice(0, 110)}`); return false; }
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(900);   // 서버 동작 + router.refresh 가 끝나기를 — 이 화면들은 낙관적 갱신이 아니라 다시 그린다
  const 후 = await 오류줄(p);
  if (후 && 후 !== 전) { 적기("막힘", 어디, `「${무엇}」 뒤 오류줄: ${후}`); return false; }
  return true;
}
const 날 = (n) => { const d = new Date(Date.now() + 9 * 3600000 + n * 86400000); return d.toISOString().slice(0, 10); };
const 요일 = (s) => "일월화수목금토"[new Date(s + "T00:00:00+09:00").getDay()];

// ── 서다 ────────────────────────────────────────────────────────────────────
const b = await launch();
const ctx = await b.newContext({ viewport: { width: W, height: H } });
await ctx.route(/fonts\.g(oogleapis|static)\.com/, (r) => r.abort());
const p = await ctx.newPage();
p.on("pageerror", (e) => 쪽오류.push(String(e.message).slice(0, 140)));

const 첫날 = -6;   // 이레를 **지난 주**로 돈다 — 오늘이 이레째. 앞날은 마감이 잠기고(머2) 숙제가 안 넘어가 한 주가 안 굴러간다
console.log(`\n■■ 첫 주 돌려보기 — ${W}px · ${날(첫날)}(${요일(날(첫날))}) ~ ${날(0)}(${요일(날(0))}) · 앱 ${APP}`);
console.log("   전학생=모든학생 — 지난 진도 0 · 지난 성적 0 · 시험 범위 0 에서 시작한다\n");

// ══ 0. 로그인 ═══════════════════════════════════════════════════════════════
await p.goto(APP + "/login");
await p.fill("#id-staff", "zz_principal@e2e.test"); await p.fill("#pw-staff", "e2e-pass");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {}), p.click("form:has(#id-staff) button[type=submit]")]);
await p.waitForLoadState("networkidle").catch(() => {});
if (new URL(p.url()).pathname.startsWith("/login")) { console.log("로그인 실패 — 멈춥니다"); await b.close(); process.exit(1); }
console.log("0. 로그인 — 원장으로 들어왔습니다");

// ══ 1. 첫날 아침 — 대시보드 17 이 첫 주에 무엇을 말하나 ═════════════════════
await 열기(p, "/", "17 대시보드(첫날 아침)");
{ const t = await 본문(p); await 찍기(p, "대시보드-첫날");
  console.log("   " + t.slice(0, 420)); }

// ══ 2. 상담 18 — 전화가 왔다 ════════════════════════════════════════════════
await 열기(p, "/ops/inquiry", "18 신규 상담");
await 누름(p, p.locator("[data-act=add-open]"), "18", "+ 전화 문의 받기");
await p.fill("[data-g=add-form] input[aria-label=이름]", 아이);
await p.fill("[data-g=add-form] input[aria-label='학부모 전화']", 전화);
await p.fill("[data-g=add-form] input[aria-label=학교]", 학교);
await p.fill("[data-g=add-form] input[aria-label=학년]", 학년);
await p.fill("[data-g=add-form] input[aria-label=물음]", "주 3회 되나요 · 수업료");
await 누름(p, p.locator("[data-act=add-save]"), "18", "저장");
const 카드 = p.locator("[data-g=card]").filter({ hasText: 아이 }).first();
await 카드.waitFor({ timeout: 12000 }).catch(() => {});
if (!(await 카드.count())) { 적기("막힘", "18", "문의를 넣었는데 카드가 안 보입니다 — 멈춥니다"); await b.close(); process.exit(1); }
await 찍기(p, "상담-받음");
await 누름(p, 카드.locator("[data-act=answer]"), "18", "📨 안내 문자");
await 카드.locator(`input[aria-label='${아이} 방문']`).fill(`${날(첫날)}T16:00`);
await 누름(p, 카드.locator("[data-act=visit-save]"), "18", "방문 잡기");
await 카드.locator(`input[aria-label='${아이} 레벨']`).fill(`${날(첫날)}T18:00`);
await 누름(p, 카드.locator("[data-act=test-save]"), "18", "레벨 잡기");
await 카드.locator(`input[aria-label='${아이} 점수']`).fill("단어 30/40 · 문법 17/25");
await 누름(p, 카드.locator("[data-act=level-save]"), "18", "점수");
await 카드.locator(`input[aria-label='${아이} 제안']`).fill("zz_리허설 문법책");
await 누름(p, 카드.locator("[data-act=suggest-save]"), "18", "제안");
await 찍기(p, "상담-레벨까지");
// ── 등록 전환 — 일곱
await 누름(p, 카드.locator("[data-act=convert-open]"), "18", "등록 전환 ↗");
const 모달 = p.locator("[data-g=convert]");
{ const opts = await 모달.locator("[data-g=conv-class] option").allTextContents();
  const 반 = opts.find((o) => o.includes("매일")) ?? opts[1];
  if (!반) 적기("막힘", "18 등록 전환", "고를 반이 하나도 없습니다 — 첫 주에는 반부터 만들어야 하는데 이 화면이 그 말을 안 합니다");
  else await 모달.locator("[data-g=conv-class]").selectOption({ label: 반 });
  const 교재 = 모달.locator("[data-g=conv-books] label").filter({ hasText: "zz_리허설 문법책" });
  if (await 교재.count()) await 교재.locator("input").check(); else 적기("빈화면", "18 등록 전환", "교재 목록이 비었습니다");
  await 모달.locator("input[aria-label='들어온 날']").fill(날(첫날));   // 지난 주에 들어온 아이 — 이레를 굴려야 마감·숙제 이월이 돈다
  await 모달.locator("[data-g=conv-extra]").fill("첫 주는 교재를 학원에서 빌려 씁니다");
  const 아이디 = await 모달.locator("[data-g=conv-login]").inputValue();
  if (!/^chloe\d{4}$/.test(아이디)) 적기("막힘", "18 등록 전환", `학생 아이디가 저절로 안 잡혔습니다: 「${아이디}」`);
}
await 누름(p, 모달.locator("[data-act=convert-save]"), "18 등록 전환", "등록 전환");
await 찍기(p, "등록전환-일곱");
{ const steps = await 모달.locator("[data-g=step]").all();
  for (const s of steps) { const ok = await s.getAttribute("data-ok"), t = (await s.textContent()).replace(/\s+/g, " ").trim();
    console.log(`      ${ok === "1" ? "✓" : ok === "0" ? "✕" : "·"} ${t.slice(0, 150)}`);
    if (ok === "0") 적기("막힘", "18 등록 전환 일곱", t.slice(0, 150)); }
  if (!steps.length) 적기("막힘", "18 등록 전환", "일곱 줄이 안 나왔습니다"); }
// 학생 id 를 집는다
let 학생id = null;
{ const a = 모달.locator("a[href^='/ops/students?s=']");
  if (await a.count()) 학생id = (await a.first().getAttribute("href")).split("s=")[1]; }
await 누름(p, 모달.locator("button", { hasText: "닫기" }).first(), "18", "닫기");
console.log(`   학생 id = ${학생id ?? "(못 집음)"}`);

// ══ 3. 학생 14 — 막 들어온 아이의 첫 화면 ═══════════════════════════════════
await 열기(p, `/ops/students${학생id ? `?s=${학생id}` : ""}`, "14 학생");
await 찍기(p, "학생-막들어온");
{ const t = await 본문(p);
  if (!t.includes(아이)) 적기("막힘", "14", "막 등록한 아이가 화면에 안 보입니다"); }

// ══ 4. 내신 차리기 — 시험일·범위를 가상으로 ═════════════════════════════════
const 시험시작 = 날(28), 시험끝 = 날(31), 영어일 = 날(29);   // 넉 주 뒤 — 첫 사흘(정규)은 교재 멈춤 밖이어야 한다. 넷째 날 「지금 멈춤」으로 내신에 들어간다
await 열기(p, "/schedule/import", "12b 받아오기 · + 회차");
await 누름(p, p.locator("[data-act=manual-open]"), "12b", "+ 손으로 넣기");
{ const f = p.locator("[data-g=exam-form]");
  const opts = await f.locator("select[aria-label=학교] option").allTextContents();
  if (!opts.length) 적기("막힘", "12b", "학교 목록이 비었습니다 — 손으로 시험을 못 넣습니다");
  else { const s = opts.find((o) => o.includes(학교)) ?? opts[0]; await f.locator("select[aria-label=학교]").selectOption({ label: s });
         if (!opts.some((o) => o.includes(학교))) 적기("막힘", "12b", `아이 학교 「${학교}」가 목록에 없습니다`); }
  await f.locator("input[aria-label=학년]").fill(학년);
  await f.locator("input[aria-label='시험 이름']").fill("2학기 중간");
  await f.locator("input[aria-label=시작]").fill(시험시작);
  await f.locator("input[aria-label=끝]").fill(시험끝);
  await f.locator("input[aria-label='영어 시험일']").fill(영어일);
  await 누름(p, f.locator("[data-act=exam-save]"), "12b", "저장"); }
await 찍기(p, "시험-손으로");

await 열기(p, "/schedule/exams", "06b 시험 회차");
const 회차 = p.locator("[data-g=exam-card]").filter({ hasText: "2학기 중간" });
if (!(await 회차.count())) 적기("막힘", "06b", "손으로 넣은 회차가 06b 에 안 보입니다");
else {
  const 명 = await 회차.locator("[data-g=takers]").textContent().catch(() => "?");
  console.log(`   보는 아이: ${명}`);
  if (명.startsWith("0")) 적기("막힘", "06b", `회차를 넣었는데 보는 아이가 0명입니다 — 학교·학년이 붙지 않았습니다(아이 학교 「${학교}」 · 학년 ${학년})`);
  if (await 회차.locator("[data-g=no-scope]").count()) console.log("   범위: 아직 없습니다(첫 주 그대로)");
  // 범위 두 줄 — 교재 단원 + 글
  await 누름(p, 회차.locator("[data-act=scope-open]"), "06b", "+ 범위");
  const sf = 회차.locator("[data-g=scope-form]");
  const bopts = await sf.locator("[data-g=scope-book] option").allTextContents();
  const 책 = bopts.find((o) => o.includes("zz_리허설 문법책"));
  if (!책) 적기("빈화면", "06b 범위", "교재 목록에 아이 교재가 없습니다");
  else { await sf.locator("[data-g=scope-book]").selectOption({ label: 책 });
         await sf.locator("[data-g=scope-chapter]").first().waitFor({ timeout: 8000 }).catch(() => 적기("막힘", "06b 범위", "교재를 골랐는데 대단원이 안 떴습니다"));
         const ch = sf.locator("[data-g=scope-chapter]");
         if (await ch.count()) await ch.first().locator("input").check(); }
  await sf.locator("input[aria-label='글로 적는 범위']").fill("교과서 Lesson 5 본문 · 워크북 p.60-72");
  await 누름(p, sf.locator("[data-act=scope-save]"), "06b", "더하기");
  await 찍기(p, "시험-범위");
  const 줄 = await 회차.locator("[data-g=scope]").count();
  console.log(`   범위 ${줄}줄`);
  if (!줄) 적기("막힘", "06b", "범위를 더했는데 칩이 안 섰습니다");
}

// ══ 5. 한 주 — 정규 사흘 → 「지금 멈춤」 → 내신 나흘 ════════════════════════
const 출결표 = ["왔음", "왔음", "지각", "왔음", "결석", "왔음", "왔음"];
let 지난숙제 = 0;   // 지난 「온 날」에 낸 숙제 수 — 오늘 검사 줄이 0인 것이 잘못인지 아닌지 가른다
const 마감표 = [true, true, true, true, false, true, true];
for (let i = 0; i < 7; i++) {
  const D = 날(첫날 + i), 갈래 = i < 3 ? "정규" : "내신";
  if (i === 3) {   // 내신으로 넘어가는 도장 — 06b 「지금 멈춤」
    await 열기(p, "/schedule/exams", "06b — 내신 들어가기(지금 멈춤)");
    const e = p.locator("[data-g=exam-card]").filter({ hasText: "2학기 중간" });
    const 잠김 = await e.locator("[data-act=stop-now]").isDisabled().catch(() => true);
    if (잠김) 적기("막힘", "06b", "「지금 멈춤」이 잠겨 있습니다 — 영어 시험일을 넣었는데도");
    else { await 누름(p, e.locator("[data-act=stop-now]"), "06b", "지금 멈춤");
           const m = await p.locator("[data-g=msg]").textContent().catch(() => ""); console.log(`   ${m.trim()}`);
           if (/교재 0권/.test(m)) 적기("막힘", "06b", "「지금 멈춤」을 눌렀는데 멈춘 교재가 0권입니다 — 내신으로 안 넘어갑니다"); }
    await 찍기(p, "내신-지금멈춤");
  }
  const t = await 열기(p, `/today?d=${D}`, `01 오늘 수업 ${i + 1}일째 ${D}(${요일(D)}) · ${갈래}`);
  const row = p.locator(".row").filter({ hasText: 아이 });
  if (!(await row.count())) { 적기("빈화면", `01 ${i + 1}일째`, `명단에 이 아이가 없습니다 — 반 시간표에 ${요일(D)}요일이 없거나 들어온 날보다 앞섭니다`); await 찍기(p, `${i + 1}일-명단없음`); continue; }
  // 출결
  await 누름(p, row.locator("[data-g=att] button", { hasText: 출결표[i] }).first(), `01 ${i + 1}일째`, `출결 ${출결표[i]}`);
  if (출결표[i] === "결석") { await 찍기(p, `${i + 1}일-결석`); console.log("   결석 — 판을 안 엽니다"); continue; }
  // 펴기
  const 펴 = row.locator("button.open");
  if ((await 펴.textContent().catch(() => "")) === "펴기") await 누름(p, 펴, `01 ${i + 1}일째`, "펴기");
  await p.waitForTimeout(400);
  // 숙제 검사 — 있으면 ○(첫날은 없다)
  const hw = row.locator(".card[data-card=check] .hw");
  const n = await hw.count();
  if (!n) { if (i === 0) console.log("   숙제 검사: 없음(첫 수업 — 맞습니다)");
            else if (지난숙제 === 0) console.log("   숙제 검사: 없음(지난 수업 숙제가 0개였습니다 — 맞습니다)");
            else 적기("빈화면", `01 ${i + 1}일째`, `지난 수업에 숙제 ${지난숙제}개를 냈는데 오늘 검사 줄이 0개입니다`); }
  else { console.log(`   숙제 검사 ${n}줄`);
         for (let k = 0; k < n; k++) { const v = i === 4 ? "△" : k === 0 ? "○" : "○"; await 누름(p, hw.nth(k).locator(`.chk button[data-v]`).filter({ hasText: v }).first(), `01 ${i + 1}일째`, `검사 ${v}`); } }
  await p.waitForTimeout(600);
  // 오늘 학습·숙제가 깔렸나
  const work = row.locator(".card[data-card=work]");
  const 학원수 = await work.locator(".load > .ldn").nth(0).locator("b").first().textContent().catch(() => "?");
  const 숙제수 = await work.locator(".load > .ldn").nth(1).locator("b").first().textContent().catch(() => "?");
  const 깔림 = (await work.locator(".ctitle .auto").textContent().catch(() => "")).trim();
  console.log(`   학습 ${학원수} · 숙제 ${숙제수} · ${깔림}`);
  지난숙제 = Number(숙제수) || 0;
  if (학원수 === "0" && 숙제수 === "0") {   // 0개인 것이 잘못은 아니다 — **까닭을 화면이 말하나**를 본다(대전제-0)
    const 까닭 = (await work.locator(".stopnote").allTextContents()).join(" · ").replace(/\s+/g, " ").trim();
    if (까닭 || /0개/.test(깔림)) console.log(`   (0개 — 까닭: ${깔림}${까닭 ? ` · ${까닭}` : ""})`);
    else 적기("빈화면", `01 ${i + 1}일째 ${갈래}`, `오늘 학습 0 · 숙제 0 인데 까닭이 어디에도 없습니다 — 머리는 「${깔림}」`); }
  // 🔤 시험 카드
  const quiz = row.locator(".card[data-card=quiz]");
  if (await quiz.count()) { const forms = await quiz.locator("form.lf").count(); console.log(`   🔤 시험 ${forms}줄`);
    for (let k = 0; k < forms; k++) { const f = quiz.locator("form.lf").nth(k);
      await f.locator("input[name=wrong]").fill(i === 5 ? "9" : "2");
      await f.locator("input[name=total]").fill("20");
      await f.locator("input[name=total]").blur(); await p.waitForTimeout(500); } }
  else if (i >= 3) 적기("빈화면", `01 ${i + 1}일째 내신`, "🔤 시험 카드가 없습니다 — 지난 시간에 낸 범위가 없어서");
  // 📝 다음 시간 시험 — 오늘 내야 **다음 수업에 🔤 시험 카드**가 선다. 내신 날은 범위를 「내신」으로 바꿔 본다
  const nq = row.locator("[data-card=next-quiz]").first();   // 교재가 여럿이면 첫 교재 칸에 선다 — 걷기는 하나만 눌러 본다
  if (await nq.count()) {
    if (!(await nq.locator(".lf .ln").count())) {   // 아직 낸 것이 없으면 하나 낸다
      await 누름(p, nq.locator("button", { hasText: "+ 시험 더하기" }).first(), `01 ${i + 1}일째`, "+ 시험 더하기"); }
    const src = nq.locator("[data-g=source] button", { hasText: "내신" }).first();
    if (갈래 === "내신" && await src.count()) {
      if (await src.isDisabled()) 적기("막힘", `01 ${i + 1}일째 내신`, `「내신」 범위를 못 고릅니다 — ${(await src.getAttribute("title")) ?? "까닭 없음"}`);
      else await 누름(p, src, `01 ${i + 1}일째`, "범위 = 내신"); }
    const tot = nq.locator('input[name=total]').first();
    if (await tot.count()) { await tot.fill("20"); await tot.blur(); await p.waitForTimeout(400); }
  } else 적기("빈화면", `01 ${i + 1}일째`, "📝 다음 시간 시험 카드가 없습니다");
  // 진도 체크 한 번 (셋째 날)
  if (i === 2) { const pg = row.locator("[data-act=progress]");
    if (await pg.count()) { await 누름(p, pg, `01 ${i + 1}일째`, "진도 체크 ↗"); await p.waitForTimeout(500); await 찍기(p, `${i + 1}일-진도체크`);
      const 닫 = p.locator(".mdl button", { hasText: "닫기" }).first(); if (await 닫.count()) await 닫.click().catch(() => {}); }
    else 적기("막힘", `01 ${i + 1}일째`, "「진도 체크 ↗」 단추가 없습니다"); }
  // 부모님께 글
  const ta = row.locator("textarea[name=comment]");
  if (await ta.count()) await ta.fill(`${갈래} ${i + 1}일째 — 오늘 한 것과 다음 시간에 할 것을 적었습니다.`);
  else 적기("빈화면", `01 ${i + 1}일째`, "부모님께 보낼 글 칸이 없습니다");
  await 찍기(p, `${i + 1}일-${갈래}`);
  // 마감
  if (마감표[i]) {
    const 마감 = row.locator("[data-act=close]");
    if (!(await 마감.count())) 적기("막힘", `01 ${i + 1}일째`, "「저장하고 마감」 단추가 없습니다");
    else if (await 마감.isDisabled()) 적기("막힘", `01 ${i + 1}일째`, "마감이 잠겨 있습니다(앞으로 올 날로 봅니다)");
    else { await 누름(p, 마감, `01 ${i + 1}일째`, "저장하고 마감");
           await p.waitForTimeout(700);
           const 되물음 = p.locator("[data-act=close-anyway]");
           if (await 되물음.count()) { console.log("   되물음 — 그대로 마감"); await 누름(p, 되물음, `01 ${i + 1}일째`, "그대로 마감"); await p.waitForTimeout(700); }
           const 닫힘 = await row.locator(".row.closed, .closed").count().catch(() => 0);
           if (!(await row.getAttribute("class")).includes("closed") && !닫힘) 적기("막힘", `01 ${i + 1}일째`, "마감을 눌렀는데 줄이 안 닫혔습니다"); } }
}

// ══ 6. 한 주가 지나고 — 딸린 화면들 ═════════════════════════════════════════
for (const [url, 이름] of [["/schedule/todo", "05 할 일"], [`/schedule/exams/prep`, "04 내신 대비"], ["/scores", "16 성적"], ["/send", "10 발송"], ["/schedule/grid", "06c 학교별 표"], ["/", "17 대시보드(한 주 뒤)"]]) {
  await 열기(p, url, 이름);
  await 찍기(p, 이름.replace(/[ /]/g, "_"));
  const t = await 본문(p);
  console.log("   " + t.slice(0, 320));
}

// ══ 7. 전수 — 화면 29개를 한 번씩 (원장님 「모든 기능을 한번씩 눌러보고」) ══════
//    ① 열리나 ② 읽을 것이 얼마나 되나(.note 글자 수) ③ 상단 메뉴에서 몇 번 눌러 닿나
console.log("\n\n■■ 화면 전수 ■■");
const 원장화면 = ["/", "/today", "/send", "/send/monthly", "/send/notice", "/schedule", "/schedule/classes", "/schedule/grid", "/schedule/import", "/schedule/exams", "/schedule/exams/prep", "/schedule/todo", "/scores", "/books", "/books/videos", "/ops", "/ops/students", "/ops/inquiry", "/ops/files", "/settings", "/settings/access", "/settings/progress", "/settings/routine"];
// 상단 탭이 곧바로 가리키는 곳 = 한 걸음. 그 화면들이 걸어 둔 링크 = 두 걸음.
await p.goto(APP + "/"); await p.waitForLoadState("networkidle").catch(() => {});
const 한걸음 = new Set((await p.locator("header.appbar nav.tabs a").evaluateAll((a) => a.map((x) => new URL(x.href).pathname))));
const 두걸음 = new Set();
for (const t of 한걸음) { await p.goto(APP + t).catch(() => {}); await p.waitForLoadState("networkidle").catch(() => {});
  for (const h of await p.locator("main a[href^='/']").evaluateAll((a) => a.map((x) => new URL(x.href).pathname))) 두걸음.add(h); }
const 걸음 = (u) => (한걸음.has(u) ? 1 : 두걸음.has(u) ? 2 : 0);
const 표 = [];
for (const u of 원장화면) {
  const t0 = Date.now();
  const r = await p.goto(APP + u, { waitUntil: "domcontentloaded" }).catch(() => null);
  await p.waitForLoadState("networkidle").catch(() => {});
  const 밀리 = Date.now() - t0, 코드 = r?.status() ?? 0;
  const 설명 = await p.locator("main .note").evaluateAll((ns) => ns.map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim()).join(" ").length).catch(() => 0);
  const 본 = (await 본문(p)).length;
  const 알림 = await 오류줄(p);
  const g = 걸음(u);
  표.push({ u, 코드, 밀리, 설명, 본, g, 알림 });
  if (코드 >= 400 || !코드) 적기("막힘", u, `열리지 않습니다 (HTTP ${코드})`);
  if (알림) 적기("막힘", u, `열자마자 오류줄: ${알림}`);
  if (!g) 적기("길없음", u, "상단 메뉴에서 두 번 눌러도 못 닿습니다 — 주소를 쳐야 들어옵니다");
}
console.log("   화면                       HTTP   ms   설명글자  전체글자  걸음");
for (const r of 표) console.log(`   ${r.u.padEnd(26)} ${String(r.코드).padStart(4)} ${String(r.밀리).padStart(5)} ${String(r.설명).padStart(8)} ${String(r.본).padStart(9)} ${r.g ? `${r.g}번` : "못 닿음"}`);
{ const 많 = 표.filter((r) => r.설명 >= 500).sort((a, b) => b.설명 - a.설명);
  for (const r of 많.slice(0, 6)) 적기("군더더기", r.u, `설명(.note)만 ${r.설명}자 — 화면 글자의 ${Math.round((r.설명 / Math.max(r.본, 1)) * 100)}%`); }

console.log("\n\n■■ 첫 주에 걸린 것 ■■");
if (!적은것.length) console.log("   없음");
적은것.forEach((x, i) => console.log(`${String(i + 1).padStart(2)}. [${x.갈래}] ${x.어디} — ${x.글}`));
console.log(`\nJS 오류: ${쪽오류.length ? [...new Set(쪽오류)].join(" / ") : "없음"}`);
console.log(`화면 ${걸음수}장 — ${SHOT}/`);
await b.close();
