import { createClient } from "@/lib/supabase/server";
import Help from "@/components/Help";
import MonthlyBoard from "./MonthlyBoard";
import { loadMonth } from "./actions";
import { todaySeoul } from "@/lib/day";

export const dynamic = "force-dynamic";

export default async function MonthlyPage(props) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  const ym = /^\d{4}-\d{2}$/.test(searchParams?.m || "")
    ? searchParams.m
    : todaySeoul().slice(0, 7);

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
        <MonthlyBoard ym={ym} rows={rows} ready={ready} mode={mode} />
      </main>
    </>
  );
}
