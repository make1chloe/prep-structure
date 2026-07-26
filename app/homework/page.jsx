import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddHomeworkForm from "./AddHomeworkForm";
import HomeworkList from "./HomeworkList";

export const dynamic = "force-dynamic";

export default async function HomeworkPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const { data: items, error } = await supabase
    .from("homework_items")
    .select("id, name, category, sort, active")
    .order("sort", { ascending: true });

  return (
    <>
      <TopBar profile={profile} active="homework" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">학습 항목</p>
          <h1 className="h1">기본 학습 목록</h1>
          <p className="sub">
            오늘 수업에서 숙제를 검사하고 배정할 때 쓰는 항목이에요.
            안 쓰는 항목은 삭제 대신 <b>숨기기</b>를 권합니다 (지난 기록이 보존돼요).
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <AddHomeworkForm />
          </div>
        </div>

        <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          {error ? (
            <div style={{ padding: 18 }}>
              <div className="err">불러오기 실패: {error.message}</div>
            </div>
          ) : (
            <HomeworkList items={items || []} />
          )}
        </div>
      </main>
    </>
  );
}
