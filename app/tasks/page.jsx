import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddTaskForm from "./AddTaskForm";
import TaskBoard from "./TaskBoard";
import TodoBoard from "../todo/TodoBoard";
import PrepTodo from "./PrepTodo";
import MakeupTodo from "./MakeupTodo";
import CalendarBoard from "./CalendarBoard";
import GoogleSync from "./GoogleSync";
import { todaySeoul, addDays } from "@/lib/day";
import { makeupNeeded } from "@/lib/makeupTask";
import { hiddenExamIds } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// 일정과 할일은 같은 테이블(tasks)이다. 화면도 하나로 합치고,
// 위의 버튼으로 [통합] [일정만] [할일만] 을 오간다.
//   /todo 는 이 화면의 ?view=todo 로 온다 (옛 주소·즐겨찾기가 안 깨지게)
const VIEWS = [
  { key: "all", label: "통합" },
  { key: "calendar", label: "달력" },
  { key: "schedule", label: "일정만" },
  { key: "todo", label: "할일만" },
];

/** 그 달의 첫날·끝날 */
function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, "0")}`];
}
function shiftMonth(ym, by) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 아직 안 만든 **내신 자료** — 이것도 할일이다 (0052~0054).
 *
 * 내신 대비 화면에 「만들기 · 인쇄 · 카드」 가 있는데, 여기 할일 화면에서는
 * 안 보였다. 그래서 시험이 코앞인데 자료가 몇 개 남았는지를 알려면 화면을
 * 따로 열어봐야 했다.
 *
 * **여기서 체크하지는 않는다.** 자료의 진짜 상태는 내신 대비 화면에 있고,
 * 두 군데에서 체크하게 만들면 어느 쪽이 맞는지 알 수 없게 된다. 여기서는
 * 「무엇이 언제까지 남았는지」만 보여주고 누르면 그 화면으로 간다.
 *
 * 마감은 **영어 시험일**이다. 없으면 시험 시작일 — 그 전에는 자료가 나와야 한다.
 */
/**
 * **결석해서 늘어난 내 수업** — 아직 보강이 안 잡힌 것.
 *
 * 결석은 일정이고 보강은 할 일이다 (원장님, 2026-08-05). 결석은 달력의
 * 일정 쪽에 그대로 두고, 거기서 생긴 보강만 여기서 뽑아 할 일로 보여준다.
 *
 * 새 표를 만들지 않는다 — 결석도 보강도 이미 attendance 에 있다.
 * 지난 것만 본다. 앞으로의 결석 예정은 아직 「해야 할 일」이 아니다.
 */
async function pendingMakeups(supabase) {
  const today = todaySeoul();
  const from = addDays(today, -60);              // 두 달이면 충분하다
  let q = await supabase
    .from("attendance")
    .select("student_id, date, status, reason")
    .in("status", ["absent", "makeup"])
    .gte("date", from)
    .lte("date", today);
  if (q.error) {
    q = await supabase
      .from("attendance")
      .select("student_id, date, status")
      .in("status", ["absent", "makeup"])
      .gte("date", from)
      .lte("date", today);
  }
  if (q.error) return [];
  const all = q.data || [];
  const rows = makeupNeeded(
    all.filter((a) => a.status === "absent"),
    all.filter((a) => a.status === "makeup")
  );
  if (rows.length === 0) return [];

  const { data: ss } = await supabase
    .from("students")
    .select("id, name, status")
    .in("id", rows.map((r) => r.student_id));
  const byId = new Map((ss || []).map((s) => [s.id, s]));
  return rows
    // 퇴원생 보강은 잡을 것이 없다
    .filter((r) => byId.get(r.student_id)?.status === "enrolled")
    .map((r) => ({ ...r, name: byId.get(r.student_id).name }));
}

async function pendingPrep(supabase) {
  const today = todaySeoul();
  const exQ = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date, to_date, english_on")
    .gte("to_date", today)
    .order("from_date", { ascending: true });
  if (exQ.error) return [];                       // 0022 전이면 조용히 넘어간다

  const hidden = await hiddenExamIds(supabase);
  const exams = (exQ.data || []).filter((e) => !hidden.has(e.id));
  if (exams.length === 0) return [];
  const examById = new Map(exams.map((e) => [e.id, e]));

  const scQ = await supabase
    .from("prep_scopes")
    .select("id, exam_id, name")
    .in("exam_id", [...examById.keys()]);
  if (scQ.error || !(scQ.data || []).length) return [];   // 0052 전이거나 범위가 없다
  const scopeById = new Map(scQ.data.map((s) => [s.id, s]));

  const mQ = await supabase
    .from("prep_materials")
    .select("id, scope_id, name, need_make, need_print, need_card, made_at, printed_at, card_at")
    .in("scope_id", [...scopeById.keys()])
    .order("sort", { ascending: true });
  if (mQ.error) return [];

  const STAGES = [
    ["need_make", "made_at", "만들기"],
    ["need_print", "printed_at", "인쇄"],
    ["need_card", "card_at", "카드"],
  ];

  return (mQ.data || [])
    .map((m) => {
      const left = STAGES.filter(([need, done]) => m[need] && !m[done]).map(([, , label]) => label);
      if (left.length === 0) return null;          // 다 된 자료는 할일이 아니다
      const scope = scopeById.get(m.scope_id);
      const exam = examById.get(scope?.exam_id);
      if (!exam) return null;
      return {
        id: m.id,
        name: m.name,
        left,
        scope: scope?.name || "",
        exam: `${exam.school} ${exam.grade || ""} ${exam.name || "시험"}`.replace(/\s+/g, " ").trim(),
        due: exam.english_on || exam.from_date,
        byEnglish: !!exam.english_on,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.due.localeCompare(b.due) || a.exam.localeCompare(b.exam));
}

export default async function TasksPage({ searchParams }) {
  const view = VIEWS.some((v) => v.key === searchParams?.view) ? searchParams.view : "all";
  // 달력은 **그 달 전체**를 본다 — 지난 날도 같이 봐야 달력이다
  const isCal = view === "calendar";
  const ym = /^\d{4}-\d{2}$/.test(searchParams?.m || "")
    ? searchParams.m
    : todaySeoul().slice(0, 7);
  const [mFrom, mTo] = monthRange(ym);
  const wantSchedule = view !== "todo";
  const wantTodo = view !== "schedule";
  // 지난 일정은 기본으로 안 보인다.
  // 나이스에서 한 해치를 받으면 지난 3~7월 학교 행사가 통째로 쌓여서,
  // 앞으로 무슨 일이 있는지가 그 아래로 묻힌다. 필요하면 켜서 본다.
  const showPast = searchParams?.past === "1";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  // ── 일정 ──────────────────────────────────────────────
  let rows = [];
  let linked = [];
  let classes = [];
  let schools = [];
  let students = [];
  let grades = [];
  let taskErr = false;
  if (wantSchedule) {
    const COLS =
      "id, title, kind, category, due_on, end_on, start_time, status, class_id, note, deliver_body, deliver_scope, deliver_class_id, deliver_school, deliver_grade";
    // 달력이면 그 달만, 아니면 오늘부터 (지난 것은 켜야 보인다)
    const range = (q) =>
      isCal
        ? q.gte("due_on", mFrom).lte("due_on", mTo)
        : q.gte("due_on", showPast ? "1900-01-01" : todaySeoul());
    let { data: tasks, error } = await range(
      supabase.from("tasks").select(`${COLS}, private`).eq("kind", "schedule")
    ).order("due_on", { ascending: true });
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // 0066 전이면 '나만 보기' 없이
      ({ data: tasks, error } = await range(
        supabase.from("tasks").select(COLS).eq("kind", "schedule")
      ).order("due_on", { ascending: true }));
    }
    taskErr = !!error;

    const { data: cls } = await supabase
      .from("classes")
      .select("id, name")
      .order("start_time", { ascending: true });
    classes = cls || [];

    // 일정을 **누구에게** 보낼지 고를 거리 (0077).
    // 학교는 표에서 고른다 — 글자로 치면 「신송중」과 「신송중학교」가 갈린다.
    const schQ = await supabase.from("schools").select("id, name").order("name");
    schools = schQ.error ? [] : schQ.data || [];
    const stuQ = await supabase
      .from("students")
      .select("id, name, school, grade")
      .eq("status", "enrolled")
      .order("name");
    students = stuQ.error ? [] : stuQ.data || [];
    grades = [...new Set(students.map((s) => s.grade).filter(Boolean))].sort();

    // 이미 전달사항을 만든 일정 표시
    const taskIds = (tasks || []).filter((t) => t.deliver_body).map((t) => t.id);
    const { data: made } = taskIds.length
      ? await supabase.from("notices").select("task_id, date").in("task_id", taskIds)
      : { data: [] };
    const madeMap = new Map((made || []).map((n) => [n.task_id, n.date]));
    rows = (tasks || []).map((t) => ({ ...t, deliveredOn: madeMap.get(t.id) || null }));

    // 다른 화면에서 만든 일정도 여기서 같이 보여준다 (여기서 고치지는 않는다)
    //   시험 일정 → exam_periods (회차 관리 · 시험)
    //   휴강     → holidays      (수강료 · 회차 관리)
    const today = todaySeoul();
    // 달력이면 그 달에 걸치는 것, 아니면 오늘 이후 것
    let examSel = supabase
      .from("exam_periods")
      .select("id, school, grade, name, from_date, to_date, english_on")
      .gte("to_date", isCal ? mFrom : today);
    if (isCal) examSel = examSel.lte("from_date", mTo);
    const examQ = await examSel.order("from_date", { ascending: true });
    const hiddenExams = await hiddenExamIds(supabase);
    let holSel = supabase
      .from("holidays")
      .select("id, date, name, scope, class_id")
      .gte("date", isCal ? mFrom : today);
    if (isCal) holSel = holSel.lte("date", mTo);
    const holQ = await holSel.order("date", { ascending: true });

    // ── 달력에만 더 붙이는 것 ─────────────────────────────
    // 방문상담 · 레벨테스트 · 보강 · 결석은 각자 다른 표에 있다. 그래도
    // 원장님 하루에는 같이 들어 있으므로 달력에서는 같이 보여야 한다.
    // (목록에서는 안 붙인다 — 거기서 고칠 수 있는 것이 아니라 시끄러워진다)
    let extra = [];
    if (isCal) {
      const inqQ = await supabase
        .from("inquiries")
        .select("id, name, status, consult_on, consult_at, test_on, test_at")
        .or(`and(consult_on.gte.${mFrom},consult_on.lte.${mTo}),and(test_on.gte.${mFrom},test_on.lte.${mTo})`);
      (inqQ.error ? [] : inqQ.data || []).forEach((q) => {
        if (q.consult_on >= mFrom && q.consult_on <= mTo) {
          extra.push({
            key: `inq-c-${q.id}`,
            from: q.consult_on,
            to: q.consult_on,
            title: `${q.consult_at ? `${q.consult_at.slice(0, 5)} ` : ""}${q.name} 방문상담`,
            source: "상담",
            href: "/consult",
          });
        }
        if (q.test_on && q.test_on >= mFrom && q.test_on <= mTo) {
          extra.push({
            key: `inq-t-${q.id}`,
            from: q.test_on,
            to: q.test_on,
            title: `${q.test_at ? `${q.test_at.slice(0, 5)} ` : ""}${q.name} 레벨테스트`,
            source: "레테",
            href: "/consult",
          });
        }
      });

      // 보강 · 결석 — 학생 이름이 붙어야 쓸모가 있다
      let attQ = await supabase
        .from("attendance")
        .select("id, student_id, date, status, reason, makeup_time, planned")
        .in("status", ["makeup", "absent"])
        .gte("date", mFrom)
        .lte("date", mTo);
      if (attQ.error) {
        attQ = await supabase
          .from("attendance")
          .select("id, student_id, date, status")
          .in("status", ["makeup", "absent"])
          .gte("date", mFrom)
          .lte("date", mTo);
      }
      const nameOf = new Map((students || []).map((x) => [x.id, x.name]));
      (attQ.error ? [] : attQ.data || []).forEach((a) => {
        const who = nameOf.get(a.student_id);
        if (!who) return;                      // 퇴원생 기록은 달력에 안 띄운다
        const t = a.makeup_time ? `${a.makeup_time.slice(0, 5)} ` : "";
        extra.push({
          key: `att-${a.id || `${a.student_id}-${a.date}`}`,
          from: a.date,
          to: a.date,
          title:
            a.status === "makeup"
              ? `${t}${who} 보강`
              : `${who} 결석${a.planned ? " 예정" : ""}${a.reason ? ` (${a.reason})` : ""}`,
          source: a.status === "makeup" ? "보강" : "결석",
          href: `/today?d=${a.date}&open=${a.student_id}`,
        });
      });
    }

    linked = [
      ...(examQ.error ? [] : examQ.data || [])
        .filter((e) => !hiddenExams.has(e.id))   // 숨긴 시험은 뺀다
        .map((e) => ({
        key: `exam-${e.id}`,
        from: e.from_date,
        to: e.to_date,
        title: `${e.school} ${e.grade || ""} ${e.name || "시험"}`.replace(/\s+/g, " ").trim(),
        extra: e.english_on ? `영어 ${e.english_on.slice(5)}` : "영어 시험일 미정",
        source: "시험",
        href: "/schedule",
      })),
      ...(holQ.error ? [] : holQ.data || []).map((h) => ({
        key: `hol-${h.id}`,
        from: h.date,
        to: h.date,
        title: h.name || "휴강",
        extra: h.scope === "all" ? "전체 휴강" : "반 휴강",
        source: "휴강",
        href: "/schedule",
      })),
      ...extra,
    ].sort((a, b) => a.from.localeCompare(b.from));
  }

  // ── 할일 ──────────────────────────────────────────────
  let todos = [];
  let cats = [];
  let todoErr = false;
  let prep = [];
  let makeups = [];
  if (wantTodo) {
    const catQ = await supabase
      .from("todo_categories")
      .select("id, name, parent_id, color, sort, active")
      .eq("active", true)
      .order("sort", { ascending: true });
    cats = catQ.error ? [] : catQ.data || [];

    const TODO_COLS =
      "id, title, status, due_on, due_time, no_due, priority, note, todo_category_id, parent_id";
    let { data, error } = await supabase
      .from("tasks")
      .select(`${TODO_COLS}, auto_key`)
      .eq("kind", "todo")
      .order("due_on", { ascending: true });
    if (error) {
      // 0028 전이면 auto_key 없이
      ({ data, error } = await supabase
        .from("tasks")
        .select(TODO_COLS)
        .eq("kind", "todo")
        .order("due_on", { ascending: true }));
    }
    todos = data || [];
    todoErr = !!error || !!catQ.error;

    prep = await pendingPrep(supabase);
    makeups = await pendingMakeups(supabase);
  }

  return (
    <>
      <TopBar profile={profile} active="tasks" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">할일 · 일정</p>
          <h1 className="h1">
            {view === "todo" ? "내가 할 일" : view === "schedule" ? "학원 일정" : "할일 · 일정"}
          </h1>
          <p className="sub">
            {/* 둘이 헷갈리면 「오늘 뭘 해야 하나」 를 볼 때마다 걸러내야 한다.
                가르는 자리는 「그날 그런 일이 있다」 인가, 「내가 뭘 해야 한다」 인가다 */}
            <b>일정</b>은 <b>그날 그런 일이 있다</b>는 것입니다 — 학교 일정 · 시험 ·
            학생 결석 · 상담 예약. 전할 내용을 적으면 그날 전달사항으로 깔립니다.
            <br />
            <b>할일</b>은 <b>내가 처리해야 하는 것</b>입니다 — 결석해서 늘어난 보강,
            시험 대비 자료 만들기처럼요.
          </p>
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                className={`btn btn-sm ${view === v.key ? "btn-primary" : ""}`}
                href={v.key === "all" ? "/tasks" : `/tasks?view=${v.key}`}
              >
                {v.label}
              </Link>
            ))}
          </div>
        </div>

        {isCal && (
          <div className="row" style={{ marginBottom: 10, alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <AddTaskForm
              classes={classes}
              schools={schools}
              grades={grades}
              students={students}
            />
            <span className="spacer" />
            <GoogleSync />
          </div>
        )}
        {isCal && (
          <CalendarBoard
            ym={ym}
            tasks={rows}
            todos={todos}
            linked={linked}
            prev={shiftMonth(ym, -1)}
            next={shiftMonth(ym, 1)}
            thisMonth={todaySeoul().slice(0, 7)}
          />
        )}

        {wantSchedule && !isCal && (
          <section>
            {view === "all" && (
              <h2 style={{ margin: "6px 0 8px", fontSize: 15, fontWeight: 800 }}>일정</h2>
            )}
            <div className="row" style={{ marginBottom: 10, alignItems: "center", gap: 8 }}>
              <AddTaskForm
                classes={classes}
                schools={schools}
                grades={grades}
                students={students}
              />
              <span className="spacer" />
              <Link
                className="btn btn-ghost btn-sm"
                href={
                  showPast
                    ? `/tasks${view === "all" ? "" : `?view=${view}`}`
                    : `/tasks?past=1${view === "all" ? "" : `&view=${view}`}`
                }
              >
                {showPast ? "지난 일정 숨기기" : "지난 일정도 보기"}
              </Link>
            </div>
            <TaskBoard tasks={rows} classes={classes} unavailable={taskErr} linked={linked} />
          </section>
        )}

        {wantTodo && !isCal && (
          <section style={view === "all" ? { marginTop: 14 } : undefined}>
            {view === "all" && (
              <h2 style={{ margin: "6px 0 8px", fontSize: 15, fontWeight: 800 }}>할일</h2>
            )}
            <PrepTodo rows={prep} />
            <MakeupTodo rows={makeups} />
            <TodoBoard todos={todos} categories={cats} unavailable={todoErr} />
          </section>
        )}
      </main>
    </>
  );
}
