"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAttendance, clearAttendance } from "./actions";
import StudentPanel from "./StudentPanel";

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

export default function TodayBoard({ date, groups = [], items = [] }) {
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

  function mark(studentId, status) {
    startTransition(async () => {
      const res = await setAttendance(studentId, date, status);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }
  function undo(studentId) {
    startTransition(async () => {
      await clearAttendance(studentId, date);
      router.refresh();
    });
  }

  // 완료 = 기록 저장까지 끝난 학생. 출결만 찍은 건 아직 '남은'으로 본다.
  const isDone = (r) => !!r.reportWritten;
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
        {groups.map(({ klass, rows }) => {
          const todo = rows.filter((r) => !isDone(r));
          const done = rows.filter(isDone);
          const visible =
            filter === "todo"
              ? todo
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
                </span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {[klass.room, klass.level].filter(Boolean).join(" · ")}
                  {"  "}남은 {todo.length}명 / {rows.length}명
                </span>
              </button>

              {opened && (
                <div style={{ padding: "0 0 6px" }}>
                  {visible.length === 0 ? (
                    <p className="muted" style={{ margin: 0, padding: "10px 16px", fontSize: 13 }}>
                      {filter === "todo" ? "이 반은 기록까지 모두 끝냈어요 👏" : "해당하는 학생이 없어요."}
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
                            {r.isMakeup && <span className="tag tag-lav">보강</span>}
                            <span className="spacer" />
                            {r.status ? (
                              <span className={`tag ${CLS[r.status]}`}>{LABEL[r.status]}</span>
                            ) : (
                              <span
                                className="btn btn-ghost btn-sm"
                                onClick={(e) => { e.stopPropagation(); mark(r.student.id, "present"); }}
                              >
                                등원
                              </span>
                            )}
                            {r.reportWritten ? (
                              <span className="tag tag-mint">완료</span>
                            ) : r.status ? (
                              <span className="tag tag-amber">기록 전</span>
                            ) : null}
                            <span className="muted" style={{ fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
                          </button>

                          {isOpen && (
                            <StudentPanel
                              row={r}
                              date={date}
                              items={items}
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
                              onClick={() => undo(r.student.id)}
                              disabled={pending}
                            >
                              취소
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
    </>
  );
}
