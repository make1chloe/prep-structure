import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import ReportSender from "./ReportSender";
import NoticeSender from "./NoticeSender";
import LateSender from "./LateSender";
import SendTabs from "./SendTabs";
import SendTodo from "./SendTodo";
import ResendBoard from "../resend/ResendBoard";
import TestSender from "./TestSender";
import { loadReportRows } from "@/lib/reportData";
import { fill } from "@/lib/noticeFill";
import { runDueSends } from "./scheduleActions";
import { listScheduled } from "./scheduleActions";
import { loadSettings } from "@/lib/settings";
import { channelPlan } from "@/lib/alimtalk";
import { todaySeoul, addDays } from "@/lib/day";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

export default async function ReportPage(props) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const user = await sessionUser(supabase);

  const date = searchParams?.d || todaySeoul();

  const t = searchParams?.t;
  // 첫 화면은 「보낼 것」 모아보기 (원장님, 2026-08-16). 리포트 탭은 t=report 로
  const tab =
    t === "notice" ? "notice"
    : t === "hw" ? "hw"
    : t === "late" ? "late"
    : t === "resend" ? "resend"
    : t === "test" ? "test"
    : t === "report" ? "report"
    : "todo";

  // 테스트 발송 탭 — 학생 전체와, 알림톡이 붙은 문구
  // **파도** (속도 대원칙 — 원칙 6)
  const none = Promise.resolve({ data: [] });
  const [profileQ, ssQ, ttQ, settings, tplQ] = await Promise.all([
    user
      ? cachedProfile(supabase, user.id)
      : Promise.resolve({ data: null }),
    // 상태로 거르지 않는다. 테스트용 학생은 **'예비' 로 만들어 두는 게 낫다** —
    // 재원으로 만들면 오늘 수업·월간리포트·수강료에 계속 끼어든다.
    tab === "test"
      ? supabase
          .from("students")
          .select("id, name, parent_phone, student_phone, status")
          .order("name", { ascending: true })
      : none,
    tab === "test"
      ? supabase
          .from("message_templates")
          .select("id, name, alimtalk_id")
          .eq("active", true)
          .order("sort", { ascending: true })
      : none,
    loadSettings(supabase),
    // 이 화면에서 나가는 것이 **알림톡인지 문자인지** 보내기 전에 알아야 한다.
    // 다 보내고 나서 "이거 문자로 나갔네" 를 알면 늦다.
    supabase.from("message_templates").select("id, name, key, alimtalk_id, active").not("key", "is", null),
  ]);

  /**
   * **보낼 것 모아보기** — 흩어진 미발송을 한 판에 (2026-08-16).
   * 셈은 메뉴 배지(lib/menuBadges)와 같은 기준: 리포트는 지난 한 달의
   * 쓰고 안 보낸 것(「안 보냄」 처리 제외), 교재는 안내 안 나간 사용 예정
   * (0125), 월간은 월말 사흘 전부터.
   */
  let todoData = null;
  if (tab === "todo") {
    // 때가 된 예약부터 내보낸다 — 이 화면이 열리는 것이 곧 시계다 (0126)
    try { await runDueSends(); } catch { /* 보낼 것 화면은 그대로 선다 */ }

    const today = todaySeoul();
    const ym = today.slice(0, 7);
    const [unsentQ, stuQ, pendQ, monQ, bookTplQ, schedQ] = await Promise.all([
      supabase
        .from("daily_reports")
        .select("id, student_id, date, skip_kinds")
        .eq("report_written", true).is("sent_at", null).is("archived_at", null)
        .gte("date", addDays(today, -30)).lte("date", today)
        .order("date", { ascending: false }),
      supabase.from("students").select("id, name, status, enrolled_on, parent_phone").eq("status", "enrolled"),
      supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, assigned_on")
        .eq("status", "active").is("notified_on", null).gt("assigned_on", today),
      supabase.from("monthly_reports").select("id", { count: "exact", head: true }).eq("ym", ym),
      // 교재 안내 문구 — 학생마다 제 교재로 채워 보낸다 (lib/noticeFill 한 벌)
      supabase.from("message_templates")
        .select("id, body").eq("kind", "book").eq("active", true).is("key", null)
        .order("sort", { ascending: true }).limit(1),
      listScheduled(),
    ]);
    const stuOf = new Map((stuQ.data || []).map((x) => [x.id, x]));

    const byDate = new Map();
    (unsentQ.error ? [] : unsentQ.data || [])
      .filter((r) => !(r.skip_kinds || []).includes("report"))
      .forEach((r) => {
        const st = stuOf.get(r.student_id);
        if (!st) return;   // 퇴원생 지난 리포트는 재촉하지 않는다
        if (!byDate.has(r.date)) byDate.set(r.date, []);
        byDate.get(r.date).push({ id: r.id, name: st.name });
      });
    const unsentByDate = [...byDate.entries()].map(([d, items]) => ({ date: d, items }));

    const pend = pendQ.error ? [] : pendQ.data || [];   // 0125 전이면 비어 있다
    const bookIds = [...new Set(pend.map((x) => x.textbook_id))];
    const { data: tbs } = bookIds.length
      ? await supabase.from("textbooks").select("id, name, price, purchase_url").in("id", bookIds)
      : { data: [] };
    const tbOf = new Map((tbs || []).map((b) => [b.id, b]));
    const bookTpl = bookTplQ.error ? null : (bookTplQ.data || [])[0] || null;
    const waitOf = new Map();
    pend.forEach((x) => {
      const st = stuOf.get(x.student_id);
      if (!st) return;
      const b = tbOf.get(x.textbook_id);
      if (!waitOf.has(x.student_id)) {
        waitOf.set(x.student_id, {
          studentId: x.student_id,
          id: `s:${x.student_id}`,
          name: st.name,
          phone: st.parent_phone || "",
          firstComing: !!(st.enrolled_on && st.enrolled_on > today),
          books: [],
        });
      }
      waitOf.get(x.student_id).books.push({
        id: x.textbook_id,
        name: b?.name || "교재",
        price: b?.price || 0,
        url: b?.purchase_url || "",
        from: x.assigned_on,   // 교재 사용 예정일 — 화면에 그대로 보인다
      });
    });
    // 학생마다 **자기 교재**로 본문을 채운다 — 안내 탭(한 벌 공통)보다 정확하다
    const bookWait = [...waitOf.values()].map((w) => ({
      ...w,
      body: bookTpl
        ? fill(bookTpl.body, { name: w.name }, settings.academy.name, settings.message, {}, w.books)
        : "",
    }));

    // 월간은 월말 사흘 전부터만 (menuBadges 와 같은 기준)
    const lastDay = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    const left = lastDay - Number(today.slice(8, 10));
    const monthlyLeft = left <= 3 ? Math.max(0, (stuQ.data || []).length - (monQ.count || 0)) : 0;

    todoData = {
      unsentByDate,
      bookWait,
      monthlyLeft,
      ym,
      bookTemplateId: bookTpl?.id || null,
      hasBookTpl: !!bookTpl,
      scheduled: schedQ.rows || [],
      mode: settings.mode,
    };
  }
  const profile = profileQ?.data || null;
  const testStudents = ssQ.data || [];
  const testTemplates = ttQ.data || [];
  const { data: tplRows } = tplQ;
  // 함수는 화면(클라이언트)으로 못 넘긴다 — **값으로** 넘긴다.
  //   { report: "alimtalk", homework: "sms", … }
  const chans = Object.fromEntries(
    channelPlan(tplRows || [], settings.solapi?.pfId || "")
      .filter((p) => p.key)
      .map((p) => [p.key, p.channel])
  );
  // 리포트 본문이 실제로 쓰이는 탭에서만 조립한다 (2026-08-21) —
  // 기본 탭 「보낼 것」 에서는 통째로 버려지는데도 매번 만들고 있었다
  const needRows = ["report", "hw", "late", "resend"].includes(tab);
  const { rows, sendReady, resendReady } = needRows
    ? await loadReportRows(supabase, date, settings.academy.name, settings.message)
    : { rows: [], sendReady: true, resendReady: true };

  // 탭마다 부제가 다르다 — 지금 무엇을 하는 화면인지 위에서 바로 읽히게
  const SUB = {
    todo: "아직 안 보낸 것을 한 판에 모았습니다. 누르면 그 자리로 갑니다.",
    report: "데일리리포트는 오늘 수업 입력 내용으로 자동 작성됩니다.",
    hw: "다음 수업 숙제만 담은 짧은 문자입니다. 학생에게 갑니다.",
    late: "늦게 가는 학생의 사유는 수업 기록에서 자동으로 잡힙니다.",
    notice: "안내 문자는 미리 써둔 문구를 씁니다.",
    resend: "이미 보낸 문구를 고쳐서 다시 보내거나, 숙제만 따로 보낼 때 씁니다.",
    test: "진짜로 나가기 전에 받아봅니다. 보낸 것으로 표시되지 않고 이력에도 안 남습니다.",
  };

  return (
    <>
      <TopBar profile={profile} active="report" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">발송</p>
          <h1 className="h1">데일리리포트 · 하원 · 안내</h1>
          <Help><p className="sub">{SUB[tab]}</p></Help>
        </div>
        <SendTabs tab={tab} date={date} />
        {tab === "todo" ? (
          <SendTodo {...todoData} />
        ) : tab === "test" ? (
          <TestSender
            students={testStudents}
            templates={testTemplates}
            mode={settings.mode}
            date={date}
          />
        ) : tab === "notice" ? (
          <NoticeSender academy={settings.academy.name} mode={settings.mode} msg={settings.message} />
        ) : tab === "hw" ? (
          <ResendBoard
            date={date} rows={rows} ready={resendReady}
            mode={settings.mode} chans={chans} only="homework"
          />
        ) : tab === "late" ? (
          <LateSender date={date} rows={rows} mode={settings.mode} chans={chans} />
        ) : tab === "resend" ? (
          <ResendBoard date={date} rows={rows} ready={resendReady} mode={settings.mode} chans={chans} />
        ) : (
          <ReportSender date={date} rows={rows} sendReady={sendReady} mode={settings.mode} chans={chans} />
        )}
      </main>
    </>
  );
}
