import { sessionUser } from "@/lib/session";
import PendingGate from "./PendingGate";
import { missingScores } from "@/lib/menuBadges";
import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { showsTo } from "@/lib/notices";
import { redirect } from "next/navigation";
import AlertGate from "./AlertGate";
import AlertBox from "@/components/AlertBox";
import InstallHint from "./InstallHint";
import { score, cutOf, passSummary } from "@/lib/wordTest";
import { summarize } from "@/lib/monthly";
import { threeLines, TONE_CLS, monthRange } from "@/lib/parentView";
import StudyTabs from "./StudyTabs";
import ArrivalCard from "./ArrivalCard";
import StateCard from "./StateCard";
import { trend, avgSeconds } from "@/lib/trend";
import { headers } from "next/headers";
import { pickIp, sameNet } from "@/lib/clientIp";
import { pct } from "@/lib/wordTest";
import HomeworkCards from "./HomeworkCards";
import HomeworkSheet from "./HomeworkSheet";
import Comments from "@/app/comments/Comments";
import { STAY_LABEL } from "@/lib/reportText";
import RequestForm from "./RequestForm";
import LeaveCard from "./LeaveCard";
import TryoutBar from "./TryoutBar";
import LinkCode from "./LinkCode";
import ChangePw from "./ChangePw";
import DictBar from "./DictBar";
import MyScoreForm from "./MyScoreForm";
import GrowthCard from "@/components/GrowthCard";
import UnitCard from "@/components/UnitCard";
import { oneRound, stack } from "@/lib/report";
import { KIND_LABEL as SCORE_KIND } from "@/lib/scores";
import { addDays, longLabel as fmtLong, todaySeoul } from "@/lib/day";
import NoticePhotos from "@/components/NoticePhotos";
import VideoList from "./VideoList";
import DashCalendar from "@/app/DashCalendar";
import Refresh from "@/components/Refresh";
import { loadStudentCalendar } from "@/lib/studentCalendar";
import { loadClassesWithTerm } from "@/lib/classTerm";
import { loadNotes, noteOr } from "@/lib/screenNotes";
import { loadLayouts, arrange } from "@/lib/screenLayout";
import ScreenNote from "@/components/ScreenNote";
import { cleanNote, cleanTitle } from "@/lib/note";
import { fetchAll } from "@/lib/fetchAll";
import NoticeDismiss from "@/components/NoticeDismiss";
// 이 화면은 「선생님인가」 를 boolean 으로 들고 다닌다 — 이름이 겹쳐 딴 이름으로 불러온다
import { isStaff as isStaffRole } from "@/lib/roles";
import SectionNav from "@/components/SectionNav";
import NoticeGate from "@/components/NoticeGate";
import {
  loadReports, loadReportItems, loadHomeworkItems, loadUnitLabels, makeCard, pickAssigned,
} from "@/lib/homeworkView";

export const dynamic = "force-dynamic";

const dayLabel = fmtLong;

export default async function MePage({ searchParams }) {
  const supabase = createClient();
  const user = await sessionUser(supabase);
  if (!user) redirect("/login");

  let { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, name, role, must_change_pw")
    .eq("id", user.id)
    .single();
  if (profErr) {
    // 0045 전이면 비밀번호 깃발 없이
    ({ data: profile } = await supabase
      .from("profiles").select("id, name, role").eq("id", user.id).single());
  }

  // 학생 본인 (학부모 계정이면 자녀 중 첫 명)
  let { data: student } = await supabase
    .from("students")
    .select("id, name, school, grade, school_id, word_when")
    .eq("profile_id", user.id)
    .maybeSingle();

  // 선생님이 학생 화면을 그대로 보는 미리보기 (?s=학생id)
  //   아이가 무엇을 보는지 모르면 "저기 눌러" 라고 말해줄 수가 없다.
  //   보기만 하고 누르지는 못한다 — 선생님이 대신 눌러버리면 기록이 거짓이 된다.
  const isStaff = isStaffRole(profile?.role);
  const previewId = isStaff ? searchParams?.s : null;
  if (previewId) {
    const { data: s2 } = await supabase
      .from("students")
      .select("id, name, school, grade, school_id, word_when")
      .eq("id", previewId)
      .maybeSingle();
    if (s2) student = s2;
  }
  // 보기만 할 것인가, 직접 눌러볼 것인가 (?s=학생id&try=1)
  //   앱을 나눠주기 전에 원장님이 먼저 눌러봐야 한다. 타이머가 어떻게 도는지,
  //   학습완료를 누르면 오늘 수업에 어떻게 뜨는지는 눌러봐야 안다.
  const trying = !!(previewId && searchParams?.try);
  const preview = !!(previewId && student) && !trying;
  const acting = !!(previewId && student) && trying;

  if (!student) {
    const { data: link } = await supabase
      .from("parent_student")
      .select("student_id")
      .eq("parent_profile_id", user.id)
      .limit(1)
      .maybeSingle();
    if (link) {
      const { data: s } = await supabase
        .from("students")
        .select("id, name, school, grade, school_id")
        .eq("id", link.student_id)
        .maybeSingle();
      student = s;
    }
  }

  // 댓글에 붙일 내 역할 (학생 본인인지 학부모인지)
  const myRole =
    profile?.role === "student" ? "student"
    : profile?.role === "parent" ? "parent"
    : "staff";

  // 처음 들어왔거나 선생님이 되돌렸으면 비밀번호부터 정한다 (0000 인 채로 두면 안 된다)
  if (profile?.must_change_pw && !isStaff) return <ChangePw name={student?.name} />;

  // 가입은 했는데 아직 어느 학생인지 모르는 계정 → 연결 코드를 받는다
  if (!student && !isStaff) return <LinkCode />;

  if (!student) {
    return (
      <main className="wrap" style={{ maxWidth: 560 }}>
        <div className="page-head">
          <h1 className="h1">클로이영어</h1>
        </div>
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            이 화면은 학생용이에요. 선생님 화면은 위 메뉴에서 볼 수 있습니다.
          </p>
        </div>
        {/* **여기서 나갈 길이 없었다** (원장님, 2026-08-07 — 「원장아이디로
            학생용페이지 접속했을때 로그아웃 가능하게해줘」).
            이 화면에는 위 메뉴가 없다. 학생 계정이 안 붙은 채로 들어오면
            주소를 직접 고치는 것 말고는 나갈 방법이 없었다 —
            홈 화면에 담아 여신 경우에는 주소창조차 없다. */}
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <a className="btn btn-ghost" href="/">대시보드로</a>
          <form action="/logout" method="post">
            <button className="btn btn-ghost" type="submit">로그아웃</button>
          </form>
        </div>
      </main>
    );
  }

  // 가장 최근 수업의 리포트 = 지금 해야 할 숙제가 담긴 곳.
  //   읽는 코드는 lib/homeworkView 한 곳에 있다 — 학부모 화면이 같은 숙제를
  //   보여줘야 하기 때문이다. 두 군데서 읽으면 두 화면이 어긋난다.
  const todayStr = todaySeoul();

  /**
   * **파도** (속도 대원칙 — 원칙 6). 이 화면은 아이 폰에서 매일 열리는데
   * 서버 조회 마흔한 개를 한 줄씩 기다리고 있었다 — 원장님 화면들과 같은
   * 병이 학생 화면에 제일 크게 남아 있었다. student.id 만 있으면 되는
   * 것들을 전부 한 층으로 보낸다.
   */
  const sid = student.id;
  const { ym: myYm, from: myFrom } = monthRange(todayStr);
  const [
    reports, subQ, reqQ1, stayQ, aq, attq, mineQ, nq, sessQ,
    monthRepsQ, myWarnQ, myCutQ, pastQ, recQ, asgQ, seenQ, guidesQ,
    notes, layouts, scoresQ, specQ, stateQ, itemById,
  ] = await Promise.all([
    loadReports(supabase, sid, todayStr, 6),
    supabase
      .from("homework_submissions")
      .select("id, kind, path, body, seconds, checked_at, created_at, homework_item_id, report_item_id")
      .eq("student_id", sid)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("requests")
      .select("id, kind, from_date, to_date, body, status, reply, thread, canceled_at, handled_at, photos, created_at")
      .eq("student_id", sid)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("stay_tasks")
      .select("id, date, body, status")
      .eq("student_id", sid)
      .order("date", { ascending: false })
      .limit(20),
    supabase
      .from("arrival_checks")
      .select("phone_at, attend_at, homework_at, leave_at")
      .eq("student_id", sid)
      .eq("date", todayStr)
      .maybeSingle(),
    supabase
      .from("attendance")
      .select("status")
      .eq("student_id", sid)
      .eq("date", todayStr)
      .maybeSingle(),
    supabase.from("class_students").select("class_id").eq("student_id", sid),
    supabase.from("academy_net").select("ip"),
    supabase
      .from("study_sessions")
      .select("id, homework_item_id, stay_task_id, started_at, ended_at, seconds")
      .eq("student_id", sid)
      .eq("date", todayStr),
    supabase
      .from("daily_reports")
      .select("id, date, attendance_kind, word_correct, word_total, sent_correct, sent_total")
      .eq("student_id", sid)
      .gte("date", myFrom)
      .lte("date", todayStr),
    supabase.from("settings").select("config").eq("key", "warning").maybeSingle(),
    supabase.from("students").select("word_cut_pct, word_test_count").eq("id", sid).maybeSingle(),
    supabase
      .from("study_sessions")
      .select("homework_item_id, seconds, date")
      .eq("student_id", sid)
      .lt("date", todayStr)
      .not("seconds", "is", null)
      .order("date", { ascending: false })
      .limit(300),
    supabase.from("notice_receipts").select("notice_id, read_stamp").eq("student_id", sid),
    supabase.from("video_assignments").select("video_id, due_on, assigned_on").eq("student_id", sid),
    supabase.from("video_views").select("video_id, done_at, opened_at").eq("student_id", sid),
    supabase
      .from("class_guides")
      .select("id, title, url, note")
      .eq("active", true)
      .order("sort", { ascending: true }),
    loadNotes(supabase),
    loadLayouts(supabase),
    supabase
      .from("scores")
      .select("id, kind, term, taken_on, raw_score, source")
      .eq("student_id", sid)
      .in("kind", ["mock", "school", "unit"])
      .order("taken_on", { ascending: false })
      .limit(30),
    supabase
      .from("exam_spec_rows")
      .select("kind, no, area, topic, detail")
      .order("no", { ascending: true }),
    /**
     * **오늘 것만** (원장님 2026-08-23 — 「테스트하느라 몇 일 몇 주 전에
     * 누른 게 아직도 눌려 있어」).
     *
     * 선생님 부르기는 **그날의 일**이다. 원장님 화면은 이미 날짜로 거르는데
     * (app/today/page.jsx) 아이 화면만 안 걸러서, 지난달에 누른 「질문
     * 있어요」 가 오늘도 켜진 채로 보였다. 아이는 자기가 부른 줄 알고
     * 기다리고, 선생님 화면엔 아무것도 없다.
     */
    supabase
      .from("student_activity")
      .select("state, updated_at")
      .eq("student_id", sid)
      .eq("date", todayStr)
      .maybeSingle(),
    loadHomeworkItems(supabase),
  ]);

  // 내가 낸 숙제 (0044 전이면 빈 값 — 화면은 그대로 뜬다)
  const { data: subRows } = subQ;
  const subs = {};
  (subRows || []).forEach((x) => {
    const k = x.report_item_id || x.homework_item_id;
    if (!k) return;
    (subs[k] = subs[k] || []).push(x);
  });

  const latest = reports?.[0] || null;
  const reportIds = (reports || []).map((r) => r.id);

  const dri = await loadReportItems(supabase, reportIds);
  const unitLabel = await loadUnitLabels(supabase, dri);
  const toCard = makeCard(itemById, unitLabel);

  // 지금 해야 할 숙제 = **가장 최근에 배정한 것** (까닭은 lib/homeworkView 에)
  const { from: assignedFrom, rows: assignedRows } = pickAssigned(reports, dri);
  const todo = assignedRows.map(toCard);

  /**
   * **답지 표시** (0148, 원장님 2026-08-22 — 「답지 없으면 그냥 제출까지,
   * 답지 있으면 채점하라는 메시지까지 나오기」). 지금 숙제(배정일)에 답지가
   * 있는지 · 열렸는지만 본다. 학생 눈에는 열리기 전 줄이 안 보여서(RLS)
   * 직접 조회만으로는 「제출하면 열려요」 힌트를 못 띄운다 — 있고 없음만
   * 내주는 my_answer_flags 와 합쳐 본다 (체험 모드는 직접 조회로 다 보인다).
   * 0148 전 DB 면 조용히 빈다 — 답지 없는 숙제는 지금 그대로 아무 표시 없음.
   */
  const answers = {};   // itemId → { opened }
  if (assignedFrom?.date) {
    const [directQ, flagsQ] = await Promise.all([
      supabase
        .from("answer_files")
        .select("homework_item_id, opened_at")
        .eq("student_id", sid)
        .eq("date", assignedFrom.date),
      supabase.rpc("my_answer_flags", { d: assignedFrom.date }),
    ]);
    (directQ.error ? [] : directQ.data || []).forEach((a) => {
      answers[a.homework_item_id] = { opened: !!a.opened_at };
    });
    (flagsQ.error ? [] : flagsQ.data || []).forEach((a) => {
      if (!answers[a.homework_item_id]) answers[a.homework_item_id] = { opened: !!a.opened };
    });
  }

  /**
   * **팝업 재료** (원장님 — 「성적 미입력 시, 숙제 미제출 시 학생에게 팝업
   * 계속」). 안 낸 숙제 = 배정됐는데 완료를 안 누른 것. 적어야 할 시험 =
   * 내 학교 시험이 끝났는데 점수를 안 적은 것 (성장 화면과 같은 규칙 —
   * lib/menuBadges missingScores 한 벌). 시험 조회가 막히면 조용히 빈다.
   */
  const pendingHw = todo.filter((c) => !c.doneAt).map((c) => c.name);
  let pendingScores = [];
  const gDay = todaySeoul();   // 아래 today 는 한참 뒤에 선언된다 (TDZ)
  try {
    const [pgExamsQ, pgScoresQ, pgSkipsQ] = await Promise.all([
      supabase
        .from("exam_periods")
        .select("id, school, grade, name, neis_name, english_on, hidden")
        .gte("english_on", addDays(gDay, -35))
        .lte("english_on", gDay),
      supabase
        .from("scores")
        .select("student_id, taken_on, exam_id")
        .eq("student_id", student.id)
        .eq("kind", "school")
        .gte("taken_on", addDays(gDay, -70)),
      supabase.from("exam_skips").select("student_id, exam_id").eq("student_id", student.id),
    ]);
    if (!pgExamsQ.error) {
      const hidden = new Set((pgExamsQ.data || []).filter((e) => e.hidden).map((e) => e.id));
      const skips = new Set((pgSkipsQ.data || []).map((r) => `${r.student_id}|${r.exam_id}`));
      pendingScores = missingScores({
        exams: pgExamsQ.data || [],
        students: [student],
        scores: pgScoresQ.error ? [] : pgScoresQ.data || [],
        hidden,
        skips,
        today: gDay,
      }).map((m) => m.examName);
    }
  } catch { /* 시험 표를 못 읽는 계정 — 팝업만 조용히 빈다 */ }

  // 지난 수업 검사 결과
  const checked = latest
    ? dri.filter((x) => x.daily_report_id === latest.id && x.status !== "assigned").map(toCard)
    : [];

  // 내가 보낸 요청
  // 오간 말·취소는 0108 에서 붙는다. 없으면 그 아래에서 한 칸씩 물러난다 —
  // 한 칸 때문에 「보낸 것」 목록이 통째로 안 보이면 안 된다
  const REQ = "id, kind, from_date, to_date, body, status, reply, thread, canceled_at, handled_at, created_at";
  const REQ0 = "id, kind, from_date, to_date, body, status, reply";
  let { data: myRequests, error: reqErr } = reqQ1;
  if (reqErr) {
    // 0108 전이면 오간 말 칸이 없다
    ({ data: myRequests, error: reqErr } = await supabase
      .from("requests")
      .select(`${REQ0}, photos`)
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(5));
  }
  if (reqErr) {
    // 0068 전이면 사진도 없이
    ({ data: myRequests } = await supabase
      .from("requests")
      .select(REQ0)
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(5));
  }

  // 늦귀가 과제 — 아직 안 끝났거나 숙제로 넘어온 것 (파도)
  const stay = (stayQ.error ? [] : stayQ.data || []).filter(
    (t) => t.status === "todo" || t.status === "moved"
  );
  // 아직 손 안 댄 늦귀가 과제 — 이게 남아 있으면 집에 간 게 아니다
  const stayLeft = (stayQ.error ? [] : stayQ.data || []).filter((t) => t.status === "todo");

  // 오늘 등원 체크 — 학생이 직접 누른 것
  const todayRep = (reports || []).find((r) => r.date === todaySeoul()) || null;
  // 0150 전 DB 는 leave_at 칸이 없어 조회가 통째로 실패한다 — 그러면 등원
  // 카드까지 빈 채로 떠서 아이가 처음부터 다시 누르게 된다. 없이 한 번 더.
  let arrivalQ = aq;
  if (aq.error && (aq.error.code === "42703" || aq.error.code === "PGRST204")) {
    arrivalQ = await supabase
      .from("arrival_checks")
      .select("phone_at, attend_at, homework_at")
      .eq("student_id", student.id)
      .eq("date", todayStr)
      .maybeSingle();
  }
  const arrival = arrivalQ.error ? {} : arrivalQ.data || {};

  // 지금 등원 중인가.
  //   등원 중이면 화면은 **등원 중 할 일**로 열려야 한다. 집 숙제를 먼저
  //   펼쳐놓으면 아이가 학원에서 집 숙제를 하고 앉아 있는다.
  //   출석 체크를 눌렀거나, 선생님이 오늘 출결을 찍었으면 등원으로 본다.
  const attToday = attq.error ? null : attq.data?.status || null;
  const cameToday =
    !!arrival.attend_at || ["present", "late", "makeup", "online"].includes(attToday);

  // 오늘 이 학생 수업이 몇 시에 끝나나 — 하원했는지 판단하는 기준
  const dowNow = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(`${todaySeoul()}T00:00:00Z`).getUTCDay()
  ];
  let classEnd = null;
  // 내 반 — 하원 시각을 재는 데도 쓰고, 아래 달력에 **수업일**을 찍는 데도 쓴다
  let myClasses = [];
  {
    const { data: mine } = mineQ;
    const ids = (mine || []).map((m) => m.class_id);
    if (ids.length) {
      // **기간 칸을 꼭 같이 읽는다.** 안 읽으면 종강한 특강의 회차가
      // 내 달력에 영원히 찍힌다 (2026-08-06 — 「화목1특강이 8월 11일까지인데
      // 일정에 8월 이후에도 계속 수업이 있는 걸로 나와」)
      myClasses = await loadClassesWithTerm(
        supabase, "id, name, days, start_time, end_time", ids
      );
      myClasses
        .filter((c) => (c.days || []).includes(dowNow) && c.end_time)
        .forEach((c) => {
          const t = c.end_time.slice(0, 5);
          if (!classEnd || t > classEnd) classEnd = t;
        });
    }
  }

  /**
   * 집에 갔는가.
   *
   * 두 가지가 **모두** 되어야 하원이다.
   *   1. 수업 시간이 끝났고
   *   2. 늦귀가 과제가 남아 있지 않다
   *
   * 남아서 채우고 갈 것이 있으면 수업이 끝나도 아직 학원이다.
   * 그래서 하원 후 숙제를 펼치면 안 된다 — 그걸 붙잡고 있으면
   * 정작 남아서 해야 할 것을 안 한다.
   */
  const nowHM = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit",
  }).format(new Date());
  const classOver = !classEnd || nowHM >= classEnd;
  const wentHome = classOver && stayLeft.length === 0;
  const atClass = cameToday && !wentHome;

  // 학원에서 열었나 — 아니면 등원 체크 버튼을 잠근다
  const allowedIps = (nq.error ? [] : nq.data || []).map((x) => x.ip);
  const atAcademy = sameNet(pickIp(headers()), allowedIps);
  const wordWhen = todayRep?.word_when || student.word_when || "start";

  // ── 오늘 할 것 (순서대로) ────────────────────────────────
  // 배정된 숙제 + 늦귀가 과제를 학습 항목 순서로 늘어놓는다.
  // 학생이 "뭐부터 하지?" 를 묻지 않아도 되게 하려는 것이다.
  const today = todaySeoul();
  let sessions = [];
  let timerReady = true;
  if (sessQ.error) timerReady = false;
  else sessions = sessQ.data || [];
  const secOf = new Map();
  let running = null;
  sessions.forEach((x) => {
    const key = x.stay_task_id ? `stay-${x.stay_task_id}` : `item-${x.homework_item_id}`;
    secOf.set(key, (secOf.get(key) || 0) + (x.seconds || 0));
    // 어느 항목이 돌고 있나 — **id 로** 들고 간다.
    //   예전에는 화면 카드의 key 와 맞춰봤는데, 카드 key 는
    //   "리포트id-항목id-상태" 라서 절대 같아질 수가 없었다.
    //   그래서 타이머가 돌아도 화면에 시간이 안 떴다.
    if (!x.ended_at) {
      running = {
        key,
        itemId: x.homework_item_id || null,
        stayId: x.stay_task_id || null,
        started_at: x.started_at,
      };
    }
  });

  // ── 이번 달 누적 ──────────────────────────────────────────────
  //
  // 학부모 화면과 **같은 숫자**를 보여준다 (lib/monthly 의 summarize).
  // 집에서 "이번 달 어땠어?" 를 물으면 아이와 부모가 같은 화면을 보게 된다.
  // 다른 숫자가 나오면 그 자리에서 다투게 된다.
  //
  // 세 줄(출결·숙제·단어)은 **그대로** 쓴다. 말을 따로 지어내면 그것이 곧
  // 두 번째 진실이 되어, 어느 쪽이 맞는지 아무도 모르게 된다.
  // 다른 것은 제목뿐이다 — 학부모에게는 "이번 달", 아이에게는 "이번 달 나".
  const { data: monthReps } = monthRepsQ;
  const mIds = (monthReps || []).map((r) => r.id);
  const { data: mItems } = mIds.length
    ? await fetchAll(() =>
        supabase
          .from("daily_report_items")
          .select("daily_report_id, status")
          .in("daily_report_id", mIds)
          .order("daily_report_id"))
    : { data: [] };
  const mItemsOf = new Map();
  (mItems || []).forEach((i) => {
    if (!mItemsOf.has(i.daily_report_id)) mItemsOf.set(i.daily_report_id, []);
    mItemsOf.get(i.daily_report_id).push(i);
  });
  const monthSum = summarize(
    (monthReps || []).map((r) => ({ ...r, items: mItemsOf.get(r.id) || [] })),
    []
  );
  // 통과선은 이 학생 것 → 없으면 설정 기본값 (0070 전이면 기본값만)
  const { data: myWarn } = myWarnQ;
  const { data: myCutRow } = myCutQ;
  const myCut = cutOf(myCutRow, Number(myWarn?.config?.wordPassPct) || 90);
  const monthLines = threeLines(
    monthSum,
    passSummary([...(monthReps || [])].sort((a, b) => a.date.localeCompare(b.date)), myCut)
  );

  // 내 흐름 — 남과 견주지 않고 **내 지난 기록**과 견준다
  const asc = [...(reports || [])].sort((a, b) => a.date.localeCompare(b.date));
  const wordTrend = trend(
    asc.filter((r) => r.word_total > 0).map((r) => pct(r.word_correct, r.word_total))
  );
  const sentTrend = trend(
    asc.filter((r) => r.sent_total > 0).map((r) => pct(r.sent_correct, r.sent_total))
  );

  // 항목마다 내가 보통 얼마나 걸렸나 (오늘 것은 빼고 지난 것들로)
  const pastSessions = pastQ.error ? [] : pastQ.data || [];
  const perDay = new Map();   // `${item}|${date}` → 그날 합계
  pastSessions.forEach((x) => {
    if (!x.homework_item_id) return;
    const k = `${x.homework_item_id}|${x.date}`;
    perDay.set(k, (perDay.get(k) || 0) + (x.seconds || 0));
  });
  const byItem = new Map();
  perDay.forEach((sec, k) => {
    const id = k.split("|")[0];
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id).push(sec);
  });
  const usualOf = (id) => avgSeconds(byItem.get(id) || []);

  const toTask = (c, extra = {}) => {
    const it = itemById.get(c.itemId);
    return {
      key: c.key,
      reportItemId: c.reportItemId,
      itemId: c.itemId,
      stayId: null,
      name: c.name,
      units: c.units,
      note: c.note,
      method: c.method,
      checklist: c.checklist || [],   // 빠져 있어서 체크리스트가 학생 화면에 안 뜨고 있었다
      inPerson: !!it?.in_person,      // 앱에 낼 것이 없는 숙제 — 안 내도 끝낼 수 있다
      // **단원평가는 결과를 낸다** (0106). 원장님이 미리 배정하시고,
      // 아이는 다음 시간에 와서 맞은 개수만 적는다 — 단원 이름은 배정에
      // 이미 붙어 있으니 아이가 적을 일이 없다
      unitTest: !!it?.unit_test,
      doneAt: c.doneAt,
      needsCheck: !!it?.no_timer,
      checked: false,
      sort: it?.sort ?? 500,
      seconds: secOf.get(`item-${c.itemId}`) || 0,
      usual: usualOf(c.itemId),
      ...extra,
    };
  };

  /**
   * **밀림 배너** (원장님 2026-08-20 「d 나보다 학생한테도 떠야 할 듯」).
   * 지난 수업에서 「다음 수업에 계속」 된 것 — 오늘 목록에 실려 오니,
   * 몇 개가 밀려 있는지 한 줄로만 알려준다 (태그 덕지덕지 금지).
   */
  const prevRep = (reports || []).find((r) => r.date < today);
  const carriedOver = prevRep
    ? dri.filter(
        (x) => x.daily_report_id === prevRep.id && x.status === "inclass" && x.carry_next
      ).length
    : 0;

  // 오늘 학원에서 할 것 (선생님이 오늘 정해준 것)
  const inClass = (latest && latest.date === today
    ? dri
        .filter((x) => x.daily_report_id === latest.id && x.status === "inclass")
        // 선생님이 정한 차례대로 (0140) — 옛 줄(차례 없음)은 뒤로
        .sort((a, b) => (a.inclass_sort ?? 999) - (b.inclass_sort ?? 999))
        .map(toCard)
    : []
  )
    .map((c) => {
      const t = toTask(c);
      // 단어시험은 학생마다 보는 때가 다르다 — 맨 앞이거나 맨 뒤다
      const it = itemById.get(c.itemId);
      // 단어시험 맨앞/맨뒤 규칙만 남기고, 나머지는 선생님이 정한 차례(0140)
      t.sort = it?.word_test ? (wordWhen === "end" ? 99000 : -1) : 0;
      return t;
    })
    .map((t, i) => ({ ...t, _ord: i }))
    .sort((a, b) => a.sort - b.sort || a._ord - b._ord);

  const studyTasks = [
    ...todo.map((c) => {
      return toTask(c);
    }),
    ...stay
      .filter((t) => t.status === "todo")
      .map((t) => ({
        key: `stay-${t.id}`,
        reportItemId: null,
        itemId: null,
        stayId: t.id,
        name: t.body,
        units: [],
        note: "늦귀가 과제",
        method: "",
        doneAt: null,
        needsCheck: false,
        checked: false,
        sort: 9000,
        seconds: secOf.get(`stay-${t.id}`) || 0,
        usual: null,
      })),
  ].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ko"));

  // 리포트의 '공지' 는 **학부모께 나가는 문장**이다.
  //   "숙제를 안 해와서 남겨서 시켰습니다" 같은 말이 아이 화면에 그대로 뜨면 안 된다.
  //   아이에게 할 말은 전달사항(notices 표) 으로 따로 있다.
  //   그래서 학생·학부모 화면에서는 빼고, 선생님이 미리보기로 볼 때만 남긴다.
  const notices = (isStaff ? reports || [] : [])
    .filter((r) => r.notice)
    .slice(0, 3)
    .map((r) => ({ date: r.date, body: r.notice }));

  // 학원에서 온 공지 — 학교에서 나눠준 종이를 찍어 보내주신 것도 여기 온다.
  // 2주치만. 지난 것까지 쌓여 있으면 오늘 볼 것이 안 보인다.
  const since = addDays(today, -14);
  let notice2 = [];
  {
    let { data: rec } = recQ;
    if (recQ.error) {
      // 0129 전이면 도장 칸 없이
      ({ data: rec } = await supabase
        .from("notice_receipts").select("notice_id").eq("student_id", sid));
    }
    const ids = [...new Set((rec || []).map((r) => r.notice_id))];
    // 확인 도장 — 「id|고친시각」 이 맞으면 더 안 보여준다 (0129)
    const readStamp = new Map((rec || []).map((r) => [r.notice_id, r.read_stamp || null]));
    if (ids.length) {
      let { data: rows } = await supabase
        .from("notices")
        .select("id, date, kind, title, photos, body, edited_at")
        .in("id", ids)
        .gte("date", since)
        .order("date", { ascending: false });
      if (!rows) {
        // 0121 전이면 고친 시각 없이
        ({ data: rows } = await supabase
          .from("notices")
          .select("id, date, kind, title, photos, body")
          .in("id", ids)
          .gte("date", since)
          .order("date", { ascending: false }));
      }
      if (!rows) {
        // 0064 전이면 제목·사진 없이
        ({ data: rows } = await supabase
          .from("notices")
          .select("id, date, kind, body")
          .in("id", ids)
          .gte("date", since)
          .order("date", { ascending: false }));
      }
      // 학부모용 공지는 아이 화면에 안 띄운다 (0050 과 같은 이유),
      // 「수업 메모」 도 안 띄운다 — 교실에서 말하려고 적어둔 것이라
      // 아이가 먼저 읽으면 그 말을 할 이유가 없어진다 (lib/notices)
      notice2 = (rows || [])
        .filter((n) => showsTo(n.kind, myRole === "parent" ? "parent" : "student"))
        // 확인 누른 공지는 더 안 보인다 (0129). 고치면(edited_at 변경)
        // 도장이 안 맞아 다시 보인다 — 그게 재공지다
        .filter((n) => readStamp.get(n.id) !== `${n.id}|${n.edited_at || ""}`);
    }
  }

  // 볼 영상 — 나에게 배정된 것만 (0065 전이면 빈 값, 화면은 그대로 뜬다)
  let myVideos = [];
  {
    const { data: asg } = asgQ;
    const vids = [...new Set((asg || []).map((a) => a.video_id))];
    if (vids.length) {
      const { data: vrows } = await supabase
        .from("videos")
        .select("id, title, url, provider, vid, note, active")
        .in("id", vids);
      const { data: seen } = seenQ;
      const doneOf = new Map((seen || []).map((x) => [x.video_id, x]));
      const dueOf = new Map((asg || []).map((a) => [a.video_id, a]));
      myVideos = (vrows || [])
        .filter((v) => v.active)
        .map((v) => ({
          ...v,
          dueOn: dueOf.get(v.id)?.due_on || null,
          assignedOn: dueOf.get(v.id)?.assigned_on || null,
          doneAt: doneOf.get(v.id)?.done_at || null,
        }))
        // 기한이 있는 것부터, 그다음 늦게 낸 것부터
        .sort((a, b) =>
          (a.dueOn || "9999").localeCompare(b.dueOn || "9999") ||
          (b.assignedOn || "").localeCompare(a.assignedOn || "")
        );
    }
  }

  /**
   * **학생용 달력** — 수업일 · 시험 · 결석 (원장님, 2026-08-06).
   *
   * 「이번 주에 나 언제 와요?」 를 카톡으로 물어보게 하지 말고 그냥 보이게 한다.
   * 학사일정·특강은 이미 넣고 있었고, 여기에 **자기 것 세 가지**를 더한다.
   *   수업일  내 반 요일에서 찍는다 (달마다 손으로 넣을 것이 아니다)
   *   시험    우리 학교 · 우리 학년 시험 기간
   *   결석·보강  이미 지나간 것도 남긴다 — 보강을 언제 채웠는지가 보여야 한다
   *
   * 할일은 나가지 않고, 원장님이 「나만 보기」로 잠근 일정도 빠진다 (0066).
   */
  /**
   * 달력에 담을 것 — **한 곳에서 만든다** (lib/studentCalendar).
   * 학부모 화면과 같은 달력이어야 한다. 집에서 두 화면을 나란히 놓고
   * 보시는 일이 흔한데, 거기서 다르면 그 자리에서 다투게 된다.
   */
  const { items: calendar, upcoming } = await loadStudentCalendar(
    supabase, student, myClasses, today
  );

  // 수업 가이드 링크 (0089) — 설정에서 넣은 것이 그대로 뜬다.
  //   표가 아직 없어도 화면은 그대로 열려야 한다 (SQL 이 밀려 있을 수 있다).
  const guides = guidesQ.error ? [] : guidesQ.data || [];

  // 원장님이 직접 적어두신 안내 (0093). 안 적으셨으면 원래 문구가 그대로 나온다
  const N = (key, fallback = "") => noteOr(notes, key, fallback);

  // 원장님이 정하신 덩어리 차례 (0095). 안 정하셨으면 아래 적힌 차례 그대로
  const blockOrder = arrange("me", layouts);

  /**
   * **아이가 낸 시험 결과** (0097·0098) — 「시험 결과 적기」 덩어리에 쓴다.
   *
   * 문법 단원평가는 여기 없다. 원장님: 「단원평가는 현재 오늘 수업에서 적는
   * 그거랑 같은 거야」 — 선생님이 수업에서 적으신 것이 성적으로 간다 (0099).
   */
  let myScores = [];
  let scoreItems = [];
  let specBase = [];
  let allSpecBase = [];
  {
    myScores = scoresQ.data || [];
    if (myScores.length > 0) {
      // 같은 표를 아래 성장 카드가 또 읽고 있었다 — 한 번만 읽고 나눠 쓴다
      // 시험이 쌓이면 문항 합이 1000줄을 넘는다 (전수검사 B5)
      const { data: its } = await fetchAll(() =>
        supabase
          .from("score_items")
          .select("score_id, no, wrong, reason")
          .in("score_id", myScores.map((x) => x.id))
          .order("score_id").order("no"));
      scoreItems = its || [];
      const n = new Map();
      scoreItems.forEach((x) => n.set(x.score_id, (n.get(x.score_id) || 0) + 1));
      myScores = myScores.map((x) => ({ ...x, wrongCount: n.get(x.id) || 0 }));
    }
    // 학원 기본 문항표 — 아이가 번호를 적는 동안 영역별로 바로 보여준다
    const { data: b } = specQ;
    specBase = (b || []).filter((x) => x.kind === "mock");
    allSpecBase = b || [];
  }

  /**
   * **성장 카드** — 학부모 화면과 **같은 것**을 본다.
   *
   * 집에서 나란히 놓고 보시는 일이 흔하다. 다르면 「엄마 폰에는 다르게
   * 나오는데」 가 되고, 그때부터 둘 다 못 믿게 된다.
   *
   * 원장님이 「학부모만」 으로 두셨으면 여기 자료가 아예 안 온다 (0101) —
   * 다만 아이가 스스로 낸 것은 늘 보인다.
   */
  const growth = {};
  if (myScores.length > 0) {
    const items = scoreItems;   // 위에서 한 번만 읽었다
    ["mock", "school"].forEach((k) => {
      const mine = myScores
        .filter((x) => x.kind === k)
        .slice()
        .sort((a, b) => (a.taken_on || "").localeCompare(b.taken_on || ""));
      if (mine.length === 0) return;
      const rounds = mine.map((sc) =>
        oneRound(sc, items.filter((x) => x.score_id === sc.id), [], allSpecBase.filter((b) => b.kind === k))
      );
      growth[k] = stack(rounds);
    });
  }

  // 지금 뭐 하고 있다고 눌러뒀나 (0084) — 첫 그림에 채워둔다
  let myState = null;
  let stateOff = false;
  if (stateQ.error) stateOff = true;
  else myState = stateQ.data;

  /**
   * ── 화면 덩어리 ─────────────────────────────────────────────
   *
   * 차례는 **원장님이 정하신다** (0095 · 설정 → 화면 → 화면 구성 순서).
   * 그래서 여기서는 덩어리를 이름표에 담아두기만 하고, 그리는 차례는
   * blockOrder 가 정한다. 안 정하셨으면 아래 적힌 차례 그대로 나온다.
   *
   * **비어 있는 덩어리는 원래도 안 그려진다** — 조건이 그대로 붙어 있어서,
   * 순서를 올린다고 없던 것이 생기지는 않는다.
   */
  const BLOCKS = {
    month: (
      <>
          {/* ── 1. 이번 달 현황 ─────────────────────────────────────
              학부모 화면과 **같은 숫자**다 (lib/monthly 의 summarize).
              집에서 "이번 달 어땠어?" 를 물을 때 둘이 같은 것을 보게 된다.
              출결 · 숙제 · 단어 · 문법 — 원장님이 보시는 네 가지 그대로. */}
          {monthLines.length > 0 && (
            <div className="card sect sect-calm">
              <h2 className="secthead">
                이번 달 현황
                <span className="hint" style={{ fontWeight: 600 }}>
                  {Number(myYm.slice(5))}월 1일부터 오늘까지
                </span>
              </h2>
              <ScreenNote text={N("me.month")} />
              <div className="stack" style={{ gap: 5 }}>
                {monthLines.map((l) => (
                  <div className="row" key={l.key} style={{ gap: 8, alignItems: "center" }}>
                    <span className="plabel" style={{ width: 52 }}>{l.label}</span>
                    <span className={`tag ${TONE_CLS[l.tone] || "tag-muted"}`}>{l.text}</span>
                  </div>
                ))}
                {/* 내 단어시험 규칙 — 통과선만 알고 몇 개짜리인지는 몰랐다 (값-지도 P1-14) */}
                <p className="hint" style={{ margin: "4px 0 0" }}>
                  단어시험은 {myCutRow?.word_test_count ? `${myCutRow.word_test_count}개 중 ` : ""}
                  {myCut}% 넘으면 통과예요.
                </p>
              </div>
            </div>
          )}
      </>
    ),
    schedule: (
      <>
          {/* ── 2. 일정 및 전달사항 — **한 덩어리로** ────────────────
              전에는 공지가 화면 아래쪽에 흩어져 있고 일정은 달력을 열어야
              알 수 있었다. 아이가 알아야 할 것은 「앞으로 무슨 일이 있나」
              하나다. 다가오는 것만, 몇 개만 — 지난 것까지 쌓이면 오늘 볼 것이
              안 보인다 (원장님, 2026-08-06). */}
          {(upcoming.length > 0 || notice2.length > 0 || notices.length > 0) && (
            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 17.5, fontWeight: 800 }}>
                일정 및 전달사항
              </h2>
              <ScreenNote text={N("me.schedule")} />

              {upcoming.length > 0 && (
                <div className="stack" style={{ gap: 4, marginBottom: notice2.length ? 14 : 0 }}>
                  {upcoming.map((c, i) => (
                    <div className="unitrow" key={`${c.date}-${i}`}>
                      <span className="hint" style={{ minWidth: 74 }}>
                        {dayLabel(c.date)}
                        {c.endDate && c.endDate !== c.date ? " ~" : ""}
                      </span>
                      <span style={{ fontSize: 15, flex: 1 }}>{cleanTitle(c.title)}</span>
                      {c.tone === "exam" && <span className="tag tag-red">시험</span>}
                      {c.tone === "school" && <span className="tag tag-sky">학교</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* 학원에서 온 전달사항 — 학교 종이를 찍어 보내주신 것도 여기 온다 */}
              {notice2.length > 0 && (
                <div className="stack" style={{ gap: 12 }}>
                  {notice2.map((n) => (
                    <div key={n.id} className="stack" style={{ gap: 6 }}>
                      <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                        <span className="hint">{dayLabel(n.date)}</span>
                        {n.title && <b style={{ fontSize: 15 }}>{n.title}</b>}
                        <span className="spacer" />
                        {!preview && !acting && (
                          <NoticeDismiss
                            studentId={sid}
                            noticeId={n.id}
                            stamp={`${n.id}|${n.edited_at || ""}`}
                          />
                        )}
                      </div>
                      {n.body && n.body !== n.title && (
                        <div style={{ fontSize: 15, whiteSpace: "pre-wrap" }}>{n.body}</div>
                      )}
                      <NoticePhotos noticeId={n.id} photos={n.photos || []} readOnly />
                    </div>
                  ))}
                </div>
              )}

              {upcoming.length === 0 && notice2.length === 0 && (
                <p className="hint" style={{ margin: 0 }}>앞으로 잡힌 일정이 없어요.</p>
              )}

              {/* 리포트의 '공지' 는 학부모께 나가는 문장이라 아이에게는 안 보인다.
                  선생님이 미리보기로 볼 때만 여기 붙는다. */}
              {notices.length > 0 && (
                <div className="notice" style={{ marginTop: 12, fontSize: 14 }}>
                  <b>선생님께만 보임 — 학부모께 나가는 문장</b>
                  <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                    {notices.map((n) => (
                      <div key={n.date}>
                        <span className="hint">{dayLabel(n.date)}</span>
                        <div style={{ fontSize: 14.5 }}>{n.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
      </>
    ),
    study: (
      <>
          {/* ── 3~4. 하원 숙제 · 등원 학습 ───────────────────────────
              등원 절차(폰·출석·숙제 제출)를 먼저 둔다 — 학원에 들어와서
              제일 먼저 누르는 것이라 학습보다 위에 있어야 한다. */}
          <ArrivalCard
            done={{
              phone: arrival.phone_at,
              attend: arrival.attend_at,
              homework: arrival.homework_at,
            }}
            atAcademy={atAcademy}
            readOnly={preview}
            asId={acting ? student.id : null}
          />

          {/* **하원할게요** (원장님 2026-08-23) — 학원 안에서만 뜬다.
              공용 기기로 표시해 둔 기기에서는 누르면 로그아웃까지 */}
          <LeaveCard
            atAcademy={atAcademy}
            done={!!arrival.leave_at}
            readOnly={preview}
            asId={acting ? student.id : null}
          />

          <ScreenNote text={N("me.study")} tone="card" />

          {/* 밀림 배너 (0140) — 지난 수업에서 미룬 것이 오늘 목록에 실려 온다 */}
          {carriedOver > 0 && (
            <p className="notice" style={{ fontSize: 14, margin: "0 0 8px" }}>
              지난 수업에서 미룬 것이 <b>{carriedOver}개</b> 있어요 — 오늘 할 일에 이어서 나와요.
            </p>
          )}

          <StudyTabs
            inClass={inClass}
            home={studyTasks}
            running={running}
            ready={timerReady}
            atClass={atClass}
            stayLeft={stayLeft.length}
            readOnly={preview}
            asId={acting ? student.id : null}
            subs={subs}
            answers={answers}
            homeFrom={assignedFrom ? dayLabel(assignedFrom.date) : ""}
            homeDays={
              assignedFrom && assignedFrom.date < today
                ? Math.round((Date.parse(today) - Date.parse(assignedFrom.date)) / 86400000)
                : 0
            }
          />

          {/* 숙제가 안 뜨면 **왜 안 뜨는지** 선생님께만 알려준다.
              "왜 안 보이지" 를 앱 밖에서 알아내게 하면 안 된다. */}
          {todo.length === 0 && (isStaff || preview || acting) && (
            <div className="notice" style={{ fontSize: 14 }}>
              <b>선생님께만 보이는 안내</b>
              <br />
              {(reports || []).length === 0
                ? "이 학생의 수업 기록이 아직 하나도 없습니다. 오늘 수업에서 출결을 찍고 저장하면 생깁니다."
                : dri.length === 0
                ? `수업 기록은 ${reports.length}개 있는데 숙제 줄이 하나도 없습니다. 오늘 수업에서 '다음 숙제' 를 고른 뒤 저장을 눌렀는지 확인해주세요.`
                : "숙제 줄은 있는데 '배정' 상태인 것이 없습니다. 검사(○△✕)만 하고 다음 숙제를 안 골랐을 때 이렇게 됩니다."}
            </div>
          )}

          {/* **전체 목록 — 하원 숙제 · 등원 학습 둘 다.**
              위는 누르는 자리(타이머·완료·제출 — 등원은 순서대로, 숙제는
              자유롭게)고, 여기는 누를 것 없이 한 장으로 보이는 자리다.
              집에서 폰을 못 쓰는 아이가 찍어 가거나 적어 간다.
              (전에는 화면 맨 아래에 있었다. 자기 숙제와 멀리 떨어져 있으면
               거기까지 안 내려간다 — 그래서 각자 제 자리로 올렸다.) */}
          <ScreenNote text={N("me.sheet")} tone="card" />
          <HomeworkSheet
            title="하원 숙제 전체"
            items={todo}
            dateLabel={assignedFrom ? dayLabel(assignedFrom.date) : ""}
          />
          <HomeworkSheet
            title="등원 학습 전체"
            items={inClass}
            dateLabel={latest?.date ? dayLabel(latest.date) : ""}
          />
      </>
    ),
    last: (
      <>
          {latest && (latest.word_total || latest.sent_total || latest.own_progress) && (
            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 17.5, fontWeight: 800 }}>성장 기록</h2>
              <div className="stack" style={{ gap: 6 }}>
                {latest.word_total ? (
                  <div className="row" style={{ gap: 8 }}>
                    <span className="plabel" style={{ width: 46 }}>단어</span>
                    <b>{score(latest.word_correct, latest.word_total)}</b>
                    {wordTrend && (
                      <span
                        className={`tag ${wordTrend.dir === "up" ? "tag-mint" : wordTrend.dir === "down" ? "tag-amber" : "tag-muted"}`}
                        title={`최근 평균 ${wordTrend.now}% · 그 전 ${wordTrend.before}%`}
                      >
                        {wordTrend.arrow} {wordTrend.label}
                      </span>
                    )}
                  </div>
                ) : null}
                {latest.sent_total ? (
                  <div className="row" style={{ gap: 8 }}>
                    <span className="plabel" style={{ width: 46 }}>문장</span>
                    <b>{score(latest.sent_correct, latest.sent_total)}</b>
                    {sentTrend && (
                      <span
                        className={`tag ${sentTrend.dir === "up" ? "tag-mint" : sentTrend.dir === "down" ? "tag-amber" : "tag-muted"}`}
                        title={`최근 평균 ${sentTrend.now}% · 그 전 ${sentTrend.before}%`}
                      >
                        {sentTrend.arrow} {sentTrend.label}
                      </span>
                    )}
                  </div>
                ) : null}
                {latest.own_progress ? (
                  <div className="row" style={{ gap: 8 }}>
                    <span className="plabel" style={{ width: 46 }}>진도</span>
                    <span style={{ fontSize: 15 }}>{latest.own_progress}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
      </>
    ),
    checked: (
      <>
          {checked.length > 0 && (
            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 17.5, fontWeight: 800 }}>지난 숙제 검사</h2>
              <HomeworkCards items={checked} />
            </div>
          )}
      </>
    ),
    stay: (
      <>
          {stay.length > 0 && (
            <div className="card">
              <h2 style={{ margin: "0 0 4px", fontSize: 17.5, fontWeight: 800 }}>
                {STAY_LABEL} <span className="tag tag-lav">{stay.length}</span>
              </h2>
              <p className="hint" style={{ margin: "0 0 10px" }}>
                오늘 채우고 가기로 한 것이에요. 다 못 한 건 숙제로 넘어왔어요.
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {stay.map((t) => (
                  <div className="unitrow" key={t.id}>
                    <span className="hint" style={{ minWidth: 46 }}>
                      {t.date.slice(5).replace("-", "/")}
                    </span>
                    <span style={{ fontSize: 15, flex: 1 }}>{t.body}</span>
                    <span className={`tag ${t.status === "moved" ? "tag-amber" : "tag-lav"}`}>
                      {t.status === "moved" ? "숙제로" : "남아서"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
      </>
    ),
    myscore: (
      <>
        {/* **성장이 먼저, 적는 것이 다음.** 자기 그래프를 보고 나서 적으면
            「왜 적는지」 를 안다 — 적기부터 시키면 숙제가 된다 */}
        {["mock", "school"].map((k) =>
          growth[k] ? <GrowthCard key={k} st={growth[k]} kindLabel={SCORE_KIND[k]} /> : null
        )}
        {/* **단원평가는 흐름으로 본다** (2026-08-06, 한 달 살아보기에서).
            한 달에 66건이 쌓이는데 날짜순 66줄로는 「관계사에서 세 번 막혔다」
            를 못 읽는다 */}
        <UnitCard scores={myScores} />
        <MyScoreForm mine={myScores.filter((s) => s.kind !== "unit")} base={specBase} canWrite={!preview && !trying} />
      </>
    ),
    videos: (
      <>
          <VideoList videos={myVideos} asId={acting ? student.id : null} readOnly={preview} />
      </>
    ),
    help: (
      <>
          {/* ── 5. 선생님 도움 · 쉬는 시간 ───────────────────────────
              **말로 끼어드는 대신 누른다.** 선생님 현황판에 바로 뜬다 (0084·0085).
              선생님 대신 눌러주는 미리보기(acting)에서는 안 낸다 — 그 아이가
              누른 것으로 잘못 남는다.
              도움을 청하는 세 가지(지금 상태 · 보내는 글 · 질문)를 한자리에 모은다.
              급할 때 화면을 뒤지게 하면 안 된다. */}
          {!preview && !acting && (
            <StateCard mine={myState} unavailable={stateOff} />
          )}

          {!preview && !acting && <RequestForm studentId={student.id} mine={myRequests || []} />}

          {latest && (
            <div className="card">
              <h2 style={{ margin: "0 0 4px", fontSize: 17.5, fontWeight: 800 }}>선생님께 질문</h2>
              <p className="hint" style={{ margin: "0 0 8px" }}>
                숙제나 수업에 대해 궁금한 게 있으면 여기에 남겨주세요. 선생님이 확인합니다.
              </p>
              <Comments reportId={latest.id} studentId={student.id} me={myRole} />
            </div>
          )}
      </>
    ),
    guide: (
      <>
          {/* ── 6. 수업 가이드 ──────────────────────────────────────
              카톡으로 보내주시던 안내(단어 외우는 법 · 수업 규칙 · 교재 사는 곳).
              카톡은 하루 만에 밀려 올라가고 새로 온 아이에게는 아예 안 간다.
              여기 붙여두면 **언제든 그 자리에 있다** (설정 → 수업 가이드 링크). */}
          {guides.length > 0 && (
            <div className="card">
              <h2 style={{ margin: "0 0 8px", fontSize: 17.5, fontWeight: 800 }}>수업 가이드</h2>
              <ScreenNote text={N("me.guide")} />
              <div className="stack" style={{ gap: 6 }}>
                {guides.map((g) => (
                  <a
                    key={g.id}
                    className="unitrow"
                    href={g.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{cleanTitle(g.title)}</span>
                    {g.note && <span className="hint">{g.note}</span>}
                    <span className="tag tag-sky">열기 →</span>
                  </a>
                ))}
              </div>
            </div>
          )}
      </>
    ),
    calendar: (
      <>
          {/* ── 7. 달력 — 수업일 · 시험 · 결석 ─────────────────────── */}
          {calendar.length > 0 && (
            <>
              <ScreenNote text={N("me.calendar")} tone="card" />
              <DashCalendar ym={today.slice(0, 7)} items={calendar} today={today} links={false} />
            </>
          )}
      </>
    ),
  };

  return (
    /**
     * **넓은 화면에서는 나란히** (원장님, 2026-08-07 — 「여백이 너무 많아…
     * 병렬로 나열해야할듯」).
     *
     * 폰에 맞춰 560px 한 줄로 짜여 있었다. 폰에서는 그게 맞지만 컴퓨터로
     * 열면 양옆이 통째로 비어서 화면의 3분의 2가 논다 — 원장님은 컴퓨터로
     * 아이 화면을 확인하신다. 폭만 열어두고 배치는 아래 blockgrid 가 한다.
     */
    <main className="wrap" style={{ maxWidth: 1180, paddingBottom: 40 }}>
      <div className="page-head">
        <p className="eyebrow">클로이영어</p>
        <h1 className="h1">{student.name} 학생</h1>
        <p className="sub">
          {[student.school, student.grade].filter(Boolean).join(" ")}
          {latest ? ` · 최근 수업 ${dayLabel(latest.date)}` : ""}
        </p>
      </div>

      <div className="stack" style={{ marginTop: 10 }}>
        {preview ? (
          <div className="card card-tight" style={{ borderLeft: "3px solid var(--accent, #6d7cff)" }}>
            <b style={{ fontSize: 15 }}>학생 화면 미리보기</b>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              {student.name} 학생에게 보이는 그대로입니다. <b>여기서는 누를 수 없습니다</b> —
              선생님이 대신 누르면 기록이 거짓이 됩니다.
            </p>
            <p className="hint" style={{ margin: "6px 0 0" }}>
              <a href={`/me?s=${student.id}&try=1`}>직접 눌러보기 →</a>
            </p>
          </div>
        ) : acting ? (
          <TryoutBar studentId={student.id} name={student.name} />
        ) : (
          <InstallHint />
        )}
        {/* 홈 화면에 담은 앱에는 주소창이 없다 — 여기 없으면 새로고침할 방법이 없다.
            아이 화면이라 오른쪽 끝에 작게 둔다 (누를 일이 자주 있으면 안 된다) */}
        {!preview && (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: -4 }}>
            <Refresh />
          </div>
        )}
        {/**
          * **알림이 꺼져 있으면 아래를 안 연다** (원장님, 2026-08-07 —
          * 「학생 어플은 절대 알림이 꺼지면 안 돼 … 정상 작동이 안 되도록」).
          *
          * 이 앱이 알림톡을 대신한다. 숙제도 시험도 전달사항도 여기로만
          * 간다. 알림이 꺼진 아이는 **아무 소식도 못 받는 채로** 앱을 쓰고
          * 있게 되고, 정작 문제는 숙제를 안 해온 날 드러난다.
          *
          * 미리보기(선생님)와 눌러보기는 그대로 연다 — 거기서 막으면
          * 원장님이 아이 화면을 못 보시게 된다.
          */}
        {(() => {
          /**
           * **「지금 할 것」 은 폭을 다 쓴다.** 큰 글씨와 큰 버튼으로
           * 「지금 이거 하나」 를 보여주는 칸이라, 반쪽으로 접히면 그 뜻이
           * 사라진다. 나머지는 두 줄·세 줄로 자리를 채운다.
           */
          const inner = (
            <>
              {/* 위 메뉴 + 처음 소개 (원장님, 2026-08-14) — 갈래가 위에서 보인다 */}
              <SectionNav page="me" order={blockOrder} />
              {/* 새 공지는 길목에서 — 확인을 눌러야 화면 (원장님, 2026-08-14).
                  선생님 미리보기에서는 안 띄운다 (원장님 브라우저에 확인이 쌓이면
                  정작 아이 기기에서 뜰 것이 안 뜬 것처럼 헷갈린다) */}
              {!preview && !acting && !isStaff && (
                <NoticeGate page="me" notices={notice2} />
              )}
              {/* 안 한 것 팝업 — 해결될 때까지 들어올 때마다 (원장님, 2026-08-14) */}
              {!preview && !acting && !isStaff && (
                <PendingGate homework={pendingHw} scores={pendingScores} />
              )}
              <ScreenNote text={N("me.top")} tone="card" />
              <div className="blockgrid">
                {blockOrder.map((k) => (
                  <div key={k} id={`blk-${k}`} className={k === "study" ? "fullrow" : undefined}>
                    {BLOCKS[k]}
                  </div>
                ))}
              </div>
            </>
          );
          return preview || acting ? inner : <AlertGate>{inner}</AlertGate>;
        })()}

        {/**
          * **알림 설정은 맨 아래** (원장님, 2026-08-07 — 「알림 켜면 끄기랑
          * 방해금지 모드 설정만 남기고 페이지 맨 밑으로 내려줘」).
          *
          * 맨 위에 있으면 아이가 앱을 열 때마다 설명부터 읽게 되고, 정작
          * 「지금 할 것」 이 한 화면 아래로 밀린다. **한 번 켜고 나면 다시
          * 볼 일이 없는 칸**이다 — 꺼져 있을 때는 어차피 AlertGate 가
          * 화면 앞에서 막아선다.
          */}
        {/* 영어사전 — 숙제하다 모르는 단어가 나오면 여기서 바로 (2026-08-16) */}
        {!preview && <DictBar />}

        {!preview && !acting && <AlertBox brief />}

        <form action="/logout" method="post">
          <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
