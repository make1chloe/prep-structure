// 학습 항목 분류 — "use server" 파일에서는 상수를 export 할 수 없어 따로 둔다
//
// 노션 3재원생DB 의 숙제 칸이 그대로 분류가 된다.
//   단어 · 독해 · 문법 · 영작 · 듣기 · 노트 · 내신 · 특강
export const CATEGORIES = ["단어", "독해", "문법", "영작", "듣기", "노트", "내신", "특강", "기타"];

// 색은 6가지뿐이라 몇몇은 겹친다. 옆에 있는 분류끼리만 안 겹치면 된다.
export const CAT_CLS = {
  단어: "tag-amber",
  독해: "tag-sky",
  문법: "tag-lav",
  영작: "tag-mint",
  듣기: "tag-sky",
  노트: "tag-mint",
  내신: "tag-red",
  특강: "tag-amber",
  기타: "tag-muted",
};
