import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import TodayBoard from "./TodayBoard";
import TopNotices from "./TopNotices";

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
  let { data: att, error: attErr } = await supabase
    .from("attendance")
    .select("student_id, status, makeup_of, planned, reason")
    .eq("date", date);
  if (attErr) {
    ({ data: att } = await supabase
      .from("attendance")
      .select("student_id, status, makeup_of")
      .eq("date", date));
  }

  // 오늘 리포트 + 숙제 항목 마스터 + 지난 진도
  let [{ data: reports }, { data: items, error: itemsErr }, { data: prevReports }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("id, student_id, attitude, word_correct, word_total, sent_correct, sent_total, own_progress, notice, report_written")
      .eq("date", date),
    supabase
      .from("homework_items")
      .select("id, name, category, sort, method")
      .eq("active", true)
      .order("sort", { ascending: true }),
    supabase
      .from("daily_reports")
      .select("id, student_id, own_progress, date")
      .lt("date", date)
      .order("date", { ascending: false })
      .limit(300),
  ]);

  // method 컬럼이 아직 없는 DB에서도 동작하도록 재조회
  if (itemsErr) {
    ({ data: items } = await supabase
      .from("homework_items")
      .select("id, name, category, sort")
      .eq("active", true)
      .order("sort", { ascending: true }));
  }

  const reportByStudent = new Map((reports || []).map((r) => [r.student_id, r]));
  const lastProgress = new Map();
  const lastReportId = new Map(); // 학생 → 가장 최근 수업의 리포트 id
  (prevReports || []).forEach((r) => {
    if (!lastReportId.has(r.student_id)) lastReportId.set(r.student_id, r.id);
    if (r.own_progress && !lastProgress.has(r.student_id)) {
      lastProgress.set(r.student_id, r.own_progress);
    }
  });

  // daily_report_items 조회 — 0008 마이그레이션 전 DB에서도 동작하도록 재시도
  const DRI_BASE = "daily_report_id, homework_item_id, status";
  async function loadItems(ids, onlyAssigned) {
    if (!ids || ids.length === 0) return [];
    const build = (cols) => {
      let q = supabase.from("daily_report_items").select(cols).in("daily_report_id", ids);
      if (onlyAssigned) q = q.eq("status", "assigned");
      return q;
    };
    let { data, error } = await build(`${DRI_BASE}, textbook_unit_id, textbook_unit_ids, range_note`);
    if (error) ({ data, error } = await build(`${DRI_BASE}, textbook_unit_id, range_note`));
    if (error) ({ data } = await build(DRI_BASE));
    return data || [];
  }

  // 리포트별 숙제 항목 상태
  const reportIds = (reports || []).map((r) => r.id);
  const itemsByReport = new Map();
  const nextByReport = new Map();
  const unitIds = new Set();
  const unitOf = new Map(); // `${reportId}|${itemId}` → { unitId, note }

  const idsOf = (x) =>
    (x.textbook_unit_ids && x.textbook_unit_ids.length
      ? x.textbook_unit_ids
      : x.textbook_unit_id
      ? [x.textbook_unit_id]
      : []);

  (await loadItems(reportIds)).forEach((x) => {
    idsOf(x).forEach((id) => unitIds.add(id));
    if (x.status === "assigned") {
      if (!nextByReport.has(x.daily_report_id)) nextByReport.set(x.daily_report_id, []);
      nextByReport.get(x.daily_report_id).push(x.homework_item_id);
      unitOf.set(`${x.daily_report_id}|${x.homework_item_id}`, {
        unitIds: idsOf(x),
        note: x.range_note || "",
      });
      return;
    }
    if (!itemsByReport.has(x.daily_report_id)) itemsByReport.set(x.daily_report_id, {});
    itemsByReport.get(x.daily_report_id)[x.homework_item_id] = x.status;
  });

  // 지난 수업에서 '배정한' 숙제 = 오늘 검사해야 할 항목
  const prevIds = [...lastReportId.values()];
  const prevAssigned = new Map();
  const prevUnitOf = new Map(); // `${studentId}|${itemId}` → { unitId, note }
  const prevReportStudent = new Map(
    (prevReports || []).map((r) => [r.id, r.student_id])
  );
  (await loadItems(prevIds, true)).forEach((x) => {
    idsOf(x).forEach((id) => unitIds.add(id));
    if (!prevAssigned.has(x.daily_report_id)) prevAssigned.set(x.daily_report_id, []);
    prevAssigned.get(x.daily_report_id).push(x.homework_item_id);
    const sid = prevReportStudent.get(x.daily_report_id);
    if (sid) {
      prevUnitOf.set(`${sid}|${x.homework_item_id}`, {
        unitIds: idsOf(x),
        note: x.range_note || "",
      });
    }
  });
  const toCheckOf = (sid) => prevAssigned.get(lastReportId.get(sid)) || [];
  const assignedUnitsOf = (sid) => {
    const out = {};
    toCheckOf(sid).forEach((iid) => {
      const u = prevUnitOf.get(`${sid}|${iid}`);
      if (u) out[iid] = u;
    });
    return out;
  };
  const nextUnitsOf = (rep) => {
    if (!rep) return {};
    const out = {};
    (nextByReport.get(rep.id) || []).forEach((iid) => {
      const u = unitOf.get(`${rep.id}|${iid}`);
      if (u) out[iid] = u;
    });
    return out;
  };

  // 교재 목록(사용중) + 화면에 이미 쓰인 단원의 이름
  const { data: books } = await supabase
    .from("textbooks")
    .select("id, name, status, total_pages, area")
    .order("name", { ascending: true });
  const textbooks = (books || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name, area: b.area || "" }));

  const { data: classBooks } = await supabase
    .from("class_textbooks")
    .select("class_id, textbook_id");

  const unitNames = {};
  if (unitIds.size > 0) {
    // 대/중/소단원 경로를 만들려면 같은 교재의 단원을 모두 가져와야 한다
    const { data: picked } = await supabase
      .from("textbook_units")
      .select("id, textbook_id")
      .in("id", [...unitIds]);
    const bookIds = [...new Set((picked || []).map((u) => u.textbook_id))];
    const { data: all } = bookIds.length
      ? await supabase
          .from("textbook_units")
          .select("id, name, parent_id, textbook_id, page_start, page_end, total_pages, label")
          .in("textbook_id", bookIds)
      : { data: [] };
    const byId = new Map((all || []).map((u) => [u.id, u]));
    (all || []).filter((u) => unitIds.has(u.id)).forEach((u) => {
      const chain = [];
      let cur = u;
      const seen = new Set();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        chain.unshift(cur.name);
        cur = cur.parent_id ? byId.get(cur.parent_id) : null;
      }
      const pages =
        u.page_start && u.page_end ? ` (${u.page_start}~${u.page_end}p)` : "";
      const amount = u.total_pages
        ? `${u.total_pages}p`
        : u.page_start && u.page_end
        ? `${u.page_end - u.page_start + 1}p`
        : "";
      unitNames[u.id] = {
        path: chain.join(" › ") + pages,
        amount,
        activity: u.label || "",
        textbookId: u.textbook_id,
      };
    });
  }

  // 오늘의 공지 · 전달사항
  const { data: noticeRows, error: noticeErr } = await supabase
    .from("notices")
    .select("id, kind, scope, class_id, school, grade, body, created_at")
    .eq("date", date)
    .order("created_at", { ascending: true });
  const noticesAvailable = !noticeErr;
  const noticeIds = (noticeRows || []).map((n) => n.id);
  const { data: receipts } = noticeIds.length
    ? await supabase
        .from("notice_receipts")
        .select("notice_id, student_id, delivered_at")
        .in("notice_id", noticeIds)
    : { data: [] };

  const noticeById = new Map((noticeRows || []).map((n) => [n.id, n]));
  const noticesOfStudent = new Map(); // studentId → [{ id, kind, body, delivered }]
  const tally = new Map();            // noticeId → { total, done }
  (receipts || []).forEach((r) => {
    const n = noticeById.get(r.notice_id);
    if (!n) return;
    const t = tally.get(r.notice_id) || { total: 0, done: 0 };
    t.total += 1;
    if (r.delivered_at) t.done += 1;
    tally.set(r.notice_id, t);
    if (!noticesOfStudent.has(r.student_id)) noticesOfStudent.set(r.student_id, []);
    noticesOfStudent.get(r.student_id).push({
      id: n.id,
      kind: n.kind,
      body: n.body,
      delivered: !!r.delivered_at,
    });
  });

  // ---------- 학생별 교재 배정 · 단원 진도 ----------
  const booksOfClassEarly = new Map();
  (classBooks || []).forEach((cb) => {
    if (!booksOfClassEarly.has(cb.class_id)) booksOfClassEarly.set(cb.class_id, []);
    booksOfClassEarly.get(cb.class_id).push(cb.textbook_id);
  });

  const studentIds = (students || []).map((s) => s.id);
  const { data: stBooks } = studentIds.length
    ? await supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, status, current_page, ended_on")
        .in("student_id", studentIds)
    : { data: [] };
  const { data: stProgress } = studentIds.length
    ? await supabase
        .from("student_unit_progress")
        .select("student_id, textbook_unit_id, status")
        .in("student_id", studentIds)
    : { data: [] };

  const booksOfStudent = new Map();
  const pageOf = new Map(); // `${studentId}|${textbookId}` → 지금 페이지
  (stBooks || []).forEach((r) => {
    // 완료·중단한 교재는 숙제 배정·진도 화면에서 빼고, 재원생 기록에만 남긴다
    if (r.status && r.status !== "active") return;
    if (!booksOfStudent.has(r.student_id)) booksOfStudent.set(r.student_id, new Set());
    booksOfStudent.get(r.student_id).add(r.textbook_id);
    if (r.current_page) pageOf.set(`${r.student_id}|${r.textbook_id}`, r.current_page);
  });
  const doneUnitsOf = new Map();
  (stProgress || []).forEach((r) => {
    if (r.status !== "done") return;
    if (!doneUnitsOf.has(r.student_id)) doneUnitsOf.set(r.student_id, new Set());
    doneUnitsOf.get(r.student_id).add(r.textbook_unit_id);
  });

  // 화면에 나올 교재들의 단원을 한 번에 가져와 전체 분량을 센다
  const shownBookIds = new Set();
  booksOfClassEarly.forEach((ids) => ids.forEach((id) => shownBookIds.add(id)));
  booksOfStudent.forEach((set) => set.forEach((id) => shownBookIds.add(id)));

  const unitsOfBook = new Map(); // textbookId → [{ id, parent_id, pages }]
  if (shownBookIds.size > 0) {
    const cols = "id, textbook_id, parent_id, page_start, page_end";
    let { data: bu, error: buErr } = await supabase
      .from("textbook_units")
      .select(`${cols}, total_pages`)
      .in("textbook_id", [...shownBookIds]);
    if (buErr) {
      ({ data: bu } = await supabase
        .from("textbook_units")
        .select(cols)
        .in("textbook_id", [...shownBookIds]));
    }
    const parents = new Set((bu || []).map((u) => u.parent_id).filter(Boolean));
    (bu || []).forEach((u) => {
      if (parents.has(u.id)) return; // 중간 단원은 세지 않는다 (소단원만)
      const pages =
        u.total_pages ||
        (u.page_start && u.page_end ? u.page_end - u.page_start + 1 : 0);
      if (!unitsOfBook.has(u.textbook_id)) unitsOfBook.set(u.textbook_id, []);
      unitsOfBook.get(u.textbook_id).push({ id: u.id, pages });
    });
  }

  const bookNameOf = new Map((books || []).map((b) => [b.id, b.name]));
  const bookAreaOf = new Map((books || []).map((b) => [b.id, b.area || ""]));
  const bookPagesOf = new Map((books || []).map((b) => [b.id, b.total_pages || 0]));

  // 진도율 = 완료한 단원 ÷ 전체 단원 (분량이 있으면 분량 기준)
  // 순서와 상관없이 아무 단원이나 체크할 수 있으므로 "합계"로 센다
  function progressOf(studentId, classId) {
    const ids = new Set([
      ...(booksOfClassEarly.get(classId) || []),
      ...(booksOfStudent.get(studentId) || []),
    ]);
    const done = doneUnitsOf.get(studentId) || new Set();
    return [...ids].map((tid) => {
      const list = unitsOfBook.get(tid) || [];
      const totalUnits = list.length;
      const doneUnits = list.filter((u) => done.has(u.id)).length;
      const totalPages = list.reduce((a, u) => a + (u.pages || 0), 0);
      const donePages = list
        .filter((u) => done.has(u.id))
        .reduce((a, u) => a + (u.pages || 0), 0);
      const usePages = totalPages > 0;
      // 단원이 없으면 "지금 몇 페이지까지"로 대신 계산한다
      const curPage = pageOf.get(`${studentId}|${tid}`) || 0;
      const bookPages = bookPagesOf.get(tid) || 0;
      const percent =
        totalUnits > 0
          ? Math.round(((usePages ? donePages : doneUnits) / (usePages ? totalPages : totalUnits)) * 100)
          : bookPages > 0
          ? Math.min(100, Math.round((curPage / bookPages) * 100))
          : null;
      return {
        id: tid,
        name: bookNameOf.get(tid) || "교재",
        area: bookAreaOf.get(tid) || "",
        doneUnits,
        totalUnits,
        donePages,
        totalPages,
        curPage,
        bookPages,
        percent,
      };
    });
  }

  const studentById = new Map((students || []).map((s) => [s.id, s]));
  const attById = new Map((att || []).map((a) => [a.student_id, a]));
  const memberIds = new Set();

  const booksOfClass = booksOfClassEarly;

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
        const rep = reportByStudent.get(s.id) || null;
        return {
          student: s,
          status: a?.status || null,
          isMakeup: a?.status === "makeup",
          plannedAbsent: !!(a?.planned && a.status === "absent"),
          absenceReason: a?.reason || "",
          report: rep,
          items: rep ? itemsByReport.get(rep.id) || {} : {},
          lastProgress: lastProgress.get(s.id) || null,
          toCheck: toCheckOf(s.id),
          nextHomework: rep ? nextByReport.get(rep.id) || [] : [],
          nextUnits: nextUnitsOf(rep),
          checkUnits: assignedUnitsOf(s.id),
          notices: noticesOfStudent.get(s.id) || [],
          books: progressOf(s.id, klass.id),
          reportWritten: !!rep?.report_written,
        };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name, "ko"));
    return { klass, rows, textbookIds: booksOfClass.get(klass.id) || [] };
  });

  // 오늘 반에 속하지 않지만 보강으로 오는 학생
  const extras = (att || [])
    .filter((a) => a.status === "makeup" && !memberIds.has(a.student_id))
    .map((a) => studentById.get(a.student_id))
    .filter(Boolean)
    .map((s) => {
      const rep = reportByStudent.get(s.id) || null;
      return {
        student: s,
        status: "makeup",
        isMakeup: true,
        report: rep,
        items: rep ? itemsByReport.get(rep.id) || {} : {},
        lastProgress: lastProgress.get(s.id) || null,
        toCheck: toCheckOf(s.id),
        nextHomework: rep ? nextByReport.get(rep.id) || [] : [],
        nextUnits: nextUnitsOf(rep),
        checkUnits: assignedUnitsOf(s.id),
        notices: noticesOfStudent.get(s.id) || [],
        books: progressOf(s.id, null),
        reportWritten: !!rep?.report_written,
      };
    });
  if (extras.length > 0) {
    groups.push({
      klass: { id: "makeup", name: "보강", start_time: null, end_time: null },
      rows: extras,
      textbookIds: [],
    });
  }

  // 오늘 일정 — 전달사항으로 아직 안 깐 것
  const { data: todayTasks } = await supabase
    .from("tasks")
    .select("id, title, due_on, start_time, category, deliver_body, kind")
    .eq("due_on", date)
    .order("start_time", { ascending: true });
  const pendingTaskIds = (todayTasks || []).filter((t) => t.deliver_body).map((t) => t.id);
  const { data: madeNotices } = pendingTaskIds.length
    ? await supabase.from("notices").select("task_id").in("task_id", pendingTaskIds).eq("date", date)
    : { data: [] };
  const madeSet = new Set((madeNotices || []).map((n) => n.task_id));
  const taskCards = (todayTasks || []).map((t) => ({
    id: t.id,
    title: t.title,
    time: t.start_time ? t.start_time.slice(0, 5) : "",
    category: t.category || "",
    kind: t.kind,
    deliverBody: t.deliver_body || "",
    applied: madeSet.has(t.id),
  }));

  // 공지 폼에 쓸 오늘 로스터 (반 정보 포함)
  const rosterStudents = [];
  const seenRoster = new Set();
  groups.forEach(({ klass, rows }) => {
    rows.forEach(({ student }) => {
      if (seenRoster.has(student.id)) {
        const found = rosterStudents.find((x) => x.id === student.id);
        if (found) found.classIds.push(klass.id);
        return;
      }
      seenRoster.add(student.id);
      rosterStudents.push({
        id: student.id,
        name: student.name,
        school: student.school,
        grade: student.grade,
        classIds: [klass.id],
      });
    });
  });

  const classNameOf = (id) =>
    groups.find((g) => g.klass.id === id)?.klass.name || "반";
  const noticeCards = (noticeRows || []).map((n) => {
    const t = tally.get(n.id) || { total: 0, done: 0 };
    const targetLabel =
      n.scope === "class"
        ? classNameOf(n.class_id)
        : n.scope === "grade"
        ? [n.school, n.grade].filter(Boolean).join(" ") || "학년"
        : n.scope === "student"
        ? `개인 ${t.total}명`
        : "전체";
    return { id: n.id, kind: n.kind, body: n.body, targetLabel, total: t.total, done: t.done };
  });

  const label = `${target.getMonth() + 1}월 ${target.getDate()}일 (${dow})`;

  return (
    <>
      <TopBar profile={profile} active="today" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">오늘 수업</p>
          <h1 className="h1">{label}</h1>
        </div>
        <TopNotices
          date={date}
          classes={groups.map((g) => ({ id: g.klass.id, name: g.klass.name }))}
          students={rosterStudents}
          notices={noticeCards}
          tasks={taskCards}
          unavailable={!noticesAvailable}
        />
        <TodayBoard
          date={date}
          groups={groups}
          items={items || []}
          textbooks={textbooks}
          unitNames={unitNames}
        />
      </main>
    </>
  );
}
