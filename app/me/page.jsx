import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PushToggle from "./PushToggle";
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
import TryoutBar from "./TryoutBar";
import LinkCode from "./LinkCode";
import ChangePw from "./ChangePw";
import { addDays, dowOf, longLabel as fmtLong, todaySeoul } from "@/lib/day";
import NoticePhotos from "@/components/NoticePhotos";
import VideoList from "./VideoList";
import DashCalendar from "@/app/DashCalendar";
import Refresh from "@/components/Refresh";

export const dynamic = "force-dynamic";

const dayLabel = fmtLong;

export default async function MePage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    .select("id, name, school, grade, word_when")
    .eq("profile_id", user.id)
    .maybeSingle();

  // 선생님이 학생 화면을 그대로 보는 미리보기 (?s=학생id)
  //   아이가 무엇을 보는지 모르면 "저기 눌러" 라고 말해줄 수가 없다.
  //   보기만 하고 누르지는 못한다 — 선생님이 대신 눌러버리면 기록이 거짓이 된다.
  const isStaff = ["principal", "instructor", "assistant"].includes(profile?.role);
  const previewId = isStaff ? searchParams?.s : null;
  if (previewId) {
    const { data: s2 } = await supabase
      .from("students")
      .select("id, name, school, grade, word_when")
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
        .select("id, name, school, grade")
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
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            이 화면은 학생용이에요. 선생님 화면은 위 메뉴에서 볼 수 있습니다.
          </p>
        </div>
      </main>
    );
  }

  // 가장 최근 수업의 리포트 = 지금 해야 할 숙제가 담긴 곳
  const REP_BASE =
    "id, date, own_progress, notice, word_correct, word_total, sent_correct, sent_total";
  // 수업 기록은 미래일 수 없다.
  //   노션에서 연도 없는 "12/30" 을 올해로 붙여 들여온 적이 있어서,
  //   지난주에 수업하고도 "최근 수업 12월 30일" 이 떴다. 들여오기는 고쳤지만
  //   이미 들어간 것이 있을 수 있으므로 읽을 때도 오늘까지만 본다.
  const todayStr = todaySeoul();
  let { data: reports, error: repErr } = await supabase
    .from("daily_reports")
    .select(`${REP_BASE}, phone_in, homework_in, word_when`)
    .eq("student_id", student.id)
    .lte("date", todayStr)
    .order("date", { ascending: false })
    .limit(6);
  if (repErr) {
    // 0037 전이면 등원 절차 없이
    ({ data: reports } = await supabase
      .from("daily_reports")
      .select(REP_BASE)
      .eq("student_id", student.id)
      .lte("date", todayStr)
      .order("date", { ascending: false })
      .limit(6));
  }

  // 내가 낸 숙제 (0044 전이면 빈 값 — 화면은 그대로 뜬다)
  const { data: subRows } = await supabase
    .from("homework_submissions")
    .select("id, kind, path, body, seconds, checked_at, created_at, homework_item_id, report_item_id")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(60);
  const subs = {};
  (subRows || []).forEach((x) => {
    const k = x.report_item_id || x.homework_item_id;
    if (!k) return;
    (subs[k] = subs[k] || []).push(x);
  });

  const latest = reports?.[0] || null;
  const reportIds = (reports || []).map((r) => r.id);

  let dri = [];
  if (reportIds.length > 0) {
    const BASE = "id, daily_report_id, homework_item_id, status";
    let { data, error } = await supabase
      .from("daily_report_items")
      .select(`${BASE}, textbook_unit_id, textbook_unit_ids, range_note, student_done_at, changed_at`)
      .in("daily_report_id", reportIds);
    if (error) {
      ({ data, error } = await supabase
        .from("daily_report_items")
        .select(`${BASE}, textbook_unit_id, textbook_unit_ids, range_note`)
        .in("daily_report_id", reportIds));
    }
    if (error) {
      ({ data } = await supabase.from("daily_report_items").select(BASE).in("daily_report_id", reportIds));
    }
    dri = data || [];
  }

  // 숙제 항목 (학습 방법 포함)
  let { data: items, error: itemErr } = await supabase
    .from("homework_items")
    .select("id, name, category, method, sort, no_timer, word_test, checklist, in_person");
  if (itemErr) {
    ({ data: items, error: itemErr } = await supabase
      .from("homework_items")
      .select("id, name, category, method, sort, no_timer, word_test, checklist"));
  }
  if (itemErr) {
    ({ data: items, error: itemErr } = await supabase
      .from("homework_items")
      .select("id, name, category, method, sort"));
  }
  if (itemErr) {
    ({ data: items } = await supabase.from("homework_items").select("id, name, category"));
  }
  const itemById = new Map((items || []).map((i) => [i.id, i]));

  // 단원 이름
  const idsOf = (x) =>
    x.textbook_unit_ids && x.textbook_unit_ids.length
      ? x.textbook_unit_ids
      : x.textbook_unit_id
      ? [x.textbook_unit_id]
      : [];
  const unitIds = new Set();
  dri.forEach((x) => idsOf(x).forEach((id) => unitIds.add(id)));

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
    const { data: bookRows } = bookIds.length
      ? await supabase.from("textbooks").select("id, name").in("id", bookIds)
      : { data: [] };
    const bookName = new Map((bookRows || []).map((b) => [b.id, b.name]));
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

  const toCard = (x) => {
    const item = itemById.get(x.homework_item_id);
    return {
      key: `${x.daily_report_id}-${x.homework_item_id}-${x.status}`,
      reportItemId: x.id,
      doneAt: x.student_done_at || null,
      itemId: x.homework_item_id,
      name: item?.name || "숙제",
      method: item?.method || "",
      checklist: (item?.checklist || "")
        .split("\n").map((t) => t.trim()).filter(Boolean),
      units: idsOf(x).map((id) => unitLabel.get(id)).filter(Boolean),
      note: x.range_note || "",
      status: x.status,
      // 처음 받은 숙제가 아니라 **나중에 더하거나 고친 것** (0087).
      // 비어 있으면 그날 원래 받은 것이라 표시하지 않는다.
      changedAt: x.changed_at || null,
      area: item?.category || "",
    };
  };

  // 지금 해야 할 숙제 = **가장 최근에 배정한 것**
  //
  // 예전에는 '가장 최근 리포트' 만 봤다. 그런데 등원해서 출결을 찍으면 그날
  // 리포트가 새로 생기고, 그 순간 지난 수업에 낸 숙제가 통째로 사라졌다 —
  // 아직 검사도 안 했는데. 그래서 **숙제가 붙어 있는 가장 최근 리포트**를
  // 찾아서 그것을 보여준다.
  const assignedFrom = (reports || []).find((r) =>
    dri.some((x) => x.daily_report_id === r.id && x.status === "assigned")
  );
  const todo = assignedFrom
    ? dri.filter((x) => x.daily_report_id === assignedFrom.id && x.status === "assigned").map(toCard)
    : [];

  // 지난 수업 검사 결과
  const checked = latest
    ? dri.filter((x) => x.daily_report_id === latest.id && x.status !== "assigned").map(toCard)
    : [];

  // 내가 보낸 요청
  const REQ = "id, kind, from_date, to_date, body, status, reply";
  let { data: myRequests, error: reqErr } = await supabase
    .from("requests")
    .select(`${REQ}, photos`)
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(5);
  if (reqErr) {
    // 0068 전이면 사진 없이
    ({ data: myRequests } = await supabase
      .from("requests")
      .select(REQ)
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(5));
  }

  // 늦귀가 과제 — 아직 안 끝났거나 숙제로 넘어온 것
  const stayQ = await supabase
    .from("stay_tasks")
    .select("id, date, body, status")
    .eq("student_id", student.id)
    .order("date", { ascending: false })
    .limit(20);
  const stay = (stayQ.error ? [] : stayQ.data || []).filter(
    (t) => t.status === "todo" || t.status === "moved"
  );
  // 아직 손 안 댄 늦귀가 과제 — 이게 남아 있으면 집에 간 게 아니다
  const stayLeft = (stayQ.error ? [] : stayQ.data || []).filter((t) => t.status === "todo");

  // 오늘 등원 체크 — 학생이 직접 누른 것
  const todayRep = (reports || []).find((r) => r.date === todaySeoul()) || null;
  const aq = await supabase
    .from("arrival_checks")
    .select("phone_at, attend_at, homework_at")
    .eq("student_id", student.id)
    .eq("date", todaySeoul())
    .maybeSingle();
  const arrival = aq.error ? {} : aq.data || {};

  // 지금 등원 중인가.
  //   등원 중이면 화면은 **등원 중 할 일**로 열려야 한다. 집 숙제를 먼저
  //   펼쳐놓으면 아이가 학원에서 집 숙제를 하고 앉아 있는다.
  //   출석 체크를 눌렀거나, 선생님이 오늘 출결을 찍었으면 등원으로 본다.
  const attq = await supabase
    .from("attendance")
    .select("status")
    .eq("student_id", student.id)
    .eq("date", todaySeoul())
    .maybeSingle();
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
    const { data: mine } = await supabase
      .from("class_students")
      .select("class_id")
      .eq("student_id", student.id);
    const ids = (mine || []).map((m) => m.class_id);
    if (ids.length) {
      const { data: cls } = await supabase
        .from("classes")
        .select("id, name, days, start_time, end_time")
        .in("id", ids);
      myClasses = cls || [];
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
  const nq = await supabase.from("academy_net").select("ip");
  const allowedIps = (nq.error ? [] : nq.data || []).map((x) => x.ip);
  const atAcademy = sameNet(pickIp(headers()), allowedIps);
  const wordWhen = todayRep?.word_when || student.word_when || "start";

  // ── 오늘 할 것 (순서대로) ────────────────────────────────
  // 배정된 숙제 + 늦귀가 과제를 학습 항목 순서로 늘어놓는다.
  // 학생이 "뭐부터 하지?" 를 묻지 않아도 되게 하려는 것이다.
  const today = todaySeoul();
  let sessions = [];
  let timerReady = true;
  {
    const q = await supabase
      .from("study_sessions")
      .select("id, homework_item_id, stay_task_id, started_at, ended_at, seconds")
      .eq("student_id", student.id)
      .eq("date", today);
    if (q.error) timerReady = false;
    else sessions = q.data || [];
  }
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
  const { ym: myYm, from: myFrom } = monthRange(todayStr);
  const { data: monthReps } = await supabase
    .from("daily_reports")
    .select("id, date, attendance_kind, word_correct, word_total, sent_correct, sent_total")
    .eq("student_id", student.id)
    .gte("date", myFrom)
    .lte("date", todayStr);
  const mIds = (monthReps || []).map((r) => r.id);
  const { data: mItems } = mIds.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", mIds)
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
  const { data: myWarn } = await supabase
    .from("settings").select("config").eq("key", "warning").maybeSingle();
  const { data: myCutRow } = await supabase
    .from("students").select("word_cut_pct").eq("id", student.id).maybeSingle();
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
  let pastSessions = [];
  {
    const q = await supabase
      .from("study_sessions")
      .select("homework_item_id, seconds, date")
      .eq("student_id", student.id)
      .lt("date", today)
      .not("seconds", "is", null)
      .order("date", { ascending: false })
      .limit(300);
    if (!q.error) pastSessions = q.data || [];
  }
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
      doneAt: c.doneAt,
      needsCheck: !!it?.no_timer,
      checked: false,
      sort: it?.sort ?? 500,
      seconds: secOf.get(`item-${c.itemId}`) || 0,
      usual: usualOf(c.itemId),
      ...extra,
    };
  };

  // 오늘 학원에서 할 것 (선생님이 오늘 정해준 것)
  const inClass = (latest && latest.date === today
    ? dri.filter((x) => x.daily_report_id === latest.id && x.status === "inclass").map(toCard)
    : []
  )
    .map((c) => {
      const t = toTask(c);
      // 단어시험은 학생마다 보는 때가 다르다 — 맨 앞이거나 맨 뒤다
      const it = itemById.get(c.itemId);
      if (it?.word_test) t.sort = wordWhen === "end" ? 99000 : -1;
      return t;
    })
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ko"));

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
    const { data: rec } = await supabase
      .from("notice_receipts")
      .select("notice_id")
      .eq("student_id", student.id);
    const ids = [...new Set((rec || []).map((r) => r.notice_id))];
    if (ids.length) {
      let { data: rows } = await supabase
        .from("notices")
        .select("id, date, kind, title, photos, body")
        .in("id", ids)
        .gte("date", since)
        .order("date", { ascending: false });
      if (!rows) {
        // 0064 전이면 제목·사진 없이
        ({ data: rows } = await supabase
          .from("notices")
          .select("id, date, kind, body")
          .in("id", ids)
          .gte("date", since)
          .order("date", { ascending: false }));
      }
      // 학부모용 공지는 아이 화면에 띄우지 않는다 (0050 과 같은 이유)
      notice2 = (rows || []).filter((n) => myRole === "parent" || n.kind !== "notice");
    }
  }

  // 볼 영상 — 나에게 배정된 것만 (0065 전이면 빈 값, 화면은 그대로 뜬다)
  let myVideos = [];
  {
    const { data: asg } = await supabase
      .from("video_assignments")
      .select("video_id, due_on, assigned_on")
      .eq("student_id", student.id);
    const vids = [...new Set((asg || []).map((a) => a.video_id))];
    if (vids.length) {
      const { data: vrows } = await supabase
        .from("videos")
        .select("id, title, url, provider, vid, note, active")
        .in("id", vids);
      const { data: seen } = await supabase
        .from("video_views")
        .select("video_id, done_at, opened_at")
        .eq("student_id", student.id);
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
  const calFrom = addDays(today, -40);
  const calTo = addDays(today, 120);
  let calendar = [];
  {
    const { data: rows } = await supabase
      .from("tasks")
      .select("id, title, kind, due_on, end_on, source, category")
      .neq("kind", "todo")
      .gte("due_on", calFrom)
      .lte("due_on", calTo)
      .order("due_on", { ascending: true });
    calendar = (rows || []).map((t) => ({
      date: t.due_on,
      endDate: t.end_on || null,
      title: t.title,
      tone: t.source === "neis" ? "school" : "event",
    }));
  }

  // 내 수업일 — 반 요일로 찍는다.
  //   한 칸에 두 개까지만 보이므로 **수업이 먼저 오게** 앞에 붙인다.
  //   휴강까지 빼지는 않는다 — 휴강은 학원 일정으로 같은 칸에 뜨고,
  //   빼버리면 「그날 수업이 원래 있었다」 는 것 자체가 안 보인다.
  const classDays = [];
  if (myClasses.length > 0) {
    const label = (c) =>
      c.start_time ? `수업 ${c.start_time.slice(0, 5)}` : `수업${c.name ? ` ${c.name}` : ""}`;
    for (let d = calFrom; d <= calTo; d = addDays(d, 1)) {
      const dow = dowOf(d);
      myClasses
        .filter((c) => (c.days || []).includes(dow))
        .forEach((c) => classDays.push({ date: d, title: label(c), tone: "klass" }));
    }
  }

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
      .filter((e) => (!e.school || e.school === student.school))
      .filter((e) => (!e.grade || e.grade === student.grade))
      .forEach((e) =>
        examDays.push({
          date: e.from_date,
          endDate: e.to_date || null,
          title: e.name || "시험",
          tone: "exam",
        })
      );
  }

  // 내 결석 · 보강 — 지나간 것도 남긴다 (보강으로 채운 날이 보여야 한다)
  const attDays = [];
  {
    const q = await supabase
      .from("attendance")
      .select("date, status")
      .eq("student_id", student.id)
      .gte("date", calFrom)
      .lte("date", calTo);
    const LABEL = { absent: "결석", makeup: "보강", late: "지각", online: "온라인" };
    (q.error ? [] : q.data || [])
      .filter((a) => LABEL[a.status])
      .forEach((a) => attDays.push({ date: a.date, title: LABEL[a.status], tone: "absent" }));
  }

  // 내 것(수업·시험·결석)을 앞에 둔다 — 한 칸에 두 개까지만 보인다
  calendar = [...attDays, ...examDays, ...classDays, ...calendar];

  /**
   * **일정 및 전달사항** — 한 덩어리로 (원장님, 2026-08-06).
   *
   * 공지는 아래쪽에 흩어져 있었고 일정은 달력을 열어야 알 수 있었다.
   * 아이가 알아야 할 것은 「오늘부터 앞으로 무슨 일이 있나」 하나다.
   * 다가오는 것만, 몇 개만 — 지난 것까지 쌓이면 오늘 볼 것이 안 보인다.
   */
  const upcoming = [...examDays, ...calendar.filter((c) => c.tone === "school" || c.tone === "event")]
    .filter((c) => (c.endDate || c.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  // 수업 가이드 링크 (0089) — 설정에서 넣은 것이 그대로 뜬다.
  //   표가 아직 없어도 화면은 그대로 열려야 한다 (SQL 이 밀려 있을 수 있다).
  let guides = [];
  {
    const q = await supabase
      .from("class_guides")
      .select("id, title, url, note")
      .eq("active", true)
      .order("sort", { ascending: true });
    guides = q.error ? [] : q.data || [];
  }

  // 지금 뭐 하고 있다고 눌러뒀나 (0084) — 첫 그림에 채워둔다
  let myState = null;
  let stateOff = false;
  {
    const q = await supabase
      .from("student_activity")
      .select("state, updated_at")
      .eq("student_id", student.id)
      .maybeSingle();
    if (q.error) stateOff = true;
    else myState = q.data;
  }

  return (
    <main className="wrap" style={{ maxWidth: 560, paddingBottom: 40 }}>
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
            <b style={{ fontSize: 13.5 }}>학생 화면 미리보기</b>
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
          <>
            <InstallHint />
            <PushToggle />
          </>
        )}
        {/* 홈 화면에 담은 앱에는 주소창이 없다 — 여기 없으면 새로고침할 방법이 없다.
            아이 화면이라 오른쪽 끝에 작게 둔다 (누를 일이 자주 있으면 안 된다) */}
        {!preview && (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: -4 }}>
            <Refresh />
          </div>
        )}
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
            <div className="stack" style={{ gap: 5 }}>
              {monthLines.map((l) => (
                <div className="row" key={l.key} style={{ gap: 8, alignItems: "center" }}>
                  <span className="plabel" style={{ width: 52 }}>{l.label}</span>
                  <span className={`tag ${TONE_CLS[l.tone] || "tag-muted"}`}>{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 2. 일정 및 전달사항 — **한 덩어리로** ────────────────
            전에는 공지가 화면 아래쪽에 흩어져 있고 일정은 달력을 열어야
            알 수 있었다. 아이가 알아야 할 것은 「앞으로 무슨 일이 있나」
            하나다. 다가오는 것만, 몇 개만 — 지난 것까지 쌓이면 오늘 볼 것이
            안 보인다 (원장님, 2026-08-06). */}
        {(upcoming.length > 0 || notice2.length > 0 || notices.length > 0) && (
          <div className="card">
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>
              일정 및 전달사항
            </h2>

            {upcoming.length > 0 && (
              <div className="stack" style={{ gap: 4, marginBottom: notice2.length ? 14 : 0 }}>
                {upcoming.map((c, i) => (
                  <div className="unitrow" key={`${c.date}-${i}`}>
                    <span className="hint" style={{ minWidth: 74 }}>
                      {dayLabel(c.date)}
                      {c.endDate && c.endDate !== c.date ? " ~" : ""}
                    </span>
                    <span style={{ fontSize: 13.5, flex: 1 }}>{c.title}</span>
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

            {upcoming.length === 0 && notice2.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>앞으로 잡힌 일정이 없어요.</p>
            )}

            {/* 리포트의 '공지' 는 학부모께 나가는 문장이라 아이에게는 안 보인다.
                선생님이 미리보기로 볼 때만 여기 붙는다. */}
            {notices.length > 0 && (
              <div className="notice" style={{ marginTop: 12, fontSize: 12.5 }}>
                <b>선생님께만 보임 — 학부모께 나가는 문장</b>
                <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                  {notices.map((n) => (
                    <div key={n.date}>
                      <span className="hint">{dayLabel(n.date)}</span>
                      <div style={{ fontSize: 13 }}>{n.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
        />

        {/* 숙제가 안 뜨면 **왜 안 뜨는지** 선생님께만 알려준다.
            "왜 안 보이지" 를 앱 밖에서 알아내게 하면 안 된다. */}
        {todo.length === 0 && (isStaff || preview || acting) && (
          <div className="notice" style={{ fontSize: 12.5 }}>
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
            위는 하나씩 순서대로 하는 자리(타이머·체크)고, 여기는 한 번에 다
            보이는 자리다. 집에서 폰을 못 쓰는 아이가 찍어 가거나 적어 간다.
            (전에는 화면 맨 아래에 있었다. 자기 숙제와 멀리 떨어져 있으면
             거기까지 안 내려간다 — 그래서 각자 제 자리로 올렸다.) */}
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

        {latest && (latest.word_total || latest.sent_total || latest.own_progress) && (
          <div className="card">
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>지난 수업</h2>
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
                  <span style={{ fontSize: 13.5 }}>{latest.own_progress}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {checked.length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>지난 숙제 검사</h2>
            <HomeworkCards items={checked} />
          </div>
        )}

        {stay.length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>
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
                  <span style={{ fontSize: 13.5, flex: 1 }}>{t.body}</span>
                  <span className={`tag ${t.status === "moved" ? "tag-amber" : "tag-lav"}`}>
                    {t.status === "moved" ? "숙제로" : "남아서"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <VideoList videos={myVideos} asId={acting ? student.id : null} readOnly={preview} />

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
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>선생님께 질문</h2>
            <p className="hint" style={{ margin: "0 0 8px" }}>
              숙제나 수업에 대해 궁금한 게 있으면 여기에 남겨주세요. 선생님이 확인합니다.
            </p>
            <Comments reportId={latest.id} studentId={student.id} me={myRole} />
          </div>
        )}

        {/* ── 6. 수업 가이드 ──────────────────────────────────────
            카톡으로 보내주시던 안내(단어 외우는 법 · 수업 규칙 · 교재 사는 곳).
            카톡은 하루 만에 밀려 올라가고 새로 온 아이에게는 아예 안 간다.
            여기 붙여두면 **언제든 그 자리에 있다** (설정 → 수업 가이드 링크). */}
        {guides.length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>수업 가이드</h2>
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
                  <span style={{ fontSize: 13.5, fontWeight: 700, flex: 1 }}>{g.title}</span>
                  {g.note && <span className="hint">{g.note}</span>}
                  <span className="tag tag-sky">열기 →</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── 7. 달력 — 수업일 · 시험 · 결석 ─────────────────────── */}
        {calendar.length > 0 && (
          <DashCalendar ym={today.slice(0, 7)} items={calendar} today={today} links={false} />
        )}

        <form action="/logout" method="post">
          <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
