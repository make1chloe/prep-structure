"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * 한 학생의 성적 — **재원생 정보에서 곁들여 보는 것** (원장님, 2026-08-06 —
 * 「재원생 정보에도 성적이 연결되어야 해」).
 *
 * **읽기만 한다.** 넣고 고치는 것은 `/scores` 한 곳이다 — 두 군데서 넣게
 * 하면 두 군데가 어긋난다.
 *
 * 문항별 오답 개수도 같이 센다. 「85점」 보다 「85점 · 틀린 7문항」 이
 * 상담에서 할 말을 정해준다.
 */
export async function listStudentScores(studentId) {
  if (!studentId) return { rows: [], error: null };
  const supabase = createClient();

  const { data, error } = await supabase
    .from("scores")
    .select("id, kind, term, taken_on, raw_score, full_score, grade, percentile, note, source")
    .eq("student_id", studentId)
    .order("taken_on", { ascending: false })
    .limit(200);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { rows: [], error: "0072 SQL 을 먼저 실행해주세요." };
    }
    return { rows: [], error: error.message };
  }
  const rows = data || [];
  if (rows.length === 0) return { rows: [], error: null };

  // 문항별 오답 개수 — 0097 전이면 그냥 0 으로 둔다 (성적은 그대로 보여야 한다)
  const { data: items } = await supabase
    .from("score_items")
    .select("score_id")
    .eq("wrong", true)
    .in("score_id", rows.map((r) => r.id));
  const n = new Map();
  (items || []).forEach((x) => n.set(x.score_id, (n.get(x.score_id) || 0) + 1));

  return { rows: rows.map((r) => ({ ...r, wrongCount: n.get(r.id) || 0 })), error: null };
}
