import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddStudentForm from "./AddStudentForm";
import ExcelUpload from "./ExcelUpload";
import StudentList from "./StudentList";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
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

  const { data: students, error } = await supabase
    .from("students")
    .select(
      "id, name, school, grade, birth_year, student_phone, parent_phone, status, electives, note, login_id, created_at"
    )
    .order("created_at", { ascending: false });

  return (
    <>
      <TopBar profile={profile} active="students" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">학생 관리</p>
          <h1 className="h1">재원생</h1>
          <p className="sub">
            학생을 추가하면 실제 데이터베이스(Supabase)에 저장됩니다. 로그인
            아이디는 전화 뒷자리로 자동 생성됩니다.
          </p>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <AddStudentForm />
            <ExcelUpload />
          </div>
        </div>

        <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          {error ? (
            <div style={{ padding: 18 }}>
              <div className="err">불러오기 실패: {error.message}</div>
            </div>
          ) : (
            <StudentList students={students || []} />
          )}
        </div>
      </main>
    </>
  );
}
