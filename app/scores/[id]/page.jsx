import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { oneRound, stack, points } from "@/lib/report";
import { KIND_LABEL } from "@/lib/scores";
import ReportView from "./ReportView";
import ShareBar from "./ShareBar";
import { sessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * **한 학생의 성적 리포트** — 원장님이 주신 엑셀과 같은 것.
 *
 * 원장님 (2026-08-06) — 「학생별 오답 기록해서 이렇게 리포트 만들고 싶어」
 *
 * 여기서는 **모으기만** 하고 계산은 lib/report.js 가 한다. 문항표는 세 겹으로
 * 찾는다 (그 회차 → 학원 기본 → 코드 표준) — lib/examSpec.js 의 specFor.
 */
export default async function ReportPage({ params, searchParams }) {
  const supabase = createClient();
  const user = await sessionUser(supabase);

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  // 공개 대상(0101)까지 — 없는 DB 면 「둘 다」 로 본다 (지금까지의 동작)
  let student = null;
  let shareBlocked = false;
  {
    const q = await supabase
      .from("students")
      .select("id, name, school, grade, status, score_share")
      .eq("id", params.id)
      .maybeSingle();
    if (q.error) {
      shareBlocked = true;
      const q2 = await supabase
        .from("students")
        .select("id, name, school, grade, status")
        .eq("id", params.id)
        .maybeSingle();
      student = q2.data || null;
    } else student = q.data || null;
  }

  if (!student) {
    return (
      <>
        <TopBar profile={profile} active="scores" />
        <main className="wrap">
          <div className="card" style={{ marginTop: 16 }}>
            <p>그 학생을 못 찾았어요.</p>
            <Link className="btn btn-ghost btn-sm" href="/scores">성적으로</Link>
          </div>
        </main>
      </>
    );
  }

  // 어느 종류를 볼까 — 기본은 모의고사 (문항별 자료가 여기에 쌓인다)
  const kind = searchParams?.kind || "mock";

  const { data: scores } = await supabase
    .from("scores")
    .select("*")
    .eq("student_id", student.id)
    .eq("kind", kind)
    .order("taken_on", { ascending: true });

  const list = scores || [];

  // 문항별 오답 — 0097 전이면 못 읽는다. 그때는 총점만 보여준다
  let items = [];
  let itemsBlocked = false;
  if (list.length > 0) {
    const { data, error } = await supabase
      .from("score_items")
      .select("score_id, no, wrong, picked, reason")
      .in("score_id", list.map((s) => s.id));
    if (error) itemsBlocked = true;
    else items = data || [];
  }

  // 학원 기본 문항표 (없으면 코드의 표준표를 쓴다)
  const { data: base } = await supabase
    .from("exam_spec_rows")
    .select("kind, no, area, topic, detail, points")
    .eq("kind", kind)
    .order("no", { ascending: true });

  // 그 회차만의 문항표
  const examIds = [...new Set(list.map((s) => s.exam_id).filter(Boolean))];
  let byExam = new Map();
  if (examIds.length > 0) {
    const { data: qs } = await supabase
      .from("exam_questions")
      .select("exam_id, no, area, topic, detail, answer, points, unit, source")
      .in("exam_id", examIds);
    (qs || []).forEach((q) => {
      if (!byExam.has(q.exam_id)) byExam.set(q.exam_id, []);
      byExam.get(q.exam_id).push(q);
    });
  }

  const itemsOf = (id) => items.filter((x) => x.score_id === id);
  const rounds = list.map((s) =>
    oneRound(s, itemsOf(s.id), byExam.get(s.exam_id) || [], base || [])
  );
  const st = stack(rounds);
  const notes = points(st, student.name);

  // 종류 고르개에 건수를 같이 적는다 — 빈 탭을 눌러보게 두지 않는다
  const { data: counts } = await supabase
    .from("scores")
    .select("kind")
    .eq("student_id", student.id);
  const countOf = (k) => (counts || []).filter((c) => c.kind === k).length;

  return (
    <>
      <TopBar profile={profile} active="scores" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">
            <Link className="sky" href="/scores">성적</Link>
            {" · "}
            {[student.school, student.grade].filter(Boolean).join(" ")}
          </p>
          <h1 className="h1">{student.name} 성장 리포트</h1>
          <p className="sub">
            {KIND_LABEL[kind] || kind} {st.n}회
            {st.n >= 2 && st.trend.key !== "none" && ` · 흐름 ${st.trend.label}`}
          </p>
          <div className="row" style={{ gap: 4, marginTop: 8 }}>
            {["mock", "school", "unit"].map((k) => (
              <Link
                key={k}
                href={`/scores/${student.id}?kind=${k}`}
                className={`btn btn-sm ${kind === k ? "btn-primary" : "btn-ghost"}`}
              >
                {KIND_LABEL[k]}
                {countOf(k) > 0 && (
                  <span className="hint" style={{ marginLeft: 4 }}>{countOf(k)}</span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {itemsBlocked && (
          <div className="notice" style={{ marginTop: 12 }}>
            <b>0097 SQL 을 먼저 실행해주세요.</b> 문항별 오답을 아직 못 읽어서
            총점만 보입니다 — 영역별 정답률은 문항이 있어야 나옵니다.
          </div>
        )}

        <ShareBar
          studentId={student.id}
          name={student.name}
          share={student.score_share || "both"}
          st={st}
          notes={notes}
          kindLabel={KIND_LABEL[kind] || kind}
          blocked={shareBlocked}
        />

        <ReportView
          name={student.name}
          kind={kind}
          rounds={rounds}
          st={st}
          notes={notes}
        />
      </main>
    </>
  );
}
