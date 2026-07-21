import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { addStudent } from "./actions";

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
    .select("id, name, school, grade, parent_phone, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <TopBar profile={profile} active="students" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">학생 관리</p>
          <h1 className="h1">재원생</h1>
          <p className="sub">
            학생을 추가하면 실제 데이터베이스(Supabase)에 저장됩니다.
          </p>
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
                  <label className="label">학교</label>
                  <input className="input" name="school" placeholder="신정중" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label">학년</label>
                  <input className="input" name="grade" placeholder="중2" />
                </div>
              </div>
              <div className="field">
                <label className="label">학부모 연락처</label>
                <input className="input" name="parent_phone" placeholder="010-0000-0000" />
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
            ) : students && students.length > 0 ? (
              <table className="tbl" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>학교·학년</th>
                    <th>학부모</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700 }}>{s.name}</td>
                      <td className="muted">
                        {[s.school, s.grade].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="muted">{s.parent_phone || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 18 }}>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                  아직 학생이 없습니다. 왼쪽에서 첫 학생을 추가해보세요.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
