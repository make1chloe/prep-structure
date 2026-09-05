/** 규칙의 임계값 — v2.rule 에서 읽는다(뼈대-5). 코드에 숫자를 박지 않는다. 줄이 없으면 던진다 — 조용히 기본값으로 돌지 않는다 */
import { db } from "./supabase.js";
export async function rule(sb, key) {
  const { data, error } = await db(sb).from("rule").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`규칙을 못 읽음 ${key}: ${error.message}`);
  if (!data) throw new Error(`규칙 줄이 없다: ${key} — 0100 마이그레이션의 v2.rule 씨앗을 본다`);
  return data.value;
}
export const ruleInt = async (sb, key) => parseInt(await rule(sb, key), 10);
export const ruleList = async (sb, key) => (await rule(sb, key)).split(",").map((s) => s.trim()).filter(Boolean);
/** 접두어로 여러 규칙 값을 **한 조회**로 — 화면 파도에 태운다(속도-1). { key: value } */
export async function ruleMap(sb, prefixes) {
  const { data, error } = await db(sb).from("rule").select("key,value").or(prefixes.map((p) => `key.like.${p}%`).join(","));
  if (error) throw new Error(`규칙을 못 읽음 ${prefixes.join(",")}: ${error.message}`);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}
