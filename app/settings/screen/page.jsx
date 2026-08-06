import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ThemePicker from "@/components/ThemePicker";
import MenuBox from "../MenuBox";
import IconBox from "./IconBox";

export const dynamic = "force-dynamic";

/**
 * 화면 — **보이는 방식**만 여기서 정한다.
 *
 * 맨 위 메뉴에 무엇을 놓을지, 밝게 볼지 어둡게 볼지. 둘 다 「무엇을 하느냐」가
 * 아니라 「어떻게 보느냐」다. 그래서 발송 열쇠나 SQL 과는 다른 방에 둔다.
 *
 * 원장님만 여는 화면이 아니다 — 강사·조교도 자기 메뉴와 밝기를 정할 수 있어야 한다.
 */
export default async function ScreenSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  return (
    <>
      <TopBar profile={profile} active="screen" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">설정</p>
          <h1 className="h1">화면</h1>
          <p className="sub">
            맨 위 메뉴에 무엇을 어떤 순서로 놓을지, 그리고 밝게 볼지 어둡게 볼지 정합니다.
            <b> 이 브라우저에만</b> 적용되는 것과 <b>계정에 남는 것</b>이 섞여 있어 각 칸에 적어뒀어요.
          </p>
        </div>

        <div className="stack" style={{ gap: 12 }}>
          <MenuBox profile={profile} />
          <ThemePicker />
          {profile?.role === "principal" && <IconBox />}
        </div>
              {/* **세 개로 나눠 담기.** 원장 · 학부모 · 학생 앱을 따로 담아
            각각 로그인해서 확인하실 때 쓰는 자리다. */}
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <b style={{ fontSize: 14 }}>홈 화면에 세 개로 담기</b>
            <span className="hint">원장 · 학부모 · 학생 앱을 따로</span>
            <span className="spacer" />
            <a className="btn btn-ghost btn-sm" href="/install">담으러 가기 ›</a>
          </div>
        </div>

</main>
    </>
  );
}
