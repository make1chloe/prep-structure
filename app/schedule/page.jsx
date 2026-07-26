import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ScheduleBoard from "./ScheduleBoard";
import { reviewClass, monthsFrom, addDaysISO } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
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
  const startYM = seoul.toISOString().slice(0, 7);
  const months = monthsFrom(startYM, 3);
  const from = `${months[0]}-01`;
  const [ly, lm] = months[2].split("-").map(Number);
  const to = `${months[2]}-${String(new Date(ly, lm, 0).getDate()).padStart(2, "0")}`;

  let { data: classes } = await supabase
    .from("classes")
    .select("id, name, days, start_time, base_sessions")
    .order("start_time", { ascending: true });
  if (!classes) {
    ({ data: classes } = await supabase
      .from("classes")
      .select("id, name, days, start_time")
      .order("start_time", { ascending: true }));
  }

  const { data: holidays } = await supabase
    .from("holidays")
    .select("id, date, name, scope, class_id")
    .gte("date", from)
    .lte("date", to);

  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id");
  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, status")
    .eq("status", "enrolled");
  const studentById = new Map((students || []).map((s) => [s.id, s]));

  const examQ = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date, to_date, english_on, note")
    .gte("to_date", from)
    .order("from_date", { ascending: true });
  const ready = !examQ.error;
  const exams = (examQ.data || []).map((e) => ({
    ...e,
    eveDate: e.english_on ? addDaysISO(e.english_on, -1) : null,
  }));

  const reviews = (classes || []).map((klass) => {
    const roster = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => studentById.get(m.student_id))
      .filter(Boolean);
    return {
      klass,
      roster: roster.length,
      months: reviewClass(klass, months, holidays || [], exams, roster),
    };
  });

  const schools = [...new Set((students || []).map((s) => s.school).filter(Boolean))].sort();
  const grades = [...new Set((students || []).map((s) => s.grade).filter(Boolean))].sort();

  return (
    <>
      <TopBar profile={profile} active="schedule" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">수업 스케줄</p>
          <h1 className="h1">앞으로 3개월</h1>
          <p className="sub">
            달마다 회차가 몇 번인지, 시험 기간과 겹치는 수업이 있는지 미리 알려줍니다.
            9회처럼 회차가 많은 달은 그냥 하면 서비스, 쉬려면 휴강으로 지정하면 됩니다.
          </p>
        </div>
        <ScheduleBoard
          months={months}
          reviews={reviews}
          exams={exams}
          schools={schools}
          grades={grades}
          classes={classes || []}
          unavailable={!ready}
        />
      </main>
    </>
  );
}
