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
ok("원장 메뉴 = 지은 화면 전부(대시보드·오늘·발송·설정)", tabs.join(",") === "대시보드,오늘,발송,설정", tabs.join(","));
const leftBefore = (await p.locator("main .card .ctitle b").first().textContent()).trim();
ok("안 정한 권한 칸 수가 뜬다(32칸 중)", /^\d+$/.test(leftBefore), leftBefore);
for (const v of VIEWS) { await p.setViewportSize(v.viewport); await p.screenshot({ path: `.tmp/e2e-home-${v.viewport.width}.png`, fullPage: true }); }
await p.setViewportSize(VIEWS[0].viewport);
console.log("■ 발송 10 — 아침: 늦게 가는 아이 없음 · 마감한 판 0 · 나간 것 0 · 리허설 스위치");
await p.goto(APP + "/send"); await p.waitForLoadState("networkidle").catch(() => {});
const sm = p.locator("main");
ok("발송 — 묶음 넷 + 오늘 나간 것 · 🌙 지금 보낼 것 0 · 「오늘 늦게 가는 아이가 없습니다」 · 마감 「0 / N」(판이 있으면 전부 ⏳ 안 나갑니다) · 나간 것 0 · 🧪 리허설(off) 알약 · 보내기 단추 잠김", (await sm.locator("[data-card=now], [data-card=daily], [data-card=auto], [data-card=scheduled], [data-card=sent]").count()) === 5 && (await sm.locator("[data-g=now-count]").textContent()) === "🌙 지금 보낼 것 0" && (await sm.locator("[data-card=now]").textContent()).includes("오늘 늦게 가는 아이가 없습니다") && /^0 \/ \d+$/.test(await sm.locator("[data-g=closed-count]").textContent()) && (await sm.locator("[data-g=daily-row][data-state=open]").count()) === Number((await sm.locator("[data-g=closed-count]").textContent()).split("/")[1]) && (await sm.locator("[data-g=sent-head] b").first().textContent()) === "0" && (await sm.locator("[data-g=sink]").textContent()).includes("리허설(off)") && (await sm.locator("[data-g=sendbar] button[data-act=send-now]").isDisabled()), (await sm.textContent()).replace(/\s+/g, " ").slice(0, 300));
for (const v of VIEWS) { await p.setViewportSize(v.viewport); await p.screenshot({ path: `.tmp/e2e-send-morning-${v.viewport.width}.png`, fullPage: true }); }
await p.setViewportSize(VIEWS[0].viewport);
console.log("■ 루틴 11 — 학원 기본 루틴(영역 일곱) · + 항목 · ✎ · ▲▼ · 🗑 내림·되살리기 · 예습 · 아이만 고치기 · 교재 기준·회차·이대로면");
await p.goto(APP + "/settings/routine?s=99999999-0000-4000-9000-000000000001"); await p.waitForLoadState("networkidle").catch(() => {});
const rm = p.locator("main");
const areaN = Number((await rm.locator("[data-g=area-count]").textContent()).replace(/\D/g, ""));
ok(`영역 일곱 · 문법 「학원 3 · 숙제 2 · 필수 3」(씨앗 넉 줄) · 단어는 「학원이 0줄 — 맞습니다」(실데이터 교재예습은 예습 자리) · 영역 ${areaN} · 교재마다 짜면 N벌 → 영역마다 ${areaN}벌`, (await rm.locator("[data-g=area]").count()) === 7 && (await rm.locator("[data-g=area][data-area=문법] [data-g=area-stats]").textContent()) === "학원 3 · 숙제 2 · 필수 3" && (await rm.locator("[data-g=area][data-area=단어] [data-g=word-note]").count()) === 1 && areaN >= 1 && (await rm.locator("[data-g=cmp] .cn.ok").textContent()) === `${areaN}벌`, (await rm.locator("[data-g=area][data-area=단어]").textContent()).replace(/\s+/g, " ").slice(0, 200));
const ar = rm.locator("[data-g=area][data-area=영작]");
await ar.locator("button[data-act=add-area]").click(); await rm.locator("[data-g=item-form] input[name=name]").fill("zz_영작 문제풀기"); await rm.locator("[data-g=item-form] input[name=method]").fill("개념설명도 읽고 형광펜 밑줄"); await rm.locator("[data-g=item-form] input[name=checks]").fill("읽기, 밑줄"); await rm.locator("[data-g=item-form] label.ckl", { hasText: "필수" }).locator("input").check(); await rm.locator("[data-g=item-form] button[data-act=item-save]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }); await p.waitForTimeout(800);
ok(`+ 항목(영작 · 둘 다 · 필수) → 줄 1 「zz_영작 문제풀기 · 개념설명도 읽고 … · 읽기 · 밑줄」 · 「학원 1 · 숙제 1 · 필수 1」 · 영역 ${areaN + 1}`, (await ar.locator("[data-g=line]").count()) === 1 && (await ar.locator("[data-g=line]").first().textContent()).includes("읽기 · 밑줄") && (await ar.locator("[data-g=area-stats]").textContent()) === "학원 1 · 숙제 1 · 필수 1" && (await rm.locator("[data-g=area-count]").textContent()) === `영역 ${areaN + 1}`, (await ar.textContent()).replace(/\s+/g, " ").slice(0, 200));
await ar.locator("button[data-act=add-area]").click(); await rm.locator("[data-g=item-form] input[name=name]").fill("zz_영작 숙제채점"); await rm.locator("[data-g=item-form] [data-g=form-place] button", { hasText: "학원" }).click(); await rm.locator("[data-g=item-form] button[data-act=item-save]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }); await p.waitForTimeout(800);
await ar.locator("[data-g=line]").nth(1).locator("button[data-act=up]").click(); await p.waitForTimeout(1500);
ok("둘째 줄(학원) 더하고 ▲ → 차례가 바뀐다(숙제채점 · 문제풀기) · 「학원 2 · 숙제 1 · 필수 1」", (await ar.locator("[data-g=line] b").allTextContents()).join(",") === "zz_영작 숙제채점,zz_영작 문제풀기" && (await ar.locator("[data-g=area-stats]").textContent()) === "학원 2 · 숙제 1 · 필수 1", (await ar.locator("[data-g=line] b").allTextContents()).join(","));
await ar.locator("[data-g=line]").first().locator("button[data-act=edit]").click(); await ar.locator("[data-g=item-form] input[name=name]").fill("zz_영작 채점"); await ar.locator("[data-g=item-form] button[data-act=item-save]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }); await p.waitForTimeout(800);
await ar.locator("[data-g=line]").first().locator("[data-g=place] button", { hasText: "예습" }).click(); await p.waitForTimeout(1500);
ok("✎ 이름 고치기 → 「zz_영작 채점」 · 자리를 「예습」으로(확정-57 — 0065 의 next 자리, 다음 소단원을 숙제로) → 「학원 1 · 숙제 1 · 필수 1 · 예습 1」", (await ar.locator("[data-g=line] b").first().textContent()) === "zz_영작 채점" && (await ar.locator("[data-g=line]").first().locator("[data-g=place] button[aria-pressed=true]").textContent()) === "예습" && (await ar.locator("[data-g=area-stats]").textContent()) === "학원 1 · 숙제 1 · 필수 1 · 예습 1", (await ar.locator("[data-g=area-stats]").textContent()));
await ar.locator("[data-g=line]").nth(1).locator("button[data-act=retire]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }); await p.waitForTimeout(800);
ok("🗑(문제풀기) → 줄 1 · 「내린 것 1」(지우지 않았다, 확정-㊷) · 「학원 0 · 숙제 0 · 필수 0 · 예습 1」", (await ar.locator("[data-g=line]").count()) === 1 && (await ar.locator("[data-g=retired] summary").textContent()).includes("내린 것 1") && (await ar.locator("[data-g=area-stats]").textContent()) === "학원 0 · 숙제 0 · 필수 0 · 예습 1", (await ar.locator("[data-g=area-stats]").textContent()));
await ar.locator("[data-g=retired] summary").click(); await ar.locator("[data-g=retired] button[data-act=revive]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }); await p.waitForTimeout(800);
ok("되살리기 → 줄 2 · 내린 것 없음", (await ar.locator("[data-g=line]").count()) === 2 && (await ar.locator("[data-g=retired]").count()) === 0);
const sa = rm.locator("[data-g=student-area][data-area=문법]");
ok("🧑 아이(zz_시험_학생) — 문법 「학원 기본 그대로」 넉 줄 · 자리 세그먼트는 잠김 · 📚 문법책 「문법 루틴을 씁니다」 · 기준 소단원 · 회차 1 · 이대로면(남은 소단원 n/N · 수업 N회)", (await sa.getAttribute("data-custom")) === "false" && (await sa.locator("[data-g=sline]").count()) === 4 && (await sa.locator("[data-g=sline] [data-g=splace] button").first().isDisabled()) && (await rm.locator("[data-g=book] .tag.on", { hasText: "문법 루틴을 씁니다" }).count()) === 1 && (await rm.locator("[data-g=book] [data-g=basis] button[aria-pressed=true]").textContent()) === "소단원" && (await rm.locator("[data-g=book] [data-g=pace] input").inputValue()) === "1" && /남은 소단원 \d+\/\d+ · 수업 \d+회/.test(await rm.locator("[data-g=book] [data-g=endd]").textContent()), (await rm.locator("[data-g=book]").textContent()).replace(/\s+/g, " ").slice(0, 200));
await sa.locator("button[data-act=customize]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }); await p.waitForTimeout(800);
await rm.locator("[data-g=student-area][data-area=문법] [data-g=sline]").first().locator("button[data-act=sretire]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }); await p.waitForTimeout(800);
ok("「이 아이만 고치기」 → 이 아이만 고침 · 첫 줄 🗑 → 줄 3 · 「뺐습니다」 + ＋ · 📚 「이 아이만 고친 문법 루틴」", (await rm.locator("[data-g=student-area][data-area=문법]").getAttribute("data-custom")) === "true" && (await rm.locator("[data-g=student-area][data-area=문법] [data-g=sline]").count()) === 3 && (await rm.locator("[data-g=student-area][data-area=문법] [data-g=removed]").textContent()).includes("뺐습니다") && (await rm.locator("[data-g=book] .tag.act", { hasText: "이 아이만 고친 문법 루틴" }).count()) === 1, (await rm.locator("[data-g=student-area][data-area=문법]").textContent()).replace(/\s+/g, " ").slice(0, 200));
await rm.locator("[data-g=student-area][data-area=문법] [data-g=removed] button[data-act=srevive]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }); await p.waitForTimeout(800);
await rm.locator("[data-g=student-area][data-area=문법] button[data-act=reset]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }); await p.waitForTimeout(800);
ok("＋ 되살리기 → 「학원 기본으로」 → 학원 기본 그대로(줄은 내렸을 뿐 — 오늘 판은 그대로 4줄로 깔린다)", (await rm.locator("[data-g=student-area][data-area=문법]").getAttribute("data-custom")) === "false" && (await rm.locator("[data-g=student-area][data-area=문법] [data-g=sline]").count()) === 4);
await rm.locator("[data-g=book] [data-g=ut]").click(); await p.waitForSelector("[data-g=msg]", { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1500);   // 서버 답 뒤에 새로 읽는 칸이라 check() 대신 click()
const utOn = (await rm.locator("[data-g=book] [data-g=ut-seg] button[aria-pressed=true]").textContent().catch(() => ""));
await rm.locator("[data-g=book] [data-g=ut]").click(); await p.waitForTimeout(1500);
ok("단원평가 본다 → 「대단원마다」 세그먼트가 열린다 → 끄면 닫힌다(오늘 판엔 영향 없음)", utOn === "대단원마다" && (await rm.locator("[data-g=book] [data-g=ut-seg]").count()) === 0, utOn);
for (const v of VIEWS) { await p.setViewportSize(v.viewport); await p.screenshot({ path: `.tmp/e2e-routine-${v.viewport.width}.png`, fullPage: true }); }
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
await p.fill("#pw", "새비밀번호1"); await p.fill("#pw2", "새비밀번호1"); await Promise.all([p.waitForURL((u) => u.pathname === "/me"), p.click("form.card button[type=submit]")]);   // 아이는 바꾸자마자 제 화면(/me)
ok("바꾸면 「나」 화면(/me — 아이는 제 화면 하나)", new URL(p.url()).pathname === "/me", p.url());
console.log("■ 아이 화면 07 — 아침: 등원 전에도 「오늘 낼 숙제」가 보인다 → 출석을 찍으면 판이 선다(원장 손과 같은 길)");
const meMain = p.locator("main");
ok("메뉴 없음(아이는 제 화면 하나) · 등원·하원 카드", (await p.locator("header.appbar nav.tabs a").count()) === 0 && (await meMain.locator("[data-card=arrival]").count()) === 1, `tabs ${await p.locator("header.appbar nav.tabs a").count()} · arrival ${await meMain.locator("[data-card=arrival]").count()}`);
ok("「오늘 낼 숙제 2」 — 어제 숙제 둘, 등원 전엔 지난 판에서 · 「9/N 에 받은 숙제」", (await meMain.locator("[data-card=due] .h .pill").textContent()) === "2" && (await meMain.locator("[data-card=due]").textContent()).includes("에 받은 숙제"), (await meMain.locator("[data-card=due]").textContent()).replace(/\s+/g, " ").slice(0, 200));
ok("오늘 할 것은 「선생님이 오늘 수업을 열면」", (await meMain.locator("[data-card=todo]").textContent()).includes("오늘 수업을 열면"), (await meMain.locator("[data-card=todo]").textContent()).slice(0, 120));
ok("등원 전 — 알약 「아직」 · 집에 가요 단추 없음", (await meMain.locator("[data-g=arrival-pill]").textContent()) === "아직" && (await meMain.locator("[data-card=arrival] button[data-step='4']").count()) === 0);
await meMain.locator("[data-card=arrival] button[data-step='2']").click(); await p.waitForTimeout(3000);
await p.reload(); await p.waitForLoadState("networkidle").catch(() => {});
ok("「출석」 → 「HH:MM 왔음」 · ✓ 출석 · 두 번은 못 찍는다(단추가 사라진다) · 집에 가요 단추가 열린다", /^\d\d:\d\d 왔음$/.test(await meMain.locator("[data-g=arrival-pill]").textContent()) && (await meMain.locator("[data-card=arrival] .tag.on", { hasText: "출석" }).count()) === 1 && (await meMain.locator("[data-card=arrival] button[data-step='2']").count()) === 0 && (await meMain.locator("[data-card=arrival] button[data-step='4']").count()) === 1, (await meMain.locator("[data-card=arrival]").textContent()).replace(/\s+/g, " ").slice(0, 300));
ok("판이 섰다(원장 손과 같은 길) — 「오늘 낼 숙제 2」는 이제 검사 줄에서 · 오늘 할 것은 「선생님이 검사하면」", (await meMain.locator("[data-card=due] .h .pill").textContent()) === "2" && !(await meMain.locator("[data-card=due]").textContent()).includes("에 받은 숙제") && (await meMain.locator("[data-card=todo]").textContent()).includes("검사하면"), (await meMain.locator("[data-card=due]").textContent()).replace(/\s+/g, " ").slice(0, 200) + " / " + (await meMain.locator("[data-card=todo]").textContent()).slice(0, 100));
await meMain.locator("[data-card=arrival] button[data-step='1']").click(); await p.waitForTimeout(2000); await p.reload(); await p.waitForLoadState("networkidle").catch(() => {});
ok("「핸드폰 냈어요」도 찍힌다 — 도착 시각은 가장 이른 걸음 그대로(출석이 먼저였다)", (await meMain.locator("[data-card=arrival] .tag.on").count()) === 2);
ok("내 교재 — 「zz_리허설 문법책 · 1회독 · 남은 소단원」", (await meMain.locator("[data-card=books]").textContent()).includes("zz_리허설 문법책") && (await meMain.locator("[data-card=books]").textContent()).includes("1회독 · 남은 소단원"), (await meMain.locator("[data-card=books]").textContent()).slice(0, 120));
await ctx.storageState({ path: ".tmp/state-student.json" });   // 치수·글꼴·대비 검사가 아이 자격으로 /me 를 연다
for (const v of VIEWS) { await p.setViewportSize(v.viewport); await p.screenshot({ path: `.tmp/e2e-me-morning-${v.viewport.width}.png`, fullPage: true }); }
await p.setViewportSize(VIEWS[0].viewport);
await Promise.all([p.waitForURL(/\/login/), p.click("header.appbar form[action='/logout'] button")]);
await login(p, "student", "chloe0000", "새비밀번호1");
ok("새 비밀번호로 들어가고 다시 안 묻는다 — 「나」 화면으로", new URL(p.url()).pathname === "/me", p.url());
await Promise.all([p.waitForURL(/\/login/), p.click("header.appbar form[action='/logout'] button")]);
console.log("■ 학부모 09 — 아침: 마감한 판만 · 아이가 찍은 등원 · 다음 숙제 · 다음 시간 시험 · 남기실 말");
await login(p, "parent", "01000000000", PW);
ok("학부모도 처음엔 비밀번호를 바꾼다", new URL(p.url()).pathname === "/password", p.url());
await p.fill("#pw", "새비밀번호2"); await p.fill("#pw2", "새비밀번호2"); await Promise.all([p.waitForURL((u) => u.pathname === "/parent"), p.click("form.card button[type=submit]")]);
const pm = p.locator("main");
ok("바꾸면 학부모 화면(/parent) · 아이 이름 · 메뉴 없음", new URL(p.url()).pathname === "/parent" && (await pm.locator("[data-g=kid]").textContent()) === "zz_시험_학생" && (await p.locator("header.appbar nav.tabs a").count()) === 0, p.url());
ok("🕘 오늘 — 아이가 찍은 등원 「HH:MM 도착 · 하원 아직」 · 정시 등원 알약(마감 전 판은 안 보이지만 등원은 보인다)", /\d\d:\d\d 도착 · 하원 아직/.test(await pm.locator("[data-card=today]").textContent()), (await pm.locator("[data-card=today]").textContent()).slice(0, 120));
ok("📋 어제 수업(마감한 판) — 수업일지 글 없음 · 📘 다음 숙제 2(어제 낸 것) · 📝 다음 시간 시험 「단어 20개 · 통과 90%」 · 오늘 판은 마감 전이라 안 보인다", (await pm.locator("[data-card=recent]").textContent()).includes("수업일지 글이 없습니다") && (await pm.locator("[data-card=homework] .h .pill").textContent()) === "2" && (await pm.locator("[data-card=nextquiz]").textContent()).includes("단어 20개") && !(await pm.locator("[data-card=recent] .h b").textContent()).includes("오늘 수업"), (await pm.textContent()).replace(/\s+/g, " ").slice(0, 400));
ok("빈 카드는 숨긴다(확정-⑮) — 오늘 늦귀가·앞으로 없음 → 카드 없음 · 📨 보낸 것엔 어제·그저께 늦귀가 안내(씨앗) · 남기실 말 카드는 있다 · 달력 링크", (await pm.locator("[data-card=late]").count()) === 0 && (await pm.locator("[data-card=future]").count()) === 0 && (await pm.locator("[data-card=sent] .li").count()) === 2 && (await pm.locator("[data-card=sent]").textContent()).includes("늦귀가 안내 — 21:40 예정") && (await pm.locator("[data-card=ask]").count()) === 1 && (await pm.locator("[data-card=cal]").count()) === 1, (await pm.locator("[data-card=sent]").textContent().catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
await ctx.storageState({ path: ".tmp/state-parent.json" });
for (const v of VIEWS) { await p.setViewportSize(v.viewport); await p.screenshot({ path: `.tmp/e2e-parent-morning-${v.viewport.width}.png`, fullPage: true }); }
await p.setViewportSize(VIEWS[0].viewport);
await b.close();
console.log(`\n■ 화면 걷기 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
