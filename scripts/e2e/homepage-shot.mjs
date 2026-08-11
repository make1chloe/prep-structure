/**
 * **학교 홈페이지에서 가져오기 화면을 찍어서 눈으로 본다**
 * (원장님, 2026-08-11 — 「이 방식은 오류가 많을 거 같음」).
 *
 * 이 파일이 아니었으면 못 잡았을 것 —
 *   · 나이스를 **못 물어봤는데도** 「나이스에 다 있습니다」 초록 딱지가 떴다.
 *     안 물어본 것이 「다 있다」 로 읽힌다 — 이 화면을 만든 뜻과 정반대다.
 *   · 나이스를 못 물어보면 아무것도 미리 안 골라줘서, 한 줄씩 켜야 했다.
 * `next build` 도 · 규칙 검사도 둘 다 통과했다. 화면을 찍어야 보였다.
 *
 * 쓰는 법:  bash scripts/e2e/up.sh 로 세우고 앱을 3300 에 띄운 뒤
 *           OUT=/어디로 node scripts/e2e/homepage-shot.mjs
 */
import { chromium } from "playwright-core";

const APP = "http://127.0.0.1:3300";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.OUT || "/var/tmp";

const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 1200 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("dialog", (d) => d.accept());

await p.goto(`${APP}/login`, { waitUntil: "networkidle" });
await p.locator("input").first().fill("principal@e2e.test");
await p.locator('input[type="password"]').first().fill("e2e-pass");
await p.locator('button[type="submit"]').first().click();
await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

await p.goto(`${APP}/schools`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);

const open = p.getByRole("button", { name: "학교 홈페이지에서 가져오기" });
await open.first().scrollIntoViewIfNeeded();
await open.first().click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/hp-1.png`, fullPage: true });

// 학교를 고르고, **표를 복사해 붙인 모양 그대로** 넣어본다 (칸이 탭으로 갈린다)
const sel = p.locator("select").filter({ hasText: "고르세요" }).last();
await sel.selectOption({ index: 1 });
await p.waitForTimeout(200);
await p.locator("textarea").last().fill([
  "번호\t날짜\t내용",
  "1\t2026-10-13\t2학기 중간고사",
  "2\t10.13(월)~10.16(목)\t2학기 중간고사",
  "3\t2026.12.08.~12.10.\t2학기 기말고사",
  "4\t2026년 9월 21일\t재량휴업일",
].join("\n"));
await p.getByRole("button", { name: "붙여넣은 글에서 읽기" }).click();
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/hp-2.png`, fullPage: true });

const box = await p
  .locator("text=학교 홈페이지에서 가져오기").last()
  .locator("xpath=ancestor::div[contains(@class,'card')][1]")
  .innerText();
console.log(box);
console.log("\n---- 자바스크립트 오류 ----\n" + (errs.join("\n") || "없음"));

// **읽은 것이 그대로 나왔나** — 번호 칸의 「1」 이 이름에 붙으면 안 된다
const must = ["2학기 중간고사", "2학기 기말고사", "재량휴업일"];
const bad = must.filter((t) => !box.includes(t)).concat(/\d 2학기/.test(box) ? ["번호가 이름에 붙었다"] : []);
// 나이스를 못 물어봤으면 「다 있습니다」 라고 하면 안 된다
if (box.includes("비교 안 함") && box.includes("다 있습니다")) bad.push("안 물어보고 「다 있다」 고 한다");
if (bad.length || errs.length) {
  console.log("\n❌ " + bad.concat(errs).join(" · "));
  await b.close();
  process.exit(1);
}
console.log("\n✅ 홈페이지 붙여넣기 화면 통과");
await b.close();
