// 내 프로필 — **화면마다 다시 안 읽는다** (원칙 6-4와 같은 갈래).
//
// 원장님 (2026-08-14): 「메뉴 이동할 때 페이지 로딩 시간 조금만 더 줄일 수
// 없을까?」 — 걷어낼 것을 다 걷어낸 뒤에도, 화면 스물여덟 곳이 저마다
// `profiles` 한 왕복을 내고 있었다. 이름·역할·메뉴 차례는 분 단위로 바뀌는
// 값이 아니다.
//
// 60초 기억. **메뉴 차례를 고치는 저장은 즉시 지운다**(bustProfile) —
// 「저장했는데 메뉴가 그대로예요」 가 되면 안 된다.
// 서버 메모리라 콜드스타트면 비어 있고, 그때 한 번 다시 읽는다.
// 배포에서만 켠다 — 검사·개발은 늘 새로 읽는다 (menuBadges 와 같은 규칙).

const _memo = new Map();          // uid → { at, value }
const MEMO_MS = 60 * 1000;

export async function cachedProfile(supabase, uid) {
  const memoOn = process.env.NODE_ENV === "production";
  const hit = memoOn && _memo.get(uid);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
  const res = await supabase.from("profiles").select("*").eq("id", uid).single();
  if (!res.error) _memo.set(uid, { at: Date.now(), value: res });
  return res;
}

/** 메뉴 차례·이름을 고친 직후 부른다 — 다음 화면부터 바로 새 값 */
export function bustProfile(uid) {
  _memo.delete(uid);
}
