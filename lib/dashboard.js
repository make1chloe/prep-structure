// 대시보드가 읽는 것을 한곳에 모은다.
//
// 왜 화면에서 빼냈나
//   1) 쿼리를 **한꺼번에** 던지기 위해서다. 화면 안에 있을 때는 await 이 스물다섯 번
//      줄줄이 이어져서, 앞의 것이 끝나야 뒤의 것이 시작됐다. 서로 상관없는 것들인데도.
//   2) 시뮬레이션이 **같은 함수를 부를 수 있게** 하기 위해서다. 전에는 화면의 판단 규칙을
//      시뮬에 옮겨 적어 뒀는데, 그것 자체가 두 번 적는 일이었다. (원칙1)
//
// 규칙: 여기서는 **읽고 세기만** 한다. 무엇을 크게 보여줄지는 화면이 정한다.

import { tally } from "./warnings.js";
import { examTitle } from "./calendar.js";
import { fetchAll } from "./fetchAll.js";
import { buildMakeupRows } from "./makeupTodo.js";
import { unitProgress, stuckAcross, RETEST_WARN_AT } from "./unitStreak.js";
import { classSessions, studentAmount } from "./tuition.js";
import { reviewClass, monthsFrom, addDaysISO, hiddenExamIds } from "./schedule.js";
import { holidayAlerts } from "./holidays.js";
import { needsScope } from "./examList.js";
import { loadSettings } from "./settings.js";
import { inUseOn } from "./bookUse.js";
import { firstDayEvents } from "./firstDay";
import { ccUserIdxOf, plannerRunningOut, ccWordItem, ccStale, ccTodayGap } from "./classcard";
import {
  todaySeoul, dowOf, addDays, addMonths, endOfMonth,
} from "./day.js";

/** 마이그레이션이 아직 안 돌았을 수 있다. 없는 표는 조용히 빈 목록으로 본다. */
const rows = (q) => (q?.error ? [] : q?.data || []);

/**
 * **「진도 시작 안 함」 유예 기간(일)** (원장님 2026-08-22 — 「교재 배정됐는데
 * 진도 체크 안 된 학생 대시보드에 알려줘」). 배정하고 이 날수가 지나도록
 * 진도가 한 줄도 없으면 올린다. 배정 직후는 책을 사서 시작하기까지의
 * 정상 공백이라 재촉하지 않는다 (규칙 7 — 유예 기간은 재촉 금지).
 * 너무 이르다/늦다 싶으면 이 숫자 하나만 조율하면 된다.
 */
const GRACE_DAYS = 7;

/**
 * 대시보드 한 판.
 * @returns 화면이 그대로 그릴 수 있는 모양 (판단은 끝나 있다)
 */
export async function loadDashboard(supabase, today = todaySeoul()) {
  const dow = dowOf(today);
  const weekEnd = addDays(today, 7);
  const monthEnd = endOfMonth(addMonths(today.slice(0, 7), 1));
  const thisMonthEnd = endOfMonth(today.slice(0, 7));
  const ym = today.slice(0, 7);
  const twoWeeksAgo = addDays(today, -14);
  const monthAgo = addDays(today, -30);
  const sixtyAgo = addDays(today, -60);
  const months3 = monthsFrom(ym, 3);
  const scheduleTo = endOfMonth(months3[2]);

  // ── 1차: 서로 상관없는 것들을 한꺼번에 ──────────────────────────
  const [
    classesQ, membersQ, attTodayQ, repTodayQ, taskQ, overdueQ, holQ,
    plannedAbsQ, studentsQ, recentRepQ, absencesQ, makeupsQ, reqQ, inqQ,
    unsentQ, holAllQ, examQ, commentQ, decidedQ, warnRepQ, warnActQ,
    sendFailQ, prepScopeQ, monthAttQ, settings, payQ,
  ] = await Promise.all([
    // **기간 칸(starts_on·ends_on·archived_at)을 꼭 같이 읽는다.**
    // 안 읽으면 undefined 가 되고, undefined 는 「무기한」 으로 읽혀서
    // 8월 11일에 끝난 특강이 9월에도 계속 수업하는 반이 된다 (2026-08-06)
    supabase.from("classes").select("id, name, days, start_time, end_time, room, base_sessions, tuition, starts_on, ends_on, archived_at").order("start_time", { ascending: true }),
    supabase.from("class_students").select("class_id, student_id"),
    supabase.from("attendance").select("student_id, status, planned, reason, makeup_of").eq("date", today),
    supabase.from("daily_reports").select("student_id, report_written").eq("date", today),
    supabase.from("tasks").select("id, title, kind, category, due_on, end_on, start_time, status, deliver_body, notice_body, priority").gte("due_on", today).lte("due_on", monthEnd).eq("status", "open").order("due_on", { ascending: true }),
    // **지난 것은 할일만** 본다. 학사일정은 내가 처리할 일이 아니라 학교가 하는 일이라,
    // 지나갔다고 밀린 것이 아니다. 한 해치를 받아오면 지난 3~7월 학교 행사가
    // 통째로 '지난 할일' 로 쌓인다.
    supabase.from("tasks").select("id, title, due_on, kind").eq("kind", "todo").lt("due_on", today).eq("status", "open").order("due_on", { ascending: true }).limit(10),
    supabase.from("holidays").select("id, date, name, scope").gte("date", today).lte("date", monthEnd).order("date", { ascending: true }),
    supabase.from("attendance").select("student_id, date, status, planned, reason").gte("date", today).lte("date", weekEnd).eq("planned", true),
    supabase.from("students").select("id, name, school, grade, status, enrolled_on, ended_on, birth_year").eq("status", "enrolled"),
    supabase.from("daily_reports").select("id, student_id, date").gte("date", twoWeeksAgo).lte("date", today),
    // 보강 필요 — 기간 제한 없이 누적 (원장님 2026-08-21 「무조건 누적」).
    // 결정(잡기/없음)이 있어야만 내려간다. 하한은 출결 관리 시작(2026-08)
    supabase.from("attendance").select("student_id, date, status, planned, reason, note, makeup_waived").eq("status", "absent").gte("date", "2026-08-01").lte("date", addDays(today, 30)),
    supabase.from("attendance").select("student_id, makeup_of").eq("status", "makeup").not("makeup_of", "is", null),
    /**
     * **처리한 것도 보인다** (원장님, 2026-08-07 — 「제출 후에 나한테는 다
     * 보이게 해줘」).
     *
     * 예전에는 `status='new'` 만 받아서, 「확인」 을 누르는 순간 사라졌다.
     * 무슨 말을 주고받았는지 다시 볼 수가 없었고, 답장을 한 번 더 드리려면
     * 갈 데가 없었다. 최근 것을 통째로 받아 화면에서 가른다.
     */
    supabase.from("requests").select("id, student_id, kind, from_date, to_date, body, status, reply, thread, author_role, canceled_at, handled_at, done_at, created_at, photos").order("created_at", { ascending: false }).limit(30),
    supabase.from("inquiries").select("id, name, school, grade, status, form_submitted_at, test_want_on, visit_on, created_at").in("status", ["new", "scheduled"]).order("created_at", { ascending: false }).limit(10),
    // 오늘 것만 보면 **어제 써놓고 안 보낸 리포트가 영영 안 보인다.** 지난 것까지 본다
    supabase.from("daily_reports").select("id, student_id, date, skip_kinds").lte("date", today).gte("date", monthAgo).eq("report_written", true).is("sent_at", null).order("date", { ascending: true }),
    supabase.from("holidays").select("date, scope, class_id").gte("date", today).lte("date", scheduleTo),
    supabase.from("exam_periods").select("id, school, grade, name, from_date, to_date, english_on").gte("to_date", today).order("from_date", { ascending: true }),
    supabase.from("report_comments").select("id, body, author_role, created_at, student_id, daily_report_id").is("read_at", null).neq("author_role", "staff").order("created_at", { ascending: false }).limit(10),
    supabase.from("tasks").select("due_on").gte("due_on", today).lte("due_on", scheduleTo),
    // 경고 — 두 달치면 충분하다 (정산하면 그 앞은 안 센다)
    supabase.from("daily_reports").select("id, student_id, date, attendance_kind, word_correct, word_total").gte("date", sixtyAgo).lte("date", today).order("date", { ascending: true }),
    supabase.from("warning_actions").select("student_id, kind, on_date, target_date"),
    supabase.from("report_sends").select("id, daily_report_id, kind, sent_at, ok, detail").eq("ok", false).gte("sent_at", `${monthAgo}T00:00:00Z`).order("sent_at", { ascending: false }).limit(20),
    supabase.from("prep_scopes").select("id, exam_id"),
    supabase.from("attendance").select("student_id, status").gte("date", `${ym}-01`).lte("date", thisMonthEnd),
    loadSettings(supabase),
    supabase.from("payments").select("student_id, ym, paid_on").eq("ym", ym),
  ]);

  // 숨긴 시험은 알림에서 뺀다 (0060 전이면 숨긴 것이 없는 것으로 본다)
  const hiddenExams = await hiddenExamIds(supabase);

  // 0042 전 DB 에는 기간 칸이 없어서 위 조회가 통째로 실패한다. 그러면 반이
  // 하나도 없는 대시보드가 되므로(오류도 안 뜬다) 기간 칸 없이 한 번 더 묻는다
  const allClasses = classesQ?.error
    ? rows(await supabase.from("classes")
        .select("id, name, days, start_time, end_time, room, base_sessions, tuition")
        .order("start_time", { ascending: true }))
    : rows(classesQ);
  const members = rows(membersQ);
  const students = rows(studentsQ);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const studentInfo = new Map(students.map((s) => [s.id, s]));

  // ── 오늘 수업 ────────────────────────────────────────────────
  const todayClasses = allClasses.filter((c) => (c.days || []).includes(dow));
  const todayIds = new Set(
    members.filter((m) => todayClasses.some((c) => c.id === m.class_id)).map((m) => m.student_id)
  );
  const attToday = rows(attTodayQ);
  const plannedOff = attToday.filter((a) => a.planned && a.status === "absent").length;
  const written = rows(repTodayQ).filter((r) => r.report_written && todayIds.has(r.student_id)).length;
  const todayTotal = todayIds.size;

  // ── 달력 ────────────────────────────────────────────────────
  // 목록은 "무엇이 있나" 만 보여준다. 언제 몰려 있는지는 달력이라야 보인다.
  // 지난 달부터 다음 달까지 — 화면에서 앞뒤로 넘겨볼 수 있게.
  const calFrom = `${addMonths(ym, -1)}-01`;
  const calTo = endOfMonth(addMonths(ym, 1));
  const calQ = await supabase
    .from("tasks")
    .select("id, title, kind, due_on, source, status")
    .gte("due_on", calFrom)
    .lte("due_on", calTo)
    .neq("status", "canceled")
    .order("due_on", { ascending: true });
  const calendar = rows(calQ).map((t) => ({
    date: t.due_on,
    endDate: t.end_on || null,   // 방학처럼 여러 날짜리는 달력에서 펼친다
    title: t.title,
    // 색은 세 가지만 — 학교가 하는 일 / 우리 일정 / 내가 할 일
    tone: t.kind === "todo" ? "todo" : t.source === "neis" ? "school" : "event",
    pri: t.priority || 0,
    href: t.kind === "todo" ? "/tasks?view=todo" : "/tasks",
  }));
  // 첫 등원 — students 의 등원시작일에서 그때그때 읽는다 (lib/firstDay).
  // 예전 방식으로 tasks 에 이미 복사된 줄과는 제목+날짜로 겹침 방지.
  {
    const had = new Set(calendar.map((c) => `${c.title}|${c.date}`));
    firstDayEvents(students, calFrom, calTo).forEach((e) => {
      if (had.has(`${e.title}|${e.date}`)) return;
      calendar.push({ date: e.date, endDate: null, title: e.title, tone: "event", pri: 0, href: "/students" });
    });
    calendar.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ── 일정 ────────────────────────────────────────────────────
  const all = rows(taskQ);
  const tasks = all.filter((t) => t.kind !== "todo");
  {
    // 첫 등원도 일정 묶음에 — 위 달력과 같은 까닭, 같은 판정(lib/firstDay)
    const had = new Set(tasks.map((t) => `${t.title}|${t.due_on}`));
    firstDayEvents(students, today, monthEnd).forEach((e) => {
      if (had.has(`${e.title}|${e.date}`)) return;
      tasks.push({ id: `first-${e.studentId}`, title: e.title, kind: "schedule", category: "기타", due_on: e.date, status: "open", priority: 0 });
    });
    tasks.sort((a, b) => (a.due_on || "").localeCompare(b.due_on || ""));
  }
  const todos = all.filter((t) => t.kind === "todo");
  const overdue = rows(overdueQ);

  const warnReports = rows(warnRepQ);
  const warnActions = rows(warnActQ);
  const studentOfReport = new Map(warnReports.map((r) => [r.id, r.student_id]));
  // 실패한 발송이 **몇 일자 것인지** — 대시보드에서 그 날짜 발송 화면으로 바로 가야 한다
  const dateOfReport = new Map(warnReports.map((r) => [r.id, r.date]));

  // ── 발송 — 안 나간 것과 실패한 것 ────────────────────────────
  // 0058 이 아직이면 컬럼이 없어 통째로 실패한다 — 그때는 안 보내기 없이 다시 읽는다
  const unsentAll = unsentQ?.error
    ? rows(
        await supabase
          .from("daily_reports").select("id, student_id, date")
          .lte("date", today).gte("date", monthAgo)
          .eq("report_written", true).is("sent_at", null)
          .order("date", { ascending: true })
      )
    : rows(unsentQ);
  // **일부러 안 보내기로 한 것은 빼고** 센다. 안 그러면 정리해도 목록에 남아서,
  // 매일 같은 줄을 눈으로 걸러내야 한다 (그게 114건이 된 이유다)
  const notSkipped = unsentAll.filter((r) => !(r.skip_kinds || []).includes("report"));
  const unsentToday = notSkipped.filter((r) => r.date === today);
  const unsentPast = notSkipped
    .filter((r) => r.date < today)
    .map((r) => ({ ...r, name: nameOf.get(r.student_id) || "학생" }));
  const sendFails = rows(sendFailQ).map((s) => ({
    ...s,
    name: nameOf.get(studentOfReport.get(s.daily_report_id)) || "",
    date: dateOfReport.get(s.daily_report_id) || null,
  }));

  // ── 경고 · 반성문 문턱 — lib/warnings 를 그대로 쓴다 ──────────
  const repIdsAll = warnReports.map((r) => r.id);
  const itemsQ = repIdsAll.length
    ? await fetchAll(() =>
        supabase.from("daily_report_items").select("daily_report_id, status")
          .in("daily_report_id", repIdsAll).order("daily_report_id"))
    : null;
  const itemsOf = new Map();
  rows(itemsQ).forEach((i) => {
    const cur = itemsOf.get(i.daily_report_id) || [];
    cur.push({ status: i.status });
    itemsOf.set(i.daily_report_id, cur);
  });

  const rule = settings.warning || undefined;
  const warnings = [];
  for (const s of students) {
    const mine = warnReports
      .filter((r) => r.student_id === s.id)
      .map((r) => ({ ...r, items: itemsOf.get(r.id) || [] }));
    if (mine.length === 0) continue;
    const acts = warnActions.filter((a) => a.student_id === s.id);
    const st = tally(mine, acts, rule);
    if (st.need) warnings.push({ id: s.id, name: s.name, count: st.count, list: st.list });
  }
  warnings.sort((a, b) => b.count - a.count);

  /**
   * ── **단원평가에 막힌 아이** (2026-08-06) ────────────────────
   *
   * 9월 한 달을 돌려봤더니(`scripts/live-month.mjs`) 단원평가가 66건 쌓이고
   * 그중 12건이 재시험이었다. 그런데 **그것을 알려주는 자리가 없었다** —
   * 성적 화면에 날짜순으로 늘어설 뿐이라, 「이 아이가 관계사에서 세 번째
   * 막혔다」 를 원장님이 한 달 지나서야 아시게 된다.
   *
   * 두 번은 흔하다 (한 번 미끄러지고 다음에 통과). **세 번째부터** 알린다 —
   * 두 번에 알리면 흔해져서 정작 세 번째에 안 들린다.
   *
   * 그리고 **셋이 같은 단원에서 막혔으면 그 단원을 다시 가르쳐야 한다.**
   * 한 아이가 못 넘는 것과는 다른 이야기다 (출제분석과 같은 생각).
   */
  let unitStuck = { people: [], units: [] };
  {
    const q = await supabase
      .from("scores")
      .select("student_id, kind, term, taken_on, raw_score, full_score, note")
      .eq("kind", "unit")
      .gte("taken_on", addDays(today, -120))
      .order("taken_on", { ascending: true });
    const byStudent = students.map((s) => ({
      student: s,
      scores: rows(q).filter((x) => x.student_id === s.id),
    })).filter((x) => x.scores.length > 0);
    unitStuck = stuckAcross(byStudent);
  }

  // ── 최근 2주 숙제 미흡·미제출이 많은 학생 ────────────────────
  const recentReports = rows(recentRepQ);
  const repStudent = new Map(recentReports.map((r) => [r.id, r.student_id]));
  const missCount = new Map();
  rows(itemsQ)
    .filter((x) => ["missing", "weak"].includes(x.status))
    .forEach((x) => {
      const sid = repStudent.get(x.daily_report_id);
      if (!sid) return;
      missCount.set(sid, (missCount.get(sid) || 0) + 1);
    });
  const watchList = [...missCount.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([sid, n]) => ({ id: sid, name: nameOf.get(sid) || "", count: n }))
    .filter((w) => w.name);

  // ── 오늘 보강 · 재시험 ───────────────────────────────────────
  const todayMakeups = attToday
    .filter((a) => a.status === "makeup")
    .map((a) => ({
      id: a.student_id,
      name: nameOf.get(a.student_id) || "",
      reason: a.reason || "",
      retest: (a.reason || "").includes("재시험"),
    }))
    .filter((m) => m.name);

  // ── 보강 필요 ─────────────────────────────────────────────
  const daysOfClass = new Map(allClasses.map((c) => [c.id, c.days || []]));
  const daysOfStudent = new Map();
  members.forEach((m) => {
    const cur = daysOfStudent.get(m.student_id) || new Set();
    (daysOfClass.get(m.class_id) || []).forEach((d) => cur.add(d));
    daysOfStudent.set(m.student_id, cur);
  });
  /**
   * **보강 필요.**
   *
   * 원장님 (2026-08-06) — 「아직 결석 안 했고 사전연락 없는데 뭐지」
   *
   * 여기 뜨는 결석은 원장님이 직접 넣으신 것만이 아니다. 세 갈래로 들어온다 —
   *   · 시험 기간 결석 예정을 반 단위로 한꺼번에 넣은 것 (`markExamAbsence`)
   *   · 학부모가 낸 결석 요청을 받아준 것 (`/requests`)
   *   · 노션에서 옮겨온 옛 결석 (`/import` 의 결석·보강)
   *
   * 그래서 **어디서 온 것인지**를 같이 넘긴다. 안 그러면 「이게 왜 여기
   * 있지」 로 끝나고, 치울 수도 없어서 목록이 점점 무거워진다.
   * 보강을 안 하기로 한 것은 `makeup_waived` 로 내린다 (0103).
   */
  // 0103 전 DB 에는 makeup_waived 칸이 없어 위 조회가 통째로 실패한다.
  // 그러면 「보강 필요」 이 조용히 빈 목록이 된다 — 칸 없이 한 번 더 묻는다
  const absenceRows = absencesQ?.error
    ? rows(await supabase.from("attendance")
        .select("student_id, date, status, planned, reason")
        .eq("status", "absent").gte("date", "2026-08-01").lte("date", addDays(today, 30)))
    : rows(absencesQ);

  // 셈은 lib/makeupTodo.js 한 군데에만 있다 — 출결 화면도 같은 것을 쓴다
  const makeupRows = buildMakeupRows({
    absences: absenceRows,
    makeups: rows(makeupsQ),
    nameOf,
    daysOfStudent,
    today,
  });

  // ── 수강료 — 보강 필요 횟수 합계 ─────────────────────────────
  const holAll = rows(holAllQ);
  const makeupDays = settings.schedule?.makeupDays || [];
  let makeupNeedTotal = 0;
  let creditTotal = 0;
  for (const k of allClasses) {
    const ses = classSessions(ym, k, holAll, makeupDays);
    if (ses.all.length === 0) continue;
    const roster = members.filter((m) => m.class_id === k.id).map((m) => studentInfo.get(m.student_id)).filter(Boolean);
    for (const s of roster) {
      const r = studentAmount(ses.live, k.base_sessions, k.tuition ?? null, s, ses.all);
      makeupNeedTotal += r.makeupNeeded || 0;
      creditTotal += r.credit || 0;
    }
  }

  // ── 수납 ────────────────────────────────────────────────────
  //
  // **미납은 대시보드에서 알리지 않는다** (원장님, 2026-08-05).
  // 이 앱이 챙기는 것은 수업이다. 수강료는 결제선생에서 따로 보시고,
  // 여기서는 수강료 화면에 들어가셨을 때만 보인다.
  //
  // 계산은 그대로 둔다 — 수강료 화면이 쓰고, 나중에 다시 켜고 싶어지면
  // 여기 한 줄만 되살리면 된다.
  const unpaid = [];

  // ── 시험 — 임박한 것과 범위가 아직 없는 것 ───────────────────
  const exams = rows(examQ).filter((e) => !hiddenExams.has(e.id));   // 숨긴 시험은 뺀다
  const scopeCount = new Map();
  rows(prepScopeQ).forEach((s) => scopeCount.set(s.exam_id, (scopeCount.get(s.exam_id) || 0) + 1));
  // 시험은 이제 **한 표**에만 있다 (0074). 예전에는 prep_exams 를 따로 물어서,
  // 학사일정에서 만든 시험은 「시험범위 미등록」에 아예 안 잡혔다.
  const examSoon = exams
    // 2달 전부터 (원장님 2026-08-21) — 대비 시작(3~4주 전)보다 재촉이
    // 늦으면 재촉이 아니다
    .filter((e) => e.english_on && e.english_on <= addDays(today, 60))
    .map((e) => ({
      id: e.id,
      label: examTitle(e),
      on: e.english_on,
      dday: Math.round((new Date(`${e.english_on}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000),
      // **전국연합학력평가는 범위를 안 물어본다** (원장님, 2026-08-06 —
      // 「대비하는 시험이 아니라서 일정만 확인하면 되고 시험범위자료는 필요없어」).
      // 모의고사는 그동안 배운 전부가 범위다. 재촉이 늘 켜져 있으면
      // 그 재촉은 안 보이는 것과 같아진다
      noScope: needsScope(e) && !scopeCount.get(e.id),
    }))
    .sort((a, b) => a.on.localeCompare(b.on));

  /**
   * **전날 등원은 학교 시험만이다** (원장님, 2026-08-08 —
   * 「모의고사는 전날 등원 안 해 학교 시험만 그래」).
   *
   * 모의고사는 전국이 같은 날 보고, 범위도 그동안 배운 전부라 전날 따로
   * 부르지 않는다. 그런데 학사일정에서 모의고사 회차를 만들면서
   * (2026-08-08) 영어 시험일이 붙어, 전날 등원 안내에까지 끼어들었다.
   *
   * 「대비하는 시험인가」 는 needsScope 한 곳에서 정한다 — 시험범위를
   * 물어보는 기준과 같다.
   */
  const engEves = exams
    .filter((e) => e.english_on && needsScope(e))
    .map((e) => ({ date: addDaysISO(e.english_on, -1), school: e.school, grade: e.grade, english_on: e.english_on }))
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── 월간리포트 시점 ─────────────────────────────────────────
  const daysToMonthEnd = Math.round(
    (new Date(`${thisMonthEnd}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000
  );
  const monthlyDue = daysToMonthEnd <= 3
    ? { ym, left: daysToMonthEnd, count: new Set(recentReports.map((r) => r.student_id)).size }
    : null;

  // ── 요약 숫자 ────────────────────────────────────────────────
  const monthAtt = rows(monthAttQ);
  const attended = monthAtt.filter((a) => ["present", "late", "makeup", "online"].includes(a.status)).length;
  const attRate = monthAtt.length > 0 ? Math.round((attended / monthAtt.length) * 100) : null;
  const sentRate = todayTotal > 0 ? Math.round((written / todayTotal) * 100) : null;
  const kpi = { enrolled: students.length, attRate, sentRate, todayTotal, written };

  // ── 3개월 스케줄 · 공휴일 ────────────────────────────────────
  const scheduleAlerts = [];
  const classDates = new Set();
  allClasses.forEach((klass) => {
    const roster = members.filter((m) => m.class_id === klass.id).map((m) => studentInfo.get(m.student_id)).filter(Boolean);
    reviewClass(klass, months3, holAll, exams, roster, makeupDays).forEach((m) => {
      m.all.forEach((d) => classDates.add(d));
      m.alerts
        .filter((a) => a.kind !== "off")
        .filter((a) => a.primary !== false)   // 상쇄 구간은 첫 달에만
        .forEach((a) => scheduleAlerts.push({ klass: klass.name, ym: m.ym, ...a }));
    });
  });
  const decided = new Set([...holAll.map((h) => h.date), ...rows(decidedQ).map((t) => t.due_on)]);
  const holidayNotes = holidayAlerts(today, scheduleTo, classDates, decided);

  // ── 새 소식 ──────────────────────────────────────────────────
  //
  // **한 칸이 없어서 알림이 통째로 안 보이면 안 된다.** 0108(오간 말)이나
  // 0068(사진)을 아직 안 돌리셨으면 위 조회가 통째로 실패하고, 그러면
  // 학부모 알림 칸이 **비어 보인다** — 오류도 안 뜬다. 한 칸씩 물러난다.
  const reqRows = reqQ?.error
    ? rows(
        await supabase
          .from("requests")
          .select("id, student_id, kind, from_date, to_date, body, status, reply, created_at, photos")
          .order("created_at", { ascending: false })
          .limit(30)
      )
    : rows(reqQ);
  const reqRows2 = reqRows.length === 0 && reqQ?.error
    ? rows(
        await supabase
          .from("requests")
          .select("id, student_id, kind, from_date, to_date, body, status, created_at")
          .order("created_at", { ascending: false })
          .limit(30)
      )
    : reqRows;
  const requests = reqRows2.map((r) => ({ ...r, studentName: nameOf.get(r.student_id) || "학생" }));

  // ── 단원이 아직 없는 교재 ────────────────────────────────
  // 단원이 없으면 숙제 범위를 고를 수가 없어서, 오늘 수업에서 "숙제 종류만 있고
  // 범위가 안 나온다". 그런데 그건 **그 화면에서는 안 보인다** — 원장님은 교재
  // 화면을 따로 열어보지 않으면 모른다.
  // **학생이 실제로 쓰는 교재만** 본다. 안 쓰는 교재까지 챙길 필요는 없다.
  // student_id 를 꼭 같이 읽는다 — 아래 「곧 끝나는 교재」 가 학생별로
  // 남은 단원을 세는데, 이 칸이 빠져 있어서 목록이 늘 비어 있었다 (2026-08-21)
  // pause(0149 — 멈춘 교재는 「진도 시작 안 함」 재촉에서 뺀다)까지 읽는다.
  // 0149 전 DB 는 통째로 실패하므로 pause 없이 한 번 더 — 멈춤 없는 것으로 본다
  // 끝까지 읽는다 (2026-08-23 전수) — 잘리면 「진도 시작 안 함」 재촉이
  // 뒤쪽 학생을 통째로 빠뜨린다 (틀린 재촉만큼이나 빠진 재촉도 나쁘다)
  let inUse = await fetchAll(() =>
    supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, assigned_on, ended_on, pause, routine_set_at")
      .order("student_id")
      .order("textbook_id")
  );
  if (inUse.error) {
    // 0154 전 — 루틴 도장 없이 (재촉이 조용히 빈다)
    inUse = await fetchAll(() =>
      supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, status, assigned_on, ended_on, pause")
        .order("student_id")
        .order("textbook_id")
    );
  }
  if (inUse.error) {
    inUse = await fetchAll(() =>
      supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, status, assigned_on, ended_on")
        .order("student_id")
        .order("textbook_id")
    );
  }
  const usedIds = [
    ...new Set(
      rows(inUse)
        // 사용 예정일이 아직 안 온 교재는 단원이 없어도 지금 급한 일이 아니다
        .filter((r) => inUseOn(r, today))
        .map((r) => r.textbook_id)
    ),
  ];
  let needUnits = [];
  if (usedIds.length) {
    const [bq, uq] = await Promise.all([
      supabase.from("textbooks").select("id, name, area, status").in("id", usedIds),
      // 전 교재 단원 합 — 1000줄을 넘으면 멀쩡한 교재가 「단원 없음」 (B3)
      fetchAll(() => supabase.from("textbook_units").select("textbook_id").in("textbook_id", usedIds).order("id")),
    ]);
    const have = new Set(rows(uq).map((u) => u.textbook_id));
    const useCount = new Map();
    rows(inUse).forEach((r) => {
      if (r.status && r.status !== "active") return;
      useCount.set(r.textbook_id, (useCount.get(r.textbook_id) || 0) + 1);
    });
    needUnits = rows(bq)
      .filter((b) => (!b.status || b.status === "active") && !have.has(b.id))
      .map((b) => ({ ...b, students: useCount.get(b.id) || 0 }))
      .sort((a, b) => b.students - a.students || a.name.localeCompare(b.name, "ko"));
  }
  // ── 곧 끝나는 교재 ──────────────────────────────────────────
  //
  // 원장님 (2026-08-05) — 단어 교재가 끝나면 시험지를 뽑고 클래스카드 플래너를
  // 다시 잡아야 한다. 그런데 그건 **진도를 보고 있어야** 아는 일이라, 끝나고
  // 나서야 「아 뽑아야지」 가 된다.
  //
  // 되풀이 할일에 「교재 끝나감」 규칙을 만들어 두시면 할일까지 생기지만,
  // 규칙을 안 만들어 두셔도 **여기서는 보인다.**
  let bookEnding = [];
  /**
   * ── **진도 시작 안 한 교재** (원장님 2026-08-22 — 「교재 배정됐는데 진도
   * 체크 안 된 학생 대시보드에 알려줘」) ─────────────────────────
   * 재원생 × 사용 중 교재(inUseOn — dropped·예정·끝난 것 제외) 중
   *   ① 멈춤(pause) 없음 — 내신 대비로 세워둔 교재는 재촉 금지 (규칙 7)
   *   ② 배정한 지 GRACE_DAYS 이상 지남 (assigned_on 없는 옛 이관분은
   *      언제부터인지 알 수 없어 안 올린다 — 늘 켜진 재촉은 안 보인다)
   *   ③ 그 교재 단원에 이 학생의 진도(○·◐)가 한 줄도 없음 (회독 무관)
   * 단어 교재도 **뺀다 아니라 넣는다** — 단어도 Day 단원으로 앱에 진도를
   * 찍는 설계다 (클카 「진도 불일치」 감시가 앱 단어 진도를 전제로 한다).
   * 단원이 아직 없는 교재는 「단원을 넣어야 하는 교재」 카드 몫이라 뺀다.
   */
  let progressIdle = [];
  // 클카 감시(아래)가 같이 쓴다 — 같은 표를 두 번 읽지 않는다
  let ccBookArea = new Map();
  // 교재 이름·영역 — 아래 재촉 목록들이 같이 쓴다 (블록 밖에서도)
  let bookMeta = new Map();
  let ccProg = [];
  if (usedIds.length) {
    const [bq2, uq2, pq2] = await Promise.all([
      supabase.from("textbooks").select("id, name, area").in("id", usedIds),
      fetchAll(() => supabase.from("textbook_units").select("id, textbook_id").in("textbook_id", usedIds).order("id")),
      // 제일 큰 표 — 잘리면 「곧 끝나는 교재」 가 앞 학생들 것만 본다 (A5)
      fetchAll(() => supabase.from("student_unit_progress")
        .select("student_id, textbook_unit_id, status")
        .order("student_id").order("textbook_unit_id")),
    ]);
    const bookById = new Map(rows(bq2).map((b) => [b.id, b]));
    bookMeta = bookById;
    ccBookArea = new Map(rows(bq2).map((b) => [b.id, b.area || ""]));
    ccProg = rows(pq2);
    const total = new Map();
    const bookOfUnit = new Map();
    rows(uq2).forEach((u) => {
      total.set(u.textbook_id, (total.get(u.textbook_id) || 0) + 1);
      bookOfUnit.set(u.id, u.textbook_id);
    });
    const done = new Map();
    rows(pq2).forEach((x) => {
      if (x.status && x.status !== "done") return;
      const b = bookOfUnit.get(x.textbook_unit_id);
      if (!b) return;
      const k = `${x.student_id}|${b}`;
      done.set(k, (done.get(k) || 0) + 1);
    });
    bookEnding = rows(inUse)
      .filter((r) => inUseOn(r, today))
      .map((r) => {
        const t = total.get(r.textbook_id) || 0;
        if (t === 0) return null;                       // 단원을 아직 안 올린 교재
        const left = Math.max(0, t - (done.get(`${r.student_id}|${r.textbook_id}`) || 0));
        if (left > 2) return null;                      // 아직 멀었다
        const b = bookById.get(r.textbook_id);
        const who = studentInfo.get(r.student_id);
        if (!b || !who) return null;
        return { id: `${r.student_id}|${r.textbook_id}`, name: who.name, book: b.name, area: b.area || "", left };
      })
      .filter(Boolean)
      .sort((a, b) => a.left - b.left || a.name.localeCompare(b.name, "ko"));

    // ── 진도 시작 안 한 교재 (조건은 위 progressIdle 주석) — 같은 재료 재사용
    // 학생×교재에 ○·◐가 한 줄이라도 있나 (회독 무관 — 시작만 했으면 된다)
    const touched = new Set();
    rows(pq2).forEach((x) => {
      if (x.status !== "done" && x.status !== "doing") return;   // 메모만 있는 줄은 시작이 아니다
      const b = bookOfUnit.get(x.textbook_unit_id);
      if (b) touched.add(`${x.student_id}|${b}`);
    });
    const graceEnd = addDays(today, -GRACE_DAYS);
    progressIdle = rows(inUse)
      .filter((r) => inUseOn(r, today))
      .filter((r) => !r.pause)                                     // ① 멈춘 교재는 재촉 금지
      .filter((r) => r.assigned_on && r.assigned_on <= graceEnd)   // ② 유예 지남
      .filter((r) => (total.get(r.textbook_id) || 0) > 0)          //    단원 없는 교재는 다른 카드 몫
      .filter((r) => !touched.has(`${r.student_id}|${r.textbook_id}`))   // ③ 진도 0줄
      .map((r) => {
        const b = bookById.get(r.textbook_id);
        const who = studentInfo.get(r.student_id);   // 재원생만 (studentsQ 가 enrolled)
        if (!b || !who) return null;
        return { name: who.name, book: b.name, since: r.assigned_on };
      })
      .filter(Boolean)
      .sort((a, b) => a.since.localeCompare(b.since) || a.name.localeCompare(b.name, "ko"));
  }

  /**
   * ── **루틴을 아직 안 정한 교재** (0154 — 원장님 2026-08-24) ──
   *
   * 「학생에게 교재를 배정할 때 무조건, 영역루틴과 교재루틴에서 가져와서
   * 학생루틴을 설정해야 해. 딱 그때 지정까진 안 하더라도 교재지정은 하고,
   * **안 되어 있으면 안 되는 정보니까 대시보드 알림이 필요해**」
   *
   * 배정만 하고 루틴을 안 정하면 — 그 교재는 오늘 수업에서 아무것도 안
   * 차려지거나, 루틴에 적힌 것이 통째로 나간다. 둘 다 원장님이 정한 것이
   * 아니다. 그런데 그건 **그 화면에서는 안 보인다** — 재원생을 열어보지
   * 않으면 모른다. 그래서 여기서 재촉한다.
   */
  const routineUnset = rows(inUse)
    .filter((r) => inUseOn(r, today))
    .filter((r) => !r.routine_set_at)
    .map((r) => {
      const b = bookMeta.get(r.textbook_id);
      const who = studentInfo.get(r.student_id);   // 재원생만
      if (!b || !who) return null;
      return { id: `${r.student_id}|${r.textbook_id}`, studentId: r.student_id,
               name: who.name, book: b.name, area: b.area || "", since: r.assigned_on || "" };
    })
    .filter(Boolean)
    .sort((a2, b2) => (a2.since || "").localeCompare(b2.since || "") || a2.name.localeCompare(b2.name, "ko"));

  /**
   * ── 클래스카드 감시 (0131, 원장님 「이건 꼭 필요한 기능이야」) ──
   *   ① 플래너 소진 — 앞으로 마감일이 없거나 마지막이 3일 안
   *   ② 진도 불일치 — 플래너 세트의 Day 숫자와 앱 단어 교재에서 끝낸
   *      최고 Day 숫자가 2 이상 어긋남
   * 표가 없으면(0131 전) 조용히 빈 값 — 대시보드는 그대로 선다.
   */
  /**
   * **등원 밀림** (원장님 2026-08-20 「d 나보다 학생한테도 떠야 할 듯」).
   * 최근 2주 리포트에서 학생별 **가장 최근 수업**의 「다음 수업에 계속」
   * (carry_next) 개수 — 2개 이상이면 눈덩이 신호다.
   */
  const backlog = [];
  {
    let { data: recentReps, error: recErr } = await supabase
      .from("daily_reports")
      .select("id, student_id, date, attendance_kind")
      .gte("date", addDays(today, -14))
      .order("date", { ascending: false });
    if (recErr) {
      // 출결 미러 칸이 없는 옛 DB — 필터 없이 종전대로
      ({ data: recentReps } = await supabase
        .from("daily_reports")
        .select("id, student_id, date")
        .gte("date", addDays(today, -14))
        .order("date", { ascending: false }));
    }
    const latestRep = new Map();
    (recentReps || []).forEach((r) => {
      // 출결 없는 판(검사·배정만 얹힌 것)은 「가장 최근 수업」 이 아니다 —
      // 이게 최근으로 잡히면 전날 수업의 carry 신호가 조용히 꺼진다
      // (정합성 검토 2026-08-26 — 오탐이 아니라 미탐이라 더 나쁜 자리)
      if (r.attendance_kind === null) return;
      if (!latestRep.has(r.student_id)) latestRep.set(r.student_id, r.id);
    });
    const repIds = [...latestRep.values()];
    if (repIds.length) {
      const { data: carryRows } = await supabase
        .from("daily_report_items")
        .select("daily_report_id, homework_item_id")
        .in("daily_report_id", repIds)
        .eq("status", "inclass")
        .eq("carry_next", true);
      const cnt = new Map();
      (carryRows || []).forEach((x) => cnt.set(x.daily_report_id, (cnt.get(x.daily_report_id) || 0) + 1));
      latestRep.forEach((rid, sid) => {
        const n = cnt.get(rid) || 0;
        if (n >= 2) backlog.push({ name: nameOf.get(sid) || "학생", count: n });
      });
      backlog.sort((a, b) => b.count - a.count);
    }
  }

  // 감시 3종의 관계 — ① 소진 = **앞으로** 마감이 없거나 3일 안에 끝남 ·
  // ② 불일치 = 앱 단어 진도와 플래너 Day 가 어긋남 · ③ 공백 = 클카 단어
  // 배정인데 **오늘** 마감이 없음 (ccTodayGap — 정정 사연은 lib/classcard.js).
  // gapSkipped: 수신이 12시간 넘게 낡아 ③을 쉰 날 — 그 사실만 흐리게 알린다.
  const classcard = { fetchedAt: null, runningOut: [], mismatch: [], noPlanner: [], gapSkipped: false, shadow: null };
  {
    const [linkQ0, rosterQ, planQ, dayQ] = await Promise.all([
      supabase.from("students").select("id, login_id, classcard_login").eq("status", "enrolled"),
      supabase.from("classcard_students").select("user_idx, login_id"),
      supabase.from("classcard_planner").select("user_idx, month, days, fetched_at"),
      supabase.from("classcard_day").select("user_idx, date, sets, fetched_at").eq("date", today),
    ]);
    let linkRows = linkQ0.error ? null : linkQ0.data;
    if (!linkRows) {
      // 0131 전이면 클카 아이디 칸 없이
      const fb = await supabase.from("students").select("id, login_id").eq("status", "enrolled");
      linkRows = fb.error ? [] : fb.data || [];
    }
    if (!rosterQ.error && (rosterQ.data || []).length) {
      const roster = rosterQ.data || [];
      const planOf = new Map();   // user_idx → 이번+다음 달 마감일 전부
      (planQ.error ? [] : planQ.data || []).forEach((r) => {
        if (!planOf.has(r.user_idx)) planOf.set(r.user_idx, []);
        planOf.get(r.user_idx).push(...(r.days || []));
        if (!classcard.fetchedAt || r.fetched_at > classcard.fetchedAt) classcard.fetchedAt = r.fetched_at;
      });
      const dayOf = new Map();
      (dayQ.error ? [] : dayQ.data || []).forEach((r) => {
        dayOf.set(r.user_idx, r.sets || []);
        if (!classcard.fetchedAt || r.fetched_at > classcard.fetchedAt) classcard.fetchedAt = r.fetched_at;
      });

      // 앱 쪽 「단어 교재 최고 Day」 — 단원 이름의 숫자로 (감시①)
      const dayNum = (name) => {
        const m = String(name || "").match(/day\s*0*(\d{1,3})/i) || String(name || "").match(/(\d{1,3})/);
        return m ? parseInt(m[1], 10) : null;
      };
      const wordBookIds = new Set(
        rows(inUse).map((r) => r.textbook_id).filter((tid) => {
          return ccBookArea.get(tid) === "단어";
        })
      );
      // 단어 단원 이름 — bookEnding 이 이미 받은 uq2 에는 이름이 없어
      // 단어 교재 것만 얇게 다시 (이름·교재만, fetchAll)
      let wordUnits = [];
      if (wordBookIds.size) {
        const uq3 = await fetchAll(() =>
          supabase.from("textbook_units").select("id, textbook_id, name")
            .in("textbook_id", [...wordBookIds]).order("id"));
        wordUnits = uq3.error ? [] : uq3.data || [];
      }
      const unitDay = new Map(wordUnits.map((u) => [u.id, { book: u.textbook_id, day: dayNum(u.name) }]));
      const appMaxDay = new Map();   // student_id → 최고 Day
      ccProg.forEach((x) => {
        if (x.status && x.status !== "done") return;
        const u = unitDay.get(x.textbook_unit_id);
        if (!u || u.day === null) return;
        const cur = appMaxDay.get(x.student_id) || 0;
        if (u.day > cur) appMaxDay.set(x.student_id, u.day);
      });

      // ③ 오늘 공백의 재료 — 오늘 수업(todayIds) 학생의 **현재 배정**에
      // 클카 단어 항목이 있는지. 검사 대상(오늘 전 마지막 배정 리포트)과
      // 오늘 나간 숙제(오늘 리포트의 assigned) 둘 다 본다. 리포트는 이미
      // 받아둔 2주치(recentRepQ)를 재사용한다 — 매주 오는 아이들이라 충분하다.
      classcard.gapSkipped = ccStale(classcard.fetchedAt);
      const hasCcWordOf = new Map();   // student_id → true
      if (!classcard.gapSkipped) {
        const myReps = rows(recentRepQ)
          .filter((r) => todayIds.has(r.student_id))
          .sort((a, b) => (a.date < b.date ? 1 : -1));   // 최근 것부터
        const repIds = myReps.map((r) => r.id);
        const [hiQ, asgQ] = await Promise.all([
          supabase.from("homework_items").select("id, name").order("id"),
          repIds.length
            ? fetchAll(() => supabase.from("daily_report_items")
                .select("daily_report_id, homework_item_id")
                .in("daily_report_id", repIds)
                .eq("status", "assigned")
                .order("daily_report_id"))
            : Promise.resolve({ data: [] }),
        ]);
        const wordItemIds = new Set(rows(hiQ).filter((i) => ccWordItem(i.name)).map((i) => i.id));
        const asgOf = new Map();   // report_id → [item_id]
        rows(asgQ).forEach((x) => {
          if (!asgOf.has(x.daily_report_id)) asgOf.set(x.daily_report_id, []);
          asgOf.get(x.daily_report_id).push(x.homework_item_id);
        });
        // 학생별: 오늘 리포트의 배정 + 오늘 전 「배정이 있었던 가장 최근」 리포트
        const seenPrev = new Set();
        myReps.forEach((r) => {
          let ids = [];
          if (r.date === today) {
            ids = asgOf.get(r.id) || [];                 // 오늘 나간 숙제
          } else {
            if (seenPrev.has(r.student_id)) return;      // 더 최근 배정을 이미 봤다
            ids = asgOf.get(r.id) || [];
            if (!ids.length) return;                     // 배정 없는 리포트 → 더 과거로
            seenPrev.add(r.student_id);                  // 오늘 검사 대상
          }
          if (ids.some((iid) => wordItemIds.has(iid))) hasCcWordOf.set(r.student_id, true);
        });
      }

      (linkRows || []).forEach((st) => {
        const uidx = ccUserIdxOf(st, roster);
        if (!uidx) return;
        const name = studentInfo.get(st.id)?.name;
        if (!name) return;
        // ① 소진
        const ro = plannerRunningOut(planOf.get(uidx) || [], today);
        if (ro.out) classcard.runningOut.push({ name, last: ro.last });
        // ③ 오늘 공백 — 클카 단어 배정인데 오늘 마감 세트 0 (수신 없음은
        //    여기선 조용히 — 오늘 수업 판이 그 학생 줄에서 알린다)
        if (!classcard.gapSkipped && hasCcWordOf.get(st.id)) {
          const dayRow = dayOf.has(uidx) ? { sets: dayOf.get(uidx) } : null;
          if (ccTodayGap(true, dayRow) === "gap") classcard.noPlanner.push({ name });
        }
        // ② 진도 불일치 — 오늘 플래너 세트의 최고 Day vs 앱 최고 Day
        const ccDays = (dayOf.get(uidx) || []).map((x2) => dayNum(x2.name)).filter((n) => n !== null);
        const appMax = appMaxDay.get(st.id);
        if (ccDays.length && appMax) {
          const ccMax = Math.max(...ccDays);
          if (Math.abs(ccMax - appMax) >= 2) {
            classcard.mismatch.push({ name, app: appMax, cc: ccMax });
          }
        }
      });
      classcard.runningOut.sort((a, b) => a.name.localeCompare(b.name, "ko"));
      classcard.noPlanner.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    // 그림자 일치율(0132)은 실험 종료로 안 읽는다 (2026-08-26 —
    // 「클카 자동판정 애매한 건 없애」). 표는 기록으로만 남는다.
  }

  const newComments = rows(commentQ).map((c) => ({ ...c, name: studentInfo.get(c.student_id)?.name || "학생" }));

  /**
   * **이번 주 생일** (원장님, 2026-08-15 — 「생일 나한테 알려주고」).
   * 생년월일 칸은 지금까지 아무도 안 읽었다 (값-지도 P2). 월·일이 적힌
   * 학생만 — 연도만 적힌 아이는 셀 수 없으니 조용히 빠진다.
   * 형식이 제각각이라(2012-03-14 · 12.3.14) 숫자 묶음에서 뒤 두 개를 쓴다.
   */
  /**
   * **다음 달 회차 미확정** (0123) — 25일부터 특이사항에 띄운다.
   * 원장님이 「대시보드 어디서 보는 건지 모르겠어」 — 확정 판은 회차
   * 화면에 있는데 대시보드에서 가는 길이 없었다. 표가 없으면(0123 전) 0.
   */
  let monthConfirmLeft = 0;
  if (Number(today.slice(8, 10)) >= 25) {
    const nym = addMonths(today.slice(0, 7), 1);
    const mc = await rows(() =>
      supabase.from("month_confirms").select("student_id, principal_at").eq("ym", nym)
    );
    monthConfirmLeft = Math.max(
      0,
      (students || []).length - mc.filter((c) => c.principal_at).length
    );
  }

  const birthdays = [];
  {
    const md = (v) => {
      const nums = String(v || "").match(/\d+/g) || [];
      if (nums.length < 2) return null;
      const d2 = parseInt(nums[nums.length - 1], 10);
      const m2 = parseInt(nums[nums.length - 2], 10);
      if (!(m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31)) return null;
      return { m: m2, d: d2 };
    };
    const soon = new Map();
    for (let i = 0; i < 7; i++) {
      const dd = addDays(today, i);
      soon.set(`${parseInt(dd.slice(5, 7), 10)}-${parseInt(dd.slice(8, 10), 10)}`, i);
    }
    (students || []).forEach((st) => {
      const b = md(st.birth_year);
      if (!b) return;
      const inDays = soon.get(`${b.m}-${b.d}`);
      if (inDays === undefined) return;
      birthdays.push({ id: st.id, name: st.name, m: b.m, d: b.d, inDays });
    });
    birthdays.sort((a, b) => a.inDays - b.inDays);
  }


  /**
   * **아이 화면에 오래 떠 있는 숙제** (원장님 2026-08-23 — 「테스트하느라
   * 몇 주 전에 누른 게 아직도 눌려 있어」).
   *
   * 아이 화면은 **숙제가 붙어 있는 가장 최근 수업**을 보여준다 (lib/homeworkView
   * pickAssigned). 등원해서 출결을 찍어도 지난 숙제가 사라지지 않게 만든
   * 규칙인데, **검사를 안 하면 상한이 없다** — 몇 주 전 숙제가 아이 화면에
   * 그대로 떠 있고, 아이는 「이미 했는데」 하며 넘긴다.
   *
   * 그 배정이 STALE_DAYS 보다 오래됐으면 여기서 알린다. 판단 자리는
   * 아이 화면과 **같은 규칙**이어야 한다 — 학생별 가장 최근 assigned 리포트.
   */
  const staleHomework = [];
  {
    const STALE_DAYS = 7;
    const cut = addDays(today, -STALE_DAYS);
    const { data: reps } = await supabase
      .from("daily_reports")
      .select("id, student_id, date")
      .gte("date", addDays(today, -60))
      .order("date", { ascending: false });
    const byRep = new Map((reps || []).map((r) => [r.id, r]));
    const ids = [...byRep.keys()];
    let items = [];
    if (ids.length) {
      const q = await fetchAll(() => supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", ids)
        .eq("status", "assigned")
        .order("daily_report_id"));
      items = q.error ? [] : q.data || [];
    }
    const cnt = new Map();
    for (const it of items) cnt.set(it.daily_report_id, (cnt.get(it.daily_report_id) || 0) + 1);
    // 학생마다 **가장 최근** 배정 하나만 (reps 가 날짜 내림차순이라 첫 줄)
    const seen = new Set();
    for (const r of reps || []) {
      if (seen.has(r.student_id)) continue;
      if (!cnt.has(r.id)) continue;
      seen.add(r.student_id);
      if (r.date >= cut) continue;              // 아직 오래되지 않았다
      const who = nameOf.get(r.student_id);
      if (!who) continue;                        // 퇴원생은 뺀다
      staleHomework.push({
        name: who,
        date: r.date,
        days: Math.round((Date.parse(today) - Date.parse(r.date)) / 86400000),
        count: cnt.get(r.id) || 0,
      });
    }
    staleHomework.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, "ko"));
  }

  return {
    today,
    kpi,
    todayClasses,
    todayTotal,
    written,
    plannedOff,
    remaining: Math.max(0, todayTotal - written - plannedOff),
    calendar,
    needUnits,
    bookEnding,
    progressIdle,
    routineUnset,
    staleHomework,
    tasks: {
      today: tasks.filter((t) => t.due_on === today),
      week: tasks.filter((t) => t.due_on > today && t.due_on <= weekEnd),
      month: tasks.filter((t) => t.due_on > weekEnd),
      todos,
      overdue,
    },
    // 대시보드에서 바로 보강을 잡을 때 쓰는 명단 (2026-08-07)
    roster: students.map((s) => ({ id: s.id, name: s.name })),
    classcard,
    backlog,
    warnings,
    unitStuck,
    watchList,
    todayMakeups,
    birthdays,
    monthConfirmLeft,
    makeupRows,
    makeupNeedTotal,
    creditTotal,
    unpaid,
    unsentToday,
    unsentPast,
    sendFails,
    examSoon,
    engEves,
    monthlyDue,
    requests,
    inquiries: rows(inqQ),
    newComments,
    soonAbsent: rows(plannedAbsQ).map((a) => ({ ...a, name: nameOf.get(a.student_id) || "" })),
    holidays: rows(holQ),
    holidayNotes,
    scheduleAlerts,
  };
}
