import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import PlanBoard from "./PlanBoard";
import MakeupInbox from "@/app/MakeupInbox";
import MakeupAnswers from "@/app/MakeupAnswers";
import { loadMakeupTodo } from "@/lib/makeupTodo";
import { todaySeoul, addDays } from "@/lib/day";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

/**
 * **출결** — 결석 예정 · 보강 · 지난 수업.
 *
 * 원장님 (2026-08-07)
 *   「수업준비페이지가 필요없나 싶어」
 *   「보강, 결석사전연락, 출석을 출결페이지에서 관리하는게 나을거 같기도 해.
 *    보강이나 결석예정 취소가 어렵네」
 *
 * ── 왜 무르기가 어려웠나 ─────────────────────────────────
 *
 * 출결이 세 군데로 흩어져 있었다.
 *
 *   출석 체크    오늘 수업
 *   결석 예정    수업 준비 (이 화면) 안의 한 탭
 *   보강         대시보드
 *
 * 넣는 길은 세 군데 다 있었는데 **무르는 길은 넣은 자리에 없었다.** 보강을
 * 무르려면 대시보드까지 가야 했고, 결석 예정은 「수업 준비」 라는 이름 안에
 * 숨어 있어서 애초에 거기 있는 줄을 몰랐다.
 *
 * 한 화면에 모은다. 그리고 **넣은 자리에서 바로 무를 수 있게** 한다 —
 * 앞으로의 결석 예정과 잡아둔 보강을 그대로 늘어놓고, 줄마다 취소를 단다.
 *
 * 숙제 미리 내기와 공지는 여기서 뺐다 (숙제 검사 화면으로 갔다). 검사를
 * 하면서 다음 숙제를 정하는 것이 실제 순서인데, 두 화면으로 갈라져 있어
 * 매번 두 번 열어야 했다.
 */
export default async function AttendancePage() {
  const supabase = await createClient();
  const today = todaySeoul();
  const user = await sessionUser(supabase);

  // **파도** — 서로 필요한 것이 없는 조회를 한꺼번에 (속도 대원칙)
  const [profileQ, classesQ, membersQ, studentsQ, absQ, makeupTodo, probe] = await Promise.all([
    user
      ? cachedProfile(supabase, user.id)
      : Promise.resolve({ data: null }),
    supabase
      .from("classes")
      .select("id, name, days, start_time")
      .order("start_time", { ascending: true }),
    supabase.from("class_students").select("class_id, student_id"),
    supabase
      .from("students")
      .select("id, name, school, grade, status")
      .eq("status", "enrolled")
      .order("name", { ascending: true }),
    supabase
      .from("attendance")
      .select("student_id, date, reason, note, status, makeup_of, makeup_time")
      .in("status", ["absent", "makeup"])
      // 보강은 지난 한 주 것도 본다 — 「완료 찍기」 는 끝난 뒤에 하는 일이다
      .gte("date", addDays(today, -7))
      .order("date", { ascending: true })
      .limit(300),
    loadMakeupTodo(supabase, today),
    supabase.from("attendance").select("planned").limit(1),
  ]);
  const profile = profileQ?.data || null;
  const { data: classes } = classesQ;
  const { data: members } = membersQ;
  const { data: students } = studentsQ;

  const daysOf = new Map((classes || []).map((c) => [c.id, c.days || []]));
  const classIdsOf = new Map();
  (members || []).forEach((m) => {
    if (!classIdsOf.has(m.student_id)) classIdsOf.set(m.student_id, []);
    classIdsOf.get(m.student_id).push(m.class_id);
  });

  const rows = (students || []).map((s) => {
    const cids = classIdsOf.get(s.id) || [];
    return {
      id: s.id,
      name: s.name,
      school: s.school,
      grade: s.grade,
      classIds: cids,
      days: [...new Set(cids.flatMap((cid) => daysOf.get(cid) || []))],
    };
  });

  /**
   * **앞으로 잡혀 있는 결석 예정** — 무르려면 먼저 보여야 한다.
   *
   * 오늘 것도 넣는다. 아침에 「오늘 못 간다」 연락이 오고 저녁에 「그냥
   * 보낼게요」 가 오는 일이 실제로 있다.
   */
  const { data: absRaw } = absQ;

  // 결석 예정 목록은 예전대로 오늘부터만
  const absences = (absRaw || []).filter((r) => r.status === "absent" && r.date >= today);

  /**
   * **잡힌 보강 + 완료 여부** (원장님, 2026-08-14 — 「보강 페이지에서는
   * 출결을 못 찍네. 보강 완료 찍으면 될 것 같은데」).
   * 완료 = 그날 리포트가 써졌다 (오늘 수업의 저장과 같은 기준 — 두 벌로
   * 세면 어긋난다).
   */
  const scheduled = (absRaw || []).filter((r) => r.status === "makeup");
  let writtenSet = new Set();
  if (scheduled.length) {
    const { data: reps } = await supabase
      .from("daily_reports")
      .select("student_id, date, report_written")
      .in("student_id", [...new Set(scheduled.map((r) => r.student_id))])
      .gte("date", addDays(today, -7));
    (reps || []).forEach((r) => {
      if (r.report_written) writtenSet.add(`${r.student_id}|${r.date}`);
    });
  }
  const scheduledMakeups = scheduled.map((r) => ({
    studentId: r.student_id,
    date: r.date,
    time: r.makeup_time ? String(r.makeup_time).slice(0, 5) : "",
    of: r.makeup_of || null,
    written: writtenSet.has(`${r.student_id}|${r.date}`),
  }));
  // 결석 하나에 보강이 잡혀 있나 — 「결석만 무르면 보강이 남는다」 를 말해주려고
  const makeupOn = {};
  (absRaw || [])
    .filter((r) => r.status === "makeup" && r.makeup_of)
    .forEach((r) => { makeupOn[`${r.student_id}|${r.makeup_of}`] = r.date; });

  const nameOf = Object.fromEntries((students || []).map((s) => [s.id, s.name]));

  // 보강 필요 — 셈은 lib/makeupTodo.js 한 군데에 있다 (대시보드도 같은 것을 쓴다)


  // planned 컬럼 유무 확인 (0017 실행 여부)

  const planReady = !probe.error;

  return (
    <>
      <TopBar profile={profile} active="plan" />
      <main className="wrap-wide">
        <div className="page-head">
          <h1 className="h1">출결</h1>
        </div>
        <PlanBoard
          classes={classes || []}
          students={rows}
          planReady={planReady}
          absences={absences}
          makeupOn={makeupOn}
          nameOf={nameOf}
          scheduledMakeups={scheduledMakeups}
          makeupInbox={<MakeupInbox rows={makeupTodo} />}
          makeupAnswers={<MakeupAnswers />}
        />
      </main>
    </>
  );
}
