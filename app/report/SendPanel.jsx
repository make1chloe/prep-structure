"use client";

import dynamic from "next/dynamic";

/**
 * **탭 판은 그 탭을 열 때 내려받는다** (성능수리 4차).
 *
 * 원장님 (2026-08-24): 「오늘 수업은 느려」 — 재보니 리포트 화면도 같은 병이
 * 있었다. 탭이 여덟인데 판 여섯 벌(2,500줄)을 **무조건 다 내려보내고** 있었다.
 * 「보낼 것」 탭 하나만 보고 나가는 날에도 안내 문자 판 724줄, 리포트 판
 * 473줄, 재발송 판 389줄이 전부 따라왔다.
 *
 * 서버가 `tab` 을 보고 하나만 그리는데도 그렇다 — **그리기를 고르는 것과
 * 받는 것은 다르다.** 파일 맨 위에서 import 한 순간 여섯이 한 꾸러미가 된다.
 * 그래서 여기 얇은 클라 껍데기를 두고 next/dynamic 으로 가른다.
 *
 * **`ssr: false` 는 안 붙인다.** 붙여도 갈라지는 양이 똑같기 때문이다
 * (실측: 둘 다 19.1kB gz). 안 붙이면 서버가 고른 판이 첫 HTML 에 그대로
 * 들어 있어서, 화면이 비었다가 채워지는 깜빡임이 없다 — 매일 문자를 보내는
 * 자리에서 공짜로 얻을 수 있는 것을 버릴 까닭이 없다.
 *
 * 판 자체는 원래도 전부 "use client" 다. 자료를 모으고 셈하는 일은 그대로
 * 서버(page.jsx)가 한다 — 여기로는 이미 다 된 값만 넘어온다.
 *
 * 기다리는 자리 이름은 판 이름과 **다르게** 둔다 (`.sendPanelWait`).
 * 검사가 셀렉터로 판을 찾는데 같은 이름을 붙이면 빈 자리를 판으로 착각한다
 * — app/today/TodayBoard.jsx 의 `.stuPanel` 전례 그대로다.
 */
function Wait({ what }) {
  return (
    <div className="sendPanelWait card" style={{ marginTop: 12 }}>
      <p className="hint" style={{ margin: 0 }}>{what} 여는 중…</p>
    </div>
  );
}

// next/dynamic 의 옵션은 **글자 그대로 적은 객체**여야 한다 (함수로 만들어
// 넘기면 빌드가 거절한다 — 컴파일할 때 갈라내야 하니까)
const SendTodo = dynamic(() => import("./SendTodo"), {
  loading: () => <Wait what="보낼 것" />,
});
const TestSender = dynamic(() => import("./TestSender"), {
  loading: () => <Wait what="테스트 발송" />,
});
const NoticeSender = dynamic(() => import("./NoticeSender"), {
  loading: () => <Wait what="안내 문자" />,
});
const LateSender = dynamic(() => import("./LateSender"), {
  loading: () => <Wait what="하원 안내" />,
});
const ReportSender = dynamic(() => import("./ReportSender"), {
  loading: () => <Wait what="데일리리포트" />,
});
const ResendBoard = dynamic(() => import("../resend/ResendBoard"), {
  loading: () => <Wait what="다시 보내기" />,
});

/**
 * 어느 탭에 어느 판인지 **고르는 자리는 한 곳**이다 (전에는 page.jsx 의
 * 삼항 사다리 한 벌). 판마다 필요한 것이 달라 자료는 통째로 받아 나눠 준다.
 */
export default function SendPanel({ tab, todoData, testStudents, testTemplates, settings, date, rows, chans, sendReady, resendReady, readReady }) {
  if (tab === "todo") return <SendTodo {...todoData} />;
  if (tab === "test")
    return (
      <TestSender
        students={testStudents}
        templates={testTemplates}
        mode={settings.mode}
        date={date}
      />
    );
  if (tab === "notice")
    return <NoticeSender academy={settings.academy.name} mode={settings.mode} msg={settings.message} />;
  if (tab === "hw")
    return (
      <ResendBoard
        date={date} rows={rows} ready={resendReady} readReady={readReady}
        mode={settings.mode} chans={chans} only="homework"
      />
    );
  if (tab === "late")
    return <LateSender date={date} rows={rows} mode={settings.mode} chans={chans} />;
  if (tab === "resend")
    return <ResendBoard date={date} rows={rows} ready={resendReady} readReady={readReady} mode={settings.mode} chans={chans} />;
  return <ReportSender date={date} rows={rows} sendReady={sendReady} readReady={readReady} mode={settings.mode} chans={chans} />;
}
