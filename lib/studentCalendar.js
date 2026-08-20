/**
 * 학생·학부모 달력에 담을 것 — **한 곳에서 만든다.**
 *
 * 두 화면이 같은 달력을 보여줘야 한다. 집에서 아이 화면과 어머니 화면을
 * 나란히 놓고 보시는 일이 흔한데, 거기서 다르면 그 자리에서 다투게 된다.
 *
 * ── 무엇을 담나 (원장님, 2026-08-06) ─────────────────────────
 *
 *   회차   「1회차」 「2회차」 — 수업일마다
 *   휴강   그날 수업 없음
 *   시험   우리 학교 · 우리 학년 시험 기간
 *   결석   내 결석 · 보강 · 지각 (지나간 것도 남긴다)
 *   일정   원장님이 **우리에게 보이라고 고른 것만** (0092)
 *
 * **「수업 17:00」 은 안 담는다.** 자기 수업 요일은 아이도 어머니도 이미
 * 안다 — 요일마다 찍히면 달력이 그것으로 차고, 정작 봐야 할 시험이 묻힌다.
 * 대신 몇 회차인지를 적는다. 그건 모르는 것이고, 수강료·보강과 이어진다.
 */

import { addDays, dowOf } from "./day.js";
import { sessionNumbers } from "./schedule.js";
import { tasksForStudent } from "./taskAudience.js";
import { takesExam } from "./who.js";
import { dropNeisShadowedByExams } from "./calendar.js";
import { looseKey } from "./schoolName.js";

/** calFrom~calTo 사이의 달들 */
function monthsBetween(from, to) {
  const out = [];
  let ym = from.slice(0, 7);
  const last = to.slice(0, 7);
  while (ym <= last) {
    out.push(ym);
    const [y, m] = ym.split("-").map(Number);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return out;
}

/**
 * @param supabase  그 사람의 세션 (RLS 가 알아서 거른다)
 * @param student   { id, school, grade, school_id }
 * @param myClasses [{ id, name, days, start_time, starts_on, ends_on }]
 * @param today     "YYYY-MM-DD"
 */
export async function loadStudentCalendar(supabase, student, myClasses = [], today) {
  const from = addDays(today, -40);
  const to = addDays(today, 120);
  const items = [];

  // ── 휴강 ─────────────────────────────────────────────────
  //   제일 알려야 하는 것이다 — 그날 헛걸음하지 않으시라고.
  //   0096 전이면 못 읽는다. 그때는 휴강이 안 뜨고 회차도 그만큼 어긋나는데,
  //   **틀린 회차는 없는 것보다 나쁘므로** 회차를 아예 안 적는다.
  let holidays = [];
  let canCount = true;
  {
    const q = await supabase
      .from("holidays").select("date, name, scope, class_id")
      .gte("date", from).lte("date", to);
    if (q.error) canCount = false;
    else holidays = q.data || [];
  }
  const myIds = new Set(myClasses.map((c) => c.id));
  holidays
    .filter((h) => h.scope === "all" || myIds.has(h.class_id))
    .forEach((h) => items.push({ date: h.date, title: h.name || "휴강", tone: "off" }));

  // ── 회차 ─────────────────────────────────────────────────
  //   보강만 하는 요일은 정규 회차가 아니다. 그 설정을 못 읽으면 숫자가
  //   틀리므로, 못 읽었으면 회차를 안 적는다 (0096 의 schedule 한 줄)
  let makeupDays = null;
  {
    const q = await supabase
      .from("integrations").select("config").eq("id", "schedule").maybeSingle();
    if (q.error) canCount = false;
    else makeupDays = q.data?.config?.makeupDays ?? [];
  }

  if (canCount && myClasses.length > 0) {
    const offOf = (klass) =>
      new Set(
        holidays
          .filter((h) => h.scope === "all" || h.class_id === klass.id)
          .map((h) => h.date)
      );
    monthsBetween(from, to).forEach((ym) => {
      myClasses.forEach((c) => {
        sessionNumbers(c, ym, offOf(c), makeupDays || []).forEach((n, date) => {
          if (date < from || date > to) return;
          items.push({
            date,
            title: `${n}회차`,
            tone: "klass",
            // 반이 여럿인 아이는 어느 반 것인지 알아야 한다
            note: myClasses.length > 1 ? c.name || "" : "",
          });
        });
      });
    });
  }

  // ── 우리 학교 · 우리 학년 시험 기간 ───────────────────────
  const examDays = [];
  let examRows = [];
  {
    let q = await supabase
      .from("exam_periods")
      .select("id, school, grade, name, from_date, to_date, hidden, neis_source_id")
      .lte("from_date", to)
      .gte("to_date", from);
    if (q.error) {
      // 0060 전이면 hidden 없이
      q = await supabase
        .from("exam_periods")
        .select("id, school, grade, name, from_date, to_date")
        .lte("from_date", to)
        .gte("to_date", from);
    }
    examRows = (q.error ? [] : q.data || []).filter((e) => !e.hidden);
    examRows
      // 숨긴 시험은 「없는 셈 친다」 — 원장 화면들과 같은 규칙 (전수검사 A6).
      // 안 거르면 원장님이 숨겼는데 아이 달력에는 시험기간이 그대로 뜬다
      // 학교·학년이 비어 있는 것은 「전체」 로 본다 — 빼면 아무것도 안 보인다.
      // 견주는 규칙은 lib/who 한 곳에 있다 (「신정중」 과 「인천신정중학교」)
      .filter((e) => !e.school || takesExam(student, e))
      .forEach((e) =>
        examDays.push({
          date: e.from_date,
          endDate: e.to_date || null,
          title: e.name || "시험",
          tone: "exam",
        })
      );
  }
  items.push(...examDays);

  // ── 내 결석 · 보강 — 지나간 것도 남긴다 (보강으로 채운 날이 보여야 한다) ──
  {
    const q = await supabase
      .from("attendance").select("date, status, reason")
      .eq("student_id", student.id).gte("date", from).lte("date", to);
    const LABEL = { absent: "결석", makeup: "보강", late: "지각", online: "온라인" };
    (q.error ? [] : q.data || [])
      .filter((a) => LABEL[a.status])
      .forEach((a) =>
        items.push({ date: a.date, title: LABEL[a.status], tone: "absent", note: a.reason || "" })
      );
  }

  // ── 학원·학교 일정 — 우리에게 보이라고 고른 것만 (0092) ──
  const TASK_COLS = "id, title, kind, due_on, end_on, source, source_id, note";
  let tasks = [];
  {
    let q = await supabase
      .from("tasks")
      .select(`${TASK_COLS}, deliver_scope, deliver_student_ids, deliver_school_id, deliver_school, deliver_grade, deliver_class_id, private`)
      .neq("kind", "todo")
      .gte("due_on", from)
      .lte("due_on", to)
      .order("due_on", { ascending: true });
    if (q.error) {
      // 0077 전이면 대상 칸이 없다 — 그때는 RLS 가 거른 것을 그대로 쓴다
      q = await supabase
        .from("tasks").select(TASK_COLS).neq("kind", "todo")
        .gte("due_on", from).lte("due_on", to)
        .order("due_on", { ascending: true });
    }
    tasks = q.error ? [] : q.data || [];
  }
  // DB 도 같은 규칙으로 막지만, 선생님이 미리보기로 볼 때는 선생님 권한이라
  // 전부 통과한다 — 그러면 미리보기가 거짓말을 한다
  // 회차가 이미 말하는 나이스 줄은 여기서도 안 그린다 (2026-08-21) —
  // 아이 달력에 「🏫 중간고사」 와 「📕 중간고사」 가 나란히 서던 것
  tasks = dropNeisShadowedByExams(tasks, examRows, looseKey);
  const mineTasks = tasksForStudent(tasks, {
    id: student.id,
    schoolId: student.school_id || null,
    school: student.school || "",
    grade: student.grade || "",
    classIds: [...myIds],
  });
  mineTasks.forEach((t) =>
    items.push({
      date: t.due_on,
      endDate: t.end_on || null,
      title: t.title,
      tone: t.source === "neis" ? "school" : "event",
      note: t.note || "",
    })
  );

  // 내 것(휴강·회차·시험·결석)을 앞에 둔다 — 달력 한 칸에 두 개까지만 보인다
  return { items, upcoming: upcomingOf([...examDays, ...mineTasks.map(toItem)], today) };
}

function toItem(t) {
  return {
    date: t.due_on,
    endDate: t.end_on || null,
    title: t.title,
    tone: t.source === "neis" ? "school" : "event",
  };
}

/**
 * 「일정 및 전달사항」 에 적을 것 — **다가오는 것만, 몇 개만.**
 * 지난 것까지 쌓이면 오늘 알아야 할 것이 안 보인다.
 */
function upcomingOf(list, today) {
  return list
    .filter((c) => (c.endDate || c.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
}

export { dowOf };
