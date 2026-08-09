/**
 * **골라 넣을 학교 이름** (0114).
 *
 * 세 화면이 같은 목록을 써야 한다 — 신규 학생 · 상담 · 설문지. 화면마다
 * 따로 읽으면 어느 하나가 조용히 빈 목록이 되고, 그 화면에서만 손으로
 * 적히기 시작한다.
 *
 * 읽는 길이 둘인 까닭:
 *   · 선생님 화면은 표(schools)를 그대로 읽는다
 *   · **설문지(/apply)는 로그인이 없다.** 표는 잠겨 있어서 0114 의 좁은
 *     문(school_names)으로 이름만 받는다
 *
 * **못 읽어도 빈 목록으로 돌려준다.** 목록이 없으면 그냥 적어 넣는 칸이
 * 되고, 접수는 그대로 된다 — 학교 목록 때문에 접수가 막히면 손해가 크다.
 */
export async function schoolNames(supabase, { anon = false } = {}) {
  if (!anon) {
    const { data } = await supabase.from("schools").select("name").order("name");
    if (data?.length) return data.map((r) => r.name).filter(Boolean);
  }
  const { data } = await supabase.rpc("school_names");
  if (Array.isArray(data)) {
    return data.map((r) => (typeof r === "string" ? r : r?.name)).filter(Boolean);
  }
  return [];
}
