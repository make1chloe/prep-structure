/** 받을 교재·학습지에 아이가 쓰는 것 — 단계 · 스스로 정한 마감. 아이 자격으로 쓰고 DB 문지기(0117)가 그 두 칸만 연다(표-9) */
import { db } from "./supabase.js";
import { isStage } from "./material-plan.js";
import { changed } from "./sqlError.js";
export async function setStage(sb, materialId, studentId, stage) {
  if (!isStage(stage)) throw new Error(`단계가 아닙니다: ${stage}`);
  changed(await db(sb).from("material_give").update({ stage }, { count: "exact" }).eq("material_id", materialId).eq("student_id", studentId), "단계를 못 적음");
}
export async function setDue(sb, materialId, studentId, dueOn) {
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(String(dueOn))) throw new Error(`날짜가 아닙니다: ${dueOn}`);
  changed(await db(sb).from("material_give").update({ due_on: dueOn || null }, { count: "exact" }).eq("material_id", materialId).eq("student_id", studentId), "마감 날짜를 못 적음");
}
