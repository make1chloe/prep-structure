/** (어72) 아이가 제 **빈 칸**을 채운다 — 손 한 벌. 판단은 lib/mine-plan.js(순수) · 여기는 읽고 쓰기만.
 *  ⚠️ **서버에서 다시 잰다** — 원장님이 켠 칸인가 · 정말 비었나 · 제 줄인가. 아이 손의 문지기는 역할만 보므로
 *     화면을 우회한 요청은 여기와 표의 문지기(0175 students_child_guard)가 막는다(두 겹). */
import { db } from "./supabase.js";
import { changed, row } from "./sqlError.js";
import { ruleMap, setRule } from "./rule.js";
import { parseCcIdx } from "./cc.js";
import { FILL, isOn, isEmpty, parseFill, fillName } from "./mine-plan.js";

/** 제 클래스카드 줄 — 아이 자격으로 제 것만(0175 own_cc_read) · 없으면 null */
export const myCc = async (sb, studentId) =>
  row(await db(sb).from("cc_student").select("cc_user_idx").eq("student_id", studentId).maybeSingle(), "클래스카드 아이디를 못 읽음");

/** 한 칸 채우기 — 켠 칸이고 · 비었을 때만 · 제 줄에만 */
export async function fillMine(sb, studentId, key, raw, today = "") {
  const f = FILL.find(([k]) => k === key); if (!f) throw new Error(`채울 칸이 아님: ${key}`);
  const rules = await ruleMap(sb, ["me.fill."]);
  if (!isOn(rules, f[1])) throw new Error(`${f[2]} · 지금 안 받음`);
  const st = row(await db(sb).from("students").select("id,phone,parent_phone,grade,birth").eq("id", studentId).maybeSingle(), "내 줄을 못 읽음");
  if (!st) throw new Error("내 줄 없음");
  const cc = key === "cc" ? await myCc(sb, studentId) : null;
  if (!isEmpty(st, cc, key)) throw new Error(`${f[2]} · 이미 적힘`);
  if (key === "cc") {
    const idx = parseCcIdx(raw);   // chloe… 막이는 14 와 한 벌(원칙-1)
    changed(await db(sb).from("cc_student").insert({ student_id: studentId, cc_user_idx: idx }).select("student_id"), `${fillName(key)} 을 못 적음`);
    return { key, value: idx };
  }
  const value = parseFill(key, raw, today);
  changed(await db(sb).from("students").update({ [key]: value }).eq("id", studentId).select("id"), `${fillName(key)} 을 못 적음`);
  return { key, value };
}

/** (어72) 원장님이 「아이가 채울 칸」을 켜고 끈다 — 설정 화면. 규칙 쓰기는 lib/rule.js 한 곳(원칙-1).
 *  열쇠는 FILL 표 안의 것만 받는다 — 화면이 아무 규칙이나 못 고친다 */
export async function setFillRule(sb, ruleKey, on) {
  if (!FILL.some(([, rk]) => rk === ruleKey)) throw new Error(`아이 칸이 아님: ${ruleKey}`);
  return setRule(sb, ruleKey, on ? "on" : "off");
}
