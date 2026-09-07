/** 카드 순서(확정-⑮ · 4단계-6) — 사람마다·화면마다 한 줄(screen_pref · own_sp: 제 것만). 판단은 lib/pref-plan.js */
import { db } from "./supabase.js";
import { parseLayout, SCREENS } from "./pref-plan.js";
export async function setPref(sb, profileId, screen, layout) {
  if (!SCREENS[screen]) throw new Error(`화면이 아닙니다: ${screen}`);
  const p = parseLayout(layout);
  const { error } = await db(sb).from("screen_pref").upsert({ profile_id: profileId, screen, layout: p }, { onConflict: "profile_id,screen" });
  if (error) throw new Error(`카드 순서를 못 적음: ${error.message}`);
  return p;
}
