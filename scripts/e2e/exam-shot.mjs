/**
 * **시험 목록을 찍어서 눈으로 본다** (원장님, 2026-08-09).
 *
 *   「앞으로 학교시험 페이지는 시험 기준으로 재정렬해줘.
 *    1학기 기말 - 학교별 날짜순 나열, 2학기 중간 - 학교별 날짜순 나열 이렇게」
 *   「9월 10월 둘 다 전국연합학력평가로 표시되어 있어. 그게 아니라
 *    고1~고3 모의고사로만 입력하기로 한 거야」
 *
 * 이 파일이 아니었으면 못 잡았을 것 —
 *   · ExamRow 를 떼어낼 때 **엉뚱한 함수 안에** 넣어서 화면이 통째로 터졌다.
 *     `next build` 는 통과했다 (안 쓰는 자리에 있는 것처럼 보여서).
 *   · 「합치기」 안내가 **학교마다 한 줄인 경우에만** 떴다. 원장님 화면의
 *     옛 줄은 이미 「전국」 이라 안내가 안 뜨고, 그래서 치울 단추가 없었다.
 *
 * 쓰는 법:  bash scripts/e2e/up.sh 로 세우고 앱을 3300 에 띄운 뒤
 *           OUT=/어디로 node scripts/e2e/exam-shot.mjs
 */
import { chromium } from "playwright-core";
const APP = "http://127.0.0.1:3300";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.OUT || ".";
const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 1400 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("dialog", (d) => d.accept());

await p.goto(`${APP}/login`, { waitUntil: "networkidle" });
await p.locator("input").first().fill("principal@e2e.test");
await p.locator('input[type="password"]').first().fill("e2e-pass");
await p.locator('button[type="submit"]').first().click();
await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

const lines = async () =>
  (await p.locator("body").innerText()).split("\n").map((s) => s.trim()).filter(Boolean);
const count = (t, re) => t.filter((l) => re.test(l)).length;

await p.goto(`${APP}/schools`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/exam-1.png`, fullPage: true });
if (errs.length) { console.log(`❌ 화면이 터졌습니다 — ${errs[0]}`); process.exit(1); }

const t1 = await lines();
console.log("-- 묶음 머리 --");
console.log(t1.filter((l) => /^\d\d년 \d학기 (중간|기말)$|^모의고사$/.test(l) && !/고사$/.test(l.slice(-4)))
  .filter((l, i, a) => a.indexOf(l) === i).join("\n"));
console.log(`전국연합학력평가 줄 ${count(t1, /^전국연합학력평가$/)}개 · ` +
            `고1~고3 회차 ${count(t1, /^\d{4}년 \d{1,2}월 고\d 모의고사$/)}개`);

console.log("\n-- 「치우기」 눌러보기 --");
const btn = p.getByRole("button", { name: /하나로 합치기|옛 줄 치우기/ });
if (!(await btn.count())) { console.log("❌ 치울 것이 있는데 단추가 없습니다"); process.exit(1); }
await btn.first().click();
await p.waitForTimeout(4000);
const t2 = await lines();
const old = count(t2, /^전국연합학력평가$/);
const rounds = count(t2, /^\d{4}년 \d{1,2}월 고\d 모의고사$/);
console.log(`전국연합학력평가 줄 ${old}개 · 고1~고3 회차 ${rounds}개`);
await p.screenshot({ path: `${OUT}/exam-2.png`, fullPage: true });
await b.close();

if (old !== 0) { console.log("❌ 학년 없는 옛 줄이 안 치워졌습니다"); process.exit(1); }
if (rounds !== 5) { console.log(`❌ 고1~고3 회차가 5개여야 하는데 ${rounds}개입니다`); process.exit(1); }
console.log("\n✅ 묶음도 서고, 옛 줄만 치워졌습니다");
