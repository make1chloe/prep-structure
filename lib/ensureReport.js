/**
 * **그 날 리포트 한 줄을 확보한다** (선행공사 계획서 v2 §2-3 — B-5).
 *
 * daily_reports 에 행을 「만드는」 upsert 는 이 함수만 쓴다 — 시트·액션의
 * 다른 쓰기는 전부 부분 update 다. 만들기가 여러 벌이면 한 벌만 고쳐지고
 * (실제로 arrival 판은 오류 문구를 삼키고 late 판은 돌려주고 있었다),
 * 반환 모양이 제각각이라 호출부가 실패를 못 본다.
 *
 * **단건 전용.** 반 전체를 한 번에 만드는 자리(plan·import)는 인원수만큼
 * 왕복이 늘어나므로 이 함수를 돌리지 않는다 — 그쪽은 벌크 upsert 그대로
 * (검토 F-1: 「6곳 통일」은 허수였다 — 진짜 단건은 2곳뿐).
 */
export async function ensureReport(supabase, studentId, date) {
  const { data: found } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();
  if (found?.id) return { id: found.id, error: null };

  const { data, error } = await supabase
    .from("daily_reports")
    .upsert({ student_id: studentId, date }, { onConflict: "student_id,date" })
    .select("id")
    .single();
  return { id: data?.id || null, error: error ? error.message : null };
}
