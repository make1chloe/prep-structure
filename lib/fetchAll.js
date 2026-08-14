/**
 * **천 줄 넘는 조회를 끝까지 받는다** (원장님, 2026-08-14 — 「오늘 진도가
 * 재원생이랑 달라」 를 파보니 이것이었다).
 *
 * Supabase(PostgREST)는 한 번에 **최대 1000줄**만 돌려준다. 오류도 안 나고
 * 1000줄에서 조용히 잘린다. 단원 표처럼 교재가 늘수록 커지는 조회가 여기
 * 걸리면 — 뒤쪽 교재의 단원이 통째로 사라진 것처럼 보인다. 실제로 오늘
 * 수업은 오토보카7을 「진도 기록 전」 이라 하고 재원생은 18/20 이라고
 * 했다. 재원생은 한 학생 것만 읽어 한도 안이었고, 오늘 수업은 모든
 * 학생 것을 한 번에 읽다 잘렸다.
 *
 * 1000줄씩 이어 받아 합친다. 1000줄이 안 되면 한 번으로 끝 — 평소에는
 * 왕복이 늘지 않고, 넘칠 때만 한 번씩 더 돈다 (원칙 6에 어긋나지 않는다).
 *
 * @param makeQuery () => 새 쿼리 빌더. **호출마다 새로 만들어야 한다** —
 *   빌더는 한 번 쓰면 안이 바뀌어 있어 다시 쓸 수 없다.
 *   그리고 **.order() 를 꼭 붙인다** — 순서가 고정이 아니면 페이지 사이에서
 *   같은 줄이 두 번 오거나 빠질 수 있다.
 *   예: fetchAll(() => supabase.from("textbook_units").select("id").in("textbook_id", ids))
 * @returns {{ data, error }} — 보통 쿼리와 같은 모양. 중간에 오류가 나면
 *   그때까지 받은 것을 버리고 오류만 돌려준다 (반쪽 자료가 더 위험하다).
 */
export async function fetchAll(makeQuery, pageSize = 1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: all, error: null };
}
