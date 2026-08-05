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
import { classSessions, studentAmount } from "./tuition.js";
import { reviewClass, monthsFrom, addDaysISO, hiddenExamIds } from "./schedule.js";
import { holidayAlerts } from "./holidays.js";
import { loadSettings } from "./settings.js";
import { inUseOn } from "./bookUse.js";
import {
  todaySeoul, dowOf, addDays, addMonths, endOfMonth,
} from "./day.js";

/** 마이그레이션이 아직 안 돌았을 수 있다. 없는 표는 조용히 빈 목록으로 본다. */
const rows = (q) => (q?.error ? [] : q?.data || []);

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
    supabase.from("classes").select("id, name, days, start_time, end_time, room, base_sessions, tuition").order("start_time", { ascending: true }),
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
    supabase.from("students").select("id, name, school, grade, status, started_on, ended_on").eq("status", "enrolled"),
    supabase.from("daily_reports").select("id, student_id, date").gte("date", twoWeeksAgo).lte("date", today),
    supabase.from("attendance").select("student_id, date, status, planned, reason").eq("status", "absent").gte("date", monthAgo).lte("date", weekEnd),
    supabase.from("attendance").select("student_id, makeup_of").eq("status", "makeup").not("makeup_of", "is", null),
    supabase.from("requests").select("id, student_id, kind, from_date, to_date, body, status, created_at, photos").eq("status", "new").order("created_at", { ascending: false }).limit(20),
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

  const allClasses = rows(classesQ);
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
    href: t.kind === "todo" ? "/tasks?view=todo" : "/tasks",
  }));

  // ── 일정 ────────────────────────────────────────────────────
  const all = rows(taskQ);
  const tasks = all.filter((t) => t.kind !== "todo");
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
    ? await supabase.from("daily_report_items").select("daily_report_id, status").in("daily_report_id", repIdsAll)
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

  // ── 보강 잡을 것 ─────────────────────────────────────────────
  const doneMakeup = new Set(rows(makeupsQ).map((m) => `${m.student_id}|${m.makeup_of}`));
  const daysOfClass = new Map(allClasses.map((c) => [c.id, c.days || []]));
  const daysOfStudent = new Map();
  members.forEach((m) => {
    const cur = daysOfStudent.get(m.student_id) || new Set();
    (daysOfClass.get(m.class_id) || []).forEach((d) => cur.add(d));
    daysOfStudent.set(m.student_id, cur);
  });
  const makeupRows = rows(absencesQ)
    .filter((a) => !doneMakeup.has(`${a.student_id}|${a.date}`))
    .map((a) => ({
      studentId: a.student_id,
      name: nameOf.get(a.student_id) || "",
      date: a.date,
      planned: !!a.planned,
      reason: a.reason || "",
      classDays: [...(daysOfStudent.get(a.student_id) || [])],
    }))
    .filter((a) => a.name)
    .sort((a, b) => a.date.localeCompare(b.date));

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

  // ── 수납 — 이번 달에 아직 못 받은 사람 ───────────────────────
  //   금액은 위에서 이미 계산했다. 여기서는 '받았다'가 없는 사람만 고른다 (원칙1)
  const paidSet = new Set(
    rows(payQ).filter((p) => p.paid_on).map((p) => p.student_id)
  );
  const inAnyClass = new Set(members.map((m) => m.student_id));
  const unpaid = students
    .filter((s) => inAnyClass.has(s.id) && !paidSet.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));

  // ── 시험 — 임박한 것과 범위가 아직 없는 것 ───────────────────
  const exams = rows(examQ).filter((e) => !hiddenExams.has(e.id));   // 숨긴 시험은 뺀다
  const scopeCount = new Map();
  rows(prepScopeQ).forEach((s) => scopeCount.set(s.exam_id, (scopeCount.get(s.exam_id) || 0) + 1));
  // 시험은 이제 **한 표**에만 있다 (0074). 예전에는 prep_exams 를 따로 물어서,
  // 학사일정에서 만든 시험은 「시험범위 미등록」에 아예 안 잡혔다.
  const examSoon = exams
    .filter((e) => e.english_on && e.english_on <= addDays(today, 21))
    .map((e) => ({
      id: e.id,
      label: `${e.school} ${e.grade || ""} ${e.name || ""}`.replace(/\s+/g, " ").trim(),
      on: e.english_on,
      dday: Math.round((new Date(`${e.english_on}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000),
      noScope: !scopeCount.get(e.id),
    }))
    .sort((a, b) => a.on.localeCompare(b.on));

  const engEves = exams
    .filter((e) => e.english_on)
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
  // 0068 전이면 photos 를 물어본 것 자체가 실패한다. 그러면 알림이 통째로
  // 안 보이게 되므로, 사진 없이 한 번 더 물어본다.
  const reqRows = reqQ?.error
    ? rows(
        await supabase
          .from("requests")
          .select("id, student_id, kind, from_date, to_date, body, status, created_at")
          .eq("status", "new")
          .order("created_at", { ascending: false })
          .limit(20)
      )
    : rows(reqQ);
  const requests = reqRows.map((r) => ({ ...r, studentName: nameOf.get(r.student_id) || "학생" }));

  // ── 단원이 아직 없는 교재 ────────────────────────────────
  // 단원이 없으면 숙제 범위를 고를 수가 없어서, 오늘 수업에서 "숙제 종류만 있고
  // 범위가 안 나온다". 그런데 그건 **그 화면에서는 안 보인다** — 원장님은 교재
  // 화면을 따로 열어보지 않으면 모른다.
  // **학생이 실제로 쓰는 교재만** 본다. 안 쓰는 교재까지 챙길 필요는 없다.
  const inUse = await supabase
    .from("student_textbooks")
    .select("textbook_id, status, assigned_on, ended_on");
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
      supabase.from("textbook_units").select("textbook_id").in("textbook_id", usedIds),
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
  const newComments = rows(commentQ).map((c) => ({ ...c, name: studentInfo.get(c.student_id)?.name || "학생" }));

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
    tasks: {
      today: tasks.filter((t) => t.due_on === today),
      week: tasks.filter((t) => t.due_on > today && t.due_on <= weekEnd),
      month: tasks.filter((t) => t.due_on > weekEnd),
      todos,
      overdue,
    },
    warnings,
    watchList,
    todayMakeups,
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
