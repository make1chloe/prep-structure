import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddStudentForm from "./AddStudentForm";
import ExcelUpload from "./ExcelUpload";
import BulkAccounts from "./BulkAccounts";
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

  const SCOLS =
    "id, name, school, grade, birth_year, gender, student_phone, parent_phone, status, enrolled_on, electives, note, login_id, profile_id, created_at";
  let { data: students, error } = await supabase
    .from("students")
    .select(`${SCOLS}, word_when, word_test_count, word_cut_pct`)
    .order("created_at", { ascending: false });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0070 전이면 단어시험 칸 없이
    ({ data: students, error } = await supabase
      .from("students")
      .select(SCOLS)
      .order("created_at", { ascending: false }));
  }

  // 통과선 기본값 — 학생마다 정하지 않았으면 이걸 쓴다
  const { data: warnRow } = await supabase
    .from("integrations").select("config").eq("id", "warning").maybeSingle();
  const defaultPass = Number(warnRow?.config?.wordPassPct) || 90;

  // 아직 초기 비밀번호(0000) 그대로인 학생.
  // 아이디가 규칙적이라, 한 번도 안 들어온 계정은 남이 열 수 있다. 챙겨야 한다.
  const pids = (students || []).map((s) => s.profile_id).filter(Boolean);
  const initPw = new Set();
  if (pids.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, must_change_pw")
      .in("id", pids);
    (profs || []).forEach((p) => p.must_change_pw && initPw.add(p.id));
  }
  // 교재는 **학생마다 다르다** — 같은 반이어도 다르다. 그래서 재원생 목록에서
  // 바로 바꿀 수 있어야 한다 (예전에는 오늘 수업 화면 안에만 있어서, 오늘 수업이
  // 없는 학생은 손댈 수가 없었다).
  const { data: allBooks } = await supabase
    .from("textbooks")
    .select("id, name, area, status")
    .order("name", { ascending: true });
  const textbooks = (allBooks || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name, area: b.area || "" }));
  const bookById = new Map(textbooks.map((b) => [b.id, b]));

  const ids = (students || []).map((x) => x.id);
  const { data: stBooks } = ids.length
    ? await supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, status")
        .in("student_id", ids)
    : { data: [] };
  const booksOf = new Map();
  (stBooks || []).forEach((r) => {
    if (r.status && r.status !== "active") return;   // 끝냈거나 그만둔 교재는 뺀다
    const b = bookById.get(r.textbook_id);
    if (!b) return;
    if (!booksOf.has(r.student_id)) booksOf.set(r.student_id, []);
    booksOf.get(r.student_id).push(b);
  });

  const rows = (students || []).map((s) => ({
    ...s,
    initPw: !!s.profile_id && initPw.has(s.profile_id),
    books: booksOf.get(s.id) || [],
  }));

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
          <div style={{ marginTop: 4 }}>
            <BulkAccounts />
          </div>
        </div>

        <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          {error ? (
            <div style={{ padding: 18 }}>
              <div className="err">불러오기 실패: {error.message}</div>
            </div>
          ) : (
            <StudentList students={rows} textbooks={textbooks} defaultPass={defaultPass} />
          )}
        </div>
      </main>
    </>
  );
}
