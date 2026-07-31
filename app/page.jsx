import Link from "next/link";
import DashCalendar from "./DashCalendar";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/roles";
import TopBar from "@/components/TopBar";
import RequestInbox from "./RequestInbox";
import MakeupInbox from "./MakeupInbox";
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
    d.unpaid.length === 0 && d.makeupNeedTotal === 0 && !d.monthlyDue;

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
          {d.unpaid.length > 0 && (
            <Badge href="/tuition" tone="bad">미납 {d.unpaid.length}명</Badge>
          )}
          {d.makeupNeedTotal > 0 && (
            <Badge href="/tuition">보강 필요 {d.makeupNeedTotal}회</Badge>
          )}
          {d.monthlyDue && (
            <Badge href="/monthly" tone="warn">월말 리포트 {d.monthlyDue.count}명분</Badge>
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

        <div className="grid-side" style={{ marginTop: 14 }}>
          {/* 새 소식 · 특이사항 */}
          <div className="stack" style={{ gap: 14 }}>
            <div id="requests">
              <RequestInbox requests={d.requests} />
            </div>
            <div id="makeup">
              <MakeupInbox rows={d.makeupRows} />
            </div>

            {/* 보내야 하는데 안 나간 것 — 놓치면 학부모가 먼저 안다 */}
            {(d.sendFails.length > 0 || d.unsentPast.length > 0) && (
              <div className="card">
                <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
                  안 나간 문자 <span className="tag tag-red">{d.sendFails.length + d.unsentPast.length}</span>
                </h2>
                <div className="stack" style={{ gap: 4 }}>
                  {/* 줄을 누르면 **그 날짜의 발송 화면**으로 바로 간다.
                      보고 나서 어디로 가야 할지 다시 찾게 하면 안 된다. */}
                  {d.sendFails.map((s) => (
                    <Link
                      className="unitrow"
                      key={s.id}
                      href={`/report?t=resend${s.date ? `&d=${s.date}` : ""}`}
                      style={{ textDecoration: "none" }}
                    >
                      <span className="tag tag-red">실패</span>
                      <b style={{ fontSize: 12.5 }}>{s.name}</b>
                      <span className="hint">{s.detail || s.kind}</span>
                      <span className="spacer" />
                      <span className="hint" style={{ fontSize: 11.5 }}>다시 보내기 ›</span>
                    </Link>
                  ))}
                  {d.unsentPast.map((r) => (
                    <Link
                      className="unitrow"
                      key={r.id}
                      href={`/report?d=${r.date}`}
                      style={{ textDecoration: "none" }}
                    >
                      <span className="tag tag-amber">미발송</span>
                      <span className="hint" style={{ minWidth: 62 }}>{dayLabel(r.date)}</span>
                      <b style={{ fontSize: 12.5 }}>{r.name}</b>
                      <span className="hint">써두고 안 보냄</span>
                      <span className="spacer" />
                      <span className="hint" style={{ fontSize: 11.5 }}>보내기 ›</span>
                    </Link>
                  ))}
                </div>
                <Link className="btn btn-ghost btn-sm" href="/report?t=resend" style={{ marginTop: 6 }}>
                  다시 보내기
                </Link>
              </div>
            )}

            {/* 반성문 문턱 — 오늘 얼굴 보고 이야기해야 하는 것 */}
            {d.warnings.length > 0 && (
              <div className="card">
                <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
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

            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
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

            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>특이사항</h2>
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
                    <b className="hint">월말 리포트</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      <Link className="tag tag-amber" href="/monthly">
                        {Number(d.monthlyDue.ym.slice(5))}월이 {d.monthlyDue.left === 0 ? "오늘" : `${d.monthlyDue.left}일 뒤`} 끝남 · {d.monthlyDue.count}명분
                      </Link>
                    </div>
                  </div>
                )}
                {d.unpaid.length > 0 && (
                  <div>
                    <b className="hint">이번 달 아직 안 받은 수강료 {d.unpaid.length}명</b>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {d.unpaid.slice(0, 12).map((s) => (
                        <Link className="tag tag-red" key={s.id} href="/tuition">{s.name}</Link>
                      ))}
                      {d.unpaid.length > 12 && (
                        <Link className="tag tag-muted" href="/tuition">
                          외 {d.unpaid.length - 12}명
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
                    <b className="hint">전달사항 — 학생 · 학부모가 보낸 것 {d.newComments.length}건</b>
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
          <div className="stack" style={{ gap: 14 }}>
            <DashCalendar ym={d.today.slice(0, 7)} items={d.calendar || []} today={d.today} />

            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>오늘</h2>
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
                    {t.deliver_body && <span className="tag tag-lav">안내 문구</span>}
                  </Link>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
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

            <div className="card">
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
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
