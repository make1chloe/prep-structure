import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import PrincipalOnly from "@/components/PrincipalOnly";
import ImportBoard from "./ImportBoard";
import CheckBox from "./CheckBox";
import FixDatesBox from "./FixDatesBox";
import YearAuditBox from "./YearAuditBox";
import YearFixBox from "./YearFixBox";
import WipeBox from "./WipeBox";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
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
    return <PrincipalOnly profile={profile} what="노션 이관 화면" />;
  }

  return (
    <>
      <TopBar profile={profile} active="import" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">노션 이관</p>
          <h1 className="h1">지난 기록 옮기기</h1>
          <p className="sub">
            노션에서 CSV로 내보낸 파일을 올리면 그대로 들어옵니다. 여러 번 올려도 같은 날짜·학생은 덮어씁니다.
          </p>
        </div>
        <ImportBoard />
        <CheckBox />
        {/* 진단이 먼저, 고치기가 다음 — 무엇이 잘못됐는지 모르고 옮기면 더 어려워진다 */}
        <YearAuditBox />
        {/* 줄마다 따져서 고치는 것이 먼저. 범위를 통째로 미는 것은 마지막 수단 */}
        <YearFixBox />
        {/* 다시 올리기 전에 지우는 자리 — 제일 위험하므로 맨 아래에 둔다 */}
        <WipeBox />
        <FixDatesBox />
      </main>
    </>
  );
}
