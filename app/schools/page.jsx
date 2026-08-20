import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import ScheduleBoard from "@/app/schedule/ScheduleBoard";
import NeisBox from "@/app/schedule/NeisBox";
import SchoolBox from "@/app/schedule/SchoolBox";

import { reviewClass, monthsFrom, addDaysISO } from "@/lib/schedule";
import { loadClassesWithTerm } from "@/lib/classTerm";
import { holidayAlerts } from "@/lib/holidays";
import { loadSettings } from "@/lib/settings";
import { endOfMonth, todaySeoul } from "@/lib/day";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const supabase = createClient();
  const user = await sessionUser(supabase);

  const startYM = todaySeoul().slice(0, 7);
  const months = monthsFrom(startYM, 3);
  const from = `${months[0]}-01`;
  const to = endOfMonth(months[2]);

  // 숨김 칸이 아직 없는 DB 에서도 시험 목록은 그대로 보여야 한다
  const EXAM = "id, school, grade, name, from_date, to_date, english_on, note";

  // **파도** (속도 대원칙 — 원칙 6): 서로 필요한 것이 없는 조회를 한꺼번에
  const [profileQ, classes0, holidaysQ, membersQ, studentsQ, examQ0, settings, taskQ] =
    await Promise.all([
      user
        ? cachedProfile(supabase, user.id)
        : Promise.resolve({ data: null }),
      // **기간 칸을 꼭 같이 읽는다** — 안 읽으면 종강한 특강이 여기서도
      // 계속 수업하는 반으로 잡힌다 (2026-08-06)
      loadClassesWithTerm(supabase, "id, name, days, start_time, base_sessions"),
      supabase
        .from("holidays")
        .select("id, date, name, scope, class_id")
        .gte("date", from)
        .lte("date", to),
      supabase.from("class_students").select("class_id, student_id"),
      supabase
        .from("students")
        .select("id, name, school, grade, status")
        .eq("status", "enrolled"),
      supabase
        .from("exam_periods")
        .select(`${EXAM}, hidden, cuts, teacher, teachers, source, neis_source_id, neis_from, neis_to, neis_name`)
        .gte("to_date", from)
        .order("from_date", { ascending: true }),
      loadSettings(supabase),
      supabase.from("tasks").select("due_on, title").gte("due_on", from).lte("due_on", to),
    ]);
  const profile = profileQ?.data || null;

  let classes = classes0;
  if (classes.length === 0) {
    classes = await loadClassesWithTerm(supabase, "id, name, days, start_time");
  }
  classes = [...classes].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  const { data: holidays } = holidaysQ;
  const { data: members } = membersQ;
  const { data: students } = studentsQ;
  const studentById = new Map((students || []).map((s) => [s.id, s]));

  // 0073 전이면 등급컷 칸이 없다 — 한 단계씩 물러난다
  let examQ = examQ0;
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

  const makeupDays = settings.schedule?.makeupDays || [];

  const reviews = (classes || []).map((klass) => {
    const roster = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => studentById.get(m.student_id))
      .filter(Boolean);
    return {
      klass,
      roster: roster.length,
      // 숨긴 시험은 결석 예상·알림에서 뺀다 (schedule/page.jsx 와 같다)
      months: reviewClass(
        klass, months, holidays || [], exams.filter((e) => !e.hidden), roster, makeupDays
      ),
    };
  });

  // 공휴일 알림 — 수업이 잡혀 있는 날만
  const classDates = new Set();
  reviews.forEach((r) => r.months.forEach((m) => m.all.forEach((d) => classDates.add(d))));
  // 이미 결정한 날 = 휴강으로 잡았거나, '그냥 수업함' 으로 일정에 남겨둔 날
  /**
   * 「결정한 날」 은 **원장님이 정한 것만** 이다 (2026-08-21). 전에는 그날
   * tasks 에 뭐든 있으면 결정으로 쳤는데, 나이스 학사일정(공휴일 그 자체)이
   * 바로 그 tasks 로 들어와서 — 받아오는 순간 「쉴지 정해주세요」 알림이
   * 통째로 죽었다. 휴강을 못 잡으면 회차·수강료가 그대로 틀어진다.
   */
  const decided = new Set([
    ...(holidays || []).map((h) => h.date),
    ...(taskQ.error ? [] : taskQ.data || [])
      .filter((t) => (t.title || "").includes("— 정상 수업"))
      .map((t) => t.due_on),
  ]);
  const seoulToday = todaySeoul();
  const holidayNotes = holidayAlerts(seoulToday, to, classDates, decided);

  const schools = [...new Set((students || []).map((s) => s.school).filter(Boolean))].sort();
  // 「시험 회차 없음」 경고가 학교마다 왜 없는지 말해주게 — 코드 유무 (회차 화면과 같은 한 벌)
  const { data: schoolRows2 } = await supabase.from("schools").select("name, schul_code");
  const neisLinked = (schoolRows2 || []).filter((x) => x.schul_code).map((x) => x.name);
  const grades = [...new Set((students || []).map((s) => s.grade).filter(Boolean))].sort();

  return (
    <>
      <TopBar profile={profile} active="schools" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">학교</p>
          <h1 className="h1">학교 · 시험</h1>
          <Help>
            <p className="sub">
              학교는 <b>여기 한 곳</b>에만 있습니다. 재원생과 시험이 이 명단을 가리켜요.
              시험 회차에 <b>등급컷 · 출제 선생님 · 특이사항</b>을 적어두면 성적·내신 자료가
              그 회차를 함께 봅니다.
            </p>
          </Help>
        </div>
        {/* 학교 목록은 **하나뿐이다.** 예전에는 나이스 목록과 「학교 명단」 이
            같은 표를 두 번 보여줘서, 합치기를 어느 쪽에서 하는지 알 수 없었다.
            이름 고치기·직접 추가는 그 목록 안에 접어두었다. */}
        <NeisBox months={months} />
        <div className="row" style={{ marginTop: 8 }}>
          <SchoolBox />
        </div>
        <ScheduleBoard
          show="exams"
          months={months}
          reviews={reviews}
          exams={exams}
          roster={students || []}
          schools={schools}
          neisLinked={neisLinked}
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
