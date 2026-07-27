import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ReportSender from "./ReportSender";
import NoticeSender from "./NoticeSender";
import LateSender from "./LateSender";
import SendTabs from "./SendTabs";
import { loadReportRows } from "@/lib/reportData";
import { loadSettings } from "@/lib/settings";
import { todaySeoul } from "@/lib/day";

export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const date = searchParams?.d || todaySeoul();

  const t = searchParams?.t;
  const tab = t === "notice" ? "notice" : t === "late" ? "late" : "report";

  const settings = await loadSettings(supabase);
  const { rows, sendReady } = await loadReportRows(supabase, date, settings.academy.name, settings.message);

  return (
    <>
      <TopBar profile={profile} active="report" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">데일리리포트</p>
          <h1 className="h1">학부모 발송</h1>
          <p className="sub">
            데일리리포트는 오늘 수업 입력 내용으로 자동 작성되고, 안내 문자는 미리 써둔 문구를 씁니다.
          </p>
        </div>
        <SendTabs tab={tab} date={date} />
        {tab === "notice" ? (
          <NoticeSender academy={settings.academy.name} mode={settings.mode} msg={settings.message} />
        ) : tab === "late" ? (
          <LateSender date={date} rows={rows} mode={settings.mode} />
        ) : (
          <ReportSender date={date} rows={rows} sendReady={sendReady} mode={settings.mode} />
        )}
      </main>
    </>
  );
}
