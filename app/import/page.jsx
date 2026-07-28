import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ImportBoard from "./ImportBoard";
import CheckBox from "./CheckBox";
import FixDatesBox from "./FixDatesBox";

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
        <FixDatesBox />
      </main>
    </>
  );
}
