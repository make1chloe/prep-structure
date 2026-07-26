import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ResendBoard from "./ResendBoard";
import { loadReportRows } from "@/lib/reportData";
import { loadSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ResendPage({ searchParams }) {
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
  const { rows, resendReady } = await loadReportRows(supabase, date, settings.academy.name, settings.message);

  return (
    <>
      <TopBar profile={profile} active="resend" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">재발송</p>
          <h1 className="h1">숙제 문자 · 리포트 다시 보내기</h1>
          <p className="sub">
            이미 보낸 문구를 고쳐서 다시 보내거나, 숙제만 따로 보낼 때 쓰는 화면이에요.
          </p>
        </div>
        <ResendBoard date={date} rows={rows} ready={resendReady} mode={settings.mode} />
      </main>
    </>
  );
}
