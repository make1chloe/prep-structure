/**
 * **메뉴마다 남은 일 숫자** (원장님, 2026-08-08 —
 * 「해야 할 일이 남은 경우 메뉴마다 알림 배지를 다 추가해줘」).
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 *
 * 지금은 대시보드에만 숫자가 붙는다. 그런데 대시보드가 세는 것은 **저쪽이
 * 말을 걸어온 것**뿐이다(결석 요청 · 댓글). 내가 해야 하는 일 — 안 보낸
 * 리포트, 잡아야 할 보강, 안 쓴 월간리포트 — 은 그 화면에 들어가 봐야만
 * 안다. 다른 화면에서 일하고 계시면 밀린 줄도 모르고 하루가 간다.
 *
 * ── 셀 때 지키는 것 ──────────────────────────────────────
 *
 * **1. 없는 배지가 틀린 배지보다 낫다.** 표가 없거나(SQL 전) 읽기가
 *    막히면 0 으로 본다. 「3」 이라고 떠 있는데 들어가서 아무것도 없으면
 *    그다음부터 아무도 안 믿는다.
 *
 * **2. 그 화면에서 지금 할 수 있는 일만 센다.** 다음 주 시험, 이번 달
 *    수업 예정 같은 것은 「남은 일」 이 아니라 그냥 앞일이다. 그런 것까지
 *    세면 숫자가 늘 두 자리라 배지가 배경이 된다.
 *
 * **3. 화면 안의 숫자와 같아야 한다.** 그래서 셈이 이미 있는 것은
 *    그 함수를 그대로 쓴다 (보강 = loadMakeupTodo, 시험범위 = needsScope).
 *    두 벌로 만들면 언젠가 한쪽만 고치게 되고, 두 자리가 다른 말을 한다.
 *
 * **4. 한 번에 묻는다.** 이 셈은 **모든 화면**의 위 메뉴에서 돈다.
 *    줄줄이 await 하면 화면마다 그만큼 느려진다.
 *
 * ── 일부러 안 붙인 것 ────────────────────────────────────
 *
 * **수강료.** 원장님이 2026-08-05 에 「이 앱이 챙기는 것은 수업이다.
 * 수강료는 결제선생에서 따로 보시고, 여기서는 수강료 화면에 들어가셨을
 * 때만 보이게」 라고 하셨다. 미납을 메뉴에 띄우면 그 결정을 뒤집는 일이다.
 *
 * **재원생 · 성장 · 교재 · 학습 항목 · 영상 · 회차 · 학교 · 상담일지 ·
 * 설정.** 「남았다」 고 할 만한 것이 없다. 억지로 숫자를 만들어 붙이면
 * 늘 켜져 있는 배지가 되고, 늘 켜진 배지는 없는 것과 같다.
 */
import { todaySeoul, addDays, endOfMonth } from "./day.js";
import { loadMakeupTodo } from "./makeupTodo.js";
import { needsScope, examTitle } from "./examList.js";
import { hiddenExamIds } from "./schedule.js";

/** 세는 데 실패하면 0 — 배지가 안 뜨는 쪽이 늘 낫다 */
async function n(fn) {
  try {
    const { count, error } = await fn();
    return error ? 0 : count || 0;
  } catch {
    return 0;
  }
}

/** 줄만 받아온다 (표가 없으면 빈 목록) */
async function rows(fn) {
  try {
    const { data, error } = await fn();
    return error ? [] : data || [];
  } catch {
    return [];
  }
}

/**
 * @returns { [메뉴키]: 숫자 } — 0 인 것은 아예 안 담는다
 *
 * 메뉴 키는 lib/menu.js 의 것과 같아야 한다. 다르면 조용히 아무 데도
 * 안 붙는다 — 그래서 scripts/check-badges.mjs 가 키를 맞춰 본다.
 */
export async function menuTodos(supabase, today = todaySeoul()) {
  if (!supabase) return {};
  const ym = today.slice(0, 7);
  const monthAgo = addDays(today, -30);
  const monthEnd = endOfMonth(ym);
  const daysToMonthEnd = Math.round(
    (new Date(`${monthEnd}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000
  );

  const [
    cameToday, writtenToday, todayReports,
    unsent, students, monthlyDone, unitItems, schoolScores,
    inquiries, overdueTodos, exams, scopes,
    inClass, skipRows, makeup,
  ] = await Promise.all([
    // 오늘 수업 — **온 아이 중 리포트를 아직 안 쓴 수**
    n(() => supabase.from("attendance").select("student_id", { count: "exact", head: true })
      .eq("date", today).in("status", ["present", "late", "makeup", "online"])),
    n(() => supabase.from("daily_reports").select("id", { count: "exact", head: true })
      .eq("date", today).eq("report_written", true)),
    /**
     * 오늘 리포트. **점수 칸까지 같이 받아온다** — 숙제 검사 대기와
     * 단원평가 결과가 둘 다 여기서 나온다 (원장님, 2026-08-08 —
     * 「단원평가 배정되고 시험 점수 없는 것도」).
     */
    rows(() => supabase.from("daily_reports")
      .select("id, student_id, sent_total, sent_unit").eq("date", today)),

    /**
     * 발송 — 써놓고 아직 안 보낸 것 (어제 것도 본다. 오늘 것만 보면 영영
     * 안 보인다).
     *
     * **「안 보내기」 로 정리한 것은 빼야 한다** (원장님, 2026-08-08 —
     * 「안 보낸 게 없는데 발송에 알림 밀렸어」). 결석해서 보낼 것이 없는
     * 날 등을 원장님이 「안 보냄」 으로 치워두시는데, 그것까지 세면 화면
     * 목록은 비어 있는데 배지만 남는다 — 끌 방법이 없는 숫자가 된다.
     * 발송 화면(lib/dashboard 의 notSkipped)과 같은 기준이다.
     */
    rows(() => supabase.from("daily_reports").select("id, skip_kinds")
      .lte("date", today).gte("date", monthAgo).eq("report_written", true).is("sent_at", null)),

    rows(() => supabase.from("students").select("id, name, school, grade").eq("status", "enrolled")),
    n(() => supabase.from("monthly_reports").select("id", { count: "exact", head: true }).eq("ym", ym)),
    // 어느 학습 항목이 단원평가인가 (0106)
    rows(() => supabase.from("homework_items").select("id").eq("unit_test", true)),
    // 끝난 학교 시험의 성적이 들어왔나 — 시험 앞뒤로 넉넉히 본다
    rows(() => supabase.from("scores").select("student_id, taken_on, exam_id")
      .eq("kind", "school").gte("taken_on", addDays(today, -70))),

    // 신규 상담 — 아직 등록도 거절도 안 된 문의
    n(() => supabase.from("inquiries").select("id", { count: "exact", head: true })
      .in("status", ["new", "scheduled"])),

    // 할일 — **오늘까지가 기한인데 아직 안 한 것.** 앞으로 할 일은 안 센다
    n(() => supabase.from("tasks").select("id", { count: "exact", head: true })
      .eq("kind", "todo").eq("status", "open").lte("due_on", today)),

    /**
     * 시험 — 앞뒤로 본다.
     *   앞(오늘~3주)   범위를 아직 안 넣은 것      → 내신 대비
     *   뒤(지난 5주)   성적이 아직 안 들어온 것    → 성장
     */
    rows(() => supabase.from("exam_periods").select("id, school, grade, name, neis_name, english_on")
      .gte("english_on", addDays(today, -35)).lte("english_on", addDays(today, 21))),
    rows(() => supabase.from("prep_scopes").select("exam_id")),

    // 반 배정 — 어느 반에도 안 든 재원생
    rows(() => supabase.from("class_students").select("student_id")),

    // 「시험 없음」 으로 치운 것 (0112) — 표가 없으면 빈 목록이라 그대로 센다
    rows(() => supabase.from("exam_skips").select("student_id, exam_id")),

    // 보강 — **출결 화면·대시보드와 같은 셈을 쓴다** (lib/makeupTodo)
    loadMakeupTodo(supabase, today).catch(() => []),
  ]);

  /**
   * 오늘 리포트에 달린 항목. **한 번 받아서 두 가지를 센다** —
   * 검사 대기와, 단원평가를 봤는데 점수를 안 적은 것.
   */
  const ids = todayReports.map((r) => r.id);
  const items = ids.length
    ? await rows(() => supabase.from("daily_report_items")
        .select("daily_report_id, homework_item_id, status, student_done_at")
        .in("daily_report_id", ids))
    : [];

  const unitIds = new Set(unitItems.map((i) => i.id));
  /**
   * **단원평가는 검사 대상이 아니다** (0106, app/homework/categories).
   * 그래서 검사 대기에서 빼야 한다 — 안 빼면 영영 안 꺼지는 숫자가 된다.
   */
  const waiting = items.filter(
    (i) => i.student_done_at && i.status === "assigned" && !unitIds.has(i.homework_item_id)
  ).length;

  /**
   * **단원평가를 배정했는데 점수가 없다** (원장님, 2026-08-08).
   *
   * 단원평가는 검사로 찍는 것이 아니라 **점수를 적는 것**이라, 안 적으면
   * 아무 데도 흔적이 안 남는다. 그날은 봤는데 기록이 없으면 월간리포트에도
   * 안 실리고, 몇 번 만에 통과했는지도 영영 알 수 없게 된다.
   *
   * 점수는 오늘 수업의 「테스트」 칸에 적는다 (0099 — sent_total · sent_unit).
   */
  const hasUnit = new Set(
    items.filter((i) => unitIds.has(i.homework_item_id)).map((i) => i.daily_report_id)
  );
  const unitNoScore = todayReports.filter(
    (r) => hasUnit.has(r.id) && r.sent_total == null && !(r.sent_unit || "").trim()
  ).length;

  // **숨긴 시험은 뺀다** — 대시보드도 그렇게 센다. 안 빼면 치웠는데도
  // 배지가 안 꺼져서 「이건 왜 안 없어지지」 가 된다
  const hidden = await hiddenExamIds(supabase).catch(() => new Set());
  const scoped = new Set(scopes.map((s) => s.exam_id));
  const noScope = exams.filter(
    (e) => e.english_on >= today && !hidden.has(e.id) && needsScope(e) && !scoped.has(e.id)
  ).length;

  /**
   * **시험은 끝났는데 성적이 안 들어온 것** (원장님, 2026-08-08).
   *
   * 시험이 끝나면 성적을 받아 적어야 상담 때 펴놓고 말씀하실 것이 생긴다.
   * 그런데 이건 아무도 재촉하지 않는다 — 안 적어도 화면은 멀쩡하고,
   * 몇 달 뒤 상담에서야 「그 시험 점수가 없네」 가 된다.
   *
   * 성적에는 시험 번호를 적을 자리가 **있다** (scores.exam_id, 0097).
   * 다만 지금은 어느 화면도 그 자리를 안 채운다 — 손으로 적을 때도,
   * 아이가 낼 때도 시험을 고르는 칸이 없다. 그래서 적혀 있으면 그것을
   * 믿고, 비어 있으면 **그 학교 · 그 학년 아이**의 성적이 시험 무렵에
   * 있는지로 본다 (lib/scores.js 의 findExam 과 같은 생각이다).
   *
   * 모의고사는 빼고(내신만), 숨긴 시험도 뺀다.
   */
  const skips = new Set(skipRows.map((r) => `${r.student_id}|${r.exam_id}`));
  const noScoreYet = missingScores({ exams, students, scores: schoolScores, hidden, skips, today }).length;

  const enrolled = students.length;
  const assigned = new Set(inClass.map((c) => c.student_id)).size;
  // 반 목록 자체를 못 읽었으면(0 줄) 「전원 미배정」 이 되어버린다 — 그건 거짓말이다
  const noClass = inClass.length > 0 ? Math.max(0, enrolled - assigned) : 0;

  const out = {
    // 오늘 수업에서 해야 하는 두 가지 — 리포트 쓰기와 단원평가 점수 적기
    today: Math.max(0, cameToday - writtenToday) + unitNoScore,
    check: waiting,
    plan: (makeup || []).length,
    classes: noClass,
    prep: noScope,
    scores: noScoreYet,
    tasks: overdueTodos,
    report: unsent.filter((r) => !(r.skip_kinds || []).includes("report")).length,
    /**
     * **월간리포트는 월말에만 센다.**
     *
     * 월초에 「28명」 이 떠 있으면 그건 밀린 일이 아니라 아직 안 온 일이다.
     * 그런 숫자가 한 달 내내 붙어 있으면 배지가 배경이 되어, 정작 급한
     * 것이 떠도 눈에 안 들어온다. 대시보드도 같은 기준으로 알린다.
     */
    monthly: daysToMonthEnd <= 3 ? Math.max(0, enrolled - monthlyDone) : 0,
    consult: inquiries,
  };
  // 0 인 것은 담지 않는다 — 화면에서 매번 걸러내게 하면 언젠가 한 곳이 빠진다
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v > 0));
}

/**
 * **누구의 어느 시험 성적이 비었나** — 숫자가 아니라 **목록**으로.
 *
 * 원장님 (2026-08-08) — 「알림 있는 거 성적 어디서 입력해야 하는지」
 *
 * 배지가 「3명」 이라고만 하면, 성장 화면에 들어가서 아이를 하나씩 눌러
 * 찾아야 한다. 그건 배지가 일을 늘린 것이다. 그래서 **같은 함수**가
 * 목록도 내주고, 성장 화면이 그것을 그대로 펴 놓는다 — 누르면 그 아이,
 * 그 시험으로 바로 간다.
 *
 * 시험과 성적은 exam_id 로 이어지는 것이 맞지만(0097) 지금까지 아무도
 * 안 채웠다. 그래서 적혀 있으면 그것을 믿고, 없으면 **그 학교 · 그 학년
 * 아이의 성적이 시험 무렵(2주 전부터)에 있는지**로 본다.
 *
 * @returns [{ studentId, name, examId, examName, on }]
 */
export function missingScores({
  exams = [], students = [], scores = [], hidden = new Set(),
  skips = new Set(),                                  // 「학생|시험」 — 안 본 것 (0112)
  today = todaySeoul(),
} = {}) {
  const byStudent = new Map();
  const scoredExam = new Set();          // 「이 아이의 이 시험」 은 적혀 있다
  scores.forEach((sc) => {
    if (sc.exam_id) scoredExam.add(`${sc.student_id}|${sc.exam_id}`);
    if (!sc.taken_on) return;
    if (!byStudent.has(sc.student_id)) byStudent.set(sc.student_id, []);
    byStudent.get(sc.student_id).push(sc.taken_on);
  });

  const out = [];
  exams
    .filter((e) => e.english_on && e.english_on < today && !hidden.has(e.id) && needsScope(e))
    .forEach((e) => {
      const from = addDays(e.english_on, -14);
      students
        .filter((st) => st.school && st.school === e.school && (!e.grade || st.grade === e.grade))
        .forEach((st) => {
          /**
           * **안 봤다고 적어둔 것은 뺀다** (0112). 병결 · 전학 · 그 과목을
           * 안 듣는 아이는 성적이 영영 안 들어온다 — 그대로 두면 배지가
           * 영영 안 꺼지고, 안 꺼지는 배지는 며칠 안에 배경이 된다.
           */
          if (skips.has(`${st.id}|${e.id}`)) return;
          const got =
            scoredExam.has(`${st.id}|${e.id}`) ||
            (byStudent.get(st.id) || []).some((d) => d >= from);
          if (!got) {
            out.push({
              studentId: st.id, name: st.name || "",
              examId: e.id, examName: examTitle(e), on: e.english_on,
              school: e.school, grade: e.grade || "",
              /**
               * **학년은 아이 것으로 적는다.** 회차의 학년(e.grade)은 비어
               * 있는 때가 많다 — 나이스 학사일정의 「1학기 중간고사」 는
               * 학년 구분 없이 한 줄로 온다. 그런데 시험을 안 보는 것은
               * **학년 단위**다(중1 1학기 · 중3 2학기 · 고3). 묶어서 한 번에
               * 치우려면 아이의 학년이 있어야 한다.
               */
              studentGrade: st.grade || "",
            });
          }
        });
    });
  return out.sort((a, b) => b.on.localeCompare(a.on) || a.name.localeCompare(b.name, "ko"));
}

/** 배지에 적을 글자 — 「99+」 로 자른다 (세 자리가 되면 메뉴가 밀린다) */
export function badgeText(n2) {
  if (!n2 || n2 <= 0) return null;
  return n2 > 99 ? "99+" : String(n2);
}

/**
 * 배지에 붙는 말. **무엇이 남았는지 한 낱말로.**
 *
 * 원장님 (2026-08-08) — 「제목은 명사화해줘. 성적미입력」
 *
 * 「시험은 끝났는데 성적이 아직 안 들어온 학생 3명」 은 맞는 말이지만
 * 한 줄이 길어서 눈이 멈춘다. 대시보드에 열 줄이 나란히 서면 더 그렇다.
 * 명사로 끊으면 훑어진다 — 「성적 미입력 3명」.
 */
export const TODO_LABEL = {
  today: (v) => `리포트 미작성 · 단원평가 점수 미입력 ${v}건`,
  check: (v) => `숙제 검사 대기 ${v}건`,
  plan: (v) => `보강 미배정 ${v}건`,
  classes: (v) => `반 미배정 ${v}명`,
  prep: (v) => `시험범위 미등록 ${v}개`,
  scores: (v) => `성적 미입력 ${v}명`,
  tasks: (v) => `기한 지난 할일 ${v}건`,
  report: (v) => `리포트 미발송 ${v}건`,
  monthly: (v) => `월간리포트 미작성 ${v}명`,
  consult: (v) => `미처리 문의 ${v}건`,
};
