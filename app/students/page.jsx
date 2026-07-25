import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { addStudent } from "./actions";
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
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">학생 관리</p>
          <h1 className="h1">재원생</h1>
          <p className="sub">
            학생을 추가하면 실제 데이터베이스(Supabase)에 저장됩니다. 로그인
            아이디는 전화 뒷자리로 자동 생성됩니다.
          </p>
          <ExcelUpload />
        </div>

        <div className="grid2" style={{ marginTop: 18, alignItems: "start" }}>
          {/* 추가 폼 */}
          <div className="card">
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800 }}>
              학생 추가
            </h2>
            <form action={addStudent} className="stack">
              <div className="field">
                <label className="label">이름 *</label>
                <input className="input" name="name" required placeholder="홍길동" />
              </div>

              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">학교 *</label>
                  <input className="input" name="school" required placeholder="신정중" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">학년 *</label>
                  <input className="input" name="grade" required placeholder="중2" />
                </div>
              </div>

              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">생년월일</label>
                  <input className="input" name="birth_year" type="date" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">성별</label>
                  <select className="input" name="gender" defaultValue="">
                    <option value="">선택</option>
                    <option value="여">여</option>
                    <option value="남">남</option>
                  </select>
                </div>
              </div>

              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">학생 전화 *</label>
                  <input
                    className="input"
                    name="student_phone"
                    required
                    placeholder="010-0000-0000"
                  />
                  <span className="hint">뒷자리 4개로 로그인 아이디를 만들어요.</span>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">학부모 전화 *</label>
                  <input
                    className="input"
                    name="parent_phone"
                    required
                    placeholder="010-0000-0000"
                  />
                </div>
              </div>

              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">재원 상태 *</label>
                  <select className="input" name="status" defaultValue="enrolled" required>
                    <option value="prospect">예비</option>
                    <option value="enrolled">재원</option>
                    <option value="paused">휴원</option>
                    <option value="withdrawn">퇴원</option>
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">등원시작일</label>
                  <input className="input" name="enrolled_on" type="date" />
                </div>
              </div>

              <div className="field">
                <label className="label">선택과목</label>
                <input
                  className="input"
                  name="electives"
                  placeholder="예: 고2 1학기 화작/기하"
                />
              </div>

              <div className="field">
                <label className="label">특이사항</label>
                <input className="input" name="note" placeholder="메모" />
              </div>

              <button className="btn btn-primary btn-block" type="submit">
                저장
              </button>
            </form>
          </div>

          {/* 목록 */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px 0" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                학생 목록{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
                  {students?.length || 0}명
                </span>
              </h2>
            </div>
            {error ? (
              <div style={{ padding: 18 }}>
                <div className="err">불러오기 실패: {error.message}</div>
              </div>
            ) : (
              <StudentList students={students || []} />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
