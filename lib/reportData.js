import { buildReportText, buildHomeworkText, reportParts } from "@/lib/reportText";
import { buildLateText, lateReasons } from "@/lib/lateNotice";
import { tally, DEFAULT_RULE } from "@/lib/warnings";
import { loadMessageParts } from "@/lib/settings";
import { LEGACY, inHomework } from "@/lib/notices";
import { fetchAll } from "./fetchAll";

// 하루치 데일리리포트 데이터를 조립한다.
// 발송(/report)과 재발송(/resend) 두 화면이 같은 값을 쓴다. (원칙1)
//
// **4파도** (성능수리 v3 커밋 2 — 순수 직렬 12단+ 를 의존 간선만 남기고 접었다, §1-3):
//   파도 1  무의존 4벌 — 문구·오늘 리포트(첫 시도)·숙제 항목·공지
//   파도 2  reports/studentIds 의존 — 학생·항목상세·진도·발송이력·경고규칙·석달치·늦귀가
//           (sends 는 reportIds 와 **resendReady(사다리 결과)** 둘 다에 걸린다 — §3-1)
//   파도 3  dri/past/notices 의존 — 쓰인 단원·진도 단원·석달치 항목·경고조치·공지수신
//   파도 4  bookIds 의존 — 전 단원 fetchAll + 교재명 (전엔 2회 조회 — 합집합 1회로)
// 폴백 사다리(reports 4단·dri 1단)는 파도 뒤 「실패 시에만」 자리 그대로.
// 각 조회의 결과를 쓰는 셈·판정은 그대로다 — await 자리와 묶음만 옮겼다.
export async function loadReportRows(supabase, date, academy = "클로이영어", msg = {}) {
  const BASE =
    "id, student_id, attendance_kind, attitude, word_correct, word_total, sent_correct, sent_total, own_progress, notice, report_written";

  // ── 파도 1 ──────────────────────────────────────────────
  const [parts, rep0, itemQ, noticeQ] = await Promise.all([
    // 문자 종류마다 인삿말·맺음말이 다르다 (설정 → 문자 문구)
    loadMessageParts(supabase, msg),
    // 이해도(0118)는 있으면 같이 읽고, 없으면 빼고 다시 (아래 물러나기와 같은 결)
    supabase
      .from("daily_reports")
      .select(`${BASE}, understanding, notice_student, sent_unit, sent_passed, sent_at, report_text, homework_text, homework_sent_at, late_until, late_reason, late_text, late_sent_at, skip_kinds`)
      // 휴지통 판 제외 (0168 — 사다리 아래 칸들은 옛 DB 라 필터 없음이 곧 폴백)
      .eq("date", date).is("archived_at", null),
    // 숙제 항목 · 검사 결과 · 다음 숙제
    supabase
      .from("homework_items")
      .select("id, name, category, sort")
      .order("sort", { ascending: true }),
    /**
     * 일괄 공지 — **실려 나가는 것만** 여기서 챙긴다 (lib/notices.js).
     *
     *   숙제 공지   (homework) → 숙제 안내에
     *   리포트 공지 (notice)   → 데일리리포트에
     *   옛 전달사항 (deliver)  → 숙제 안내에 (예전 그대로)
     *
     * 「학생 알림」 · 「학부모 알림」 은 적는 순간 이미 나갔다. 여기에
     * 또 실으면 같은 말을 두 번 받으신다.
     * 「수업 메모」 는 어디에도 안 나간다 — 교실에서 말로 하는 것이다.
     */
    supabase
      .from("notices")
      .select("id, kind, body")
      .eq("date", date)
      .in("kind", ["notice", "homework", LEGACY]),
  ]);
  const msgReport = parts.report;
  const msgHw = parts.homework;
  const msgLate = parts.late;

  let { data: reports, error: repErr } = rep0;
  if (repErr) {
    const r0 = await supabase
      .from("daily_reports")
      .select(`${BASE}, sent_at, report_text, homework_text, homework_sent_at, late_until, late_reason, late_text, late_sent_at, skip_kinds`)
      .eq("date", date);
    if (!r0.error) { reports = r0.data; repErr = null; }
  }
  let sendReady = !repErr;
  let resendReady = !repErr;
  let lateReady = !repErr;
  if (repErr) {
    // 0027 전이면 하원 안내 컬럼 없이
    const r1 = await supabase
      .from("daily_reports")
      .select(`${BASE}, sent_at, report_text, homework_text, homework_sent_at`)
      .eq("date", date);
    if (!r1.error) {
      reports = r1.data;
      repErr = null;
      sendReady = true;
      resendReady = true;
    }
  }
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
  const reportIds = reports.map((r) => r.id);
  const itemName = new Map((itemQ.data || []).map((i) => [i.id, i.name]));
  const noticeRows = noticeQ.data;
  const noticeIds = (noticeRows || []).map((n) => n.id);

  // 경고 창 — 지난 석 달치면 충분하다 (그 전은 이미 정산됐다고 본다)
  const from = new Date(`${date}T00:00:00Z`);
  from.setUTCMonth(from.getUTCMonth() - 3);
  const fromISO = from.toISOString().slice(0, 10);

  const DRI = "daily_report_id, homework_item_id, status";
  const none = { data: [] };

  // ── 파도 2 ──────────────────────────────────────────────
  const [studentQ, driQ0, progQ, sendQ, ruleQ, pastQ, stayQ, readQ] = await Promise.all([
    studentIds.length
      ? supabase
          .from("students")
          .select("id, name, school, grade, parent_phone")
          .in("id", studentIds)
      : none,
    // 반 전체 하루치 — 학생이 늘면 1000줄을 넘는다 (전수검사 B6)
    reportIds.length > 0
      ? fetchAll(() =>
          supabase
            .from("daily_report_items")
            .select(`${DRI}, textbook_unit_id, textbook_unit_ids, range_note, check_note`)
            .in("daily_report_id", reportIds)
            .order("daily_report_id"))
      : none,
    // 오늘 완료한 단원 = 진도 문구
    studentIds.length
      ? supabase
          .from("student_unit_progress")
          .select("student_id, textbook_unit_id, done_on")
          .in("student_id", studentIds)
          .eq("done_on", date)
      : none,
    // 발송 이력 (몇 번 보냈는지)
    reportIds.length > 0 && resendReady
      ? supabase
          .from("report_sends")
          .select("daily_report_id, kind")
          .in("daily_report_id", reportIds)
      : none,
    // 경고 규칙 — 하원 안내에서도 단어시험 통과선을 쓴다
    studentIds.length > 0
      ? supabase
          .from("integrations")
          .select("config")
          .eq("id", "warning")
          .maybeSingle()
      : { data: null },
    // fetchAll — 석 달치 전 학생분이라 1000줄을 넘으면 경고가 덜 세어진다
    studentIds.length > 0
      ? fetchAll(() => supabase
          .from("daily_reports")
          .select("id, student_id, date, attendance_kind, word_correct, word_total")
          .is("archived_at", null)
          .in("student_id", studentIds)
          .gte("date", fromISO)
          .lte("date", date)
          .order("date", { ascending: true }).order("id"))
      : none,
    // 늦귀가 과제
    studentIds.length
      ? supabase
          .from("stay_tasks")
          .select("student_id, body, status")
          .eq("date", date)
          .in("student_id", studentIds)
      : none,
    // **학부모가 열어봤나** (0180). 파도에 같이 태운다 — 줄 하나 더 기다리려고
    // 발송 화면 전체를 늦출 이유가 없다 (원칙 6-1).
    reportIds.length > 0
      ? supabase
          .from("report_reads")
          .select("daily_report_id, read_at")
          .in("daily_report_id", reportIds)
      : none,
  ]);
  const studentById = new Map((studentQ.data || []).map((s) => [s.id, s]));

  /**
   * **0180 을 안 돌린 DB 와 「아무도 안 봤다」 를 구별한다** (A25).
   * 표가 없으면 조회가 통째로 실패한다 — 그때 전부 「아직」 으로 그리면
   * 화면이 거짓말을 한다. readReady=false 를 그대로 화면까지 들고 간다.
   */
  const readReady = reportIds.length === 0 ? true : !readQ?.error;
  const readAtOf = new Map();
  if (readReady) {
    (readQ?.data || []).forEach((r) => {
      const was = readAtOf.get(r.daily_report_id);
      // 어머니·아버지가 따로 보셨으면 **처음 본 때**가 열람 시각이다
      if (!was || r.read_at < was) readAtOf.set(r.daily_report_id, r.read_at);
    });
  }

  let dri = [];
  if (reportIds.length > 0) {
    let { data, error } = driQ0;
    if (error) {
      ({ data } = await fetchAll(() =>
        supabase.from("daily_report_items").select(DRI).in("daily_report_id", reportIds).order("daily_report_id")));
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

  const progRows = progQ.data;
  const progUnitIds = [...new Set((progRows || []).map((p) => p.textbook_unit_id))];
  const past = studentIds.length > 0 ? (pastQ.error ? [] : pastQ.data || []) : [];
  const pastIds = past.map((r) => r.id);

  // ── 파도 3 ──────────────────────────────────────────────
  const [pickedQ, puQ, pastItemQ, actQ, receiptQ] = await Promise.all([
    unitIds.size > 0
      ? supabase
          .from("textbook_units")
          .select("id, textbook_id")
          .in("id", [...unitIds])
      : none,
    progUnitIds.length > 0
      ? supabase
          .from("textbook_units")
          .select("id, name, textbook_id, page_start, page_end")
          .in("id", progUnitIds)
      : none,
    pastIds.length
      ? fetchAll(() =>
          supabase
            .from("daily_report_items")
            .select("daily_report_id, status")
            .in("daily_report_id", pastIds)
            .in("status", ["missing", "weak"])
            .order("daily_report_id"))
      : none,
    studentIds.length > 0
      ? supabase
          .from("warning_actions")
          .select("student_id, kind, on_date, target_date")
          .in("student_id", studentIds)
      : none,
    noticeIds.length
      ? supabase
          .from("notice_receipts")
          .select("notice_id, student_id")
          .in("notice_id", noticeIds)
      : none,
  ]);
  const picked = pickedQ.data;
  const pu = puQ.data;

  // ── 파도 4 — bookIds 의존 ───────────────────────────────
  // 교재명은 전엔 단원 이름용·진도용으로 **같은 표를 2회** 읽었다 —
  // 합집합 id 로 1회만 읽는다 (id → name 값은 같으니 셈 무변경)
  const labelBookIds = [...new Set((picked || []).map((u) => u.textbook_id))];
  const allBookIds = [...new Set([...labelBookIds, ...(pu || []).map((u) => u.textbook_id)])];
  const [allUnitsQ, bookQ] = await Promise.all([
    // 교재가 여럿이면 단원 합이 1000줄을 넘는다 — 끝까지 (전수검사 B3)
    labelBookIds.length
      ? fetchAll(() =>
          supabase
            .from("textbook_units")
            .select("id, name, parent_id, textbook_id, page_start, page_end")
            .in("textbook_id", labelBookIds)
            .order("id"))
      : none,
    allBookIds.length
      ? supabase.from("textbooks").select("id, name").in("id", allBookIds)
      : none,
  ]);
  const bookName = new Map((bookQ.data || []).map((b) => [b.id, b.name]));

  // 단원 이름 (대 › 중 › 소 + 페이지)
  const unitLabel = new Map();
  if (unitIds.size > 0) {
    const all = allUnitsQ.data;
    const byId = new Map((all || []).map((u) => [u.id, u]));
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

  const progressOf = new Map();
  if (progUnitIds.length > 0) {
    const byId = new Map((pu || []).map((u) => [u.id, u]));
    (progRows || []).forEach((p) => {
      const u = byId.get(p.textbook_unit_id);
      if (!u) return;
      const pages = u.page_start && u.page_end ? ` (${u.page_start}~${u.page_end}p)` : "";
      if (!progressOf.has(p.student_id)) progressOf.set(p.student_id, []);
      progressOf.get(p.student_id).push(`${bookName.get(u.textbook_id) || ""} ${u.name}${pages}`.trim());
    });
  }

  const noticeOf = new Map((noticeRows || []).map((n) => [n.id, n]));
  const noticesOf = new Map();        // 학부모용
  const studentNoticesOf = new Map(); // 학생용
  (receiptQ.data || []).forEach((r) => {
    const n = noticeOf.get(r.notice_id);
    if (!n?.body) return;
    const bucket = inHomework(n.kind) ? studentNoticesOf : noticesOf;
    if (!bucket.has(r.student_id)) bucket.set(r.student_id, []);
    bucket.get(r.student_id).push(n.body);
  });

  const sendCount = new Map();
  if (reportIds.length > 0 && resendReady) {
    (sendQ.data || []).forEach((s) => {
      const c = sendCount.get(s.daily_report_id) || { report: 0, homework: 0, late: 0 };
      const k = ["homework", "late"].includes(s.kind) ? s.kind : "report";
      c[k] += 1;
      sendCount.set(s.daily_report_id, c);
    });
  }

  // ── 경고 · 반성문 ────────────────────────────────────────
  // 경고는 저장하지 않고 지난 리포트에서 매번 센다 (리포트를 고치면 경고도 같이 맞게)
  const warnOf = new Map();
  let rule = DEFAULT_RULE;   // 하원 안내에서도 단어시험 통과선을 쓴다
  if (studentIds.length > 0) {
    rule = { ...DEFAULT_RULE, ...(ruleQ.data?.config || {}) };

    const itemsOf = new Map();
    (pastItemQ.data || []).forEach((x) => {
      if (!itemsOf.has(x.daily_report_id)) itemsOf.set(x.daily_report_id, []);
      itemsOf.get(x.daily_report_id).push({ status: x.status });
    });

    const actions = actQ.error ? [] : actQ.data || [];

    studentIds.forEach((sid) => {
      const mine = past
        .filter((r) => r.student_id === sid)
        .map((r) => ({ ...r, items: itemsOf.get(r.id) || [] }));
      warnOf.set(
        sid,
        { ...tally(mine, actions.filter((a) => a.student_id === sid), rule), rule }
      );
    });
  }

  // ── 늦귀가 과제 ─────────────────────────────────────────
  const stayOf = new Map();
  (stayQ.error ? [] : stayQ.data || []).forEach((t) => {
    if (!stayOf.has(t.student_id)) stayOf.set(t.student_id, []);
    stayOf.get(t.student_id).push(t);
  });

  // 학생별로 조립
  const rows = reports
    .map((rep) => {
      const student = studentById.get(rep.student_id);
      if (!student) return null;
      const mine = dri.filter((x) => x.daily_report_id === rep.id);
      // 검사 결과만 — inclass·plan_next 가 섞여 검사 0건인 날도 「다
      // 해왔습니다」가 나가던 것 (0잔여-A #26)
      const checks = mine
        .filter((x) => ["done", "weak", "missing"].includes(x.status))
        .map((x) => ({
          name: itemName.get(x.homework_item_id) || "",
          status: x.status,
          note: x.check_note || "",     // 검사하면서 남긴 한 줄 (0062 전이면 없음)
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
        notices: noticesOf.get(rep.student_id) || [],              // 학부모용 → 리포트
        studentNotices: studentNoticesOf.get(rep.student_id) || [], // 학생용 → 숙제 문자
        warn: warnOf.get(rep.student_id) || null,
        stay: stayOf.get(rep.student_id) || [],
      };
      return {
        id: rep.id,
        studentId: rep.student_id,
        name: student.name,
        who: [student.school, student.grade].filter(Boolean).join(" "),
        phone: student.parent_phone || "",
        written: !!rep.report_written,
        sentAt: rep.sent_at || null,
        // **학부모가 열어본 시각** (0180). null 이면 아직 · readReady 가
        // false 면 「모른다」 (화면은 lib/reportMark 가 갈라준다)
        readAt: readAtOf.get(rep.id) || null,
        skip: rep.skip_kinds || [],   // 안 보내기로 한 것 (0058 전이면 빈 목록)
        edited: !!rep.report_text,
        text: rep.report_text || buildReportText(data, date, academy, msgReport),
        auto: buildReportText(data, date, academy, msgReport),
        hwEdited: !!rep.homework_text,
        hwSentAt: rep.homework_sent_at || null,
        hwText: rep.homework_text || buildHomeworkText(data, date, academy, msgHw),
        hwAuto: buildHomeworkText(data, date, academy, msgHw),
        sendCount: sendCount.get(rep.id) || { report: 0, homework: 0, late: 0 },
        nextCount: next.length,
        // 늦은 귀가 안내 — 사유는 오늘 입력한 것에서 자동으로 잡는다
        lateReasons: lateReasons(data, rule),
        lateUntil: rep.late_until || "",
        lateReason: rep.late_reason || "",
        lateEdited: !!rep.late_text,
        lateSentAt: rep.late_sent_at || null,
        lateText: rep.late_text || buildLateText(data, date, academy, msgLate, rule),
        lateAuto: buildLateText(data, date, academy, msgLate, rule),
        // 알림톡 템플릿이 #{출결} #{단어} 처럼 나뉘어 있을 때 붙일 조각들.
        // 통짜 본문과 같은 값에서 나온다 (lib/reportText 의 reportParts).
        parts: reportParts(data, date, rule),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));


  return { rows, sendReady, resendReady, lateReady, readReady };
}
