"use client";
/**
 * 로그인 화면.
 *
 * ⚠️ 이 화면은 **처음 여는 사람이 보는 화면이다.** 실측 2026-09-02 —
 *      학부모 20명 중 **한 번이라도 로그인한 사람 0명**, 학생 21명 중 **3명**.
 *    그래서 「비밀번호 찾기」보다 **「내 아이디가 뭔지」**를 먼저, 크게 적는다.
 *
 * ⚠️ 대전제 12 — 비밀번호를 **바꾸거나 초기화하는 자리를 만들지 않는다.**
 *    임시 비밀번호는 하나뿐이고 초기화는 곧 `must_change_pw` 를 켜는 일이라,
 *    켜는 순간 그 아이는 **그날 지금 쓰는 앱에 못 들어간다.**
 *    그래서 이 화면엔 「비밀번호 찾기」가 아예 없다 — 못 하는 것은 못 한다고 적는다.
 *
 * ⚠️ 폰 규칙 (안 지키면 아이폰에서 화면이 확대된 채 굳거나 튄다)
 *    · 입력 글씨 **16px 이상** — 작으면 사파리가 확대하고, 닫아도 확대가 남는다
 *    · `autoFocus` **없음** — 열자마자 자판이 튀어 안내 글이 화면 밖으로 밀린다
 *    · `position:fixed` 스크롤 잠금 · `history.pushState` · `createPortal` · `alert`/`confirm` **안 쓴다**
 */
import { useActionState } from "react";
import { signIn, signOut } from "./actions";

const 처음 = { error: "", id: "" };

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, 처음);

  return (
    <main className="wrap">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <h1 className="brand">클로이영어</h1>
      <p className="lead">
        처음 들어오시나요? 아래 <b>「아이디가 뭔가요?」</b>를 먼저 열어 보세요.
      </p>

      <form action={action} className="card">
        <label className="lab" htmlFor="id">
          아이디
        </label>
        <input
          id="id"
          name="id"
          type="text"
          defaultValue={state.id}
          placeholder="전화번호 또는 chloe0000"
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          required
        />

        <label className="lab" htmlFor="pw">
          비밀번호
        </label>
        <input
          id="pw"
          name="pw"
          type="password"
          autoComplete="current-password"
          enterKeyHint="go"
          required
        />

        {state.error ? (
          <p className="err" role="alert" aria-live="assertive">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending}>
          {pending ? "들어가는 중…" : "로그인"}
        </button>
      </form>

      <details className="help">
        <summary>아이디가 뭔가요?</summary>
        <dl>
          <dt>학부모님</dt>
          <dd>
            학원에 알려주신 <b>전화번호</b>입니다. <code>-</code> 없이 숫자만 칩니다.
            <br />
            예: <code>01012345678</code>
          </dd>
          <dt>학생</dt>
          <dd>
            <code>chloe</code> + 학원에 등록된 <b>전화번호 뒤 4자리</b>입니다.
            <br />
            예: 뒤 4자리가 0515 면 <code>chloe0515</code>
            <br />
            {/* ⚠️ 지어낸 예외가 아니다 — 실측 2026-09-02: `v2.profiles` 에 `chloe8729-2` 가 있고
                `auth.users` 에 `chloe####-#` 계정이 2개 있다. 형제라 뒤 4자리가 겹쳐 옛 앱이 붙였다.
                이 줄이 없으면 그 아이들은 형·누나 아이디를 치게 되고 비밀번호가 맞을 리 없는데,
                오류 글이 「아이디가 뭔가요?」로 **틀린 규칙을 다시 가리킨다.** */}
            형제·자매가 같이 다녀 <b>뒤 4자리가 겹치는 아이</b>는 끝에 <code>-2</code> 가 붙어
            있습니다. <code>chloe0515</code> 로 안 되면 <code>chloe0515-2</code> 를 쳐 보세요.
          </dd>
          <dt>원장·강사</dt>
          <dd>쓰시던 이메일 주소를 그대로 칩니다.</dd>
        </dl>
      </details>

      <details className="help">
        <summary>아이디나 비밀번호를 모르겠어요</summary>
        <p>
          <b>이 화면에서는 찾아드릴 수 없습니다.</b> 원장님께 문자로 여쭤보세요.
        </p>
        {/* ⚠️ 여기 까닭을 사실대로 적어라. 예전 글은 「앱에 전화번호가 저장되어 있지 않아(48명 전원)」
            였는데 **틀렸다.** 실측 2026-09-02 — `v2.profiles.phone` 이 48명 전원 빈 것은 맞지만,
            **`login_id` 에 학부모 20명의 전화번호가 그대로 들어 있고** 아이디가 있는 사람이 41명이다.
            그 글대로면 ① 학부모는 「학원이 내 번호도 안 갖고 있구나」로 읽고
            ② 원장님은 48명 번호를 손으로 다시 모아야 한다고 믿는다 — 없던 원장 일이 생긴다(대전제 3).
            못 하는 진짜 까닭은 「이 화면 앞에 선 사람이 누구인지 확인할 길이 없다」다. */}
        <p className="why">
          까닭 — 이 화면은 <b>지금 계신 분이 누구인지 확인할 길이 없어</b> 아이디를 자동으로
          알려드릴 수 없습니다. 원장님은 앱에서 바로 찾아 확인해 드릴 수 있습니다. 비밀번호는 이
          화면에서 바꾸거나 초기화하지 않습니다.
        </p>
      </details>

      {/* ⚠️ 다른 화면(`/me`·`/parent`)에 아직 로그아웃 단추가 없다. 계정이 꼬인 폰의 유일한 탈출구다.
          · **역할을 못 읽은 사람**은 이제 문지기가 여기 세워 두므로 이 단추까지 온다 (404 에 안 갇힌다).
          · **역할이 제대로 있는 사람**은 여전히 제 첫 화면으로 되돌아가서, 홈 화면에 깐 앱에서는
            `/login?switch=1` 을 칠 주소창이 없어(대전제 10) **계정을 못 바꾼다.**
            그 자리는 `/me`·`/parent` 에 로그아웃 단추가 들어가야 풀린다 — 그 화면 담당 몫이다. */}
      <form action={signOut} className="out">
        <button type="submit">이 기기에 다른 사람이 로그인되어 있나요? · 로그아웃</button>
      </form>
    </main>
  );
}

/* 글씨 크기만은 손대지 마라 — 위 ⚠️ 폰 규칙 참고 */
const css = `
/* ⚠️⚠️ 바탕색을 여기서 반드시 정한다. 글자색만 바꾸면 다크모드에서 흰 바탕에 흰 글씨가 된다.
   ⚠️ 여기는 template literal 안이다 — 홑따옴표 기울임표(backtick)를 쓰면 문자열이 끊겨 빌드가 깨진다.
   실측 2026-09-02(브라우저가 계산한 값) — 예전에는 이 화면이 color-scheme 가 normal 이고
   html·body·.wrap 바탕이 전부 rgba(0,0,0,0)(투명)이었다. 그런데 아래 다크 블록은
   글씨만 #e6ecf2 로 바꿨다. color-scheme 를 dark 로 안 켜면 브라우저 기본 바탕은
   흰색이므로, 다크모드 폰에서 제목·「아이디」·「비밀번호」·접기 두 개가 전부 안 보인다
   (대비 약 1.19:1). 입력칸만 짙은 상자로 떠서, 처음 여는 학부모는 이름표 없는 검은 상자를 본다.
   하필 이 화면의 대상이 한 번도 로그인한 적 없는 학부모 20명이다.
   app/layout.js 는 바탕색을 안 정한다 (themeColor 는 브라우저 띠 색이지 페이지 바탕이 아니다).
   → 두 겹으로 막는다: ① color-scheme 선언 ② html·body 에 명시된 바탕색(다크에서 같이 뒤집는다) */
:root{color-scheme:light dark}
html,body{background:#ffffff}
.wrap{max-width:26rem;margin:0 auto;padding:2.5rem 1.25rem calc(2rem + env(safe-area-inset-bottom));
  font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  color:#12181f;line-height:1.6}
.brand{font-size:1.6rem;font-weight:800;margin:0 0 .4rem;letter-spacing:-.02em}
.lead{margin:0 0 1.5rem;font-size:.95rem;color:#4a5561}
.card{display:flex;flex-direction:column;gap:.35rem}
.lab{font-size:.9rem;font-weight:700;margin-top:.7rem}
.card input{font-size:17px;padding:.8rem .85rem;border:1px solid #c3ccd6;border-radius:.6rem;
  background:#fff;color:inherit;width:100%;box-sizing:border-box;-webkit-appearance:none}
.card input:focus{outline:2px solid #2f6fd0;outline-offset:1px;border-color:#2f6fd0}
.card button{margin-top:1.2rem;min-height:52px;font-size:17px;font-weight:800;color:#fff;
  background:#1f5fbf;border:0;border-radius:.6rem;cursor:pointer}
.card button:disabled{background:#8fa6c6;cursor:default}
.err{margin:.8rem 0 0;padding:.7rem .8rem;border-radius:.5rem;font-size:.92rem;
  background:#fdeceb;color:#9d2216;border:1px solid #f3bdb6}
.help{margin-top:1.4rem;border-top:1px solid #e2e7ec;padding-top:.9rem;font-size:.92rem}
.help summary{cursor:pointer;font-weight:700;padding:.35rem 0;min-height:32px}
.help dl{margin:.5rem 0 0}
.help dt{font-weight:700;margin-top:.7rem}
.help dd{margin:.15rem 0 0;color:#4a5561}
.help p{margin:.5rem 0 0}
.help .why{color:#4a5561;font-size:.88rem}
.help code{background:#eef1f5;border-radius:.3rem;padding:.05rem .35rem;font-size:.95em}
.out{margin-top:2rem;text-align:center}
.out button{background:none;border:0;color:#6b7683;font-size:.85rem;text-decoration:underline;
  cursor:pointer;padding:.6rem;min-height:44px}
/* ⚠️ 폰(손가락)에서 16px 밑으로 내려가면 사파리가 화면을 확대하고, 닫아도 확대가 남는다 */
@media (pointer:coarse){
  .card input{font-size:17px}
  .card button{font-size:17px}
}
@media (prefers-color-scheme:dark){
  /* ⚠️ 이 줄을 지우지 마라 — 글자색만 남으면 흰 바탕에 흰 글씨가 된다 (위 ⚠️⚠️ 참고).
     색은 app/layout.js 의 다크 themeColor(#0D1219)와 같은 값이라 띠와 화면이 안 갈린다. */
  html,body{background:#0d1219}
  .wrap{color:#e6ecf2}
  .lead,.help dd,.help .why{color:#a3b0bd}
  .card input{background:#161d26;border-color:#38434f}
  .card button{background:#3b7ee0}
  .card button:disabled{background:#3a4756}
  .err{background:#3a1a17;color:#ffb9b0;border-color:#6b2b24}
  .help{border-top-color:#28313b}
  .help code{background:#232c36}
  .out button{color:#8d99a6}
}
`;
