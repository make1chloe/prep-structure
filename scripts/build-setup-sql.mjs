// 합본 SQL 을 마이그레이션 폴더에서 **다시 만든다.**
//
// 왜 필요한가
//   합본을 손으로 이어붙이다 보니 SETUP_ALL.sql 과 한번에_실행.sql 이 각각 다른 데서
//   멈춰 있었다 (0041 · 0052 뒤죽박죽). 문서는 "이 파일 하나만 돌리세요" 라고 안내하는데
//   실제로는 최근 마이그레이션이 빠져 있어서, 그대로 돌리면 새 기능이 안 켜진다.
//
//   같은 SQL 을 세 군데 두면 언젠가 한쪽만 고치게 된다. 그래서
//   **migrations 폴더 하나만 진짜**로 두고, 합본 둘은 여기서 찍어낸다. (원칙1)
//
// 쓰는 법:  node scripts/build-setup-sql.mjs
//   (마이그레이션을 추가한 뒤 한 번 돌리면 된다)

import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const dir = path.join(root, "supabase", "migrations");

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.error("마이그레이션이 없습니다.");
  process.exit(1);
}

const last = files[files.length - 1].slice(0, 4);
const today = new Date().toISOString().slice(0, 10);

/** 파일들을 구분자와 함께 이어붙인다 */
function join(list) {
  return list
    .map((f) => {
      const body = fs.readFileSync(path.join(dir, f), "utf8").trimEnd();
      return `-- ─────────── ${f} ───────────\n${body}\n`;
    })
    .join("\n");
}

const HOWTO = `--   1. https://supabase.com/dashboard → 프로젝트 선택
--   2. 왼쪽 메뉴 SQL Editor → Untitled query 안을 클릭
--   3. **Ctrl+A 로 전체 선택하고 지운 뒤** 이 파일 내용을 붙여넣기
--      ★ 지난번 내용 아래에 덧붙이지 마세요. 통째로 갈아끼우는 것입니다.
--      — 앱 안에서 바로 복사할 수 있습니다: 설정 → Supabase SQL
--   4. 오른쪽 아래 Run (또는 Cmd/Ctrl + Enter)
--   5. "Success" 가 나오면 끝
--
-- 여러 번 실행해도 안전합니다 — 이미 있는 것은 전부 건너뜁니다.
--
-- ※ 중간에 에러가 나면 **아무것도 반영되지 않습니다** (한 덩어리로 실행되기 때문).
--   DB 가 망가진 게 아니니 원인만 고쳐서 다시 Run 하시면 됩니다.
--   어디서 걸렸는지 모르겠으면 앱의 **설정 → Supabase SQL** 에서 한 개씩 돌려보세요.`;

const GEN = `-- ⚠ 이 파일은 손으로 고치지 마세요.
--   supabase/migrations/ 를 고친 뒤  node scripts/build-setup-sql.mjs  로 다시 만듭니다.
--   (${today} · 0001~${last} · ${files.length}개)`;

// ── 1. SETUP_ALL.sql — 처음부터 전부 ─────────────────────────
const setupAll = `-- ============================================================
-- 클로이영어 학습관리 — 전체 스키마 (이 파일 하나만 실행하면 됩니다)
--
-- 쓰는 법
${HOWTO}
--
-- 0001 부터 지금까지가 순서대로 다 들어 있습니다.
-- 새 프로젝트든 쓰던 프로젝트든 이 파일 하나면 됩니다.
--
${GEN}
-- ============================================================

${join(files)}`;

// ── 2. 한번에_실행.sql — 0008 부터 (기초가 이미 깔린 프로젝트용) ──
const rest = files.filter((f) => f.slice(0, 4) >= "0008");
const oneShot = `-- ============================================================
-- ⚠ 이 파일은 **이미 0001~0007 이 깔려 있는 프로젝트**용입니다.
--   헷갈리면 그냥 \`SETUP_ALL.sql\` 을 쓰세요. 그거 하나로 두 경우 다 됩니다.
--
--   "relation public.daily_report_items does not exist" 같은 에러가 났다면
--   기초 테이블이 없다는 뜻이니 SETUP_ALL.sql 을 쓰셔야 합니다.
--
-- 클로이영어 앱 — 0008 부터의 변경만
--
-- 쓰는 법
${HOWTO}
--
${GEN}
-- ============================================================

${join(rest)}`;

fs.writeFileSync(path.join(root, "supabase", "SETUP_ALL.sql"), setupAll);
fs.writeFileSync(path.join(root, "supabase", "한번에_실행.sql"), oneShot);

console.log(`SETUP_ALL.sql     0001~${last}  ${files.length}개  ${setupAll.split("\n").length}줄`);
console.log(`한번에_실행.sql    0008~${last}  ${rest.length}개  ${oneShot.split("\n").length}줄`);
