/** 진도 부호·말 한 곳((어43) · 원장님 9/15 「이걸 초5가 알아보겠냐? 직관적의 뜻 몰라?」 · 확정-51 진도 나무는 표 하나 · 보기 넷) · 01 · 02b · 07 · 08 · 14 · 설정 진도 체크가 같은 것을 쓴다.
 *  ch 는 앱 어디서나 같은 부호(○ ◐ · ⏭) · staff 는 원장 화면 말 · kid 는 아이 화면 말(초5). 부호를 제 손으로 적는 화면은 없다(check-mark) */
export const MARK = Object.freeze({
  done: Object.freeze({ ch: "○", staff: "완료", kid: "다 했어요" }),
  doing: Object.freeze({ ch: "◐", staff: "하는 중", kid: "하고 있어요" }),
  none: Object.freeze({ ch: "·", staff: "아직", kid: "아직" }),
  skip: Object.freeze({ ch: "⏭", staff: "건너뜀", kid: "건너뛰었어요" }),
});
export const markCh = (s) => MARK[s]?.ch ?? MARK.none.ch;
export const markText = (s, who = "staff") => MARK[s]?.[who] ?? MARK.none[who];
/** 아이·원장이 찍는 셋(○ ◐ ·) · 02b · 08 · 손(lib/progress · lib/road)이 같은 것.
 *  셋째 칸은 **눌린 색을 고르는 CSS 열쇠**(.tri button[data-p=…]) — 화면이 손으로 적으면 어긋나 눌림이 안 보인다((어23) 과 같은 종류 · check-mark 가 지킨다) */
export const TRI = Object.freeze([["done", MARK.done.ch, "o"], ["doing", MARK.doing.ch, "d"], ["none", MARK.none.ch, "n"]]);
/** 01 진도 점 · 검사 결과(○ △ ✕)가 단원 점으로(○ 다 함 · ◐ 덜 함 · ✕ 안 함) */
export const CHECK_DOT = Object.freeze({ done: "○", weak: "◐", missing: "✕" });
