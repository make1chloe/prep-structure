import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ProgressBoard from "./ProgressBoard";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";
import { todaySeoul, DOW } from "@/lib/day";
import { inUseOn } from "@/lib/bookUse";

export const dynamic = "force-dynamic";

/**
 * **진도** — 학생별로 「오늘 어디 하고 있나」 를 한 자리에서 적는다
 * (원장님, 2026-08-14 — 「학생별로 진도를 점검할 페이지가 하나 필요해.
 * 학생별로 쓰고 있는 교재 목록이 나오고, 그 옆에 교재 어느 단원 또는
 * 어느 페이지를 오늘 하고 있는지를 적는 거야」).
 *
 * 지금까지 진도는 오늘 수업(그날 로스터)과 재원생(아이 하나)에서만 적을 수
 * 있었다 — 「반 전체를 죽 훑으며 적는」 자리가 없었다.
 *
 * **적는 판은 새로 만들지 않는다** — components/BookProgress 한 벌을 그대로
 * 쓴다 (오늘 수업·재원생과 같은 판). 두 벌이면 한쪽에서 찍은 진도가 다른
 * 쪽에 안 보인다. 이 화면은 그 판을 학생 명단으로 감싼 것뿐이다.
 */
export default async function ProgressPage() {
  const supabase = createClient();
  const user = await sessionUser(supabase);
  const today = todaySeoul();
  const dow = DOW[new Date(`${today}T00:00:00+09:00`).getUTCDay()];

  // **파도** (속도 대원칙 — 원칙 6)
  const [profileQ, studentsQ, classesQ, membersQ, stBooksQ, booksQ] = await Promise.all([
    user ? cachedProfile(supabase, user.id) : Promise.resolve({ data: null }),
    supabase
      .from("students")
      .select("id, name, school, grade, status")
      .eq("status", "enrolled")
      .order("name", { ascending: true }),
    supabase.from("classes").select("id, name, days, start_time").order("start_time", { ascending: true }),
    supabase.from("class_students").select("class_id, student_id"),
    supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, assigned_on, ended_on, current_page, round")
      .neq("status", "dropped"),
    supabase.from("textbooks").select("id, name, area, status, total_pages"),
  ]);
  const profile = profileQ?.data || null;
  const students = studentsQ.data || [];
  const classes = classesQ.data || [];
  const members = membersQ.data || [];

  const bookById = new Map(
    (booksQ.data || [])
      .filter((b) => !b.status || b.status === "active")
      .map((b) => [b.id, b])
  );

  // 학생 → 지금 쓰는 교재 (아직 시작 전·끝낸 것은 뺀다 — lib/bookUse 한 벌)
  const booksOf = new Map();
  (stBooksQ.data || []).forEach((r) => {
    if (!inUseOn(r, today)) return;
    const b = bookById.get(r.textbook_id);
    if (!b) return;
    if (!booksOf.has(r.student_id)) booksOf.set(r.student_id, []);
    booksOf.get(r.student_id).push({
      id: b.id,
      name: b.name,
      area: b.area || "",
      bookPages: b.total_pages || 0,
      curPage: r.current_page ?? "",
      round: r.round || 1,
    });
  });

  const classesOf = new Map();
  members.forEach((m) => {
    if (!classesOf.has(m.student_id)) classesOf.set(m.student_id, []);
    classesOf.get(m.student_id).push(m.class_id);
  });
  // 오늘 수업이 있는 반 — 「오늘 수업만」 필터의 기준
  const todayClassIds = new Set(
    classes.filter((c) => (c.days || []).includes(dow)).map((c) => c.id)
  );

  const rows = students.map((s) => ({
    ...s,
    books: booksOf.get(s.id) || [],
    classIds: classesOf.get(s.id) || [],
    todayClass: (classesOf.get(s.id) || []).some((id) => todayClassIds.has(id)),
  }));

  return (
    <>
      <TopBar profile={profile} active="progress" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">오늘</p>
          <h1 className="h1">진도</h1>
          <p className="sub">
            학생을 열면 쓰는 교재가 나옵니다. 단원을 누르면 <b>안 함 → ◐ 하는 중 → ○ 완료</b>,
            단원이 없는 교재는 몇 페이지까지인지 적으면 돼요.
          </p>
        </div>
        <div className="card" style={{ marginTop: 12, padding: 0 }}>
          <ProgressBoard
            rows={rows}
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          />
        </div>
      </main>
    </>
  );
}
