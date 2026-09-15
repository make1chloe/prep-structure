/** 학교 · 학원 사람의 손(원장님 2026-09-15 「칸반에 학교추가를 못해 왜냐면 입력된 학교가 없어서 근데 그걸 어디서 입력해야함」).
 *  앱 어디에도 학교를 넣는 자리가 없었다(가져오기 12b 는 있는 학교에 코드를 붙일 뿐). 대전제-19: 항목은 더하고 고치고 빼는 것이 기본.
 *  지우지 않는다(대전제-6): 빼기 = state closed(고르개·표·판에서 사라진다 · 붙어 있던 아이·시험은 그대로). 같은 이름을 다시 넣으면 닫힌 것을 되살린다. */
import { db } from "./supabase.js";
import { row, changed } from "./sqlError.js";
import { LEVELS, guessLevel } from "./schools-plan.js";   // 순수 판단은 schools-plan(화면 부품이 서버 모듈 없이 가져다 쓴다)
export async function addSchool(sb, { name, level }) {
  const nm = String(name ?? "").trim(); if (!nm) throw new Error("학교 이름을 적으세요");
  const lv = level || guessLevel(nm); if (!LEVELS.some(([k]) => k === lv)) throw new Error("초·중·고를 고르세요");
  const had = row(await db(sb).from("schools").select("id,name,level,state").eq("name", nm).maybeSingle(), "학교를 못 읽음");
  if (had?.state === "active") throw new Error(`이미 있는 학교입니다: ${nm}`);
  if (had) { changed(await db(sb).from("schools").update({ state: "active", level: lv }, { count: "exact" }).eq("id", had.id), "학교를 못 되살림"); return { id: had.id, name: nm, level: lv, revived: true }; }
  const r = row(await db(sb).from("schools").insert({ name: nm, level: lv }).select("id,name,level").single(), "학교를 못 넣음");
  return { ...r, revived: false };
}
export async function setSchool(sb, id, { name, level }) {
  const nm = String(name ?? "").trim(); if (!nm) throw new Error("학교 이름을 적으세요");
  if (!LEVELS.some(([k]) => k === level)) throw new Error("초·중·고를 고르세요");
  changed(await db(sb).from("schools").update({ name: nm, level }, { count: "exact" }).eq("id", id), "학교를 못 고침");
}
export async function closeSchool(sb, id) { changed(await db(sb).from("schools").update({ state: "closed" }, { count: "exact" }).eq("id", id).eq("state", "active"), "학교를 못 닫음"); }
export async function reviveSchool(sb, id) { changed(await db(sb).from("schools").update({ state: "active" }, { count: "exact" }).eq("id", id).eq("state", "closed"), "학교를 못 되살림"); }
/** 고른 학교 여럿을 한 번에 닫는다((어28)-④ · 대전제-20) · closeSchool 을 차례로 · 막히면 그 학교부터 멈춘다 */
export async function closeSchoolMany(sb, ids = []) { const list = [...new Set((ids ?? []).filter(Boolean))]; if (!list.length) throw new Error("고른 학교이 없습니다"); let n = 0; for (const id of list) { await closeSchool(sb, id); n++; } return { n }; }
