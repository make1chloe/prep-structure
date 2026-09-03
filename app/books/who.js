/**
 * **이 화면을 열 수 있는 사람인가.**
 *
 * ⚠️⚠️ 문지기(`middleware.js`)는 **첫 화면만 고른다 — 역할로 화면을 지키지 않는다.**
 *    그 파일 주석에 실측으로 적혀 있다: 학생 세션으로 `GET /parent` 가 **200** 이었다.
 *    그러니 `/books` 도 **스스로** 봐야 한다. 안 보면 학생 폰에서 교재 설정 화면이 그대로 열리고,
 *    거기엔 **모든 아이의 루틴과 교재 상태를 고치는 단추**가 있다.
 *
 * ⚠️ 서비스 열쇠를 안 쓴다. 로그인 열쇠(anon)로 만든 클라이언트가
 *    `v2.profiles` 의 **자기 줄만** 읽어 역할을 답한다.
 *
 * ⚠️ **원장·강사 목록을 여기 다시 적지 않는다**(원칙 1 · 어긋난 곳 ⑯).
 *    `lib/menu.js` 의 `isStaff` 가 유일한 한 벌이다 — 그 함수는 DB `v2.profiles.role` 의
 *    CHECK 에 실제로 있는 낱말(`principal`·`instructor`)로 만들어져 있다.
 *
 * ⚠️ 옛 코드는 `homeFor(role) === HOME.staff` 로 견줬다. 그런데 `HOME.staff` 는
 *    **DB 에 없는 낱말**이라 `undefined` 였고, `homeFor` 도 모르는 역할에 `undefined` 를 줘서
 *    **아무도 원장이 아니거나 아무나 원장이 될 수 있는** 아슬아슬한 자리였다.
 *    안 하면 무엇이 터지나: 이 화면만 옛말을 해 교재·루틴 화면이 통째로 잠기거나 열린다.
 */
import { cookies } from "next/headers";
import { serverClientFromStore, roleOf, keys, SCHEMA } from "../../lib/supabase-server.js";
// ⚠️⚠️ **누가 무엇을 보나 — 판단은 `lib/perm.js` 한 벌이다**(대전제-4 · 원칙-1).
//    여기서 「강사는 …」을 다시 적지 않는다. 코드에는 켬/끔 값이 한 줄도 없다 —
//    켤지 끌지는 원장님이 화면에서 누르셔서 `v2.role_access` 에만 든다(원장님 2026-09-03).
import { loadPerm, blockedBy, PRINCIPAL } from "../../lib/perm.js";
import { isStaff } from "../../lib/menu.js";

export { isStaff };

/**
 * @returns { ok:true, profileId, role } | { ok:false, why, msg, how:[줄] }
 *          `how` 는 **무엇이 없어서 못 열었나**를 화면이 그대로 띄우는 줄들이다 (대전제 0).
 */
export async function staffOnly() {
  const k = keys();
  if (!k.ok) {
    return {
      ok: false, why: "no-keys",
      msg: "로그인 열쇠가 없어 **아무도 못 들어옵니다** — 그래서 이 화면이 비어 있습니다",
      how: [
        "`.env.local` 과 Vercel 에 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 넣어야 합니다 " +
        "(2026-09-02 실측 — URL·서비스키·DATABASE_URL 셋뿐입니다).",
        "그리고 Supabase → Settings → API → Exposed schemas 에 `v2` 를 넣어야 역할을 읽습니다.",
        "⚠️ 둘 다 코드로 못 고칩니다.",
      ],
    };
  }

  let who, sb;
  try {
    // ⚠️ 클라이언트를 **붙잡아 둔다.** 아래에서 「누가 무엇을 보나」를 같은 문으로 읽는다 —
    //    새로 만들면 쿠키를 두 번 풀고 조회도 한 번 더 는다(§속도).
    sb = serverClientFromStore(await cookies());
    who = await roleOf(sb);
  } catch (e) {
    return { ok: false, why: "read-failed", msg: `로그인을 못 읽었습니다 — ${String(e?.message ?? e).slice(0, 160)}`, how: [] };
  }

  if (!who.user) return { ok: false, why: "no-user", msg: "로그인하지 않았습니다.", how: [] };
  if (who.role == null) {
    // ⚠️ 모르면 **지어내지 않는다.** `lib/supabase-server.js` 가 준 까닭을 그대로 보여준다
    return { ok: false, why: who.why, msg: who.msg || "역할을 못 읽었습니다.", how: [] };
  }
  if (!isStaff(who.role)) {
    return {
      ok: false, why: "not-staff",
      msg: "이 화면은 원장·강사·조교만 엽니다.",
      how: ["학생은 `/me`, 학부모는 `/parent` 가 첫 화면입니다."],
    };
  }
  /* ⚠️⚠️ **메뉴에서 빼는 것만으로는 못 막는다 — 주소를 치면 그대로 열린다.**
   *    문지기(`middleware.js`)는 첫 화면만 고르고 역할로 화면을 안 지킨다. 그래서 여기서 본다.
   *  ⚠️ 원장은 묻지 않는다(`canFor` 가 늘 참) → **조회를 아예 안 한다**(§속도).
   *  ⚠️ 못 읽으면 **기본값으로 돌지 않는다** — 기본값이 없다. 「못 읽었다」로 막고 그대로 말한다.
   *  ⚠️ 「아직 안 정하셨습니다」(unset)와 「꺼 두셨습니다」(off)를 **다르게** 말한다 —
   *     글은 `lib/perm.js` 의 `blockedBy()` 한 벌이 짓는다(원칙-1).
   *  ⚠️ 막힌 화면에도 **나가는 길**이 있다(대전제-10): 메뉴 줄의 「🚪 나가기」는 늘 그려지고,
   *     `how` 줄에도 그 길을 적는다. */
  const 권한 = who.role === PRINCIPAL ? { rows: null, why: null } : await loadPerm(sb.schema(SCHEMA));
  const 문 = blockedBy(who.role, "page.books", 권한.rows, 권한.why);
  if (!문.ok)
    return { ok: false, why: `perm-${문.state}`, msg: 문.msg, how: 문.how, role: who.role };

  return { ok: true, profileId: who.user.id, role: who.role, perm: 권한.rows, permWhy: 권한.why };
}
