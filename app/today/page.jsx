import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import TodayBoard from "./TodayBoard";
import TopNotices from "./TopNotices";
import MonthlyReset from "./MonthlyReset";
import { dowOf, longLabel, todaySeoul, addDays } from "@/lib/day";
import { tally, resetDoneIn, DEFAULT_RULE } from "@/lib/warnings";
import { loadRunningClasses, isExtra } from "@/lib/classTerm";
import { purgeOncePerDay } from "./purgeActions";

export const dynamic = "force-dynamic";


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
  const date = searchParams?.d || todaySeoul();
  const dow = dowOf(date);

  // 한 달 지난 사진·녹음 치우기 — 하루 한 번, 조용히.
  // 따로 도는 서버가 없으니 매일 여는 이 화면에 붙인다.
  // 실패해도 수업 화면은 그냥 열려야 한다.
  try {
    await purgeOncePerDay();
  } catch {
    /* 정리가 안 됐다고 수업을 못 하면 안 된다 */
  }

  // 오늘 요일에 수업이 있는 반
  // (끝난 특강은 여기서 이미 빠진다 — 종강일이 지나면 오늘 수업에 안 뜬다)
  const allClasses = await loadRunningClasses(
    supabase,
    "id, name, days, start_time, end_time, room, level, category",
    date
  );
  const classes = allClasses
    .filter((c) => (c.days || []).includes(dow))
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  // 반 배정 + 학생
  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id");
  // 단어시험 설정(개수·통과선)까지 같이 들고 온다 — 채점 자리에서 바로
  // 통과·미통과가 나와야 하기 때문이다 (0070)
  let { data: students, error: stuErr } = await supabase
    .from("students")
    .select("id, name, school, grade, status, word_when, word_test_count, word_cut_pct")
    .eq("status", "enrolled");
  if (stuErr) {
    // 0070 전이면 개수·통과선 없이
    ({ data: students, error: stuErr } = await supabase
      .from("students")
      .select("id, name, school, grade, status, word_when")
      .eq("status", "enrolled"));
  }
  if (stuErr) {
    // 0037 전이면 단어시험 시점도 없이
    ({ data: students } = await supabase
      .from("students")
      .select("id, name, school, grade, status")
      .eq("status", "enrolled"));
  }

  // 오늘 출결 기록
  let { data: att, error: attErr } = await supabase
    .from("attendance")
    .select("student_id, status, makeup_of, planned, reason, makeup_time")
    .eq("date", date);
  if (attErr) {
    // 0046 전이면 시간 없이, 그래도 안 되면 최소 칸만
    ({ data: att, error: attErr } = await supabase
      .from("attendance")
      .select("student_id, status, makeup_of, planned, reason")
      .eq("date", date));
    if (attErr) {
      ({ data: att } = await supabase
        .from("attendance")
        .select("student_id, status, makeup_of")
        .eq("date", date));
    }
  }

  // 학생이 낸 숙제 (0044 전이면 빈 배열)
  //   집에서 어제 냈을 수도 있으므로 지난 수업 이후치를 함께 본다
  const { data: subRows } = await supabase
    .from("homework_submissions")
    .select("id, student_id, kind, path, body, seconds, checked_at, created_at, homework_item_id, report_item_id")
    .gte("date", addDays(date, -7))
    .lte("date", date)
    .order("created_at", { ascending: false });

  // 오늘 특강 출결 (0042 전이면 빈 배열 — 예전처럼 하루 출결만 쓴다)
  const { data: clsAtt } = await supabase
    .from("class_attendance")
    .select("class_id, student_id, status, makeup_of, note")
    .eq("date", date);

  // 오늘 리포트 + 숙제 항목 마스터 + 지난 진도
  let [{ data: reports }, { data: items, error: itemsErr }, { data: prevReports }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("id, student_id, attitude, word_correct, word_total, sent_correct, sent_total, own_progress, notice, report_written, late_until, late_reason, late_sent_at, phone_in, homework_in, word_when")
      .eq("date", date),
    supabase
      .from("homework_items")
      .select("id, name, category, sort, method, no_timer")
      .eq("active", true)
      .order("sort", { ascending: true }),
    supabase
      .from("daily_reports")
      .select("id, student_id, own_progress, date")
      .lt("date", date)
      .order("date", { ascending: false })
      .limit(300),
  ]);

  // 0037 전이면 등원 절차 컬럼 없이 다시
  if (!reports) {
    ({ data: reports } = await supabase
      .from("daily_reports")
      .select("id, student_id, attitude, word_correct, word_total, sent_correct, sent_total, own_progress, notice, report_written, late_until, late_reason, late_sent_at")
      .eq("date", date));
  }
  // 0027 전이면 하원 안내 컬럼 없이 다시
  if (!reports) {
    ({ data: reports } = await supabase
      .from("daily_reports")
      .select("id, student_id, attitude, word_correct, word_total, sent_correct, sent_total, own_progress, notice, report_written")
      .eq("date", date));
  }

  // no_timer · method 가 아직 없는 DB에서도 동작하도록 한 단계씩 물러난다
  if (itemsErr) {
    const r2 = await supabase
      .from("homework_items")
      .select("id, name, category, sort, method")
      .eq("active", true)
      .order("sort", { ascending: true });
    if (!r2.error) items = r2.data;
    else
      ({ data: items } = await supabase
        .from("homework_items")
        .select("id, name, category, sort")
        .eq("active", true)
        .order("sort", { ascending: true }));
  }

  const reportByStudent = new Map((reports || []).map((r) => [r.student_id, r]));
  // 늦은 귀가 안내 — 저장된 것(시간·직접 사유·보낸 시각). 사유 자체는 화면에서 계산한다
  const lateOf = (rep) => ({
    reportId: rep?.id || null,
    until: rep?.late_until || "",
    reason: rep?.late_reason || "",
    sentAt: rep?.late_sent_at || null,
  });
  const lastProgress = new Map();
  const lastTotals = new Map();   // 학생별 지난번 테스트 전체 개수
  const lastReportId = new Map(); // 학생 → 가장 최근 수업의 리포트 id
  (prevReports || []).forEach((r) => {
    if (!lastReportId.has(r.student_id)) lastReportId.set(r.student_id, r.id);
    if (r.own_progress && !lastProgress.has(r.student_id)) {
      lastProgress.set(r.student_id, r.own_progress);
    }
    // 테스트 전체 개수는 학생마다 거의 안 바뀐다 → 지난번 값을 미리 채워준다
    if (!lastTotals.has(r.student_id) && (r.word_total || r.sent_total)) {
      lastTotals.set(r.student_id, {
        word_total: r.word_total || null,
        sent_total: r.sent_total || null,
      });
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
    // 0009(단원 배열) → 0008(단원 1개) → 그 이전 순으로 물러난다
    let { data, error } = await build(
      `${DRI_BASE}, textbook_unit_id, textbook_unit_ids, range_note, student_done_at`
    );
    if (error)
      ({ data, error } = await build(`${DRI_BASE}, textbook_unit_id, textbook_unit_ids, range_note`));
    if (error) ({ data, error } = await build(`${DRI_BASE}, textbook_unit_id, range_note`));
    if (error) ({ data } = await build(DRI_BASE));
    return data || [];
  }

  // 리포트별 숙제 항목 상태
  const reportIds = (reports || []).map((r) => r.id);
  const itemsByReport = new Map();
  const nextByReport = new Map();
  const inClassByReport = new Map();   // 오늘 학원에서 할 것
  const doneRowsByReport = new Map();  // 학생이 '학습 완료' 를 누른 줄
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
    if (x.status === "inclass") {
      if (!inClassByReport.has(x.daily_report_id)) inClassByReport.set(x.daily_report_id, []);
      inClassByReport.get(x.daily_report_id).push(x.homework_item_id);
      if (!doneRowsByReport.has(x.daily_report_id)) doneRowsByReport.set(x.daily_report_id, []);
      doneRowsByReport.get(x.daily_report_id).push(x);
      return;
    }
    if (!itemsByReport.has(x.daily_report_id)) itemsByReport.set(x.daily_report_id, {});
    itemsByReport.get(x.daily_report_id)[x.homework_item_id] = x.status;
  });

  // 지난 수업에서 '배정한' 숙제 = 오늘 검사해야 할 항목
  //
  // 주의: "가장 최근 리포트" 하나만 보면 사슬이 끊긴다.
  //   예) 8/3 숙제 냄 → 8/5 결석(출결만 저장, 숙제 없음) → 8/10 검사 대상 0개
  // 그래서 학생별로 **배정이 있었던 가장 최근 리포트**를 찾고,
  // 그 뒤에 검사된 적이 없으면 계속 검사 대상으로 남긴다.
  const prevIds = [...new Set((prevReports || []).map((r) => r.id))];
  const prevAssigned = new Map();
  const prevUnitOf = new Map(); // `${studentId}|${itemId}` → { unitId, note }
  const prevReportStudent = new Map(
    (prevReports || []).map((r) => [r.id, r.student_id])
  );
  (await loadItems(prevIds, true)).forEach((x) => {
    idsOf(x).forEach((id) => unitIds.add(id));
    if (!prevAssigned.has(x.daily_report_id)) prevAssigned.set(x.daily_report_id, []);
    prevAssigned.get(x.daily_report_id).push(x.homework_item_id);
  });

  // 학생별: 배정이 있었던 가장 최근 리포트 (날짜 내림차순으로 첫 번째)
  const lastAssignedReport = new Map();
  const lastAssignedDate = new Map();
  (prevReports || []).forEach((r) => {
    if (lastAssignedReport.has(r.student_id)) return;      // 이미 더 최근 것을 잡았다
    if (!(prevAssigned.get(r.id) || []).length) return;    // 이 리포트엔 배정이 없다 → 건너뛴다
    lastAssignedReport.set(r.student_id, r.id);
    lastAssignedDate.set(r.student_id, r.date);
  });

  // 그 배정이 이후 수업에서 이미 검사됐는지 확인 (검사됐으면 다시 안 물어본다)
  const checkedAfter = new Map(); // studentId → Set(itemId)
  (await loadItems(prevIds)).forEach((x) => {
    if (x.status === "assigned") return;
    const sid = prevReportStudent.get(x.daily_report_id);
    if (!sid) return;
    const rep = (prevReports || []).find((r) => r.id === x.daily_report_id);
    const since = lastAssignedDate.get(sid);
    if (!rep || !since || rep.date <= since) return;       // 배정보다 뒤에 검사한 것만
    if (!checkedAfter.has(sid)) checkedAfter.set(sid, new Set());
    checkedAfter.get(sid).add(x.homework_item_id);
  });

  (prevReports || []).forEach((r) => {
    const rid = lastAssignedReport.get(r.student_id);
    if (rid !== r.id) return;
    (prevAssigned.get(r.id) || []).forEach((iid) => {
      prevUnitOf.set(`${r.student_id}|${iid}`, prevUnitOf.get(`${r.student_id}|${iid}`) || {});
    });
  });

  // 단원·범위 메모는 배정 줄에서 다시 읽는다
  (await loadItems(prevIds, true)).forEach((x) => {
    const sid = prevReportStudent.get(x.daily_report_id);
    if (!sid || lastAssignedReport.get(sid) !== x.daily_report_id) return;
    prevUnitOf.set(`${sid}|${x.homework_item_id}`, {
      unitIds: idsOf(x),
      note: x.range_note || "",
    });
  });

  const toCheckOf = (sid) => {
    const rid = lastAssignedReport.get(sid);
    if (!rid) return [];
    const done = checkedAfter.get(sid) || new Set();
    return (prevAssigned.get(rid) || []).filter((iid) => !done.has(iid));
  };
  const assignedFromOf = (sid) => lastAssignedDate.get(sid) || null;
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
  let { data: noticeRows, error: noticeErr } = await supabase
    .from("notices")
    .select("id, kind, scope, class_id, school, grade, title, photos, body, created_at")
    .eq("date", date)
    .order("created_at", { ascending: true });
  if (noticeErr && (noticeErr.code === "42703" || noticeErr.code === "PGRST204")) {
    // 0064 전이면 제목·사진 없이
    ({ data: noticeRows, error: noticeErr } = await supabase
      .from("notices")
      .select("id, kind, scope, class_id, school, grade, body, created_at")
      .eq("date", date)
      .order("created_at", { ascending: true }));
  }
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
  const noticeTally = new Map();      // noticeId → { total, done }
  (receipts || []).forEach((r) => {
    const n = noticeById.get(r.notice_id);
    if (!n) return;
    const t = noticeTally.get(r.notice_id) || { total: 0, done: 0 };
    t.total += 1;
    if (r.delivered_at) t.done += 1;
    noticeTally.set(r.notice_id, t);
    if (!noticesOfStudent.has(r.student_id)) noticesOfStudent.set(r.student_id, []);
    noticesOfStudent.get(r.student_id).push({
      id: n.id,
      kind: n.kind,
      title: n.title || "",
      photos: n.photos || [],
      body: n.body,
      delivered: !!r.delivered_at,
    });
  });

  // ---------- 학생별 교재 배정 · 단원 진도 ----------
  const studentIds = (students || []).map((s) => s.id);
  const { data: stBooks } = studentIds.length
    ? await supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, status, current_page, ended_on, round")
        .in("student_id", studentIds)
    : { data: [] };
  // 회독별로 쌓인다. `round` 가 아직 없는 DB 면 전부 1회독으로 본다.
  let stProgress = [];
  if (studentIds.length) {
    const q = await supabase
      .from("student_unit_progress")
      .select("student_id, textbook_unit_id, status, round")
      .in("student_id", studentIds);
    if (q.error) {
      const fb = await supabase
        .from("student_unit_progress")
        .select("student_id, textbook_unit_id, status")
        .in("student_id", studentIds);
      stProgress = (fb.data || []).map((r) => ({ ...r, round: 1 }));
    } else {
      stProgress = q.data || [];
    }
  }

  const booksOfStudent = new Map();
  const pageOf = new Map(); // `${studentId}|${textbookId}` → 지금 페이지
  (stBooks || []).forEach((r) => {
    // 완료·중단한 교재는 숙제 배정·진도 화면에서 빼고, 재원생 기록에만 남긴다
    if (r.status && r.status !== "active") return;
    if (!booksOfStudent.has(r.student_id)) booksOfStudent.set(r.student_id, new Set());
    booksOfStudent.get(r.student_id).add(r.textbook_id);
    if (r.current_page) pageOf.set(`${r.student_id}|${r.textbook_id}`, r.current_page);
  });
  // 지금 몇 회독째인가 (`round` 컬럼이 아직 없으면 1회독으로 본다)
  const roundOf = new Map();
  (stBooks || []).forEach((r) => {
    if (r.status && r.status !== "active") return;
    roundOf.set(`${r.student_id}|${r.textbook_id}`, r.round || 1);
  });

  // 단어시험 방식 — (학생, 교재, 회독) 하나에 설정 한 줄
  const wtOf = new Map();
  {
    const q = studentIds.length
      ? await supabase
          .from("word_test_settings")
          .select("student_id, textbook_id, round, mc_meaning, sa_meaning, mc_word, sa_word, first_hint")
          .in("student_id", studentIds)
      : { data: [] };
    (q.error ? [] : q.data || []).forEach((w) => {
      wtOf.set(`${w.student_id}|${w.textbook_id}|${w.round}`, w);
    });
  }

  // `${studentId}|${round}` → 그 회독에 끝낸 단원들
  const doneUnitsOf = new Map();
  (stProgress || []).forEach((r) => {
    if (r.status !== "done") return;
    const key = `${r.student_id}|${r.round || 1}`;
    if (!doneUnitsOf.has(key)) doneUnitsOf.set(key, new Set());
    doneUnitsOf.get(key).add(r.textbook_unit_id);
  });

  // 화면에 나올 교재들의 단원을 한 번에 가져와 전체 분량을 센다
  const shownBookIds = new Set();
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
  // 교재는 **학생별**이다 — 정규든 특강이든. 반별 교재라는 개념은 안 쓴다.
  function progressOf(studentId) {
    const ids = new Set(booksOfStudent.get(studentId) || []);
    return [...ids].map((tid) => {
      const round = roundOf.get(`${studentId}|${tid}`) || 1;
      // 진도율은 **지금 회독** 기준이다. 지난 회독은 기록으로만 남는다.
      const done = doneUnitsOf.get(`${studentId}|${round}`) || new Set();
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
        round,
        // 단어 교재만 시험 방식이 의미 있다
        wordTest: (bookAreaOf.get(tid) || "") === "단어"
          ? wtOf.get(`${studentId}|${tid}|${round}`) || null
          : undefined,
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

  // 학생·학부모가 남긴 안 읽은 댓글 (0023 전이면 그냥 없는 것으로 본다)
  const unreadByReport = new Map();
  {
    const cq = await supabase
      .from("report_comments")
      .select("daily_report_id")
      .is("read_at", null)
      .neq("author_role", "staff");
    (cq.data || []).forEach((c) => {
      unreadByReport.set(c.daily_report_id, (unreadByReport.get(c.daily_report_id) || 0) + 1);
    });
  }

  // 오늘 본 단원평가 (0031 전이면 없는 것으로 본다)
  const examOf = new Map();
  {
    const q = studentIds.length
      ? await supabase
          .from("unit_exams")
          .select("id, student_id, name, score, total")
          .eq("date", date)
          .in("student_id", studentIds)
      : { data: [] };
    (q.error ? [] : q.data || []).forEach((e) => {
      if (!examOf.has(e.student_id)) examOf.set(e.student_id, []);
      examOf.get(e.student_id).push(e);
    });
  }

  // 학생이 직접 누른 등원 체크 (폰·숙제)
  const arrivalOf = new Map();
  {
    const q = studentIds.length
      ? await supabase
          .from("arrival_checks")
          .select("student_id, phone_at, attend_at, homework_at")
          .eq("date", date)
          .in("student_id", studentIds)
      : { data: [] };
    (q.error ? [] : q.data || []).forEach((a) => arrivalOf.set(a.student_id, a));
  }

  // 오늘 학생들이 얼마나 공부했나 (항목별 합계)
  const secOf = new Map();     // `${studentId}|${itemId}` → 초
  {
    const q = studentIds.length
      ? await supabase
          .from("study_sessions")
          .select("student_id, homework_item_id, seconds")
          .eq("date", date)
          .in("student_id", studentIds)
      : { data: [] };
    (q.error ? [] : q.data || []).forEach((x) => {
      if (!x.homework_item_id) return;
      const k = `${x.student_id}|${x.homework_item_id}`;
      secOf.set(k, (secOf.get(k) || 0) + (x.seconds || 0));
    });
  }

  // ── 늦귀가 과제 ─────────────────────────────────────────
  const stayOf = new Map();
  {
    const q = await supabase
      .from("stay_tasks")
      .select("id, student_id, body, status, auto")
      .eq("date", date)
      .order("created_at", { ascending: true });
    (q.error ? [] : q.data || []).forEach((t) => {
      if (!stayOf.has(t.student_id)) stayOf.set(t.student_id, []);
      stayOf.get(t.student_id).push(t);
    });
  }

  // 보강 요일 — 보강 날짜를 잡을 때 미리 넣어준다 (설정에서 정한다, 기본 금요일)
  let makeupDays = ["금"];
  {
    const { data: schedRow } = await supabase
      .from("integrations")
      .select("config")
      .eq("id", "schedule")
      .maybeSingle();
    const d = schedRow?.config?.makeupDays;
    if (Array.isArray(d) && d.length) makeupDays = d;
  }

  // ── 경고 · 반성문 ────────────────────────────────────────
  // 저장하지 않고 지난 석 달 리포트에서 매번 센다
  const warnOf = new Map();
  let warnActions = [];
  let warnRule = DEFAULT_RULE;   // 하원 안내에서도 단어시험 통과선을 쓴다
  {
    const { data: ruleRow } = await supabase
      .from("integrations")
      .select("config")
      .eq("id", "warning")
      .maybeSingle();
    const rule = { ...DEFAULT_RULE, ...(ruleRow?.config || {}) };
    warnRule = rule;

    const wFrom = addDays(date, -100);
    const wq = await supabase
      .from("daily_reports")
      .select("id, student_id, date, attendance_kind, word_correct, word_total")
      .gte("date", wFrom)
      .lte("date", date)
      .order("date", { ascending: true });
    const wReports = wq.error ? [] : wq.data || [];

    const wIds = wReports.map((r) => r.id);
    const { data: wItems } = wIds.length
      ? await supabase
          .from("daily_report_items")
          .select("daily_report_id, status")
          .in("daily_report_id", wIds)
          .in("status", ["missing", "weak"])
      : { data: [] };
    const wItemsOf = new Map();
    (wItems || []).forEach((x) => {
      if (!wItemsOf.has(x.daily_report_id)) wItemsOf.set(x.daily_report_id, []);
      wItemsOf.get(x.daily_report_id).push({ status: x.status });
    });

    const aq = await supabase
      .from("warning_actions")
      .select("student_id, kind, on_date, target_date, note");
    const wActions = aq.error ? [] : aq.data || [];
    warnActions = wActions;

    [...new Set(wReports.map((r) => r.student_id))].forEach((sid) => {
      const mine = wReports
        .filter((r) => r.student_id === sid)
        .map((r) => ({ ...r, items: wItemsOf.get(r.id) || [] }));
      warnOf.set(sid, {
        ...tally(mine, wActions.filter((a) => a.student_id === sid), rule),
        rule,
      });
    });
  }

  // ── 경고 월간 정리 ──────────────────────────────────────
  // 달이 바뀌면 한 번 물어본다. 이미 정리했거나 "그냥 두기" 를 눌렀으면 안 뜬다.
  const ym = date.slice(0, 7);
  const { data: skipRow } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "warning_reset")
    .maybeSingle();
  const nameOfStudent = new Map((students || []).map((s) => [s.id, s.name]));
  const resetTargets =
    resetDoneIn(warnActions, ym) || skipRow?.config?.skip === ym
      ? []
      : [...warnOf.entries()]
          .filter(([, w]) => w.count > 0)
          .map(([id]) => ({ id, name: nameOfStudent.get(id) || "학생" }))
          .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const subsOf = new Map();
  (subRows || []).forEach((x) => {
    subsOf.set(x.student_id, [...(subsOf.get(x.student_id) || []), x]);
  });

  const studentById = new Map((students || []).map((s) => [s.id, s]));
  const attById = new Map((att || []).map((a) => [a.student_id, a]));
  // 특강 출결은 반별로 따로 (정규는 왔는데 특강만 빠지는 날이 있다)
  const clsAttById = new Map(
    (clsAtt || []).map((a) => [`${a.class_id}|${a.student_id}`, a])
  );
  const memberIds = new Set();

  const groups = classes.map((klass) => {
    // 특강은 그 반에 들어왔는지를 따로 찍는다 (결석·보강·수강료가 반마다 따로다)
    const extra = isExtra(klass);
    const ids = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => m.student_id);
    const rows = ids
      .map((id) => studentById.get(id))
      .filter(Boolean)
      .map((s) => {
        memberIds.add(s.id);
        const a = extra ? clsAttById.get(`${klass.id}|${s.id}`) : attById.get(s.id);
        const rep = reportByStudent.get(s.id) || null;
        return {
          student: s,
          status: a?.status || null,
          isMakeup: a?.status === "makeup",
          makeupOf: a?.makeup_of || null,   // 언제 결석한 보강인가
          makeupReason: a?.status === "makeup" ? a?.reason || "" : "",
          makeupTime: a?.makeup_time || null,
          plannedAbsent: !!(a?.planned && a.status === "absent"),
          absenceReason: a?.reason || "",
          report: rep,
          items: rep ? itemsByReport.get(rep.id) || {} : {},
          lastProgress: lastProgress.get(s.id) || null,
          lastTotals: lastTotals.get(s.id) || null,
          toCheck: toCheckOf(s.id),
          assignedFrom: assignedFromOf(s.id),
          nextHomework: rep ? nextByReport.get(rep.id) || [] : [],
          nextUnits: nextUnitsOf(rep),
          checkUnits: assignedUnitsOf(s.id),
          notices: noticesOfStudent.get(s.id) || [],
          books: progressOf(s.id),
          classId: klass.id,
          // 있으면 출결을 이 반에만 찍는다 (없으면 예전처럼 그날 출결)
          extraClassId: extra ? klass.id : null,
          className: klass.name,
          // 특강 줄의 '완료' 는 그 반에서만 판단한다.
          //   정규 리포트는 학생 하루에 한 장이라, 정규에서 기록을 끝내면
          //   특강 줄까지 완료로 보여버린다 — 특강은 아직 아무것도 안 했는데도.
          //   결석·보강이면 그 반에서 할 게 없으므로 완료로 본다.
          rowDone: extra ? a?.status === "absent" || a?.status === "makeup" : null,
          subs: subsOf.get(s.id) || [],
          reportWritten: !!rep?.report_written,
          unreadComments: rep ? unreadByReport.get(rep.id) || 0 : 0,
          stay: stayOf.get(s.id) || [],
          warn: warnOf.get(s.id) || null,
          late: lateOf(rep),
          phoneAt: arrivalOf.get(s.id)?.phone_at || null,
          attendAt: arrivalOf.get(s.id)?.attend_at || null,
          homeworkAt: arrivalOf.get(s.id)?.homework_at || null,
          wordWhen: rep?.word_when || s.word_when || "start",
          exams: examOf.get(s.id) || [],
          inClass: rep ? inClassByReport.get(rep.id) || [] : [],
          doneRows: rep ? doneRowsByReport.get(rep.id) || [] : [],
          secOf: Object.fromEntries(
            [...secOf.entries()]
              .filter(([k]) => k.startsWith(`${s.id}|`))
              .map(([k, v]) => [k.split("|")[1], v])
          ),
        };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name, "ko"));
    return { klass, rows };
  });

  // 오늘 반에 속하지 않지만 보강으로 오는 학생
  const extras = (att || [])
    .filter((a) => a.status === "makeup" && !memberIds.has(a.student_id))
    // 출결 행(a)을 학생과 함께 들고 간다 — 보강 사유·원 결석일이 여기 있다
    .map((a) => ({ att: a, student: studentById.get(a.student_id) }))
    .filter((x) => x.student)
    .map(({ att: a, student: s }) => {
      const rep = reportByStudent.get(s.id) || null;
      return {
        student: s,
        status: "makeup",
        isMakeup: true,
        makeupOf: a.makeup_of || null,
        makeupReason: a.reason || "",
        makeupTime: a.makeup_time || null,
        report: rep,
        items: rep ? itemsByReport.get(rep.id) || {} : {},
        lastProgress: lastProgress.get(s.id) || null,
        lastTotals: lastTotals.get(s.id) || null,
        toCheck: toCheckOf(s.id),
        assignedFrom: assignedFromOf(s.id),
        nextHomework: rep ? nextByReport.get(rep.id) || [] : [],
        nextUnits: nextUnitsOf(rep),
        checkUnits: assignedUnitsOf(s.id),
        notices: noticesOfStudent.get(s.id) || [],
        books: progressOf(s.id),
        reportWritten: !!rep?.report_written,
        unreadComments: rep ? unreadByReport.get(rep.id) || 0 : 0,
        stay: stayOf.get(s.id) || [],
        warn: warnOf.get(s.id) || null,
        late: lateOf(rep),
        phoneAt: arrivalOf.get(s.id)?.phone_at || null,
        attendAt: arrivalOf.get(s.id)?.attend_at || null,
        homeworkAt: arrivalOf.get(s.id)?.homework_at || null,
        wordWhen: rep?.word_when || s.word_when || "start",
        exams: examOf.get(s.id) || [],
        inClass: rep ? inClassByReport.get(rep.id) || [] : [],
        doneRows: rep ? doneRowsByReport.get(rep.id) || [] : [],
        secOf: Object.fromEntries(
          [...secOf.entries()]
            .filter(([k]) => k.startsWith(`${s.id}|`))
            .map(([k, v]) => [k.split("|")[1], v])
        ),
      };
    });
  if (extras.length > 0) {
    groups.push({
      klass: { id: "makeup", name: "보강", start_time: null, end_time: null },
      rows: extras,
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
    const t = noticeTally.get(n.id) || { total: 0, done: 0 };
    const targetLabel =
      n.scope === "class"
        ? classNameOf(n.class_id)
        : n.scope === "grade"
        ? [n.school, n.grade].filter(Boolean).join(" ") || "학년"
        : n.scope === "student"
        ? `개인 ${t.total}명`
        : "전체";
    return {
      id: n.id, kind: n.kind, body: n.body,
      title: n.title || "", photos: n.photos || [],
      targetLabel, total: t.total, done: t.done,
    };
  });

  // 수업 직전에 알아야 하는 것 — 지금까지는 대시보드에만 있어서 화면을 왔다갔다 해야 했다
  const rosterIds = [...new Set(rosterStudents.map((s) => s.id))];
  const preClass = { comments: [], requests: [] };
  if (rosterIds.length > 0) {
    const cq = await supabase
      .from("report_comments")
      .select("id, body, author_role, student_id, created_at")
      .is("read_at", null)
      .neq("author_role", "staff")
      .in("student_id", rosterIds)
      .order("created_at", { ascending: false })
      .limit(10);
    const nameById = new Map(rosterStudents.map((s) => [s.id, s.name]));
    preClass.comments = (cq.error ? [] : cq.data || []).map((c) => ({
      ...c,
      name: nameById.get(c.student_id) || "학생",
    }));

    const RQ = "id, student_id, kind, from_date, to_date, body";
    let rq = await supabase
      .from("requests")
      .select(`${RQ}, photos`)
      .eq("status", "new")
      .in("student_id", rosterIds)
      .order("created_at", { ascending: false })
      .limit(10);
    if (rq.error) {
      // 0068 전이면 사진 없이 — 알림 자체가 안 보이면 안 된다
      rq = await supabase
        .from("requests")
        .select(RQ)
        .eq("status", "new")
        .in("student_id", rosterIds)
        .order("created_at", { ascending: false })
        .limit(10);
    }
    preClass.requests = (rq.error ? [] : rq.data || []).map((r) => ({
      ...r,
      name: nameById.get(r.student_id) || "학생",
    }));
  }

  const label = longLabel(date);

  return (
    <>
      <TopBar profile={profile} active="today" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">오늘 수업</p>
          <h1 className="h1">{label}</h1>
        </div>
        <MonthlyReset ym={ym} targets={resetTargets} />
        <TopNotices
          date={date}
          classes={groups.map((g) => ({ id: g.klass.id, name: g.klass.name }))}
          students={rosterStudents}
          notices={noticeCards}
          tasks={taskCards}
          unavailable={!noticesAvailable}
          preClass={preClass}
        />
        <TodayBoard
          date={date}
          groups={groups}
          items={items || []}
          textbooks={textbooks}
          unitNames={unitNames}
          rule={{ ...warnRule, makeupDays }}
        />
      </main>
    </>
  );
}
