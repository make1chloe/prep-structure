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
const API = process.env.E2E_API || "http://127.0.0.1:55442";
const EXE = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const STRICT = process.env.OVERFLOW_STRICT === "1";
// 폭 3종 — 아이폰 프로(390) · 미니/SE(375) · 좁은 안드로이드(360).
// 390 에서 안 넘치는 것이 375 에선 넘칠 수 있다 (실물 재현 실패의 남은 변수)
const WIDTHS = [390, 375, 360];
const D = addDays(kstToday(), 10);   // golden-dayboard 와 같은 기준일

const { chromium } = await import("playwright-core");

/**
 * **무거운 판** — 원장 실물(2026-08-27 스크린샷, 이승우 판)의 모양을
 * 재현한다: 오늘 학원에서 할 것 6개 · 긴 교재·단원명 · 단원평가 출제.
 * 골든 씨앗(항목 1~2개)으로는 넘침이 재현되지 않았다 — 데이터 의존이다.
 * 골든과 안 섞이게 반·학생·교재 전부 제 uuid (eeeeeeee-…).
 */
const V = (t) => `eeeeeeee-0000-0000-0000-00000000${t}`;
const OC = V("0c01"), OS = V("0e01"), OT1 = V("0b01"), OT2 = V("0b02");
const OU1 = V("0a01"), OU2 = V("0a02");
const OH = (n) => V(`0d0${n}`);
const ORT = V("0f01");
const LONG = "Unit 26 전치사+명사 – 형용사 역할";
const HEAVY = [
  ["classes", "id", [{ id: OC, name: "넘침반", days: ["월", "화", "수", "목", "금", "토", "일"], start_time: "11:00", end_time: "12:30" }]],
  ["students", "id", [{ id: OS, name: "넘침학생", school: "연송초등학교", grade: "초5", status: "enrolled" }]],
  ["class_students", "class_id,student_id", [{ class_id: OC, student_id: OS }]],
  ["textbooks", "id", [
    { id: OT1, name: "그래머인사이드1", area: "문법" },
    { id: OT2, name: "일관성 있는 기준 영문법", area: "문법" },
  ]],
  ["textbook_units", "id", [
    { id: OU1, textbook_id: OT1, name: "본책", sort: 1 },
    { id: OU2, textbook_id: OT2, name: LONG, sort: 1 },
  ]],
  // 항목 이름은 학원 전체 유니크(homework_items_name_key) — 실제 이름과 안 부딪게 접두어
  ["homework_items", "id", [
    { id: OH(1), name: "넘침 서술형 대비", category: "문법", sort: 111, active: true },
    { id: OH(2), name: "넘침 숙제 검사", category: "기타", sort: 112, active: true },
    { id: OH(3), name: "넘침 문제풀기", category: "문법", sort: 113, active: true },
    { id: OH(4), name: "넘침 단원평가 대비 복습", category: "문법", sort: 114, active: true, unit_test: true },
    { id: OH(5), name: "넘침 클카 문장훈련", category: "단어", sort: 115, active: true },
    { id: OH(6), name: "넘침 테스트북", category: "문법", sort: 116, active: true },
  ]],
  ["student_textbooks", "student_id,textbook_id", [
    { student_id: OS, textbook_id: OT1, status: "active" },
    { student_id: OS, textbook_id: OT2, status: "active" },
  ]],
  ["daily_reports", "id", [{ id: ORT, student_id: OS, date: D }]],
  ["daily_report_items", "id", [
    { id: V("0901"), daily_report_id: ORT, homework_item_id: OH(1), status: "inclass", inclass_sort: 1, textbook_unit_ids: [OU1] },
    { id: V("0902"), daily_report_id: ORT, homework_item_id: OH(2), status: "inclass", inclass_sort: 2, textbook_unit_ids: [OU1] },
    { id: V("0903"), daily_report_id: ORT, homework_item_id: OH(3), status: "inclass", inclass_sort: 3, textbook_unit_ids: [OU1] },
    { id: V("0904"), daily_report_id: ORT, homework_item_id: OH(4), status: "inclass", inclass_sort: 4, textbook_unit_ids: [OU1] },
    { id: V("0905"), daily_report_id: ORT, homework_item_id: OH(5), status: "inclass", inclass_sort: 5, textbook_unit_ids: [OU2] },
    { id: V("0906"), daily_report_id: ORT, homework_item_id: OH(6), status: "inclass", inclass_sort: 6, textbook_unit_ids: [OU2] },
  ]],
];

async function plant() {
  const { sign } = await import("./token.mjs");
  const jwt = sign({ sub: "11111111-1111-1111-1111-111111111111", role: "authenticated" });
  for (const [table, conflict, rows] of HEAVY) {
    // PostgREST 벌크 insert 는 행마다 키가 같아야 한다 — 키 집합별로 나눈다
    const groups = new Map();
    for (const row of rows) {
      const k = Object.keys(row).sort().join(",");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(row);
    }
    for (const batch of groups.values()) {
      const r = await fetch(`${API}/rest/v1/${table}?on_conflict=${conflict}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(batch),
      });
      if (!r.ok) {
        console.log(`✗ 넘침 씨앗 실패: ${table} — ${r.status} ${await r.text()}`);
        process.exit(1);
      }
    }
  }
}

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

async function measure(page, group, student) {
  // 판마다 새로 연다 — 앞 학생의 열린 판(고정 푸터)이 다음 카드 클릭을
  // 가로챈 실사고가 있다 (임시저장 버튼이 pointer events 를 먹음)
  await page.goto(`${APP}/today?d=${D}`, { waitUntil: "networkidle", timeout: 90000 });
  const card = page.locator(`.card:has(.grouphead:has-text("${group}"))`).first();
  if (!(await card.count())) {
    console.log(`✗ 「${group}」 카드가 없습니다 — 씨앗이 판에 안 섰습니다`);
    process.exit(1);
  }
  const row = card.locator(`.stuRow:has-text("${student}")`).first();
  if (!(await row.isVisible().catch(() => false))) {
    await card.locator(".grouphead").click();
    await page.waitForTimeout(400);
  }
  await row.getByRole("button", { name: "▸ 열기" }).click();
  const panel = row.locator(".stuPanel");
  await panel.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  for (const tab of ["검사", "수업", "다음"]) {
    await panel.getByRole("button", { name: tab, exact: true }).first().click()
      .catch(() => {});
    await page.waitForTimeout(600);
    const { W, doc, list } = await offenders(page);
    if (list.length === 0) {
      console.log(`  ${student} · ${tab} 탭 — 넘침 없음 (문서 ${doc} / 화면 ${W})`);
      continue;
    }
    bad++;
    console.log(`  ✗ ${student} · ${tab} 탭 — 문서 ${doc}px > 화면 ${W}px. 넘은 요소:`);
    for (const o of list) {
      console.log(`      <${o.tag} class="${o.cls}"> 오른끝 ${o.right} 폭 ${o.width} — 「${o.text}」`);
    }
  }
  await row.getByRole("button", { name: "▾ 닫기" }).click().catch(() => {});
  await page.waitForTimeout(300);
}

await plant();
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    // C6 전환 완료 — sheets 배치만 남아 panel3 쿠키는 걷어냈다 (심어도 무해).
    const page = await ctx.newPage();
    await login(page);
    console.log(`== 폰 폭 가로 넘침 (${width}px) ==`);
    await measure(page, "골든반", "골든하나");     // 가벼운 판 — 기준선
    await measure(page, "넘침반", "넘침학생");     // 원장 실물 모양 재현
    await ctx.close();
  }
} finally {
  await browser.close();
}

if (bad && STRICT) {
  console.log("✗ 가로 넘침 — OVERFLOW_STRICT 라 빨강");
  process.exit(1);
}
console.log(bad ? "⚠️  가로 넘침 있음 (위 목록이 범인 — 아직 진단 모드라 초록)" : "✅ 가로 넘침 없음");
