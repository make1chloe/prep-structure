/** 판 항목의 상태 낱말 한 벌 — DB(v2.day_item.status) 의 CHECK 와 같다: none(아직) · done ○ · weak △ · missing ✕ · inclass. 기본값은 'none'(0052) — 비어 있는 것과 같이 「아직 안 봄」이다.
 *  순수 파일 — 화면(클라이언트)과 서버 둘 다 들여온다 */
export const isUnchecked = (item) => !item?.status || item.status === "none";
export const CHECK = Object.freeze([["done", "○"], ["weak", "△"], ["missing", "✕"]]);
/** 검사 단추의 data-v(목업 01 의 o · w · x) — CSS 눌림 색(.chk button[aria-pressed="true"][data-v=…])이 이 글자를 본다. (어23) 원장님 9/15 「숙제검사 ox는 표시가 안되는데」: 앱이 d·w·m 을 내서 ○·✕ 눌림이 안 보였다 */
export const CHECK_KEY = Object.freeze({ done: "o", weak: "w", missing: "x" });
/** (어51) 검사 단추 ○△✕ 의 이름과 툴팁 · 아이콘만 있는 손이라 마우스를 대면 뜻이 뜬다(원장님 2026-09-16 「아이콘으로만 정보를 표시한경우에는 툴팁 … 설명을 띄워」).
 *  툴팁은 「한 번 더 누르면 해제」까지 말한다(원장님 9/16 「완료미흡미완료 에서 한번 더 누르면 아예 체크안된 상태로 만들어줘」 · 눌러 보기 전에는 알 길이 없는 것) */
export const CHECK_NAME = Object.freeze({ done: "완료", weak: "미흡", missing: "미완료" });
export const CHECK_TIP = Object.freeze({ done: "완료 · 다시 누르면 해제", weak: "미흡 · 다시 누르면 해제", missing: "미완료 · 다시 누르면 해제" });
