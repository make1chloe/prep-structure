import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import PrincipalOnly from "@/components/PrincipalOnly";
import SettingsForm from "./SettingsForm";
import NetBox from "./NetBox";
import GuideBox from "./GuideBox";
import { loadSettings, maskSecret } from "@/lib/settings";
import { inquiryAlertReady, inquiryAlertName } from "@/app/apply/notify";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  // 메뉴에서 감추는 것만으로는 부족하다 — 주소를 알면 그냥 열린다 (0079)
  if (profile?.role !== "principal") {
    return <PrincipalOnly profile={profile} what="발송 · 연동 설정" />;
  }
  const canEdit = profile?.role === "principal";

  const s = await loadSettings(supabase);
  const { data: pushRow } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "push")
    .maybeSingle();
  const pushReady = !!pushRow?.config?.publicKey;
  // 신규 상담 접수 알림은 서버 열쇠가 있어야 나간다 (로그인 없는 화면이라)
  const inquiryAlert = inquiryAlertReady();
  const inquiryAlertVar = inquiryAlertName();

  // 비밀값은 가려서만 내려보낸다
  const view = {
    mode: s.mode,
    academy: s.academy,
    message: s.message,
    solapi: {
      sender: s.solapi.sender,
      pfId: s.solapi.pfId,
      saved: !!s.solapi.apiKey,
      maskedKey: maskSecret(s.solapi.apiKey),
      maskedSecret: s.solapi.apiSecret ? "••••••••" : "",
    },
    webhook: {
      url: s.webhook.url,
      maskedSecret: s.webhook.secret ? "••••••••" : "",
    },
    schedule: s.schedule,
    warning: s.warning,
  };

  return (
    <>
      <TopBar profile={profile} active="settings" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">설정</p>
          <h1 className="h1">발송 · 연동</h1>
          <Help>
            <p className="sub">
              문자 발송 방식과 키를 여기서 바꿉니다. 바꿔도 다시 배포할 필요가 없어요.
            </p>
          </Help>
        </div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>Supabase SQL</b>
            <span className="hint" style={{ flex: 1 }}>
              새 기능을 넣으면 표를 한 번 만들어줘야 합니다. 여기서 복사해 Supabase 에 붙여넣으세요.
            </span>
            <Link className="btn btn-ghost btn-sm" href="/settings/sql">
              SQL 열기
            </Link>
          </div>
        </div>
        <NetBox />
        <GuideBox />
        <SettingsForm view={view} unavailable={!s.available} canEdit={canEdit} pushReady={pushReady} inquiryAlert={inquiryAlert} inquiryAlertVar={inquiryAlertVar} />
      </main>
    </>
  );
}
