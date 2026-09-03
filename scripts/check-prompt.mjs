/**
 * **되짚기 표가 거짓말이 되지 않았나** — `docs/프롬프트-되짚기.md` 전수검사.
 *
 * 원장님 (2026-09-03) — 「내가 자연어로 대충 설명 하면 니가 빠르고 효율적이고
 * 정확한 프롬프트로 바꿔줘.」 그래서 「원장님 말 → 앱의 판단 → 사는 곳」
 * 옮김표를 두었다.
 *
 * ── 왜 이게 사고가 되나 ────────────────────────────────
 *
 * 이 표는 **내가 원장님께 되짚어 드릴 때 읽는 표**다. 그런데 표는 문서라서
 * 파일을 옮기거나 함수 이름을 바꿔도 **아무 오류가 안 난다.** 그날부터 나는
 *
 *   「그건 lib/who.js 의 takesExam 을 고치면 됩니다」
 *
 * 하고 **없는 자리를** 자신 있게 되짚어 드리게 된다. 원장님은 맞는 줄 아신다.
 * 이건 이 저장소가 이미 여러 번 당한 종류다 — 두 벌이 되면 언젠가 한쪽만
 * 고치고, 그때부터 두 곳이 다른 말을 하는데 오류는 안 난다 (원칙 1).
 *
 * 그래서 문서가 가리키는 것이 **실제로 있는지** 기계가 본다.
 *   ① 문서·CLAUDE.md 가 부르는 lib 파일이 있나
 *   ② 문서가 부르는 검사 스크립트가 있나
 *   ③ 옮김표의 함수가 **그 줄이 적어둔 파일 안에** 실제로 있나
 *
 * 쓰는 법:  node scripts/check-prompt.mjs
 */
import { existsSync, readFileSync } from "node:fs";

let bad = 0;
const say = (m) => { console.log(`  ✗ ${m}`); bad = 1; };

const DOC = "docs/프롬프트-되짚기.md";
if (!existsSync(DOC)) {
  console.log(`  ✗ ${DOC} 이 없습니다 — 되짚기 규칙이 사라졌습니다`);
  process.exit(1);
}
const doc = readFileSync(DOC, "utf8");
const claude = existsSync("CLAUDE.md") ? readFileSync("CLAUDE.md", "utf8") : "";

// `lib/monthly` 처럼 확장자 없이 부른 것도 같은 파일로 본다
const libFile = (s) => (s.endsWith(".js") ? s : `${s}.js`);

// ── ① 부르는 lib 파일이 실제로 있나 (문서 + CLAUDE.md 판단 표) ──────
for (const [where, text] of [[DOC, doc], ["CLAUDE.md", claude]]) {
  const seen = new Set();
  for (const m of text.matchAll(/`(lib\/[A-Za-z][A-Za-z0-9]*(?:\.js)?)[^`]*`/g)) {
    const f = libFile(m[1]);
    if (seen.has(f)) continue;
    seen.add(f);
    if (!existsSync(f)) say(`${where} 가 ${f} 를 가리키는데 그런 파일이 없습니다`);
  }
}

// ── ② 부르는 검사 스크립트가 실제로 있나 ────────────────────────
{
  const seen = new Set();
  for (const m of doc.matchAll(/(?:scripts\/)?(check-[a-z]+\.(?:mjs|sh))/g)) {
    const f = `scripts/${m[1]}`;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!existsSync(f)) say(`${DOC} 가 ${f} 를 부르는데 그런 검사가 없습니다`);
  }
}

// ── ③ 옮김표의 함수가 그 줄이 적어둔 파일 안에 있나 ────────────────
//
// 표의 한 줄:  | 원장님 말 | `함수` · `함수` | `lib/a.js` · `lib/b.js` |
// 판단 칸이 우리말 설명인 줄(「회차의 갈래·범위 재촉」)은 볼 것이 없어 건너뛴다.
const isIdent = (s) => /^[a-z][A-Za-z0-9]*$/.test(s);
const ticks = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
let rows = 0;

for (const line of doc.split("\n")) {
  if (!line.startsWith("|")) continue;
  const cell = line.split("|").map((s) => s.trim());
  if (cell.length < 5) continue;               // | 말 | 판단 | 사는 곳 | → 5칸
  const [, , judge, home] = cell;
  const files = ticks(home).filter((t) => t.startsWith("lib/")).map(libFile);
  if (!files.length) continue;                 // 사는 곳이 없는 줄 (머리글·설명)
  rows += 1;

  const fns = ticks(judge).filter(isIdent);
  for (const fn of fns) {
    const found = files.some((f) => {
      if (!existsSync(f)) return false;         // ① 이 이미 잡았다
      return new RegExp(`\\b(?:function|const|let|class)\\s+${fn}\\b`).test(readFileSync(f, "utf8"));
    });
    if (!found) {
      say(`옮김표: ${fn} 이 ${files.join(" · ")} 어디에도 없습니다 ` +
          `— 이름이 바뀌었으면 ${DOC} 도 같이 고쳐주세요`);
    }
  }
}

// 표 자체가 통째로 사라지거나 모양이 바뀌면 위 검사가 **조용히 0줄을 통과**한다.
// 「돌았는데 볼 것이 없었다」 를 통과로 세지 않는다 (check-pages.sh 의 건너뜀 교훈).
if (rows < 8) say(`옮김표에서 읽어낸 줄이 ${rows}개뿐입니다 — 표 모양이 바뀌었는지 보세요`);

if (bad) { console.log("❌ 되짚기 문서가 실제 코드와 어긋납니다"); process.exit(1); }
console.log(`  되짚기 옮김표 ${rows}줄 — 가리키는 파일·함수·검사가 전부 있습니다`);
