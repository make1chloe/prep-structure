/** 판 항목의 상태 낱말 한 벌 — DB(v2.day_item.status) 의 CHECK 와 같다: none(아직) · done ⭕ · weak 🔺 · missing ❌ · inclass. 기본값은 'none'(0052) — 비어 있는 것과 같이 「아직 안 봄」이다.
 *  순수 파일 — 화면(클라이언트)과 서버 둘 다 들여온다 */
import { ACT } from "./emoji.js";
export const isUnchecked = (item) => !item?.status || item.status === "none";
/** (어76) 검사 단추의 그림 — 원장님 2026-09-17 「숙제검사에 동그라미 세모 엑스 도 이모지로 바꾸고」.
 *  그림을 여기서 짓지 않고 **기능 표(ACT)** 에서 가져온다 — 두 기능이 같은 그림을 쓰면 check-emoji 가 잡는다(대전제-25) */
export const CHECK = Object.freeze([["done", ACT.checkDone], ["weak", ACT.checkWeak], ["missing", ACT.checkMiss]]);
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
