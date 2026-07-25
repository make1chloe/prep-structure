import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddClassForm from "./AddClassForm";
import ClassManager from "./ClassManager";

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
    .select("id, name, days, start_time, end_time, level, category, room, capacity, school_level")
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

  const selectedId = searchParams?.c || classes?.[0]?.id || null;

  return (
    <>
      <TopBar profile={profile} active="classes" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">반 관리</p>
          <h1 className="h1">반 · 학생 배정</h1>
          <div className="row" style={{ marginTop: 10 }}>
            <AddClassForm />
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
          />
        )}
      </main>
    </>
  );
}
