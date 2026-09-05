/** ⚠️ 자동 검사 ⑥ — 마이그레이션이 `v2` **밖을 바꾸면** 실패.
 *
 *  ✅ 괜찮다 : `auth.uid()` 를 **읽는** 것 — 접근 규칙이 그것으로 판단한다
 *  ❌ 막는다 : `auth.` `storage.` `public.` 에 **만들거나·고치거나·트리거를 붙이거나·권한을 주는** 것
 *
 *  까닭 — `auth.users` 트리거가 v2 제약에 걸리면 **구앱의 계정 발급이 그 자리에서 멈춘다.**
 *  Storage 정책은 **파일은 그대로인데 접근만 막혀** 원인 찾기가 제일 어렵다.
 *  ⚠️ 이 셋은 **도메인 원복으로 못 되돌린다** — 공사 중 평일 저녁 사고다.
 */
// ⚠️ 2026-09-05 밤부터 새 표는 v3 에 선다 — v2·v3 둘 다 「안」이다. 밖은 여전히 auth·storage·public 셋.
import { readdirSync, readFileSync } from "node:fs";
const 예외 = new Set(["9000_switch_day.sql","9001_purge_public.sql"]);
const 밖 = "(auth|storage|public)";
const 규칙 = [
  // 만들기·고치기·지우기의 **대상**이 밖일 때
  new RegExp(`\\b(?:create|alter|drop)\\s+(?:or\\s+replace\\s+)?(?:table|function|type|index|view|materialized\\s+view|sequence)\\s+(?:if\\s+(?:not\\s+)?exists\\s+)?${밖}\\.`, "i"),
  // 트리거·정책은 **on 뒤**가 대상이다
  new RegExp(`\\b(?:create|alter|drop)\\s+(?:trigger|policy)\\s+\\S+\\s+(?:before|after|instead|for|on)[\\s\\S]{0,60}?\\bon\\s+${밖}\\.`, "i"),
  new RegExp(`\\balter\\s+table\\s+(?:only\\s+)?${밖}\\.`, "i"),
  new RegExp(`\\b(?:grant|revoke)\\b[\\s\\S]{0,120}?\\bon\\s+(?:all\\s+\\w+\\s+in\\s+schema\\s+)?${밖}\\b`, "i"),
  new RegExp(`\\bcreate\\s+schema\\s+(?:if\\s+not\\s+exists\\s+)?${밖}\\b`, "i"),
];
const bad=[];
for (const f of readdirSync("supabase/migrations").filter(x=>x.endsWith(".sql")).sort()) {
  if (예외.has(f)) continue;
  const s=readFileSync("supabase/migrations/"+f,"utf8");
  for (const stmt of s.split(/;\s*\n/)) {
    const clean = stmt.split("\n").filter(l=>!/^\s*--/.test(l)).join(" ").replace(/\s+/g," ");
    for (const re of 규칙) if (re.test(clean)) { bad.push(`${f}  ${clean.trim().slice(0,90)}`); break; }
  }
}
console.log("■ v2 밖을 **바꾸는** 자리 (auth.uid() 를 읽는 것은 괜찮다)");
bad.length ? bad.forEach(x=>console.log("   ❌",x)) : console.log("   ✅ 없음");
// 일부러 어기는 본보기가 잡히는지도 본다 (옛 앱의 교훈 — 검사가 헛통과하면 없느니만 못하다)
const 본보기 = "create trigger x after insert on auth.users for each row execute function v2.f()";
if (!규칙.some(re=>re.test(본보기))) { console.log("   ⚠️ 검사 자신이 고장났다 — 본보기를 못 잡는다"); process.exit(1); }
console.log("   (검사 자신 확인: 일부러 어긴 본보기를 잡는다 ✅)");
process.exit(bad.length?1:0);
