/** 목업을 검사할 수 있는 HTML 로 만든다 — 둘 다 같은 뼈대를 씌운다.
 *    원본:   목업 <style> 그대로                → .tmp/mockup-orig.html
 *    앱 CSS: <style> 을 빼고 app/globals.css + docs/목업/chrome.css → .tmp/mockup-app.html
 *  앱 CSS 로 그린 목업이 원본과 같으면, 앱은 목업과 같은 자로 그려진다(check-mockup). */
import fs from "node:fs";
import path from "node:path";
export const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
export const MOCKUP = path.join(ROOT, "docs/목업/클로이영어-화면-목업.html");
const WRAP = (body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
export function styleOf(html) { const a = html.indexOf("<style>"), b = html.indexOf("</style>"); return html.slice(a + 7, b); }
export function build() {
  const html = fs.readFileSync(MOCKUP, "utf8");
  const a = html.indexOf("<style>"), b = html.indexOf("</style>") + 8;
  fs.mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
  const orig = path.join(ROOT, ".tmp/mockup-orig.html");
  const app = path.join(ROOT, ".tmp/mockup-app.html");
  fs.writeFileSync(orig, WRAP(html));
  fs.writeFileSync(app, WRAP(html.slice(0, a) + `<link rel="stylesheet" href="../app/globals.css"><link rel="stylesheet" href="../docs/목업/chrome.css">` + html.slice(b)));
  return { orig: "file://" + orig, app: "file://" + app };
}
if (process.argv[1] && process.argv[1].endsWith("_mockup-page.mjs")) console.log(build());
