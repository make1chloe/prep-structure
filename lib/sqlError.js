/** SQL 결과 판별 한 곳(검사-⑪ · (바) 2026-09-08 원장님 「해」) — 저장·삭제·덮어쓰기 뒤에 이 문을 지난다: 오류면 던지고, **바뀐 줄이 0이면 던진다**.
 *  까닭: 권한(RLS)이 조용히 거르면 오류 없이 0줄이 바뀌는데, 전엔 화면이 「저장했습니다」라고 말했다(원장님 9/8 표 「0줄이면 실패」 — 「해」).
 *  줄 수는 { count: "exact" } 의 count 로, 없으면 .select() 가 돌려준 줄 수로(.single() 은 한 줄 · .maybeSingle() 은 있으면 1).
 *  zero: "ok" 는 **훑는 손**(조건으로 여러 줄을 건드려 0줄이 정상일 수 있는 것 — .in · .is · 상태 필터 · ignoreDuplicates)에만 준다 · **콕 집은 손**(.eq("id") · …_id 꼴)은 늘 strict.
 *  check-rows 가 lib 의 쓰기 자리 전부가 이 문(또는 제 손의 줄 수 검사 · 「0줄 허용」 표시)을 지나는지 잰다 */
export const ZERO = "바뀐 줄이 없습니다 — 다시 열어 보세요";
export function changed(r, what, { zero = "fail" } = {}) {
  if (r?.error) { console.error(`[changed] ${what} — ${r.error.message}`); throw new Error(`${what}: ${r.error.message}`); }
  const n = typeof r?.count === "number" ? r.count : Array.isArray(r?.data) ? r.data.length : r?.data ? 1 : 0;
  if (n === 0 && zero !== "ok") { console.error(`[changed] ${what} — 바뀐 줄 0 (권한이 걸렀거나 이미 그 상태)`); throw new Error(`${what}: ${ZERO}`); }   /* 서버 로그에도 남긴다 — 화면 오류는 지나가지만 로그는 남는다 */
  return r?.data ?? null;
}
/** 읽기 도우미 — (사) 파일마다 22벌이던 것을 여기 하나로(원칙-1). 오류면 던지고 data 를 돌려준다(row: 없으면 null · rows: 없으면 []). 쓰기는 changed 로 */
export const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
export const rows = (r, what) => { if (r?.error) throw new Error(`${what}을 못 읽음: ${r.error.message}`); return r?.data ?? []; };
