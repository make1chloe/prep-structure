import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ReportSender from "./ReportSender";
import NoticeSender from "./NoticeSender";
import LateSender from "./LateSender";
import SendTabs from "./SendTabs";
import ResendBoard from "../resend/ResendBoard";
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
  const tab =
    t === "notice" ? "notice" : t === "late" ? "late" : t === "resend" ? "resend" : "report";

  const settings = await loadSettings(supabase);
  const { rows, sendReady, resendReady } = await loadReportRows(
    supabase, date, settings.academy.name, settings.message
  );

  // 탭마다 부제가 다르다 — 지금 무엇을 하는 화면인지 위에서 바로 읽히게
  const SUB = {
    report: "데일리리포트는 오늘 수업 입력 내용으로 자동 작성됩니다.",
    late: "늦게 가는 학생의 사유는 수업 기록에서 자동으로 잡힙니다.",
    notice: "안내 문자는 미리 써둔 문구를 씁니다.",
    resend: "이미 보낸 문구를 고쳐서 다시 보내거나, 숙제만 따로 보낼 때 씁니다.",
  };

  return (
    <>
      <TopBar profile={profile} active="report" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">발송</p>
          <h1 className="h1">학부모 발송</h1>
          <p className="sub">{SUB[tab]}</p>
        </div>
        <SendTabs tab={tab} date={date} />
        {tab === "notice" ? (
          <NoticeSender academy={settings.academy.name} mode={settings.mode} msg={settings.message} />
        ) : tab === "late" ? (
          <LateSender date={date} rows={rows} mode={settings.mode} />
        ) : tab === "resend" ? (
          <ResendBoard date={date} rows={rows} ready={resendReady} mode={settings.mode} />
        ) : (
          <ReportSender date={date} rows={rows} sendReady={sendReady} mode={settings.mode} />
        )}
      </main>
    </>
  );
}
