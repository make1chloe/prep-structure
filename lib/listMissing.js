// **뭐가 빠졌나** — 목록에서 「채워야 할 것이 있는 줄」만 골라내는 규칙.
//
// 원장님 (2026-08-13): 「교재, 재원생, 수업 등등 목록에서 누락된 게 있는
// 목록만 보는 체크박스 만들어줘」.
//
// 까닭 — 빠진 칸은 **조용하다.** 오류가 안 난다. 교재비를 안 적어두면
// 교재 안내 문자에 값이 안 나가고, 학부모 전화가 없으면 리포트가 그 아이만
// 안 나간다. 그런데 목록을 눈으로 훑어서는 「—」 가 어디 있는지 안 보인다
// (백 줄이면 더). 그래서 **기계가 세어준다.**
//
// 무엇을 「빠졌다」고 볼지는 화면마다 다르다 (교재의 필수와 학생의 필수가
// 다르다). 그래서 목록은 화면이 주고, **세는 방법만** 여기서 정한다.

/**
 * 이 줄에서 빠진 것들의 **이름**을 돌려준다.
 *
 * @param row  한 줄
 * @param defs [{ key, label, when? }]
 *   key   볼 칸
 *   label 원장님께 보여줄 이름 (「교재비」)
 *   when  이 줄에 이 칸이 필요한가 — 안 주면 늘 필요하다고 본다.
 *         («단어 교재만 단어범위가 필요하다» 같은 것)
 *
 * 값이 0 인 것은 **빠진 것이 아니다** — 「교재비 0원」 은 적어 넣은 값이다.
 * 빈 칸(null · undefined · "")만 빠진 것으로 본다.
 */
export function missingIn(row, defs = []) {
  if (!row) return [];
  return defs
    .filter((d) => (d.when ? d.when(row) : true))
    .filter((d) => {
      const v = row[d.key];
      if (Array.isArray(v)) return v.length === 0;
      return v === null || v === undefined || String(v).trim() === "";
    })
    .map((d) => d.label);
}

/** 빠진 것이 하나라도 있나 */
export function hasMissing(row, defs = []) {
  return missingIn(row, defs).length > 0;
}

/** 목록 전체에서 빠진 줄이 몇인가 — 체크박스 옆에 적어준다 */
export function countMissing(rows = [], defs = []) {
  return rows.filter((r) => hasMissing(r, defs)).length;
}
