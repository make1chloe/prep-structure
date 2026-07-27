import { buildReportText, buildHomeworkText } from "@/lib/reportText";

// 하루치 데일리리포트 데이터를 조립한다.
// 발송(/report)과 재발송(/resend) 두 화면이 같은 값을 쓴다. (원칙1)
export async function loadReportRows(supabase, date, academy = "클로이영어", msg = {}) {
  const BASE =
    "id, student_id, attendance_kind, attitude, word_correct, word_total, sent_correct, sent_total, own_progress, notice, report_written";
  let { data: reports, error: repErr } = await supabase
    .from("daily_reports")
    .select(`${BASE}, sent_at, report_text, homework_text, homework_sent_at`)
    .eq("date", date);
  let sendReady = !repErr;
  let resendReady = !repErr;
  if (repErr) {
    // 0013 전이면 발송 컬럼까지만
    const r2 = await supabase
      .from("daily_reports")
      .select(`${BASE}, sent_at, report_text`)
      .eq("date", date);
    if (!r2.error) {
      reports = r2.data;
      repErr = null;
      sendReady = true;
    }
  }
  if (repErr) {
    ({ data: reports } = await supabase.from("daily_reports").select(BASE).eq("date", date));
    sendReady = false;
    resendReady = false;
  }
  reports = reports || [];

  const studentIds = [...new Set(reports.map((r) => r.student_id))];
  const { data: students } = studentIds.length
    ? await supabase
        .from("students")
        .select("id, name, school, grade, parent_phone")
        .in("id", studentIds)
    : { data: [] };
  const studentById = new Map((students || []).map((s) => [s.id, s]));

  // 숙제 항목 · 검사 결과 · 다음 숙제
  const { data: items } = await supabase
    .from("homework_items")
    .select("id, name, category, sort")
    .order("sort", { ascending: true });
  const itemName = new Map((items || []).map((i) => [i.id, i.name]));

  const reportIds = reports.map((r) => r.id);
  const DRI = "daily_report_id, homework_item_id, status";
  let dri = [];
  if (reportIds.length > 0) {
    let { data, error } = await supabase
      .from("daily_report_items")
      .select(`${DRI}, textbook_unit_id, textbook_unit_ids, range_note, note`)
      .in("daily_report_id", reportIds);
    if (error) {
      ({ data, error } = await supabase
        .from("daily_report_items")
        .select(`${DRI}, textbook_unit_id, textbook_unit_ids, range_note`)
        .in("daily_report_id", reportIds));
    }
    if (error) {
      ({ data } = await supabase.from("daily_report_items").select(DRI).in("daily_report_id", reportIds));
    }
    dri = data || [];
  }

  const unitIds = new Set();
  const idsOf = (x) =>
    x.textbook_unit_ids && x.textbook_unit_ids.length
      ? x.textbook_unit_ids
      : x.textbook_unit_id
      ? [x.textbook_unit_id]
      : [];
  dri.forEach((x) => idsOf(x).forEach((id) => unitIds.add(id)));

  // 단원 이름 (대 › 중 › 소 + 페이지)
  const unitLabel = new Map();
  if (unitIds.size > 0) {
    const { data: picked } = await supabase
      .from("textbook_units")
      .select("id, textbook_id")
      .in("id", [...unitIds]);
    const bookIds = [...new Set((picked || []).map((u) => u.textbook_id))];
    const { data: all } = bookIds.length
      ? await supabase
          .from("textbook_units")
          .select("id, name, parent_id, textbook_id, page_start, page_end")
          .in("textbook_id", bookIds)
      : { data: [] };
    const byId = new Map((all || []).map((u) => [u.id, u]));
    const { data: bookRows } = bookIds.length
      ? await supabase.from("textbooks").select("id, name").in("id", bookIds)
      : { data: [] };
    const bookName = new Map((bookRows || []).map((b) => [b.id, b.name]));
    (all || [])
      .filter((u) => unitIds.has(u.id))
      .forEach((u) => {
        const chain = [];
        let cur = u;
        const seen = new Set();
        while (cur && !seen.has(cur.id)) {
          seen.add(cur.id);
          chain.unshift(cur.name);
          cur = cur.parent_id ? byId.get(cur.parent_id) : null;
        }
        const pages = u.page_start && u.page_end ? ` ${u.page_start}~${u.page_end}p` : "";
        unitLabel.set(u.id, `${bookName.get(u.textbook_id) || ""} ${chain.join(" ")}${pages}`.trim());
      });
  }

  // 오늘 완료한 단원 = 진도 문구
  const { data: progRows } = studentIds.length
    ? await supabase
        .from("student_unit_progress")
        .select("student_id, textbook_unit_id, done_on")
        .in("student_id", studentIds)
        .eq("done_on", date)
    : { data: [] };
  const progressOf = new Map();
  const progUnitIds = [...new Set((progRows || []).map((p) => p.textbook_unit_id))];
  if (progUnitIds.length > 0) {
    const { data: pu } = await supabase
      .from("textbook_units")
      .select("id, name, textbook_id, page_start, page_end")
      .in("id", progUnitIds);
    const bookIds = [...new Set((pu || []).map((u) => u.textbook_id))];
    const { data: bookRows } = bookIds.length
      ? await supabase.from("textbooks").select("id, name").in("id", bookIds)
      : { data: [] };
    const bookName = new Map((bookRows || []).map((b) => [b.id, b.name]));
    const byId = new Map((pu || []).map((u) => [u.id, u]));
    (progRows || []).forEach((p) => {
      const u = byId.get(p.textbook_unit_id);
      if (!u) return;
      const pages = u.page_start && u.page_end ? ` (${u.page_start}~${u.page_end}p)` : "";
      if (!progressOf.has(p.student_id)) progressOf.set(p.student_id, []);
      progressOf.get(p.student_id).push(`${bookName.get(u.textbook_id) || ""} ${u.name}${pages}`.trim());
    });
  }

  // 일괄 공지 (kind = notice)
  const { data: noticeRows } = await supabase
    .from("notices")
    .select("id, kind, body")
    .eq("date", date)
    .eq("kind", "notice");
  const noticeIds = (noticeRows || []).map((n) => n.id);
  const { data: receipts } = noticeIds.length
    ? await supabase
        .from("notice_receipts")
        .select("notice_id, student_id")
        .in("notice_id", noticeIds)
    : { data: [] };
  const noticeBody = new Map((noticeRows || []).map((n) => [n.id, n.body]));
  const noticesOf = new Map();
  (receipts || []).forEach((r) => {
    const b = noticeBody.get(r.notice_id);
    if (!b) return;
    if (!noticesOf.has(r.student_id)) noticesOf.set(r.student_id, []);
    noticesOf.get(r.student_id).push(b);
  });

  // 발송 이력 (몇 번 보냈는지)
  const sendCount = new Map();
  if (reportIds.length > 0 && resendReady) {
    const { data: sends } = await supabase
      .from("report_sends")
      .select("daily_report_id, kind")
      .in("daily_report_id", reportIds);
    (sends || []).forEach((s) => {
      const c = sendCount.get(s.daily_report_id) || { report: 0, homework: 0 };
      c[s.kind === "homework" ? "homework" : "report"] += 1;
      sendCount.set(s.daily_report_id, c);
    });
  }

  // 학생별로 조립
  const rows = reports
    .map((rep) => {
      const student = studentById.get(rep.student_id);
      if (!student) return null;
      const mine = dri.filter((x) => x.daily_report_id === rep.id);
      const checks = mine
        .filter((x) => x.status !== "assigned")
        .map((x) => ({
          name: itemName.get(x.homework_item_id) || "",
          status: x.status,
          note: x.note || "",     // 채점 피드백
        }))
        .filter((x) => x.name);
      const next = mine
        .filter((x) => x.status === "assigned")
        .map((x) => ({
          name: itemName.get(x.homework_item_id) || "",
          units: idsOf(x).map((id) => unitLabel.get(id)).filter(Boolean),
          note: x.range_note || "",
        }))
        .filter((x) => x.name);

      const data = {
        student,
        report: rep,
        checks,
        next,
        progress: progressOf.get(rep.student_id) || [],
        notices: noticesOf.get(rep.student_id) || [],
      };
      return {
        id: rep.id,
        studentId: rep.student_id,
        name: student.name,
        who: [student.school, student.grade].filter(Boolean).join(" "),
        phone: student.parent_phone || "",
        written: !!rep.report_written,
        sentAt: rep.sent_at || null,
        edited: !!rep.report_text,
        text: rep.report_text || buildReportText(data, date, academy, msg),
        auto: buildReportText(data, date, academy, msg),
        hwEdited: !!rep.homework_text,
        hwSentAt: rep.homework_sent_at || null,
        hwText: rep.homework_text || buildHomeworkText(data, date, academy, msg),
        hwAuto: buildHomeworkText(data, date, academy, msg),
        sendCount: sendCount.get(rep.id) || { report: 0, homework: 0 },
        nextCount: next.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));


  return { rows, sendReady, resendReady };
}
