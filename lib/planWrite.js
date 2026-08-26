/**
 * **배정·등원·계획 줄 쓰기는 이 한 문** (0165 plan_many — 배정줄수술 v2).
 *
 * 검사(lib/checkWrite)와 짝 — 판 저장의 목록 3그룹(assigned·inclass·
 * plan_next)이 지우고-다시쓰기 대신 제자리-고치기를 탄다. 행 id 가
 * 안 바뀌니 제출물 소속·학생 「다했어요」 가 저장에도 산다.
 * 계약(0165 머리말): 키 없음=무접촉, 배열=전체 교체, 불가침 2칸.
 */
export async function planMany(supabase, reportId, groups) {
  const { data, error } = await supabase.rpc("plan_many", {
    p_report_id: reportId,
    p_groups: groups,
  });
  if (error && error.code === "PGRST202") {
    return { error: "0165 SQL 을 먼저 실행해주세요." };
  }
  if (error) return { error: error.message };
  return { error: null, changed: data?.changed || [] };
}
