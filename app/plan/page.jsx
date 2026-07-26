import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import PlanBoard from "./PlanBoard";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, days, start_time")
    .order("start_time", { ascending: true });

  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id");

  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, status")
    .eq("status", "enrolled")
    .order("name", { ascending: true });

  // 학생별 반·수업요일·교재 (숙제 낼 때 교재 자동 선택에 쓴다)
  const daysOf = new Map((classes || []).map((c) => [c.id, c.days || []]));
  const classIdsOf = new Map();
  (members || []).forEach((m) => {
    if (!classIdsOf.has(m.student_id)) classIdsOf.set(m.student_id, []);
    classIdsOf.get(m.student_id).push(m.class_id);
  });

  const { data: stBooks } = await supabase
    .from("student_textbooks")
    .select("student_id, textbook_id, status");
  const booksOf = new Map();
  (stBooks || []).forEach((r) => {
    if (r.status && r.status !== "active") return;
    if (!booksOf.has(r.student_id)) booksOf.set(r.student_id, []);
    booksOf.get(r.student_id).push(r.textbook_id);
  });

  const rows = (students || []).map((s) => {
    const cids = classIdsOf.get(s.id) || [];
    return {
      id: s.id,
      name: s.name,
      school: s.school,
      grade: s.grade,
      classIds: cids,
      days: [...new Set(cids.flatMap((cid) => daysOf.get(cid) || []))],
      bookIds: booksOf.get(s.id) || [],
    };
  });

  const { data: items } = await supabase
    .from("homework_items")
    .select("id, name, category, sort")
    .eq("active", true)
    .order("sort", { ascending: true });

  const { data: books } = await supabase
    .from("textbooks")
    .select("id, name, area, status")
    .order("name", { ascending: true });
  const textbooks = (books || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name, area: b.area || "" }));

  // planned 컬럼 유무 확인 (0017 실행 여부)
  const probe = await supabase.from("attendance").select("planned").limit(1);
  const planReady = !probe.error;

  return (
    <>
      <TopBar profile={profile} active="plan" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">미리 작성</p>
          <h1 className="h1">다음 수업 준비</h1>
          <p className="sub">
            누구에게 할지 먼저 고르고, 숙제·결석 예정·공지를 넣습니다. 날짜는 각 작업에서 정하면 돼요.
          </p>
        </div>
        <PlanBoard
          classes={classes || []}
          students={rows}
          items={items || []}
          textbooks={textbooks}
          planReady={planReady}
        />
      </main>
    </>
  );
}
