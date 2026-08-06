import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ScoreBoard from "./ScoreBoard";
import ScoreUpload from "./ScoreUpload";

export const dynamic = "force-dynamic";

export default async function ScoresPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, status")
    .order("name", { ascending: true });

  const pick = searchParams?.s || null;

  const { data: scores, error } = await supabase
    .from("scores")
    .select(
      "id, student_id, kind, taken_on, year, term, subject, raw_score, full_score, grade, percentile, rank_in, rank_of, school, cuts, note, source"
    )
    .order("taken_on", { ascending: false });

  // 시험 회차 — **등급컷이 사는 곳**이다 (0073).
  // 컷은 학생 것이 아니라 그 학교 그 회차 것이라, 성적 줄마다 적지 않고
  // 회차에 한 번 적어두고 여기서 끌어다 쓴다.
  let { data: exams } = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date, to_date, cuts")
    .order("from_date", { ascending: false });
  if (!exams) {
    // 0073 전이면 컷 칸 없이 (회차는 보이되 컷은 성적 줄의 것을 쓴다)
    ({ data: exams } = await supabase
      .from("exam_periods")
      .select("id, school, grade, name, from_date, to_date")
      .order("from_date", { ascending: false }));
  }

  const needSql = !!error && (error.code === "42P01" || error.code === "PGRST205");

  return (
    <>
      <TopBar profile={profile} active="scores" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">학생</p>
          <h1 className="h1">성적</h1>
          <p className="sub">
            학교 내신 · 모의고사 · 단원평가를 한자리에 모읍니다.
            <b> 등급컷을 같이 적어두면</b> 다음 시험에 몇 점이면 몇 등급인지 보입니다.
            <b> 틀린 문제까지</b> 남겨야 다음에 무엇을 다시 볼지 정할 수 있어요.
          </p>
        </div>

        {needSql ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="notice">
              성적을 쓰려면 설정 → Supabase SQL 에서 <b>0072</b> 를 한 번 실행해주세요.
            </div>
          </div>
        ) : (
          <>
            {/* **셋을 한 장으로** (원장님, 2026-08-06 — 「내신, 문법단원평가,
                모의고사 한번에 정리하고 싶은데 가능할까」). 앱 안에서 원래
                한 표에 들어가므로 섞어 올리셔도 된다 */}
            <ScoreUpload />
            <ScoreBoard
              students={students || []}
              scores={scores || []}
              exams={exams || []}
              pick={pick}
              canEdit={profile?.role === "principal"}
            />
          </>
        )}
      </main>
    </>
  );
}
