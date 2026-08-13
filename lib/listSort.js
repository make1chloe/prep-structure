// 목록을 **무엇으로 늘어세우나** — 한 곳에서만 정한다.
//
// 원장님 (2026-08-13): 「기본적으로 목록이라는건 다 정렬 필터가 있어야하는거잖아」.
// 맞다. 그런데 화면마다 따로 만들면 화면마다 규칙이 달라진다 — 재원생에서는
// 학교를 안 적은 아이가 맨 뒤인데 교재에서는 맨 앞인 식이다. 같은 목록인데
// 화면을 옮길 때마다 **눈이 다시 적응해야 한다.**
//
// 그래서 늘어세우는 규칙은 여기 한 곳에 둔다.

/**
 * **빈 값은 언제나 뒤로.**
 *
 * 학교를 아직 안 적은 아이가 맨 위에 오면 목록이 고장 난 것처럼 보인다.
 * 오름·내림을 뒤집어도 **빈 것은 계속 뒤**다 — 「없는 것」은 값이 아니라
 * 값이 없다는 뜻이라, 큰 쪽에도 작은 쪽에도 놓을 자리가 없다.
 */
export function compareBy(a, b, key, dir = "asc") {
  const va = (a?.[key] ?? "").toString().trim();
  const vb = (b?.[key] ?? "").toString().trim();
  if (!va && !vb) return 0;
  if (!va) return 1;
  if (!vb) return -1;

  // 숫자로 적히는 칸(쪽수·교재비·순서)은 글자로 견주면 10이 9보다 앞에 온다
  const na = Number(va);
  const nb = Number(vb);
  const both = va !== "" && vb !== "" && !Number.isNaN(na) && !Number.isNaN(nb);
  const cmp = both ? na - nb : va.localeCompare(vb, "ko");
  return dir === "desc" ? -cmp : cmp;
}

/**
 * @param rows  늘어세울 것
 * @param sort  { key, dir }
 * @param tie   같은 값일 때 견줄 칸 (보통 이름). 없으면 원래 차례 그대로
 */
export function sortRows(rows, sort, tie = "name") {
  const { key, dir = "asc" } = sort || {};
  if (!key) return [...(rows || [])];
  return [...(rows || [])].sort(
    (a, b) => compareBy(a, b, key, dir) || (tie ? compareBy(a, b, tie, "asc") : 0)
  );
}
