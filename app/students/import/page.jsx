import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <>
      <TopBar profile={profile} active="students" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">학생 관리</p>
          <h1 className="h1">엑셀 대량 업로드</h1>
          <p className="sub">
            노션·엑셀의 재원생 표를 복사해서 붙여넣으면 한 번에 등록됩니다.
            로그인 아이디도 자동으로 생성돼요.
          </p>
        </div>

        <div style={{ marginTop: 18 }}>
          <ImportClient />
        </div>
      </main>
    </>
  );
}
