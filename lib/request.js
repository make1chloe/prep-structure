/** 남기실 말(v2.request) — 아이·학부모가 원장님께 한 줄. 도착하는 자리는 대시보드 💬 답할 것(17). 아이는 제 것만 본다(own_rq) */
import { db } from "./supabase.js";
export const KINDS = Object.freeze([["question", "질문"], ["makeup", "보강"], ["absence", "결석"], ["other", "그 밖"]]);
export async function ask(sb, { profileId, studentId, body, kind = "question" }) {
  const text = String(body ?? "").trim();
  if (!text) throw new Error("할 말을 적어 주세요");
  if (text.length > 500) throw new Error("500자 안으로 적어 주세요");
  if (!KINDS.some(([k]) => k === kind)) throw new Error(`갈래가 아닙니다: ${kind}`);
  const { error } = await db(sb).from("request").insert({ by_profile: profileId, student_id: studentId, kind, body: text });
  if (error) throw new Error(`못 보냄: ${error.message}`);
}
