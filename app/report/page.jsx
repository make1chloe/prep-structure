import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ReportSender from "./ReportSender";
import { loadReportRows } from "@/lib/reportData";
import { loadSettings } from "@/lib/settings";

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

  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const date = searchParams?.d || seoul.toISOString().slice(0, 10);

  const settings = await loadSettings(supabase);
  const { rows, sendReady } = await loadReportRows(supabase, date, settings.academy.name);

  return (
    <>
      <TopBar profile={profile} active="report" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">데일리리포트</p>
          <h1 className="h1">학부모 발송</h1>
          <p className="sub">
            오늘 수업에서 입력한 내용으로 문구가 자동으로 만들어집니다. 확인하고 고친 뒤 보내세요.
          </p>
        </div>
        <ReportSender date={date} rows={rows} sendReady={sendReady} mode={settings.mode} />
      </main>
    </>
  );
}
