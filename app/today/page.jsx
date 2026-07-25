import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import TodayBoard from "./TodayBoard";

export const dynamic = "force-dynamic";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function TodayPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  // 오늘(서울) 기준 날짜와 요일
  const seoul = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const date = searchParams?.d || seoul.toISOString().slice(0, 10);
  const target = new Date(`${date}T00:00:00+09:00`);
  const dow = DAYS[target.getDay()];

  // 오늘 요일에 수업이 있는 반
  const { data: allClasses } = await supabase
    .from("classes")
    .select("id, name, days, start_time, end_time, room, level, category")
    .order("start_time", { ascending: true });
  const classes = (allClasses || []).filter((c) => (c.days || []).includes(dow));

  // 반 배정 + 학생
  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id");
  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, status")
    .eq("status", "enrolled");

  // 오늘 출결 기록
  const { data: att } = await supabase
    .from("attendance")
    .select("student_id, status, makeup_of")
    .eq("date", date);

  const studentById = new Map((students || []).map((s) => [s.id, s]));
  const attById = new Map((att || []).map((a) => [a.student_id, a]));
  const memberIds = new Set();

  const groups = classes.map((klass) => {
    const ids = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => m.student_id);
    const rows = ids
      .map((id) => studentById.get(id))
      .filter(Boolean)
      .map((s) => {
        memberIds.add(s.id);
        const a = attById.get(s.id);
        return {
          student: s,
          status: a?.status || null,
          isMakeup: a?.status === "makeup",
        };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name, "ko"));
    return { klass, rows };
  });

  // 오늘 반에 속하지 않지만 보강으로 오는 학생
  const extras = (att || [])
    .filter((a) => a.status === "makeup" && !memberIds.has(a.student_id))
    .map((a) => studentById.get(a.student_id))
    .filter(Boolean)
    .map((s) => ({ student: s, status: "makeup", isMakeup: true }));
  if (extras.length > 0) {
    groups.push({
      klass: { id: "makeup", name: "보강", start_time: null, end_time: null },
      rows: extras,
    });
  }

  const label = `${target.getMonth() + 1}월 ${target.getDate()}일 (${dow})`;

  return (
    <>
      <TopBar profile={profile} active="today" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">오늘 수업</p>
          <h1 className="h1">{label}</h1>
        </div>
        <TodayBoard date={date} groups={groups} />
      </main>
    </>
  );
}
