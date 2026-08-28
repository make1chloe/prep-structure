import { Fragment } from "react";
import MonthConfirm from "./MonthConfirm";
import { createClient } from "@/lib/supabase/server";
import { showsTo } from "@/lib/notices";
import { redirect } from "next/navigation";
import Link from "next/link";
import { addDays, dowOf, longLabel, shortLabel, todaySeoul , addMonths} from "@/lib/day";
import { summarize } from "@/lib/monthly";
import { threeLines, TONE_CLS, monthRange, ATT_LABEL } from "@/lib/parentView";
import { byKind, summary as scoreSummary, KIND_LABEL, findExam } from "@/lib/scores";
import { oneRound, stack } from "@/lib/report";
import GrowthCard from "@/components/GrowthCard";
import UnitCard from "@/components/UnitCard";
import { cutOf, passSummary, score } from "@/lib/wordTest";
import { cleanClassName } from "@/lib/classLabel";
import NoticeDismiss from "@/components/NoticeDismiss";
import {
  loadReports, loadReportItems, loadHomeworkItems, loadUnitLabels, isLesson,
  makeCard, pickAssigned, checkCounts,
} from "@/lib/homeworkView";
import { maskRows, GATE_COLS, GATE_COLS_OLD } from "@/lib/closeGate";
import Comments from "@/app/comments/Comments";
import RequestForm from "@/app/me/RequestForm";
import NoticePhotos from "@/components/NoticePhotos";
import DashCalendar from "@/app/DashCalendar";
import ChildPicker from "./ChildPicker";
import ChangePw from "@/app/me/ChangePw";
import AlertBox from "@/components/AlertBox";
import MakeupConfirm from "./MakeupConfirm";
import PushToggle from "@/app/me/PushToggle";
import Refresh from "@/components/Refresh";
import { loadStudentCalendar } from "@/lib/studentCalendar";
import { loadClassesWithTerm, meetsOn } from "@/lib/classTerm";
import { toTermShape, extraDatesBy } from "@/lib/extraTerm";
import { notYet, fromLabel } from "@/lib/bookUse";
import { loadNotes, noteOr } from "@/lib/screenNotes";
import { loadLayouts, arrange } from "@/lib/screenLayout";
import ScreenNote from "@/components/ScreenNote";
import { cleanNote, cleanTitle } from "@/lib/note";
import { STAFF_ROLES as STAFF } from "@/lib/roles";
import { sessionUser } from "@/lib/session";
import SectionNav from "@/components/SectionNav";
import NoticeGate from "@/components/NoticeGate";

export const dynamic = "force-dynamic";

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
export default async function ParentPage(props) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const user = await sessionUser(supabase);
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
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
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

  /**
   * **파도** (속도 대원칙 — 원칙 6). 어머니 폰에서 매일 열리는 화면인데
   * 서른두 조회를 한 줄씩 기다리고 있었다. pickId 만 있으면 되는 것들을
   * 전부 한 층으로 보낸다.
   */
  const nextMonthYm = addMonths(today.slice(0, 7), 1);
  const [
    repsQ, warnQ, cutQ, recent, itemById, mineQ, attTodayQ, stayQ,
    monthlyQ, scoresQ, examsQ1, recQ, reqQ1, notes, layouts, confirmQ, stbQ,
    extraQ, exAbsQ, holMonthQ,
  ] = await Promise.all([
    // 마감 판정 칸(lib/closeGate GATE_COLS)을 꼭 같이 읽는다 — 안 읽으면
    // 게이트가 조용히 열린다. 0169 전 DB 면 closed_at 이 없어 한 칸 물러난다
    (async () => {
      const MONTH_COLS =
        "id, date, attendance_kind, word_correct, word_total, sent_correct, sent_total, notice, report_text";
      const q = (cols) =>
        supabase
          .from("daily_reports")
          .select(cols)
          .eq("student_id", pickId)
          .gte("date", from)
          .lte("date", today)
          .order("date", { ascending: false });
      const r = await q(`${MONTH_COLS}, ${GATE_COLS}`);
      return r.error ? await q(`${MONTH_COLS}, ${GATE_COLS_OLD}`) : r;
    })(),
    supabase.from("settings").select("config").eq("key", "warning").maybeSingle(),
    supabase.from("students").select("word_cut_pct").eq("id", pickId).maybeSingle(),
    loadReports(supabase, pickId, today, 6),
    loadHomeworkItems(supabase),
    supabase.from("class_students").select("class_id").eq("student_id", pickId),
    supabase
      .from("attendance").select("status, reason, planned, note").eq("student_id", pickId).eq("date", today).maybeSingle(),
    supabase
      .from("stay_tasks").select("id, body, status").eq("student_id", pickId).eq("date", today),
    supabase
      .from("monthly_reports")
      .select("ym, text, sent_at")
      .eq("student_id", pickId)
      .order("ym", { ascending: false })
      .limit(3),
    supabase
      .from("scores")
      .select("id, kind, taken_on, term, raw_score, full_score, grade, percentile, rank_in, rank_of, school, cuts, source, exam_id")
      .eq("student_id", pickId)
      .order("taken_on", { ascending: false })
      .limit(30),
    supabase
      .from("exam_periods")
      .select("id, school, grade, name, from_date, to_date, cuts"),
    supabase.from("notice_receipts").select("notice_id, read_stamp").eq("student_id", pickId),
    supabase
      .from("requests")
      .select("id, kind, from_date, to_date, body, status, reply, thread, canceled_at, handled_at, photos")
      .eq("student_id", pickId)
      .order("created_at", { ascending: false })
      .limit(5),
    loadNotes(supabase),
    loadLayouts(supabase),
    // 다음 달 일정 1차 확인 (0123) — 표가 없으면 조용히 없음
    supabase
      .from("month_confirms")
      .select("parent_at")
      .eq("student_id", pickId)
      .eq("ym", addMonths(today.slice(0, 7), 1))
      .maybeSingle(),
    // 사용 예정 교재 — 사야 할 책 (값-지도 P1-18: 구매링크·교재비가
    // 안내 문자 밖에는 아무 데도 안 보였다)
    supabase
      .from("student_textbooks")
      .select("textbook_id, status, assigned_on, ended_on")
      .eq("student_id", pickId)
      .eq("status", "active"),
    // 우리 아이 특강 (0164 — 재원생 속성). 달력·이번 달 셈·다음 수업에 쓴다.
    // 0164 전 DB 면 error → 조용히 정규만
    supabase
      .from("student_extra_schedules")
      .select("id, student_id, label, days, start_time, end_time, from_date, to_date, off_dates")
      .eq("student_id", pickId),
    supabase.from("student_extra_absences").select("schedule_id, date, status"),
    supabase.from("holidays").select("date, scope").gte("date", from).lte("date", today),
  ]);

  /** 아직 시작 전인(사야 할) 교재 — 판정은 lib/bookUse 의 notYet 한 곳 */
  let buyBooks = [];
  {
    const soon = (stbQ.error ? [] : stbQ.data || []).filter((r) => notYet(r, today));
    if (soon.length) {
      const { data: bks } = await supabase
        .from("textbooks")
        .select("id, name, price, purchase_url")
        .in("id", soon.map((r) => r.textbook_id));
      const fromOf = new Map(soon.map((r) => [r.textbook_id, r.assigned_on]));
      buyBooks = (bks || []).map((b) => ({
        id: b.id,
        name: b.name,
        price: b.price || 0,
        url: b.purchase_url || "",
        from: fromOf.get(b.id) || null,
      }));
    }
  }

  // ── 이번 달 (달이 끝나기 전에도 지금까지를 그대로 센다) ──
  // **마감 전 판은 리포트 부분을 통째로 비운다** — 공지·리포트 글뿐 아니라
  // 점수·진도까지 (원장 확정 8/28, 8/27 의 「점수는 공개」 를 뒤집음).
  // 판정은 lib/closeGate 한 벌 — SQL report_gate() 와 같은 뜻이다.
  const reps = maskRows(repsQ?.data);

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
  // 특강(0164) 수업일도 이번 달에 넣는다 — 정규와 겹친 날은 summarize 가
  // 리포트 날짜를 보고 한 번만 센다. 범위는 reps 와 같은 from~오늘.
  const childExtraDates =
    extraDatesBy(
      extraQ?.error ? [] : extraQ?.data || [],
      ym,
      holMonthQ?.error ? [] : holMonthQ?.data || [],
      exAbsQ?.error ? [] : exAbsQ?.data || [],
      { from, to: today }
    ).get(pickId) || [];
  const sum = summarize(withItems, [], childExtraDates);
  // 통과선은 이 학생 것 → 없으면 설정의 기본값.
  // 0070 전이면 학생별 통과선 칸이 없다 — 그때는 기본값만 쓴다.
  const { data: warnRow } = warnQ;
  const { data: cutRow } = cutQ;
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
  const dri = await loadReportItems(supabase, recent.map((r) => r.id));
  const unitLabel = await loadUnitLabels(supabase, dri);
  const toCard = makeCard(itemById, unitLabel);
  const { from: assignedFrom, rows: assignedRows } = pickAssigned(recent, dri);
  const homework = assignedRows.map(toCard);

  // 최근 수업 세 번 — 그날 검사 결과를 같이 붙인다.
  // 출결 없는 판(검사·배정만 얹힌 것)은 수업이 아니다 — isLesson 기준은
  // 월간(#16)과 동일 (정합성 검토 2026-08-26)
  const lessons = recent.filter(isLesson).slice(0, 3).map((r) => {
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
    const { data: mine } = mineQ;
    const ids = (mine || []).map((m) => m.class_id);
    if (ids.length) {
      // **기간 칸을 꼭 같이 읽는다** — 안 읽으면 종강한 특강의 회차가
      // 우리 아이 달력에 영원히 찍힌다 (2026-08-06)
      myClasses = await loadClassesWithTerm(
        supabase, "id, name, days, start_time, end_time", ids
      );
    }
    // 특강(0164)도 우리 아이 수업이다 — 반 모양으로 이어 붙인다 (lib/extraTerm).
    // 지난 특강도 남긴다: 달력은 지나간 달도 그리고, 기간 판단은 inTermOn 이 한다
    myClasses = [
      ...myClasses,
      ...(extraQ?.error ? [] : extraQ?.data || []).map((x) => ({
        ...toTermShape(x), off_dates: x.off_dates || [],
      })),
    ];
  }
  /**
   * 다음 수업이 언제인가 — **앞으로 2주만 본다.**
   * 그 안에 없으면 요일이 안 잡혀 있는 것이라, 날짜를 지어내느니 안 적는 편이 낫다.
   * 요일만 보지 않고 meetsOn(기간 포함)으로 — 종강한 특강이 「다음 수업」 으로
   * 영원히 서 있으면 어머니가 헛걸음하신다 (규칙은 classTerm 한 곳에).
   */
  let nextClass = null;
  for (let i = 0; i < 15 && !nextClass; i += 1) {
    const d = addDays(today, i);
    const dow = dowOf(d);
    const hit = myClasses.filter((c) => meetsOn(c, d, dow))
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))[0];
    if (hit) nextClass = { date: d, at: (hit.start_time || "").slice(0, 5), name: cleanClassName(hit.name) };
  }

  // 오늘 출결 — 어머니가 제일 자주 물으시던 것 (「갔어요?」)
  const { data: attToday } = attTodayQ;

  // 오늘 늦게 가나 — 남아서 채우고 갈 것이 있으면 늦어진다
  const stayLeft = (stayQ.error ? [] : stayQ.data || []).filter((t) => t.status === "todo");

  // ── 월간리포트 (지난달까지 나간 것) ──
  const { data: monthly } = monthlyQ;
  const monthlyRows = (monthly || []).filter((m) => m.text);

  // ── 성적 ──
  //
  //   **0101 부터는 원장님이 「비공개」 로 두신 아이의 성적이 아예 안 온다.**
  //   화면에서 감추는 것이 아니라 읽기 규칙에서 막힌다 — 그래서 여기서
  //   따로 거를 것이 없다. 없으면 블록이 통째로 안 그려진다.
  const { data: scores } = scoresQ;
  const scoreGroups = byKind(scores || []);

  /**
   * **성장 카드** — 학생 화면과 **같은 것**을 보여준다.
   *
   * 집에서 나란히 놓고 보시는 일이 흔하다. 다르면 「엄마 폰에는 다르게
   * 나오는데」 가 되고, 그때부터 둘 다 못 믿게 된다.
   *
   * 문항별 오답을 못 읽어도(0097 전) 총점만으로 카드가 뜬다 — 영역별
   * 막대만 빠진다.
   */
  const growth = {};
  if ((scores || []).length > 0) {
    let items = [];
    const { data: its } = await supabase
      .from("score_items")
      .select("score_id, no, wrong, reason")
      .in("score_id", (scores || []).map((x) => x.id));
    items = its || [];

    const { data: specBase } = await supabase
      .from("exam_spec_rows")
      .select("kind, no, area, topic, detail")
      .order("no", { ascending: true });

    ["mock", "school"].forEach((k) => {
      const mine = (scores || [])
        .filter((x) => x.kind === k)
        .slice()
        .sort((a, b) => (a.taken_on || "").localeCompare(b.taken_on || ""));
      if (mine.length === 0) return;
      const rounds = mine.map((sc) =>
        oneRound(sc, items.filter((x) => x.score_id === sc.id), [], (specBase || []).filter((b) => b.kind === k))
      );
      growth[k] = stack(rounds);
    });
  }
  // 등급컷은 **회차** 것이다 (0073). 선생님 화면과 같은 컷을 봐야
  // "앱에서는 2등급이라던데요" 가 안 생긴다.
  let { data: exams } = examsQ1;
  if (!exams) {
    ({ data: exams } = await supabase
      .from("exam_periods").select("id, school, grade, name, from_date, to_date"));
  }

  // ── 공지 ──
  let { data: rec } = recQ;
  if (recQ.error) {
    // 0129 전이면 도장 칸 없이
    ({ data: rec } = await supabase
      .from("notice_receipts").select("notice_id").eq("student_id", pickId));
  }
  const readStamp = new Map((rec || []).map((r) => [r.notice_id, r.read_stamp || null]));
  const nIds = [...new Set((rec || []).map((r) => r.notice_id))];
  let notices = [];
  if (nIds.length) {
    let { data } = await supabase
      .from("notices")
      .select("id, date, kind, title, photos, body, edited_at")
      .in("id", nIds)
      .gte("date", addDays(today, -21))
      .order("date", { ascending: false });
    if (!data) {
      // 0121 전이면 고친 시각 없이
      ({ data } = await supabase
        .from("notices")
        .select("id, date, kind, title, photos, body")
        .in("id", nIds)
        .gte("date", addDays(today, -21))
        .order("date", { ascending: false }));
    }
    if (!data) {
      ({ data } = await supabase
        .from("notices").select("id, date, kind, body").in("id", nIds)
        .gte("date", addDays(today, -21)).order("date", { ascending: false }));
    }
    // 「수업 메모」 는 원장님이 교실에서 말하려고 적어둔 것이라 안 띄운다
    notices = (data || [])
      .filter((n) => showsTo(n.kind, "parent"))
      // 확인 누른 공지는 더 안 보인다 (0129) — 고치면 도장이 안 맞아 다시 뜬다
      .filter((n) => readStamp.get(n.id) !== `${n.id}|${n.edited_at || ""}`);
  }

  /**
   * 달력에 담을 것 — **학생 화면과 같은 코드로** 만든다 (lib/studentCalendar).
   * 집에서 아이 화면과 나란히 놓고 보시는 일이 흔하다. 거기서 다르면
   * 그 자리에서 다투게 된다.
   */
  const { items: calendar, upcoming } = await loadStudentCalendar(
    supabase, child, myClasses, today
  );

  // 내가 보낸 것
  // 오간 말·취소는 0108 에서 붙는다. 없으면 그 아래에서 한 칸씩 물러난다 —
  // 한 칸 때문에 「보낸 것」 목록이 통째로 안 보이면 안 된다
  const REQ = "id, kind, from_date, to_date, body, status, reply, thread, canceled_at, handled_at";
  const REQ0 = "id, kind, from_date, to_date, body, status, reply";
  let { data: myReqs } = reqQ1.data ? reqQ1 : { data: null };
  if (!myReqs) {
    // 0108 전이면 오간 말 칸이 없다
    ({ data: myReqs } = await supabase
      .from("requests").select(`${REQ0}, photos`).eq("student_id", pickId)
      .order("created_at", { ascending: false }).limit(5));
  }
  if (!myReqs) {
    // 0068 전이면 사진도 없이
    ({ data: myReqs } = await supabase
      .from("requests").select(REQ0).eq("student_id", pickId)
      .order("created_at", { ascending: false }).limit(5));
  }

  // 댓글·「남기실 말씀」 이 붙는 최근 수업 — 유령 판(출결 없음)엔 안 붙인다
  const latest = withItems.find((w) => w.attendance_kind !== null) || null;
  const hasToday = !!nextClass && nextClass.date === today;

  // 원장님이 직접 적어두신 안내 (0093). 안 적으셨으면 원래 문구가 그대로 나온다
  const N = (key) => noteOr(notes, key);

  // 원장님이 정하신 덩어리 차례 (0095). 안 정하셨으면 아래 적힌 차례 그대로
  const blockOrder = arrange("parent", layouts);

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
    today: (
      <>
          {/* ── 1. 오늘 ────────────────────────────────────────────
              어머니가 전화로 물으시던 것들이다 — 다음 수업이 언제인지,
              오늘 갔는지, 늦게 오는지. 물어보지 않아도 되게 맨 위에 둔다. */}
          {(nextClass || attToday || stayLeft.length > 0) && (
            <div className="card sect sect-info">
              <h2 className="secthead">오늘</h2>
              <ScreenNote text={N("parent.today")} />
              <div className="stack" style={{ gap: 6 }}>
                {hasToday ? (
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <span className="plabel" style={{ width: 62 }}>오늘 수업</span>
                    <span style={{ fontSize: 15 }}>
                      {nextClass.at ? `${nextClass.at} 시작` : "수업일"}
                    </span>
                    {attToday ? (
                      <>
                        <span className={`tag ${attToday.status === "absent" ? "tag-red" : "tag-mint"}`}>
                          {ATT_LABEL[attToday.status] || attToday.status}
                        </span>
                        {attToday.status === "absent" && attToday.planned && (
                          <span className="tag tag-sky">미리 말씀해주신 결석</span>
                        )}
                        {(attToday.reason || attToday.note) && (
                          <span className="hint" style={{ fontSize: 14 }}>
                            {[attToday.reason, attToday.note].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="tag tag-muted">아직 출결 전</span>
                    )}
                  </div>
                ) : nextClass ? (
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <span className="plabel" style={{ width: 62 }}>다음 수업</span>
                    <span style={{ fontSize: 15 }}>
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
                    {/* 사전 연락 결석과 무단 결석은 다른 이야기다 (값-지도 P1-6) */}
                    {attToday.status === "absent" && attToday.planned && (
                      <span className="tag tag-sky">미리 말씀해주신 결석</span>
                    )}
                    {(attToday.reason || attToday.note) && (
                      <span className="hint" style={{ fontSize: 14 }}>
                        {[attToday.reason, attToday.note].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                )}

                {stayLeft.length > 0 && (
                  <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                    <span className="plabel" style={{ width: 62 }}>하원</span>
                    <span style={{ fontSize: 15, flex: 1 }}>
                      오늘은 <b>남아서 채우고</b> 갑니다 — {stayLeft.map((t) => t.body).join(" · ")}
                      <br />
                      <span className="hint">평소보다 늦게 갈 수 있어요.</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
      </>
    ),
    month: (
      <>
          {/* ── 2. 이번 달 현황 ────────────────────────────────────
              학생 화면과 **같은 숫자**다 (lib/monthly 의 summarize).
              집에서 "이번 달 어땠어?" 를 물을 때 둘이 같은 것을 보게 된다. */}
          <div className="card">
            <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
              <h2 style={{ margin: 0, fontSize: 17.5, fontWeight: 800 }}>
                이번 달 현황 ({Number(ym.slice(5, 7))}월)
              </h2>
              <span className="hint">수업 {withItems.length}회</span>
            </div>
            {notes.has("parent.month") ? (
              <ScreenNote text={N("parent.month")} style={{ margin: "2px 0 10px" }} />
            ) : (
              <p className="hint" style={{ margin: "2px 0 10px", fontSize: 12.5 }}>
                달이 끝나기 전에도 <b>지금까지</b>를 그대로 세어 보여드립니다.
                아이 화면에도 <b>같은 숫자</b>가 보입니다.
              </p>
            )}

            {withItems.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 15 }}>
                이번 달은 아직 수업 기록이 없어요.
              </p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {lines.map((l) => (
                  <div className="row" key={l.key} style={{ gap: 8, alignItems: "baseline" }}>
                    <b style={{ fontSize: 14.5, minWidth: 62 }}>{l.label}</b>
                    <span className={`tag ${TONE_CLS[l.tone]}`}>{l.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
      </>
    ),
    schedule: (
      <>
          {/* ── 3. 일정 및 전달사항 — 한 덩어리로 ──────────────────
              전에는 공지가 화면 아래쪽에 있었다. 알림톡을 끊었으니 이제
              이 자리가 학원에서 오는 말이 닿는 유일한 곳이다 — 위로 올린다. */}
          {(upcoming.length > 0 || notices.length > 0) && (
            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 17.5, fontWeight: 800 }}>일정 및 전달사항</h2>
              <ScreenNote text={N("parent.schedule")} />

              {upcoming.length > 0 && (
                <div className="stack" style={{ gap: 4, marginBottom: notices.length ? 14 : 0 }}>
                  {upcoming.map((c, i) => (
                    <div className="unitrow" key={`${c.date}-${i}`}>
                      <span className="hint" style={{ minWidth: 74 }}>
                        {shortLabel(c.date)}
                        {c.endDate && c.endDate !== c.date ? " ~" : ""}
                      </span>
                      <span style={{ fontSize: 15, flex: 1 }}>{cleanTitle(c.title)}</span>
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
                        {n.title && <b style={{ fontSize: 15 }}>{n.title}</b>}
                        <span className="spacer" />
                        {!preview && (
                          <NoticeDismiss
                            studentId={pickId}
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

              {upcoming.length === 0 && (
                <p className="hint" style={{ margin: 0 }}>앞으로 잡힌 일정이 없어요.</p>
              )}
            </div>
          )}
      </>
    ),
    homework: (
      <>
          {/* ── 4. 지금 나간 숙제 ──────────────────────────────────
              「오늘 숙제 뭐야」 는 집에서 매일 나오는 말이다. 전에는 아이
              화면에만 있어서 어머니는 아이 말을 믿는 수밖에 없었다.

              **여기서는 누를 것이 없다.** 체크도 타이머도 아이 화면 것이다 —
              두 군데서 체크하면 두 군데가 반드시 어긋난다. */}
          <div className="card">
            <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 17.5, fontWeight: 800 }}>
                지금 나간 숙제 {homework.length > 0 && <span className="tag tag-lav">{homework.length}</span>}
              </h2>
              {assignedFrom && <span className="hint">{shortLabel(assignedFrom.date)} 수업에서</span>}
            </div>

            {homework.length === 0 ? (
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 15 }}>
                지금 나간 숙제가 없어요. 수업에서 다음 숙제를 정하면 여기에 뜹니다.
              </p>
            ) : (
              <>
                <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                  {homework.map((c) => (
                    <div key={c.key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 14.5, lineHeight: 1.6 }}>☐</span>
                      <span style={{ fontSize: 15, lineHeight: 1.6, flex: 1 }}>
                        {c.name}
                        {/* 무엇으로 하는 숙제인지 (0116) — 아이 화면과 같은 값 */}
                        {c.tool && <span className="hint"> [{c.tool}]</span>}
                        {c.units.length > 0 && <> — {c.units.join(", ")}</>}
                        {cleanNote(c.note) && <> {cleanNote(c.note)}</>}
                        {c.changedAt && (
                          <span className="tag tag-amber" style={{ marginLeft: 4, fontSize: 12 }}>
                            바뀜
                          </span>
                        )}
                        {c.doneAt && (
                          <span className="tag tag-mint" style={{ marginLeft: 4, fontSize: 12 }}>
                            아이가 완료 표시
                          </span>
                        )}
                        {c.checkNote && (
                          <div className="hint" style={{ marginTop: 2 }}>💬 선생님: {c.checkNote}</div>
                        )}
                        {/* 하는 법 — 아이 화면에 있는 것과 같은 값 (값-지도 P1-10).
                            서버 컴포넌트라 details 로 접는다 */}
                        {c.method && (
                          <details style={{ marginTop: 2 }}>
                            <summary className="hint" style={{ cursor: "pointer" }}>하는 법</summary>
                            <div className="hint" style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{c.method}</div>
                          </details>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {/* 원장님이 적으시면 그 말이 대신 나온다 (parent.month 와 같은 관례) */}
                {notes.has("parent.homework") ? (
                  <ScreenNote text={N("parent.homework")} style={{ margin: "10px 0 0" }} />
                ) : (
                  <p className="hint" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
                    아이 화면에 뜨는 것과 <b>같은 목록</b>입니다.
                    <b> 완료 표시</b>는 아이가 직접 누른 것이고, 실제 검사는 다음 수업에서 합니다.
                    {homework.some((c) => c.changedAt) && (
                      <> <b>바뀜</b> 은 선생님이 나중에 더하거나 고치신 것이에요.</>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
      </>
    ),
    lessons: (
      <>
          {/* ── 5. 최근 수업 ───────────────────────────────────────
              전에는 문자로 보내려고 만든 글을 통째로 띄웠다. 앱에서는
              출결·점수·진도를 나눠 보여주는 편이 훨씬 빨리 읽힌다.
              원장님이 쓰신 글 전문은 접어두고, 보고 싶으실 때 펴신다. */}
          {lessons.length > 0 && (
            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 17.5, fontWeight: 800 }}>최근 수업</h2>
              <ScreenNote text={N("parent.lessons")} />
              {/**
                * **가장 최근 것 하나만 펴둔다** (원장님, 2026-08-07 —
                * 「데일리리포트의 코멘트, 성장은 예민한 부분이야. 가장 최근의
                * 것 1개를 보여주고, 나머지는 필요시 확인할 수 있게 해줘」).
                *
                * 지난 수업 넉 줄이 나란히 있으면 어머니는 **줄을 세로로 읽으며
                * 견주신다** — 「지난주는 90점인데 이번주는 70점」. 한 회차의
                * 점수는 그날 컨디션인데, 늘어놓으면 흐름처럼 읽힌다.
                * 흐름은 성장 카드가 따로 보여드리는 것이고, 이 칸은
                * **오늘 무슨 일이 있었나**를 말하는 자리다.
                *
                * 지운 것이 아니다 — 아래 접힌 곳에 그대로 있다.
                */}
              <div className="stack" style={{ gap: 14 }}>
                {lessons.slice(0, 1).map((r) => (
                  <div key={r.id} className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                      <b style={{ fontSize: 15 }}>{longLabel(r.date)}</b>
                      {r.attendance && (
                        <span className={`tag ${r.attendance === "absent" ? "tag-red" : "tag-mint"}`}>
                          {ATT_LABEL[r.attendance] || r.attendance}
                        </span>
                      )}
                      {r.checked > 0 && (
                        <span className="hint" style={{ fontSize: 13 }}>
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
                          <span style={{ fontSize: 14.5 }}>{score(r.word_correct, r.word_total)}</span>
                        </div>
                      ) : null}
                      {r.sent_total ? (
                        <div className="row" style={{ gap: 8 }}>
                          <span className="plabel" style={{ width: 46 }}>문법</span>
                          <span style={{ fontSize: 14.5 }}>{score(r.sent_correct, r.sent_total)}</span>
                        </div>
                      ) : null}
                      {r.own_progress ? (
                        <div className="row" style={{ gap: 8 }}>
                          <span className="plabel" style={{ width: 46 }}>진도</span>
                          <span style={{ fontSize: 14.5 }}>{r.own_progress}</span>
                        </div>
                      ) : null}
                    </div>

                    {/* 선생님이 그날 학부모께 적으신 말 — 있으면 그게 제일 중요하다 */}
                    {r.notice && (
                      <div className="notice" style={{ fontSize: 14.5 }}>{r.notice}</div>
                    )}

                    {/* 원장님이 쓰신 리포트 전문. 길어서 접어둔다 */}
                    {r.reportText && (
                      <details>
                        <summary className="hint" style={{ cursor: "pointer", fontSize: 14 }}>
                          이 날 리포트 전문 보기
                        </summary>
                        <div style={{ fontSize: 14.5, whiteSpace: "pre-wrap", marginTop: 6 }}>
                          {r.reportText}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>

              {/* 나머지는 접어둔다 — 지운 것이 아니라 **필요하실 때** 여신다 */}
              {lessons.length > 1 && (
                <details style={{ marginTop: 12 }}>
                  <summary className="hint" style={{ cursor: "pointer", fontSize: 14 }}>
                    지난 수업 {lessons.length - 1}회 더 보기
                  </summary>
                  <div className="stack" style={{ gap: 12, marginTop: 10 }}>
                    {lessons.slice(1).map((r) => (
                      <div key={r.id} className="stack" style={{ gap: 4 }}>
                        <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                          <b style={{ fontSize: 14.5 }}>{longLabel(r.date)}</b>
                          {r.attendance && (
                            <span className={`tag ${r.attendance === "absent" ? "tag-red" : "tag-mint"}`}>
                              {ATT_LABEL[r.attendance] || r.attendance}
                            </span>
                          )}
                          {r.word_total ? (
                            <span className="hint">단어 {score(r.word_correct, r.word_total)}</span>
                          ) : null}
                          {r.sent_total ? (
                            <span className="hint">문법 {score(r.sent_correct, r.sent_total)}</span>
                          ) : null}
                        </div>
                        {r.own_progress && (
                          <div className="hint" style={{ fontSize: 14 }}>{r.own_progress}</div>
                        )}
                        {r.notice && (
                          <div className="notice" style={{ fontSize: 14 }}>{r.notice}</div>
                        )}
                        {r.reportText && (
                          <details>
                            <summary className="hint" style={{ cursor: "pointer", fontSize: 13 }}>
                              이 날 리포트 전문 보기
                            </summary>
                            <div style={{ fontSize: 14, whiteSpace: "pre-wrap", marginTop: 6 }}>
                              {r.reportText}
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
      </>
    ),
    scores: (
      <>
          {/* **성장 카드가 먼저다.** 「무슨 시험을 몇 점 받았다」 보다
              「올라가고 있나, 어디가 약한가」 를 먼저 보신다 (0101) */}
          {["mock", "school"].map((k) =>
            growth[k] ? (
              <GrowthCard key={k} st={growth[k]} kindLabel={KIND_LABEL[k]} />
            ) : null
          )}
          {/* 단원평가 흐름 — 아이 화면과 **같은 것**을 보신다 */}
          <UnitCard scores={scores || []} forParent />

          {/* ── 6. 성적 ── */}
          {(scores || []).length > 0 && (
            <div className="card">
              <h2 style={{ margin: "0 0 8px", fontSize: 17.5, fontWeight: 800 }}>성장</h2>
              <ScreenNote text={N("parent.scores")} />
              <div className="stack" style={{ gap: 10 }}>
                {["school", "mock", "unit"].map((k) => {
                  const list = scoreGroups[k] || [];
                  if (list.length === 0) return null;
                  return (
                    <div key={k}>
                      <b style={{ fontSize: 14.5 }}>{KIND_LABEL[k]}</b>
                      {/* **가장 최근 것 하나만.** 점수를 넉 줄 늘어놓으면
                          세로로 읽으며 견주시게 된다 — 흐름은 위 성장 카드가
                          보여드리는 몫이다 (원장님, 2026-08-07) */}
                      <div className="stack" style={{ gap: 3, marginTop: 4 }}>
                        {list.slice(0, 1).map((s) => (
                          <div className="unitrow" key={s.id}>
                            <span className="hint" style={{ minWidth: 68 }}>
                              {s.taken_on ? s.taken_on.slice(2).replaceAll("-", ".") : ""}
                            </span>
                            <b style={{ fontSize: 14, minWidth: 110 }}>{s.term || ""}</b>
                            <span style={{ fontSize: 14, flex: 1 }}>
                              {scoreSummary(s, findExam(s, exams || [], child))}
                            </span>
                          </div>
                        ))}
                      </div>
                      {list.length > 1 && (
                        <details style={{ marginTop: 4 }}>
                          <summary className="hint" style={{ cursor: "pointer", fontSize: 13 }}>
                            지난 {KIND_LABEL[k]} {list.length - 1}건 더 보기
                          </summary>
                          <div className="stack" style={{ gap: 3, marginTop: 6 }}>
                            {list.slice(1, 8).map((s) => (
                              <div className="unitrow" key={s.id}>
                                <span className="hint" style={{ minWidth: 68 }}>
                                  {s.taken_on ? s.taken_on.slice(2).replaceAll("-", ".") : ""}
                                </span>
                                <b style={{ fontSize: 14, minWidth: 110 }}>{s.term || ""}</b>
                                <span style={{ fontSize: 14, flex: 1 }}>
                                  {scoreSummary(s, findExam(s, exams || [], child))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
      </>
    ),
    monthly: (
      <>
          {/* ── 7. 월간리포트 — 최근 것만 펴둔다 ────────────────────
              세 달치를 다 펼쳐놓으니 스크롤이 끝없이 길었다. 지난달 것은
              다시 읽으실 일이 드물다 — 접어두고 필요할 때 펴신다. */}
          {monthlyRows.length > 0 && (
            <div className="card">
              <h2 style={{ margin: "0 0 8px", fontSize: 17.5, fontWeight: 800 }}>월간리포트</h2>
              <ScreenNote text={N("parent.monthly")} />
              <div className="stack" style={{ gap: 12 }}>
                {monthlyRows.map((m, i) => (
                  <details key={m.ym} open={i === 0}>
                    <summary style={{ cursor: "pointer", fontSize: 15, fontWeight: 700 }}>
                      {m.ym.replace("-", "년 ")}월
                    </summary>
                    <div style={{ fontSize: 14.5, whiteSpace: "pre-wrap", marginTop: 6 }}>{m.text}</div>
                  </details>
                ))}
              </div>
            </div>
          )}
      </>
    ),
    calendar: (
      <>
          {/* ── 8. 달력 ── */}
          {calendar.length > 0 && (
            <>
              <ScreenNote text={N("parent.calendar")} tone="card" />
              <DashCalendar ym={ym} items={calendar} today={today} links={false} />
            </>
          )}
      </>
    ),
    request: (
      <>
          {/* ── 9. 보내기 · 남기실 말씀 ────────────────────────────
              알림톡을 끊었으니 **여기가 학원에 말을 거는 자리**다.
              아래쪽에 두되, 무엇을 하는 자리인지 한 줄 적어둔다. */}
          {!preview && (
            <>
              {/* 사야 할 교재 — 안내 문자에만 있던 구매링크·교재비를 앱에도
                  (값-지도 P1-18). 시작 전 배정이 있을 때만 나온다 */}
              {buyBooks.length > 0 && (
                <div className="card card-tight">
                  <b style={{ fontSize: 15 }}>📚 준비할 교재</b>
                  <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                    {buyBooks.map((b) => (
                      <div key={b.id} className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <b style={{ fontSize: 14 }}>{b.name}</b>
                        {b.from && <span className="tag tag-amber">{fromLabel(b.from)} 씁니다</span>}
                        {b.price ? (
                          <span className="hint">{Number(b.price).toLocaleString()}원</span>
                        ) : null}
                        {b.url && (
                          <a className="btn btn-sm" href={b.url} target="_blank" rel="noreferrer">
                            구매하러 가기 ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* 원장님이 적으시면 그 말이 대신 나온다 (parent.month 와 같은 관례) */}
                  {notes.has("parent.books") ? (
                    <ScreenNote text={N("parent.books")} style={{ margin: "6px 0 0" }} />
                  ) : (
                    <p className="hint" style={{ margin: "6px 0 0", lineHeight: 1.7 }}>
                      수업에 쓰기 시작하는 날 전까지 준비해 주세요. 구하기 어려우시면
                      아래 보내기로 말씀해 주세요.
                    </p>
                  )}
                </div>
              )}
              {/* 다음 달 일정 1차 확인 (0123) — 카드가 위 (원장님, 2026-08-15 —
                  「카드가 위에 있는 게 나음」). 문구가 「아래 보내기」 를 가리킨다 */}
              <MonthConfirm
                studentId={pickId}
                ym={nextMonthYm}
                parentAt={confirmQ?.data?.parent_at || null}
                childName={child?.name || ""}
              />
              <RequestForm studentId={pickId} mine={myReqs || []} />
              {notes.has("parent.request") ? (
                <ScreenNote text={N("parent.request")} style={{ margin: "-4px 2px 0" }} />
              ) : (
                <p className="hint" style={{ margin: "-4px 2px 0", lineHeight: 1.7 }}>
                  결석 · 보강 · 그 밖의 말씀은 여기로 보내주시면 선생님이 확인합니다.
                  전화 주셔도 되지만, 여기로 보내주시면 <b>기록이 남아</b> 빠뜨리지 않습니다.
                </p>
              )}
            </>
          )}
      </>
    ),
    comments: (
      <>
          {latest && (
            <div className="card">
              <h2 style={{ margin: "0 0 8px", fontSize: 17.5, fontWeight: 800 }}>남기실 말씀</h2>
              {/* 원장님이 적으시면 그 말이 대신 나온다 (parent.month 와 같은 관례) */}
              {notes.has("parent.comments") ? (
                <ScreenNote text={N("parent.comments")} style={{ margin: "0 0 8px" }} />
              ) : (
                <p className="hint" style={{ margin: "0 0 8px" }}>
                  최근 수업({longLabel(latest.date)})에 대해 궁금한 것을 남기시면 선생님이 답합니다.
                </p>
              )}
              <Comments reportId={latest.id} studentId={pickId} me={preview ? "staff" : "parent"} />
            </div>
          )}
      </>
    ),
  };

  return (
    // 넓은 화면에서는 나란히 (학생 화면과 같은 까닭 — 2026-08-07)
    <main className="wrap" style={{ maxWidth: 1180, paddingBottom: 40 }}>
      {preview && (
        <div className="card card-tight" style={{ marginBottom: 10, borderLeft: "3px solid var(--amber)" }}>
          <b style={{ fontSize: 14.5 }}>미리보기</b>
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
          {recent.find(isLesson) ? ` · 최근 수업 ${longLabel(recent.find(isLesson).date)}` : ""}
        </p>
      </div>

      {/* **아이 탭은 제목 바로 아래** (원장님 확정 2026-08-27 — 학생 우선
          계층). 탭 아래 화면 전체가 고른 아이 것이라, 탭이 다른 것들 사이에
          끼어 있으면 「지금 누구 화면인가」 부터 헷갈린다. 아이가 하나면 안
          그린다 — 고를 것이 없는 탭은 자리만 차지한다 */}
      {children.length > 1 && <ChildPicker children={children} pick={pickId} />}

      {/* 홈 화면에 담은 앱에는 주소창이 없다 — 여기 없으면 새로고침할 방법이 없다 */}
      {!preview && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Refresh />
        </div>
      )}

      {/* **안 켜신 분께는 위에서 한 번 더.** 알림 칸은 메뉴 줄의 🔔 뒤에
          있는데, 안 켜져 있으면 열어 보실 일이 없다. 켜면 사라진다 */}
      {/* 어머니 화면에서는 **한 줄만** (2026-08-07). 왜 켜야 하는지·요금
          이야기는 다 맞는 말이지만 첫 화면에서 읽으실 글이 아니다 */}
      {!preview && <div style={{ marginTop: 10 }}><PushToggle onlyWhenOff brief /></div>}

      {/* **답을 안 하신 보강은 첫 화면에** (원장님, 2026-08-07).
          답을 주셔야 그 시간을 비워두거나 다른 날로 옮길 수 있다.
          답하시면 사라진다 — 그래서 잔소리로 남지 않는다.
          형제가 있으면 **둘 다** 본다 (아이를 고른 것과 상관없이 —
          다른 아이 보강을 못 보고 지나가면 안 된다) */}
      {!preview && <MakeupConfirm studentIds={children.map((c) => c.id)} />}

      <div className="stack" style={{ marginTop: 10 }}>
        <ScreenNote text={N("parent.top")} tone="card" />
        {/* 「오늘」 은 폭을 다 쓴다 — 어머니가 제일 먼저 보시는 것이라
            반쪽으로 접히면 안 된다 */}
        <SectionNav
          page="parent"
          order={blockOrder}
          /**
           * **알림 설정은 메뉴 줄의 🔔 뒤로** (원장님 2026-08-27 — 「어플가이드
           * 처럼 아이콘으로 알림설정을 추가해줘. 페이지 맨 밑마다 나오는 건
           * 별로같아」 + 「학부모도 마찬가지야」). 8/7 의 「맨 밑으로」 판단
           * (한 번 켜면 다시 볼 일이 없는 칸)은 그대로 — 그래서 상시 카드가
           * 아니라 눌러야 열린다. 미리보기에서는 전처럼 안 준다 — 원장님
           * 브라우저의 구독 상태가 어머니 것인 척 보이면 안 된다.
           */
          alert={!preview ? <AlertBox brief /> : null}
        />
        {!isStaff && <NoticeGate page="parent" notices={notices} />}
        <div className="blockgrid">
          {blockOrder.map((k) => (
            <div key={k} id={`blk-${k}`} className={k === "today" ? "fullrow" : undefined}>
              {BLOCKS[k]}
            </div>
          ))}
        </div>

        {/* 알림 설정 카드는 메뉴 줄의 🔔 팝업으로 올라갔다 (원장님 2026-08-27
            「학부모도 마찬가지야」) — 맨 아래에는 로그아웃만 남는다 */}
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
