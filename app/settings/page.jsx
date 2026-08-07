import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import PrincipalOnly from "@/components/PrincipalOnly";
import SettingsForm from "./SettingsForm";
import NetBox from "./NetBox";
import GuideBox from "./GuideBox";
import NeisKeyBox from "./NeisKeyBox";
import AiBox from "./sql/AiBox";
import { loadSettings, maskSecret } from "@/lib/settings";
import { inquiryAlertReady, inquiryAlertName } from "@/app/apply/notify";

export const dynamic = "force-dynamic";

/**
 * **넣는 것은 여기 한 곳** (원장님, 2026-08-07 — 「api, 솔라피, 등등
 * 입력값이 필요한걸 한페이지에 모아야하지 않을까?」).
 *
 * 열쇠가 네 군데로 흩어져 있었다 —
 *   솔라피 · 앱 알림   설정 (여기)
 *   나이스 인증키      학교 · 시험 화면 안
 *   AI 키              설정 → Supabase · AI 키
 *
 * 각각은 그 자리에 있을 이유가 있었다 (나이스는 학사일정을 받는 자리니까).
 * 그런데 **열쇠를 넣으려는 사람은 「어느 화면이었더라」 부터 떠올려야 했다.**
 * 쓰는 자리와 넣는 자리는 다르다. 넣는 것은 한 번이고, 쓰는 것은 매일이다.
 *
 * 노션 이관·SQL 처럼 **다 만들고 나면 안 여는 것**은 「관리자」 로 뺐다.
 */
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
    return <PrincipalOnly profile={profile} what="연동 · 설정" />;
  }
  const canEdit = profile?.role === "principal";

  const s = await loadSettings(supabase);
  const { data: pushRow } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "push")
    .maybeSingle();
  const pushReady = !!pushRow?.config?.publicKey;
  const { data: aiRow } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "anthropic")
    .maybeSingle();
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
          <h1 className="h1">연동 · 설정</h1>
          <Help>
            <p className="sub">
              키와 발송 방식은 <b>연동 · 키</b>, 반성문·단어 통과선 같은 것은 <b>운영 규칙</b> 에 있습니다.
              바꿔도 다시 배포할 필요가 없어요.
            </p>
          </Help>
        </div>
        <NetBox />
        <GuideBox />
        <SettingsForm
          view={view}
          unavailable={!s.available}
          canEdit={canEdit}
          pushReady={pushReady}
          inquiryAlert={inquiryAlert}
          inquiryAlertVar={inquiryAlertVar}
          extras={
            <>
              <NeisKeyBox />
              <AiBox saved={!!aiRow?.config?.key} />
            </>
          }
        />

        {/* **다 만들고 나면 안 여는 것들** (원장님, 2026-08-07 — 「노션이관과
            sql db등 웹앱 자체가 완성되고 나면 안쓰는 기능들은 따로 모아줘」).
            매일 쓰는 것과 같은 줄에 있으면 눈으로 걸러야 한다 */}
        <div className="card" style={{ marginTop: 14, opacity: 0.85 }}>
          <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ fontSize: 13.5 }}>관리자</b>
            <span className="hint" style={{ flex: 1 }}>
              처음 한 번 하고 거의 안 여는 것 — 표 만들기 · 옛 자료 옮기기 · 아이콘
            </span>
            <Link className="btn btn-ghost btn-sm" href="/settings/admin">열기 ›</Link>
          </div>
        </div>
      </main>
    </>
  );
}
