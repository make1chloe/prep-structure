/**
 * **설문지에서 「기타」 를 고르고 적은 글이 상담 화면까지 닿는가**
 * (원장님, 2026-08-09 — 「설문지에서 기타를 선택한 경우 추가로 작성한
 * 내용이 안 들어오는 거 같아」).
 *
 * 저장은 잘 되고 있었다 — **보여주는 쪽**이 잃고 있었다. 상담 화면의
 * 유입경로 목록에 「기타 (…)」 가 없어서 수정창이 빈 칸으로 보였고,
 * 그대로 저장하면 원래 글이 지워졌다. 그래서 이 검사는 **넣고 → 보고 →
 * 수정창을 열어보는 것**까지 한 번에 한다.
 */
import { chromium } from "playwright-core";
const APP = process.env.E2E_APP || "http://127.0.0.1:3300";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const WHY = "친구 어머니가 알려주심";
let bad = 0;
const ok = (m) => console.log(`  ${m}`);
const no = (m) => { console.log(`  ✗ ${m}`); bad = 1; };

const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });

// ── 1) 학부모가 설문지를 낸다 (로그인 없음) ────────────────
const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
p.on("pageerror", (e) => no(`설문지가 터졌습니다: ${e.message.split("\n")[0]}`));
await p.goto(`${APP}/apply`, { waitUntil: "networkidle" });

// 학교가 **골라 넣는 칸**인가 — 로그인 없이도 목록이 와야 한다 (0114).
// 1판은 datalist 였는데 아이폰에서 목록이 안 내려와 select + 「직접
// 적기」 로 개편됐다 (PickField 주석) — 검사도 그 개편을 따른다.
// 골라주세요·직접 적기 두 줄은 늘 있으니, 학교는 그 밖의 option 수다.
const schoolSel = p.locator("select").filter({ hasText: "직접 적기" }).first();
const opts = (await schoolSel.count()) ? await schoolSel.locator("option").count() : 0;
if (!(await schoolSel.count())) no("설문지의 학교가 아직 손으로 적는 칸입니다");
else if (opts <= 2) no("로그인 없는 설문지에 학교 목록이 안 옵니다 (0114)");
else ok(`설문지에서 학교를 골라 넣습니다 (${opts - 2}곳)`);

const gradeTag = await p.locator('[name="grade"]').evaluate((el) => el.tagName);
if (gradeTag !== "SELECT") no(`설문지의 학년이 ${gradeTag} 입니다 (골라 넣어야 합니다)`);
else ok("설문지에서 학년을 골라 넣습니다");

await p.fill('input[name="name"]', "테스트아이");
await p.fill('input[name="phone"]', "01099998888");
await p.fill('input[name="student_phone"]', "01077776666");
await schoolSel.selectOption({ label: "신정중" });
await p.selectOption('[name="grade"]', "중2");

// 「기타」 를 고르면 뒤에 적는 칸이 열리는가
await p.selectOption('[name="source"]', "기타");
await p.waitForTimeout(300);
if (await p.locator('input[name="source_why"]').count() === 0) no("「기타」 를 골라도 적는 칸이 안 열립니다");
else ok("「기타」 를 고르면 적는 칸이 열립니다");
await p.fill('input[name="source_why"]', WHY);

// 개인정보 동의는 **마지막 체크박스**다 (앞의 것들은 희망 시간표)
const boxes = p.locator('input[type="checkbox"]');
await boxes.first().check();          // 희망 시간표 하나
await boxes.last().check();           // 개인정보 동의
await p.locator('button[type="submit"]').first().click();
await p.waitForTimeout(3000);
const after = await p.innerText("body");
if (!/접수|고맙|감사/.test(after)) console.log("    (설문지 화면에 남은 말) " + after.slice(-260).replace(/\n+/g, " "));
await p.close();

// ── 2) 원장님 화면에 그대로 닿았나 ─────────────────────────
const q = await b.newPage({ viewport: { width: 1280, height: 1000 } });
q.on("pageerror", (e) => no(`상담 화면이 터졌습니다: ${e.message.split("\n")[0]}`));
await q.goto(`${APP}/login`, { waitUntil: "networkidle" });
await q.locator("input").first().fill("principal@e2e.test");
await q.locator('input[type="password"]').first().fill("e2e-pass");
await q.locator('button[type="submit"]').first().click();
await q.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
await q.goto(`${APP}/consult`, { waitUntil: "networkidle" });

const body = await q.innerText("body");
if (!body.includes("테스트아이")) no("설문지가 상담 목록에 안 들어왔습니다");
else if (!body.includes(WHY)) no(`「기타」 뒤에 적은 글이 목록에 없습니다 — 「${WHY}」`);
else ok("적어주신 글이 상담 목록에 그대로 있습니다");

// **수정창을 열면 그 값이 골라져 있어야 한다** — 여기가 잃던 자리다
const row = q.locator(".stuRow", { hasText: "테스트아이" }).first();
await row.getByRole("button", { name: "수정" }).first().click();
await q.waitForTimeout(500);
const sel = q.locator("select").filter({ hasText: "기타" }).first();
const picked = await sel.inputValue().catch(() => "");
if (!picked) no("수정창에서 유입경로가 빈 칸입니다 (그대로 저장하면 지워집니다)");
else if (!picked.includes(WHY)) no(`수정창의 유입경로가 「${picked}」 로 줄었습니다`);
else ok(`수정창에도 「${picked}」 그대로입니다`);

// 찍은 것은 저장소에 두지 않는다 — OUT 을 주셨을 때만 남긴다
if (process.env.OUT) await q.screenshot({ path: `${process.env.OUT}/apply-other.png`, fullPage: true });
await b.close();

if (bad) { console.log("\n❌ 설문지 → 상담 사이에서 잃습니다"); process.exit(1); }
console.log("\n✅ 설문지 「기타」 통과");
