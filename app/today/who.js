/**
 * **이 화면을 열 수 있는 사람인가.**
 *
 * ⚠️⚠️ 문지기(`middleware.js`)는 **첫 화면만 고른다 — 역할로 화면을 지키지 않는다.**
 *    그 파일 주석에 실측으로 적혀 있다: 학생 세션으로 `GET /parent` 가 **200** 이었다.
 *    그러니 `/today` 는 **스스로** 봐야 한다. 안 보면 학생 폰에서 원장 화면이 그대로 열린다.
 *
 * ⚠️ 여기서는 서비스 열쇠를 안 쓴다. 로그인 열쇠(anon)로 만든 클라이언트가
 *    `v2.profiles` 의 **자기 줄만** 읽어 역할을 답한다 (`self_read`).
 */
import { cookies } from "next/headers";
import { serverClientFromStore, roleOf, keys } from "../../lib/supabase-server.js";
import { isStaff } from "../../lib/menu.js";

/** 이 화면을 여는 역할 — 원장·강사뿐이다. **낱말은 `lib/menu.js` 한 곳에 있다** */
// ⚠️ 「원장·강사」 낱말을 여기 다시 적지 않는다 (원칙-1 · 어긋난 곳 ⑯).
//    안 하면 무엇이 터지나: 역할 낱말이 바뀌는 날 이 파일만 옛말을 해 문이 잘못 열리거나 잠긴다.

/**
 * @returns { ok:true, profileId, role, name } | { ok:false, why, msg, how:[줄] }
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
        "⚠️ 둘 다 코드로 못 고칩니다. `scripts/check-loginpage.mjs` 가 매번 이 두 줄을 세워 줍니다.",
      ],
    };
  }

  let who;
  try {
    who = await roleOf(serverClientFromStore(await cookies()));
  } catch (e) {
    return { ok: false, why: "read-failed", msg: `로그인을 못 읽었습니다 — ${String(e?.message ?? e).slice(0, 160)}`, how: [] };
  }

  if (!who.user) {
    return { ok: false, why: "no-user", msg: "로그인하지 않았습니다.", how: [] };
  }
  if (who.role == null) {
    // ⚠️ 모르면 **지어내지 않는다.** `lib/supabase-server.js` 가 준 까닭을 그대로 보여준다
    return { ok: false, why: who.why, msg: who.msg || "역할을 못 읽었습니다.", how: [] };
  }
  if (!isStaff(who.role)) {
    return {
      ok: false, why: "not-staff",
      msg: "이 화면은 원장·강사만 엽니다.",
      how: ["학생은 `/me`, 학부모는 `/parent` 가 첫 화면입니다."],
    };
  }
  return { ok: true, profileId: who.user.id, role: who.role, name: who.user.email ?? null };
}
