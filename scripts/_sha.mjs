/** 마이그레이션 파일의 지문 — **한 곳에서만 센다.**
 *  `_ap.mjs`(돌리며 적는다) · `check-migrations.mjs`(파일과 대조) ·
 *  `build-real-db-sql.mjs`(붙여넣기 한 벌에 적어 넣는다)가 같은 값을 써야
 *  「돌렸는데 안 돌린 것으로 센다」가 안 생긴다(원칙-1 — 두 벌로 적지 않는다). */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
export const sha = (f) =>
  createHash("sha256").update(readFileSync("supabase/migrations/" + f)).digest("hex").slice(0, 16);
