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
  const { data: att } = await supabase
    .from("attendance")
    .select("student_id, status, makeup_of")
    .eq("date", date);

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
    .select("id, name, status")
    .order("name", { ascending: true });
  const textbooks = (books || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name }));

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
          .select("id, name, parent_id, textbook_id, page_start, page_end, total_pages")
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
      unitNames[u.id] = { path: chain.join(" › ") + pages, amount, textbookId: u.textbook_id };
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

  const studentById = new Map((students || []).map((s) => [s.id, s]));
  const attById = new Map((att || []).map((a) => [a.student_id, a]));
  const memberIds = new Set();

  const booksOfClass = new Map();
  (classBooks || []).forEach((cb) => {
    if (!booksOfClass.has(cb.class_id)) booksOfClass.set(cb.class_id, []);
    booksOfClass.get(cb.class_id).push(cb.textbook_id);
  });

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
          report: rep,
          items: rep ? itemsByReport.get(rep.id) || {} : {},
          lastProgress: lastProgress.get(s.id) || null,
          toCheck: toCheckOf(s.id),
          nextHomework: rep ? nextByReport.get(rep.id) || [] : [],
          nextUnits: nextUnitsOf(rep),
          checkUnits: assignedUnitsOf(s.id),
          notices: noticesOfStudent.get(s.id) || [],
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
