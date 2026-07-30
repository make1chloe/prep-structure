import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/roles";
import TopBar from "@/components/TopBar";
import RequestInbox from "./RequestInbox";
import MakeupInbox from "./MakeupInbox";
import { reviewClass, monthsFrom, addDaysISO } from "@/lib/schedule";
import { holidayAlerts } from "@/lib/holidays";
import { loadSettings } from "@/lib/settings";
import {
  todaySeoul, dowOf, dayLabel, longLabel, addDays, addMonths, endOfMonth,
} from "@/lib/day";

export const dynamic = "force-dynamic";

function cut(t) {
  return t ? t.slice(0, 5) : "";
}


export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  // 선생님 화면이다. 학생·학부모는 자기 화면으로 보낸다.
  // (미들웨어가 이미 막지만, 막는 곳이 하나뿐이면 그 하나가 뚫렸을 때 끝이다)
  if (!isStaff(profile?.role)) redirect("/me");

  const today = todaySeoul();
  const dow = dowOf(today);
  const weekEnd = addDays(today, 7);
  const monthEnd = endOfMonth(addMonths(today.slice(0, 7), 1));

  // ---------- 오늘 수업 ----------
  const { data: allClasses } = await supabase
    .from("classes")
    .select("id, name, days, start_time, end_time, room")
    .order("start_time", { ascending: true });
  const todayClasses = (allClasses || []).filter((c) => (c.days || []).includes(dow));

  const { data: members } = await supabase.from("class_students").select("class_id, student_id");
  const todayIds = new Set(
    (members || [])
      .filter((m) => todayClasses.some((c) => c.id === m.class_id))
      .map((m) => m.student_id)
  );

  let { data: att } = await supabase
    .from("attendance")
    .select("student_id, status, planned, reason")
    .eq("date", today);
  if (!att) {
    ({ data: att } = await supabase
      .from("attendance")
      .select("student_id, status")
      .eq("date", today));
  }
  const { data: reports } = await supabase
    .from("daily_reports")
    .select("student_id, report_written")
    .eq("date", today);

  const plannedOff = (att || []).filter((a) => a.planned && a.status === "absent").length;
  const written = (reports || []).filter(
    (r) => r.report_written && todayIds.has(r.student_id)
  ).length;
  const todayTotal = todayIds.size;

  // ---------- 일정 ----------
  const taskQ = await supabase
    .from("tasks")
    .select("id, title, kind, category, due_on, end_on, start_time, status, deliver_body, notice_body, priority")
    .gte("due_on", today)
    .lte("due_on", monthEnd)
    .eq("status", "open")
    .order("due_on", { ascending: true });
  const all = taskQ.error ? [] : taskQ.data || [];
  const tasks = all.filter((t) => t.kind !== "todo");
  const todos = all.filter((t) => t.kind === "todo");
  const tasksToday = tasks.filter((t) => t.due_on === today);
  const tasksWeek = tasks.filter((t) => t.due_on > today && t.due_on <= weekEnd);
  const tasksMonth = tasks.filter((t) => t.due_on > weekEnd);

  const overdueQ = await supabase
    .from("tasks")
    .select("id, title, due_on, kind")
    .lt("due_on", today)
    .eq("status", "open")
    .order("due_on", { ascending: true })
    .limit(10);
  const overdue = overdueQ.error ? [] : overdueQ.data || [];

  const holQ = await supabase
    .from("holidays")
    .select("id, date, name, scope")
    .gte("date", today)
    .lte("date", monthEnd)
    .order("date", { ascending: true });
  const holidays = holQ.error ? [] : holQ.data || [];

  // ---------- 특이사항 ----------
  const absQ = await supabase
    .from("attendance")
    .select("student_id, date, status, planned, reason")
    .gte("date", today)
    .lte("date", weekEnd)
    .eq("planned", true);
  const soonAbsent = absQ.error ? [] : absQ.data || [];

  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, status")
    .eq("status", "enrolled");
  const nameOf = new Map((students || []).map((s) => [s.id, s.name]));

  const twoWeeksAgo = addDays(today, -14);
  const { data: recentReports } = await supabase
    .from("daily_reports")
    .select("id, student_id, date")
    .gte("date", twoWeeksAgo)
    .lte("date", today);
  const repIds = (recentReports || []).map((r) => r.id);
  const { data: dri } = repIds.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", repIds)
        .in("status", ["missing", "weak"])
    : { data: [] };
  const repStudent = new Map((recentReports || []).map((r) => [r.id, r.student_id]));
  const missCount = new Map();
  (dri || []).forEach((x) => {
    const sid = repStudent.get(x.daily_report_id);
    if (!sid) return;
    missCount.set(sid, (missCount.get(sid) || 0) + 1);
  });
  const watchList = [...missCount.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([sid, n]) => ({ name: nameOf.get(sid) || "", count: n }));

  // ---------- 보강 잡을 것 ----------
  // 최근 한 달 결석 중, 그 날짜를 원 결석일로 하는 보강이 아직 없는 건
  const monthAgo = addDays(today, -30);
  let { data: absences } = await supabase
    .from("attendance")
    .select("student_id, date, status, planned, reason")
    .eq("status", "absent")
    .gte("date", monthAgo)
    .lte("date", weekEnd);
  if (!absences) {
    ({ data: absences } = await supabase
      .from("attendance")
      .select("student_id, date, status")
      .eq("status", "absent")
      .gte("date", monthAgo)
      .lte("date", weekEnd));
  }
  const { data: makeups } = await supabase
    .from("attendance")
    .select("student_id, makeup_of")
    .eq("status", "makeup")
    .not("makeup_of", "is", null);
  const doneMakeup = new Set(
    (makeups || []).map((m) => `${m.student_id}|${m.makeup_of}`)
  );
  const daysOfClass = new Map((allClasses || []).map((c) => [c.id, c.days || []]));
  const daysOfStudent = new Map();
  (members || []).forEach((m) => {
    const cur = daysOfStudent.get(m.student_id) || new Set();
    (daysOfClass.get(m.class_id) || []).forEach((d) => cur.add(d));
    daysOfStudent.set(m.student_id, cur);
  });

  // ---------- 새 소식 ----------
  const reqQ = await supabase
    .from("requests")
    .select("id, student_id, kind, from_date, to_date, body, status, created_at")
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(20);
  const requests = (reqQ.error ? [] : reqQ.data || []).map((r) => ({
    ...r,
    studentName: nameOf.get(r.student_id) || "학생",
  }));

  const inqQ = await supabase
    .from("inquiries")
    .select("id, name, school, grade, status, form_submitted_at, test_want_on, visit_on, created_at")
    .in("status", ["new", "scheduled"])
    .order("created_at", { ascending: false })
    .limit(10);
  const inquiries = inqQ.error ? [] : inqQ.data || [];

  const sendQ = await supabase
    .from("daily_reports")
    .select("id, student_id")
    .eq("date", today)
    .eq("report_written", true)
    .is("sent_at", null);
  const unsent = sendQ.error ? [] : sendQ.data || [];

  // ---------- 앞으로 3개월 스케줄 특이사항 ----------
  const months3 = monthsFrom(today.slice(0, 7), 3);
  const scheduleTo = endOfMonth(months3[2]);

  let { data: baseClasses } = await supabase
    .from("classes")
    .select("id, name, days, base_sessions")
    .order("start_time", { ascending: true });
  if (!baseClasses) baseClasses = allClasses || [];

  const holAllQ = await supabase
    .from("holidays")
    .select("date, scope, class_id")
    .gte("date", today)
    .lte("date", scheduleTo);
  const holAll = holAllQ.error ? [] : holAllQ.data || [];

  const examQ2 = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date, to_date, english_on")
    .gte("to_date", today)
    .order("from_date", { ascending: true });
  const exams = examQ2.error ? [] : examQ2.data || [];

  const settings = await loadSettings(supabase);
  const makeupDays = settings.schedule?.makeupDays || [];

  const studentInfo = new Map((students || []).map((s) => [s.id, s]));
  const scheduleAlerts = [];
  const classDates = new Set();
  (baseClasses || []).forEach((klass) => {
    const roster = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => studentInfo.get(m.student_id))
      .filter(Boolean);
    reviewClass(klass, months3, holAll, exams, roster, makeupDays).forEach((m) => {
      m.all.forEach((d) => classDates.add(d));
      m.alerts
        .filter((a) => a.kind !== "off")
        // 회차 알림은 상쇄 구간의 첫 달에만 — 같은 말이 두 번 뜨지 않게
        .filter((a) => a.primary !== false)
        .forEach((a) => scheduleAlerts.push({ klass: klass.name, ym: m.ym, ...a }));
    });
  });

  // 학생·학부모가 남긴 안 읽은 댓글 (0023 전이면 조용히 빈 목록)
  const commentQ = await supabase
    .from("report_comments")
    .select("id, body, author_role, created_at, student_id, daily_report_id")
    .is("read_at", null)
    .neq("author_role", "staff")
    .order("created_at", { ascending: false })
    .limit(10);
  const newComments = (commentQ.error ? [] : commentQ.data || []).map((c) => ({
    ...c,
    name: studentInfo.get(c.student_id)?.name || "학생",
  }));

  // 공휴일 · 대체공휴일 · 낀 날 — 자동으로 쉬지 않고, 정하라고 알리기만 한다
  //   이미 휴강으로 지정했거나 일정에 넣어둔 날은 뺀다
  // 이미 결정한 날 — 휴강으로 잡았거나, 일정에 남겨둔 날
  //   위의 `all` 은 이번 달까지·미완료만 보므로, 여기서는 3개월 전부를 상태 없이 다시 본다
  const decidedQ = await supabase
    .from("tasks")
    .select("due_on")
    .gte("due_on", today)
    .lte("due_on", scheduleTo);
  const decided = new Set([
    ...holAll.map((h) => h.date),
    ...(decidedQ.error ? [] : decidedQ.data || []).map((t) => t.due_on),
  ]);
  const holidayNotes = holidayAlerts(today, scheduleTo, classDates, decided);

  // 영어 시험 전날 (등원 필요) — 학교·학년 기준으로 한 번만
  const engEves = exams
    .filter((e) => e.english_on)
    .map((e) => ({
      date: addDaysISO(e.english_on, -1),
      school: e.school,
      grade: e.grade,
      english_on: e.english_on,
    }))
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const makeupRows = (absences || [])
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

  const label = longLabel(today);

  return (
    <>
      <TopBar profile={profile} active="home" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">대시보드</p>
          <h1 className="h1">{label}</h1>
        </div>

        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/today">
            오늘 수업 · 남은 {Math.max(0, todayTotal - written - plannedOff)}명 / {todayTotal}명
          </Link>
          {unsent.length > 0 && (
            <Link className="btn" href="/report">보낼 리포트 {unsent.length}건</Link>
          )}
          {requests.length > 0 && (
            <span className="btn" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>
              학부모 알림 {requests.length}건
            </span>
          )}
          {scheduleAlerts.length > 0 && (
            <Link className="btn" href="/schedule">스케줄 특이사항 {scheduleAlerts.length}건</Link>
          )}
          {makeupRows.length > 0 && (
            <span className="btn" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>
              보강 잡을 것 {makeupRows.length}건
            </span>
          )}
          {inquiries.length > 0 && (
            <Link className="btn" href="/consult">진행중 상담 {inquiries.length}건</Link>
          )}
          {overdue.length > 0 && (
            <Link className="btn" href="/tasks?view=todo">지난 할일 {overdue.length}건</Link>
          )}
          {todos.length > 0 && (
            <Link className="btn" href="/tasks?view=todo">할일 {todos.length}건</Link>
          )}
        </div>

        <div className="grid-side" style={{ marginTop: 14 }}>
          {/* 새 소식 · 특이사항 */}
          <div className="stack" style={{ gap: 14 }}>
            <RequestInbox requests={requests} />
            <MakeupInbox rows={makeupRows} />

            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
                새 상담{" "}
                {inquiries.length > 0 && <span className="tag tag-amber">{inquiries.length}</span>}
              </h2>
              {inquiries.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>새로 들어온 상담이 없습니다.</p>
              ) : (
                <div className="stack" style={{ gap: 4 }}>
                  {inquiries.map((q) => (
                    <Link
                      className="unitrow"
                      key={q.id}
                      href="/consult"
                      style={{ textDecoration: "none" }}
                    >
                      <b style={{ fontSize: 12.5 }}>{q.name}</b>
                      <span className="hint">{[q.school, q.grade].filter(Boolean).join(" ")}</span>
                      <span className={`tag ${q.form_submitted_at ? "tag-mint" : "tag-muted"}`}>
                        {q.form_submitted_at ? "양식 제출" : "양식 미제출"}
                      </span>
                      <span className="spacer" />
                      {q.test_want_on && (
                        <span className="hint">테스트 희망 {dayLabel(q.test_want_on)}</span>
                      )}
                      {q.visit_on && <span className="hint">· 상담 희망 {dayLabel(q.visit_on)}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>특이사항</h2>
              <div className="stack" style={{ gap: 10 }}>
                {soonAbsent.length > 0 && (
                  <div>
                    <b className="hint">이번 주 결석 예정</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {soonAbsent.map((a, i) => (
                        <span className="tag tag-amber" key={i}>
                          {dayLabel(a.date)} {nameOf.get(a.student_id) || ""}
                          {a.reason ? ` · ${a.reason}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {watchList.length > 0 && (
                  <div>
                    <b className="hint">최근 2주 숙제 미흡·미제출이 많은 학생</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {watchList.map((w) => (
                        <span className="tag tag-muted" key={w.name}>
                          {w.name} {w.count}건
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {holidays.length > 0 && (
                  <div>
                    <b className="hint">앞으로의 휴강</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {holidays.map((h) => (
                        <span className="tag tag-muted" key={h.id}>
                          {dayLabel(h.date)} {h.name || "휴강"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {engEves.length > 0 && (
                  <div>
                    <b className="hint">영어 시험 전날 — 등원 필요</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {engEves.map((e, i) => (
                        <span className="tag tag-lav" key={i}>
                          {dayLabel(e.date)} {e.school} {e.grade || ""} (시험 {e.english_on.slice(5)})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {newComments.length > 0 && (
                  <div>
                    <b className="hint">학생 · 학부모가 남긴 댓글 {newComments.length}건</b>
                    <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                      {newComments.map((c) => (
                        <div className="hint" key={c.id}>
                          <span className={`tag ${c.author_role === "parent" ? "tag-lav" : "tag-mint"}`}>
                            {c.author_role === "parent" ? "학부모" : "학생"}
                          </span>{" "}
                          <b>{c.name}</b> — {c.body.slice(0, 60)}
                          {c.body.length > 60 ? "…" : ""}
                        </div>
                      ))}
                    </div>
                    <Link className="btn btn-ghost btn-sm" href="/today" style={{ marginTop: 6 }}>
                      오늘 수업에서 답하기
                    </Link>
                  </div>
                )}
                {holidayNotes.length > 0 && (
                  <div>
                    <b className="hint">공휴일 — 쉴지 정해주세요</b>
                    <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                      {holidayNotes.map((h) => (
                        <div className="hint" key={h.date}>
                          <span
                            className={`tag ${
                              h.kind === "bridge" ? "tag-lav"
                              : h.kind === "substitute" ? "tag-amber"
                              : "tag-red"
                            }`}
                          >
                            {dayLabel(h.date)} {h.name}
                          </span>{" "}
                          {h.why}
                        </div>
                      ))}
                    </div>
                    <Link className="btn btn-ghost btn-sm" href="/schedule" style={{ marginTop: 6 }}>
                      휴강으로 지정하기
                    </Link>
                  </div>
                )}
                {scheduleAlerts.length > 0 && (
                  <div>
                    <b className="hint">앞으로 3개월 스케줄</b>
                    <div className="stack" style={{ gap: 3, marginTop: 4 }}>
                      {scheduleAlerts.slice(0, 8).map((a, i) => (
                        <div className="hint" key={i}>
                          <b>{a.klass}</b> {Number(a.ym.slice(5))}월 · {a.text}
                          {a.advice && (
                            <>
                              <br />
                              <span style={{ opacity: 0.8 }}>
                                {a.settled ? "✓ " : "→ "}
                                {a.advice}
                              </span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    <Link className="btn btn-ghost btn-sm" href="/schedule" style={{ marginTop: 6 }}>
                      스케줄 보기
                    </Link>
                  </div>
                )}
                {soonAbsent.length === 0 && watchList.length === 0 && holidays.length === 0 &&
                  scheduleAlerts.length === 0 && engEves.length === 0 &&
                  holidayNotes.length === 0 && newComments.length === 0 && (
                  <p className="hint" style={{ margin: 0 }}>특별히 볼 것이 없습니다 👍</p>
                )}
              </div>
            </div>
          </div>

          {/* 일정 */}
          <div className="stack" style={{ gap: 14 }}>
            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>오늘</h2>
              <div className="stack" style={{ gap: 4 }}>
                {todayClasses.map((c) => (
                  <div className="unitrow" key={c.id}>
                    <span className="hint" style={{ minWidth: 84 }}>
                      {cut(c.start_time)}-{cut(c.end_time)}
                    </span>
                    <b style={{ fontSize: 12.5 }}>{c.name}</b>
                    {c.room && <span className="tag tag-muted">{c.room}</span>}
                  </div>
                ))}
                {todayClasses.length === 0 && (
                  <p className="hint" style={{ margin: 0 }}>오늘은 수업이 없습니다.</p>
                )}
                {tasksToday.map((t) => (
                  <div className="unitrow" key={t.id}>
                    <span className="hint" style={{ minWidth: 84 }}>
                      {t.start_time ? cut(t.start_time) : "일정"}
                    </span>
                    <b style={{ fontSize: 12.5 }}>{t.title}</b>
                    {t.category && <span className="tag tag-sky">{t.category}</span>}
                    {t.deliver_body && <span className="tag tag-lav">전달사항</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
                이번 주{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
                  {tasksWeek.length}건
                </span>
              </h2>
              {tasksWeek.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>예정된 일정이 없습니다.</p>
              ) : (
                <div className="stack" style={{ gap: 4 }}>
                  {tasksWeek.map((t) => (
                    <div className="unitrow" key={t.id}>
                      <span className="hint" style={{ minWidth: 62 }}>{dayLabel(t.due_on)}</span>
                      <b style={{ fontSize: 12.5 }}>{t.title}</b>
                      {t.category && <span className="tag tag-muted">{t.category}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
                이번 달 남은 일정{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
                  {tasksMonth.length}건
                </span>
              </h2>
              {tasksMonth.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>없습니다.</p>
              ) : (
                <div className="stack" style={{ gap: 4 }}>
                  {tasksMonth.map((t) => (
                    <div className="unitrow" key={t.id}>
                      <span className="hint" style={{ minWidth: 62 }}>{dayLabel(t.due_on)}</span>
                      <b style={{ fontSize: 12.5 }}>{t.title}</b>
                      {t.category && <span className="tag tag-muted">{t.category}</span>}
                    </div>
                  ))}
                </div>
              )}
              <Link className="btn btn-ghost btn-sm" href="/tasks" style={{ marginTop: 8 }}>
                일정 전체 보기
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
