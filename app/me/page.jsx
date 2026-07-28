import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PushToggle from "./PushToggle";
import InstallHint from "./InstallHint";
import { score } from "@/lib/wordTest";
import StudyTabs from "./StudyTabs";
import ArrivalCard from "./ArrivalCard";
import { trend, avgSeconds } from "@/lib/trend";
import { headers } from "next/headers";
import { pickIp, sameNet } from "@/lib/clientIp";
import { pct } from "@/lib/wordTest";
import HomeworkCards from "./HomeworkCards";
import Comments from "@/app/comments/Comments";
import { STAY_LABEL } from "@/lib/reportText";
import RequestForm from "./RequestForm";
import TryoutBar from "./TryoutBar";
import LinkCode from "./LinkCode";
import ChangePw from "./ChangePw";
import { longLabel as fmtLong, todaySeoul } from "@/lib/day";

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
      .select(`${BASE}, textbook_unit_id, textbook_unit_ids, range_note, student_done_at`)
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
    .select("id, name, category, method, sort, no_timer, word_test, checklist");
  if (itemErr) {
    ({ data: items, error: itemErr } = await supabase
      .from("homework_items")
      .select("id, name, category, method, sort, no_timer"));
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
  const { data: myRequests } = await supabase
    .from("requests")
    .select("id, kind, from_date, to_date, body, status, reply")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(5);

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
  const atClass =
    !!arrival.attend_at || ["present", "late", "makeup", "online"].includes(attToday);

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
    if (!x.ended_at) running = { key, started_at: x.started_at };
  });

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

      <div className="stack" style={{ gap: 14, marginTop: 12 }}>
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
          readOnly={preview}
          asId={acting ? student.id : null}
          subs={subs}
        />

        {!preview && !acting && <RequestForm studentId={student.id} mine={myRequests || []} />}

        <div className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>
            해야 할 숙제 {todo.length > 0 && <span className="tag tag-lav">{todo.length}</span>}
          </h2>
          <p className="hint" style={{ margin: "0 0 12px" }}>
            숙제를 누르면 <b>하는 법</b>이 나와요.
          </p>
          <HomeworkCards items={todo} />

          {/* 안 뜨면 왜 안 뜨는지 선생님께만 알려준다.
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
          {latest && (
            <div style={{ marginTop: 10 }}>
              <p className="hint" style={{ margin: "0 0 6px" }}>
                숙제나 수업에 대해 궁금한 게 있으면 여기에 남겨주세요. 선생님이 확인합니다.
              </p>
              <Comments reportId={latest.id} studentId={student.id} me={myRole} />
            </div>
          )}
        </div>

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

        {notices.length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>
              공지{" "}
              <span className="tag tag-amber" style={{ fontSize: 11 }}>
                선생님께만 보임
              </span>
            </h2>
            <p className="hint" style={{ margin: "-6px 0 8px", fontSize: 12 }}>
              학부모께 나가는 문장입니다. 학생 화면에는 나오지 않습니다.
            </p>
            <div className="stack" style={{ gap: 6 }}>
              {notices.map((n) => (
                <div key={n.date}>
                  <span className="hint">{dayLabel(n.date)}</span>
                  <div style={{ fontSize: 13.5 }}>{n.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form action="/logout" method="post">
          <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
