import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import RequestInbox from "./RequestInbox";
import MakeupInbox from "./MakeupInbox";

export const dynamic = "force-dynamic";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function cut(t) {
  return t ? t.slice(0, 5) : "";
}
function iso(d) {
  return d.toISOString().slice(0, 10);
}
function dayLabel(s) {
  const t = new Date(`${s}T00:00:00+09:00`);
  return `${t.getMonth() + 1}/${t.getDate()} (${DAYS[t.getDay()]})`;
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

  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const today = iso(seoul);
  const dow = DAYS[seoul.getDay()];
  const weekEnd = iso(new Date(seoul.getTime() + 7 * 86400000));
  const monthEnd = iso(new Date(seoul.getFullYear(), seoul.getMonth() + 2, 0));

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

  const twoWeeksAgo = iso(new Date(seoul.getTime() - 14 * 86400000));
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
  const monthAgo = iso(new Date(seoul.getTime() - 30 * 86400000));
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

  const label = `${seoul.getMonth() + 1}월 ${seoul.getDate()}일 (${dow})`;

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
          {makeupRows.length > 0 && (
            <span className="btn" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>
              보강 잡을 것 {makeupRows.length}건
            </span>
          )}
          {inquiries.length > 0 && (
            <Link className="btn" href="/consult">진행중 상담 {inquiries.length}건</Link>
          )}
          {overdue.length > 0 && (
            <Link className="btn" href="/todo">지난 할일 {overdue.length}건</Link>
          )}
          {todos.length > 0 && (
            <Link className="btn" href="/todo">할일 {todos.length}건</Link>
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
                {soonAbsent.length === 0 && watchList.length === 0 && holidays.length === 0 && (
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
