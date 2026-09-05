/** 화면 걷기 — 진짜 브라우저로 눌러 본다(옛 앱 원장님 「가짜 db 돌리고서 크롬 클릭하면 되잖아」).
 *  1단계 뼈대: 로그인(역할마다 아이디) · 틀린 비밀번호 · 비밀번호 바꾸기 문(must_change_pw) · 메뉴가 켠 만큼만 · 권한 켜고 끄기 · 로그아웃.
 *  PC·폰 캡처를 .tmp/ 에 남기고, 원장 쿠키 상태를 .tmp/state-principal.json 에 남겨 치수·글꼴·대비 검사가 로그인한 채로 열게 한다. */
import fs from "node:fs";
import { launch, offline, VIEWS } from "../_browser.mjs";
const APP = process.env.E2E_APP || "http://127.0.0.1:3300";
const PW = "e2e-pass";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
async function login(p, kind, id, pw) {
  await p.goto(APP + "/login"); await p.fill(`#id-${kind}`, id); await p.fill(`#pw-${kind}`, pw);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login") || u.search.includes("e="), { timeout: 15000 }).catch(() => {}), p.click(`form:has(#id-${kind}) button[type=submit]`)]);
  await p.waitForLoadState("networkidle").catch(() => {});
}
const b = await launch();
const ctx = await b.newContext({ viewport: VIEWS[0].viewport }); await offline(ctx);
const p = await ctx.newPage();
console.log("■ 로그인 화면");
await p.goto(APP + "/login");
ok("카드 셋(학생·학부모·원장 강사 조교)", (await p.locator("form.card").count()) === 3);
ok("꼬리 도메인이 화면에 없다", !(await p.content()).includes("chloe-eng.internal"));
for (const v of VIEWS) { await p.setViewportSize(v.viewport); await p.screenshot({ path: `.tmp/e2e-login-${v.viewport.width}.png`, fullPage: true }); }
await p.setViewportSize(VIEWS[0].viewport);
console.log("■ 틀린 비밀번호");
await login(p, "staff", "zz_principal@e2e.test", "wrong");
{ const inCard = await p.locator("form:has(#id-staff) [role=alert]:visible").count(), all = await p.locator("main [role=alert]:visible").count();   // next-route-announcer 도 role=alert 라 main 안만 센다
  ok("그 카드에만 「맞지 않습니다」가 뜬다", inCard === 1 && all === 1, `url=${p.url()} 카드 안 ${inCard} · 전체 ${all} · ${(await p.locator("main").textContent()).replace(/\s+/g, " ").slice(0, 160)}`); }
ok("비밀번호가 주소에 안 남는다", !p.url().includes("wrong"));
console.log("■ 원장");
await login(p, "staff", "zz_principal@e2e.test", PW);
ok("들어가서 첫 화면", new URL(p.url()).pathname === "/", p.url());
ok("상단바에 이름·역할", (await p.locator("header.appbar .pill").first().textContent()).includes("원장"));
ok("나가는 길(로그아웃)이 상단바에 있다(0-10)", (await p.locator("header.appbar form[action='/logout'] button").count()) === 1);
const tabs = await p.locator("header.appbar nav.tabs a").allTextContents();
ok("원장 메뉴 = 지은 화면 전부(대시보드·오늘·설정)", tabs.join(",") === "대시보드,오늘,설정", tabs.join(","));
const leftBefore = (await p.locator("main .card .ctitle b").first().textContent()).trim();
ok("안 정한 권한 칸 수가 뜬다(32칸 중)", /^\d+$/.test(leftBefore), leftBefore);
for (const v of VIEWS) { await p.setViewportSize(v.viewport); await p.screenshot({ path: `.tmp/e2e-home-${v.viewport.width}.png`, fullPage: true }); }
await p.setViewportSize(VIEWS[0].viewport);
console.log("■ 누가 무엇을 보나 — 강사에게 대시보드를 켠다");
await p.goto(APP + "/settings/access");
ok("표가 뜬다", (await p.locator("table").count()) >= 1);
const cell = p.locator("form.seg[aria-label='강사 대시보드']");
ok("강사·대시보드 칸이 있다", (await cell.count()) === 1);
await cell.locator("button[value='1']").click(); await p.waitForLoadState("networkidle").catch(() => {});
await p.goto(APP + "/settings/access");
ok("켬이 눌린 채로 남는다", (await cell.locator("button[value='1']").getAttribute("aria-pressed")) === "true");
await p.goto(APP + "/");
const leftAfter = (await p.locator("main .card .ctitle b").first().textContent()).trim();
ok("안 정한 칸이 하나 줄었다", Number(leftAfter) === Number(leftBefore) - 1, `${leftBefore} → ${leftAfter}`);
for (const v of VIEWS) { await p.setViewportSize(v.viewport); await p.goto(APP + "/settings/access"); await p.screenshot({ path: `.tmp/e2e-access-${v.viewport.width}.png`, fullPage: true }); }
await p.setViewportSize(VIEWS[0].viewport);
await ctx.storageState({ path: ".tmp/state-principal.json" });
console.log("■ 로그아웃");
await Promise.all([p.waitForURL(/\/login/), p.click("header.appbar form[action='/logout'] button")]);
ok("로그인 화면으로 돌아온다", new URL(p.url()).pathname === "/login");
await p.goto(APP + "/"); ok("나간 뒤 첫 화면은 로그인으로 보낸다", new URL(p.url()).pathname === "/login");
console.log("■ 강사 — 켠 만큼만");
await login(p, "staff", "zz_instructor@e2e.test", PW);
const tabs2 = await p.locator("header.appbar nav.tabs a").allTextContents();
ok("강사 메뉴 = 대시보드 하나(설정은 안 정함 = 막힘)", tabs2.join(",") === "대시보드", tabs2.join(","));
await Promise.all([p.waitForURL(/\/login/), p.click("header.appbar form[action='/logout'] button")]);
console.log("■ 학생 — 처음 비밀번호는 바꿔야 들어간다");
await login(p, "student", "chloe0000", PW);
ok("비밀번호 바꾸기 화면으로 보낸다", new URL(p.url()).pathname === "/password", p.url());
await p.goto(APP + "/"); ok("안 바꾸면 첫 화면으로 못 간다", new URL(p.url()).pathname === "/password");
await p.fill("#pw", "0000"); await p.fill("#pw2", "0000"); await p.click("form.card button[type=submit]"); await p.waitForLoadState("networkidle").catch(() => {});
{ const n = await p.locator("main [role=alert]:visible").count(); ok("0000 은 거절한다", n === 1, `url=${p.url()} alert ${n} · ${(await p.locator("main").textContent()).replace(/\s+/g, " ").slice(0, 160)}`); }
await p.fill("#pw", "새비밀번호1"); await p.fill("#pw2", "새비밀번호1"); await Promise.all([p.waitForURL((u) => u.pathname === "/"), p.click("form.card button[type=submit]")]);
ok("바꾸면 첫 화면", new URL(p.url()).pathname === "/");
ok("학생에게는 「곧 열립니다」", (await p.locator("main").textContent()).includes("곧 열립니다"));
await Promise.all([p.waitForURL(/\/login/), p.click("header.appbar form[action='/logout'] button")]);
await login(p, "student", "chloe0000", "새비밀번호1");
ok("새 비밀번호로 들어가고 다시 안 묻는다", new URL(p.url()).pathname === "/", p.url());
await b.close();
console.log(`\n■ 화면 걷기 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
