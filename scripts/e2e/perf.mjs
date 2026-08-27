/**
 * **페이지 로드 시간 재기** (2026-08-27 진단 — 원장 실물: 「학생 어플은
 * 빠릿빠릿한데 원장 어플이 너어어어무 느림」).
 *
 * ── 무엇을 재나 ──────────────────────────────────────────────
 *
 * 원장 주요 화면 + 학생·학부모 화면(빠른 대조군)을 각 3번 열어서
 *   · TTFB  — 요청 → 첫 바이트. **서버 파도(직렬 Supabase 조회 사슬)의
 *             비용이 여기 쌓인다.** 화면마다 조회 수십 개를 몇 단으로
 *             기다리는지가 이 숫자로 보인다.
 *   · idle  — 요청 → networkidle. 클라이언트 조각·후속 요청까지.
 * 를 찍는다. 3회 전부와 중앙값을 같이 적는다 — 1회차에는 그 경로의
 * 첫 렌더(모듈 로딩)와 메뉴 배지 셈(20초 기억이 식은 상태)이 끼므로,
 * 1회차와 2·3회차의 차이 자체가 정보다.
 *
 * ── 판정하지 않는다 ──────────────────────────────────────────
 *
 * 숫자만 찍고 늘 0으로 끝난다(진단용). 여기서 빨강을 만들면 CI 러너의
 * 그날 몸상태가 검사를 흔든다 — 속도 기준을 세우는 날이 오면 그때
 * 문턱을 따로 정한다.
 *
 * ── 이 판이 못 보는 것 ───────────────────────────────────────
 *
 * CI 는 **같은 기계의 Postgres/PostgREST** 를 상대로 돈다 — 왕복이
 * 밀리초 아래라, 배포판의 Vercel↔Supabase 왕복 지연(× 직렬 단 수)은
 * 여기 **안 담긴다**. 여기 보이는 것은 렌더·파도 구조 비용의 바닥값이고,
 * 배포판은 여기에 (왕복 지연 × 그 화면의 직렬 단 수)가 얹힌다.
 *
 * 쓰는 법:  E2E_APP=http://127.0.0.1:3300 node scripts/e2e/perf.mjs
 */
import { chromium } from "playwright-core";

const APP = process.env.E2E_APP || "http://127.0.0.1:3300";
const EXE = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// 계정은 click.mjs 와 같은 씨앗(seed.sql)의 것
const WHO = {
  principal: { id: "principal@e2e.test", pw: "e2e-pass" },
  student: { id: "chloe0001", pw: "e2e-pass" },
  parent: { id: "parent0001@e2e.test", pw: "e2e-pass" },
};

// 원장 주요 화면 (원장 실물 보고의 동선) + 대조군
const PLAN = [
  ["principal", ["/", "/today", "/check", "/students", "/schedule", "/report"]],
  ["student", ["/me"]],
  ["parent", ["/parent"]],
];
const RUNS = 3;

async function login(page, who) {
  const w = WHO[who];
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.locator("input").first().fill(w.id);
  await page.locator('input[type="password"]').first().fill(w.pw);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** 한 번 열어서 { ttfb, idle } (ms) */
async function measure(page, path) {
  const t0 = Date.now();
  await page.goto(`${APP}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  const idle = Date.now() - t0;
  const ttfb = await page
    .evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return n ? Math.round(n.responseStart) : null;
    })
    .catch(() => null);
  return { ttfb: ttfb ?? -1, idle };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pad = (s, n) => String(s).padEnd(n);
const num = (xs) => xs.map((x) => String(x).padStart(5)).join(" ");

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });

try {
  console.log("== 로드 시간 (ms · 각 3회 · 진단용 — 판정 없음) ==");
  console.log("   TTFB = 요청→첫 바이트 (서버 파도 비용) · idle = 요청→networkidle");
  console.log("   ※ CI 는 로컬 PG 라 Supabase 왕복 지연은 여기 안 담긴다 (perf.mjs 머리말)");
  console.log(`   ${pad("화면", 12)} ${pad("TTFB 3회", 18)} ${pad("중앙", 6)} ${pad("idle 3회", 18)} 중앙`);

  for (const [who, paths] of PLAN) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, who);
    } catch (e) {
      console.log(`   (${who} 로그인 실패 — ${e.message.split("\n")[0]})`);
      await ctx.close();
      continue;
    }
    for (const path of paths) {
      const ttfbs = [];
      const idles = [];
      for (let i = 0; i < RUNS; i++) {
        try {
          const m = await measure(page, path);
          ttfbs.push(m.ttfb);
          idles.push(m.idle);
        } catch (e) {
          console.log(`   ${pad(path, 12)} 실패 — ${e.message.split("\n")[0]}`);
          ttfbs.length = 0;
          break;
        }
      }
      if (!ttfbs.length) continue;
      console.log(
        `   ${pad(path, 12)} ${pad(num(ttfbs), 18)} ${pad(median(ttfbs), 6)} ${pad(num(idles), 18)} ${median(idles)}`
      );
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

// 진단용 — 숫자만 남기고 늘 초록 (문턱을 세우는 날이 오면 그때 따로)
process.exit(0);
