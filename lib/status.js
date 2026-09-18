/** 판 항목의 상태 낱말 한 벌 — DB(v2.day_item.status) 의 CHECK 와 같다: none(아직) · done ○ · weak △ · missing ✕ · inclass. 기본값은 'none'(0052) — 비어 있는 것과 같이 「아직 안 봄」이다.
 *  순수 파일 — 화면(클라이언트)과 서버 둘 다 들여온다 */
export const isUnchecked = (item) => !item?.status || item.status === "none";
/** (어82) 검사 단추의 기호 — 원장님 2026-09-18 「기호색깔을 박스랑 통일해줘」.
 *  **그림(이모지)은 제 색을 가지고 있어 상자 색을 못 따라간다** — ⭕ 는 어디에 놓아도 빨갛고 상자는 초록이었다.
 *  그래서 넷을 **글자**로 되돌리고 CSS 가 상자와 같은 색을 입힌다(누르기 전엔 상자 색 · 누르면 상자가 채워지고 글자는 희어진다).
 *  모양(동그라미 · 세모 · 엑스)은 그대로다 — 2026-09-17 「동그라미 세모 엑스 도 이모지로 바꾸고」를 **이 넷에 한해** 되돌린 것이고,
 *  목업 01 은 처음부터 이 글자였다(원칙-1 — 목업과 앱이 두 벌이던 것도 같이 맞춘다).
 *  ⚠️ 그림이 아니라 글자라 여기가 곧 한 곳이다 — 화면은 이것을 가져다 쓰고 제 손으로 안 적는다(check-emoji 가 지킨다) */
export const CHECK = Object.freeze([["done", "○"], ["weak", "△"], ["missing", "✕"]]);
/** 넷째 손 반려 — 「돌려보낸다」. 남색 상자와 같은 남색 글자가 된다 */
export const REJECT_MARK = "←";
/** 검사 단추의 data-v(목업 01 의 o · w · x) — CSS 눌림 색(.chk button[aria-pressed="true"][data-v=…])이 이 글자를 본다. (어23) 원장님 9/15 「숙제검사 ox는 표시가 안되는데」: 앱이 d·w·m 을 내서 ○·✕ 눌림이 안 보였다 */
export const CHECK_KEY = Object.freeze({ done: "o", weak: "w", missing: "x" });
/** (어51) 검사 단추 ○△✕ 의 이름과 툴팁 · 아이콘만 있는 손이라 마우스를 대면 뜻이 뜬다(원장님 2026-09-16 「아이콘으로만 정보를 표시한경우에는 툴팁 … 설명을 띄워」).
 *  툴팁은 「한 번 더 누르면 해제」까지 말한다(원장님 9/16 「완료미흡미완료 에서 한번 더 누르면 아예 체크안된 상태로 만들어줘」 · 눌러 보기 전에는 알 길이 없는 것) */
export const CHECK_NAME = Object.freeze({ done: "완료", weak: "미흡", missing: "미완료" });
export const CHECK_TIP = Object.freeze({ done: "완료 · 다시 누르면 해제", weak: "미흡 · 다시 누르면 해제", missing: "미완료 · 다시 누르면 해제" });
/** (어76) 반려 사유 여섯 — 원장님 2026-09-17 「반려 선택시 사유 … 화질저하, 페이지잘림, 페이지누락, 과제미완료, 정답/오답 근거누락, 등 사유선택하게 해줄것」.
 *  마지막은 「기타」 한 낱말이다((어69) 9/17 「기타는 그냥 통일하면되겠고」 · docs/말-사전.md).
 *  **DB 의 day_item_reject_choice(0176) 와 같은 목록**이어야 한다 — check-reject 가 둘을 견준다(원칙-1) */
export const REJECT = Object.freeze(["화질 저하", "페이지 잘림", "페이지 누락", "과제 미완료", "근거 누락", "기타"]);
export const isReject = (why) => REJECT.includes(String(why ?? ""));
export const REJECT_NAME = "반려";
export const REJECT_TIP = "반려 · 사유를 고르면 아이에게 알림";
