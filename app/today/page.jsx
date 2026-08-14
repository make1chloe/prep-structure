import { createClient } from "@/lib/supabase/server";
import { isNoCheck } from "@/app/homework/categories";
import TopBar from "@/components/TopBar";
import TodayBoard from "./TodayBoard";
import TopNotices from "./TopNotices";
import MonthlyReset from "./MonthlyReset";
import { dowOf, longLabel, todaySeoul, addDays } from "@/lib/day";
import { tally, resetDoneIn, DEFAULT_RULE } from "@/lib/warnings";
import { loadRunningClasses, isExtra } from "@/lib/classTerm";
import { purgeOncePerDay } from "./purgeActions";
import { inUseOn } from "@/lib/bookUse";
import ActivityBoard from "./ActivityBoard";
import { cachedProfile } from "@/lib/profileCache";
import DateNav from "./DateNav";

export const dynamic = "force-dynamic";


export default async function TodayPage({ searchParams }) {
  const supabase = createClient();
  // 로그인 확인은 쿠키로 (미들웨어와 같은 까닭 — getUser 는 요청마다
  // 인증 서버 왕복이다). 프로필 조회는 아래 파도 1 에 같이 태운다.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user || null;

  // 오늘(서울) 기준 날짜와 요일
  const date = searchParams?.d || todaySeoul();
  const dow = dowOf(date);

  // 한 달 지난 사진·녹음 치우기 — 하루 한 번, 조용히.
  // 따로 도는 서버가 없으니 매일 여는 이 화면에 붙인다.
  // 실패해도 수업 화면은 그냥 열려야 한다.
  /**
   * ── 한 번에 물어본다 (2026-08-14, 원장님 — 「모든 페이지의 로딩 자체가
   *    느려」) ──────────────────────────────────────────────
   *
   * 이 화면은 서버 조회가 쉰 개가 넘는데 **전부 한 줄씩 차례로** 기다리고
   * 있었다. 왕복 하나가 수십 ms 라도 쉰 번이면 초 단위가 된다 — 대시보드를
   * 25회 직렬 → 왕복 2번으로 고쳤을 때(A16)와 똑같은 병.
   *
   * 서로 필요한 것이 없는 조회는 **파도(wave)로 묶어 한꺼번에** 보낸다.
   *   파도 1  날짜만 있으면 되는 것 (여기, 22개 → 왕복 1번)
   *   파도 2  파도 1 의 결과(학생 id · 리포트 id …)가 필요한 것
   *   파도 3  로스터가 필요한 것
   * 사다리 폴백(옛 DB용)은 실패했을 때만 그대로 한 단씩 내려간다.
   *
   * 파일 정리(purge)도 같은 파도에 태운다 — 하루 한 번짜리 정리를
   * 기다리느라 매일 여는 화면이 늦어질 이유가 없다.
   */
  const [
    profileQ,
    ,                 // purge — 결과는 안 쓴다 (실패해도 수업은 열려야 한다)
    allClasses,
    membersQ,
    studentsQ1,
    attQ1,
    mkQ,
    subQ,
    clsAttQ,
    reportsQ1,
    itemsQ1,
    prevQ,
    booksQ,
    wordCfgQ,
    noticeQ1,
    stayQ,
    schedQ,
    ruleQ,
    warnRepQ,
    warnActQ,
    skipQ,
    todayTasksQ,
    unreadCmtQ,
    actQ1,
  ] = await Promise.all([
    user
      ? cachedProfile(supabase, user.id)
      : Promise.resolve({ data: null }),
    purgeOncePerDay().catch(() => null),
    // 오늘 요일에 수업이 있는 반 (끝난 특강은 여기서 이미 빠진다)
    loadRunningClasses(
      supabase,
      "id, name, days, start_time, end_time, room, level, category",
      date
    ),
    supabase.from("class_students").select("class_id, student_id"),
    // 단어시험 설정(개수·통과선)까지 같이 — 채점 자리에서 바로 나와야 한다 (0070)
    supabase
      .from("students")
      .select("id, name, school, grade, status, word_when, word_test_count, word_cut_pct")
      .eq("status", "enrolled"),
    supabase
      .from("attendance")
      .select("student_id, status, makeup_of, planned, reason, makeup_time")
      .eq("date", date),
    supabase
      .from("attendance")
      .select("student_id, date, makeup_of")
      .eq("status", "makeup")
      .eq("makeup_of", date),
    supabase
      .from("homework_submissions")
      .select("id, student_id, kind, path, body, seconds, checked_at, created_at, homework_item_id, report_item_id")
      .gte("date", addDays(date, -7))
      .lte("date", date)
      .order("created_at", { ascending: false }),
    supabase
      .from("class_attendance")
      .select("class_id, student_id, status, makeup_of, note")
      .eq("date", date),
    supabase
      .from("daily_reports")
      .select("id, student_id, attitude, understanding, word_correct, word_total, sent_correct, sent_total, sent_unit, sent_passed, own_progress, notice, report_written, late_until, late_reason, late_sent_at, phone_in, homework_in, word_when")
      .eq("date", date),
    supabase
      .from("homework_items")
      .select("id, name, category, sort, method, no_timer, unit_test")
      .eq("active", true)
      .order("sort", { ascending: true }),
    supabase
      .from("daily_reports")
      .select("id, student_id, own_progress, date")
      .lt("date", date)
      .order("date", { ascending: false })
      .limit(300),
    supabase
      .from("textbooks")
      .select("id, name, status, total_pages, area")
      .order("name", { ascending: true }),
    supabase.from("textbooks").select("id, word_range, words_irregular"),
    supabase
      .from("notices")
      .select("id, kind, scope, class_id, school, grade, title, photos, body, created_at, edited_at")
      .eq("date", date)
      .order("created_at", { ascending: true }),
    supabase
      .from("stay_tasks")
      .select("id, student_id, body, status, auto")
      .eq("date", date)
      .order("created_at", { ascending: true }),
    supabase.from("integrations").select("config").eq("id", "schedule").maybeSingle(),
    supabase.from("integrations").select("config").eq("id", "warning").maybeSingle(),
    supabase
      .from("daily_reports")
      .select("id, student_id, date, attendance_kind, word_correct, word_total")
      .gte("date", addDays(date, -100))
      .lte("date", date)
      .order("date", { ascending: true }),
    supabase.from("warning_actions").select("student_id, kind, on_date, target_date, note"),
    supabase.from("integrations").select("config").eq("id", "warning_reset").maybeSingle(),
    supabase
      .from("tasks")
      .select("id, title, due_on, start_time, category, deliver_body, kind")
      .eq("due_on", date)
      .order("start_time", { ascending: true }),
    supabase
      .from("report_comments")
      .select("daily_report_id")
      .is("read_at", null)
      .neq("author_role", "staff"),
    supabase
      .from("student_activity")
      .select("student_id, state, updated_at, by_student")
      .eq("date", date),
  ]);

  const profile = profileQ?.data || null;
  const classes = allClasses
    .filter((c) => (c.days || []).includes(dow))
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  // 반 배정 + 학생
  const { data: members } = membersQ;
  let { data: students, error: stuErr } = studentsQ1;
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

  // 오늘 출결 기록 (첫 시도는 파도 1)
  let { data: att, error: attErr } = attQ1;
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

  /**
   * **이 결석의 보강이 이미 잡혀 있나** (2026-08-07).
   *
   * 오늘 수업에서 결석을 찍으면 그 자리에서 보강을 잡을 수 있게 했는데,
   * 이미 잡아둔 것이 있으면 **또 잡을 수 있으면 안 된다** — 그날 오지도
   * 않을 아이가 「오늘 수업」 에 두 번 뜬다.
   */
  const { data: mkRows } = mkQ;
  const makeupOnOf = new Map((mkRows || []).map((m) => [m.student_id, m.date]));

  // 학생이 낸 숙제 (0044 전이면 빈 배열)
  //   집에서 어제 냈을 수도 있으므로 지난 수업 이후치를 함께 본다
  const { data: subRows } = subQ;

  // 오늘 특강 출결 (0042 전이면 빈 배열 — 예전처럼 하루 출결만 쓴다)
  const { data: clsAtt } = clsAttQ;

  // 오늘 리포트 + 숙제 항목 마스터 + 지난 진도 (파도 1)
  let [{ data: reports }, { data: items, error: itemsErr }, { data: prevReports }] = [
    reportsQ1,
    itemsQ1,
    prevQ,
  ];

  // 0118 전이면 이해도 없이 다시
  if (!reports) {
    ({ data: reports } = await supabase
      .from("daily_reports")
      .select("id, student_id, attitude, word_correct, word_total, sent_correct, sent_total, sent_unit, sent_passed, own_progress, notice, report_written, late_until, late_reason, late_sent_at, phone_in, homework_in, word_when")
      .eq("date", date));
  }
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

  // unit_test · no_timer · method 가 아직 없는 DB에서도 동작하도록 한 단계씩 물러난다
  if (itemsErr) {
    const r0 = await supabase
      .from("homework_items")
      .select("id, name, category, sort, method, no_timer")
      .eq("active", true)
      .order("sort", { ascending: true });
    if (!r0.error) items = r0.data;
  }
  if (itemsErr && !items) {
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
  const prevIds = [...new Set((prevReports || []).map((r) => r.id))];
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

  /**
   * 파도 2 — 파도 1 의 id 들이 필요한 조회.
   * loadItems(prevIds, true) 는 **두 군데서 똑같이** 부르고 있었다
   * (배정 목록 · 단원 메모) — 한 번만 부르고 나눠 쓴다.
   */
  const [curItemRows, prevAssignedRows, prevAllRows] = await Promise.all([
    loadItems(reportIds),
    loadItems(prevIds, true),
    loadItems(prevIds),
  ]);

  curItemRows.forEach((x) => {
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
  const prevAssigned = new Map();
  const prevUnitOf = new Map(); // `${studentId}|${itemId}` → { unitId, note }
  const prevReportStudent = new Map(
    (prevReports || []).map((r) => [r.id, r.student_id])
  );
  prevAssignedRows.forEach((x) => {
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
  prevAllRows.forEach((x) => {
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

  // 단원·범위 메모는 배정 줄에서 다시 읽는다 (같은 조회를 또 하지 않는다)
  prevAssignedRows.forEach((x) => {
    const sid = prevReportStudent.get(x.daily_report_id);
    if (!sid || lastAssignedReport.get(sid) !== x.daily_report_id) return;
    prevUnitOf.set(`${sid}|${x.homework_item_id}`, {
      unitIds: idsOf(x),
      note: x.range_note || "",
    });
  });

  /**
   * **단원평가는 검사 대상이 아니다** (원장님, 2026-08-07).
   *
   * 「숙제에 체크하면 검사할 대상이 아니라 **공지의 개념**으로 잡혀야 해서
   * 완료·미완료·미흡 체크 안 함」
   *
   * 맞는 말씀이다. 단원평가는 **아이가 결과를 내는 것**이라 ○△✕ 로 매길
   * 것이 없다. 그런데 검사 목록에 남아 있으면 —
   *   · 매일 「미완료」 로 뜬다 (아무도 매기지 않으니까)
   *   · 그것이 경고 1회가 되고, 세 번이면 반성문이 된다
   * 안 한 적도 없는 아이가 반성문 대상이 되는 것이다.
   *
   * **분류가 「공지」·「다음테스트」 인 것도 같다** (2026-08-07). 「교재
   * 가져오기」 나 「다음 시간에 볼 것」 은 알리는 것이지 검사할 것이 아니다.
   * 규칙은 app/homework/categories.js 의 isNoCheck 한 곳에 있다.
   */
  const unitTestIds = new Set((items || []).filter(isNoCheck).map((i) => i.id));

  const toCheckOf = (sid) => {
    const rid = lastAssignedReport.get(sid);
    if (!rid) return [];
    const done = checkedAfter.get(sid) || new Set();
    return (prevAssigned.get(rid) || [])
      .filter((iid) => !done.has(iid) && !unitTestIds.has(iid));
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

  // 교재 목록(사용중) + 화면에 이미 쓰인 단원의 이름 (파도 1)
  const { data: books } = booksQ;
  const textbooks = (books || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name, area: b.area || "" }));

  // 단어가 몇 개인가 — 교재 기본값과 단원별 개수 (0070).
  // 0070 전이면 칸이 없으니 빈 채로 두고, 개수는 손으로 적는다.
  const wordCfg = new Map();
  {
    const { data } = wordCfgQ;
    (data || []).forEach((b) =>
      wordCfg.set(b.id, {
        range: Number(b.word_range) || 0,
        irregular: !!b.words_irregular,
      })
    );
  }

  /**
   * 오늘 단어시험은 **몇 개짜리인가.**
   *
   * 지난 수업에서 내준 **단어 숙제의 범위 단원**을 더한다. 0070 으로 단원마다
   * 단어 개수가 들어왔는데, 오늘 수업 화면과는 안 이어져 있어서 원장님이
   * 매번 세어 넣고 계셨다.
   *
   * 개수가 안 적힌 단원이 섞여 있으면 **그것도 같이 알려준다.** 그냥 더해서
   * 보여주면 30개짜리 두 단원이 30개로 뜬다 — 그게 더 나쁘다.
   */
  const wordItemIds = new Set(
    (items || []).filter((i) => (i.category || "") === "단어").map((i) => i.id)
  );
  function plannedWordsOf(sid) {
    const assigned = assignedUnitsOf(sid);
    const ids = new Set();
    Object.entries(assigned).forEach(([iid, v]) => {
      if (!wordItemIds.has(iid)) return;
      (v.unitIds || []).forEach((x) => ids.add(x));
    });
    if (ids.size === 0) return null;
    let sum = 0;
    let counted = 0;
    ids.forEach((id) => {
      const w = unitNames[id]?.words || 0;
      if (w > 0) {
        sum += w;
        counted += 1;
      }
    });
    if (sum === 0) return null;
    return { total: sum, units: ids.size, counted };
  }

  // 오늘의 공지 · 전달사항 (첫 시도는 파도 1)
  let { data: noticeRows, error: noticeErr } = noticeQ1;
  if (noticeErr && (noticeErr.code === "42703" || noticeErr.code === "PGRST204")) {
    // 0121 전이면 고친 시각 없이
    ({ data: noticeRows, error: noticeErr } = await supabase
      .from("notices")
      .select("id, kind, scope, class_id, school, grade, title, photos, body, created_at")
      .eq("date", date)
      .order("created_at", { ascending: true }));
  }
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
  /**
   * 파도 3 — 학생 id · 공지 id 가 필요한 것들을 한꺼번에.
   * (공지 수신 확인이 이 중 제일 먼저 쓰여서, 블록이 이 자리에 있다 —
   *  선언보다 위에서 쓰면 빌드는 통과하고 화면을 여는 순간 터진다)
   */
  const studentIds = (students || []).map((s) => s.id);
  const none = { data: [] };
  const warnRepIds = (warnRepQ.error ? [] : warnRepQ.data || []).map((r) => r.id);
  const pendingTaskIds0 = (todayTasksQ.data || []).filter((t) => t.deliver_body).map((t) => t.id);
  const [stBooksQ, stProgQ, wtQ, examQ, arrQ, secQ, receiptsQ, wItemsQ, madeNoticesQ, pickedQ] = await Promise.all([
    studentIds.length
      ? supabase
          .from("student_textbooks")
          .select("student_id, textbook_id, status, current_page, ended_on, round, assigned_on")
          .in("student_id", studentIds)
      : none,
    studentIds.length
      ? supabase
          .from("student_unit_progress")
          .select("student_id, textbook_unit_id, status, round")
          .in("student_id", studentIds)
      : none,
    studentIds.length
      ? supabase
          .from("word_test_settings")
          .select("student_id, textbook_id, round, mc_meaning, sa_meaning, mc_word, sa_word, first_hint")
          .in("student_id", studentIds)
      : none,
    studentIds.length
      ? supabase
          .from("unit_exams")
          .select("id, student_id, name, score, total")
          .eq("date", date)
          .in("student_id", studentIds)
      : none,
    studentIds.length
      ? supabase
          .from("arrival_checks")
          .select("student_id, phone_at, attend_at, homework_at")
          .eq("date", date)
          .in("student_id", studentIds)
      : none,
    studentIds.length
      ? supabase
          .from("study_sessions")
          .select("student_id, homework_item_id, seconds")
          .eq("date", date)
          .in("student_id", studentIds)
      : none,
    noticeIds.length
      ? supabase
          .from("notice_receipts")
          .select("notice_id, student_id, delivered_at")
          .in("notice_id", noticeIds)
      : none,
    warnRepIds.length
      ? supabase
          .from("daily_report_items")
          .select("daily_report_id, status")
          .in("daily_report_id", warnRepIds)
          .in("status", ["missing", "weak"])
      : none,
    pendingTaskIds0.length
      ? supabase.from("notices").select("task_id").in("task_id", pendingTaskIds0).eq("date", date)
      : none,
    // 화면에 쓰인 단원이 어느 교재 것인지 (단원 이름 경로를 만들려고)
    unitIds.size > 0
      ? supabase.from("textbook_units").select("id, textbook_id").in("id", [...unitIds])
      : none,
  ]);
  const { data: receipts } = receiptsQ;

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
  const { data: stBooks } = stBooksQ;
  // 회독별로 쌓인다. `round` 가 아직 없는 DB 면 전부 1회독으로 본다.
  let stProgress = [];
  if (studentIds.length) {
    const q = stProgQ;
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
    // 완료·중단한 교재는 숙제 배정·진도 화면에서 빼고, 재원생 기록에만 남긴다.
    // 사용 예정일이 아직 안 온 교재도 뺀다 — 학생 손에 책이 없다.
    if (!inUseOn(r, date)) return;
    if (!booksOfStudent.has(r.student_id)) booksOfStudent.set(r.student_id, new Set());
    booksOfStudent.get(r.student_id).add(r.textbook_id);
    if (r.current_page) pageOf.set(`${r.student_id}|${r.textbook_id}`, r.current_page);
  });
  // 지금 몇 회독째인가 (`round` 컬럼이 아직 없으면 1회독으로 본다)
  const roundOf = new Map();
  (stBooks || []).forEach((r) => {
    if (!inUseOn(r, date)) return;
    roundOf.set(`${r.student_id}|${r.textbook_id}`, r.round || 1);
  });

  // 단어시험 방식 — (학생, 교재, 회독) 하나에 설정 한 줄
  const wtOf = new Map();
  {
    const q = wtQ;
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

  /**
   * 단원 두 갈래를 **한 층으로** — ① 화면에 쓰인 단원의 이름 경로용
   * (pickedQ 가 알려준 교재들 전체) ② 진도 분량용 (배정된 교재들).
   * 따로 기다리면 층이 둘이다.
   */
  const nameBookIds = [...new Set((pickedQ.data || []).map((u) => u.textbook_id))];
  const UNIT_COLS = "id, name, parent_id, textbook_id, page_start, page_end, total_pages, label";
  const [nameUnitsQ, buQ] = await Promise.all([
    nameBookIds.length
      ? supabase.from("textbook_units").select(`${UNIT_COLS}, word_count`).in("textbook_id", nameBookIds)
      : none,
    shownBookIds.size > 0
      ? supabase
          .from("textbook_units")
          .select("id, textbook_id, parent_id, page_start, page_end, total_pages")
          .in("textbook_id", [...shownBookIds])
      : none,
  ]);

  const unitNames = {};
  if (unitIds.size > 0) {
    let all = [];
    {
      let q = nameUnitsQ;
      if (q.error && nameBookIds.length) {
        // 0070 전이면 단어 개수 칸이 없다
        q = await supabase.from("textbook_units").select(UNIT_COLS).in("textbook_id", nameBookIds);
      }
      all = q.data || [];
    }
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
      // 이 단원의 단어 개수 — 단원에 적어둔 것이 먼저, 없으면 교재 기본값.
      // 「단원마다 개수가 다르다」 고 켜둔 교재는 기본값을 안 쓴다 (0070)
      const cfg = wordCfg.get(u.textbook_id);
      const words =
        Number(u.word_count) || (cfg && !cfg.irregular ? cfg.range : 0) || 0;
      unitNames[u.id] = {
        path: chain.join(" › ") + pages,
        amount,
        activity: u.label || "",
        textbookId: u.textbook_id,
        words,
      };
    });
  }


  const unitsOfBook = new Map(); // textbookId → [{ id, parent_id, pages }]
  if (shownBookIds.size > 0) {
    let { data: bu, error: buErr } = buQ;
    if (buErr) {
      ({ data: bu } = await supabase
        .from("textbook_units")
        .select("id, textbook_id, parent_id, page_start, page_end")
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
    const cq = unreadCmtQ;
    (cq.data || []).forEach((c) => {
      unreadByReport.set(c.daily_report_id, (unreadByReport.get(c.daily_report_id) || 0) + 1);
    });
  }

  // 오늘 본 단원평가 (0031 전이면 없는 것으로 본다)
  const examOf = new Map();
  {
    const q = examQ;
    (q.error ? [] : q.data || []).forEach((e) => {
      if (!examOf.has(e.student_id)) examOf.set(e.student_id, []);
      examOf.get(e.student_id).push(e);
    });
  }

  // 학생이 직접 누른 등원 체크 (폰·숙제)
  const arrivalOf = new Map();
  {
    const q = arrQ;
    (q.error ? [] : q.data || []).forEach((a) => arrivalOf.set(a.student_id, a));
  }

  // 오늘 학생들이 얼마나 공부했나 (항목별 합계)
  const secOf = new Map();     // `${studentId}|${itemId}` → 초
  {
    const q = secQ;
    (q.error ? [] : q.data || []).forEach((x) => {
      if (!x.homework_item_id) return;
      const k = `${x.student_id}|${x.homework_item_id}`;
      secOf.set(k, (secOf.get(k) || 0) + (x.seconds || 0));
    });
  }

  // ── 늦귀가 과제 ─────────────────────────────────────────
  const stayOf = new Map();
  {
    const q = stayQ;
    (q.error ? [] : q.data || []).forEach((t) => {
      if (!stayOf.has(t.student_id)) stayOf.set(t.student_id, []);
      stayOf.get(t.student_id).push(t);
    });
  }

  // 보강 요일 — 보강 날짜를 잡을 때 미리 넣어준다 (설정에서 정한다, 기본 금요일)
  let makeupDays = ["금"];
  {
    const { data: schedRow } = schedQ;
    const d = schedRow?.config?.makeupDays;
    if (Array.isArray(d) && d.length) makeupDays = d;
  }

  // ── 경고 · 반성문 ────────────────────────────────────────
  // 저장하지 않고 지난 석 달 리포트에서 매번 센다
  const warnOf = new Map();
  let warnActions = [];
  let warnRule = DEFAULT_RULE;   // 하원 안내에서도 단어시험 통과선을 쓴다
  {
    const { data: ruleRow } = ruleQ;
    const rule = { ...DEFAULT_RULE, ...(ruleRow?.config || {}) };
    warnRule = rule;

    const wq = warnRepQ;
    const wReports = wq.error ? [] : wq.data || [];

    const { data: wItems } = wItemsQ;
    const wItemsOf = new Map();
    (wItems || []).forEach((x) => {
      if (!wItemsOf.has(x.daily_report_id)) wItemsOf.set(x.daily_report_id, []);
      wItemsOf.get(x.daily_report_id).push({ status: x.status });
    });

    const aq = warnActQ;
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
  const { data: skipRow } = skipQ;
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
          // 오늘 결석의 보강이 이미 잡혀 있으면 그 날짜 (그 자리에서 또 잡지 않게)
          makeupOn: makeupOnOf.get(s.id) || null,
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
          plannedWords: plannedWordsOf(s.id),
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
        plannedWords: plannedWordsOf(s.id),
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

  // 오늘 일정 — 전달사항으로 아직 안 깐 것 (파도 1)
  const { data: todayTasks } = todayTasksQ;
  const { data: madeNotices } = madeNoticesQ;
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
      editedAt: n.edited_at || null,
      targetLabel, total: t.total, done: t.done,
    };
  });

  // 수업 직전에 알아야 하는 것 — 지금까지는 대시보드에만 있어서 화면을 왔다갔다 해야 했다
  const rosterIds = [...new Set(rosterStudents.map((s) => s.id))];

  // 파도 4 — 로스터가 필요한 것들 (수업 직전 알림 · 현황판)
  const repIdsToday = (reports || [])
    .filter((r) => rosterIds.includes(r.student_id))
    .map((r) => r.id);
  const [preCmtQ, preReqQ1, actItemQ1, timerQ] = await Promise.all([
    rosterIds.length
      ? supabase
          .from("report_comments")
          .select("id, body, author_role, student_id, created_at")
          .is("read_at", null)
          .neq("author_role", "staff")
          .in("student_id", rosterIds)
          .order("created_at", { ascending: false })
          .limit(10)
      : { data: [] },
    rosterIds.length
      ? supabase
          .from("requests")
          .select("id, student_id, kind, from_date, to_date, body, photos")
          .eq("status", "new")
          .in("student_id", rosterIds)
          .order("created_at", { ascending: false })
          .limit(10)
      : { data: [] },
    repIdsToday.length
      ? supabase
          .from("daily_report_items")
          .select("id, daily_report_id, homework_item_id, kind, student_done_at")
          .in("daily_report_id", repIdsToday)
      : { data: [] },
    rosterIds.length
      ? supabase
          .from("study_sessions")
          .select("student_id, homework_item_id, started_at, ended_at")
          .eq("date", date)
          .is("ended_at", null)
          .in("student_id", rosterIds)
      : { data: [] },
  ]);

  const preClass = { comments: [], requests: [] };
  if (rosterIds.length > 0) {
    const cq = preCmtQ;
    const nameById = new Map(rosterStudents.map((s) => [s.id, s.name]));
    preClass.comments = (cq.error ? [] : cq.data || []).map((c) => ({
      ...c,
      name: nameById.get(c.student_id) || "학생",
    }));

    const RQ = "id, student_id, kind, from_date, to_date, body";
    let rq = preReqQ1;
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

  // ── 현황판 ────────────────────────────────────────────────
  //
  // 원장님 (2026-08-05) — 「내가 바꾸는 게 아니고, 학생이 자기가 뭘 다 했는지
  // 누르면 나한테 보이는 걸 원하는 거야」
  //
  // 그래서 **아이가 이미 누르고 있는 것**을 센다.
  //   · 학습을 시작하면 타이머가 돈다   (study_sessions, ended_at 이 비어 있음)
  //   · 다 하면 「다 했어요」 를 누른다  (daily_report_items.student_done_at)
  // 손으로 상태를 골라 넣게 하면 그것부터 일이 된다.
  let activity = [];
  let activityOff = false;
  let calls = [];
  {
    const itemName = new Map((items || []).map((x) => [x.id, x.name]));
    // 오늘 이 아이들의 리포트 줄 (등원 학습 항목)
    const repIds = repIdsToday;
    let itemQ = actItemQ1;
    if (itemQ.error) {
      itemQ = repIds.length
        ? await supabase
            .from("daily_report_items")
            .select("id, daily_report_id, homework_item_id, kind")
            .in("daily_report_id", repIds)
        : { data: [] };
      activityOff = true;               // 0034 전이면 「다 했어요」 가 없다
    }
    const repOwner = new Map((reports || []).map((r) => [r.id, r.student_id]));
    const tally = new Map();            // student_id → { total, done }
    (itemQ.data || []).forEach((x) => {
      // 등원 학습만 센다 — 집 숙제는 오늘 이 자리에서 하는 일이 아니다
      if (x.kind && x.kind !== "class") return;
      const sid = repOwner.get(x.daily_report_id);
      if (!sid) return;
      if (!tally.has(sid)) tally.set(sid, { total: 0, done: 0 });
      const t = tally.get(sid);
      t.total += 1;
      if (x.student_done_at) t.done += 1;
    });

    // 지금 타이머가 돌고 있는 것 = 지금 하고 있는 것
    const ssQ = timerQ;
    const doing = new Map();
    (ssQ.error ? [] : ssQ.data || []).forEach((x) => {
      doing.set(x.student_id, { item: itemName.get(x.homework_item_id) || "", at: x.started_at });
    });

    // 아이가 부른 것 (0085) — 이것만은 손으로 누르는 것이 맞다 (파도 1)
    let actQ = actQ1;
    if (actQ.error && (actQ.error.code === "42703" || actQ.error.code === "PGRST204")) {
      actQ = await supabase
        .from("student_activity")
        .select("student_id, state, updated_at")
        .eq("date", date);
    }
    calls = actQ.error ? [] : actQ.data || [];

    activity = rosterStudents.map((s) => ({
      id: s.id,
      name: s.name,
      ...(tally.get(s.id) || { total: 0, done: 0 }),
      doing: doing.get(s.id) || null,
    }));
  }

  return (
    <>
      <TopBar profile={profile} active="today" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">오늘 수업</p>
          <h1 className="h1">{label}</h1>
          {/* 날짜 넘기기 — 지난 공지·숙제를 그 자리에서 고친다 (원장님, 2026-08-14) */}
          <DateNav
            date={date}
            students={(students || []).map((st) => ({ id: st.id, name: st.name }))}
          />
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
        {/* **말 걸기 전에 한 번 본다.** 한 반에 여럿이 각자 다른 것을 하고
            있어서, 지금 누가 시험 중인지 눈으로 세고 있어야 했다. */}
        <ActivityBoard rows={activity} calls={calls} unavailable={activityOff} />
        <TodayBoard
          date={date}
          groups={groups}
          items={items || []}
          textbooks={textbooks}
          unitNames={unitNames}
          rule={{ ...warnRule, makeupDays }}
          openStudent={searchParams?.open || null}
        />
      </main>
    </>
  );
}
