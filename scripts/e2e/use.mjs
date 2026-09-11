/** 사람처럼 써 보기(원장님 2026-09-11 「니가 직접 써봐야 할일을 확인하지 않을까」) — 검사가 아니다.
 *  걷기는 **내가 시킨 것이 되나**만 본다(내가 짠 것이라 내가 생각한 것만 누른다). 이것은 눌러 보고 **읽어 본다** — 「되긴 되는데 불편한 것」을 찾는다.
 *  **PC 부터** 본다(원장님 2026-09-11 「아니 pc에서 더 자주써 pc부터 봐」 — 내가 폰이라고 짐작했다). 둘째 인자로 pc·phone.
 *  남긴 쿠키(.tmp/state-*.json)로 바로 들어간다. */
import { launch } from "../_browser.mjs";
const APP = process.env.E2E_APP ?? "http://127.0.0.1:3300";
const who = process.argv[2] ?? "principal";
const 크기 = process.argv[3] === "phone" ? { width: 390, height: 844, phone: true } : { width: 1280, height: 900, phone: false };
const 길 = process.argv.slice(4);
const b = await launch();
const ctx = await b.newContext({ storageState: `.tmp/state-${who}.json`, viewport: { width: 크기.width, height: 크기.height }, hasTouch: 크기.phone, isMobile: 크기.phone, deviceScaleFactor: 크기.phone ? 2 : 1 });
const p = await ctx.newPage();
const 오류 = []; p.on("pageerror", (e) => 오류.push(String(e.message).slice(0, 120)));
for (const url of 길) {
  const t0 = Date.now();
  await p.goto(APP + url, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle").catch(() => {});
  const ms = Date.now() - t0;
  const name = (url.replace(/[/?=&]/g, "_") || "_") + "";
  await p.screenshot({ path: `.tmp/use/${who}-${크기.width}${name}.png`, fullPage: true });
  const main = (await p.locator("main").textContent().catch(() => "")).replace(/\s+/g, " ").trim();
  const h = await p.evaluate(() => document.body.scrollHeight);
  const 넘침 = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(`\n── ${url}  (${ms}ms · 길이 ${h}px${넘침 ? " · ⚠️ 옆으로 넘침" : ""})`);
  console.log("   " + main.slice(0, 700));
}
console.log("\nJS 오류:", 오류.length ? 오류 : "없음");
await b.close();
