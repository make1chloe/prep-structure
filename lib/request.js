/** 남기실 말(v2.request) — 아이·학부모가 원장님께 한 줄. 도착하는 자리는 대시보드 💬 답할 것(17) — 원장님이 거기서 한 줄 답한다((처) answerRequest). 아이는 제 것만 본다(own_rq) */
import { db } from "./supabase.js";
import { changed } from "./sqlError.js";
export const KINDS = Object.freeze([["question", "질문"], ["makeup", "보강"], ["absence", "결석"], ["other", "그 밖"]]);
export async function ask(sb, { profileId, studentId, body, kind = "question" }) {
  const text = String(body ?? "").trim();
  if (!text) throw new Error("할 말을 적어 주세요");
  if (text.length > 500) throw new Error("500자 안으로 적어 주세요");
  if (!KINDS.some(([k]) => k === kind)) throw new Error(`갈래가 아닙니다: ${kind}`);
  const { error } = await db(sb).from("request").insert({ by_profile: profileId, student_id: studentId, kind, body: text });
  if (error) throw new Error(`못 보냄: ${error.message}`);
}
/** (처) 원장님의 답 — 한 줄(500자 안) · answered_at · seen_at · state answered(지우지 않는다 — 대전제-6). 아이 07 · 학부모 09 의 남기실 말 카드가 「답 — …」 로 본다(own_rq). 이미 답한 줄엔 다시 못 쓴다(0줄이면 실패 — 검사-⑪) */
export async function answerRequest(sb, id, text) {
  const t = String(text ?? "").trim();
  if (!id) throw new Error("남기실 말이 없습니다"); if (!t) throw new Error("답을 적어 주세요"); if (t.length > 500) throw new Error("500자 안으로 적어 주세요");
  const now = new Date().toISOString();
  const r = changed(await db(sb).from("request").update({ answer: t, answered_at: now, seen_at: now, state: "answered" }).eq("id", id).eq("state", "open").select("id"), "답을 못 적음") ?? [];
  if (!r.length) throw new Error("이미 답했거나 없는 말입니다");
  return { answered: r.length };
}
