/**
 * **폰 폭에서 가로 스크롤이 생기나** — 오늘 수업 판 3탭 전수 (2026-08-27).
 *
 * 원장 실물 판정: 「검사·다음 탭에선 안 생기고 수업 탭에서 가로 스크롤」.
 * 스크린샷으로는 범인이 안 보인다 — 화면 밖으로 나간 요소는 스크린샷에도
 * 없기 때문이다. 그래서 여기서 폰 폭(390px)으로 판을 열고, 문서 폭이
 * 화면 폭을 넘으면 **넘어간 요소의 이름·클래스·글머리를 그대로 찍는다.**
 *
 * 골든 씨앗(골든반·골든하나 — golden-dayboard 가 심음)을 재사용하므로
 * run.sh 에서 골든 **뒤에** 돌아야 한다. 로그인·선택자·날짜 셈도 골든과
 * 같은 것을 쓴다 — 다른 셈이면 다른 판을 보게 된다.
 *
 * 처음에는 진단용이라 넘쳐도 경고만 찍고 초록으로 둔다 — 수리가 끝나면
 * OVERFLOW_STRICT=1 을 run.sh 에 박아 재발을 빨강으로 만든다.
 */
import { kstToday, addDays } from "./golden-lib.mjs";

const APP = process.env.E2E_APP || "http://127.0.0.1:3300";
const EXE = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const STRICT = process.env.OVERFLOW_STRICT === "1";
const PHONE = { width: 390, height: 844 };
const D = addDays(kstToday(), 10);   // golden-dayboard 와 같은 기준일

const { chromium } = await import("playwright-core");

async function login(page) {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await page.locator("input").first().fill("principal@e2e.test");
  await page.locator('input[type="password"]').first().fill("e2e-pass");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** 화면 폭을 넘은 요소들 — 오른끝이 큰 순으로, 겹말(부모-자식)은 깊은 쪽만 */
async function offenders(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const doc = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (doc <= W + 1) return { W, doc, list: [] };
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right <= W + 1 || r.width === 0) continue;
      // 자식도 넘쳤으면 부모는 안 적는다 — 범인은 제일 안쪽이다
      const childOver = [...el.children].some(
        (c) => c.getBoundingClientRect().right > W + 1
      );
      if (childOver) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === "string" ? el.className : "").trim().slice(0, 60),
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    }
    out.sort((a, b) => b.right - a.right);
    return { W, doc, list: out.slice(0, 12) };
  });
}

let bad = 0;
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: PHONE });
  await ctx.addCookies([{ name: "panel3", value: "on", url: APP }]);
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`${APP}/today?d=${D}`, { waitUntil: "networkidle", timeout: 90000 });

  const card = page.locator('.card:has(.grouphead:has-text("골든반"))').first();
  if (!(await card.count())) {
    console.log("✗ 골든반 카드가 없습니다 — run.sh 에서 골든 뒤에 돌아야 합니다");
    process.exit(1);
  }
  const row = card.locator('.stuRow:has-text("골든하나")').first();
  if (!(await row.isVisible().catch(() => false))) {
    await card.locator(".grouphead").click();
    await page.waitForTimeout(400);
  }
  await row.getByRole("button", { name: "▸ 열기" }).click();
  const panel = row.locator(".stuPanel");
  await panel.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  console.log("== 폰 폭 가로 넘침 (390px · 골든하나 판) ==");
  for (const tab of ["검사", "수업", "다음"]) {
    await panel.getByRole("button", { name: tab, exact: true }).first().click()
      .catch(() => {});
    await page.waitForTimeout(600);
    const { W, doc, list } = await offenders(page);
    if (list.length === 0) {
      console.log(`  ${tab} 탭 — 넘침 없음 (문서 ${doc} / 화면 ${W})`);
      continue;
    }
    bad++;
    console.log(`  ✗ ${tab} 탭 — 문서 ${doc}px > 화면 ${W}px. 넘은 요소:`);
    for (const o of list) {
      console.log(`      <${o.tag} class="${o.cls}"> 오른끝 ${o.right} 폭 ${o.width} — 「${o.text}」`);
    }
  }
} finally {
  await browser.close();
}

if (bad && STRICT) {
  console.log("✗ 가로 넘침 — OVERFLOW_STRICT 라 빨강");
  process.exit(1);
}
console.log(bad ? "⚠️  가로 넘침 있음 (위 목록이 범인 — 아직 진단 모드라 초록)" : "✅ 가로 넘침 없음");
