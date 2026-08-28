import ItemsScreen from "@/app/homework/ItemsScreen";

export const dynamic = "force-dynamic";

/**
 * **학습 항목 판** — 「교재」 화면의 탭이다 (원장님 확정, 2026-08-27).
 *
 * 왜 `?view=items` 가 아니라 제 주소인가 (성능수리 4차 — 원장님 「오늘 수업은
 * 느려」 실측):
 *   한 화면 안에서 갈라놓으면 **두 판이 한 꾸러미로 묶인다.** 교재 판만 열어도
 *   학습항목 판(916줄·클라 조각 5벌)이 같이 내려왔다 — 서버가 안 그리는데도
 *   브라우저는 다 받아야 했다. 서버 쪽 `await import()` 로도 안 갈라진다
 *   (실측: 51.7 → 53.2kB gz, 오히려 늘었다 — 조각만 잘게 쪼개진다).
 *   갈라지는 자리는 **길(route)** 뿐이다.
 *
 * `/textbooks/items` 로 둔 까닭: 메뉴가 주소로 「지금 여기」 를 찾는데
 * (lib/menu keyOfPath), `/textbooks/…` 는 이미 「교재」 칸으로 잡힌다. 옛
 * `/homework` 로 되돌리면 그 칸이 조용히 안 켜진다.
 *
 * 판단·조회는 하나도 안 바꿨다 — 판은 여전히 app/homework/ItemsScreen 한 벌이다.
 */
export default function ItemsPage() {
  return <ItemsScreen />;
}
