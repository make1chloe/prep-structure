import { cookies } from "next/headers";

/**
 * **설명 문구는 접어둔다** (원장님, 2026-08-07 — 「정보과잉인 경우 없는지
 * 점검하고 개선해」).
 *
 * 화면마다 제목 밑에 「이 화면은 이런 곳입니다」 가 서너 줄씩 붙어 있었다.
 * 처음 여는 날에는 도움이 된다. 그런데 원장님은 이 화면들을 **매일** 여신다.
 * 백 번째 여는 날에도 같은 서너 줄이 제목과 정작 볼 것 사이를 가로막는다.
 *
 * **지우지는 않는다.** 조교 선생님이 새로 오시거나 몇 달 만에 여는 화면
 * (내신 대비 · 노션 이관) 에서는 그 설명이 여전히 유일한 안내다. 그래서
 * 켜고 끄는 스위치를 하나 두고, 기본은 꺼둔다.
 *
 * 계정이 아니라 **이 브라우저**에 저장한다 (쿠키). 새 칸을 만들면 SQL 을
 * 또 돌리셔야 하는데, 글씨를 보이고 감추는 일에 그럴 것까지는 없다.
 *
 * 학생·학부모 화면에는 쓰지 않는다 — 거기서는 설명이 곧 안내다.
 */
export const HELP_COOKIE = "help";

// **await 를 빼먹으면 안 되는 자리** — Next 15+에서 cookies() 는
// Promise 다. 여기 한 줄의 동기 호출이 8/26 Next 16 배포 사고의 전부였다:
// Help 를 쓰는 화면(= 거의 전부)이 서버 렌더에서 터져 백지가 됐고,
// 안 쓰는 세 화면(대시보드·오늘수업·계획)만 살았다. Next 14 에서도
// await 는 무해하다 (동기값을 await 하면 그대로 나온다).
export async function helpOn() {
  return (await cookies()).get(HELP_COOKIE)?.value === "on";
}

export default async function Help({ children }) {
  if (!(await helpOn())) return null;
  return children;
}
