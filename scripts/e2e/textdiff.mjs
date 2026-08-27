/**
 * **수리 전/후 화면 텍스트 대조** (성능 수리 계획서 v3 §3-3 보강).
 *
 * ── 왜 있나 ──────────────────────────────────────────────────
 *
 * 성능 수리(파도화)의 불변 조건은 「판정·셈이 1도 변하면 안 된다」인데,
 * 기존 검사가 못 지키는 구멍이 셋 있다 — ① 대시보드 카드 숫자 값
 * ② /schedule 회차·경고 셈 값 ③ 배지 숫자 (§3-3 표). 그래서 각 수리
 * 커밋에서 **같은 씨앗**으로 수리 전/후 화면의 보이는 텍스트 전체를
 * 떠서 줄 단위로 견준다. 다르면 판정이 변한 것이다.
 *
 * ── 쓰는 법 (1회성 대조 — run.sh 에 안 묶는다, 상설화는 별도 판단) ──
 *
 *   1) 수리 전 판을 e2e 로 띄운 상태에서:
 *        E2E_APP=http://127.0.0.1:3300 OUT=/var/tmp/text-before \
 *          node scripts/e2e/textdiff.mjs dump
 *   2) 수리 후 판을 같은 씨앗으로 다시 띄우고:
 *        E2E_APP=http://127.0.0.1:3300 OUT=/var/tmp/text-after \
 *          node scripts/e2e/textdiff.mjs dump
 *   3) 견주기 (다르면 exit 1 + 다른 줄 출력):
 *        node scripts/e2e/textdiff.mjs diff /var/tmp/text-before /var/tmp/text-after
 *
 * 전/후는 **같은 날** 떠야 한다 — 화면 곳곳이 오늘 날짜 기준으로 센다.
 *
 * ── 무엇을 뜨나 ──────────────────────────────────────────────
 *
 * 원장 주요 화면 6개(TopBar 배지 포함 — ③이 여기 같이 잡힌다) +
 * /report 의 리포트·재발송 탭(loadReportRows 산출물이 실제로 그려지는 탭).
 * 필요하면 E2E_PATHS="/a,/b" 로 바꿔 뜰 수 있다.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const EXE = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const APP = process.env.E2E_APP || "http://127.0.0.1:3300";

// 계정·씨앗은 perf.mjs / click.mjs 와 같은 seed.sql 의 것
const WHO = { id: "principal@e2e.test", pw: "e2e-pass" };

const PATHS = (process.env.E2E_PATHS || "").split(",").filter(Boolean).length
  ? process.env.E2E_PATHS.split(",").filter(Boolean)
  : ["/", "/today", "/check", "/students", "/schedule", "/report", "/report?t=report", "/report?t=resend"];

const fileOf = (path) => path.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "root";

async function dump(outDir) {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
    await page.locator("input").first().fill(WHO.id);
    await page.locator('input[type="password"]').first().fill(WHO.pw);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    for (const path of PATHS) {
      await page.goto(`${APP}${path}`, { waitUntil: "networkidle", timeout: 60000 });
      // 보이는 텍스트만 — 마크업·순서 바뀜이 아니라 **값**의 변화를 잡는 것이다.
      // 줄 안 공백만 접는다 (줄 순서·줄 수는 그대로 두어야 빠진 줄이 보인다)
      const text = await page.evaluate(() => document.body.innerText);
      const lines = text
        .split("\n")
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      writeFileSync(join(outDir, `${fileOf(path)}.txt`), lines.join("\n") + "\n");
      console.log(`  떴다  ${path}  →  ${fileOf(path)}.txt  (${lines.length}줄)`);
    }
  } finally {
    await browser.close();
  }
}

function diff(beforeDir, afterDir) {
  const names = [...new Set([...readdirSync(beforeDir), ...readdirSync(afterDir)])]
    .filter((n) => n.endsWith(".txt"))
    .sort();
  let bad = 0;
  for (const name of names) {
    let b = null;
    let a = null;
    try { b = readFileSync(join(beforeDir, name), "utf8"); } catch {}
    try { a = readFileSync(join(afterDir, name), "utf8"); } catch {}
    if (b === null || a === null) {
      console.log(`✗ ${name} — ${b === null ? "전" : "후"} 판에 파일이 없다`);
      bad += 1;
      continue;
    }
    if (b === a) {
      console.log(`○ ${name} — 같다`);
      continue;
    }
    bad += 1;
    console.log(`✗ ${name} — 다르다`);
    // 줄 단위 대조 — 무엇이 달라졌는지 그 자리에서 보이게
    const bl = b.split("\n");
    const al = a.split("\n");
    const max = Math.max(bl.length, al.length);
    let shown = 0;
    for (let i = 0; i < max && shown < 40; i++) {
      if ((bl[i] ?? "") === (al[i] ?? "")) continue;
      console.log(`   ${i + 1}줄  전: ${bl[i] ?? "(없음)"}`);
      console.log(`        후: ${al[i] ?? "(없음)"}`);
      shown += 1;
    }
    if (shown >= 40) console.log("   … (40군데까지만)");
  }
  console.log(bad ? `\n다른 화면 ${bad}개 — 판정·셈이 변했는지 확인할 것` : "\n전부 같다 — 판정·셈 무변경");
  process.exit(bad ? 1 : 0);
}

const [mode, d1, d2] = process.argv.slice(2);
if (mode === "dump") {
  const out = process.env.OUT || d1;
  if (!out) { console.log("쓰는 법: OUT=<폴더> node scripts/e2e/textdiff.mjs dump"); process.exit(2); }
  await dump(out);
} else if (mode === "diff") {
  if (!d1 || !d2) { console.log("쓰는 법: node scripts/e2e/textdiff.mjs diff <전폴더> <후폴더>"); process.exit(2); }
  diff(d1, d2);
} else {
  console.log("쓰는 법: dump | diff — 파일 머리말 참고");
  process.exit(2);
}
