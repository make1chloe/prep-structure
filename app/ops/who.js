/**
 * **이 화면을 열 수 있는 사람인가.**
 *
 * ⚠️⚠️ 문지기(`middleware.js`)는 **첫 화면만 고른다 — 역할로 화면을 지키지 않는다.**
 *    그 파일 주석에 실측으로 적혀 있다: 학생 세션으로 `GET /parent` 가 **200** 이었다.
 *    그러니 `/ops` 는 **스스로** 봐야 한다. 안 보면 학생 폰에서
 *    **수강료·상담일지·학부모 전화번호가 그대로 열린다.** 이 화면이 앱에서 제일 민감하다.
 *
 * ⚠️ 여기서는 서비스 열쇠를 안 쓴다. 로그인 열쇠(anon)로 만든 클라이언트가
 *    `v2.profiles` 의 **자기 줄만** 읽어 역할을 답한다 (`self_read`).
 *
 * ⚠️ **원칙 1 위반을 알고 있다** — 이 문지기가 `app/today/who.js` · `app/page.js` 와
 *    **세 벌**이다. 판단(`roleOf`)은 `lib/supabase-server.js` 한 곳이지만 감싼 껍질이 셋이다.
 *    `lib/` 은 지금 내가 손대면 안 되는 자리라 여기 적어 둔다 — 보고의 `notes` 에도 올렸다.
 */
import { cookies } from "next/headers";
import { serverClientFromStore, roleOf, keys } from "../../lib/supabase-server.js";

/** 이 화면을 여는 역할 — 원장·강사뿐이다 */
const STAFF = new Set(["principal", "instructor"]);

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
        "`.env.local` 과 Vercel 에 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 넣어야 합니다.",
        "그리고 Supabase → Settings → API → Exposed schemas 에 `v2` 를 넣어야 역할을 읽습니다.",
      ],
    };
  }

  let who;
  try {
    who = await roleOf(serverClientFromStore(await cookies()));
  } catch (e) {
    return { ok: false, why: "read-failed", msg: `로그인을 못 읽었습니다 — ${String(e?.message ?? e).slice(0, 160)}`, how: [] };
  }

  if (!who.user) return { ok: false, why: "no-user", msg: "로그인하지 않았습니다.", how: [] };
  if (who.role == null) {
    // ⚠️ 모르면 **지어내지 않는다.** `lib/supabase-server.js` 가 준 까닭을 그대로 보여준다
    return { ok: false, why: who.why, msg: who.msg || "역할을 못 읽었습니다.", how: [] };
  }
  if (!STAFF.has(who.role)) {
    return {
      ok: false, why: "not-staff",
      msg: "이 화면은 원장·강사만 엽니다 — 수강료·상담일지가 여기 있습니다.",
      how: ["학생은 `/me`, 학부모는 `/parent` 가 첫 화면입니다."],
    };
  }
  return { ok: true, profileId: who.user.id, role: who.role };
}
