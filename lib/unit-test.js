/** 📝 단원평가(목업 01 · 표 v2.unit_test 0011) — 원장님이 따로 출제한 문항. 01 카드는 맞은 개수만 적는다(state → scored). 통과선은 규칙 unit_test.pass_pct */
import { db } from "./supabase.js";
/** 오늘 명단의 아이들 것 — 아직 채점 안 한 것 + 오늘 채점한 것(결과가 그날 보이게). 판 파도에 태운다 */
export async function unitTestsOf(sb, studentIds, date) {
  if (!studentIds.length) return [];
  const { data, error } = await db(sb).from("unit_test").select("id,student_id,topic_id,assigned_on,taken_on,q_count,correct,state,grammar_topics(name)")
    .in("student_id", studentIds).or(`state.neq.scored,taken_on.eq.${date}`).order("assigned_on");
  if (error) throw new Error(`단원평가를 못 읽음: ${error.message}`);
  return data ?? [];
}
/** 맞은 개수를 적는다 — 그날 본 것으로(taken_on) · scored */
export async function scoreUnitTest(sb, id, correct, date) {
  const n = Number(correct);
  const { data: row, error: e1 } = await db(sb).from("unit_test").select("id,q_count").eq("id", id).single();
  if (e1 || !row) throw new Error(`단원평가를 못 읽음: ${e1?.message ?? "없음"}`);
  if (!Number.isInteger(n) || n < 0 || n > Number(row.q_count ?? 0)) throw new Error(`맞은 개수는 0~${row.q_count} 사이여야 합니다`);
  const { error } = await db(sb).from("unit_test").update({ correct: n, state: "scored", taken_on: date }).eq("id", id);
  if (error) throw new Error(`단원평가 점수를 못 씀: ${error.message}`);
}
