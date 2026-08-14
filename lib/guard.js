/**
 * **누가 이 일을 해도 되나** — 한 곳에서만 답한다.
 *
 * 원장님 (2026-08-09) — 「하나의 속성으로 작성할 수 있는 걸 여러 군데서
 * 중복으로 작성하거나 불러오거나 하는 경우가 또 있는지 코드 전수검사하고
 * 확인해봐」
 *
 * ── 무엇이 어긋나 있었나 ──────────────────────────────
 *
 * `requireStaff()` 가 **열두 파일에 각자** 적혀 있었고, 그중 넷은 조교를
 * 막고 여덟은 통과시켰다.
 *
 *   조교 통과   ai · videos · students · report/test · schedule/neis
 *               tasks/calendar · schedule/school · students/schedule
 *   조교 막힘   scores/import · settings/note · settings/guide
 *               settings/layout
 *
 * 나누는 것 자체는 맞다 — 설정과 성적 올리기는 조교가 건드리면 안 된다.
 * 잘못된 건 **이름이 같다는 것**이다. 「requireStaff」 라고 적혀 있으면
 * 다음에 화면을 만드는 사람은 아무거나 베껴 오고, 그게 맞는지 아닌지는
 * 아무도 안 본다. 조교에게 열려서는 안 될 자리가 조용히 열린다.
 *
 * 그래서 **뜻이 다르면 이름도 다르게** 두고, 몸통은 하나로 모은다.
 *
 *   requireStaff      원장 · 강사 · 조교   (수업을 돌리는 일)
 *   requireTeacher    원장 · 강사          (설정 · 성적처럼 되돌리기 어려운 일)
 *   requirePrincipal  원장                 (돈 · 계정)
 *
 * ── 화면 막기와는 다른 일이다 ─────────────────────────
 *
 * 주소로 들어오는 것은 미들웨어가 한 번에 막는다 (lib/roles). 여기는
 * **서버 액션**이 자기 손으로 확인하는 자리다 — 액션은 주소가 아니라서
 * 미들웨어를 안 지난다.
 */

import { STAFF_ROLES, TEACHER_ROLES } from "./roles.js";
import { sessionUser } from "./session.js";

async function roleOf(supabase) {
  /**
   * uid 는 쿠키에서 읽는다 (sessionUser — 인증 서버 왕복 없음). 토큰이
   * 진짜인지는 바로 아래 profiles 조회가 검사한다 — 같은 토큰이 실려 가므로
   * 위조면 PostgREST 가 서명에서 거절해 role 이 null 이 되고, 여기서 막힌다.
   */
  const user = await sessionUser(supabase);
  if (!user) return { user: null, role: null };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { user, role: p?.role || null };
}

/**
 * @returns { error, user, role } — error 가 있으면 하면 안 된다
 *
 * **user 를 늘 같이 돌려준다.** 예전에는 어떤 복사본은 돌려주고 어떤 것은
 * 안 돌려줘서, 부르는 쪽이 `guard.user` 를 썼다가 undefined 를 받는 일이
 * 있었다. 안 쓰면 그만이니 늘 담아 보낸다.
 */
async function need(supabase, roles, whoFor) {
  const { user, role } = await roleOf(supabase);
  if (!user) return { error: "로그인이 필요해요.", user: null, role: null };
  if (!roles.includes(role)) return { error: `${whoFor}만 할 수 있어요.`, user, role };
  return { error: null, user, role };
}

/** 원장 · 강사 · 조교 — 수업을 돌리는 일 */
export function requireStaff(supabase) {
  return need(supabase, STAFF_ROLES, "선생님");
}

/** 원장 · 강사 — 설정처럼 되돌리기 어려운 일 (조교는 못 한다) */
export function requireTeacher(supabase) {
  return need(supabase, TEACHER_ROLES, "원장님·강사");
}

/** 원장 — 돈 · 계정 */
export function requirePrincipal(supabase) {
  return need(supabase, ["principal"], "원장님");
}
