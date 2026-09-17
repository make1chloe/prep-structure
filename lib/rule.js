/** 규칙의 임계값 — v2.rule 에서 읽는다(뼈대-5). 코드에 숫자를 박지 않는다. 줄이 없으면 던진다 — 조용히 기본값으로 돌지 않는다 */
import { db } from "./supabase.js";
import { changed } from "./sqlError.js";
export async function rule(sb, key) {
  const { data, error } = await db(sb).from("rule").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`규칙을 못 읽음 ${key}: ${error.message}`);
  if (!data) throw new Error(`규칙 줄이 없다: ${key} · 0100 마이그레이션의 v2.rule 씨앗을 본다`);
  return data.value;
}
export const ruleInt = async (sb, key) => parseInt(await rule(sb, key), 10);
export const ruleList = async (sb, key) => (await rule(sb, key)).split(",").map((s) => s.trim()).filter(Boolean);
/** 접두어로 여러 규칙 값을 **한 조회**로 — 화면 파도에 태운다(속도-1). { key: value } */
/** 규칙 한 줄의 값을 고친다 — **쓰는 자리는 여기 하나**((어72)). 전에는 lib/exam.js·lib/send.js 에 한 벌씩 있었고
 *  「아이가 채울 칸」이 세 번째가 될 참이라 모았다(원칙 4-3 — 세 번째 예외면 설계를 다시 세운다).
 *  ⚠️ 줄이 없으면 던진다 — 화면이 **새 열쇠를 만들지 않는다**(씨앗은 마이그레이션이 깐다 · 뼈대-5) */
export async function setRule(sb, key, value) {
  const r = changed(await db(sb).from("rule").update({ value: String(value) }).eq("key", key).select("key"), `규칙을 수정 못 함: ${key}`, { zero: "ok" }) ?? [];
  if (!r.length) throw new Error(`규칙 줄이 없다: ${key} · 마이그레이션의 v2.rule 씨앗을 본다`);
  return { key, value: String(value) };
}
export async function ruleMap(sb, prefixes) {
  const { data, error } = await db(sb).from("rule").select("key,value").or(prefixes.map((p) => `key.like.${p}%`).join(","));
  if (error) throw new Error(`규칙을 못 읽음 ${prefixes.join(",")}: ${error.message}`);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}
