/**
 * 할일 중요도 — **목록과 칸반이 같은 이름·같은 빛깔을 써야 한다.**
 *
 * ("use server" 파일에서는 상수를 export 할 수 없어 actions.js 가 아니라
 *  여기 따로 둔다 — categories.js 와 같은 까닭이다.)
 */
export const PRIORITY = [
  { v: 0, label: "보통", cls: "tag-muted" },
  { v: 1, label: "중요", cls: "tag-sky" },
  { v: 2, label: "급함", cls: "tag-amber" },
];
