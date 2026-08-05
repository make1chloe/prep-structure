import Link from "next/link";
import DashCalendar from "./DashCalendar";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/roles";
import TopBar from "@/components/TopBar";
import RequestInbox from "./RequestInbox";
import MakeupInbox from "./MakeupInbox";
import UnsentBox from "./UnsentBox";
import { loadDashboard } from "@/lib/dashboard";
import { won } from "@/lib/tuition";
import { dayLabel, longLabel } from "@/lib/day";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  // 선생님 화면이다. 학생·학부모는 자기 화면으로 보낸다.
  // (미들웨어가 이미 막지만, 막는 곳이 하나뿐이면 그 하나가 뚫렸을 때 끝이다)
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
          <span className="hint">재원 <b style={{ fontSize: 15 }}>{kpi.enrolled}</b>명</span>
          {kpi.attRate !== null && (
            <span className="hint">이달 출석률 <b style={{ fontSize: 15 }}>{kpi.attRate}%</b></span>
          )}
          {kpi.sentRate !== null && (
            <span className="hint">
              오늘 리포트 <b style={{ fontSize: 15 }}>{kpi.written}/{kpi.todayTotal}</b> ({kpi.sentRate}%)
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
          {d.sendFails.length > 0 && (
            <Badge href="/report?t=resend" tone="bad">발송 실패 {d.sendFails.length}건</Badge>
          )}
          {d.unsentPast.length > 0 && (
            <Badge href={`/report?d=${d.unsentPast[0].date}`} tone="warn">
              지난 미발송 {d.unsentPast.length}건
            </Badge>
          )}
          {d.unsentToday.length > 0 && (
            <Badge href="/report">보낼 리포트 {d.unsentToday.length}건</Badge>
          )}
          {d.requests.length > 0 && (
            <Badge href="#requests" tone="warn">학부모 알림 {d.requests.length}건</Badge>
          )}
          {d.makeupRows.length > 0 && (
            <Badge href="#makeup" tone="warn">보강 잡을 것 {d.makeupRows.length}건</Badge>
          )}
          {d.makeupNeedTotal > 0 && (
            <Badge href="/tuition">보강 필요 {d.makeupNeedTotal}회</Badge>
          )}
          {d.monthlyDue && (
            <Badge href="/monthly" tone="warn">월간리포트 {d.monthlyDue.count}명분</Badge>
          )}
          {d.examSoon.some((e) => e.noScope) && (
            <Badge href="/prep" tone="bad">
              시험범위 미등록 {d.examSoon.filter((e) => e.noScope).length}건
            </Badge>
          )}
          {d.scheduleAlerts.length > 0 && (
            <Badge href="/schedule">스케줄 특이사항 {d.scheduleAlerts.length}건</Badge>
          )}
          {d.inquiries.length > 0 && (
            <Badge href="/consult">진행중 상담 {d.inquiries.length}건</Badge>
          )}
          {tasks.overdue.length > 0 && (
            <Badge href="/tasks?view=todo" tone="warn">지난 할일 {tasks.overdue.length}건</Badge>
          )}
          {tasks.todos.length > 0 && (
            <Badge href="/tasks?view=todo">할일 {tasks.todos.length}건</Badge>
          )}
        </div>

        <div className="grid-side" style={{ marginTop: 10 }}>
          {/* 새 소식 · 특이사항 */}
          <div className="stack">
            <div id="requests">
              <RequestInbox requests={d.requests} />
            </div>
            <div id="makeup">
              <MakeupInbox rows={d.makeupRows} />
            </div>

            {/* 보내야 하는데 안 나간 것 — 놓치면 학부모가 먼저 안다.
                필요 없는 것은 골라서 「안 보내기」로 치울 수 있다 */}
            <UnsentBox fails={d.sendFails} past={d.unsentPast} />

            {/* 반성문 문턱 — 오늘 얼굴 보고 이야기해야 하는 것 */}
            {d.warnings.length > 0 && (
              <div className="card sect sect-bad">
                <h2 className="secthead">
                  반성문 대상 <span className="tag tag-red">{d.warnings.length}</span>
                </h2>
                <div className="stack" style={{ gap: 4 }}>
                  {d.warnings.map((w) => (
                    <Link className="unitrow" key={w.id} href="/today" style={{ textDecoration: "none" }}>
                      <b style={{ fontSize: 12.5 }}>{w.name}</b>
                      <span className="tag tag-red">경고 {w.count}회</span>
                      <span className="hint">
                        {w.list.slice(-2).map((x) => x.reasons.join(" · ")).join(" / ")}
                      </span>
                    </Link>
                  ))}
                </div>
                <p className="hint" style={{ margin: "6px 0 0" }}>
                  쓰게 할지 · 넘어갈지는 오늘 수업 화면에서 정합니다.
                </p>
              </div>
            )}

            <div className="card sect sect-warn">
              <h2 className="secthead">
                새 상담{" "}
                {d.inquiries.length > 0 && <span className="tag tag-amber">{d.inquiries.length}</span>}
              </h2>
              {d.inquiries.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>새로 들어온 상담이 없습니다.</p>
              ) : (
                <div className="stack" style={{ gap: 4 }}>
                  {d.inquiries.map((q) => (
                    <Link className="unitrow" key={q.id} href="/consult" style={{ textDecoration: "none" }}>
                      <b style={{ fontSize: 12.5 }}>{q.name}</b>
                      <span className="hint">{[q.school, q.grade].filter(Boolean).join(" ")}</span>
                      <span className={`tag ${q.form_submitted_at ? "tag-mint" : "tag-muted"}`}>
                        {q.form_submitted_at ? "양식 제출" : "양식 미제출"}
                      </span>
                      <span className="spacer" />
                      {q.test_want_on && <span className="hint">테스트 희망 {dayLabel(q.test_want_on)}</span>}
                      {q.visit_on && <span className="hint">· 상담 희망 {dayLabel(q.visit_on)}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="card sect sect-info">
              <h2 className="secthead">특이사항</h2>
              <div className="stack" style={{ gap: 10 }}>
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
                    <b className="hint">곧 끝나는 교재 (시험지 · 플래너 챙길 것)</b>
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
                    <b className="hint">보강 필요 (휴강·결석분)</b>
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
                    <b className="hint">최근 2주 숙제 미흡·미제출이 많은 학생</b>
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
                    <b className="hint">영어 시험 전날 — 등원 필요</b>
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
                    <b className="hint">공휴일 — 쉴지 정해주세요</b>
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
            {/* 단원이 없으면 숙제 범위를 고를 수가 없다. 그런데 그건 오늘 수업
                화면에서는 "범위가 안 나온다" 로만 보여서, 원인을 여기서 알려준다 */}
            {(d.needUnits || []).length > 0 && (
              <div className="card sect sect-warn">
                <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
                  단원을 넣어야 하는 교재 {d.needUnits.length}권
                </h2>
                <p className="hint" style={{ margin: "0 0 8px", fontSize: 12 }}>
                  학생이 쓰고 있는데 <b>단원이 하나도 없는 교재</b>예요.
                  단원이 없으면 오늘 수업에서 <b>숙제 범위를 고를 수가 없습니다.</b>
                </p>
                <div className="stack" style={{ gap: 3 }}>
                  {d.needUnits.slice(0, 8).map((b) => (
                    <Link
                      className="unitrow"
                      key={b.id}
                      href={`/textbooks?tb=${b.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <b style={{ fontSize: 12.5, flex: 1 }}>{b.name}</b>
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
                    <b style={{ fontSize: 12.5 }}>{c.name}</b>
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
                    <b style={{ fontSize: 12.5 }}>{t.title}</b>
                    {t.category && <span className="tag tag-sky">{t.category}</span>}
                    {t.deliver_body && <span className="tag tag-lav">전달사항</span>}
                  </Link>
                ))}
              </div>
            </div>

            <div className="card sect sect-calm">
              <h2 className="secthead">
                이번 주{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
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
                      <b style={{ fontSize: 12.5 }}>{t.title}</b>
                      {t.category && <span className="tag tag-muted">{t.category}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="card sect sect-calm">
              <h2 className="secthead">
                이번 달 남은 일정{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
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
                      <b style={{ fontSize: 12.5 }}>{t.title}</b>
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
