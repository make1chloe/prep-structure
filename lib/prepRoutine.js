// 내신 자료를 순서대로 낸다
//
// 교재에 루틴이 있듯 내신 자료에도 순서가 있다.
//   이그잼 변형문제 → 분석지 → 워크북
//
// 순서는 세 겹으로 정해진다. 앞의 것이 먼저다.
//   1. 학생 배정에 직접 매긴 순서      (그 학생만 다르게)
//   2. 자료에 매긴 순서                (범위 안에서)
//   3. 종류에 매긴 순서                (기본 루틴)
// 그리고 같은 순서면 **시험일이 급한 것**부터다.

/**
 * 지금 무슨 단계인가 — 화면에 한 줄로 보여줄 말.
 * 자료마다 켜둔 단계만 본다 (분석지는 채점이 없다).
 */
export function stageOf(a = {}) {
  if (a.need_make && !a.made_at) return { key: "make", label: "만들기" };
  if (a.need_print && !a.printed_at) return { key: "print", label: "인쇄" };
  if (a.need_card && !a.card_at) return { key: "card", label: "클래스카드" };
  if (a.need_hand && !a.handed_at) return { key: "hand", label: "배부" };
  if (a.need_solve && !a.solved_at) return { key: "solve", label: "풀이" };
  if (a.need_grade && !a.graded_at) return { key: "grade", label: "채점" };
  return null;
}

/**
 * **자료 준비가 끝났나** (원장 확정 2026-08-28 — 「자료 준비가 끝난 것만
 * 아이 화면에 뜬다」).
 *
 * 새 판단이 아니다. stageOf 의 **앞 세 줄**(만들기·인쇄·클래스카드)이 바로
 * 이 판정이라, 그 셋을 여기서 다시 적지 않고 stageOf 를 불러서 묻는다.
 * 학생별 단계(배부·풀이·채점)는 1 로 채워 지운다 —
 * app/prep/PrepBoard 가 「지금 할 것」을 물을 때 쓰는 것과 같은 손짓이다.
 *
 * 켜둔 단계가 하나도 없는 자료는 준비 끝이다.
 *
 * **SQL 쪽에 같은 뜻의 한 벌이 있다** — public.prep_ready(prep_materials)
 * (0178). RLS 는 SQL 이라 이 함수를 못 부르기 때문이다. 0169 의
 * report_gate() ↔ lib/closeGate isClosed() 와 같은 짝이고, 둘이 어긋나지
 * 않게 scripts/check-dup.mjs 가 세 쌍(need_make/made_at ·
 * need_print/printed_at · need_card/card_at)을 견준다.
 */
const NOT_READY = new Set(["make", "print", "card"]);
export function prepReady(m = {}) {
  const st = stageOf({ ...m, handed_at: 1, solved_at: 1, graded_at: 1 });
  return !st || !NOT_READY.has(st.key);
}

/**
 * **이 자료를 받았나** — 세 갈래.
 *
 *   받음            아이가 「받았어요」를 눌렀다 (또는 원장이 대신 찍었다)
 *   줬는데 안 누름   원장이 배부(handed_at)는 찍었는데 아이는 아직
 *   안 받음         아무것도 없다
 *
 * 「줬다」와 「받았다」를 한 칸으로 묶지 않는다 — 원장이 나눠준 사실과
 * 아이가 손에 받은 사실은 다른 사실이라 표도 칸도 갈라 두었다.
 */
export function receivedState(r, a) {
  if (r?.received_at) return "received";
  if (a?.handed_at) return "handed";
  return "none";
}

export const PREP_RECV_LABEL = { received: "받음", handed: "줬는데 안 누름", none: "안 받음" };
export const PREP_RECV_CLS = { received: "tag-mint", handed: "tag-amber", none: "tag-muted" };

/**
 * 자료 한 줄씩을 화면에 뿌릴 모양으로. lib/video 의 rollup 을 본떴다.
 *
 * **전부 동기 함수다.** await 를 빠뜨려도 조용히 빈 값이 되는 길을 안 만든다
 * (TopBar 에서 await 하나 빠져 배지가 통째로 사라진 적이 있다).
 *
 * **재원생 목록에 없는 배정 줄은 그리지 않는다.** 영상 화면은 이름을 못
 * 찾으면 "?" 로 그려서, 퇴원한 아이가 「? · 안 받음」으로 영영 남는다.
 * 끌 수 없는 숫자를 만들지 않는다.
 */
export function rollupPrep(materials = [], assignments = [], receipts = [], students = []) {
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const recvOf = new Map(receipts.map((r) => [`${r.material_id}|${r.student_id}`, r]));

  return materials.map((m) => {
    const rows = assignments
      .filter((a) => a.material_id === m.id && nameOf.has(a.student_id))
      .map((a) => {
        const r = recvOf.get(`${m.id}|${a.student_id}`);
        return {
          studentId: a.student_id,
          name: nameOf.get(a.student_id),
          state: receivedState(r, a),
          receivedAt: r?.received_at || null,
          byStaff: !!r?.by_staff,
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name, "ko"));

    return {
      ...m,
      ready: prepReady(m),
      stage: stageOf({ ...m, handed_at: 1, solved_at: 1, graded_at: 1 }),
      rows,
      total: rows.length,
      received: rows.filter((r) => r.state === "received").length,
      handed: rows.filter((r) => r.state === "handed").length,
      none: rows.filter((r) => r.state !== "received").length,
    };
  });
}
