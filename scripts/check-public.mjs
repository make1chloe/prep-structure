// 기계가 부르는 주소가 **로그인으로 튕기지 않는지** 본다.
//
// 왜 검사로 만드나 —
//   아이폰 홈 화면 아이콘이 몇 주 동안 「클」 이라는 글자로 떠 있었다.
//   그림이 잘못된 게 아니라, /api/icon/apple 이 로그인 화면으로 돌려보내지고
//   있었다. 아이폰은 그 HTML 을 그림으로 못 읽어서 글자 타일을 만든 것이다.
//   구글 캘린더 구독도 같은 이유로 조용히 실패하고 있었다.
//
//   둘 다 **화면에서는 아무 표시도 안 난다.** 눈으로는 영영 못 찾는다.
//   그래서 여기 적어둔다.

import { readFileSync } from "node:fs";

const bad = [];

// 로그인 없이 열려야 하는 주소
const PUBLIC = [
  "/api/icon/apple",
  "/api/icon/192",
  "/api/icon/512",
  "/api/calendar",
  "/manifest.webmanifest",
];

// 로그인으로 튕겨야 하는 주소 (열어둔 것이 너무 넓지 않은지)
const GUARDED = ["/today", "/students", "/settings", "/report", "/api"];

// ── 1) matcher 가 이 주소들을 빼고 있나 ──────────────────────
const mw = readFileSync("middleware.js", "utf8");
const m = mw.match(/matcher:\s*\[\s*"([^"]+)"/);
if (!m) {
  bad.push("middleware.js 의 matcher 를 못 읽었습니다");
} else {
  // Next 의 matcher 는 경로 패턴이지만, 우리 것은 정규식 하나라 그대로 쓴다
  const re = new RegExp(`^${m[1]}$`);
  for (const p of PUBLIC) {
    if (re.test(p)) bad.push(`matcher 가 아직 잡고 있음 (로그인으로 튕깁니다): ${p}`);
  }
  for (const p of GUARDED) {
    if (!re.test(p)) bad.push(`matcher 가 안 잡음 (아무나 열립니다): ${p}`);
  }
}

// ── 2) 안쪽에서도 한 번 더 열어두었나 ────────────────────────
// matcher 정규식 하나에만 기대면, 나중에 그 줄을 건드릴 때 또 막힌다.
const inner = readFileSync("lib/supabase/middleware.js", "utf8");
for (const p of ["/api/icon", "/api/calendar", "/manifest"]) {
  if (!inner.includes(`"${p}"`)) {
    bad.push(`lib/supabase/middleware.js 안에서 ${p} 를 안 열어두었습니다`);
  }
}

if (bad.length) {
  console.log(bad.map((b) => `  ${b}`).join("\n"));
  process.exit(1);
}
console.log("  로고 · 달력 · manifest 는 로그인 없이 열립니다");
