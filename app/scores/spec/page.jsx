import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import SpecEditor from "./SpecEditor";

export const dynamic = "force-dynamic";

/**
 * **문항표 관리** — 몇 번이 무슨 유형인가.
 *
 * 원장님 (2026-08-06) — 「기본값을 세팅하되, 수정 가능하게 해줘」
 */
export default async function SpecPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const { data: base, error } = await supabase
    .from("exam_spec_rows")
    .select("kind, no, area, topic, detail, points")
    .eq("kind", "mock")
    .order("no", { ascending: true });

  const blocked = !!error && (error.code === "42P01" || error.code === "PGRST205");

  const { data: exams } = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date")
    .order("from_date", { ascending: false })
    .limit(60);

  // 어느 회차에 문항표가 이미 있는지 (고르개에 ✓ 로 표시한다)
  const examRows = {};
  if (!blocked && (exams || []).length > 0) {
    const { data: qs } = await supabase
      .from("exam_questions")
      .select("exam_id, no, area, topic, detail, answer, points, unit, source")
      .in("exam_id", exams.map((e) => e.id));
    (qs || []).forEach((q) => {
      (examRows[q.exam_id] ||= []).push(q);
    });
    Object.values(examRows).forEach((list) => list.sort((a, b) => a.no - b.no));
  }

  return (
    <>
      <TopBar profile={profile} active="scores" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">
            <Link className="sky" href="/scores">성적</Link>
          </p>
          <h1 className="h1">문항표</h1>
          <p className="sub">
            몇 번이 무슨 유형인지를 적어두는 곳입니다. 이게 있어야
            <b> 틀린 번호만으로 영역별 정답률</b>이 나옵니다.
            <br />
            모의고사는 <b>이미 채워져 있습니다</b> — 45문항 구성이 학년·회차와 거의
            같아서 앱이 갖고 있습니다. <b>바뀐 해에는 여기서 고치시면 됩니다.</b>
          </p>
        </div>

        <SpecEditor
          base={base || []}
          exams={exams || []}
          examRows={examRows}
          blocked={blocked}
        />
      </main>
    </>
  );
}
