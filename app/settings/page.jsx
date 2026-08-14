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
import { checkSchema } from "./sql/status";
import { loadSettings, maskSecret } from "@/lib/settings";
import { inquiryAlertReady, inquiryAlertName } from "@/app/apply/notify";
import { sessionUser } from "@/lib/session";

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
  const user = await sessionUser(supabase);

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

  /**
   * **처음 한 번만 여는 것들** — 옛 「관리자」 화면에 있던 것을 여기로 내렸다.
   *
   * 아직 안 돌린 SQL 이 있으면 그것만은 눈에 띄어야 한다 — 표가 없으면
   * 그 기능이 **조용히** 안 된다 (「109 안 떠」).
   */
  const missing = (await checkSchema()).filter((c) => !c.ok);
  const ADMIN_ROWS = [
    {
      href: "/settings/sql",
      label: "Supabase SQL",
      desc: "새 기능을 넣으면 표를 한 번 만들어줘야 합니다",
      tag: missing.length
        ? { text: `안 돌린 것 ${missing.length}`, cls: "tag-amber" }
        : { text: "전부 돌아감", cls: "tag-mint" },
    },
    {
      href: "/import",
      label: "노션 이관",
      desc: "노션에서 내보낸 CSV 를 올려 옛 기록을 가져옵니다",
    },
    {
      href: "/install",
      label: "홈 화면에 담기",
      desc: "원장 · 학부모 · 학생 앱을 따로 담아 확인할 때",
    },
  ];

  return (
    <>
      <TopBar profile={profile} active="settings" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">설정</p>
          <h1 className="h1">설정</h1>
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
            매일 쓰는 것과 같은 줄에 있으면 눈으로 걸러야 한다.

            전에는 「관리자」라는 화면을 따로 두고 여기서 링크만 걸었다. 그런데
            묶음 이름이 「관리자」가 되면서 그 안에 또 「관리자」가 생겨 어느 쪽이
            어느 쪽인지 헷갈렸다 (원장님, 2026-08-13). 화면을 없애고 **여기로
            내렸다** — 한 번 더 눌러 들어가던 걸음도 같이 없어진다. */}
        <div className="card" style={{ marginTop: 14, opacity: 0.9 }}>
          <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
            <b style={{ fontSize: 15 }}>처음 한 번만</b>
            <span className="hint" style={{ flex: 1 }}>
              다 만들고 나면 거의 안 여는 것들입니다.
            </span>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {ADMIN_ROWS.map((r) => (
              <Link key={r.href} href={r.href} className="unitrow" style={{ textDecoration: "none" }}>
                <b style={{ fontSize: 15, minWidth: 120 }}>{r.label}</b>
                {r.tag && <span className={`tag ${r.tag.cls}`}>{r.tag.text}</span>}
                <span className="hint" style={{ flex: 1 }}>{r.desc}</span>
                <span className="hint">›</span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
