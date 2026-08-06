import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { analyze, advice } from "@/lib/examAnalysis";
import AnalysisView from "./AnalysisView";

export const dynamic = "force-dynamic";

/**
 * **출제분석** — 이번 시험은 어디서 나왔고, 우리 애들은 어디서 틀렸나.
 *
 * 원장님 (2026-08-06) — 「출제분석하는 페이지도 필요한데」
 *
 * 두 가지에 답한다.
 *   1. **다음 시험에 무엇을 시킬까** — 출처 비중 (교과서 60% · 외부지문 …)
 *   2. **지금 무엇을 다시 볼까** — 우리 애들이 몰려 틀린 곳
 *
 * 자료는 두 군데서 온다 —
 *   `exam_questions`  원장님이 시험지를 보고 적으신 문항표 (`/scores/spec`)
 *   `score_items`     아이들이 적어 낸 오답 (학생 화면)
 *
 * **둘 중 하나만 있어도 화면이 뜬다.** 문항표만 있으면 출제 구성이,
 * 오답만 있으면 몇 번을 몇 명이 틀렸는지가 나온다. 둘 다 있어야만 보이면
 * 아무도 채우기 시작하지 않는다.
 */
export default async function AnalysisPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  // 회차 목록 — 문항표를 적어둔 것이 앞에 오게 (그것이 볼 것이 있는 시험이다)
  const { data: exams } = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date, to_date, english_on")
    .order("from_date", { ascending: false })
    .limit(80);

  let qCount = new Map();
  let blocked = false;
  if ((exams || []).length > 0) {
    const { data: qs, error } = await supabase
      .from("exam_questions")
      .select("exam_id")
      .in("exam_id", exams.map((e) => e.id));
    if (error) blocked = true;
    (qs || []).forEach((q) => qCount.set(q.exam_id, (qCount.get(q.exam_id) || 0) + 1));
  }

  const pick = searchParams?.exam || (exams || []).find((e) => qCount.get(e.id))?.id || (exams || [])[0]?.id || "";
  const exam = (exams || []).find((e) => e.id === pick) || null;

  let a = null;
  let notes = [];
  if (exam) {
    const { data: questions } = await supabase
      .from("exam_questions")
      .select("no, area, topic, detail, answer, points, unit, source, note")
      .eq("exam_id", exam.id)
      .order("no", { ascending: true });

    // 그 회차 성적 — exam_id 로 못 박힌 것이 우선이고, 없으면 학교·날짜로 찾는다.
    // **추측으로 찾은 것은 표시한다** (엉뚱한 시험지로 분석하면 전부 어긋난다)
    let { data: scores } = await supabase
      .from("scores")
      .select("id, student_id, kind, term, taken_on, raw_score, full_score, school, exam_id")
      .eq("exam_id", exam.id);

    let guessed = false;
    if (!scores || scores.length === 0) {
      const from = exam.from_date;
      const to = exam.to_date;
      const q = await supabase
        .from("scores")
        .select("id, student_id, kind, term, taken_on, raw_score, full_score, school, exam_id")
        .eq("kind", "school")
        .gte("taken_on", from)
        .lte("taken_on", to);
      const all = q.data || [];
      // 학교가 적혀 있으면 맞는 것만
      const norm = (v) => (v || "").replace(/\s/g, "");
      scores = all.filter((s) => !s.school || norm(s.school) === norm(exam.school));
      guessed = scores.length > 0;
    }

    let items = [];
    if ((scores || []).length > 0) {
      const { data: its } = await supabase
        .from("score_items")
        .select("score_id, no, wrong, reason")
        .in("score_id", scores.map((s) => s.id));
      items = its || [];
    }

    const ids = [...new Set((scores || []).map((s) => s.student_id))];
    let students = [];
    if (ids.length > 0) {
      const { data: st } = await supabase.from("students").select("id, name").in("id", ids);
      students = st || [];
    }

    a = analyze(questions || [], scores || [], items, students);
    a.guessed = guessed;
    notes = advice(a, exam.name || `${exam.school} 시험`);
  }

  return (
    <>
      <TopBar profile={profile} active="scores" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">
            <Link className="sky" href="/scores">성적</Link>
          </p>
          <h1 className="h1">출제분석</h1>
          <p className="sub">
            <b>이번 시험은 어디서 나왔나</b> — 다음 대비가 여기서 정해집니다.
            <br />
            <b>우리 애들은 어디서 틀렸나</b> — 한 아이가 틀린 것은 그 아이 일이지만,
            절반이 틀렸으면 우리가 안 가르친 것입니다.
          </p>
        </div>

        {blocked && (
          <div className="notice" style={{ marginTop: 12 }}>
            <b>0097 SQL 을 먼저 실행해주세요.</b> 문항표를 담을 표가 아직 없습니다.
          </div>
        )}

        <AnalysisView
          exams={exams || []}
          qCount={Object.fromEntries(qCount)}
          pick={pick}
          exam={exam}
          a={a}
          notes={notes}
        />
      </main>
    </>
  );
}
