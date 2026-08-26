/**
 * **오늘 수업 판 골든 검사** (개편 대전제 v22 잔여 ⓑ — C6 전환 대비).
 *
 * 학생 판(StudentPanel, sheets 배치)이 곧 세분화 C6(구판 classic 제거·검사
 * 재표적)으로 배치를 갈아엎는다. 배치 공사에서 제일 무서운 것은 화면이
 * 깨지는 것이 아니라 **판정이 실린 내용이 조용히 빠지는 것**이다 — 검사
 * 대상 항목 하나, 미리 채운 단어 개수 하나가 사라져도 오류는 안 난다.
 *
 * 그래서 지금의 판을 **글자로 박제**한다: 고정 씨앗을 심고, 학생 판의
 * 구역별 텍스트(검사 대상·자동 판정·오늘 학원에서 할 것·다음 숙제·배지·칩·
 * 입력칸의 미리 채운 값)를 뽑아 정규화한 JSON 을 커밋해 두고, 전환 뒤 같은
 * 씨앗에서 같은 JSON 이 나오는지 견준다.
 *
 * **픽셀·스타일·마크업 구조는 안 박는다** — C6 는 배치를 바꾸는 공사라
 * 마크업 골든은 그날로 깨진다. 판정이 실린 글자만 박는다. (C6 가 클래스
 * 이름을 바꾸면 이 파일의 추출 선택자는 재표적하되, **골든 JSON 은 그대로**
 * 맞아야 한다 — 그것이 이 검사의 존재 이유다.)
 *
 * ── 날짜 함정 (이 검사의 최대 함정) ───────────────────────
 *
 * seed.sql 은 전부 오늘(current_date) 기준 상대 날짜다. 그대로 찍으면
 * 요일 따라 로스터가 통째로 달라진다 (고1 A 는 월수금에만 선다).
 * 그래서 골든은 **자기 씨앗을 따로 심는다**: 매일 도는 반(골든반)과
 * 매일 도는 특강(골든특강) — 이 로스터는 무슨 요일에 떠도 같다. 찍는
 * 날짜는 오늘+10일(고정 오프셋) — seed.sql 의 결석 예정(+5)·보강(+7)·
 * 전체 휴강(+1~+7)과 절대 안 겹친다. 화면에 남는 날짜·요일 표기는
 * golden-lib 이 ⟨D+n⟩·(요일) 토큰으로 눕힌다.
 *
 * ── 골든 갱신 (상시 경로가 되면 검사가 죽는다) ─────────────
 *
 *   · 골든 파일이 커밋에 없으면 → **빨강** (자동 생성으로 초록이 되면
 *     검사가 무력화된다)
 *   · 갱신은 GOLDEN_UPDATE=1 로만 — CI 에서는 workflow_dispatch 의
 *     golden_update 입력으로만 켜지고, 뜬 파일은 아티팩트로 내려받아
 *     사람이 커밋한다
 *
 * 쓰는 법:
 *   node scripts/e2e/golden-dayboard.mjs              (비교 — run.sh 가 부른다)
 *   GOLDEN_UPDATE=1 node scripts/e2e/golden-dayboard.mjs   (박제)
 *   node scripts/e2e/golden-dayboard.mjs --selftest   (순수 부품만 — 맥에서도 돈다)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { kstToday, addDays, normalizeText, diffGolden, selftest } from "./golden-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(here, "golden", "dayboard.json");
const UPDATE = process.env.GOLDEN_UPDATE === "1";

// ── 0) 부품 자체검사 — 여기가 어긋나면 비교 전체를 못 믿는다 ──
{
  const bad = selftest();
  if (bad.length) {
    console.log("✗ golden-lib 자체검사 실패:\n" + bad.join("\n\n"));
    process.exit(1);
  }
}
if (process.argv.includes("--selftest")) {
  console.log("✅ golden-lib 자체검사 통과 (정규화·diff 고정 입력→고정 출력)");
  process.exit(0);
}

const APP = process.env.E2E_APP || "http://127.0.0.1:3300";
const API = process.env.E2E_API || "http://127.0.0.1:55442";
const EXE = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const BASE = kstToday();          // seed.sql 의 current_date 와 같은 눈높이
const D = addDays(BASE, 10);      // 찍는 날 — 고정 오프셋 (머리말 참조)
const DP = addDays(BASE, 9);      // 지난 수업 (골든반은 매일 도니 어제 = D-1)

// ── 1) 골든 씨앗 — 요일과 무관한 자기 씨앗 (고정 UUID·멱등) ──
//
// seed.sql 을 안 건드린다: 다른 검사가 그 씨앗의 개수·이름에 기대고 있다.
// 이 씨앗은 run.sh 맨 끝(이 검사)에서야 심기므로 앞 검사들은 못 본다.
const U = (tail) => `dddddddd-0000-4000-8000-${tail.padStart(12, "0")}`;
const GC = U("c001");                                    // 골든반 (매일)
const [S1, S2, S3] = [U("a001"), U("a002"), U("a003")];  // 하나·둘·셋
const [TB_R, TB_W] = [U("b001"), U("b002")];             // 독해책·단어책
const [W1, W2, W3, R1] = [U("e101"), U("e102"), U("e103"), U("e201")];
const [H_W, H_R, H_P, H_C] = [U("f001"), U("f002"), U("f003"), U("f004")];
const [RP1, RP3, RT1] = [U("d001"), U("d003"), U("d011")];

const SEED = [
  ["classes", "id", [{ id: GC, name: "골든반", days: ["월", "화", "수", "목", "금", "토", "일"], start_time: "09:00", end_time: "10:30" }]],
  ["students", "id", [
    // 판정이 실릴 학생 (숙제·제출물·공지·계획 전부)
    { id: S1, name: "골든하나", school: "골든고등학교", grade: "고2", status: "enrolled" },
    // 아무 기록 없는 학생 — 빈 판의 문구도 판정이다
    { id: S2, name: "골든둘", school: "골든고등학교", grade: "고2", status: "enrolled" },
    // 특강 전용 학생 (반 배정 0) — 특강 줄의 판
    { id: S3, name: "골든셋", school: "골든고등학교", grade: "고2", status: "enrolled" },
  ]],
  ["class_students", "class_id,student_id", [
    { class_id: GC, student_id: S1 },
    { class_id: GC, student_id: S2 },
  ]],
  // 매일 도는 특강 — 요일과 무관하게 D 에 선다
  ["student_extra_schedules", "id", [{
    id: U("e001"), student_id: S3, label: "골든특강",
    days: ["월", "화", "수", "목", "금", "토", "일"], start_time: "16:00",
    from_date: addDays(BASE, -1), to_date: addDays(BASE, 30),
  }]],
  ["textbooks", "id", [
    { id: TB_R, name: "골든독해책", area: "독해" },
    { id: TB_W, name: "골든단어책", area: "단어" },
  ]],
  ["textbook_units", "id", [
    // 단어 개수 → 「범위 2단원 합계」 미리 채움(0070)이 골든에 실린다
    { id: W1, textbook_id: TB_W, name: "Day 1", word_count: 20, sort: 1 },
    { id: W2, textbook_id: TB_W, name: "Day 2", word_count: 30, sort: 2 },
    { id: W3, textbook_id: TB_W, name: "Day 3", word_count: 25, sort: 3 },
    { id: R1, textbook_id: TB_R, name: "1강 골든지문", label: "문제풀이", page_start: 10, page_end: 15, sort: 1 },
  ]],
  ["homework_items", "id", [
    { id: H_W, name: "골든단어", category: "단어", sort: 101, active: true },
    { id: H_R, name: "골든독해", category: "독해", sort: 102, active: true },
    // 직접검사 — 자동 판정이 건너뛰는지가 골든에 실린다
    { id: H_P, name: "골든암송", category: "영작", sort: 103, active: true, in_person: true },
    { id: H_C, name: "골든오답", category: "기타", sort: 104, active: true },
  ]],
  ["student_textbooks", "student_id,textbook_id", [
    { student_id: S1, textbook_id: TB_R, status: "active" },
    { student_id: S1, textbook_id: TB_W, status: "active" },
  ]],
  ["daily_reports", "id", [
    { id: RP1, student_id: S1, date: DP },   // 지난 수업 — 배정이 실린 판
    { id: RP3, student_id: S3, date: DP },
    { id: RT1, student_id: S1, date: D },    // 오늘 — 미리 넣어둔 판
  ]],
  ["daily_report_items", "id", [
    // 지난 수업 배정 → 오늘 검사 대상 (buildCheckSource)
    { id: U("0901"), daily_report_id: RP1, homework_item_id: H_W, status: "assigned", textbook_unit_ids: [W1, W2], range_note: "골든 시험범위" },
    { id: U("0902"), daily_report_id: RP1, homework_item_id: H_R, status: "assigned", textbook_unit_ids: [R1] },
    { id: U("0903"), daily_report_id: RP1, homework_item_id: H_P, status: "assigned" },
    // 지난 수업에서 못 끝내 이월(carry) → 오늘 등원 학습 맨 위
    { id: U("0904"), daily_report_id: RP1, homework_item_id: H_C, status: "inclass", inclass_sort: 1, carry_next: true },
    // 단원 지정 없는 배정 — 「단원 지정 없음」 문구도 판정이다
    { id: U("0905"), daily_report_id: RP3, homework_item_id: H_R, status: "assigned" },
    // 오늘 판에 미리 넣어둔 것 — 등원 학습·다음 숙제·다음 수업 계획
    { id: U("0906"), daily_report_id: RT1, homework_item_id: H_R, status: "inclass", inclass_sort: 2 },
    { id: U("0907"), daily_report_id: RT1, homework_item_id: H_W, status: "assigned", textbook_unit_ids: [W3], range_note: "다음 골든 범위" },
    { id: U("0908"), daily_report_id: RT1, homework_item_id: H_R, status: "plan_next", inclass_sort: 1 },
  ]],
  ["notices", "id", [
    { id: U("9101"), date: D, kind: "memo", scope: "student", body: "골든 준비물 — 프린트 챙기기" },
    { id: U("9102"), date: D, kind: "homework", scope: "student", body: "골든 숙제 공지 한 줄" },
  ]],
  ["notice_receipts", "notice_id,student_id", [
    { notice_id: U("9101"), student_id: S1 },
    { notice_id: U("9102"), student_id: S1 },
  ]],
  // 학생 체크리스트 신고 → 검사 1차 판단(자동 △)이 골든에 실린다
  ["homework_submissions", "id", [{
    id: U("8101"), student_id: S1, date: D, kind: "checklist", homework_item_id: H_R,
    body: JSON.stringify([
      { text: "본문 읽기", done: true },
      { text: "문제 풀기", done: false, state: "doing" },
      { text: "오답 정리", done: false },
    ]),
    created_at: `${D}T03:00:00Z`,   // 한국 정오 고정 — 표시 시각이 흔들리지 않게
  }]],
  ["stay_tasks", "id", [{
    id: U("7101"), student_id: S1, date: D, body: "골든 마무리 — 남아서 오답", status: "todo", auto: false,
  }]],
];

async function plant() {
  const { sign } = await import("./token.mjs");   // jwt-secret 은 up.sh 가 만든다
  const jwt = sign({ sub: "11111111-1111-1111-1111-111111111111", role: "authenticated" });
  for (const [table, conflict, rows] of SEED) {
    const r = await fetch(`${API}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!r.ok) {
      console.log(`✗ 골든 씨앗 실패: ${table} — ${r.status} ${await r.text()}`);
      process.exit(1);
    }
  }
}

// ── 2) 진짜 화면에서 뽑는다 (click.mjs 의 판 그대로) ──────────
const { chromium } = await import("playwright-core");

async function login(page) {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await page.locator("input").first().fill("principal@e2e.test");
  await page.locator('input[type="password"]').first().fill("e2e-pass");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * 브라우저 안에서 도는 추출기 — 판정이 실린 **글자만** 걷는다.
 * 입력칸은 미리 채운 값(⟦값⟧)이 곧 판정이라 값째로 걷는다.
 * C6 가 클래스 이름을 바꾸면 여기(선택자)만 재표적한다 — 골든은 그대로.
 * (Playwright 가 이 함수를 글자로 옮겨 브라우저에서 돌린다 — Node 의
 * 변수는 못 쓴다. 그래서 안에서만 논다.)
 */
function extractPanel(root) {
  const vis = (el) => {
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  };
  const lineText = (el) => {
    let out = "";
    const walk = (n) => {
      if (n.nodeType === 3) { out += n.textContent; return; }
      if (n.nodeType !== 1) return;
      if (!vis(n)) return;
      const tag = n.tagName;
      if (tag === "INPUT") {
        if (n.type === "hidden" || n.type === "file") return;
        out += "⟦" + (n.value || "") + "⟧";
        return;
      }
      if (tag === "TEXTAREA") { out += "⟦" + (n.value || "") + "⟧"; return; }
      if (tag === "SELECT") {
        out += "⟦" + ((n.selectedOptions[0] && n.selectedOptions[0].textContent) || "").trim() + "⟧";
        return;
      }
      const cs = getComputedStyle(n);
      const block = ["block", "flex", "grid", "table", "list-item"].includes(cs.display);
      if (block) out += "\n";
      n.childNodes.forEach(walk);
      if (block) out += "\n";
    };
    walk(el);
    return out;
  };
  const head = root.querySelector(".stusheet-head");
  const body = root.querySelector(".stusheet-body");
  const foot = root.querySelector(".stusheet-foot");
  const panes = body
    ? [...body.querySelectorAll(":scope > div")].filter(
        (d) => !d.classList.contains("row") && !d.classList.contains("sheetpop"))
    : [];
  const pane = panes.find(vis);
  const regions = pane
    ? [...pane.children].filter(vis).map((el) => ({
        구역: (el.querySelector(".plabel") && el.querySelector(".plabel").innerText.trim())
          || (el.classList.contains("sayblock") ? "학생에게 말할 것"
            : el.classList.contains("notice") ? "알림"
            : ((el.querySelector("b") && el.querySelector("b").innerText) || "구역").trim().slice(0, 24)),
        글: lineText(el),
      }))
    : [];
  return {
    머리: head ? lineText(head) : "",
    구역들: regions,
    발: foot ? lineText(foot) : "",
  };
}

/** 잡은 판을 정규화한다 — 날짜·요일·경과·공백 (golden-lib) */
const norm = (s) => normalizeText(s, BASE);

async function capture() {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext();
    // sheets 배치로 본다 (C1 스위치 — panel3 쿠키). C6 뒤에는 이 쿠키가
    // 없어도 sheets 만 남을 것이므로, 쿠키는 그때 걷어내면 된다.
    await ctx.addCookies([{ name: "panel3", value: "on", url: APP }]);
    const page = await ctx.newPage();
    await login(page);
    await page.goto(`${APP}/today?d=${D}`, { waitUntil: "networkidle", timeout: 90000 });

    const out = { 판: {}, 학생: {} };
    const TARGETS = [
      { group: "골든반", student: "골든하나" },
      { group: "골든반", student: "골든둘" },
      { group: "특강 · 골든특강", student: "골든셋" },
    ];
    for (const t of TARGETS) {
      const card = page.locator(`.card:has(.grouphead:has-text("${t.group}"))`).first();
      if (!(await card.count())) throw new Error(`「${t.group}」 카드가 안 보입니다 — 골든 씨앗이 판에 안 섰습니다`);
      const row = card.locator(`.stuRow:has-text("${t.student}")`).first();
      if (!(await row.isVisible().catch(() => false))) {
        await card.locator(".grouphead").click();       // 접힌 반을 편다 (아코디언)
        await page.waitForTimeout(400);
      }
      if (!(await row.isVisible().catch(() => false)))
        throw new Error(`「${t.group}」 에 ${t.student} 줄이 없습니다`);

      out.판[t.group] = norm(await card.locator(".grouphead").innerText());
      const key = `${t.group} | ${t.student}`;
      const rec = { 줄: norm(await row.locator(".stuLine").first().innerText()), 때: {} };

      await row.getByRole("button", { name: "▸ 열기" }).click();
      const panel = row.locator(".stuPanel");
      await panel.waitFor({ state: "visible", timeout: 15000 });
      // 판이 열리며 단원 이름·교재 목록을 뒤에서 불러온다 — 다 오기를 기다린다
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1500);

      for (const tab of ["검사", "수업", "다음"]) {
        await panel.getByRole("button", { name: tab, exact: true }).first().click();
        await page.waitForTimeout(400);
        const got = await panel.evaluate(extractPanel).catch(() => null);
        if (!got) throw new Error(`${key} ${tab} 때를 못 읽었습니다`);
        if (!("머리" in rec)) rec.머리 = norm(got.머리);
        /**
         * 구역은 **이름으로** 담는다 (순서 아님) — C6 는 배치를 바꾸는
         * 공사라 구역 순서는 바뀌라고 있는 것이고, 흘리면 안 되는 것은
         * 구역의 **내용**이다. 같은 이름이 둘이면 #2 를 붙인다.
         */
        const regions = {};
        for (const r of got.구역들) {
          const base = norm(r.구역) || "구역";
          let k = base;
          for (let i = 2; k in regions; i += 1) k = `${base} #${i}`;
          regions[k] = norm(r.글);
        }
        rec.때[tab] = regions;
        rec.발 = norm(got.발);
      }
      out.학생[key] = rec;

      await row.getByRole("button", { name: "▾ 닫기" }).click().catch(() => {});
      await page.waitForTimeout(300);
    }
    return out;
  } finally {
    await browser.close();
  }
}

// ── 3) 심고 → 찍고 → 견주거나 박제한다 ───────────────────────
console.log("== 오늘 수업 판 골든 ==");
await plant();
console.log(`  씨앗 심음 (찍는 날: 오늘+10 = ${D})`);
const current = await capture();

if (UPDATE) {
  mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
  if (existsSync(GOLDEN_PATH)) {
    const old = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
    const diffs = diffGolden(old, current);
    if (diffs.length) console.log(`  (참고) 이전 골든과 ${diffs.length}곳이 다릅니다:\n${diffs.slice(0, 20).join("\n")}`);
    else console.log("  이전 골든과 같습니다 — 파일만 다시 씁니다");
  }
  writeFileSync(GOLDEN_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`✅ 골든 박제: ${GOLDEN_PATH}\n   이 파일을 커밋해야 다음 판부터 비교가 돕니다`);
  process.exit(0);
}

if (!existsSync(GOLDEN_PATH)) {
  console.log(
    "✗ 골든 파일이 없습니다: scripts/e2e/golden/dayboard.json\n" +
    "  자동 생성으로 초록을 주면 이 검사는 없는 것과 같아서, 여기서는 빨강입니다.\n" +
    "  박제하려면: Actions → e2e → Run workflow 에서 golden_update 를 켜고,\n" +
    "  아티팩트(dayboard-golden)를 내려받아 커밋해 주세요."
  );
  process.exit(1);
}

const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
const diffs = diffGolden(golden, current);
if (diffs.length) {
  console.log(`✗ 골든과 ${diffs.length}곳이 다릅니다 — 어느 학생·어느 구역인지:\n`);
  console.log(diffs.join("\n\n"));
  console.log(
    "\n  판정·내용을 일부러 바꾼 것이면 golden_update 로 다시 박제해 커밋하세요.\n" +
    "  아니라면 C6/개편이 내용을 흘린 것입니다 — 위 구역부터 보세요."
  );
  process.exit(1);
}
console.log("✅ 골든 일치 — 같은 씨앗, 같은 판");
