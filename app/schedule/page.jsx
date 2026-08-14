import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import ScheduleBoard from "./ScheduleBoard";

import { reviewClass, monthsFrom, addDaysISO } from "@/lib/schedule";
import { loadClassesWithTerm } from "@/lib/classTerm";
import { holidayAlerts } from "@/lib/holidays";
import { loadSettings } from "@/lib/settings";
import { endOfMonth, todaySeoul } from "@/lib/day";
import { sessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const supabase = createClient();
  const user = await sessionUser(supabase);

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  // **한 해를 통째로 본다** (원장님, 2026-08-05).
  //   「앞으로 3개월」 은 회차를 셈하는 방식이지 화면을 자르는 기준이 아니었다.
  //   1월부터 12월까지 다 놓고, 지나간 달은 아래로 접어 둔다.
  const today = todaySeoul();
  const year = today.slice(0, 4);
  const months = monthsFrom(`${year}-01`, 12);
  const from = `${year}-01-01`;
  const to = endOfMonth(months[11]);

  // **특강은 끝난다.** 개강·종강일을 같이 읽어야 그 기간 밖의 달에
  // 수업이 잡히지 않는다 — 「화목1 특강」 이 종강 뒤에도 계속 나왔다.
  // 기간 칸을 챙기는 일은 `loadClassesWithTerm` 한 군데에 있다 (0042 되돌리기 포함)
  let classes = await loadClassesWithTerm(supabase, "id, name, days, start_time, base_sessions");
  if (classes.length === 0) {
    classes = await loadClassesWithTerm(supabase, "id, name, days, start_time");
  }
  classes = [...classes].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

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

  // 숨김 칸이 아직 없는 DB 에서도 시험 목록은 그대로 보여야 한다
  const EXAM = "id, school, grade, name, from_date, to_date, english_on, note";
  // 0073 전이면 등급컷 칸이 없다 — 한 단계씩 물러난다
  let examQ = await supabase
    .from("exam_periods")
    .select(`${EXAM}, hidden, cuts, teacher, teachers, source, neis_source_id, neis_from, neis_to, neis_name`)
    .gte("to_date", from)
    .order("from_date", { ascending: true });
  if (examQ.error) {
    examQ = await supabase
      .from("exam_periods")
      .select(`${EXAM}, hidden`)
      .gte("to_date", from)
      .order("from_date", { ascending: true });
  }
  if (examQ.error) {
    examQ = await supabase
      .from("exam_periods")
      .select(EXAM)
      .gte("to_date", from)
      .order("from_date", { ascending: true });
  }
  const ready = !examQ.error;
  const exams = (examQ.data || []).map((e) => ({
    ...e,
    eveDate: e.english_on ? addDaysISO(e.english_on, -1) : null,
  }));

  const settings = await loadSettings(supabase);
  const makeupDays = settings.schedule?.makeupDays || [];

  // 결석 — 달력에 **누가** 빠지는지 적으려면 이름이 있어야 한다.
  // (전에는 「결석 예정」 이라고만 떠서, 누구 이야기인지 알려면 다른 화면을
  //  열어야 했다. 폰에서는 마우스를 올릴 수도 없다)
  let attQ = await supabase
    .from("attendance")
    .select("student_id, date, status, reason, planned")
    .eq("status", "absent")
    .gte("date", from)
    .lte("date", to);
  if (attQ.error) {
    attQ = await supabase
      .from("attendance")
      .select("student_id, date, status")
      .eq("status", "absent")
      .gte("date", from)
      .lte("date", to);
  }
  const absOf = new Map();          // student_id → [{ date, reason, planned }]
  (attQ.error ? [] : attQ.data || []).forEach((a) => {
    if (!absOf.has(a.student_id)) absOf.set(a.student_id, []);
    absOf.get(a.student_id).push({ date: a.date, reason: a.reason || "", planned: !!a.planned });
  });

  const reviews = (classes || []).map((klass) => {
    const roster = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => studentById.get(m.student_id))
      .filter(Boolean);
    // 이 반 아이들의 결석만 (달력은 반마다 하나씩 그린다)
    const absents = roster.flatMap((s) =>
      (absOf.get(s.id) || []).map((a) => ({ ...a, name: s.name }))
    );
    return {
      klass,
      roster: roster.length,
      absents,
      // 숨긴 시험은 **결석 예상·알림에서 뺀다.** 「숨기기」 를 눌러도 계산에는
      // 그대로 남아 있어서, 안 보는 시험 때문에 결석 예정이 뜨고 있었다.
      months: reviewClass(
        klass, months, holidays || [], exams.filter((e) => !e.hidden), roster, makeupDays
      ),
    };
  });

  // 공휴일 알림 — 수업이 잡혀 있는 날만
  const classDates = new Set();
  reviews.forEach((r) => r.months.forEach((m) => m.all.forEach((d) => classDates.add(d))));
  // 이미 결정한 날 = 휴강으로 잡았거나, '그냥 수업함' 으로 일정에 남겨둔 날
  const taskQ = await supabase
    .from("tasks")
    .select("due_on")
    .gte("due_on", from)
    .lte("due_on", to);
  const decided = new Set([
    ...(holidays || []).map((h) => h.date),
    ...(taskQ.error ? [] : taskQ.data || []).map((t) => t.due_on),
  ]);
  const seoulToday = today;
  const holidayNotes = holidayAlerts(seoulToday, to, classDates, decided);

  const schools = [...new Set((students || []).map((s) => s.school).filter(Boolean))].sort();
  const grades = [...new Set((students || []).map((s) => s.grade).filter(Boolean))].sort();

  return (
    <>
      <TopBar profile={profile} active="schedule" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">{year}년</p>
          <h1 className="h1">회차 관리</h1>
          <Help>
            <p className="sub">
              달력은 <b>달마다 하나</b>입니다. 휴강·시험 기간·결석만 칠하고, 무슨 일인지는
              달력 아래에 <b>반별로</b> 적습니다. 여느 때대로 수업하는 날은 표시하지 않습니다.
              <br />
              회차는 <b>한 달만 따로 보지 않습니다.</b> 이번 달이 7회여도 다음 달이 9회면
              그대로 수업하면 맞으므로, 몇 달을 누적해서 언제 딱 맞아떨어지는지 알림에 적어줍니다.
            </p>
          </Help>
        </div>
        <ScheduleBoard
          show="schedule"
          months={months}
          reviews={reviews}
          exams={exams}
          roster={students || []}
          schools={schools}
          grades={grades}
          classes={classes || []}
          unavailable={!ready}
          holidayNotes={holidayNotes}
          makeupDays={makeupDays}
          holidays={(holidays || []).sort((a, b) => a.date.localeCompare(b.date))}
        />
      </main>
    </>
  );
}
