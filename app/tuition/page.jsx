import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import TuitionBoard from "./TuitionBoard";
import { classSessions, studentAmount, monthRange } from "@/lib/tuition";

export const dynamic = "force-dynamic";

export default async function TuitionPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const ym = searchParams?.m || seoul.toISOString().slice(0, 7);
  const { first, last } = monthRange(ym);

  // 반 (수강료 컬럼이 없으면 기본 조회)
  let { data: classes, error: clsErr } = await supabase
    .from("classes")
    .select("id, name, days, start_time, tuition, base_sessions")
    .order("start_time", { ascending: true });
  const ready = !clsErr;
  if (clsErr) {
    ({ data: classes } = await supabase
      .from("classes")
      .select("id, name, days, start_time")
      .order("start_time", { ascending: true }));
  }

  const { data: holidays } = await supabase
    .from("holidays")
    .select("id, date, name, scope, class_id")
    .gte("date", first)
    .lte("date", last)
    .order("date", { ascending: true });

  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id");

  let { data: students } = await supabase
    .from("students")
    .select("id, name, status, tuition, started_on, ended_on")
    .in("status", ["enrolled", "paused"]);
  if (!students) {
    ({ data: students } = await supabase.from("students").select("id, name, status"));
  }
  const studentById = new Map((students || []).map((s) => [s.id, s]));

  let total = 0;
  const groups = (classes || []).map((klass) => {
    const { all, off, live } = classSessions(ym, klass, holidays || []);
    const base = klass.base_sessions || live.length;
    const ids = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => m.student_id);
    const rows = ids
      .map((id) => studentById.get(id))
      .filter(Boolean)
      .map((s) => {
        const unit = s.tuition || klass.tuition || null;
        const calc = studentAmount(live, base, unit, s);
        return { student: s, ...calc };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name, "ko"));
    const sum = rows.reduce((a, r) => a + (r.amount || 0), 0);
    total += sum;
    return { klass, all, off, live, base, rows, sum };
  });

  return (
    <>
      <TopBar profile={profile} active="tuition" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">수강료</p>
          <h1 className="h1">이번 달 회차 · 수강료</h1>
          <p className="sub">
            휴강을 넣으면 회차가 줄고 수강료가 자동으로 계산됩니다. 입금 관리는 하지 않고, 금액만 보여줍니다.
          </p>
        </div>
        <TuitionBoard
          ym={ym}
          groups={groups}
          holidays={holidays || []}
          total={total}
          unavailable={!ready}
        />
      </main>
    </>
  );
}
