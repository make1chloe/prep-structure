/** 검사가 쓰는 브라우저 하나 — Playwright 를 로컬 → 전역 순으로 찾고, 깔려 있는 크로미움을 쓴다.
 *  ⚠️ ESM 에는 NODE_PATH 가 안 먹는다. 그래서 createRequire 로 전역 꾸러미 경로를 직접 찾는다. */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
const require = createRequire(import.meta.url);
function playwright() {
  for (const n of ["playwright", "playwright-core"]) { try { return require(n); } catch {} }
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  for (const n of ["playwright", "playwright-core"]) { try { return require(`${root}/${n}`); } catch {} }
  throw new Error("Playwright 가 없습니다 — npm i -g playwright (브라우저는 /opt/pw-browsers 에 이미 있다)");
}
export async function launch() {
  const { chromium } = playwright();
  const exe = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.CHROME_PATH].filter(p => p && fs.existsSync(p))[0];
  return chromium.launch(exe ? { executablePath: exe } : {});
}
/** PC(손가락 아님) · 폰(손가락) 두 자리 — 검사는 늘 둘 다 본다 */
export const VIEWS = [
  { name: "PC 1280", viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false },
  { name: "폰 390", viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true },
];

/** 바깥망을 막는다 — 글꼴 서버(fonts.googleapis) 는 검사 환경에서 안 닿고, 닿아도 검사가 볼 것이 아니다. 기다림만 는다 */
export const offline = (ctx) => ctx.route(/fonts\.g(oogleapis|static)\.com|google\.com/, r => r.abort());

/** 로그인한 채로 열기 — scripts/e2e/screens.mjs 가 남긴 쿠키 상태(CHECK_STATE=.tmp/state-*.json). 없으면 손님으로 */
export const stateOpts = () => (process.env.CHECK_STATE && fs.existsSync(process.env.CHECK_STATE) ? { storageState: process.env.CHECK_STATE } : {});
