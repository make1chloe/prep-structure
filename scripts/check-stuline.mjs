import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * **목록 한 줄은 세 자리로 나눠 쓴다** (원장님 2026-08-24).
 *
 * 「다른 페이지에서는 줄은 바뀌는데 진짜 줄만 바뀌고 정보의 위치가 아무 데나
 * 가 있어서, 칸이 늘어나면 뭘 봐야 될지 모르겠는 상황이 있었어」
 *
 * `.stuLine` 에 이름·태그·단추를 **날 것으로** 늘어놓으면, 태그 개수가
 * 학생마다 달라서 접히는 자리가 줄마다 달라진다. 그래서 셋으로 못 박는다:
 *
 *   .stuWho   누구인가 (이름·학교·학년) — 안 접힌다
 *   .stuTags  상태 태그 전부 — 폰에서는 늘 아랫줄, 늘 왼쪽 끝
 *   .stuEnd   손이 가는 것 (단추·열림 표시) — 늘 오른쪽 끝
 *
 * 옛 방식인 `<span className="spacer" />` 로 오른쪽을 미는 것도 막는다 —
 * 접히고 나면 spacer 가 남아서 단추가 줄마다 다른 자리로 튄다.
 */
const files = [];
for (const root of ["app", "components"]) {
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if ([".next", "node_modules"].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(e.name)) files.push(p);
    }
  })(root);
}

const bad = [];
for (const f of files) {
  const s = readFileSync(f, "utf8");
  if (!/className="stuLine"|className={`stuLine/.test(s)) continue;
  for (const slot of ["stuWho", "stuTags", "stuEnd"]) {
    if (!s.includes(slot)) {
      bad.push(`${f} — .stuLine 을 쓰면서 .${slot} 가 없습니다 (누구·태그·손 가는 것 세 자리로 나눠주세요)`);
    }
  }
  // 줄 **안에** 남은 옛 밀개 — 줄 시작부터 그 줄의 .stuEnd 까지만 본다
  // (머리글·도구줄의 spacer 는 이 병과 무관하다)
  for (const m of s.matchAll(/className="stuLine"/g)) {
    const end = s.indexOf("stuEnd", m.index);
    if (end < 0) continue;
    if (s.slice(m.index, end).includes('className="spacer"')) {
      const line = s.slice(0, m.index).split("\n").length;
      bad.push(`${f}:${line} — 줄 안에 <span className="spacer" /> 가 남아 있습니다. 오른쪽은 .stuEnd 가 잡습니다`);
    }
  }
}

if (bad.length) {
  console.log("❌ 목록 한 줄의 자리:");
  bad.forEach((b) => console.log("   ·", b));
  process.exit(1);
}
console.log("✅ 목록 한 줄이 세 자리(누구·태그·손 가는 것)로 서 있습니다");
