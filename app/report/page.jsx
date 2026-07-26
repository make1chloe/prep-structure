import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import ReportSender from "./ReportSender";
import { buildReportText } from "@/lib/reportText";

export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }) {
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
  const date = searchParams?.d || seoul.toISOString().slice(0, 10);

  // 리포트 본체 — sent_at / report_text 가 아직 없는 DB에서도 뜨도록
  const BASE =
    "id, student_id, attendance_kind, attitude, word_correct, word_total, sent_correct, sent_total, own_progress, notice, report_written";
  let { data: reports, error: repErr } = await supabase
    .from("daily_reports")
    .select(`${BASE}, sent_at, report_text`)
    .eq("date", date);
  let sendReady = !repErr;
  if (repErr) {
    ({ data: reports } = await supabase.from("daily_reports").select(BASE).eq("date", date));
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
      .select(`${DRI}, textbook_unit_id, textbook_unit_ids, range_note`)
      .in("daily_report_id", reportIds);
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

  // 학생별로 조립
  const rows = reports
    .map((rep) => {
      const student = studentById.get(rep.student_id);
      if (!student) return null;
      const mine = dri.filter((x) => x.daily_report_id === rep.id);
      const checks = mine
        .filter((x) => x.status !== "assigned")
        .map((x) => ({ name: itemName.get(x.homework_item_id) || "", status: x.status }))
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
        text: rep.report_text || buildReportText(data, date),
        auto: buildReportText(data, date),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <>
      <TopBar profile={profile} active="report" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">데일리리포트</p>
          <h1 className="h1">학부모 발송</h1>
          <p className="sub">
            오늘 수업에서 입력한 내용으로 문구가 자동으로 만들어집니다. 확인하고 고친 뒤 보내세요.
          </p>
        </div>
        <ReportSender date={date} rows={rows} sendReady={sendReady} />
      </main>
    </>
  );
}
