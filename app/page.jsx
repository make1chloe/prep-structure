import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  let counts = { students: 0, classes: 0, textbooks: 0 };

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;

    const [s, c, t] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }),
      supabase.from("classes").select("id", { count: "exact", head: true }),
      supabase.from("textbooks").select("id", { count: "exact", head: true }),
    ]);
    counts = {
      students: s.count || 0,
      classes: c.count || 0,
      textbooks: t.count || 0,
    };
  }

  return (
    <>
      <TopBar profile={profile} active="home" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">대시보드</p>
          <h1 className="h1">
            안녕하세요, {profile?.name || "원장"}님
          </h1>
          <p className="sub">
            학습관리 시스템에 연결되었습니다. 아래는 현재 등록된 데이터 현황입니다.
          </p>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="k">재원생</div>
            <div className="v">{counts.students}</div>
          </div>
          <div className="stat">
            <div className="k">반</div>
            <div className="v">{counts.classes}</div>
          </div>
          <div className="stat">
            <div className="k">교재</div>
            <div className="v">{counts.textbooks}</div>
          </div>
        </div>

        {counts.students === 0 && (
          <div className="notice" style={{ marginBottom: 16 }}>
            아직 등록된 학생이 없습니다. <b>학생</b> 메뉴에서 첫 학생을 추가하거나,
            노션 데이터를 이관하면 여기에 표시됩니다.
          </div>
        )}

        <div className="row">
          <Link href="/students" className="btn btn-primary">
            학생 관리로 이동
          </Link>
        </div>
      </main>
    </>
  );
}
