import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import ScoreBoard from "./ScoreBoard";
import ScoreUpload from "./ScoreUpload";
import Link from "next/link";
import { missingScores } from "@/lib/menuBadges";
import { hiddenExamIds } from "@/lib/schedule";

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
      "id, student_id, kind, taken_on, year, term, subject, raw_score, full_score, grade, percentile, rank_in, rank_of, school, cuts, note, source, exam_id"
    )
    .order("taken_on", { ascending: false });

  // 시험 회차 — **등급컷이 사는 곳**이다 (0073).
  // 컷은 학생 것이 아니라 그 학교 그 회차 것이라, 성적 줄마다 적지 않고
  // 회차에 한 번 적어두고 여기서 끌어다 쓴다.
  let { data: exams } = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date, to_date, english_on, cuts")
    .order("from_date", { ascending: false });
  if (!exams) {
    // 0073 전이면 컷 칸 없이 (회차는 보이되 컷은 성적 줄의 것을 쓴다)
    ({ data: exams } = await supabase
      .from("exam_periods")
      .select("id, school, grade, name, from_date, to_date, english_on")
      .order("from_date", { ascending: false }));
  }

  const needSql = !!error && (error.code === "42P01" || error.code === "PGRST205");

  /**
   * **누구의 어느 시험 성적이 비었나** (원장님, 2026-08-08 —
   * 「알림 있는 거 성적 어디서 입력해야 하는지」).
   *
   * 메뉴에 「성장 3명」 이 떠도, 들어와서 아이를 하나씩 눌러 찾아야 했다.
   * 배지가 일을 늘린 셈이다. **메뉴와 같은 함수**로 목록을 만들어 여기
   * 펴 놓는다 (lib/menuBadges 의 missingScores) — 두 벌로 세면 언젠가
   * 배지와 목록이 다른 말을 한다.
   */
  const hidden = await hiddenExamIds(supabase).catch(() => new Set());
  const missing = missingScores({
    exams: exams || [],
    students: (students || []).filter((x) => x.status === "enrolled"),
    scores: (scores || []).filter((x) => x.kind === "school"),
    hidden,
  });

  return (
    <>
      <TopBar profile={profile} active="scores" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">학생</p>
          <h1 className="h1">성장</h1>
          <Help>
            <p className="sub">
              학교 내신 · 모의고사 · 단원평가를 한자리에 모읍니다.
              <b> 등급컷을 같이 적어두면</b> 다음 시험에 몇 점이면 몇 등급인지 보입니다.
              <b> 틀린 문제까지</b> 남겨야 다음에 무엇을 다시 볼지 정할 수 있어요.
            </p>
          </Help>
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
            {/* **배지를 눌러 들어온 자리다** — 무엇을 넣어야 하는지가
                바로 보여야 한다. 누르면 그 아이가 골라진다 */}
            {missing.length > 0 && (
              <div className="card sect sect-warn" style={{ marginBottom: 10 }}>
                <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  {/* **제목은 명사로** (원장님, 2026-08-08 — 「제목은 명사화해줘,
                      성적미입력」). 긴 서술문은 한 줄에서 눈이 한 번 더 멈춘다 */}
                  <b style={{ fontSize: 14 }}>성적 미입력</b>
                  <span className="tag tag-amber">{missing.length}건</span>
                  <span className="hint" style={{ fontSize: 11.5 }}>
                    누르면 그 학생이 골라집니다 — 아래에서 <b>어느 시험</b>을 고르고 점수를 적으세요.
                  </span>
                </div>
                <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {missing.slice(0, 30).map((m) => (
                    <Link
                      key={`${m.studentId}|${m.examId}`}
                      href={`/scores?s=${m.studentId}`}
                      className="btn btn-sm"
                      style={{ borderColor: "var(--amber)" }}
                      title={`${m.school} ${m.grade} · ${m.on}`}
                    >
                      <b style={{ fontSize: 12.5 }}>{m.name}</b>
                      <span className="hint" style={{ fontSize: 11 }}>{m.examName}</span>
                    </Link>
                  ))}
                  {missing.length > 30 && (
                    <span className="hint">외 {missing.length - 30}건</span>
                  )}
                </div>
              </div>
            )}

            <ScoreUpload />
            {/**
              * **누르면 진짜로 바뀌어야 한다** (원장님, 2026-08-08 —
              * 「성적 안 들어온 거 클릭이 안 돼」).
              *
              * 위 목록은 `/scores?s=…` 로 간다. 그런데 같은 화면 안에서
              * 주소만 바뀌는 것이라 React 는 **이미 있는 판을 그대로 둔다.**
              * 고른 학생은 판이 처음 뜰 때 한 번만 정해지므로(useState 의
              * 첫 값), 눌러도 아무 일이 안 일어난 것처럼 보였다.
              *
              * `key` 가 바뀌면 판을 새로 만든다 — 그래야 고른 학생이 바뀐다.
              */}
            <ScoreBoard
              key={pick || "none"}
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
