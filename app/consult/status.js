// 상담 진행 단계
//
// 왜 actions.js 가 아니라 여기 있나 —
//   actions.js 는 "use server" 파일이라 **async 함수만 export** 할 수 있다.
//   상수를 거기서 내보내면 화면을 열 때 터진다
//   ("A 'use server' file can only export async functions").
//   빌드는 통과해서 더 늦게 발견된다. 그래서 상수는 이렇게 따로 둔다.

export const STATUS = [
  { key: "new", label: "신규 문의", cls: "tag-amber" },
  { key: "scheduled", label: "상담 예정", cls: "tag-sky" },
  { key: "consulted", label: "상담 완료", cls: "tag-lav" },
  { key: "tested", label: "레벨테스트", cls: "tag-lav" },
  { key: "enrolled", label: "등록", cls: "tag-mint" },
  { key: "hold", label: "보류", cls: "tag-muted" },
  { key: "declined", label: "미등록", cls: "tag-muted" },
];
