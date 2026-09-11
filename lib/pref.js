/** 카드 순서·접기(확정-⑮ · 4단계-6 · (어2)) — 사람마다·화면마다 한 줄(screen_pref · own_sp: 제 것만). 판단은 lib/pref-plan.js
 *  **부분만 받는다** — ⇅ 는 차례만, ▾ 는 접은 카드 하나만 보낸다. 있던 줄을 먼저 읽어 합쳐야 한쪽이 다른 쪽을 지우지 않는다 */
import { db } from "./supabase.js";
import { applyPatch, SCREENS } from "./pref-plan.js";
import { changed, row } from "./sqlError.js";
export async function setPref(sb, profileId, screen, patch) {
  if (!SCREENS[screen]) throw new Error(`화면이 아닙니다: ${screen}`);
  const had = row(await db(sb).from("screen_pref").select("layout").eq("profile_id", profileId).eq("screen", screen).maybeSingle(), "카드 차례를 못 읽음");
  const p = applyPatch(had?.layout ?? {}, patch);
  changed(await db(sb).from("screen_pref").upsert({ profile_id: profileId, screen, layout: p }, { onConflict: "profile_id,screen", count: "exact" }), "카드 순서를 못 적음");
  return p;
}
