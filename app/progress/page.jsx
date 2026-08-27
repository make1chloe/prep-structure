import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { loadRunningClasses } from "@/lib/classTerm";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import ProgressBoard from "./ProgressBoard";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";
import { todaySeoul, DOW } from "@/lib/day";
import { inUseOn } from "@/lib/bookUse";
import ProgressUpload from "./ProgressUpload";

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
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  const today = todaySeoul();
  const dow = DOW[new Date(`${today}T00:00:00+09:00`).getUTCDay()];

  // **파도** (속도 대원칙 — 원칙 6)
  const [profileQ, studentsQ, classesQ, membersQ, stBooksQ, booksQ, doingQ] = await Promise.all([
    user ? cachedProfile(supabase, user.id) : Promise.resolve({ data: null }),
    supabase
      .from("students")
      .select("id, name, school, grade, status")
      .eq("status", "enrolled")
      .order("name", { ascending: true }),
    // 종강한 특강은 안 보인다 — 반 목록은 classTerm 한 벌 (값-지도 P1-12)
    loadRunningClasses(supabase, "id, name, days, start_time").then((r) => ({ data: [...r].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")) })),
    supabase.from("class_students").select("class_id, student_id"),
    fetchAll(() => supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, assigned_on, ended_on, current_page, round, skip_acts, pause")
      .neq("status", "dropped")
      .order("student_id").order("textbook_id")),
    supabase.from("textbooks").select("id, name, area, status, total_pages"),
    // 하는 중(◐)으로 찍힌 단원 — 순차로 안 나가는 교재의 「오늘 위치」다
    fetchAll(() => supabase
      .from("student_unit_progress")
      .select("student_id, textbook_unit_id, round")
      .eq("status", "doing")
      .order("student_id").order("textbook_unit_id")),
  ]);
  const profile = profileQ?.data || null;
  const students = studentsQ.data || [];
  const classes = classesQ.data || [];
  const members = membersQ.data || [];

  // 절판·중단 교재도 **배정이 살아 있으면 보여준다** (2026-08-14 — 숨기면
  // 오늘 수업과 다른 말을 하고, 🧹 로 끝냄 처리할 길도 없다). 대신 표시한다.
  const bookById = new Map((booksQ.data || []).map((b) => [b.id, b]));
  const deadBook = (b) => !!(b.status && b.status !== "active");

  /**
   * ◐ 단원의 이름 — 이름 줄(접힌 상태)에서 바로 보여준다.
   * 열어봐야만 오늘 위치가 나오면, 훑는 화면에서 열다섯 번을 열게 된다.
   * 회독이 다른 옛 ◐ 는 뺀다 (2회독 시작 후 1회독 것이 남아 있을 수 있다).
   */
  const doingRows = doingQ.error ? [] : doingQ.data || [];
  const doingUnitIds = [...new Set(doingRows.map((r) => r.textbook_unit_id))];
  const { data: doingUnits } = doingUnitIds.length
    ? await supabase
        .from("textbook_units")
        .select("id, name, textbook_id")
        .in("id", doingUnitIds)
    : { data: [] };
  const unitById = new Map((doingUnits || []).map((u) => [u.id, u]));
  const doingOf = new Map();   // `${studentId}|${bookId}` → [단원 이름]
  doingRows.forEach((r) => {
    const u = unitById.get(r.textbook_unit_id);
    if (!u) return;
    const key = `${r.student_id}|${u.textbook_id}`;
    if (!doingOf.has(key)) doingOf.set(key, []);
    doingOf.get(key).push({ name: u.name, round: r.round || 1 });
  });


  // 학생 → 지금 쓰는 교재 (아직 시작 전·끝낸 것은 뺀다 — lib/bookUse 한 벌)
  // pause(0149) → skip_acts(0133) 가 없는 DB 면 한 칸씩 물러나며 다시 읽는다
  let stBookRows = stBooksQ.data;
  if (stBooksQ.error) {
    // 0149 전 — pause 없이 (skip_acts 는 지킨다)
    let fb = await fetchAll(() => supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, assigned_on, ended_on, current_page, round, skip_acts")
      .neq("status", "dropped")
      .order("student_id").order("textbook_id"));
    if (fb.error) {
      // 0133 전 — skip_acts 도 없이
      fb = await fetchAll(() => supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, status, assigned_on, ended_on, current_page, round")
        .neq("status", "dropped")
        .order("student_id").order("textbook_id"));
    }
    stBookRows = fb.data;
  }
  const booksOf = new Map();
  (stBookRows || []).forEach((r) => {
    if (!inUseOn(r, today)) return;
    const b = bookById.get(r.textbook_id);
    if (!b) return;
    if (!booksOf.has(r.student_id)) booksOf.set(r.student_id, []);
    const round = r.round || 1;
    booksOf.get(r.student_id).push({
      id: b.id,
      name: b.name,
      area: b.area || "",
      dead: deadBook(b),
      bookPages: b.total_pages || 0,
      curPage: r.current_page ?? "",
      skipActs: r.skip_acts || "",
      // 멈춤 (0149) — 진도 판(BookProgress)이 태그·토글로 보여준다
      pause: r.pause || null,
      round,
      doing: (doingOf.get(`${r.student_id}|${b.id}`) || [])
        .filter((d) => d.round === round)
        .map((d) => d.name),
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
          <Help>
            <p className="sub">
              학생을 열면 쓰는 교재가 나옵니다. 단원을 누르면 <b>안 함 → ◐ 하는 중 → ○ 완료</b>,
              단원이 없는 교재는 몇 페이지까지인지 적으면 돼요.
            </p>
          </Help>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <ProgressUpload />
          </div>
        </div>
        {/* 목록 카드는 보드 안에서 그린다 — PC 에서 학생을 열면 좌 목록 /
            우 교재 판의 좌우 분할(.splitview-board)로 서야 해서다 (B2) */}
        <ProgressBoard
          rows={rows}
          classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          allBooks={((booksQ && booksQ.data) || [])
            .filter((b) => !b.status || b.status === "active")
            .map((b) => ({ id: b.id, name: b.name, area: b.area || "" }))}
        />
      </main>
    </>
  );
}
