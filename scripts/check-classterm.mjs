/**
 * **특강 기한이 달력까지 닿는가** (lib/schedule · lib/classTerm)
 *
 * 원장님 (2026-08-06) — 「여전히 반 일정이 고려되지 않아. 화목1특강이 8월
 * 11일까지인데 일정에 8월 이후에도 계속 수업이 있는 걸로 나와」
 *
 * ── 왜 이 검사가 따로 필요한가 ───────────────────────────
 *
 * 계산은 **처음부터 맞았다.** `inTermOn` 이 개강 전·종강 뒤를 정확히 자른다.
 * 틀린 것은 **자료가 안 왔다는 것**이었다 — 화면들이 `starts_on`, `ends_on`
 * 을 안 골라 읽었다. 안 고르면 `undefined` 가 되고, `undefined` 는
 * 「기한 없음 = 무기한」 으로 읽혀서 종강한 특강이 영원히 수업한다.
 *
 * **오류도 안 나고 화면도 멀쩡하다.** 계산만 검사하면 영원히 통과한다.
 * 그래서 여기서는 둘을 같이 본다 —
 *
 *   1) 계산이 맞나            (화목1특강 8/11 종강 → 8월 회차 · 9월 0회)
 *   2) **자료를 챙겨 오나**    (회차를 세는 화면이 기간 칸을 골라 읽나)
 *
 * 쓰는 법:  node scripts/check-classterm.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sessionNumbers, reviewClass, inTermOn, monthsFrom } from "../lib/schedule.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

/* ── 1) 계산 ────────────────────────────────────────────── */

// 원장님의 실제 반 — 화·목, 8월 11일 종강
const 화목1특강 = { id: "x", name: "화목1특강", days: ["화", "목"], ends_on: "2026-08-11" };

console.log("== 화목1특강 (8월 11일 종강) ==");
const aug = [...sessionNumbers(화목1특강, "2026-08", new Set(), []).keys()];
eq(aug, ["2026-08-04", "2026-08-06", "2026-08-11"], "8월은 11일까지만");
eq([...sessionNumbers(화목1특강, "2026-09", new Set(), []).keys()], [], "9월은 없다");
eq([...sessionNumbers(화목1특강, "2026-10", new Set(), []).keys()], [], "10월도 없다");

console.log("\n== 회차 관리도 같은 답 ==");
const months = monthsFrom("2026-08", 3);
const rows = reviewClass(화목1특강, months, [], [], [], []);
eq(rows.map((m) => m.live.length), [3, 0, 0], "8·9·10월 회차");

console.log("\n== 개강 전 · 무기한 · 손으로 보관 ==");
eq(inTermOn({ starts_on: "2026-08-12" }, "2026-08-11"), false, "개강 전날은 수업이 아니다");
eq(inTermOn({ starts_on: "2026-08-12" }, "2026-08-12"), true, "개강일부터");
eq(inTermOn({}, "2030-01-01"), true, "날짜가 없으면 무기한 (정규반)");
// 종강일은 안 적고 보관 버튼만 누른 반 — 예전에는 달력에 영원히 남았다
eq(inTermOn({ archived_at: "2026-08-11T09:00:00Z" }, "2026-08-20"), false,
   "손으로 보관한 반도 그날 뒤로는 수업이 없다");
eq(inTermOn({ archived_at: "2026-08-11T09:00:00Z" }, "2026-08-10"), true,
   "보관하기 전날은 수업이 있다");

/* ── 2) 자료를 챙겨 오나 ────────────────────────────────── */
//
// 회차를 세는 화면이 기간 칸을 안 읽으면 위 계산이 아무 소용이 없다.
// 실제로 네 화면(대시보드·학생·학부모·학교별)이 그래서 틀려 있었다.

console.log("\n== 회차를 세는 화면이 기간 칸을 읽나 ==");

const USES = /reviewClass\(|sessionNumbers\(|loadStudentCalendar\(/;
const CLASS_QUERY = /from\(\s*["']classes["']\s*\)\s*\n?\s*\.?\s*select\(\s*(["'`])([^]*?)\1/g;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(f)) out.push(p);
  }
  return out;
}

const bad = [];
for (const path of [...walk("app"), ...walk("lib")]) {
  const src = readFileSync(path, "utf8");
  if (!USES.test(src)) continue;
  for (const m of src.matchAll(CLASS_QUERY)) {
    const cols = m[2];
    // 0042 전 DB 를 위한 **되돌아가는 조회**는 기간 칸이 없는 게 맞다.
    // 그 줄에는 반드시 그렇다고 적혀 있어야 한다 (앞뒤 두 줄 안에)
    const at = m.index ?? 0;
    const around = src.slice(Math.max(0, at - 400), at + 200);
    const isFallback = /0042|기간 칸이 없|없는 대로|없이 한 번 더|없이$/m.test(around);
    if (!cols.includes("ends_on") && !isFallback) {
      bad.push(`${path} — select("${cols.slice(0, 60)}…")`);
    }
  }
}
eq(bad, [], "기간 칸(ends_on)을 안 읽고 회차를 세는 곳");

if (fail) {
  console.log("\n❌ 특강 기한이 달력까지 안 닿습니다.");
  console.log("   반을 읽을 때 lib/classTerm 의 loadClassesWithTerm 을 쓰거나,");
  console.log("   select 에 starts_on · ends_on · archived_at 을 같이 적어주세요.");
  process.exit(1);
}
console.log("\n✅ 특강 기한 통과");
