"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setAttendance, clearAttendance, reopenReport, saveStudentDay } from "./actions";
import StudentPanel from "./StudentPanel";
import { waitingChecks } from "@/lib/checkQueue";
import CheckQueue from "./CheckQueue";
import { setArrivalFor } from "./arrivalActions";
import { setClassAttendance } from "./classAttendance";


const ATT = [
  { key: "present", label: "정시", cls: "tag-mint" },
  { key: "late", label: "지각", cls: "tag-amber" },
  { key: "absent", label: "결석", cls: "tag-muted" },
  { key: "makeup", label: "보강", cls: "tag-lav" },
  { key: "early_leave", label: "조퇴", cls: "tag-muted" },
  { key: "online", label: "온라인", cls: "tag-sky" },
];
const LABEL = Object.fromEntries(ATT.map((a) => [a.key, a.label]));
const CLS = Object.fromEntries(ATT.map((a) => [a.key, a.cls]));

function cut(t) {
  return t ? t.slice(0, 5) : "";
}

export default function TodayBoard({
  date,
  groups = [],
  items = [],
  textbooks = [],
  unitNames = {},
  rule = {},
}) {
  const [openId, setOpenId] = useState(null);
  const [openClass, setOpenClass] = useState(() => {
    // 지금 시간대 반을 자동으로 펼침, 없으면 첫 반
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const cur = groups.find(
      (g) => cut(g.klass.start_time) <= hhmm && hhmm <= cut(g.klass.end_time || "23:59")
    );
    return cur?.klass.id || groups[0]?.klass.id || null;
  });
  const [showDone, setShowDone] = useState({});
  const [filter, setFilter] = useState("todo");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 특강이면 그 반 출결에만 찍는다. 정규는 예전 그대로 그날 출결에 찍는다.
  //
  // **같은 것을 다시 누르면 취소된다.** 잘못 눌렀을 때 되돌릴 방법이 없으면
  // 안 눌러보게 된다. 등원·지각·결석 다 똑같이 동작해야 헷갈리지 않는다.
  function mark(studentId, status, extraClassId = null, now = null) {
    const off = now === status;
    startTransition(async () => {
      const res = extraClassId
        ? await setClassAttendance(extraClassId, studentId, date, off ? null : status)
        : off
          ? await clearAttendance(studentId, date)
          : await setAttendance(studentId, date, status);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }
  // 결석 예정 학생의 리포트를 만들어 둔다 → 발송 목록에 '결석 안내'로 뜬다
  function markAbsent(studentId, reason, extraClassId = null) {
    // 특강 결석은 그 반에만 남긴다 — 정규까지 결석 처리되면 수강료가 틀린다
    if (extraClassId) {
      startTransition(async () => {
        const res = await setClassAttendance(extraClassId, studentId, date, "absent");
        if (res?.error) alert(res.error);
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      const res = await saveStudentDay(studentId, date, {
        attendance: "absent",
        notice: reason ? `${reason}로 결석했습니다.` : "",
        items: {},
        toCheck: [],
        nextHomework: [],
      });
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function reopen(studentId) {
    startTransition(async () => {
      const res = await reopenReport(studentId, date);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }
  function undo(studentId, extraClassId = null) {
    startTransition(async () => {
      if (extraClassId) await setClassAttendance(extraClassId, studentId, date, null);
      else await clearAttendance(studentId, date);
      router.refresh();
    });
  }

  // 완료 = 기록 저장까지 끝난 학생. 출결만 찍은 건 아직 '남은'으로 본다.
  // 완료 = 기록 저장까지 끝난 학생. 미리 연락받은 결석은 처리할 게 없으므로 완료로 본다.
  // 특강 줄은 정규 리포트의 완료 표시를 따라가면 안 된다.
  // 같은 학생이라도 정규에서 기록을 끝냈다고 특강까지 끝난 것은 아니다.
  const isDone = (r) =>
    r.rowDone !== null && r.rowDone !== undefined
      ? r.rowDone
      : !!r.reportWritten || r.plannedAbsent;
  const all = groups.flatMap((g) => g.rows);
  const counts = {
    todo: all.filter((r) => !isDone(r)).length,
    done: all.filter(isDone).length,
    absent: all.filter((r) => r.status === "absent").length,
    makeup: all.filter((r) => r.isMakeup).length,
  };

  if (groups.length === 0) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          오늘 수업이 없습니다. <b>반</b> 메뉴에서 요일을 설정하면 여기에 나타나요.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 6, marginTop: 12 }}>
        {[
          ["todo", `남은 ${counts.todo}`],
          ["all", `전체 ${all.length}`],
          ["absent", `결석 ${counts.absent}`],
          ["makeup", `보강 ${counts.makeup}`],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        {groups.map(({ klass, rows, textbookIds = [] }) => {
          const todo = rows.filter((r) => !isDone(r));
          const done = rows.filter(isDone);
          // 출결을 찍은 학생이 **위로** 온다. 안 찍었다고 감추지는 않는다 —
          // 등원 전에 미리 숙제를 검사하거나 다음 숙제를 정해둘 수 있어야 한다.
          const byArrived = (a, b) =>
            (b.status ? 1 : 0) - (a.status ? 1 : 0) ||
            a.student.name.localeCompare(b.student.name, "ko");
          const visible =
            filter === "todo"
              ? [...todo].sort(byArrived)
              : filter === "absent"
              ? rows.filter((r) => r.status === "absent")
              : filter === "makeup"
              ? rows.filter((r) => r.isMakeup)
              : rows;
          const opened = openClass === klass.id;

          return (
            <div className="card" key={klass.id} style={{ padding: 0, overflow: "hidden" }}>
              <button
                className="grouphead"
                onClick={() => setOpenClass(opened ? null : klass.id)}
              >
                <span style={{ fontWeight: 800 }}>
                  {opened ? "▾" : "▸"} {cut(klass.start_time)}
                  {klass.end_time ? `-${cut(klass.end_time)}` : ""} {klass.name}
                  {klass.category && klass.category !== "정규반" && (
                    <span
                      className="tag tag-lav"
                      style={{ marginLeft: 6, fontSize: 11 }}
                      title="이 반의 출결은 따로 셉니다 — 정규 출결은 바뀌지 않습니다"
                    >
                      {klass.category}
                    </span>
                  )}
                </span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {[klass.room, klass.level].filter(Boolean).join(" · ")}
                  {"  "}남은 {todo.length}명 / {rows.length}명
                </span>
              </button>

              {opened && (
                <div style={{ padding: "0 0 6px" }}>
                  {/* ① 출결 먼저 — 온 아이부터 아래에 펼쳐진다 */}
                  {(() => {
                    const notYet = rows.filter((r) => !r.status);
                    if (notYet.length === 0) return null;
                    return (
                      <div className="attstrip">
                        <div className="row" style={{ gap: 8, alignItems: "baseline", marginBottom: 6 }}>
                          <b style={{ fontSize: 13 }}>등원</b>
                          <span className="hint" style={{ flex: 1 }}>
                            폰·출석·숙제는 <b>학생이 자기 화면에서</b> 누릅니다. 아직 앱을 안 줬거나
                            폰이 없으면 <b>여기서 대신 찍으셔도 됩니다</b> — {notYet.length}명 남음
                          </span>
                          <button
                            className="btn btn-sm"
                            disabled={pending}
                            onClick={() =>
                              notYet.forEach((r) => mark(r.student.id, "present", r.extraClassId))
                            }
                            title="온 학생을 한 번에 정시로"
                          >
                            전부 정시
                          </button>
                        </div>
                        <div className="stack" style={{ gap: 4 }}>
                          {notYet.map((r) => (
                            <div className="unitrow" key={r.student.id}>
                              <b style={{ fontSize: 13.5, minWidth: 62 }}>{r.student.name}</b>
                              {r.isMakeup && (
                                <span className="tag tag-lav">
                                  보강{r.makeupTime ? ` ${r.makeupTime.slice(0, 5)}` : ""}
                                </span>
                              )}
                              {r.plannedAbsent && (
                                <span className="tag tag-amber">
                                  결석 예정{r.absenceReason ? ` · ${r.absenceReason}` : ""}
                                </span>
                              )}
                              <span className="spacer" />
                              {[
                                ["phone", "폰", r.phoneAt],
                                ["attend", "출석", r.attendAt],
                                ["homework", "숙제", r.homeworkAt],
                              ].map(([kind, label, at]) => (
                                <button
                                  key={kind}
                                  className={`btn btn-sm ${at ? "btn-primary" : "btn-ghost"}`}
                                  disabled={pending}
                                  style={{ padding: "3px 9px", fontSize: 12 }}
                                  title={
                                    at
                                      ? `${new Date(at).toLocaleTimeString("ko-KR", {
                                          timeZone: "Asia/Seoul",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })} · 다시 누르면 취소`
                                      : "대신 찍기"
                                  }
                                  onClick={() =>
                                    startTransition(async () => {
                                      const res = await setArrivalFor(r.student.id, date, kind, !at);
                                      if (res?.error) alert(res.error);
                                      router.refresh();
                                    })
                                  }
                                >
                                  {at ? "✓ " : ""}
                                  {label}
                                </button>
                              ))}
                              <a
                                className="btn btn-ghost btn-sm"
                                href={`/me?s=${r.student.id}&try=1`}
                                target="_blank"
                                rel="noreferrer"
                                title="이 학생인 척 학생 화면을 직접 눌러봅니다 (로그아웃 안 해도 됩니다)"
                                style={{ padding: "3px 8px", fontSize: 11.5 }}
                              >
                                체험
                              </a>
                              {ATT.slice(0, 3).map((a) => {
                                const on = r.status === a.key;
                                return (
                                  <button
                                    key={a.key}
                                    className={`btn btn-sm ${on ? "btn-primary" : "btn-ghost"}`}
                                    disabled={pending}
                                    style={{ padding: "3px 10px" }}
                                    title={on ? "다시 누르면 취소돼요" : undefined}
                                    onClick={() =>
                                      // 이미 찍힌 것을 또 누르면 취소 — 결석도 마찬가지
                                      a.key === "absent" && !on
                                        ? markAbsent(r.student.id, r.absenceReason, r.extraClassId)
                                        : mark(r.student.id, a.key, r.extraClassId, r.status)
                                    }
                                  >
                                    {on ? "✓ " : ""}{a.label}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {visible.length === 0 ? (
                    <p className="muted" style={{ margin: 0, padding: "10px 16px", fontSize: 13 }}>
                      {filter === "todo"
                        ? "이 반은 기록까지 모두 끝냈어요 👏"
                        : "해당하는 학생이 없어요."}
                    </p>
                  ) : (
                    visible.map((r) => {
                      const isOpen = openId === r.student.id;
                      return (
                        <div key={r.student.id} className="stuRow">
                          <button
                            className="stuLine"
                            onClick={() => setOpenId(isOpen ? null : r.student.id)}
                          >
                            <span style={{ fontWeight: 700 }}>{r.student.name}</span>
                            <span className="muted" style={{ fontSize: 12 }}>
                              {[r.student.school, r.student.grade].filter(Boolean).join(" ")}
                            </span>
                            {r.isMakeup && (
                              <span className="tag tag-lav" title="보강으로 온 학생">
                                보강
                                {r.makeupReason
                                  ? ` · ${r.makeupReason}`
                                  : r.makeupOf
                                  ? ` · ${r.makeupOf.slice(5).replace("-", "/")} 결석분`
                                  : ""}
                              </span>
                            )}
                            {r.plannedAbsent && (
                              <span className="tag tag-amber">
                                결석 예정{r.absenceReason ? ` · ${r.absenceReason}` : ""}
                              </span>
                            )}
                            {r.plannedAbsent && !r.reportWritten && (
                              <span
                                className="btn btn-ghost btn-sm"
                                title="결석 안내를 보낼 수 있도록 기록을 만들어 둡니다"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAbsent(r.student.id, r.absenceReason, r.extraClassId);
                                }}
                              >
                                결석 기록
                              </span>
                            )}
                            {(() => {
                              const d = (r.notices || []).filter((n) => n.kind === "deliver");
                              const left = d.filter((n) => !n.delivered).length;
                              if (d.length === 0) return null;
                              return (
                                <span className={`tag ${left ? "tag-amber" : "tag-mint"}`}>
                                  전달 {d.length - left}/{d.length}
                                </span>
                              );
                            })()}
                            <span className="spacer" />
                            {r.status ? (
                              <span
                                className={`tag ${CLS[r.status]}`}
                                style={{ cursor: "pointer" }}
                                onClick={(e) => { e.stopPropagation(); undo(r.student.id, r.extraClassId); }}
                                title={
                                  r.attendAt
                                    ? `학생이 ${new Date(r.attendAt).toLocaleTimeString("ko-KR", {
                                        timeZone: "Asia/Seoul",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })} 에 출석 체크를 눌렀습니다 · 누르면 출결이 취소돼요`
                                    : "누르면 출결이 취소돼요"
                                }
                              >
                                {LABEL[r.status]}
                                {r.attendAt
                                  ? ` ${new Date(r.attendAt).toLocaleTimeString("ko-KR", {
                                      timeZone: "Asia/Seoul",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}`
                                  : ""}
                              </span>
                            ) : (
                              <span
                                className="btn btn-ghost btn-sm"
                                onClick={(e) => { e.stopPropagation(); mark(r.student.id, "present", r.extraClassId); }}
                              >
                                등원
                              </span>
                            )}
                            {r.reportWritten ? (
                              <span
                                className="tag tag-mint"
                                title="클릭하면 완료를 취소해요"
                                onClick={(e) => { e.stopPropagation(); reopen(r.student.id); }}
                                style={{ cursor: "pointer" }}
                              >
                                완료
                              </span>
                            ) : r.status ? (
                              <span className="tag tag-amber">기록 전</span>
                            ) : null}
                            {(() => {
                              // 아직 말 안 한 전달사항 — 열지 않아도 보이게
                              const left = (r.notices || []).filter(
                                (n) => n.kind === "deliver" && !n.delivered
                              ).length;
                              return left > 0 ? (
                                <span className="tag tag-amber" title="학생에게 말할 것">
                                  말할 것 {left}
                                </span>
                              ) : null;
                            })()}
                            {waitingChecks(r.doneRows || [], items, r.items || {}).length > 0 && (
                              <span
                                className="tag tag-amber"
                                title="학생이 학습 완료를 눌렀습니다. 검사를 기다리는 중입니다"
                              >
                                검사 대기{" "}
                                {waitingChecks(r.doneRows || [], items, r.items || {}).length}
                              </span>
                            )}
                            {r.warn?.need && (
                              <span className="tag tag-red" title="경고가 쌓여 반성문 대상입니다">
                                반성문
                              </span>
                            )}
                            {!r.warn?.need && r.warn?.count > 0 && (
                              <span className="tag tag-amber" title="쌓인 경고">
                                경고 {r.warn.count}
                              </span>
                            )}
                            {(r.stay || []).filter((t) => t.status === "todo").length > 0 && (
                              <span className="tag tag-lav" title="남아서 할 것">
                                마무리 {(r.stay || []).filter((t) => t.status === "todo").length}
                              </span>
                            )}
                            {r.unreadComments > 0 && (
                              <span className="tag tag-red" title="학생·학부모가 남긴 댓글">
                                💬 {r.unreadComments}
                              </span>
                            )}
                            <span className="muted" style={{ fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
                          </button>

                          {isOpen && (
                            <StudentPanel
                              row={r}
                              date={date}
                              items={items}
                              textbooks={textbooks}
                              classTextbookIds={textbookIds}
                              unitNames={unitNames}
                              rule={rule}
                              onSaved={() => setOpenId(null)}
                            />
                          )}
                        </div>
                      );
                    })
                  )}

                  {filter === "todo" && done.length > 0 && (
                    <div style={{ padding: "6px 16px 10px" }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setShowDone({ ...showDone, [klass.id]: !showDone[klass.id] })
                        }
                      >
                        {showDone[klass.id] ? "▾" : "▸"} 완료 {done.length}명
                      </button>
                      {showDone[klass.id] &&
                        done.map((r) => (
                          <div key={r.student.id} className="stuLine" style={{ cursor: "default" }}>
                            <span style={{ fontWeight: 600 }}>{r.student.name}</span>
                            <span className="spacer" />
                            <span className={`tag ${CLS[r.status]}`}>{LABEL[r.status]}</span>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => reopen(r.student.id)}
                              disabled={pending}
                            >
                              완료 취소
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => undo(r.student.id, r.extraClassId)}
                              disabled={pending}
                            >
                              출결 취소
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 수업이 끝났는데 늦귀가 과제가 그대로 남아 있는 학생.
          아이가 아직 안 갔거나, 원장님이 처리를 안 한 것이다.
          둘 중 무엇이든 그냥 두면 안 된다 — 학생 화면도 계속 '학원' 으로 잡힌다. */}
      {(() => {
        const stuck = groups
          .filter(({ klass }) => {
            const end = cut(klass.end_time);
            if (!end) return false;
            const now = new Date();
            const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(
              now.getMinutes()
            ).padStart(2, "0")}`;
            return hhmm >= end;
          })
          .flatMap(({ rows }) => rows)
          .filter((r) => (r.stay || []).some((t) => t.status === "todo"));
        if (stuck.length === 0) return null;
        return (
          <div
            className="card"
            style={{ marginTop: 12, borderLeft: "3px solid var(--amber, #e0a33e)" }}
          >
            <b style={{ fontSize: 14 }}>수업이 끝났는데 늦귀가 과제가 남아 있어요</b>
            <p className="hint" style={{ margin: "4px 0 8px" }}>
              아직 안 갔거나, 처리를 못 하신 겁니다. <b>끝냈으면 완료로, 집에서 하게 하려면
              숙제로 넘겨주세요.</b> 그래야 학생 화면도 하원으로 바뀝니다.
            </p>
            <div className="stack" style={{ gap: 3 }}>
              {stuck.map((r) => (
                <div className="unitrow" key={r.student.id}>
                  <b style={{ fontSize: 13.5, minWidth: 62 }}>{r.student.name}</b>
                  <span className="tag tag-amber">
                    {(r.stay || []).filter((t) => t.status === "todo").length}개 남음
                  </span>
                  <span className="hint" style={{ flex: 1, fontSize: 12 }}>
                    {(r.stay || [])
                      .filter((t) => t.status === "todo")
                      .map((t) => t.body)
                      .join(", ")}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setOpenId(r.student.id)}
                  >
                    열기
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 다 찍고 나면 바로 발송으로 — 매번 메뉴를 다시 찾아 들어가지 않게 */}
      {(() => {
        const all = groups.flatMap((g) => g.rows);
        const ready = all.filter((r) => r.reportWritten).length;
        const left = all.filter((r) => r.status && !isDone(r)).length;
        if (ready === 0) return null;
        return (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 14 }}>기록 끝난 학생 {ready}명</b>
              {left > 0 && (
                <span className="tag tag-amber">아직 기록 안 한 학생 {left}명</span>
              )}
              <span className="spacer" />
              <Link className="btn btn-primary btn-sm" href={`/report?d=${date}`}>
                학부모에게 발송하러 가기 →
              </Link>
            </div>
          </div>
        );
      })()}
    </>
  );
}
