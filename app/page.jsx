import Link from "next/link";
import DashCalendar from "./DashCalendar";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/roles";
import TopBar from "@/components/TopBar";
import RequestInbox from "./RequestInbox";
import QuickBar from "./QuickBar";
import TodoBar from "./TodoBar";
import MakeupAnswers from "./MakeupAnswers";
import UnsentBox from "./UnsentBox";
import WarningInbox from "./WarningInbox";
import InquiryInbox from "./InquiryInbox";
import PushSeen from "./PushSeen";
import BreakWatch from "./BreakWatch";
import { loadDashboard } from "@/lib/dashboard";
import { won } from "@/lib/tuition";
import { dayLabel, longLabel } from "@/lib/day";
import { cleanClassName } from "@/lib/classLabel";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";
import { runDueSends } from "@/app/report/scheduleActions";

export const dynamic = "force-dynamic";

function cut(t) {
  return t ? t.slice(0, 5) : "";
}

/**
 * 위에 늘어놓는 배지.
 *
 * 전에는 '학부모 알림'·'보강 필요' 두 개가 버튼처럼 생겼는데 눌리지 않았다.
 * 눌러서 처리하러 갈 수 없으면 배지가 아니라 그냥 글자다. **전부 링크로 둔다.**
 */
function Badge({ href, children, tone }) {
  const style =
    tone === "warn" ? { borderColor: "var(--amber)", color: "var(--amber)" }
    : tone === "bad" ? { borderColor: "var(--red)", color: "var(--red)" }
    : undefined;
  return (
    <Link className="btn" href={href} style={style}>
      {children}
    </Link>
  );
}

export default async function Home() {
  // 때가 된 예약 발송 — 대시보드가 열리는 것이 곧 시계다 (0126).
  // 실패해도 대시보드는 그대로 선다.
  try { await runDueSends(); } catch { /* 조용히 */ }
  const supabase = createClient();
  const user = await sessionUser(supabase);

  let profile = null;
  if (user) {
    const { data } = await cachedProfile(supabase, user.id);
    profile = data;
  }

  // 선생님 화면이다. 학생·학부모는 자기 화면으로 보낸다.
  // (미들웨어가 이미 막지만, 막는 곳이 하나뿐이면 그 하나가 뚫렸을 때 끝이다)
  //
  // **어머니는 학부모 화면으로.** 학생 화면으로 보내면 「내 화면이 왜 이래」 가
  // 된다 — 거기서 자녀를 고르는 칸까지 한 번 더 거쳐야 한다
  if (profile?.role === "parent") redirect("/parent");
  if (!isStaff(profile?.role)) redirect("/me");

  const d = await loadDashboard(supabase);
  const { kpi, tasks } = d;

  // 특이사항 칸이 통째로 비었는지
  const quiet =
    d.soonAbsent.length === 0 && d.watchList.length === 0 && d.holidays.length === 0 &&
    d.scheduleAlerts.length === 0 && d.engEves.length === 0 && d.holidayNotes.length === 0 &&
    d.newComments.length === 0 && d.examSoon.length === 0 && d.todayMakeups.length === 0 &&
    d.makeupNeedTotal === 0 && !d.monthlyDue && (d.bookEnding?.length || 0) === 0;

  // 돈 · 운영 묶음 — 급한 게 있으면 펴진 채로 시작
  const moneyCount =
    (d.makeupNeedTotal > 0 ? 1 : 0) + ((d.monthConfirmLeft || 0) > 0 ? 1 : 0) +
    (d.monthlyDue ? 1 : 0) + ((d.bookEnding?.length || 0) > 0 ? 1 : 0);
  const moneyUrgent =
    (d.monthConfirmLeft || 0) > 0 || !!d.monthlyDue || d.makeupNeedTotal > 0;

  return (
    <>
      <TopBar profile={profile} active="home" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">대시보드</p>
          <h1 className="h1">{longLabel(d.today)}</h1>
        </div>

        {/* 학원이 지금 어떤 상태인가 — 목록을 읽기 전에 숫자로 한 줄 */}
        <div className="row" style={{ gap: 14, marginTop: 10, flexWrap: "wrap" }}>
          <span className="hint">재원 <b style={{ fontSize: 16 }}>{kpi.enrolled}</b>명</span>
          {kpi.attRate !== null && (
            <span className="hint">이달 출석률 <b style={{ fontSize: 16 }}>{kpi.attRate}%</b></span>
          )}
          {kpi.sentRate !== null && (
            <span className="hint">
              오늘 리포트 <b style={{ fontSize: 16 }}>{kpi.written}/{kpi.todayTotal}</b> ({kpi.sentRate}%)
            </span>
          )}
        </div>

        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/today">
            오늘 수업 · 남은 {d.remaining}명 / {d.todayTotal}명
          </Link>
          {d.warnings.length > 0 && (
            <Badge href="/today" tone="bad">반성문 대상 {d.warnings.length}명</Badge>
          )}
          {d.unitStuck?.people?.length > 0 && (
            <Badge href="/scores" tone="warn">
              단원평가 막힘 {d.unitStuck.people.length}명
            </Badge>
          )}
          {d.sendFails.length > 0 && (
            <Badge href="/report?t=resend" tone="bad">발송 실패 {d.sendFails.length}건</Badge>
          )}
          {d.requests.length > 0 && (
            <Badge href="#requests" tone="warn">학부모 알림 {d.requests.length}건</Badge>
          )}
          {d.makeupNeedTotal > 0 && (
            <Badge href="/tuition">보강 필요 {d.makeupNeedTotal}회</Badge>
          )}
          {d.scheduleAlerts.length > 0 && (
            <Badge href="/schedule">스케줄 특이사항 {d.scheduleAlerts.length}건</Badge>
          )}
          {tasks.todos.length > 0 && (
            <Badge href="/tasks?view=todo">할일 {tasks.todos.length}건</Badge>
          )}
        </div>

        {/**
          * **메뉴에 뜬 숫자가 무엇인지 여기 적는다** (원장님, 2026-08-08 —
          * 「지금 알림이 발송과 학생에 있는데 왜 뜬 건지 모르겠어」).
          *
          * 위 배지 줄에서 **겹치던 것들을 뺐다** — 미발송 · 보강 필요 ·
          * 월간리포트 · 시험범위 · 진행중 상담 · 지난 할일. 같은 것을 두
          * 벌로 세고 있었고, 두 벌은 언젠가 서로 다른 말을 한다.
          * 이제 그것들은 아래 「남은 일」 이 **메뉴와 같은 셈**으로 말한다.
          *
          * 위에 남은 것은 여기서 안 세는 것들이다 — 반성문 · 단원평가 막힘 ·
          * 발송 실패 · 학부모 알림 · 보강 필요 회차 · 스케줄 특이사항.
          */}
        <TodoBar />

        {/* **읽은 자리에서 바로** (2026-08-07). 대시보드를 읽다가 「이 아이
            보강 잡아야겠다」 가 떠오르면 여기서 끝낸다 — 화면을 옮기는 사이에
            방금 읽은 것이 흐려진다 */}
        <QuickBar students={d.roster || []} />

        {/**
          * **네 묶음** (원장님, 2026-08-21 — 「연관성이 없는 것들이 연달아
          * 있거나 서로 시각적으로 잘 구별되지 않는다」).
          *
          * 카드 16장이 구분 없이 쌓여 있었고, 「특이사항」 한 장에는 서로
          * 무관한 소주제 14개가 들어 있었다 (돈이 수업 사이에 끼고, 보강이
          * 다섯 군데 흩어짐). 관심사대로 넷으로 묶는다 — 메뉴는 그대로다.
          *   🎯 오늘 수업   지금 수업에 필요한 것
          *   💬 소통 · 알림  사람이 답을 기다리는 것
          *   💰 돈 · 운영   매일 볼 것이 아니라 기본 접힘
          *   📅 달력 · 앞일  앞으로 오는 것
          * 왼쪽 좁은 열 = 한 줄짜리 목록, 오른쪽 넓은 열 = 폼·달력이 있는 것.
          */}

        {/* ── 🎯 오늘 수업 ─────────────────────────────── */}
        <h2 className="dashhead" id="g-class">🎯 오늘 수업</h2>
        <div className="grid-side">
          <div className="stack dashcol">
            {/* 오늘 쉬는 시간이 눈에 띄는 아이 (0106) — 규칙에 걸릴 때만 */}
            <BreakWatch />
            {d.todayMakeups.length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">오늘 보강 · 재시험</h2>
                <div className="row" style={{ gap: 4 }}>
                  {d.todayMakeups.map((m) => (
                    <Link className={`tag ${m.retest ? "tag-amber" : "tag-lav"}`} key={m.id} href="/today">
                      {m.name}{m.reason ? ` · ${m.reason}` : ""}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {(d.backlog || []).length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">등원 밀림 <span className="hint" style={{ fontWeight: 400, fontSize: 12.5 }}>다음 수업에 계속이 쌓인 학생</span></h2>
                <div className="stack" style={{ gap: 3 }}>
                  {d.backlog.slice(0, 6).map((b) => (
                    <div className="hint" key={b.name}>
                      <b>{b.name}</b> — 밀린 항목 {b.count}개
                    </div>
                  ))}
                </div>
              </div>
            )}
            {d.watchList.length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">숙제가 밀리는 학생 <span className="hint" style={{ fontWeight: 400, fontSize: 12.5 }}>2주</span></h2>
                <div className="row" style={{ gap: 4 }}>
                  {d.watchList.map((w) => (
                    <Link className="tag tag-muted" key={w.id} href="/today">
                      {w.name} {w.count}건
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {/* 클카 감시 3종 — 서로 다른 것을 잰다 (판단은 lib/dashboard·lib/classcard):
                ① 소진(주황) = 앞으로 마감이 없거나 3일 안에 끝남 → 플래너를 새로 잡을 때
                ② 불일치(빨강) = 앱 단어 진도와 플래너 Day 어긋남 → 어느 쪽이 맞는지 볼 때
                ③ 공백(빨강) = 클카 단어 배정인데 오늘 마감 세트가 0 → 오늘 숙제가 새는 날
                   (교재 단어가 나간 날은 클카 마감 0 이 정상이라 안 잰다 — 2026-08-21 정정.
                    수신이 12시간 넘게 낡으면 ③은 쉬고 그 사실만 흐리게) */}
            {(d.classcard?.runningOut?.length > 0 || d.classcard?.mismatch?.length > 0 || d.classcard?.noPlanner?.length > 0 || d.classcard?.shadow) && (
              <div className="card sect sect-info">
                <h2 className="secthead">
                  클래스카드 플래너
                  {d.classcard.fetchedAt && (
                    <span className="hint" style={{ fontWeight: 400, fontSize: 12.5 }}>
                      마지막 수신{" "}
                      {new Date(d.classcard.fetchedAt).toLocaleString("ko-KR", {
                        month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  )}
                </h2>
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  {d.classcard.runningOut.map((r) => (
                    <span className="tag tag-amber" key={`o-${r.name}`}
                      title={r.last ? `마지막 마감 ${r.last}` : "앞으로 잡힌 마감이 없어요"}>
                      {r.name} · 플래너 새로 잡기{r.last ? "" : " (마감 없음)"}
                    </span>
                  ))}
                  {d.classcard.shadow && (
                    <span
                      className="tag tag-sky"
                      title="자동 판정과 원장님 실제 검사의 일치율 (지난 30일) — 한 달 그림자 시뮬레이션 중"
                    >
                      자동검사 시뮬레이션 · 일치 {d.classcard.shadow.agree}/{d.classcard.shadow.total} ({d.classcard.shadow.pct}%)
                    </span>
                  )}
                  {d.classcard.mismatch.map((r) => (
                    <span className="tag tag-red" key={`m-${r.name}`}
                      title="앱 단어 진도와 플래너가 어긋납니다 — 어느 쪽이 맞는지 봐주세요">
                      {r.name} · 앱 Day {r.app} ≠ 플래너 Day {r.cc}
                    </span>
                  ))}
                  {(d.classcard.noPlanner || []).map((r) => (
                    <span className="tag tag-red" key={`g-${r.name}`}
                      title="클카 방식 단어 숙제가 배정된 학생인데 플래너에 오늘 마감 세트가 없어요 — 플래너를 잡아주세요">
                      {r.name} · 클카 단어 배정인데 오늘 마감 없음
                    </span>
                  ))}
                  {d.classcard.gapSkipped && (
                    <span className="hint" style={{ fontSize: 12 }}>
                      클카 수신 12시간 지남 — 오늘 공백 검사 쉼
                    </span>
                  )}
                </div>
              </div>
            )}
            {/* 단원이 없으면 오늘 수업에서 숙제 범위를 고를 수가 없다 */}
            {(d.needUnits || []).length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">단원을 넣어야 하는 교재 <span className="tag tag-amber">{d.needUnits.length}권</span></h2>
                <div className="stack" style={{ gap: 3 }}>
                  {d.needUnits.slice(0, 8).map((b) => (
                    <Link
                      className="unitrow"
                      key={b.id}
                      href={`/textbooks?tb=${b.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <b style={{ fontSize: 14, flex: 1 }}>{b.name}</b>
                      {b.area && <span className="tag tag-muted">{b.area}</span>}
                      <span className="tag tag-amber">{b.students}명</span>
                    </Link>
                  ))}
                  {d.needUnits.length > 8 && (
                    <Link className="hint" href="/textbooks">
                      외 {d.needUnits.length - 8}권 더 보기
                    </Link>
                  )}
                </div>
              </div>
            )}
            {/* 배정만 되고 진도가 한 줄도 안 찍힌 교재 (원장님 2026-08-22 —
                「교재 배정됐는데 진도 체크 안 된 학생 대시보드에 알려줘」).
                멈춘 교재(⏸)·배정 7일 안(유예)은 안 올린다 — 판단은
                lib/dashboard progressIdle 한 곳 */}
            {/* **아이 화면에 오래 떠 있는 숙제** (원장님 2026-08-23).
                검사를 안 하면 그 배정이 아이 화면에 계속 떠 있는다 —
                판단은 lib/dashboard staleHomework 한 곳 */}
            {(d.staleHomework || []).length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">
                  검사 안 한 숙제{" "}
                  <span className="tag tag-amber">{d.staleHomework.length}명</span>
                </h2>
                <p className="hint" style={{ margin: "0 0 6px" }}>
                  아이 화면에는 아직 이 숙제가 떠 있어요 — 검사해서 저장하면 넘어갑니다.
                </p>
                <div className="stack" style={{ gap: 3 }}>
                  {d.staleHomework.slice(0, 8).map((h) => (
                    <Link
                      className="unitrow"
                      key={`${h.name}|${h.date}`}
                      href={`/today?d=${h.date}`}
                      style={{ textDecoration: "none" }}
                    >
                      <b style={{ fontSize: 14 }}>{h.name}</b>
                      <span className="hint" style={{ flex: 1 }}>
                        {h.date} 배정 · {h.count}개
                      </span>
                      <span className="tag tag-amber">{h.days}일째</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {/**
              * **루틴을 아직 안 정한 교재** (0154 — 원장님 2026-08-24
              * 「안 되어 있으면 안 되는 정보니까 대시보드 알림이 필요해」).
              * 배정만 하고 루틴을 안 정하면 그 교재는 오늘 수업에서 아무것도
              * 안 차려지거나 루틴에 적힌 것이 통째로 나간다 — 둘 다 원장님이
              * 정한 것이 아니다. 눌러서 그 학생 판으로 바로 간다.
              */}
            {(d.routineUnset || []).length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">
                  루틴 안 정한 교재 <span className="tag tag-amber">{d.routineUnset.length}건</span>
                </h2>
                <div className="stack" style={{ gap: 3 }}>
                  {d.routineUnset.slice(0, 8).map((p) => (
                    <Link
                      className="unitrow"
                      key={p.id}
                      href={`/students?s=${p.studentId}`}
                      style={{ textDecoration: "none" }}
                      title={p.since ? `${p.since} 배정` : undefined}
                    >
                      <b style={{ fontSize: 14 }}>{p.name}</b>
                      <span className="hint" style={{ flex: 1 }}>
                        {p.area ? `[${p.area}] ` : ""}{p.book}
                      </span>
                    </Link>
                  ))}
                  {d.routineUnset.length > 8 && (
                    <Link className="hint" href="/students">
                      외 {d.routineUnset.length - 8}건 더 보기
                    </Link>
                  )}
                </div>
              </div>
            )}
            {(d.progressIdle || []).length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">
                  진도 시작 안 한 교재 <span className="tag tag-amber">{d.progressIdle.length}건</span>
                </h2>
                <div className="stack" style={{ gap: 3 }}>
                  {d.progressIdle.slice(0, 8).map((p) => (
                    <Link
                      className="unitrow"
                      key={`${p.name}|${p.book}`}
                      href="/progress"
                      style={{ textDecoration: "none" }}
                      title={p.since ? `${p.since} 배정` : undefined}
                    >
                      <b style={{ fontSize: 14 }}>{p.name}</b>
                      <span className="hint" style={{ flex: 1 }}>{p.book}</span>
                    </Link>
                  ))}
                  {d.progressIdle.length > 8 && (
                    <Link className="hint" href="/progress">
                      외 {d.progressIdle.length - 8}건 더 보기
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="stack dashcol">
            <div className="card sect sect-calm">
              <h2 className="secthead">오늘</h2>
              <div className="stack" style={{ gap: 4 }}>
                {d.todayClasses.map((c) => (
                  <Link className="unitrow" key={c.id} href="/today" style={{ textDecoration: "none" }}>
                    <span className="hint" style={{ minWidth: 84 }}>
                      {cut(c.start_time)}-{cut(c.end_time)}
                    </span>
                    {/* 이름 속 시간은 걷어낸다 — 앞 시간과 두 번 나온다 (lib/classLabel) */}
                    <b style={{ fontSize: 14 }}>{cleanClassName(c.name)}</b>
                    {c.room && <span className="tag tag-muted">{c.room}</span>}
                  </Link>
                ))}
                {d.todayClasses.length === 0 && (
                  <p className="hint" style={{ margin: 0 }}>오늘은 수업이 없습니다.</p>
                )}
                {tasks.today.map((t) => (
                  <Link className="unitrow" key={t.id} href="/tasks" style={{ textDecoration: "none" }}>
                    <span className="hint" style={{ minWidth: 84 }}>
                      {t.start_time ? cut(t.start_time) : "일정"}
                    </span>
                    <b style={{ fontSize: 14 }}>{t.title}</b>
                    {t.category && <span className="tag tag-sky">{t.category}</span>}
                    {t.deliver_body && <span className="tag tag-lav">전달사항</span>}
                  </Link>
                ))}
              </div>
            </div>

            {/* 반성문 문턱 — 여기서 바로 정리한다 (유예 · 초기화) */}
            <WarningInbox rows={d.warnings} />

            {/* 단원평가 세 번째부터 올린다 (두 번은 흔하다) */}
            {(d.unitStuck?.people?.length > 0 || d.unitStuck?.units?.length > 0) && (
              <div className="card sect sect-warn">
                <h2 className="secthead">
                  단원평가에 막힘{" "}
                  {d.unitStuck.people.length > 0 && (
                    <span className="tag tag-amber">{d.unitStuck.people.length}명</span>
                  )}
                </h2>

                {/* 같은 단원에서 여럿이 막혔으면 수업에서 다시 짚을 일이다 */}
                {d.unitStuck.units.map((u) => (
                  <div className="notice" key={u.unit} style={{ fontSize: 14, marginBottom: 6 }}>
                    <b>{u.unit}</b> · <b>{u.n}명</b> — {u.names.join(" · ")}
                  </div>
                ))}

                <div className="stack" style={{ gap: 4 }}>
                  {d.unitStuck.people.map((p, i) => (
                    <Link
                      className="unitrow"
                      key={`${p.student?.id}-${p.unit}-${i}`}
                      href={`/scores/${p.student?.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <b style={{ fontSize: 14 }}>{p.student?.name}</b>
                      <span className="tag tag-amber">{p.unit} {p.tries}번째</span>
                      {p.last != null && <span className="hint">마지막 {p.last}점</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 💬 소통 · 알림 ───────────────────────────── */}
        <h2 className="dashhead" id="g-talk">💬 소통 · 알림</h2>
        <div className="grid-side">
          <div className="stack dashcol">
            <UnsentBox fails={d.sendFails} past={d.unsentPast} />
            <InquiryInbox rows={d.inquiries} />
            {d.newComments.length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">학생 · 학부모 댓글 <span className="tag tag-amber">{d.newComments.length}건</span></h2>
                <div className="stack" style={{ gap: 4 }}>
                  {d.newComments.map((c) => (
                    <div className="hint" key={c.id}>
                      <span className={`tag ${c.author_role === "parent" ? "tag-lav" : "tag-mint"}`}>
                        {c.author_role === "parent" ? "학부모" : "학생"}
                      </span>{" "}
                      <b>{c.name}</b> — {c.body.slice(0, 60)}
                      {c.body.length > 60 ? "…" : ""}
                    </div>
                  ))}
                </div>
                <Link className="btn btn-ghost btn-sm" href="/today" style={{ marginTop: 6 }}>
                  오늘 수업에서 답하기
                </Link>
              </div>
            )}
            {/* 보낸 알림이 어디까지 갔나 — 선생님 화면에만 있다 (0105) */}
            <PushSeen />
          </div>
          <div className="stack dashcol">
            {/* 답장 폼이 있는 것들은 넓은 열에 — 좁은 열에서는 버튼이 네 줄로 접혔다 */}
            <div id="requests">
              <RequestInbox requests={d.requests} />
            </div>
            {/* **어머니가 답을 요구하신 것** — 보강 일정 변경 요청.
                보강을 잡고 무르는 일은 출결 화면이지만, 「그날 안 돼요」 는
                답할 일이라 여기 있어야 한다 (2026-08-07) */}
            <MakeupAnswers only="changed" />
          </div>
        </div>

        {/* ── 💰 돈 · 운영 — 매일 볼 것이 아니라 기본 접힘. 급한 게 있으면 펴진 채로 */}
        <details className="dashfold" open={moneyUrgent || undefined}>
          <summary className="dashhead">
            💰 돈 · 운영
            {moneyCount > 0 && <span className="tag tag-amber" style={{ marginLeft: 6 }}>{moneyCount}</span>}
          </summary>
          <div className="grid-side" style={{ marginTop: 4 }}>
            <div className="stack dashcol">
              {d.makeupNeedTotal > 0 && (
                <div className="card sect sect-warn">
                  <h2 className="secthead">보강 필요</h2>
                  <Link className="tag tag-amber" href="/tuition">
                    모두 {d.makeupNeedTotal}회 · 차액 {won(d.creditTotal)}
                  </Link>
                </div>
              )}
              {/* 다음 달 회차 확정 (0123) — 25일부터, 회차 화면으로 가는 길 */}
              {(d.monthConfirmLeft || 0) > 0 && (
                <div className="card sect sect-warn">
                  <h2 className="secthead">다음 달 회차 미확정 <span className="tag tag-amber">{d.monthConfirmLeft}명</span></h2>
                  <Link className="tag tag-amber" href="/schedule">회차 화면에서 확정하기 →</Link>
                </div>
              )}
              {d.monthlyDue && (
                <div className="card sect sect-warn">
                  <h2 className="secthead">월간리포트</h2>
                  <Link className="tag tag-amber" href="/monthly">
                    {Number(d.monthlyDue.ym.slice(5))}월이 {d.monthlyDue.left === 0 ? "오늘" : `${d.monthlyDue.left}일 뒤`} 끝남 · {d.monthlyDue.count}명분
                  </Link>
                </div>
              )}
            </div>
            <div className="stack dashcol">
              {/* 곧 끝나는 교재 — 시험지·플래너를 미리 챙기시라고 */}
              {d.bookEnding?.length > 0 && (
                <div className="card sect sect-info">
                  <h2 className="secthead">곧 끝나는 교재</h2>
                  <div className="row" style={{ gap: 4 }}>
                    {d.bookEnding.slice(0, 12).map((b) => (
                      <Link className="tag tag-lav" key={b.id} href="/progress">
                        {b.name} · {b.book}
                        {b.left === 0 ? " 끝" : ` ${b.left}단원`}
                      </Link>
                    ))}
                    {d.bookEnding.length > 12 && (
                      <Link className="tag tag-muted" href="/progress">
                        외 {d.bookEnding.length - 12}건
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </details>

        {/* ── 📅 달력 · 앞일 ───────────────────────────── */}
        <h2 className="dashhead" id="g-cal">📅 달력 · 앞일</h2>
        <div className="grid-side">
          <div className="stack dashcol">
            {d.examSoon.length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">다가오는 내신 시험</h2>
                <div className="row" style={{ gap: 4 }}>
                  {d.examSoon.map((e) => (
                    <Link className={`tag ${e.noScope ? "tag-red" : "tag-mint"}`} key={e.id} href="/prep">
                      D-{e.dday} {e.label}{e.noScope ? " · 범위 미등록" : ""}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {d.engEves.length > 0 && (
              <div className="card sect sect-info">
                <h2 className="secthead">영어 시험 전날</h2>
                <div className="row" style={{ gap: 4 }}>
                  {d.engEves.map((e, i) => (
                    <Link className="tag tag-lav" key={i} href="/schedule">
                      {dayLabel(e.date)} {e.school} {e.grade || ""} (시험 {e.english_on.slice(5)})
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {d.soonAbsent.length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">이번 주 결석 예정</h2>
                <div className="row" style={{ gap: 4 }}>
                  {d.soonAbsent.map((a, i) => (
                    <Link className="tag tag-amber" key={i} href="/plan">
                      {dayLabel(a.date)} {a.name}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {d.holidays.length > 0 && (
              <div className="card sect sect-info">
                <h2 className="secthead">앞으로의 휴강</h2>
                <div className="row" style={{ gap: 4 }}>
                  {d.holidays.map((h) => (
                    <Link className="tag tag-muted" key={h.id} href="/schedule">
                      {dayLabel(h.date)} {h.name || "휴강"}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {d.holidayNotes.length > 0 && (
              <div className="card sect sect-warn">
                <h2 className="secthead">공휴일 — 쉴지 정해주세요</h2>
                <div className="stack" style={{ gap: 4 }}>
                  {d.holidayNotes.map((h) => (
                    <div className="hint" key={h.date}>
                      <span
                        className={`tag ${
                          h.kind === "bridge" ? "tag-lav"
                          : h.kind === "substitute" ? "tag-amber"
                          : "tag-red"
                        }`}
                      >
                        {dayLabel(h.date)} {h.name}
                      </span>{" "}
                      {h.why}
                    </div>
                  ))}
                </div>
                <Link className="btn btn-ghost btn-sm" href="/schedule" style={{ marginTop: 6 }}>
                  휴강으로 지정하기
                </Link>
              </div>
            )}
            {/* 이번 주 생일 (원장님, 2026-08-15 — 「생일 나한테 알려주고」) */}
            {(d.birthdays || []).length > 0 && (
              <div className="card sect sect-calm">
                <h2 className="secthead">이번 주 생일</h2>
                <div className="row" style={{ gap: 4 }}>
                  {d.birthdays.map((b) => (
                    <span className="tag tag-lav" key={b.id}>
                      🎂 {b.name} · {b.m}/{b.d}
                      {b.inDays === 0 ? " (오늘!)" : b.inDays === 1 ? " (내일)" : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {d.scheduleAlerts.length > 0 && (
              <details className="card sect sect-info">
                <summary className="secthead" style={{ cursor: "pointer" }}>
                  앞으로 3개월 스케줄 <span className="tag tag-muted">{d.scheduleAlerts.length}건</span>
                </summary>
                <div className="stack" style={{ gap: 3, marginTop: 6 }}>
                  {/* 타과목 시험은 학교 것이다 — 학교별로 묶어 정렬
                      (원장님 2026-08-19 「학교시험이니까 학교별로 정렬해줘」) */}
                  {[
                    ...d.scheduleAlerts.filter((a) => a.kind !== "exam"),
                    ...d.scheduleAlerts
                      .filter((a) => a.kind === "exam")
                      .sort(
                        (a, b) =>
                          (a.schools?.[0] || "").localeCompare(b.schools?.[0] || "", "ko") ||
                          a.ym.localeCompare(b.ym)
                      ),
                  ].slice(0, 8).map((a, i) => (
                    <div className="hint" key={i}>
                      <b>
                        {a.kind === "exam" && a.schools?.length
                          ? a.schools.join(" · ")
                          : a.klass}
                      </b>{" "}
                      {Number(a.ym.slice(5))}월 · {a.text}
                      {a.kind === "exam" && a.schools?.length ? ` (${a.klass})` : null}
                      {a.advice && (
                        <>
                          <br />
                          <span style={{ opacity: 0.8 }}>
                            {a.settled ? "✓ " : "→ "}
                            {a.advice}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <Link className="btn btn-ghost btn-sm" href="/schedule" style={{ marginTop: 6 }}>
                  스케줄 보기
                </Link>
              </details>
            )}
            {quiet && <p className="hint" style={{ margin: 0 }}>특별히 볼 것이 없습니다 👍</p>}
          </div>
          <div className="stack dashcol">
            <DashCalendar ym={d.today.slice(0, 7)} items={d.calendar || []} today={d.today} />

            <div className="card sect sect-calm">
              <h2 className="secthead">
                이번 주{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 14.5 }}>
                  {tasks.week.length}건
                </span>
              </h2>
              {tasks.week.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>예정된 일정이 없습니다.</p>
              ) : (
                <div className="stack" style={{ gap: 4 }}>
                  {tasks.week.map((t) => (
                    <Link className="unitrow" key={t.id} href="/tasks" style={{ textDecoration: "none" }}>
                      <span className="hint" style={{ minWidth: 62 }}>{dayLabel(t.due_on)}</span>
                      <b style={{ fontSize: 14 }}>{t.title}</b>
                      {t.category && <span className="tag tag-muted">{t.category}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="card sect sect-calm">
              <h2 className="secthead">
                이번 달 남은 일정{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 14.5 }}>
                  {tasks.month.length}건
                </span>
              </h2>
              {tasks.month.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>없습니다.</p>
              ) : (
                <div className="stack" style={{ gap: 4 }}>
                  {tasks.month.map((t) => (
                    <Link className="unitrow" key={t.id} href="/tasks" style={{ textDecoration: "none" }}>
                      <span className="hint" style={{ minWidth: 62 }}>{dayLabel(t.due_on)}</span>
                      <b style={{ fontSize: 14 }}>{t.title}</b>
                      {t.category && <span className="tag tag-muted">{t.category}</span>}
                    </Link>
                  ))}
                </div>
              )}
              <Link className="btn btn-ghost btn-sm" href="/tasks" style={{ marginTop: 8 }}>
                일정 전체 보기
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
