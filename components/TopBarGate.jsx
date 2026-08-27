"use client";

import { usePathname } from "next/navigation";
import { canOpen } from "@/lib/roles";

/**
 * **선생님 메뉴를 붙이지 않는 화면**이 있다 — 학생(/me) · 학부모(/parent) ·
 * 로그인 · 신규 문의 양식 · 앱 담기 안내.
 *
 * 전에는 화면마다 `<TopBar>` 를 손으로 적었으니 안 적으면 그만이었다. 이제
 * 뿌리 레이아웃이 한 번 그리므로 **안 붙일 곳을 여기서 가른다.**
 *
 * 목록을 새로 적지 않는다 — 그 목록은 이미 lib/roles 에 있다(OPEN_TO_ALL,
 * 「학생·학부모도 열 수 있는 곳」). 두 벌로 적으면 화면 하나 늘릴 때
 * 한쪽만 고치게 되고, 그러면 원장님이 미리보기로 여신 학생 화면 위에
 * 선생님 메뉴가 얹힌다 (원칙 1).
 *
 * 판정을 브라우저에서 하는 까닭은 NavGrid 와 같다 — 레이아웃은 화면을
 * 옮겨도 다시 안 그려지므로, 서버에서 한 번 정하면 그대로 굳는다.
 * usePathname 은 서버가 처음 그릴 때도 맞는 주소를 주므로 깜빡임은 없다.
 */
export default function TopBarGate({ children }) {
  const path = usePathname();
  // canOpen(null, …) = 「역할을 몰라도 열리는 곳」 = 선생님 화면이 아닌 곳
  if (canOpen(null, path || "/")) return null;
  return <header className="topbar">{children}</header>;
}
