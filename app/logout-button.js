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
.closeout button{background:none;border:0;color:inherit;opacity:.75;
  font-family:inherit;font-size:16px;line-height:1.4;text-decoration:underline;
  cursor:pointer;min-height:44px;padding:.6rem 1rem}
@media (pointer:coarse){ .closeout button{font-size:16px} }
`;
