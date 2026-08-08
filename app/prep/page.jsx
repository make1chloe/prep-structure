import { createClient } from "@/lib/supabase/server";
import { examTitle, needsScope } from "@/lib/examList";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import PrepBoard from "./PrepBoard";
import { todaySeoul } from "@/lib/day";

export const dynamic = "force-dynamic";

/**
 * 내신 대비 — 시험 · 범위 · 자료 · 배정.
 *
 * 이전 앱이 안 쓰인 이유는 "미업로드 296건" 처럼 숫자만 크고 손이 안 갔기
 * 때문이다. 여기서는 **지금 할 것**을 맨 위에 몇 줄로 올린다.
 */
export default async function PrepPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const bad = (e) =>
    e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703");

  const [exams, scopes, materials, assigns, types, students] = await Promise.all([
    // 시험은 **한 군데**에만 있다 (0074). 예전에는 prep_exams 라는 표가 따로
    // 있어서, 같은 신송중 1학기 기말이 학사일정에도 있고 여기에도 있었다.
    supabase
      .from("exam_periods")
      .select("id, school, grade, name, from_date, to_date, english_on, teacher, teachers, note, cuts, hidden")
      .order("english_on", { ascending: true, nullsFirst: false }),
    supabase.from("prep_scopes").select("id, exam_id, name, unit_ids, note, sort").order("sort", { ascending: true }),
    supabase.from("prep_materials").select("id, scope_id, type_id, name, sort, note, need_make, need_print, need_card, need_hand, need_solve, need_grade, made_at, printed_at, card_at").order("sort", { ascending: true }),
    supabase.from("prep_assignments").select("id, material_id, student_id, handed_at, solved_at, graded_at, result, score, sort"),
    supabase.from("prep_material_types").select("id, parent_id, name, sort, active, need_make, need_print, need_card, need_hand, need_solve, need_grade").order("sort", { ascending: true }),
    supabase.from("students").select("id, name, school, grade, status").eq("status", "enrolled").order("name", { ascending: true }),
  ]);

  const missing = [exams, scopes, materials, assigns, types].some((q) => bad(q.error));

  // 시험 표가 학사일정과 같아졌다 (0074). 이 화면이 부르던 이름으로 맞춰준다 —
  // 화면 안쪽까지 다 고칠 일은 아니고, 여기 한 줄이면 된다.
  //   name → term (「1학기 기말」),  english_on → exam_date (영어 보는 날)
  // 숨긴 시험은 학사일정에서 이미 뺀 것이라 여기서도 뺀다.
  /**
   * **전국연합학력평가는 여기 안 온다** (원장님, 2026-08-06 —
   * 「대비하는 시험이 아니라서 일정만 확인하면 되고 시험범위자료는 필요없어」).
   *
   * 이 화면은 **범위를 담고 자료를 만드는 곳**이다. 모의고사는 범위가 없다 —
   * 그동안 배운 전부가 범위다. 목록에 섞여 있으면 고를 때마다 지나쳐야 하고,
   * 「범위 미등록」 으로 계속 재촉당한다. 일정은 회차 관리에 그대로 있다.
   */
  const examRows = (exams.data || [])
    .filter((e) => !e.hidden)
    .filter(needsScope)
    .map((e) => ({
      id: e.id,
      school: e.school,
      grade: e.grade,
      term: examTitle(e),
      exam_date: e.english_on || null,
      from_date: e.from_date,
      to_date: e.to_date,
      teachers: e.teachers || (e.teacher ? [e.teacher] : []),
      note: e.note || "",
      cuts: e.cuts || [],
    }));

  // 범위에 담긴 단원 이름 (교재 › 대 › 중 › 문제)
  const unitIds = [...new Set((scopes.data || []).flatMap((s) => s.unit_ids || []))];
  const unitLabel = {};
  if (unitIds.length) {
    const { data: picked } = await supabase
      .from("textbook_units")
      .select("id, name, parent_id, textbook_id, question_no")
      .in("id", unitIds);
    const bookIds = [...new Set((picked || []).map((u) => u.textbook_id))];
    const { data: all } = bookIds.length
      ? await supabase
          .from("textbook_units")
          .select("id, name, parent_id, textbook_id, question_no")
          .in("textbook_id", bookIds)
      : { data: [] };
    const { data: books } = bookIds.length
      ? await supabase.from("textbooks").select("id, name").in("id", bookIds)
      : { data: [] };
    const bookName = new Map((books || []).map((b) => [b.id, b.name]));
    const byId = new Map((all || []).map((u) => [u.id, u]));
    (picked || []).forEach((u) => {
      const chain = [];
      let cur = u;
      const seen = new Set();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        chain.unshift(cur.question_no ? `${cur.question_no}번` : cur.name);
        cur = cur.parent_id ? byId.get(cur.parent_id) : null;
      }
      unitLabel[u.id] = `${bookName.get(u.textbook_id) || ""} › ${chain.join(" › ")}`;
    });
  }

  return (
    <>
      <TopBar profile={profile} active="prep" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">내신 대비</p>
          <h1 className="h1">시험 · 범위 · 자료</h1>
          <Help>
            <p className="sub">
              시험범위는 <b>교재DB에서 단원·문제를 골라</b> 담습니다. 자료는 범위마다
              만들고, <b>배정은 학생마다 다르게</b> 합니다.
            </p>
          </Help>
        </div>

        {missing ? (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="err">
              설정 → Supabase SQL 에서 <b>0052~0054</b> 를 먼저 실행해주세요.
            </div>
          </div>
        ) : (
          <PrepBoard
            today={todaySeoul()}
            exams={examRows}
            scopes={scopes.data || []}
            materials={materials.data || []}
            assigns={assigns.data || []}
            types={types.data || []}
            students={students.data || []}
            unitLabel={unitLabel}
            pick={searchParams?.e || ""}
          />
        )}
      </main>
    </>
  );
}
