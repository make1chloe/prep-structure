import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ScoreBoard from "./ScoreBoard";

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

  // 학생이 직접 내는 설문지 주소
  const { data: formRow } = await supabase
    .from("integrations").select("config").eq("id", "score_form").maybeSingle();

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
          <ScoreBoard
            students={students || []}
            scores={scores || []}
            pick={pick}
            forms={formRow?.config || {}}
            canEdit={profile?.role === "principal"}
          />
        )}
      </main>
    </>
  );
}
