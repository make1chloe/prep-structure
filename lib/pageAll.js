/**
 * **1000줄에서 잘리는 것을 막는다.**
 *
 * 원장님 화면 (2026-08-06) — 수업 기록이 **정확히 1000건**으로 나왔다.
 * 노션에서 2130줄을 올리셨는데 1000. 딱 떨어지는 숫자가 수상했다.
 *
 * Supabase(PostgREST)는 한 번에 돌려주는 줄 수에 **상한**이 있고 기본값이
 * **1000**이다. `.limit(20000)` 을 걸어도 서버가 1000에서 자른다.
 * 오류도 안 난다 — 그냥 1000줄만 온다.
 *
 * 그래서 점검 화면이 **자기가 다 본 줄 알고 거짓 답을 냈다.** 「2026년 한 해에
 * 몰려 있습니다」 같은 판단이 앞의 1000줄만 보고 나온 것이다.
 * 세는 화면이 틀리면 그다음 결정이 전부 틀어진다.
 *
 * 나눠서 끝까지 읽는다.
 */

/** 한 번에 가져오는 줄 수 — 서버 상한(보통 1000)보다 작아야 한다 */
const PAGE = 1000;

/**
 * @param build (from, to) => 그 구간을 읽는 supabase 질의
 * @param max   안전장치 — 이보다 많으면 그만 읽는다
 */
export async function pageAll(build, max = 50000) {
  const out = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { rows: out, error };
    const got = data || [];
    out.push(...got);
    // 상한보다 적게 왔으면 마지막 쪽이다
    if (got.length < PAGE) break;
  }
  return { rows: out, error: null };
}
