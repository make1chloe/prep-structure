/**
 * **진짜 브라우저로 눌러본다** (원장님, 2026-08-07 —
 * 「모든 페이지의 모든 버튼과 기능을 한번이상씩 사용해보고」).
 *
 * ── 이 검사가 잡는 것 ────────────────────────────────────────
 *
 * 코드를 읽는 검사로는 안 잡히던 것들이다.
 *
 *   · 화면이 아예 안 열린다 (서버에서 터짐 · 리다이렉트가 도는 것)
 *   · 눌렀는데 아무 일도 안 일어난다 (오류가 조용히 삼켜짐)
 *   · 브라우저 콘솔에 오류가 쌓인다 (React 가 화면을 반쯤 그리다 만다)
 *   · 역할이 다른 사람에게 남의 화면이 열린다
 *
 * ── 못 잡는 것 ───────────────────────────────────────────────
 *
 *   · 사진 (보관함이 이 판에 없다 — 501 로 답한다)
 *   · 알림 (VAPID · 진짜 브라우저 권한이 필요하다)
 *   · 문자 발송 (솔라피)
 *
 * 그런 것은 검사 끝에 「못 본 것」 으로 적는다. **안 본 것을 봤다고 하면
 * 검사가 없는 것보다 나쁘다.**
 *
 * 쓰는 법:  node scripts/e2e/click.mjs
 */
import { chromium } from "playwright-core";

const APP = process.env.E2E_APP || "http://127.0.0.1:3300";
const EXE = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const WHO = {
  principal: { id: "principal@e2e.test", pw: "e2e-pass", home: "/" },
  student: { id: "chloe0001", pw: "e2e-pass", home: "/me" },
  parent: { id: "parent0001@e2e.test", pw: "e2e-pass", home: "/parent" },
};

/** 원장이 여는 화면 전부 */
const STAFF_PAGES = [
  "/", "/today", "/check", "/plan",
  "/students", "/scores", "/classes",
  "/textbooks", "/homework", "/prep", "/videos",
  "/tasks", "/schedule", "/schools",
  "/report", "/monthly",
  "/tuition", "/notes", "/consult",
  "/settings", "/settings/messages", "/settings/messages?t=screen",
  "/settings/screen", "/settings/admin", "/settings/sql", "/import",
];

let fail = 0;
const bad = (what, why) => { console.log(`  ✗ ${what}\n     ${why}`); fail = 1; };

/** 그 화면에서 브라우저가 뱉은 오류를 모은다 */
function watch(page) {
  const errs = [];
  const skip = (u = "") => /\/api\/icon\/|storage\/v1|favicon/.test(u);

  page.on("pageerror", (e) => errs.push(`터짐: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    /**
     * **「Failed to load resource」 는 주소를 안 알려준다.**
     *
     * 그래서 이 줄로는 무엇이 404 인지 가릴 수가 없다 — 로고를 안 올려서
     * 나는 소리인지, 진짜 깨진 것인지. 안 부르는 주소는 아래 response 에서
     * 주소를 보고 가린다. 여기서는 **코드가 터진 것만** 센다.
     */
    if (/Failed to load resource/i.test(t)) return;
    // 알림·홈화면 담기는 이 판에 없다 (VAPID 열쇠도 진짜 권한도 없다)
    if (/Service ?Worker|ServiceWorker|Notification|manifest|permissions policy/i.test(t)) return;
    /**
     * **실시간(웹소켓)도 이 판에 없다.** 이 검사판은 Postgres + PostgREST
     * 만 세운다 — 실시간을 나르는 서버(realtime)는 안 띄운다.
     *
     * 그래서 「● 실시간」 을 쓰는 화면(오늘 수업 · 숙제 검사)은 여기서
     * 반드시 연결에 실패한다. 그건 앱이 깨진 것이 아니라 **판에 그 서버가
     * 없는 것**이다. 안 걸러두면 이 검사가 아무 때나 빨개져서, 진짜 오류가
     * 났을 때 「또 그거겠지」 로 넘어가게 된다.
     */
    if (/WebSocket|realtime\/v1/i.test(t)) return;
    errs.push(`콘솔: ${t.slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (skip(r.url())) return;
    // 400·404 도 본다 — 화면은 그려지는데 안쪽에서 자료를 못 받는 경우가 있다
    if (r.status() >= 400) errs.push(`${r.status()} ${r.url().replace(APP, "")}`);
  });
  return errs;
}

async function login(page, who) {
  const w = WHO[who];
  /**
   * **React 가 붙기를 기다린다.** domcontentloaded 만으로는 글자만 그려진
   * 상태라, 눌러도 아무 일이 안 일어난다 — 실제로 여기서 20초를 기다리다
   * 실패했다. 이게 바로 이 검사가 잡으려는 부류의 일이기도 하다.
   */
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  // 아이디 칸은 type 이 안 붙어 있다 — 첫 칸이 아이디, 그다음이 비밀번호
  await page.locator("input").first().fill(w.id);
  await page.locator('input[type="password"]').first().fill(w.pw);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  return new URL(page.url()).pathname;
}

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });

try {
  // ── 1) 들어가면 자기 자리로 ────────────────────────────────
  console.log("== 들어가면 자기 자리로 ==");
  for (const who of ["principal", "student", "parent"]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = watch(page);
    try {
      const landed = await login(page, who);
      if (landed !== WHO[who].home) {
        bad(`${who} 로그인`, `${WHO[who].home} 로 가야 하는데 ${landed} 로 갔습니다`);
      } else {
        console.log(`  ${who} → ${landed}`);
      }
    } catch (e) {
      bad(`${who} 로그인`, e.message.split("\n")[0]);
    }
    if (errs.length) bad(`${who} 첫 화면`, errs.slice(0, 3).join(" / "));
    await ctx.close();
  }

  // ── 2) 원장이 여는 화면이 다 열리나 ────────────────────────
  console.log("\n== 화면이 열리나 (원장) ==");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, "principal");

  for (const path of STAFF_PAGES) {
    const errs = watch(page);
    let res;
    try {
      res = await page.goto(`${APP}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    } catch (e) {
      bad(path, `안 열립니다 — ${e.message.split("\n")[0]}`);
      continue;
    }
    if (!res || res.status() >= 400) {
      bad(path, `HTTP ${res?.status()}`);
      continue;
    }
    // 화면이 열렸는데 **아무 글자도 없으면** 열린 것이 아니다
    const text = (await page.locator("main").innerText().catch(() => "")) || "";
    if (text.trim().length < 10) {
      bad(path, "화면이 비어 있습니다");
      continue;
    }
    if (errs.length) { bad(path, errs.slice(0, 2).join(" / ")); continue; }
    console.log(`  ${path}`);
    page.removeAllListeners();
  }

  // ── 3) 눌러본다 ────────────────────────────────────────────
  //
  // **누른 뒤 화면이 달라져야 한다.** 「눌렀는데 아무 일도 안 일어난다」 가
  // 이 앱에서 제일 자주 나온 말이라, 그것만 따로 본다.
  console.log("\n== 눌러본다 ==");

  const CLICKS = [
    { at: "/", label: "＋ 보강 잡기", then: async (p) => p.locator('select:visible').first().isVisible() },
    { at: "/", label: "＋ 할일", then: async (p) => p.locator('input[placeholder*="예)"]').first().isVisible() },
    { at: "/plan", label: "보강", then: async (p) => (await p.locator("text=잡아둔 보강, text=보강 필요").count()) >= 0 },
    // 「지난 수업 고치기」 는 오늘 수업의 날짜 넘기기로 이사했다
    // (PlanBoard 주석, 2026-08-14). 이사한 자리에서 같은 일을 본다 —
    // 하루 전으로 넘기면 「지난 날짜」 띠가 떠야 한다. 띠가 없으면
    // 지난 날을 오늘인 줄 알고 출결을 찍어 그날 기록이 조용히 덮인다.
    { at: "/today", label: "‹ 하루 전", then: async (p) => p.locator('text=지난 날짜를 보는 중').first().isVisible() },
    { at: "/check", label: "다음 수업 숙제 · 전달사항 미리 넣기", then: async (p) => p.locator("text=숙제 내기").first().isVisible() },
    { at: "/settings", label: "운영 규칙", then: async (p) => p.locator("text=경고 · 반성문 규칙").first().isVisible() },
    { at: "/settings", label: "연동 · 키", then: async (p) => p.locator("text=발송 방식").first().isVisible() },
    /**
     * **전화 끊고 바로 나가는 두 통** (2026-08-07). 발송 방식이 「직접 발송」
     * 이면 문자로 안 나가고 글만 만들어 돌려준다 — 그때 화면에 한 줄이
     * 떠야 한다. 아무 말도 없으면 「눌렀는데 아무 일도 안 일어난다」 다.
     */
    {
      at: "/consult", label: "① 설문지 링크",
      then: async (p) => (await p.locator("textarea").count()) > 0
        || (await p.locator("text=보냈어요").count()) > 0
        || (await p.locator(".err").count()) > 0,
    },
    {
      at: "/consult", label: "② 일정 · 오시는 길",
      then: async (p) => (await p.locator("textarea").count()) > 0
        || (await p.locator("text=보냈어요").count()) > 0
        || (await p.locator(".err").count()) > 0,
    },
  ];

  for (const c of CLICKS) {
    const errs = watch(page);
    try {
      await page.goto(`${APP}${c.at}`, { waitUntil: "networkidle", timeout: 30000 });
      const btn = page.getByRole("button", { name: c.label, exact: false }).first();
      if (!(await btn.count())) { bad(`${c.at} 「${c.label}」`, "단추가 없습니다"); continue; }
      await btn.click({ timeout: 10000 });
      await page.waitForTimeout(700);
      const ok = await c.then(page).catch(() => false);
      if (!ok) bad(`${c.at} 「${c.label}」`, "눌렀는데 화면이 그대로입니다");
      else console.log(`  ${c.at} 「${c.label}」`);
    } catch (e) {
      bad(`${c.at} 「${c.label}」`, e.message.split("\n")[0]);
    }
    if (errs.length) bad(`${c.at} 「${c.label}」 뒤`, errs.slice(0, 2).join(" / "));
    page.removeAllListeners();
  }

  // ── 3-2) 기계가 부르는 주소 ────────────────────────────────
  //
  // **홈 화면에 담을 때 폰이 먼저 읽는 것**이다. 여기가 깨지면 아이콘이
  // 안 담기거나 이름이 엉뚱하게 뜨는데, 화면에는 아무 표시가 없다 —
  // 실제로 이 파일에서 목록 하나가 통째로 빠진 채 빌드를 통과했다.
  console.log("\n== 홈 화면에 담을 때 폰이 읽는 것 ==");
  for (const who of ["principal", "parent", "student"]) {
    try {
      const r = await page.request.get(`${APP}/manifest/${who}`);
      if (!r.ok()) { bad(`/manifest/${who}`, `HTTP ${r.status()}`); continue; }
      const j = await r.json();
      if (!j.short_name || !j.start_url) { bad(`/manifest/${who}`, "이름이나 시작 주소가 없습니다"); continue; }
      console.log(`  /manifest/${who} — ${j.short_name}`);
    } catch (e) {
      bad(`/manifest/${who}`, e.message.split("\n")[0]);
    }
  }

  /**
   * ── 3-2) 굴리면 메뉴가 접히나 ─────────────────────────────
   *
   * 원장님 (2026-08-07) — 「아래로 스크롤하면 대메뉴만 나오고 많이
   * 올라가면 소메뉴 나오고」
   *
   * 코드를 읽는 검사로는 못 잡는다. **어느 쪽으로 굴리는지**에 따라
   * 달라지는 일이라 진짜로 굴려봐야 안다.
   *
   * 같이 보는 것이 하나 더 있다 — **문서 길이가 안 변해야 한다.**
   * 접으면서 문서가 짧아지면 읽던 자리가 위로 훅 튄다. 손가락은 가만히
   * 있는데 글이 움직이니 그 자체로 고장처럼 느껴진다.
   */
  console.log("\n== 굴리면 메뉴가 접히나 ==");
  try {
    await page.goto(`${APP}/students`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    // 검사판에는 자료가 적어 화면이 안 굴러간다 — 굴릴 자리를 만들어 준다
    await page.evaluate(() => {
      const d = document.createElement("div");
      d.style.height = "2400px";
      document.querySelector("main")?.appendChild(d);
    });
    const nav = () => page.evaluate(() => document.documentElement.dataset.nav || "(없음)");
    const docH = () => page.evaluate(() => document.documentElement.scrollHeight);
    const to = async (y) => { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(400); };

    await to(0);
    const h0 = await docH();
    if ((await nav()) !== "full") bad("맨 위에서 메뉴", `펴져 있어야 하는데 ${await nav()}`);
    else console.log("  맨 위 — 대메뉴 + 소메뉴");

    await to(700); await to(1100);
    if ((await nav()) !== "compact") bad("내려갈 때 메뉴", `접혀야 하는데 ${await nav()}`);
    else console.log("  내려가면 — 대메뉴만");

    const h1 = await docH();
    if (h0 !== h1) bad("접을 때 글이 튄다", `문서 길이가 ${h0} → ${h1} 로 바뀌었습니다`);
    else console.log("  접어도 글이 안 튑니다 (문서 길이 그대로)");

    await to(0); await to(1400); await to(1150);
    if ((await nav()) !== "full") bad("올라올 때 메뉴", `펴져야 하는데 ${await nav()}`);
    else console.log("  많이 올라오면 — 소메뉴가 돌아옵니다");

    /**
     * **컴퓨터에서는 가리키기만 해도** (원장님 — 「PC에서는 마우스가
     * 그리로 가면 소메뉴 나오게」). 굴려서 펴는 것은 손가락 이야기다.
     */
    await to(0); await to(900); await to(1300);
    const sub = page.locator(".navitems").first();
    if (await sub.isVisible()) bad("접힌 상태", "소메뉴가 아직 보입니다");
    else {
      await page.locator(".navgroup-tag").first().hover();
      await page.waitForTimeout(300);
      if (!(await sub.isVisible())) bad("마우스를 갖다 대면", "소메뉴가 안 나옵니다");
      else console.log("  마우스를 갖다 대면 — 소메뉴가 나옵니다");
    }
  } catch (e) {
    bad("메뉴 접기", e.message.split("\n")[0]);
  }

  // ── 4) 남의 화면은 안 열린다 ───────────────────────────────
  console.log("\n== 남의 화면 ==");
  const sctx = await browser.newContext();
  const spage = await sctx.newPage();
  await login(spage, "student");
  for (const path of ["/", "/students", "/tuition", "/settings"]) {
    await spage.goto(`${APP}${path}`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    const landed = new URL(spage.url()).pathname;
    const body = (await spage.locator("body").innerText().catch(() => "")) || "";
    const blocked = landed !== path || /원장|로그인|볼 수 없|권한/.test(body.slice(0, 400));
    if (!blocked) bad(`학생이 ${path}`, "그대로 열렸습니다");
    else console.log(`  학생이 ${path} → 막힘`);
  }
  await sctx.close();

  // ── 5) 학생 · 학부모 화면 ──────────────────────────────────
  //
  // 여기가 제일 안 보이는 자리다. 원장님은 미리보기로 여실 수 있지만 그건
  // **선생님 권한으로 보는 것**이라 다 보인다 — 실제로 학부모 화면이 몇 주
  // 동안 통째로 비어 있었는데 아무도 몰랐다.
  console.log("\n== 학생 화면 ==");
  await eachPage("student", ["/me"]);
  console.log("\n== 학부모 화면 ==");
  await eachPage("parent", ["/parent"]);

  // ── 6) 오간 것이 서로에게 닿나 ────────────────────────────
  console.log("\n== 오간 것이 닿나 ==");
  await roundTrip();

  await ctx.close();
} finally {
  await browser.close();
}


/**
 * 그 사람 눈으로 화면을 열어본다.
 *
 * **비어 있으면 실패다.** 「오류가 안 났다」 와 「보여야 할 것이 보인다」 는
 * 다른 이야기다 — 읽기 규칙이 막으면 오류 없이 빈 화면이 나온다.
 */
async function eachPage(who, paths) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await login(p, who);
  for (const path of paths) {
    const errs = watch(p);
    try {
      const res = await p.goto(`${APP}${path}`, { waitUntil: "networkidle", timeout: 30000 });
      if (!res || res.status() >= 400) { bad(`${who} ${path}`, `HTTP ${res?.status()}`); continue; }
      const text = (await p.locator("main").innerText().catch(() => "")) || "";
      if (text.trim().length < 20) { bad(`${who} ${path}`, "화면이 비어 있습니다"); continue; }
      if (errs.length) { bad(`${who} ${path}`, errs.slice(0, 2).join(" / ")); continue; }
      console.log(`  ${who} ${path}`);
    } catch (e) {
      bad(`${who} ${path}`, e.message.split("\n")[0]);
    }
    p.removeAllListeners();
  }
  await c.close();
  return p;
}

/**
 * **양쪽이 서로에게 닿나** (원장님, 2026-08-07 — 「학부모, 학생에서
 * 클릭했을 때 그게 원장에 제대로 뜨는지까지, 원장에서 넣었을 때 학생
 * 학부모에게 뜨는지 확인」).
 *
 * 화면이 열리는 것만 봐서는 못 잡는 자리다. 어머니가 결석을 알리셨는데
 * 원장님 대시보드에 안 뜨면, 오류는 어디에도 안 나고 **결석만 지나간다.**
 * 실제로 알림이 조용히 안 가던 일이 몇 번 있었다.
 */
async function roundTrip() {
  const stamp = `검사${Date.now() % 100000}`;

  // ① 어머니가 보낸다 → ② 원장님께 뜬다
  const pc = await browser.newContext();
  const pp = await pc.newPage();
  await login(pp, "parent");
  let sent = false;
  try {
    await pp.goto(`${APP}/parent`, { waitUntil: "networkidle" });
    // 첫 방문에는 「화면 소개」 안내판이 화면을 덮는다 (SectionNav) —
    // 진짜 어머니가 하시는 그대로, 먼저 닫고 들어간다. 안 닫으면
    // 아래 어떤 단추도 안 눌린다 (4판 실측: introwrap 이 클릭을 가로챔)
    const intro = pp.getByRole("button", { name: /볼 필요 없음/ }).first();
    if (await intro.count()) { await intro.click(); await pp.waitForTimeout(300); }
    // 알림 칸은 접혀 있다 — 늘 펴져 있으면 첫 화면이 입력칸으로 시작한다
    await pp.getByRole("button", { name: "알리기", exact: true }).first().click();
    await pp.waitForTimeout(400);
    await pp.getByRole("button", { name: "전달", exact: true }).first().click();
    await pp.waitForTimeout(300);
    await pp.locator("textarea").first().fill(`${stamp} 병원 때문에 늦습니다`);
    await pp.getByRole("button", { name: /보내기/ }).first().click();
    await pp.waitForTimeout(2000);
    // **보낸 것이 내 목록에 남았나** — 여기 없으면 저장부터 실패한 것이라
    // 대시보드를 보러 갈 이유가 없다 (5판: 대시보드에 안 떠서 갈랐다)
    const mine = await pp.locator("main").innerText();
    if (!mine.includes(stamp)) {
      bad("학부모가 보내기", "눌렀는데 내 목록에 안 남았습니다 (저장 실패)");
      await pp.screenshot({ path: "/var/tmp/e2e-parent-fail.png", fullPage: true }).catch(() => {});
    } else sent = true;
  } catch (e) {
    // 첫 줄만 찍으면 「Timeout」 만 남고 어느 단추였는지가 사라진다 —
    // 원격(Actions)에서는 다시 눌러볼 수 없으니 호출 기록까지 남긴다.
    // (3판: 단추는 찾았는데 click 이 안 끝났다 — 겹침·흔들림이면 그
    // 이유가 기록 뒷줄에 나온다. 그래서 넉넉히 남긴다)
    bad("학부모가 보내기", e.message.split("\n").slice(0, 16).join(" ⏎ "));
    // 눈으로도 본다 — 원격에서는 이 사진이 유일한 목격자다
    await pp.screenshot({ path: "/var/tmp/e2e-parent-fail.png", fullPage: true }).catch(() => {});
  }
  await pc.close();

  if (sent) {
    const c = await browser.newContext();
    const p = await c.newPage();
    await login(p, "principal");
    await p.goto(`${APP}/`, { waitUntil: "networkidle" });
    const body = await p.locator("main").innerText();
    if (body.includes(stamp)) console.log("  학부모 → 원장 (알림이 대시보드에 떴습니다)");
    else {
      // 학부모 쪽에는 남았는데 여기 없다 — 대시보드가 잃는 쪽이다.
      // 「학부모 알림」 배지조차 없는지까지 갈라 적는다 (0건 조회 vs 접힘)
      bad("학부모 → 원장", `보냈는데 대시보드에 안 뜹니다 (배지 ${body.includes("학부모 알림") ? "있음 — 접힘/본문 누락" : "없음 — 조회 0건"})`);
      await p.screenshot({ path: "/var/tmp/e2e-dash-fail.png", fullPage: true }).catch(() => {});
    }
    await c.close();
  }

  // ③ 원장님이 전달사항을 넣는다 → ④ 학생 화면에 뜬다
  const note = `검사공지${Date.now() % 100000}`;
  const c2 = await browser.newContext();
  const p2 = await c2.newPage();
  await login(p2, "principal");
  let made = false;
  try {
    await p2.goto(`${APP}/check`, { waitUntil: "networkidle" });
    await p2.getByRole("button", { name: /미리 넣기/ }).first().click();
    await p2.waitForTimeout(600);
    await p2.getByRole("button", { name: "보이는 학생 전체", exact: true }).first().click();
    // 바깥 칸(숙제 내기 / 공지 · 메모) 을 먼저, 그다음 안쪽에서 갈래를 고른다
    await p2.getByRole("button", { name: "공지 · 메모", exact: true }).first().click();
    await p2.waitForTimeout(400);
    // **「숙제 공지」 여야 한다.** 「수업 메모」 는 아이 화면에 안 뜬다 —
    // 교실에서 말하려고 적어둔 것이라 그렇게 정했다 (lib/notices)
    await p2.getByRole("button", { name: "숙제 공지", exact: true }).first().click();
    await p2.waitForTimeout(400);
    // 날짜는 오늘로 — 학생 화면이 오늘 것을 보여준다
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    // 날짜 칸이 화면에 둘이다 (검사 날짜 · 공지 날짜) — 뒤엣것이 공지 날짜다
    await p2.locator('input[type="date"]').last().fill(today);
    await p2.locator("textarea").first().fill(note);
    p2.on("dialog", (d) => d.accept());
    const save = p2.getByRole("button", { name: "저장", exact: true }).first();
    // 눌리는 상태가 될 때까지 — 학생·날짜·본문이 다 차야 열린다
    await save.waitFor({ state: "visible", timeout: 10000 });
    for (let i = 0; i < 20 && (await save.isDisabled()); i += 1) await p2.waitForTimeout(300);
    if (await save.isDisabled()) throw new Error("「저장」 이 잠겨 있습니다 (학생·날짜·본문 중 하나가 안 찼습니다)");
    await save.click();
    await p2.waitForTimeout(3000);
    made = true;
  } catch (e) {
    bad("원장이 전달사항 넣기", e.message.split("\n")[0]);
  }
  await c2.close();

  if (made) {
    const c3 = await browser.newContext();
    const p3 = await c3.newPage();
    await login(p3, "student");
    await p3.goto(`${APP}/me`, { waitUntil: "networkidle" });
    const body = await p3.locator("main").innerText();
    if (body.includes(note)) console.log("  원장 → 학생 (전달사항이 학생 화면에 떴습니다)");
    else bad("원장 → 학생", "넣었는데 학생 화면에 안 뜹니다");
    await c3.close();
  }
}

console.log("\n── 이 검사가 못 본 것 ──");
console.log("  사진 (보관함이 이 판에 없습니다) · 앱 알림 · 문자 발송");

if (fail) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 눌러보기 통과");
