"use client";

import dynamic from "next/dynamic";

/**
 * **교재 판은 그 탭을 열 때 내려받는다** (성능수리 5차 — /report 와 같은 방식).
 *
 * 교재 화면은 원장 화면 가운데 내려보내는 자바스크립트가 가장 많았다.
 * 까닭은 리포트 화면과 똑같다 — **그리기를 고르는 것과 받는 것은 다르다.**
 * page.jsx 는 교재를 고르지 않았으면 판을 하나도 안 그리고, 골랐어도
 * TextbookList 가 **탭 하나 것만** 그린다. 그런데 파일 맨 위에서 import 한
 * 순간 단원판(474줄) · 진도루틴판(428) · 진도(87) · 학생(136) 이 전부
 * 한 꾸러미가 된다. 원장님이 「목록만 보고 싶어」(2026-08-18) 라고 해서
 * 첫 화면은 목록뿐인데, 판 넷은 늘 따라 내려왔다.
 *
 * 그래서 여기 얇은 클라 껍데기를 두고 next/dynamic 으로 가른다.
 *   · 교재를 안 골랐으면  — 판 조각을 하나도 안 받는다
 *   · 골랐으면            — 지금 열린 탭 것만 받는다
 *
 * **`ssr: false` 는 안 붙인다** (/report 와 같은 판단). 갈라지는 양은 같은데,
 * 안 붙이면 서버가 그린 판이 첫 HTML 에 그대로 들어 있어 깜빡임이 없다.
 * 오늘 수업의 학생 판은 첫 그림에서 늘 닫혀 있어 `ssr: false` 가 맞았지만,
 * 여기 단원 탭은 교재를 고르면 바로 보이는 자리다.
 *
 * 기다리는 자리 이름은 **판 이름과 일부러 다르게** 둔다 (`.bookPanelWait`).
 * 검사가 셀렉터로 판을 찾는데 같은 이름이면 빈 자리를 판으로 착각한다
 * — app/today/TodayBoard.jsx 의 `.stuPanel` 전례.
 *
 * 판단(무엇을 셀지·무엇을 보일지)은 하나도 안 옮겼다. 여기는 **받는 때**만
 * 정한다.
 */
function Wait({ what }) {
  return (
    <div className="bookPanelWait">
      <p className="hint" style={{ margin: 0 }}>{what} 여는 중…</p>
    </div>
  );
}

// next/dynamic 의 옵션은 **글자 그대로 적은 객체**여야 한다 (컴파일할 때
// 갈라내야 하니 함수로 만들어 넘기면 빌드가 거절한다)
export const UnitListLazy = dynamic(() => import("./UnitList"), {
  loading: () => <Wait what="단원 목록" />,
});
export const GenerateUnitsLazy = dynamic(() => import("./GenerateUnits"), {
  loading: () => <Wait what="단원 자동 만들기" />,
});
export const WordRangeBoxLazy = dynamic(() => import("./WordRangeBox"), {
  loading: () => <Wait what="단어 범위" />,
});
export const RoutineEditorLazy = dynamic(() => import("./RoutineEditor"), {
  loading: () => <Wait what="진도루틴" />,
});
export const BookProgressBoardLazy = dynamic(() => import("./BookProgressBoard"), {
  loading: () => <Wait what="진도" />,
});
export const BookStudentsLazy = dynamic(() => import("./BookStudents"), {
  loading: () => <Wait what="학생" />,
});
