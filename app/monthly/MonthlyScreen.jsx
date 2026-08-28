import Help from "@/components/Help";
import SendTabs from "@/app/report/SendTabs";
// 판은 이 탭을 열 때 받는다 — 까닭은 MonthlyBoardLazy.jsx 에
import MonthlyBoard from "./MonthlyBoardLazy";
import { loadMonth } from "./actions";
import { todaySeoul } from "@/lib/day";

/**
 * **월간리포트 판** — 옛 `/monthly` 화면 그대로, 「리포트」 화면의 탭으로
 * 이사 (원장님 확정, 2026-08-28 — 「일일과 월간을 합쳐서 리포트로 만들고
 * 아래에서 나누기」). `/report?t=monthly` 가 이걸 그린다.
 *
 * 판단·조회는 하나도 안 바꿨다 — 화면이 사는 주소만 옮겼다
 * (app/homework/ItemsScreen 과 같은 관례. actions · MonthlyBoard 는 이
 * 폴더에 그대로 산다).
 *
 * **리포트 화면의 조회를 타지 않는다.** 부르는 쪽(app/report/page.jsx)이
 * 이 탭일 때 제 조회를 하기 전에 그대로 돌려준다 — 예전 `/monthly` 를
 * 열 때와 같은 수(loadMonth 한 벌)다.
 */
export default async function MonthlyScreen({ m }) {
  const ym = /^\d{4}-\d{2}$/.test(m || "") ? m : todaySeoul().slice(0, 7);

  const { rows, ready, mode } = await loadMonth(ym);

  return (
    <>
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">발송</p>
          <h1 className="h1">월간리포트</h1>
          <Help>
            <p className="sub">
              그 달 수업 기록으로 자동으로 만듭니다. 숙제 성취도·출결·단원평가가 함께 나갑니다.
            </p>
          </Help>
        </div>
        {/* 다른 탭으로 넘어갈 때 쓸 날짜 — 안 넘기면 「d=undefined」 가 붙는다 */}
        <SendTabs tab="monthly" date={todaySeoul()} />
        <MonthlyBoard ym={ym} rows={rows} ready={ready} mode={mode} />
      </main>
    </>
  );
}
