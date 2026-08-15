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

export const dynamic = "force-dynamic";

function cut(t) {
  return t ? t.slice(0, 5) : "";
}

/**
 * 위에 늘어놓는 배지.
 *
 * 전에는 '학부모 알림'·'보강 잡을 것' 두 개가 버튼처럼 생겼는데 눌리지 않았다.
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
          * 위 배지 줄에서 **겹치던 것들을 뺐다** — 미발송 · 보강 잡을 것 ·
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

        <div className="grid-side" style={{ marginTop: 10 }}>
          {/* 새 소식 · 특이사항 */}
          <div className="stack">
            <div id="requests">
              <RequestInbox requests={d.requests} />
            </div>

            {/* **어머니가 답을 요구하신 것** — 보강 일정 변경 요청.
                보강을 잡고 무르는 일은 출결 화면이지만, 「그날 안 돼요」 는
                답할 일이라 여기 있어야 한다 (2026-08-07) */}
            <MakeupAnswers only="changed" />
            <UnsentBox fails={d.sendFails} past={d.unsentPast} />

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

            <InquiryInbox rows={d.inquiries} />

            {/* 오늘 쉬는 시간이 눈에 띄는 아이 (0106) — 규칙에 걸릴 때만 */}
            <BreakWatch />

            {/* 보낸 알림이 어디까지 갔나 — 선생님 화면에만 있다 (0105) */}
            <PushSeen />

            <div className="card sect sect-info">
              <h2 className="secthead">특이사항</h2>
              <div className="stack" style={{ gap: 10 }}>
                {/* 다음 달 회차 확정 (0123) — 25일부터, 회차 화면으로 가는 길 */}
                {(d.monthConfirmLeft || 0) > 0 && (
                  <div>
                    <Link className="tag tag-amber" href="/schedule" style={{ fontSize: 13 }}>
                      📅 다음 달 회차 미확정 {d.monthConfirmLeft}명 — 회차 화면에서 확정하기 →
                    </Link>
                  </div>
                )}
                {/* 이번 주 생일 (원장님, 2026-08-15 — 「생일 나한테 알려주고」) */}
                {(d.birthdays || []).length > 0 && (
                  <div>
                    <b className="hint">이번 주 생일</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {d.birthdays.map((b) => (
                        <span className="tag tag-lav" key={b.id}>
                          🎂 {b.name} · {b.m}/{b.d}
                          {b.inDays === 0 ? " (오늘!)" : b.inDays === 1 ? " (내일)" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {d.todayMakeups.length > 0 && (
                  <div>
                    <b className="hint">오늘 보강 · 재시험</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {d.todayMakeups.map((m) => (
                        <Link className={`tag ${m.retest ? "tag-amber" : "tag-lav"}`} key={m.id} href="/today">
                          {m.name}{m.reason ? ` · ${m.reason}` : ""}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {d.examSoon.length > 0 && (
                  <div>
                    <b className="hint">다가오는 내신 시험</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {d.examSoon.map((e) => (
                        <Link className={`tag ${e.noScope ? "tag-red" : "tag-mint"}`} key={e.id} href="/prep">
                          D-{e.dday} {e.label}{e.noScope ? " · 범위 미등록" : ""}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {d.monthlyDue && (
                  <div>
                    <b className="hint">월간리포트</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      <Link className="tag tag-amber" href="/monthly">
                        {Number(d.monthlyDue.ym.slice(5))}월이 {d.monthlyDue.left === 0 ? "오늘" : `${d.monthlyDue.left}일 뒤`} 끝남 · {d.monthlyDue.count}명분
                      </Link>
                    </div>
                  </div>
                )}
                {/* 곧 끝나는 교재 — 시험지·플래너를 미리 챙기시라고 */}
                {d.bookEnding?.length > 0 && (
                  <div>
                    <b className="hint">곧 끝나는 교재</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
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
                {d.makeupNeedTotal > 0 && (
                  <div>
                    <b className="hint">보강 필요</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      <Link className="tag tag-lav" href="/tuition">
                        모두 {d.makeupNeedTotal}회 · 차액 {won(d.creditTotal)}
                      </Link>
                    </div>
                  </div>
                )}
                {d.soonAbsent.length > 0 && (
                  <div>
                    <b className="hint">이번 주 결석 예정</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {d.soonAbsent.map((a, i) => (
                        <Link className="tag tag-amber" key={i} href="/plan">
                          {dayLabel(a.date)} {a.name}
                          {a.reason ? ` · ${a.reason}` : ""}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {d.watchList.length > 0 && (
                  <div>
                    <b className="hint">숙제가 밀리는 학생 (2주)</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {d.watchList.map((w) => (
                        <Link className="tag tag-muted" key={w.id} href="/today">
                          {w.name} {w.count}건
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {d.holidays.length > 0 && (
                  <div>
                    <b className="hint">앞으로의 휴강</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {d.holidays.map((h) => (
                        <Link className="tag tag-muted" key={h.id} href="/schedule">
                          {dayLabel(h.date)} {h.name || "휴강"}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {d.engEves.length > 0 && (
                  <div>
                    <b className="hint">영어 시험 전날</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {d.engEves.map((e, i) => (
                        <Link className="tag tag-lav" key={i} href="/schedule">
                          {dayLabel(e.date)} {e.school} {e.grade || ""} (시험 {e.english_on.slice(5)})
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {d.newComments.length > 0 && (
                  <div>
                    <b className="hint">학생 · 학부모가 남긴 댓글 {d.newComments.length}건</b>
                    <div className="stack" style={{ gap: 4, marginTop: 4 }}>
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
                {d.holidayNotes.length > 0 && (
                  <div>
                    <b className="hint">공휴일</b>
                    <div className="stack" style={{ gap: 4, marginTop: 4 }}>
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
                {d.scheduleAlerts.length > 0 && (
                  <div>
                    <b className="hint">앞으로 3개월 스케줄</b>
                    <div className="stack" style={{ gap: 3, marginTop: 4 }}>
                      {d.scheduleAlerts.slice(0, 8).map((a, i) => (
                        <div className="hint" key={i}>
                          <b>{a.klass}</b> {Number(a.ym.slice(5))}월 · {a.text}
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
                  </div>
                )}
                {quiet && <p className="hint" style={{ margin: 0 }}>특별히 볼 것이 없습니다 👍</p>}
              </div>
            </div>
          </div>

          {/* 일정 */}
          <div className="stack">
            {/* 단원이 없으면 오늘 수업에서 숙제 범위를 고를 수가 없다 */}
            {(d.needUnits || []).length > 0 && (
              <div className="card sect sect-warn">
                <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>
                  단원을 넣어야 하는 교재 {d.needUnits.length}권
                </h2>
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

            <DashCalendar ym={d.today.slice(0, 7)} items={d.calendar || []} today={d.today} />

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
