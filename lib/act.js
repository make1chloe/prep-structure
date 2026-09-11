/** 화면의 손(서버 동작) 하나를 감싸는 한 벌 — 원칙-1. 25개 화면이 같은 것을 25벌로 베껴 쓰고 있었다(2026-09-11 첫 주 돌려보기).
 *
 *  ⚠️ **삼키지 않는다.** 실패는 화면에 우리 말로 뜨고(msg), 서버 자취에는 까닭이 통째로 남는다.
 *     베낀 25벌은 catch 에서 msg 만 만들고 자취를 안 남겼다 — 그래서 「c is not iterable」 처럼
 *     뜻 모를 글이 화면에만 뜨고, 원장님이 「이거 왜 이래?」 하셔도 서버에 볼 것이 없었다.
 *     (원장님 2026-09-10 「오류 삼키지 않기」 — (퍼) 에서 한 화면만 고쳤던 것을 여기서 전부로 넓힌다)
 */
import { revalidatePath } from "next/cache";

const 자취 = (where, e) => { try { console.error(`[손 실패] ${where || "?"}:`, e instanceof Error ? e.stack ?? e.message : e); } catch {} };

/** 손 하나 — 성공 { ok: true, ...돌려준 것 } · 실패 { ok: false, msg }. where 는 자취에 남길 이름(없으면 「?」) */
export async function wrap(fn, where = "") {
  try { return { ok: true, ...(await fn()) }; }
  catch (e) { 자취(where, e); return { ok: false, msg: String(e?.message ?? e) }; }
}

/** 손 하나 + 그 화면 다시 그리기 — done("/today")(async (…) => {…}) 꼴 */
export const done = (path, where = "") => (fn) => async (...a) => {
  try { const r = await fn(...a); revalidatePath(path); return { ok: true, ...(r ?? {}) }; }
  catch (e) { 자취(where || path, e); return { ok: false, msg: String(e?.message ?? e) }; }
};
