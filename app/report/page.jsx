import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import ReportSender from "./ReportSender";
import NoticeSender from "./NoticeSender";
import LateSender from "./LateSender";
import SendTabs from "./SendTabs";
import ResendBoard from "../resend/ResendBoard";
import TestSender from "./TestSender";
import { loadReportRows } from "@/lib/reportData";
import { loadSettings } from "@/lib/settings";
import { channelPlan } from "@/lib/alimtalk";
import { todaySeoul } from "@/lib/day";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }) {
  const supabase = createClient();
  const user = await sessionUser(supabase);

  const date = searchParams?.d || todaySeoul();

  const t = searchParams?.t;
  const tab =
    t === "notice" ? "notice"
    : t === "hw" ? "hw"
    : t === "late" ? "late"
    : t === "resend" ? "resend"
    : t === "test" ? "test"
    : "report";

  // 테스트 발송 탭 — 학생 전체와, 알림톡이 붙은 문구
  // **파도** (속도 대원칙 — 원칙 6)
  const none = Promise.resolve({ data: [] });
  const [profileQ, ssQ, ttQ, settings, tplQ] = await Promise.all([
    user
      ? cachedProfile(supabase, user.id)
      : Promise.resolve({ data: null }),
    // 상태로 거르지 않는다. 테스트용 학생은 **'예비' 로 만들어 두는 게 낫다** —
    // 재원으로 만들면 오늘 수업·월간리포트·수강료에 계속 끼어든다.
    tab === "test"
      ? supabase
          .from("students")
          .select("id, name, parent_phone, student_phone, status")
          .order("name", { ascending: true })
      : none,
    tab === "test"
      ? supabase
          .from("message_templates")
          .select("id, name, alimtalk_id")
          .eq("active", true)
          .order("sort", { ascending: true })
      : none,
    loadSettings(supabase),
    // 이 화면에서 나가는 것이 **알림톡인지 문자인지** 보내기 전에 알아야 한다.
    // 다 보내고 나서 "이거 문자로 나갔네" 를 알면 늦다.
    supabase.from("message_templates").select("id, name, key, alimtalk_id, active").not("key", "is", null),
  ]);
  const profile = profileQ?.data || null;
  const testStudents = ssQ.data || [];
  const testTemplates = ttQ.data || [];
  const { data: tplRows } = tplQ;
  // 함수는 화면(클라이언트)으로 못 넘긴다 — **값으로** 넘긴다.
  //   { report: "alimtalk", homework: "sms", … }
  const chans = Object.fromEntries(
    channelPlan(tplRows || [], settings.solapi?.pfId || "")
      .filter((p) => p.key)
      .map((p) => [p.key, p.channel])
  );
  const { rows, sendReady, resendReady } = await loadReportRows(
    supabase, date, settings.academy.name, settings.message
  );

  // 탭마다 부제가 다르다 — 지금 무엇을 하는 화면인지 위에서 바로 읽히게
  const SUB = {
    report: "데일리리포트는 오늘 수업 입력 내용으로 자동 작성됩니다.",
    hw: "다음 수업 숙제만 담은 짧은 문자입니다. 학생에게 갑니다.",
    late: "늦게 가는 학생의 사유는 수업 기록에서 자동으로 잡힙니다.",
    notice: "안내 문자는 미리 써둔 문구를 씁니다.",
    resend: "이미 보낸 문구를 고쳐서 다시 보내거나, 숙제만 따로 보낼 때 씁니다.",
    test: "진짜로 나가기 전에 받아봅니다. 보낸 것으로 표시되지 않고 이력에도 안 남습니다.",
  };

  return (
    <>
      <TopBar profile={profile} active="report" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">발송</p>
          <h1 className="h1">데일리리포트 · 하원 · 안내</h1>
          <Help><p className="sub">{SUB[tab]}</p></Help>
        </div>
        <SendTabs tab={tab} date={date} />
        {tab === "test" ? (
          <TestSender
            students={testStudents}
            templates={testTemplates}
            mode={settings.mode}
            date={date}
          />
        ) : tab === "notice" ? (
          <NoticeSender academy={settings.academy.name} mode={settings.mode} msg={settings.message} />
        ) : tab === "hw" ? (
          <ResendBoard
            date={date} rows={rows} ready={resendReady}
            mode={settings.mode} chans={chans} only="homework"
          />
        ) : tab === "late" ? (
          <LateSender date={date} rows={rows} mode={settings.mode} chans={chans} />
        ) : tab === "resend" ? (
          <ResendBoard date={date} rows={rows} ready={resendReady} mode={settings.mode} chans={chans} />
        ) : (
          <ReportSender date={date} rows={rows} sendReady={sendReady} mode={settings.mode} chans={chans} />
        )}
      </main>
    </>
  );
}
