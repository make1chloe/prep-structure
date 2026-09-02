/**
 * 로그아웃(**닫는 길**) 단추 — 앱 전체에 **이 한 벌뿐이다** (원칙 1).
 *
 * ⚠️⚠️ 대전제 10 — **홈 화면에 깐 앱에는 주소창도 뒤로가기도 없다.**
 *    그래서 닫는 길은 **언제나 화면 안에** 있어야 한다.
 *    2026-09-02 실측 사고 — 이 단추가 `/login` 에만 있었다. 그런데 문지기는
 *    **역할이 제대로 있는 사람을 `/login` 에서 제 첫 화면으로 되돌린다**(303).
 *    진짜 서버로 재현 — 학부모 세션으로 `GET /login` → `303 · location: /parent`,
 *    되돌아간 `/parent` 의 글자는 「우리 아이 / 준비 중입니다.」뿐이고 `로그아웃` 0개.
 *    → 어머니 폰 하나로 두 아이를 보는 집에서 **계정을 바꿀 길이 아예 없었다.**
 *    (`/login?switch=1` 은 코드 주석 두 줄뿐이라 화면 어디에도 링크가 없었다.)
 *
 * ⚠️ **로그인한 사람이 설 수 있는 화면에는 이 단추를 반드시 넣어라.**
 *    지금 그 화면은 `lib/supabase-server.js` 의 `HOME` 표에 있는 셋이다 —
 *    `/`(원장·강사, 아직 없음) · `/parent` · `/me`.
 *    `scripts/check-loginpage.mjs` ⑬ 가 표를 읽어 **빠진 화면을 그 자리에서 잡는다.**
 *
 * ⚠️ 색을 여기서 지어내지 않는다 — `color:inherit` 다. 어느 화면에 놓이든 그 화면 글자색을
 *    따라가므로 다크모드에서 **흰 바탕에 흰 글씨**가 되는 자리가 없다.
 *    (`app/globals.css` 는 남의 담당이라 여기서 그 값을 베끼지 않는다 — 베끼면 두 벌이 된다.)
 *    `color:inherit` 는 결국 몸통의 `color: var(--fg)` 를 그대로 물려받는다 —
 *    **색 토큰 한 벌**로 말하는 것이지 값을 지어내는 것이 아니다.
 *
 * ⚠️⚠️ **`opacity` 로 흐리게 하지 않는다** (폰-9 · 확정-㉖).
 *    2026-09-03 까지 여기 `opacity:.75` 가 있었다. 「덜 중요한 것」처럼 보이게 하려던 것인데,
 *    이 단추는 **홈 화면에 깐 앱에서 유일하게 나가는 자리**다(대전제-10) — 덜 중요하지 않다.
 *    안 빼면 무엇이 터지나 — 재서 적는다(글자색 `--fg` 를 페이지 바탕 `--bg` 위에 놓고 잰 값):
 *        배색        그냥        opacity:.75 를 씌우면
 *        기본(밝을 때) 16.04:1  →  7.59:1
 *        기본(어두울 때)16.99:1  →  9.83:1
 *        따뜻하게     16.62:1  →  9.54:1
 *        종이         13.27:1  →  **6.52:1**   ← 이 검사가 본문에 요구하는 7:1 아래로 내려간다
 *        밝게         21.00:1  →  10.37:1
 *    「덜 중요함」은 색으로 말한다. 그런데 여기는 덜 중요하지도 않으므로 **몸통 글자색 그대로** 둔다.
 *    ⚠️ 확정-㉖ 의 예외(아이콘)에 기대지 마라 — 이 단추는 아이콘이 하나도 없는 **순수 글씨**다.
 *    `scripts/check-layout.mjs` 의 **1부-나**가 이 파일의 css 문자열을 훑어 그것을 잡는다
 *    (그 전에는 어느 검사도 이 문자열을 안 봤다 — 그래서 아무도 못 잡았다).
 *
 * ⚠️ 글씨 16px · 높이 44px 아래로 내리지 마라 — 16 밑이면 사파리가 화면을 확대하고
 *    닫아도 확대가 남는다. 44 밑이면 손가락으로 못 누른다.
 */
import { signOut } from "./login/actions";

export default function LogoutButton({ label = "다른 사람으로 로그인 · 로그아웃" }) {
  return (
    <form action={signOut} className="closeout">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <button type="submit">{label}</button>
    </form>
  );
}

/* ⚠️ 여기는 template literal 이다 — 안에 홑따옴표 기울임표(backtick)를 쓰면 문자열이 끊겨 빌드가 깨진다 */
const css = `
.closeout{margin:2.5rem 0 calc(1rem + env(safe-area-inset-bottom));text-align:center}
.closeout button{background:none;border:0;color:inherit;
  font-family:inherit;font-size:16px;line-height:1.4;text-decoration:underline;
  cursor:pointer;min-height:44px;padding:.6rem 1rem}
@media (pointer:coarse){ .closeout button{font-size:16px} }
`;
