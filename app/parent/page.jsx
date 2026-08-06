import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { addDays, dowOf, longLabel, shortLabel, todaySeoul } from "@/lib/day";
import { summarize } from "@/lib/monthly";
import { threeLines, TONE_CLS, monthRange, ATT_LABEL } from "@/lib/parentView";
import { byKind, summary as scoreSummary, KIND_LABEL, findExam } from "@/lib/scores";
import { cutOf, passSummary, score } from "@/lib/wordTest";
import {
  loadReports, loadReportItems, loadHomeworkItems, loadUnitLabels,
  makeCard, pickAssigned, checkCounts,
} from "@/lib/homeworkView";
import Comments from "@/app/comments/Comments";
import RequestForm from "@/app/me/RequestForm";
import NoticePhotos from "@/components/NoticePhotos";
import DashCalendar from "@/app/DashCalendar";
import ChildPicker from "./ChildPicker";
import ChangePw from "@/app/me/ChangePw";
import Refresh from "@/components/Refresh";
import { tasksForStudent } from "@/lib/taskAudience";

export const dynamic = "force-dynamic";

const STAFF = ["principal", "instructor", "assistant"];

/**
 * 학부모 화면.
 *
 * 학생 화면(/me)과 나누는 이유 — **보는 것이 다르다.**
 *   학생   오늘 할 것. 하나씩 눌러 끝낸다
 *   학부모 지금 어떻게 하고 있나. 누르는 것은 거의 없다
 *
 * ── 전면 재검토 (원장님, 2026-08-06) ────────────────────────────
 *
 * 알림톡을 끊고 안내를 전부 앱 안으로 들였다. 그러면 **이 화면이 어머니가
 * 학원과 만나는 유일한 자리**가 된다. 그 눈으로 다시 보니 빠진 것이 많았다.
 *
 *   1. **숙제가 없었다.** 「오늘 숙제 뭐야」 는 집에서 매일 나오는 말인데
 *      아이 화면에만 있었다. 그래서 어머니는 아이 말을 믿는 수밖에 없었다.
 *   2. **오늘이 없었다.** 다음 수업이 언제인지, 오늘 애가 갔는지, 늦게 오는지 —
 *      전화로 물어보시던 것들이다.
 *   3. **수업 기록이 문자 문구 통짜였다.** 문자로 보내려고 만든 글을 그대로
 *      띄워놨다. 앱에서는 출결·점수·진도를 나눠 보여주는 편이 훨씬 빨리 읽힌다.
 *   4. **공지가 아래쪽에 흩어져 있었다.** 학생 화면은 「일정 및 전달사항」 으로
 *      묶어뒀는데 여기만 그대로였다.
 *   5. **달력에 우리 아이가 없었다.** 학원 일정만 떴다 — 수업일도 시험도
 *      결석도 없으니 어머니 입장에서는 남의 달력이다.
 *   6. **월간리포트 세 달치가 다 펼쳐져 있었다.** 스크롤이 끝없이 길었다.
 *
 * 그래서 **위에서부터 급한 순서**로 다시 세웠다.
 *   오늘 → 이번 달 → 일정·전달사항 → 숙제 → 최근 수업 → 성적 → 월간 → 달력 → 보내기
 *
 * 선생님은 ?s=학생id 로 **그대로 미리 볼 수 있다.** 학부모가 무엇을 보는지
 * 모르면 "거기 보시면 나와요" 라고 말해줄 수가 없다.
 */
export default async function ParentPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: profile, error: profErr } = await supabase
    .from("profiles").select("id, name, role, must_change_pw").eq("id", user.id).maybeSingle();
  if (profErr) {
    // 0045 전이면 비밀번호 깃발 없이
    ({ data: profile } = await supabase
      .from("profiles").select("id, name, role").eq("id", user.id).maybeSingle());
  }
  const isStaff = STAFF.includes(profile?.role);

  /**
   * **0000 인 채로는 아무것도 못 본다** (원장님, 2026-08-06).
   *
   * 첫 비번은 학생·학부모 모두 0000 이다. 학부모 아이디는 전화번호 그대로라
   * 남이 짐작하기 쉬운 만큼, 0000 을 지나칠 수 있으면 그 순간 남의 아이
   * 성적·출결이 열린다. 그래서 학생 화면(/me)과 **똑같이** 여기서도 막는다 —
   * 한쪽만 막으면 막힌 쪽에서 다른 쪽 주소를 치면 그만이다.
   */
  if (profile?.must_change_pw && !isStaff) {
    // 계정 이름은 「서은·지호 학부모」 로 지어둔다 — 그대로 부르면 「학부모 학부모님」 이 된다
    return <ChangePw name={(profile?.name || "").replace(/\s*학부모$/, "")} who="parent" />;
  }

  // 내 아이들 (형제자매가 있으면 여럿)
  let children = [];
  if (isStaff && searchParams?.s) {
    const { data } = await supabase
      .from("students").select("id, name, school, grade, school_id").eq("id", searchParams.s).maybeSingle();
    if (data) children = [data];
  } else {
    const { data: links } = await supabase
      .from("parent_student").select("student_id").eq("parent_profile_id", user.id);
    const ids = (links || []).map((l) => l.student_id);
    if (ids.length) {
      const { data } = await supabase
        .from("students").select("id, name, school, grade, school_id").in("id", ids).order("name");
      children = data || [];
    }
  }
  const preview = isStaff && !!searchParams?.s;

  if (children.length === 0) {
    return (
      <main className="wrap" style={{ maxWidth: 560 }}>
        <div className="page-head">
          <h1 className="h1">클로이영어</h1>
        </div>
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            {isStaff
              ? "학생을 골라 열어주세요. 재원생 목록에서 「학부모 화면」을 누르시면 됩니다."
              : "아직 연결된 학생이 없어요. 원장님께 연결 코드를 받아주세요."}
          </p>
        </div>
        <form action="/logout" method="post" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
        </form>
      </main>
    );
  }

  const pickId = children.find((c) => c.id === searchParams?.c)?.id || children[0].id;
  const child = children.find((c) => c.id === pickId);

  const today = todaySeoul();
  const { ym, from } = monthRange(today);

  // ── 이번 달 (달이 끝나기 전에도 지금까지를 그대로 센다) ──
  const { data: reps } = await supabase
    .from("daily_reports")
    .select("id, date, attendance_kind, word_correct, word_total, sent_correct, sent_total, notice, report_text")
    .eq("student_id", pickId)
    .gte("date", from)
    .lte("date", today)
    .order("date", { ascending: false });

  const repIds = (reps || []).map((r) => r.id);
  const { data: items } = repIds.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", repIds)
    : { data: [] };
  const itemsOf = new Map();
  (items || []).forEach((i) => {
    if (!itemsOf.has(i.daily_report_id)) itemsOf.set(i.daily_report_id, []);
    itemsOf.get(i.daily_report_id).push(i);
  });
  const withItems = (reps || []).map((r) => ({ ...r, items: itemsOf.get(r.id) || [] }));
  const sum = summarize(withItems, []);
  // 통과선은 이 학생 것 → 없으면 설정의 기본값.
  // 0070 전이면 학생별 통과선 칸이 없다 — 그때는 기본값만 쓴다.
  const { data: warnRow } = await supabase
    .from("settings").select("config").eq("key", "warning").maybeSingle();
  const { data: cutRow } = await supabase
    .from("students").select("word_cut_pct").eq("id", pickId).maybeSingle();
  const cut = cutOf(cutRow, Number(warnRow?.config?.wordPassPct) || 90);
  // 몇 번째에 통과했는지를 세려면 **날짜 오름차순**이어야 한다 (reps 는 내림차순)
  const repsAsc = [...(reps || [])].sort((a, b) => a.date.localeCompare(b.date));
  const lines = threeLines(sum, passSummary(repsAsc, cut));

  /**
   * ── 지금 나간 숙제 ────────────────────────────────────────────
   *
   * **학생 화면과 같은 값을 같은 코드로 읽는다** (lib/homeworkView).
   * 「오늘 숙제 뭐야」 에 두 화면이 다른 답을 하면 그 자리에서 다투게 된다.
   *
   * 이번 달 것(reps)과 따로 읽는 이유 — 숙제는 지난달 마지막 수업에서
   * 나갔을 수도 있다. 달을 잘라 읽으면 월초에 숙제가 통째로 사라진다.
   */
  const recent = await loadReports(supabase, pickId, today, 6);
  const dri = await loadReportItems(supabase, recent.map((r) => r.id));
  const itemById = await loadHomeworkItems(supabase);
  const unitLabel = await loadUnitLabels(supabase, dri);
  const toCard = makeCard(itemById, unitLabel);
  const { from: assignedFrom, rows: assignedRows } = pickAssigned(recent, dri);
  const homework = assignedRows.map(toCard);

  // 최근 수업 세 번 — 그날 검사 결과를 같이 붙인다
  const lessons = recent.slice(0, 3).map((r) => {
    const mine = dri.filter((x) => x.daily_report_id === r.id && x.status !== "assigned" && x.status !== "inclass");
    const month = withItems.find((w) => w.id === r.id);
    return {
      ...r,
      attendance: month?.attendance_kind || null,
      reportText: month?.report_text || null,
      check: checkCounts(mine),
      checked: mine.length,
    };
  });

  // ── 우리 아이 반 · 다음 수업 ──────────────────────────────────
  let myClasses = [];
  {
    const { data: mine } = await supabase
      .from("class_students").select("class_id").eq("student_id", pickId);
    const ids = (mine || []).map((m) => m.class_id);
    if (ids.length) {
      const { data } = await supabase
        .from("classes").select("id, name, days, start_time, end_time").in("id", ids);
      myClasses = data || [];
    }
  }
  /**
   * 다음 수업이 언제인가 — **앞으로 2주만 본다.**
   * 그 안에 없으면 요일이 안 잡혀 있는 것이라, 날짜를 지어내느니 안 적는 편이 낫다.
   */
  let nextClass = null;
  for (let i = 0; i < 15 && !nextClass; i += 1) {
    const d = addDays(today, i);
    const dow = dowOf(d);
    const hit = myClasses.filter((c) => (c.days || []).includes(dow))
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))[0];
    if (hit) nextClass = { date: d, at: (hit.start_time || "").slice(0, 5), name: hit.name || "" };
  }

  // 오늘 출결 — 어머니가 제일 자주 물으시던 것 (「갔어요?」)
  const { data: attToday } = await supabase
    .from("attendance").select("status, reason").eq("student_id", pickId).eq("date", today).maybeSingle();

  // 오늘 늦게 가나 — 남아서 채우고 갈 것이 있으면 늦어진다
  const stayQ = await supabase
    .from("stay_tasks").select("id, body, status").eq("student_id", pickId).eq("date", today);
  const stayLeft = (stayQ.error ? [] : stayQ.data || []).filter((t) => t.status === "todo");

  // ── 월간리포트 (지난달까지 나간 것) ──
  const { data: monthly } = await supabase
    .from("monthly_reports")
    .select("ym, text, sent_at")
    .eq("student_id", pickId)
    .order("ym", { ascending: false })
    .limit(3);
  const monthlyRows = (monthly || []).filter((m) => m.text);

  // ── 성적 ──
  const { data: scores } = await supabase
    .from("scores")
    .select("id, kind, taken_on, term, raw_score, full_score, grade, percentile, rank_in, rank_of, school, cuts")
    .eq("student_id", pickId)
    .order("taken_on", { ascending: false })
    .limit(30);
  const scoreGroups = byKind(scores || []);
  // 등급컷은 **회차** 것이다 (0073). 선생님 화면과 같은 컷을 봐야
  // "앱에서는 2등급이라던데요" 가 안 생긴다.
  let { data: exams } = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date, to_date, cuts");
  if (!exams) {
    ({ data: exams } = await supabase
      .from("exam_periods").select("id, school, grade, name, from_date, to_date"));
  }

  // ── 공지 ──
  const { data: rec } = await supabase
    .from("notice_receipts").select("notice_id").eq("student_id", pickId);
  const nIds = [...new Set((rec || []).map((r) => r.notice_id))];
  let notices = [];
  if (nIds.length) {
    let { data } = await supabase
      .from("notices")
      .select("id, date, kind, title, photos, body")
      .in("id", nIds)
      .gte("date", addDays(today, -21))
      .order("date", { ascending: false });
    if (!data) {
      ({ data } = await supabase
        .from("notices").select("id, date, kind, body").in("id", nIds)
        .gte("date", addDays(today, -21)).order("date", { ascending: false }));
    }
    notices = data || [];
  }

  // ── 달력 — **우리 아이 것**을 넣는다 ────────────────────────────
  //   전에는 학원 일정만 떴다. 수업일도 시험도 결석도 없으니 어머니 입장에서는
  //   남의 달력이었다. 학생 화면과 같은 것을 담는다 (수업일 · 시험 · 결석).
  const calFrom = addDays(today, -40);
  const calTo = addDays(today, 120);

  const TASK_COLS = "id, title, kind, due_on, end_on, source";
  let { data: cal, error: calErr } = await supabase
    .from("tasks")
    .select(`${TASK_COLS}, deliver_student_ids, deliver_school_id, deliver_school, deliver_grade, deliver_class_id`)
    .neq("kind", "todo")
    .gte("due_on", calFrom)
    .lte("due_on", calTo)
    .order("due_on", { ascending: true });
  if (calErr) {
    // 0077 전이면 대상 칸이 없다 — 그때는 다 보인다 (예전 그대로)
    ({ data: cal } = await supabase
      .from("tasks").select(TASK_COLS).neq("kind", "todo")
      .gte("due_on", calFrom).lte("due_on", calTo)
      .order("due_on", { ascending: true }));
  }
  // **우리 아이 것만** (0091). DB 도 같은 규칙으로 막지만, 원장님이 미리보기로
  // 보실 때는 선생님 권한이라 전부 통과한다 — 그러면 미리보기가 거짓말을 한다
  let calendar = tasksForStudent(cal || [], {
    id: pickId,
    schoolId: child.school_id || null,
    school: child.school || "",
    grade: child.grade || "",
    classIds: myClasses.map((c) => c.id),
  }).map((t) => ({
    date: t.due_on,
    endDate: t.end_on || null,
    title: t.title,
    tone: t.source === "neis" ? "school" : "event",
  }));

  // 우리 학교 · 우리 학년 시험 기간
  const examDays = [];
  {
    const q = await supabase
      .from("exam_periods")
      .select("id, school, grade, name, from_date, to_date")
      .lte("from_date", calTo)
      .gte("to_date", calFrom);
    (q.error ? [] : q.data || [])
      // 학교·학년이 비어 있는 것은 「전체」 로 본다 — 빼면 아무것도 안 보인다
      .filter((e) => (!e.school || e.school === child.school))
      .filter((e) => (!e.grade || e.grade === child.grade))
      .forEach((e) =>
        examDays.push({
          date: e.from_date, endDate: e.to_date || null,
          title: e.name || "시험", tone: "exam",
        })
      );
  }

  // 수업일 — 반 요일로 찍는다
  const classDays = [];
  if (myClasses.length > 0) {
    const label = (c) =>
      c.start_time ? `수업 ${c.start_time.slice(0, 5)}` : `수업${c.name ? ` ${c.name}` : ""}`;
    for (let d = calFrom; d <= calTo; d = addDays(d, 1)) {
      const dow = dowOf(d);
      myClasses.filter((c) => (c.days || []).includes(dow))
        .forEach((c) => classDays.push({ date: d, title: label(c), tone: "klass" }));
    }
  }

  // 결석 · 보강 — 지나간 것도 남긴다 (보강으로 채운 날이 보여야 한다)
  const attDays = [];
  {
    const q = await supabase
      .from("attendance").select("date, status")
      .eq("student_id", pickId).gte("date", calFrom).lte("date", calTo);
    const LABEL = { absent: "결석", makeup: "보강", late: "지각", online: "온라인" };
    (q.error ? [] : q.data || [])
      .filter((a) => LABEL[a.status])
      .forEach((a) => attDays.push({ date: a.date, title: LABEL[a.status], tone: "absent" }));
  }
  // 내 것을 앞에 둔다 — 달력 한 칸에 두 개까지만 보인다
  calendar = [...attDays, ...examDays, ...classDays, ...calendar];

  /**
   * ── 일정 및 전달사항 — 한 덩어리로 ────────────────────────────
   * 학생 화면과 같은 방식이다. 다가오는 것만, 몇 개만.
   * 지난 것까지 쌓이면 오늘 알아야 할 것이 안 보인다.
   */
  const upcoming = [...examDays, ...calendar.filter((c) => c.tone === "school" || c.tone === "event")]
    .filter((c) => (c.endDate || c.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  // 내가 보낸 것
  const REQ = "id, kind, from_date, to_date, body, status, reply";
  let { data: myReqs } = await supabase
    .from("requests").select(`${REQ}, photos`).eq("student_id", pickId)
    .order("created_at", { ascending: false }).limit(5);
  if (!myReqs) {
    ({ data: myReqs } = await supabase
      .from("requests").select(REQ).eq("student_id", pickId)
      .order("created_at", { ascending: false }).limit(5));
  }

  const latest = withItems[0] || null;
  const hasToday = !!nextClass && nextClass.date === today;

  return (
    <main className="wrap" style={{ maxWidth: 560, paddingBottom: 40 }}>
      {preview && (
        <div className="card card-tight" style={{ marginBottom: 10, borderLeft: "3px solid var(--amber)" }}>
          <b style={{ fontSize: 13 }}>미리보기</b>
          <p className="hint" style={{ margin: "2px 0 0" }}>
            {child.name} 학부모님이 보는 화면 그대로입니다. 여기서 누르는 것은 기록되지 않아요.
          </p>
        </div>
      )}

      <div className="page-head">
        <p className="eyebrow">클로이영어</p>
        <h1 className="h1">{child.name} 학생</h1>
        <p className="sub">
          {[child.school, child.grade].filter(Boolean).join(" ")}
          {recent[0] ? ` · 최근 수업 ${longLabel(recent[0].date)}` : ""}
        </p>
      </div>

      {/* 홈 화면에 담은 앱에는 주소창이 없다 — 여기 없으면 새로고침할 방법이 없다 */}
      {!preview && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Refresh />
        </div>
      )}

      {children.length > 1 && <ChildPicker children={children} pick={pickId} />}

      <div className="stack" style={{ marginTop: 10 }}>
        {/* ── 1. 오늘 ────────────────────────────────────────────
            어머니가 전화로 물으시던 것들이다 — 다음 수업이 언제인지,
            오늘 갔는지, 늦게 오는지. 물어보지 않아도 되게 맨 위에 둔다. */}
        {(nextClass || attToday || stayLeft.length > 0) && (
          <div className="card sect sect-info">
            <h2 className="secthead">오늘</h2>
            <div className="stack" style={{ gap: 6 }}>
              {hasToday ? (
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="plabel" style={{ width: 62 }}>오늘 수업</span>
                  <span style={{ fontSize: 13.5 }}>
                    {nextClass.at ? `${nextClass.at} 시작` : "수업일"}
                  </span>
                  {attToday ? (
                    <span className={`tag ${attToday.status === "absent" ? "tag-red" : "tag-mint"}`}>
                      {ATT_LABEL[attToday.status] || attToday.status}
                    </span>
                  ) : (
                    <span className="tag tag-muted">아직 출결 전</span>
                  )}
                </div>
              ) : nextClass ? (
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="plabel" style={{ width: 62 }}>다음 수업</span>
                  <span style={{ fontSize: 13.5 }}>
                    {longLabel(nextClass.date)}
                    {nextClass.at ? ` ${nextClass.at}` : ""}
                  </span>
                </div>
              ) : null}

              {/* 오늘 수업일이 아닌데 출결이 찍혔으면 보강이다 — 그것도 알려드린다 */}
              {!hasToday && attToday && (
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="plabel" style={{ width: 62 }}>오늘</span>
                  <span className={`tag ${attToday.status === "absent" ? "tag-red" : "tag-mint"}`}>
                    {ATT_LABEL[attToday.status] || attToday.status}
                  </span>
                  {attToday.reason && (
                    <span className="hint" style={{ fontSize: 12.5 }}>{attToday.reason}</span>
                  )}
                </div>
              )}

              {stayLeft.length > 0 && (
                <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span className="plabel" style={{ width: 62 }}>하원</span>
                  <span style={{ fontSize: 13.5, flex: 1 }}>
                    오늘은 <b>남아서 채우고</b> 갑니다 — {stayLeft.map((t) => t.body).join(" · ")}
                    <br />
                    <span className="hint">평소보다 늦게 갈 수 있어요.</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 2. 이번 달 현황 ────────────────────────────────────
            학생 화면과 **같은 숫자**다 (lib/monthly 의 summarize).
            집에서 "이번 달 어땠어?" 를 물을 때 둘이 같은 것을 보게 된다. */}
        <div className="card">
          <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              이번 달 현황 ({Number(ym.slice(5, 7))}월)
            </h2>
            <span className="hint">수업 {withItems.length}회</span>
          </div>
          <p className="hint" style={{ margin: "2px 0 10px", fontSize: 11.5 }}>
            달이 끝나기 전에도 <b>지금까지</b>를 그대로 세어 보여드립니다.
            아이 화면에도 <b>같은 숫자</b>가 보입니다.
          </p>

          {withItems.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              이번 달은 아직 수업 기록이 없어요.
            </p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {lines.map((l) => (
                <div className="row" key={l.key} style={{ gap: 8, alignItems: "baseline" }}>
                  <b style={{ fontSize: 13, minWidth: 62 }}>{l.label}</b>
                  <span className={`tag ${TONE_CLS[l.tone]}`}>{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 3. 일정 및 전달사항 — 한 덩어리로 ──────────────────
            전에는 공지가 화면 아래쪽에 있었다. 알림톡을 끊었으니 이제
            이 자리가 학원에서 오는 말이 닿는 유일한 곳이다 — 위로 올린다. */}
        {(upcoming.length > 0 || notices.length > 0) && (
          <div className="card">
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>일정 및 전달사항</h2>

            {upcoming.length > 0 && (
              <div className="stack" style={{ gap: 4, marginBottom: notices.length ? 14 : 0 }}>
                {upcoming.map((c, i) => (
                  <div className="unitrow" key={`${c.date}-${i}`}>
                    <span className="hint" style={{ minWidth: 74 }}>
                      {shortLabel(c.date)}
                      {c.endDate && c.endDate !== c.date ? " ~" : ""}
                    </span>
                    <span style={{ fontSize: 13.5, flex: 1 }}>{c.title}</span>
                    {c.tone === "exam" && <span className="tag tag-red">시험</span>}
                    {c.tone === "school" && <span className="tag tag-sky">학교</span>}
                  </div>
                ))}
              </div>
            )}

            {notices.length > 0 && (
              <div className="stack" style={{ gap: 12 }}>
                {notices.map((n) => (
                  <div key={n.id} className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                      <span className="hint">{shortLabel(n.date)}</span>
                      {n.title && <b style={{ fontSize: 14 }}>{n.title}</b>}
                    </div>
                    {n.body && n.body !== n.title && (
                      <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{n.body}</div>
                    )}
                    <NoticePhotos noticeId={n.id} photos={n.photos || []} readOnly />
                  </div>
                ))}
              </div>
            )}

            {upcoming.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>앞으로 잡힌 일정이 없어요.</p>
            )}
          </div>
        )}

        {/* ── 4. 지금 나간 숙제 ──────────────────────────────────
            「오늘 숙제 뭐야」 는 집에서 매일 나오는 말이다. 전에는 아이
            화면에만 있어서 어머니는 아이 말을 믿는 수밖에 없었다.

            **여기서는 누를 것이 없다.** 체크도 타이머도 아이 화면 것이다 —
            두 군데서 체크하면 두 군데가 반드시 어긋난다. */}
        <div className="card">
          <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              지금 나간 숙제 {homework.length > 0 && <span className="tag tag-lav">{homework.length}</span>}
            </h2>
            {assignedFrom && <span className="hint">{shortLabel(assignedFrom.date)} 수업에서</span>}
          </div>

          {homework.length === 0 ? (
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 13.5 }}>
              지금 나간 숙제가 없어요. 수업에서 다음 숙제를 정하면 여기에 뜹니다.
            </p>
          ) : (
            <>
              <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                {homework.map((c) => (
                  <div key={c.key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 13, lineHeight: 1.6 }}>☐</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.6, flex: 1 }}>
                      {c.name}
                      {c.units.length > 0 && <> — {c.units.join(", ")}</>}
                      {c.note && <> {c.note}</>}
                      {c.changedAt && (
                        <span className="tag tag-amber" style={{ marginLeft: 4, fontSize: 10.5 }}>
                          바뀜
                        </span>
                      )}
                      {c.doneAt && (
                        <span className="tag tag-mint" style={{ marginLeft: 4, fontSize: 10.5 }}>
                          아이가 완료 표시
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <p className="hint" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
                아이 화면에 뜨는 것과 <b>같은 목록</b>입니다.
                <b> 완료 표시</b>는 아이가 직접 누른 것이고, 실제 검사는 다음 수업에서 합니다.
                {homework.some((c) => c.changedAt) && (
                  <> <b>바뀜</b> 은 선생님이 나중에 더하거나 고치신 것이에요.</>
                )}
              </p>
            </>
          )}
        </div>

        {/* ── 5. 최근 수업 ───────────────────────────────────────
            전에는 문자로 보내려고 만든 글을 통째로 띄웠다. 앱에서는
            출결·점수·진도를 나눠 보여주는 편이 훨씬 빨리 읽힌다.
            원장님이 쓰신 글 전문은 접어두고, 보고 싶으실 때 펴신다. */}
        {lessons.length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>최근 수업</h2>
            <div className="stack" style={{ gap: 14 }}>
              {lessons.map((r) => (
                <div key={r.id} className="stack" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13.5 }}>{longLabel(r.date)}</b>
                    {r.attendance && (
                      <span className={`tag ${r.attendance === "absent" ? "tag-red" : "tag-mint"}`}>
                        {ATT_LABEL[r.attendance] || r.attendance}
                      </span>
                    )}
                    {r.checked > 0 && (
                      <span className="hint" style={{ fontSize: 12 }}>
                        숙제 검사 {[
                          r.check.done ? `완료 ${r.check.done}` : null,
                          r.check.weak ? `보충 ${r.check.weak}` : null,
                          r.check.missing ? `미완료 ${r.check.missing}` : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>

                  <div className="stack" style={{ gap: 3 }}>
                    {r.word_total ? (
                      <div className="row" style={{ gap: 8 }}>
                        <span className="plabel" style={{ width: 46 }}>단어</span>
                        <span style={{ fontSize: 13 }}>{score(r.word_correct, r.word_total)}</span>
                      </div>
                    ) : null}
                    {r.sent_total ? (
                      <div className="row" style={{ gap: 8 }}>
                        <span className="plabel" style={{ width: 46 }}>문법</span>
                        <span style={{ fontSize: 13 }}>{score(r.sent_correct, r.sent_total)}</span>
                      </div>
                    ) : null}
                    {r.own_progress ? (
                      <div className="row" style={{ gap: 8 }}>
                        <span className="plabel" style={{ width: 46 }}>진도</span>
                        <span style={{ fontSize: 13 }}>{r.own_progress}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* 선생님이 그날 학부모께 적으신 말 — 있으면 그게 제일 중요하다 */}
                  {r.notice && (
                    <div className="notice" style={{ fontSize: 13 }}>{r.notice}</div>
                  )}

                  {/* 원장님이 쓰신 리포트 전문. 길어서 접어둔다 */}
                  {r.reportText && (
                    <details>
                      <summary className="hint" style={{ cursor: "pointer", fontSize: 12.5 }}>
                        이 날 리포트 전문 보기
                      </summary>
                      <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 6 }}>
                        {r.reportText}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 6. 성적 ── */}
        {(scores || []).length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>성적</h2>
            <div className="stack" style={{ gap: 10 }}>
              {["school", "mock", "unit"].map((k) => {
                const list = scoreGroups[k] || [];
                if (list.length === 0) return null;
                return (
                  <div key={k}>
                    <b style={{ fontSize: 13 }}>{KIND_LABEL[k]}</b>
                    <div className="stack" style={{ gap: 3, marginTop: 4 }}>
                      {list.slice(0, 4).map((s) => (
                        <div className="unitrow" key={s.id}>
                          <span className="hint" style={{ minWidth: 68 }}>
                            {s.taken_on ? s.taken_on.slice(2).replaceAll("-", ".") : ""}
                          </span>
                          <b style={{ fontSize: 12.5, minWidth: 110 }}>{s.term || ""}</b>
                          <span style={{ fontSize: 12.5, flex: 1 }}>
                            {scoreSummary(s, findExam(s, exams || [], child))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 7. 월간리포트 — 최근 것만 펴둔다 ────────────────────
            세 달치를 다 펼쳐놓으니 스크롤이 끝없이 길었다. 지난달 것은
            다시 읽으실 일이 드물다 — 접어두고 필요할 때 펴신다. */}
        {monthlyRows.length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>월간리포트</h2>
            <div className="stack" style={{ gap: 12 }}>
              {monthlyRows.map((m, i) => (
                <details key={m.ym} open={i === 0}>
                  <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>
                    {m.ym.replace("-", "년 ")}월
                  </summary>
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 6 }}>{m.text}</div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* ── 8. 달력 ── */}
        {calendar.length > 0 && (
          <DashCalendar ym={ym} items={calendar} today={today} links={false} />
        )}

        {/* ── 9. 보내기 · 남기실 말씀 ────────────────────────────
            알림톡을 끊었으니 **여기가 학원에 말을 거는 자리**다.
            아래쪽에 두되, 무엇을 하는 자리인지 한 줄 적어둔다. */}
        {!preview && (
          <>
            <RequestForm studentId={pickId} mine={myReqs || []} />
            <p className="hint" style={{ margin: "-4px 2px 0", lineHeight: 1.7 }}>
              결석 · 보강 · 그 밖의 말씀은 여기로 보내주시면 선생님이 확인합니다.
              전화 주셔도 되지만, 여기로 보내주시면 <b>기록이 남아</b> 빠뜨리지 않습니다.
            </p>
          </>
        )}

        {latest && (
          <div className="card">
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>남기실 말씀</h2>
            <p className="hint" style={{ margin: "0 0 8px" }}>
              최근 수업({longLabel(latest.date)})에 대해 궁금한 것을 남기시면 선생님이 답합니다.
            </p>
            <Comments reportId={latest.id} studentId={pickId} me={preview ? "staff" : "parent"} />
          </div>
        )}

        {preview ? (
          <Link className="btn btn-ghost btn-block" href="/students">재원생으로 돌아가기</Link>
        ) : (
          <form action="/logout" method="post">
            <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
          </form>
        )}
      </div>
    </main>
  );
}
