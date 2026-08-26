import { cookies } from "next/headers";

/**
 * **새 판(3때 시트) 스위치** (판세분화-실행지도 §3 — C1).
 *
 * 계정이 아니라 이 브라우저(쿠키)에 담는다 — Help 와 같은 이유(새 칸을
 * 만들면 SQL 을 또 돌리셔야 하는데, 화면 갈아타기에 그럴 것 없다)에
 * 하나가 더 있다: **원장 기기에서만 켜져서** 병행 1주의 자연 격리가 된다.
 *
 * await 를 빼면 안 된다 — components/Help.jsx 의 8/26 사고 기록 참조.
 */
export const PANEL3_COOKIE = "panel3";

export async function panel3On() {
  return (await cookies()).get(PANEL3_COOKIE)?.value === "on";
}
