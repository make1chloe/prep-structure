/** 🗺 영역별 메모(목업 01 · 표 v2.day_area_memo 0079) — 그날 그 아이의 그 영역 한 마디. 아이·학부모에게 그대로 나간다(마감해야 보인다) · 브리핑 재료. 쓰는 길은 이 함수 하나 */
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { MEMO_AREAS } from "./roster-plan.js";
export async function saveAreaMemo(sb, sheetId, area, memo) {
  if (!MEMO_AREAS.includes(area)) throw new Error(`영역이 아닙니다: ${area}`);
  await assertOpen(sb, sheetId);
  const text = String(memo ?? "").trim();   // 비우면 빈 글로 남는다 — 지우지 않는다(대전제-6). 보이는 쪽(facts · 아이 화면)이 빈 글을 거른다
  const { error } = await db(sb).from("day_area_memo").upsert({ sheet_id: sheetId, area, memo: text, updated_at: new Date().toISOString() }, { onConflict: "sheet_id,area" });
  if (error) throw new Error(`영역 메모를 못 저장함: ${error.message}`);
}
