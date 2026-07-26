import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ScheduleBoard from "./ScheduleBoard";
import { reviewClass, monthsFrom, addDaysISO } from "@/lib/schedule";
import { holidayAlerts } from "@/lib/holidays";
import { loadSettings } from "@/lib/settings";

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

  const settings = await loadSettings(supabase);
  const makeupDays = settings.schedule?.makeupDays || [];

  const reviews = (classes || []).map((klass) => {
    const roster = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => studentById.get(m.student_id))
      .filter(Boolean);
    return {
      klass,
      roster: roster.length,
      months: reviewClass(klass, months, holidays || [], exams, roster, makeupDays),
    };
  });

  // 공휴일 알림 — 수업이 잡혀 있는 날만
  const classDates = new Set();
  reviews.forEach((r) => r.months.forEach((m) => m.all.forEach((d) => classDates.add(d))));
  const decided = new Set((holidays || []).map((h) => h.date));
  const seoulToday = seoul.toISOString().slice(0, 10);
  const holidayNotes = holidayAlerts(seoulToday, to, classDates, decided);

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
            회차는 <b>한 달만 따로 보지 않습니다.</b> 이번 달이 7회여도 다음 달이 9회면
            보강·휴강 없이 그대로 수업하면 맞으므로, 3개월을 누적해서 언제 딱 맞아떨어지는지
            알림에 같이 적어줍니다. 3개월을 다 합쳐도 남을 때만 서비스·휴강을 결정하면 됩니다.
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
          holidayNotes={holidayNotes}
          makeupDays={makeupDays}
        />
      </main>
    </>
  );
}
