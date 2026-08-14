import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ThemePicker from "@/components/ThemePicker";
import MenuBox from "../MenuBox";
import LayoutBox from "./LayoutBox";
import IconBox from "./IconBox";
import HelpBox from "../HelpBox";
import Help, { helpOn } from "@/components/Help";
import { isTeacher } from "@/lib/roles";
import { sessionUser } from "@/lib/session";

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
  const user = await sessionUser(supabase);

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
          <Help>
            <p className="sub">
              맨 위 메뉴에 무엇을 어떤 순서로 놓을지, <b>화면 안의 덩어리를 어떤 차례로</b>
              보여줄지(학생·학부모 화면 포함), 그리고 밝게 볼지 어둡게 볼지 정합니다.
            </p>
          </Help>
        </div>

        <div className="stack" style={{ gap: 12 }}>
          <HelpBox on={helpOn()} />
          <MenuBox profile={profile} />
          {/* 화면 안의 덩어리 차례 (0095). 메뉴 순서와는 다른 이야기라 따로 둔다 —
              메뉴는 「어디로 가나」 고, 이것은 「가서 무엇을 먼저 보나」 다.
              강사·조교는 자기 메뉴만 정하고, 이건 모두에게 같이 적용되므로 원장·강사만 */}
          {isTeacher(profile?.role) && <LayoutBox />}
          <ThemePicker />
          {/* 로고·아이콘 — 옛 「관리자」 화면에 있던 것을 여기로 옮겼다.
              어떻게 보이는지를 정하는 일이라 화면 쪽이 맞다 (원장님, 2026-08-13) */}
          <IconBox />
        </div>
              {/* **세 개로 나눠 담기.** 원장 · 학부모 · 학생 앱을 따로 담아
            각각 로그인해서 확인하실 때 쓰는 자리다. */}
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <b style={{ fontSize: 15 }}>홈 화면에 세 개로 담기</b>
            <span className="hint">원장 · 학부모 · 학생 앱을 따로</span>
            <span className="spacer" />
            <a className="btn btn-ghost btn-sm" href="/install">담으러 가기 ›</a>
          </div>
        </div>

</main>
    </>
  );
}
