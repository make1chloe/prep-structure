import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddClassForm from "./AddClassForm";
import ClassUpload from "./ClassUpload";
import ClassManager from "./ClassManager";
import { running } from "@/lib/classTerm";
import { todaySeoul } from "@/lib/day";

export const dynamic = "force-dynamic";

export default async function ClassesPage({ searchParams }) {
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

  // school_level 컬럼이 아직 없는 DB에서도 동작하도록 실패 시 재조회
  let { data: classes, error } = await supabase
    .from("classes")
    .select(
      "id, name, days, start_time, end_time, level, category, room, capacity, school_level, starts_on, ends_on, archived_at"
    )
    .order("start_time", { ascending: true });
  if (error) {
    ({ data: classes, error } = await supabase
      .from("classes")
      .select("id, name, days, start_time, end_time, level, category, room, capacity")
      .order("start_time", { ascending: true }));
  }

  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, status")
    .eq("status", "enrolled")
    .order("name", { ascending: true });

  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id");

  // 끝난 특강은 목록 아래로 접는다 — 고르고 있던 반이면 그대로 열어둔다
  const today = todaySeoul();
  const live = running(classes || [], today);
  const selectedId = searchParams?.c || live?.[0]?.id || classes?.[0]?.id || null;

  return (
    <>
      <TopBar profile={profile} active="classes" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">반 관리</p>
          <h1 className="h1">반 · 학생 배정</h1>
          <div className="row" style={{ marginTop: 10 }}>
            <AddClassForm />
            <ClassUpload />
          </div>
        </div>

        {error ? (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="err">불러오기 실패: {error.message}</div>
          </div>
        ) : (
          <ClassManager
            classes={classes || []}
            students={students || []}
            members={members || []}
            selectedId={selectedId}
            today={today}
          />
        )}
      </main>
    </>
  );
}
