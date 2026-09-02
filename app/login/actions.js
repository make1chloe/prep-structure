"use server";
/**
 * 로그인 서버 동작 — 화면이 받은 글자를 **판단에 넘기고**, 끝나면 역할별 첫 화면으로 보낸다.
 *
 * ⚠️ 대전제 12 — 여기엔 비밀번호를 **만들거나 바꾸거나 초기화하는 함수가 하나도 없다.**
 *    앞으로도 넣지 마라. `updateUser` · `resetPasswordForEmail` · `signUp` 을 한 줄 쓰는 순간
 *    운영 중인 그 아이 계정이 그날 저녁 안 열린다 (`scripts/check-loginpage.mjs` 가 막는다).
 *
 * ⚠️ **속 도메인을 여기서 붙이지 마라.** 붙이는 자리는 `lib/auth.js` 의 `INTERNAL_DOMAIN` 하나뿐이다.
 *    (그 글자를 여기 적어 두는 것조차 안 된다 — `scripts/check-auth.mjs` ⑥-2 가 주석까지 훑는다.)
 *    두 곳이 되면 한쪽만 고쳐져, 그날부터 이 화면으로 들어온 사람만 로그인이 안 되고
 *    원장님 화면은 멀쩡해서 며칠간 아무도 모른다.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { toLoginEmail } from "@/lib/auth";
import { serverClientFromStore, roleOf, homeFor, knownRole, keys } from "@/lib/supabase-server";

/**
 * 로그인한다.
 * @returns 실패했을 때만 `{ error, id }` — **비밀번호는 절대 안 돌려보낸다**
 *          (돌려보내면 브라우저 기록·오류 보고에 그대로 남는다)
 */
export async function signIn(prev, form) {
  const typed = String(form?.get("id") ?? "");
  const pw = String(form?.get("pw") ?? "");
  const back = (error) => ({ error, id: typed });

  if (!keys().ok) {
    // ⚠️ 2026-09-02 실측 — 지금 여기로 온다. ANON 열쇠가 없어서 아무도 못 들어온다
    return back("앱 설정이 아직 덜 됐습니다. 원장님께 알려주세요. (로그인 열쇠 없음)");
  }

  const conv = toLoginEmail(typed); // ← 아이디·전화번호·이메일 세 갈래를 여기서 가른다
  if (!conv.ok) return back(사람말로(conv));
  if (!pw) return back("비밀번호를 입력해 주세요.");

  const supabase = serverClientFromStore(await cookies());
  const { error } = await supabase.auth.signInWithPassword({
    email: conv.email,
    password: pw,
  });
  if (error) return back(왜안됐나(error));

  // ⚠️⚠️ **`why`·`msg` 를 버리지 마라.** 판단은 까닭을 정확히 돌려주는데(`no-row` ·
  //    `v2-not-exposed` · `read-failed`), 예전에는 `role` 만 꺼내 쓰고 나머지를 버렸다.
  //    그러면 역할 없는 사람이 **아무 말 없이** `/` 로 가서 404 를 보고, 화면엔 오류도 안내도
  //    없어 며칠간 아무도 모른다 (대전제 0 — 안 되는 것은 안 된다고 말한다).
  const { role, why } = await roleOf(supabase);
  if (!knownRole(role)) return back(역할이없다(why));

  // ⚠️ `redirect()` 는 예외를 던져서 일한다. try 안에 넣으면 **로그인 성공이 실패로 보인다.**
  //    그래서 여기, 어떤 try 밖에서 부른다.
  redirect(homeFor(role));
}

/**
 * 로그인은 됐는데 역할을 못 읽었다 — **보내지 않고 화면에 세운다.**
 * 쿠키는 이미 섰으므로 그 사람은 로그인된 채다. 원장님이 `v2.profiles` 줄을 넣거나
 * 스키마 노출을 켜면 **다음 로그인에 저절로 풀린다.**
 */
function 역할이없다(why) {
  if (why === "no-row")
    return "로그인은 됐지만 이 계정에 역할이 없습니다. 원장님께 알려주세요. (프로필 줄 없음)";
  if (why === "v2-not-exposed")
    return "앱 설정이 아직 덜 됐습니다. 원장님께 알려주세요. (v2 스키마 노출 안 됨)";
  return `로그인은 됐지만 역할을 못 읽었습니다. 원장님께 알려주세요. (${why || "까닭 모름"})`;
}

/**
 * 이 기기에서 나간다.
 * ⚠️ 비밀번호를 건드리는 일이 아니다 — 쿠키만 지운다 (대전제 12 와 무관).
 *    다른 화면에 아직 로그아웃 단추가 없어서, 계정이 꼬인 폰의 **유일한 탈출구**다.
 */
export async function signOut() {
  if (!keys().ok) redirect("/login");
  const supabase = serverClientFromStore(await cookies());
  await supabase.auth.signOut();
  redirect("/login");
}

/** 아이디를 못 알아들었을 때 — 판단이 준 글(`msg`)을 그대로 쓰되, 처음 온 사람 말로 다듬는다 */
function 사람말로(conv) {
  if (conv.why === "empty") return "아이디를 입력해 주세요.";
  if (conv.why === "bad-phone")
    return "전화번호는 010 으로 시작하는 숫자 10~11자리입니다. (예: 01012345678)";
  return conv.msg || "아이디를 다시 확인해 주세요.";
}

/**
 * 인증 서버가 준 영어를 원장님·학부모가 읽을 말로 바꾼다.
 * ⚠️ 원문을 그대로 보여주지 않는다 — 영어도 문제지만, 안쪽 사정이 화면에 새어 나온다.
 * ⚠️ 「그런 아이디는 없다」와 「비밀번호가 틀렸다」를 **가르지 않는다.**
 *    가르면 아무나 전화번호를 넣어 보며 누가 이 학원 학부모인지 알아낼 수 있다.
 */
function 왜안됐나(error) {
  const m = String(error?.message ?? "");
  if (/invalid login credentials|invalid_credentials/i.test(m))
    return "아이디나 비밀번호가 맞지 않습니다. 아래 「아이디가 뭔가요?」를 열어 확인해 주세요.";
  if (/email not confirmed/i.test(m)) return "계정이 아직 열리지 않았습니다. 원장님께 알려주세요.";
  if (/rate limit|too many/i.test(m)) return "너무 여러 번 시도했습니다. 1분 뒤에 다시 해주세요.";
  if (/fetch|network|timeout/i.test(m)) return "서버에 닿지 못했습니다. 인터넷을 확인하고 다시 해주세요.";
  return "로그인이 되지 않았습니다. 원장님께 알려주세요.";
}
