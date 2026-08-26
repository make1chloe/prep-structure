/**
 * **검사 쓰기는 이 한 문** (0163 check_many — 계획서 v2 §2-4-①).
 *
 * 네 경로(판 저장·대기줄·/check·「안 낸 것 한 번에 ✕」)가 전부 이 함수로
 * 검사행을 쓴다. 계약(0163 머리말): status null=지우기, note null=유지.
 * 경로마다 delete+insert 를 제각각 들고 있던 시절의 「어느 화면에서
 * 찍었는지에 따라 결과가 다른」 병이 여기서 끝난다.
 */
export async function checkMany(supabase, reportId, items) {
  const { data, error } = await supabase.rpc("check_many", {
    p_report_id: reportId,
    p_items: items,
  });
  // 코드가 먼저 뜨고 SQL 이 아직이면 함수가 없다 — 사고가 아니라 안내다
  if (error && error.code === "PGRST202") {
    return { error: "0163 SQL 을 먼저 실행해주세요." };
  }
  if (error) return { error: error.message };
  return { error: null, data };
}
