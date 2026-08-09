/**
 * **화면을 찍어서 눈으로 본다** (원장님, 2026-08-09 — 칸반).
 *
 * 코드를 읽는 검사로는 안 잡히는 것이 있다. 칸반을 처음 세웠을 때
 *   · 머리에 「17」 이라 적혀 있는데 카드는 아홉 장만 보였고
 *   · 오늘 마감인 일이 이레 뒤 마감인 일 **아래**에 있었고
 *   · 폰에서 마지막 카드가 반쯤 잘려 있었다
 * 셋 다 찍어 보고서야 알았다. 못 박는 것은 check-kanban.mjs 가 하고,
 * 이 파일은 **처음 보는 눈**을 대신한다.
 *
 * 쓰는 법:  bash scripts/e2e/up.sh  뒤에 앱을 띄우고
 *           OUT=/어디로 node scripts/e2e/kanban-shot.mjs
 */
import { chromium } from "playwright-core";
const APP = "http://127.0.0.1:3300";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.OUT || ".";
const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
for (const [name, vp] of [["wide", { width: 1280, height: 1000 }], ["phone", { width: 390, height: 860 }]]) {
  const p = await b.newPage({ viewport: vp });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await p.locator("input").first().fill("principal@e2e.test");
  await p.locator('input[type="password"]').first().fill("e2e-pass");
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await p.goto(`${APP}/tasks?view=todo`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "칸반", exact: true }).click();
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/kb-${name}.png`, fullPage: true });
  const cols = await p.locator(".kbcol .kbhead").allInnerTexts();
  const cards = await p.locator(".kbcard").count();
  console.log(`${name}: 칸 [${cols.join(" | ").replace(/\n/g, " ")}] · 카드 ${cards}장${errs.length ? " · 터짐 " + errs[0] : ""}`);
  await p.close();
}
await b.close();
