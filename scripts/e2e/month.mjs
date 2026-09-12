/** 한 달 돌려보기 + **읽기 재기** — 원장님 2026-09-11 「페이지에서 가독성이 떨어져 · 모든 기능 사용해서
 *  내신 정규 수업 한달 돌리고 · 페이지구성 개선하고 · 필요없는 설명좀빼」
 *
 *  ⚠️ 검사가 아니다(scripts/check-* · today.mjs 가 검사다). 여기서는 **읽을 것이 얼마나 되나**를 잰다.
 *  ① 한 달을 실제로 굴려 화면을 **채운다** — 빈 화면은 읽기를 잴 수 없다(정규 2주 → 내신 2주 → 시험 → 성적 → 월말)
 *  ② 화면마다 잰다 — 본문 글자 · **설명문 글자**(p.note·small·.auto) · 카드 수 · **폰에서 몇 화면분**인가 · 가장 긴 설명문
 *  ③ 설명문이 많은 순으로 목록을 낸다. 캡처는 .tmp/month/ 에 PC·폰 둘 다.
 *  앱 코드는 한 줄도 안 고친다(테스트용 뒷문 금지).
 *  쓰기: node scripts/e2e/month.mjs */
import fs from "node:fs";
import { launch } from "../_browser.mjs";
const APP = process.env.E2E_APP ?? "http://127.0.0.1:3300";
const SHOT = ".tmp/month"; fs.mkdirSync(SHOT, { recursive: true });
const 아이 = "zz_시험_학생", 학교 = "zz_시험_중학교", 학년 = "2";
const 날 = (n) => { const d = new Date(Date.now() + 9 * 3600000 + n * 86400000); return d.toISOString().slice(0, 10); };
const 요일 = (s) => "일월화수목금토"[new Date(s + "T00:00:00+09:00").getDay()];
const 쪽오류 = [], 잰것 = [], 막힌것 = [];
const 막힘 = (어디, 글) => { 막힌것.push(`${어디} — ${글}`); console.log(`      🚧 ${어디} — ${글}`); };

const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(/fonts\.g(oogleapis|static)\.com/, (r) => r.abort());
const p = await ctx.newPage();
p.on("pageerror", (e) => 쪽오류.push(String(e.message).slice(0, 140)));
const 오류줄 = async () => (await p.locator("main [role=alert]:visible").allTextContents()).join(" / ").replace(/\s+/g, " ").trim();
async function 누름(loc, 어디, 무엇) {
  const 전 = await 오류줄();
  try { await loc.click({ timeout: 8000 }); } catch (e) { 막힘(어디, `「${무엇}」를 못 눌렀습니다 — ${String(e.message).split("\n")[0].slice(0, 100)}`); return false; }
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(800);
  const 후 = await 오류줄();
  if (후 && 후 !== 전) { 막힘(어디, `「${무엇}」 뒤 오류줄: ${후}`); return false; }
  return true;
}

/** 한 화면을 열고 **읽을 것**을 잰다 — PC 로 재고, 폰 390 으로 세로 길이만 한 번 더 */
async function 재기(url, 이름) {
  await p.goto(APP + url, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(400);
  const e = await 오류줄(); if (e) 막힘(이름, `열자마자 오류줄: ${e}`);
  const m = await p.evaluate(() => {
    const main = document.querySelector("main"); if (!main) return null;
    const txt = (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const 설명 = [...main.querySelectorAll("p.note, small, .auto, .lede, .hint")].map(txt).filter((s) => s.length > 0);
    return { 본문: txt(main).length, 설명수: 설명.length, 설명글자: 설명.reduce((a, s) => a + s.length, 0),
      카드: main.querySelectorAll(".card, .task").length,
      긴것: 설명.slice().sort((a, b) => b.length - a.length).slice(0, 3).map((s) => ({ n: s.length, s: s.slice(0, 90) })) };
  });
  if (!m) { 막힘(이름, "main 이 없습니다"); return; }
  await p.screenshot({ path: `${SHOT}/pc-${이름.replace(/[^\w가-힣]/g, "_")}.png`, fullPage: true }).catch(() => {});
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  const 폰높이 = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.screenshot({ path: `${SHOT}/phone-${이름.replace(/[^\w가-힣]/g, "_")}.png`, fullPage: true }).catch(() => {});
  await p.setViewportSize({ width: 1280, height: 900 });
  잰것.push({ 이름, url, ...m, 폰화면: Math.round((폰높이 / 844) * 10) / 10 });
  console.log(`   ${이름.padEnd(22)} 본문 ${String(m.본문).padStart(5)}자 · 설명문 ${String(m.설명수).padStart(3)}개 ${String(m.설명글자).padStart(5)}자 · 카드 ${String(m.카드).padStart(2)} · 폰 ${String(Math.round((폰높이 / 844) * 10) / 10).padStart(4)}화면`);
}

console.log(`\n■■ 한 달 돌려보기 + 읽기 재기 — ${날(-27)}(${요일(날(-27))}) ~ ${날(0)}(${요일(날(0))}) · 앱 ${APP}\n`);

// ══ 0. 로그인 ═══════════════════════════════════════════════════════════════
await p.goto(APP + "/login");
await p.fill("#id-staff", "zz_principal@e2e.test"); await p.fill("#pw-staff", "e2e-pass");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {}), p.click("form:has(#id-staff) button[type=submit]")]);
if (new URL(p.url()).pathname.startsWith("/login")) { console.log("로그인 실패 — 멈춥니다"); await b.close(); process.exit(1); }
console.log("0. 원장으로 들어왔습니다\n");

// ══ 1. 내신 차리기 — 이 달 안에 시험이 있게 ════════════════════════════════
console.log("1. 내신 차리기 — 시험일·영어일·범위를 이 달 안에");
const 시험시작 = 날(-6), 시험끝 = 날(-3), 영어일 = 날(-5);
await p.goto(APP + "/schedule/import", { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {});
await 누름(p.locator("[data-act=manual-open]"), "12b", "+ 손으로 넣기");
{ const f = p.locator("[data-g=exam-form]");
  const opts = await f.locator("select[aria-label=학교] option").allTextContents();
  const s = opts.find((o) => o.includes(학교)) ?? opts[1] ?? opts[0];
  if (s) await f.locator("select[aria-label=학교]").selectOption({ label: s }); else 막힘("12b", "학교 목록이 비었습니다");
  await f.locator("input[aria-label=학년]").fill(학년);
  await f.locator("input[aria-label='시험 이름']").fill("한달돌리기 2학기 중간");
  await f.locator("input[aria-label=시작]").fill(시험시작);
  await f.locator("input[aria-label=끝]").fill(시험끝);
  await f.locator("input[aria-label='영어 시험일']").fill(영어일);
  await 누름(f.locator("[data-act=exam-save]"), "12b", "저장"); }

await p.goto(APP + "/schedule/exams", { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {});
{ const 회차 = p.locator("[data-g=exam-card]").filter({ hasText: "한달돌리기" });
  if (!(await 회차.count())) 막힘("06b", "손으로 넣은 회차가 안 보입니다");
  else { await 누름(회차.locator("[data-act=scope-open]"), "06b", "+ 범위");
    const sf = 회차.locator("[data-g=scope-form]");
    const bopts = await sf.locator("[data-g=scope-book] option").allTextContents();
    const 책 = bopts.find((o) => /문법책|교과서/.test(o)) ?? bopts[1];
    if (책) { await sf.locator("[data-g=scope-book]").selectOption({ label: 책 });
      await sf.locator("[data-g=scope-chapter]").first().waitFor({ timeout: 8000 }).catch(() => {});
      const ch = sf.locator("[data-g=scope-chapter]"); if (await ch.count()) await ch.first().locator("input").check(); }
    await sf.locator("input[aria-label='글로 적는 범위']").fill("교과서 Lesson 5 본문 · 워크북 p.60-72");
    await 누름(sf.locator("[data-act=scope-save]"), "06b", "더하기"); } }

// ══ 2. 한 달 — 수업일마다 출결·검사·마감 ═══════════════════════════════════
console.log("\n2. 한 달을 굴린다 — 수업일마다 출결 · 숙제 검사 · 마감(내신 기간엔 시험까지)");
let 연것 = 0, 마감한것 = 0;
for (let d = -27; d <= 0; d++) {
  const D = 날(d);
  await p.goto(APP + `/today?d=${D}`, { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {});
  const row = p.locator(".row").filter({ hasText: 아이 });
  if (!(await row.count())) continue;   // 그 요일에 수업이 없는 날
  연것++;
  await 누름(row.locator("[data-g=att] button", { hasText: "왔음" }).first(), `01 ${D}`, "출결 왔음");
  const 펴 = row.locator("button.open");
  if ((await 펴.textContent().catch(() => "")) === "펴기") await 누름(펴, `01 ${D}`, "펴기");
  await p.waitForTimeout(300);
  const hw = row.locator(".card[data-card=check] .hw");
  for (let k = 0, n = await hw.count(); k < n; k++)
    await 누름(hw.nth(k).locator(".chk button[data-v]").filter({ hasText: "○" }).first(), `01 ${D}`, "검사 ○");
  const 마감 = row.locator("[data-act=close]");
  if (await 마감.count()) { if (await 누름(마감, `01 ${D}`, "마감")) 마감한것++; }
}
console.log(`   수업일 ${연것}일 · 마감 ${마감한것}일`);

// ══ 3. 화면마다 읽기 재기 ═══════════════════════════════════════════════════
console.log("\n3. 읽기 재기 — 본문 · 설명문 · 카드 · 폰에서 몇 화면분\n");
const 화면들 = [
  ["/", "17 대시보드"], ["/today", "01 오늘 수업"], ["/send", "10 발송"], ["/send/monthly", "10b 월간 리포트"],
  ["/send/notice", "10c 공지"], ["/schedule", "12 일정"], ["/schedule/classes", "02c 반"], ["/schedule/exams", "06b 시험 회차"],
  ["/schedule/exams/prep", "04 내신 자료"], ["/schedule/grid", "06c 학교별 표"], ["/schedule/todo", "05 할 일"],
  ["/schedule/import", "12b 받아오기"], ["/scores", "16 성적"], ["/books", "15 교재"], ["/books/videos", "19 영상"],
  ["/ops", "13 수강료"], ["/ops/students", "14 학생"], ["/ops/files", "20 자료함"], ["/ops/inquiry", "18 신규 상담"],
  ["/settings", "21 설정"], ["/settings/access", "21b 누가 무엇을 보나"], ["/settings/progress", "21c 진도 체크"], ["/settings/routine", "11 루틴"],
];
for (const [url, 이름] of 화면들) await 재기(url, 이름);

// ══ 4. 목록 — 설명문이 많은 순 ══════════════════════════════════════════════
잰것.sort((a, b) => b.설명글자 - a.설명글자);
console.log("\n\n■■ 읽을 것이 많은 순 — 설명문(p.note·small·.auto) 글자 수\n");
console.log("   설명문    본문   카드  폰   화면");
for (const r of 잰것) console.log(`   ${String(r.설명글자).padStart(5)}자(${String(r.설명수).padStart(2)}) ${String(r.본문).padStart(5)}자 ${String(r.카드).padStart(4)} ${String(r.폰화면).padStart(4)}  ${r.이름}`);
console.log(`\n   합계 설명문 ${잰것.reduce((a, r) => a + r.설명글자, 0)}자 · ${잰것.reduce((a, r) => a + r.설명수, 0)}개`);
console.log("\n■ 가장 긴 설명문 — 화면마다 셋\n");
for (const r of 잰것.slice(0, 10)) { console.log(`   ${r.이름}`); for (const g of r.긴것) console.log(`      ${String(g.n).padStart(4)}자  ${g.s}`); }
if (막힌것.length) { console.log("\n■ 막힌 곳\n"); 막힌것.forEach((x, i) => console.log(`   ${i + 1}. ${x}`)); }
if (쪽오류.length) { console.log("\n■ 브라우저 오류\n"); [...new Set(쪽오류)].forEach((x) => console.log(`   ${x}`)); }
console.log(`\n캡처: ${SHOT}/ (pc-* · phone-*)`);
await b.close();
