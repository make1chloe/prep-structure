import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import AddHomeworkForm from "./AddHomeworkForm";
import HomeworkList from "./HomeworkList";
import SeedBasicButton from "./SeedBasicButton";
import { sessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomeworkPage() {
  const supabase = createClient();
  const user = await sessionUser(supabase);

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  let { data: items, error } = await supabase
    .from("homework_items")
    .select("id, name, category, sort, active, method, prep_task, no_timer, checklist, home_item_id, in_person, unit_test, tool")
    .order("sort", { ascending: true });
  if (error) {
    // 0116 전이면 '준비물' 없이
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active, method, prep_task, no_timer, checklist, home_item_id, in_person, unit_test")
      .order("sort", { ascending: true }));
  }
  if (error) {
    // 0063 전이면 '직접검사' 없이
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active, method, prep_task, no_timer, checklist, home_item_id, in_person")
      .order("sort", { ascending: true }));
  }
  if (error) {
    // no_timer 컬럼이 아직 없는 DB (0033 전)
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active, method, prep_task, no_timer")
      .order("sort", { ascending: true }));
  }
  if (error) {
    // prep_task 컬럼도 없는 DB (0028 전)
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active, method")
      .order("sort", { ascending: true }));
  }
  if (error) {
    // method 컬럼도 없는 DB
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active")
      .order("sort", { ascending: true }));
  }

  return (
    <>
      <TopBar profile={profile} active="homework" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">교재</p>
          <h1 className="h1">학습 항목</h1>
          <Help>
            <p className="sub">
              오늘 수업에서 숙제를 검사하고 배정할 때 쓰는 항목이에요.
              <b>학습 방법</b>을 적어두면 학생 페이지에서 숙제를 눌렀을 때 그대로 보여줍니다.
              안 쓰는 항목은 삭제 대신 <b>숨기기</b>를 권합니다 (지난 기록이 보존돼요).
            </p>
          </Help>
          <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: "wrap" }}>
            <AddHomeworkForm />
            <SeedBasicButton />
          </div>
        </div>

        <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          {error ? (
            <div style={{ padding: 14 }}>
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
