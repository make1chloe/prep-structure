"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useLazyRefresh } from "@/components/useLazyRefresh";
import Link from "next/link";
import dynamic from "next/dynamic";
import { setAttendance, clearAttendance, reopenReport, saveStudentDay } from "./actions";
import { defaultSheetTab } from "@/lib/sheetTab";
import { classLabel } from "@/lib/classLabel";

/**
 * **학생 판은 열 때 내려받는다** (성능수리 3차).
 *
 * 판(StudentPanel)과 그 아래 딸린 것들은 오늘 수업 화면이 브라우저로 내려보내는
 * 자바스크립트의 대부분이다 — 3,092줄짜리 한 파일에, 진도판·단원 고르기·댓글·
 * 사진까지 줄줄이 딸려 온다. 그런데 이건 **「▸ 열기」 를 눌러야** 보이는
 * 것이다. 원장님이 출결만 찍고 지나가는 날에도 전부 받고 있었다.
 *
 * `isOpen && <StudentPanel …>` 는 **그리기**만 미루지 **받기**를 미루지
 * 않는다 — 위에서 import 한 순간 같은 뭉치에 들어간다. 그래서 next/dynamic 으로
 * 가른다: 처음 누르는 그때 조각 하나를 더 받는다.
 *
 * `ssr: false` — 이 판은 서버가 그릴 일이 없다 (첫 그림에서는 늘 닫혀 있다).
 *
 * 기다리는 동안 보이는 자리는 **`.stuPanel` 이 아닌** 다른 이름이어야 한다.
 * 골든 검사(scripts/e2e/golden-dayboard.mjs)가 `.stuPanel` 이 보이는 것을
 * 「판이 다 떴다」 로 삼고 그 안의 탭을 누른다 — 같은 이름을 붙이면 빈 자리를
 * 판으로 착각하고 눌러서, 배치를 안 건드렸는데 골든이 흔들린다.
 */
const StudentPanel = dynamic(() => import("./StudentPanel"), {
  ssr: false,
  loading: () => (
    <div className="stuPanelWait">
      <p className="hint" style={{ margin: 0 }}>여는 중…</p>
    </div>
  ),
});


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

/**
 * **열쇠 한 벌** — 한 학생이 정규·특강 두 줄로 뜨므로 「학생 + 그 반」 이
 * 한 줄을 가리킨다. 컴포넌트 밖에 둔다 — 안에 두면 useState 초기화 함수가
 * 선언보다 먼저 써서 첫 렌더가 백지가 된다 (검사도 못 잡는 꼴이다).
 */
const optKey = (sid, extra) => `${sid}|${extra || ""}`;

export default function TodayBoard({
  date,
  groups = [],
  items = [],
  textbooks = [],
  unitNames = {},
  rule = {},
  grammarCommon = [],
  openStudent = null,
  help = false,
}) {
  // 수업 준비에서 「고치기」 로 넘어오면 그 학생 판을 **열어둔 채로** 시작한다.
  // 날짜만 맞춰놓고 다시 찾아 누르게 하면 두 번 일하는 것이다.
  /**
   * **열림 키는 「학생 + 그 반」 이다** (2026-08-24 검증에서 나온 것).
   *
   * 한 학생이 정규반과 특강반 두 줄로 뜬다(app/today/page.jsx 의 extraClassId).
   * 그런데 열림 표시가 학생 id 하나뿐이라, 두 줄이 동시에 펼쳐지면 **판이 두 개**
   * 열린다 — 같은 임시저장을 서로 덮어쓰고, 출결도 「특강 결석이 정규까지」 로
   * 샐 수 있다(그러면 수강료가 틀어진다). 지금은 반이 한 번에 하나만 펼쳐져
   * 우연히 안 터졌을 뿐이다. 판을 줄 밖으로 꺼내는 순간(시트·분할) 바로 터진다.
   *
   * 딥링크(`?open=학생id`)는 학생만 주므로, 그 학생의 **첫 줄**로 맞춘다.
   */
  const [openId, setOpenId] = useState(() => {
    if (!openStudent) return null;
    // **정규 줄이 먼저다** (2026-08-24 검증) — 반 목록은 시작 시각 순이라
    // 특강이 앞 시간이면 딥링크가 특강 판을 열어, 출결이 그 특강 반에만 찍힌다
    const hits = [];
    for (const g of groups) {
      for (const r of g.rows || []) {
        if (r.student.id === openStudent) hits.push(r);
      }
    }
    const pick = hits.find((r) => !r.extraClassId) || hits[0];
    return pick ? optKey(pick.student.id, pick.extraClassId) : optKey(openStudent, null);
  });
  const [openClass, setOpenClass] = useState(() => {
    if (openStudent) {
      const g = groups.find((x) => (x.rows || []).some((r) => r.student.id === openStudent));
      if (g) return g.klass.id;
    }
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
  // 새 판(C4) — 칩이 고른 때. 판(StudentPanel sheets)이 이 값을 따른다
  const [rowTab, setRowTab] = useState("check");
  const [pending, startTransition] = useTransition();
  // 출결 칩·완료 풀기는 연달아 누른다 — 미뤄서 한 번만 (2026-08-23)
  const { lazy, flush } = useLazyRefresh();

  /**
   * **누르면 0.1초 안에 바뀌어야 한다** (원장님, 2026-08-14).
   *
   * 지금까지는 출결 하나를 찍으면 저장 → 화면 전체 재계산이 끝날 때까지
   * 표시가 안 바뀌었다. 서버 왕복은 아무리 줄여도 0.1초가 안 되므로,
   * **화면을 먼저 바꾸고 저장은 뒤에서** 한다. 실패하면 되돌리고 알린다.
   * (진도 칩이 이미 이 방식이다 — 같은 규칙을 출결에도)
   */
  const [opt, setOpt] = useState({});
  const stOf = (r) =>
    optKey(r.student.id, r.extraClassId) in opt
      ? opt[optKey(r.student.id, r.extraClassId)]
      : r.status;
  const paint = (sid, extra, status) =>
    setOpt((prev) => ({ ...prev, [optKey(sid, extra)]: status }));
  const unpaint = (sid, extra) =>
    setOpt((prev) => {
      const n = { ...prev };
      delete n[optKey(sid, extra)];
      return n;
    });
  /**
   * **완료 표시도 누르는 순간 바뀐다** (원장님, 2026-08-21 — 「버튼이 작동이
   * 너무 늦어」). 「결석 기록」 과 「완료 취소」 는 서버 답 + 재계산을
   * 기다렸다 — 출결 칠하기(paint)와 같은 규칙으로 화면 먼저, 실패하면 되돌린다.
   * key → true(방금 기록 씀) | false(방금 완료 취소).
   */
  const [optWrote, setOptWrote] = useState({});
  const wrote = (r) => {
    const k = optKey(r.student.id, r.extraClassId);
    return k in optWrote ? optWrote[k] : !!r.reportWritten;
  };
  const unWrote = (k) =>
    setOptWrote((m) => {
      const n = { ...m };
      delete n[k];
      return n;
    });

  // 출결은 늘 그날 출결(attendance) 하나다 — 옛 특강반의 반별 출결
  // (setClassAttendance → class_attendance) 쓰기는 0164 모델 전환·0173
  // 하강으로 끝났다. 남은 표는 지난 반 조회 전용이다.
  //
  // **같은 것을 다시 누르면 취소된다.** 잘못 눌렀을 때 되돌릴 방법이 없으면
  // 안 눌러보게 된다. 등원·지각·결석 다 똑같이 동작해야 헷갈리지 않는다.
  function mark(studentId, status, extraClassId = null, now = null) {
    const off = now === status;
    paint(studentId, extraClassId, off ? null : status);   // 먼저 그린다
    startTransition(async () => {
      const res = off
        ? await clearAttendance(studentId, date)
        : await setAttendance(studentId, date, status);
      if (res?.error) {
        unpaint(studentId, extraClassId);                  // 실패하면 되돌린다
        alert(res.error);
        return;
      }
      lazy();
    });
  }
  // 결석 예정 학생의 리포트를 만들어 둔다 → 발송 목록에 '결석 안내'로 뜬다
  function markAbsent(studentId, reason, extraClassId = null) {
    paint(studentId, extraClassId, "absent");   // 먼저 그린다 (원장님 2026-08-21 「작동이 너무 늦어」)
    const k = optKey(studentId, extraClassId);
    setOptWrote((m) => ({ ...m, [k]: true }));  // 「결석 기록」 단추도 그 자리에서 사라진다
    startTransition(async () => {
      // items·nextHomework 키를 보내면 「그 그룹 전체 교체」 라서, 빈
      // 값이면 그날 검사·배정이 통째로 지워진다 (배정줄 계획서 검토
      // 중대6 실측 — 결석 기록이 그날 배정을 전멸시키던 출혈). 결석
      // 기록은 출결·안내만 만지므로 그 키들을 아예 안 보낸다.
      const res = await saveStudentDay(studentId, date, {
        attendance: "absent",
        notice: reason ? `${reason}로 결석했습니다.` : "",
      });
      if (res?.error) {
        unpaint(studentId, extraClassId);       // 실패 — 되돌린다
        unWrote(k);
        alert(res.error);
        return;
      }
      lazy();
    });
  }

  function reopen(studentId, extraClassId = null) {
    const k = optKey(studentId, extraClassId);
    // 누르는 순간 완료가 풀린다 — 재계산을 기다리면 안 눌린 줄 알고 또 누른다
    setDoneOpt((prev) => { const n = new Set(prev); n.delete(k); return n; });
    setOptWrote((m) => ({ ...m, [k]: false }));
    startTransition(async () => {
      const res = await reopenReport(studentId, date);
      if (res?.error) {
        unWrote(k);                             // 실패 — 서버 값(완료)으로 되돌아간다
        alert(res.error);
        return;
      }
      lazy();
    });
  }
  function undo(studentId, extraClassId = null) {
    paint(studentId, extraClassId, null);                  // 먼저 그린다
    startTransition(async () => {
      await clearAttendance(studentId, date);
      lazy();
    });
  }

  // 완료 = 기록 저장까지 끝난 학생. 출결만 찍은 건 아직 '남은'으로 본다.
  // 완료 = 기록 저장까지 끝난 학생. 미리 연락받은 결석은 처리할 게 없으므로 완료로 본다.
  // 특강 줄은 정규 리포트의 완료 표시를 따라가면 안 된다.
  // 같은 학생이라도 정규에서 기록을 끝냈다고 특강까지 끝난 것은 아니다.
  /**
   * **저장한 순간 줄이 넘어간다** (원칙 6-3). 판이 닫히는 건 빨랐는데,
   * 줄이 「완료」 묶음으로 옮겨가는 것은 재계산을 기다렸다 — 저장을 눌렀는데
   * 아직 「남음」 에 서 있으면 안 눌린 줄 알고 또 연다.
   */
  const [doneOpt, setDoneOpt] = useState(() => new Set());
  /**
   * **방금 저장한 학생은 줄만 접는다** (원장님, 2026-08-21 — 「ㅇㅇ 줄만
   * 접어」). 저장하자마자 완료 묶음으로 사라지면, 별점 하나 고치려고
   * 완료 펼치기→찾기→열기 서너 번을 눌러야 했다. 그 자리에 「완료」
   * 태그로 남았다가, **다른 학생을 여는 순간** 완료 묶음으로 정리된다.
   */
  const [justSaved, setJustSaved] = useState(null);

  /**
   * **닫는 길은 하나** (2026-08-24). 미뤄둔 새로고침을 정리하고, 닫은 뒤
   * 그 줄로 눈을 돌려준다 — 폰 시트는 화면을 덮으므로 닫고 나면 목록 어디에
   * 있었는지 알 수 없다. 저장으로 닫힐 때는 목록이 다시 오며 줄이 위로
   * 올라가므로(출결이 찍혀서) 한 박자 뒤에 한 번 더 잡는다.
   */
  const wantScroll = useRef(null);
  function closeRow(k) {
    if (typeof document !== "undefined") document.activeElement?.blur?.();
    flush();
    setOpenId((cur) => (cur === k ? null : cur));
    wantScroll.current = k;
    requestAnimationFrame(() => scrollToRow(k));
  }
  function scrollToRow(k) {
    if (typeof document === "undefined" || !k) return;
    const el = document.querySelector(`[data-row="${CSS.escape(k)}"]`);
    if (el) el.scrollIntoView({ block: "center" });
  }
  // 목록이 다시 온 뒤 한 번 더 (저장하면 줄 자리가 바뀐다)
  useEffect(() => {
    const k = wantScroll.current;
    if (!k) return;
    wantScroll.current = null;
    const t = setTimeout(() => scrollToRow(k), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);
  const isDone = (r) => {
    const k = optKey(r.student.id, r.extraClassId);
    if (doneOpt.has(k)) return true;
    // 방금 완료 취소/결석 기록한 줄 — 서버 답 전에 먼저 반영 (2026-08-21)
    if (k in optWrote) return optWrote[k] || !!r.plannedAbsent;
    return r.rowDone !== null && r.rowDone !== undefined
      ? r.rowDone
      : !!r.reportWritten || r.plannedAbsent;
  };
  // 참조 줄(특강 label 그룹의 겹치는 학생)은 세지 않는다 — 정규 줄에서
  // 이미 센 학생이라 두 번 세면 숫자가 부푼다 (0164)
  const all = groups.flatMap((g) => g.rows).filter((r) => !r.refOnly);
  const counts = {
    todo: all.filter((r) => !isDone(r)).length,
    done: all.filter(isDone).length,
    absent: all.filter((r) => stOf(r) === "absent").length,
    makeup: all.filter((r) => r.isMakeup).length,
  };

  if (groups.length === 0) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
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
            className={`btn btn-sm ${filter === k ? "btn-on" : "btn-ghost"}`}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        {groups.map(({ klass, rows }) => {
          const todo = rows.filter(
            (r) => !isDone(r) || optKey(r.student.id, r.extraClassId) === justSaved
          );
          const done = rows.filter(isDone);
          // 출결을 찍은 학생이 **위로** 온다. 안 찍었다고 감추지는 않는다 —
          // 등원 전에 미리 숙제를 검사하거나 다음 숙제를 정해둘 수 있어야 한다.
          const byArrived = (a, b) =>
            (b.status ? 1 : 0) - (a.status ? 1 : 0) ||
            a.student.name.localeCompare(b.student.name, "ko");
          /**
           * **열어둔 줄은 필터에서 빠져도 남긴다** (2026-08-24 검증).
           * 빠지면 그 순간 판이 통째로 언마운트되어 적던 것이 사라진다.
           * 세 갈래 전부에 적용한다 — 열어둔 채 필터를 바꿔도 마찬가지다.
           * (「남은 N명」 세는 todo 는 건드리지 않는다 — 숫자가 틀어진다)
           */
          const keepOpen = (list) => {
            if (!openId) return list;
            if (list.some((r) => optKey(r.student.id, r.extraClassId) === openId)) return list;
            const back = rows.find((r) => optKey(r.student.id, r.extraClassId) === openId);
            return back ? [...list, back] : list;
          };
          const visible = keepOpen(
            filter === "todo"
              ? [...todo].sort(byArrived)
              : filter === "absent"
              ? rows.filter((r) => stOf(r) === "absent")
              : filter === "makeup"
              ? rows.filter((r) => r.isMakeup)
              : rows
          );
          const opened = openClass === klass.id;

          return (
            <div className="card" key={klass.id} style={{ padding: 0, overflow: "hidden" }}>
              <button
                className="grouphead"
                onClick={() => {
                  // 접으면 그 반의 줄이 통째로 사라진다 — 열린 판이 있으면 같이 닫는다
                  if (opened && openId && rows.some((r) => optKey(r.student.id, r.extraClassId) === openId)) {
                    flush();
                    setOpenId(null);
                  }
                  setOpenClass(opened ? null : klass.id);
                }}
              >
                <span style={{ fontWeight: 800 }}>
                  {/* 시간은 칸에서 한 번만 — 이름 속 시간은 걷어낸다 (lib/classLabel) */}
                  {opened ? "▾" : "▸"} {classLabel(klass)}
                  {klass.category && klass.category !== "정규반" && (
                    <span
                      className="tag tag-lav"
                      style={{ marginLeft: 6, fontSize: 12 }}
                      title="이 반의 출결은 따로 셉니다 — 정규 출결은 바뀌지 않습니다"
                    >
                      {klass.category}
                    </span>
                  )}
                </span>
                <span className="muted" style={{ fontSize: 14 }}>
                  {[klass.room, klass.level].filter(Boolean).join(" · ")}
                  {"  "}남은 {todo.length}명 / {rows.length}명
                </span>
              </button>

              {opened && (
                <div style={{ padding: "0 0 6px" }}>
                  {/**
                    * ① 등원 — **한 줄만** (원장님, 2026-08-11 — 「이거 학생
                    * 중복으로 둘 필요있어? 폰/숙제/출결 안하면 안넘어가는
                    * 거는 학생화면만 그러면 되는거고 나는 상관없어」).
                    *
                    * 전에는 여기에 학생마다 폰·출석·숙제·정시·지각·결석
                    * 단추가 한 줄씩 늘어서서, 바로 아래 학생 목록과 이름이
                    * **두 번** 나왔다. 그 단추들은 각 학생 판의 등원·출결
                    * 줄에 다 있다 — 여기는 「전부 정시」 하나면 된다.
                    */}
                  {(() => {
                    const notYet = rows.filter((r) => !stOf(r));
                    if (notYet.length === 0) return null;
                    // 결석 예정인 아이는 「전부 정시」 에서 뺀다 — 눌렀다가
                    // 결석 예정이 정시로 뒤집히면 아무도 모른다
                    const planned = notYet.filter((r) => r.plannedAbsent);
                    const coming = notYet.filter((r) => !r.plannedAbsent);
                    return (
                      <div className="attstrip">
                        <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                          <b style={{ fontSize: 14.5 }}>등원</b>
                          <span className="hint" style={{ flex: 1, minWidth: 200 }}>
                            {notYet.length}명 남음
                            {planned.length > 0 && (
                              <>
                                {" "}· 결석 예정{" "}
                                {planned
                                  .map((r) => r.student.name + (r.absenceReason ? `(${r.absenceReason})` : ""))
                                  .join(" · ")}
                              </>
                            )}
                            {" "}— 출결·폰·숙제는 아래 학생 줄을 열면 있습니다
                          </span>
                          {coming.length > 0 && (
                            <button
                              className="btn btn-sm"
                              disabled={pending}
                              onClick={() =>
                                coming.forEach((r) => mark(r.student.id, "present", r.extraClassId))
                              }
                              title="결석 예정을 뺀 나머지를 한 번에 정시로"
                            >
                              전부 정시
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {visible.length === 0 ? (
                    <p className="muted" style={{ margin: 0, padding: "10px 16px", fontSize: 14.5 }}>
                      {filter === "todo"
                        ? "이 반은 기록까지 모두 끝냈어요 👏"
                        : "해당하는 학생이 없어요."}
                    </p>
                  ) : (
                    visible.map((r) => {
                      // 특강 label 그룹의 참조 줄 — 이 학생은 오늘 정규
                      // 반에도 있어서 기록은 그쪽 줄이 주체다 (0164,
                      // 하루 1판). 여기는 「누가 오나」 명단 확인용.
                      if (r.refOnly) {
                        return (
                          <div key={`ref-${r.student.id}`} className="stuRow">
                            <div className="stuLine" style={{ cursor: "default" }}>
                              <span className="stuWho">
                                <span className="stuName">{r.student.name}</span>
                              </span>
                              <span className="stuTags">
                                <span className="tag">기록은 정규 반 줄에서</span>
                              </span>
                            </div>
                          </div>
                        );
                      }
                      const isOpen = openId === optKey(r.student.id, r.extraClassId);
                      return (
                        <div
                          key={optKey(r.student.id, r.extraClassId)}
                          className="stuRow"
                          data-row={optKey(r.student.id, r.extraClassId)}
                        >
                          {
                            /* ── 줄 신판 (C4 — 실행지도 v2) ──
                               div + 칩3(검사·수업·다음 — 진짜 button 36px) +
                               배지2(경고·💬) + 출결·✓(stuEnd). 빈 곳은
                               무반응(원장 확정 — 오탭 방지), 칩이 그 때로
                               직행한다. 공유 .stuLine 은 무변형 — cursor 만
                               인라인 (TodayBoard 완료 줄 선례) */
                            <div className="stuLine" style={{ cursor: "default" }}>
                              <span className="stuWho">
                                <span className="stuName">{r.student.name}</span>
                                <span className="stuSub">
                                  {[r.student.school, r.student.grade].filter(Boolean).join(" ")}
                                </span>
                              </span>
                              <span className="stuTags">
                                {[
                                  ["check", "검사", (() => {
                                    const t = (r.toCheck || []).length;
                                    if (!t) return "";
                                    const left = (r.toCheck || []).filter((id) => !(r.items || {})[id]).length;
                                    return left ? `${left}` : "✓";
                                  })()],
                                  ["lesson", "수업", (r.inClass || []).length ? String((r.inClass || []).length) : ""],
                                  ["next", "다음", (r.nextHomework || []).length ? String((r.nextHomework || []).length) : ""],
                                ].map(([tab, label, n]) => (
                                  <button
                                    key={tab}
                                    className="btn btn-sm btn-ghost stuChip"
                                    onClick={() => {
                                      const k = optKey(r.student.id, r.extraClassId);
                                      if (justSaved && justSaved !== k) setJustSaved(null);
                                      setRowTab(tab);
                                      setOpenId(k);
                                    }}
                                  >
                                    {label}{n ? ` ${n}` : ""}
                                  </button>
                                ))}
                                {r.warn?.count > 0 && (
                                  <span className="tag tag-red">경고 {r.warn.count}</span>
                                )}
                                {(r.unreadComments || 0) > 0 && (
                                  <span className="tag tag-lav">💬 {r.unreadComments}</span>
                                )}
                                {r.isMakeup && <span className="tag tag-lav">보강</span>}
                                {r.plannedAbsent && <span className="tag tag-amber">결석 예정</span>}
                                {/* 구판 줄에서 이어받은 한 손짓 (C6 — 기능 소실 금지):
                                    결석 예정 학생의 리포트를 그 자리에서 만들어
                                    발송 목록에 「결석 안내」 로 세운다 */}
                                {r.plannedAbsent && !wrote(r) && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    title="결석 안내를 보낼 수 있도록 기록을 만들어 둡니다"
                                    onClick={() => markAbsent(r.student.id, r.absenceReason, r.extraClassId)}
                                  >
                                    결석 기록
                                  </button>
                                )}
                              </span>
                              <span className="stuEnd">
                                {stOf(r) ? (
                                  <span
                                    className={`tag ${CLS[stOf(r)]}`}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => undo(r.student.id, r.extraClassId)}
                                    title="누르면 출결이 취소돼요"
                                  >
                                    {LABEL[stOf(r)]}
                                  </span>
                                ) : (
                                  <span
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => mark(r.student.id, "present", r.extraClassId)}
                                  >
                                    등원
                                  </span>
                                )}
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => {
                                    const k = optKey(r.student.id, r.extraClassId);
                                    if (isOpen) closeRow(k);
                                    // 「지금 때」 판정식 (v7 §5-4) — 기본값 제안일
                                    // 뿐, 칩·탭으로 언제든 다른 때로 간다
                                    else { setRowTab(defaultSheetTab(r)); setOpenId(k); }
                                  }}
                                >
                                  {isOpen ? "▾ 닫기" : "▸ 열기"}
                                </button>
                              </span>
                            </div>
                          }

                          {isOpen && (
                            <StudentPanel
                              sheetTab={rowTab}
                              onSheetTab={setRowTab}
                              row={r}
                              date={date}
                              items={items}
                              textbooks={textbooks}
                              unitNames={unitNames}
                              rule={rule}
                              grammarCommon={grammarCommon}
                              help={help}
                              onClose={() => closeRow(optKey(r.student.id, r.extraClassId))}
                              onSaved={() => {
                                /**
                                 * **닫는 것은 「그 학생 판」 뿐이다** (2026-08-24 검증).
                                 * A 를 저장하고 닫은 뒤 B 를 열었는데 A 의 저장이
                                 * 늦게 끝나면, 무조건 닫던 옛 코드는 **B 판을**
                                 * 닫고 「방금 저장」 표시도 A 로 되돌려 B 가 완료
                                 * 묶음으로 사라졌다.
                                 */
                                const k = optKey(r.student.id, r.extraClassId);
                                closeRow(k);
                                // 먼저 넘긴다 — 재계산이 끝나면 서버 값이 이어받는다
                                setDoneOpt((prev) => new Set(prev).add(k));
                                // 줄은 그 자리에 남긴다 (2026-08-21)
                                setJustSaved((cur) => (cur === null || cur === k ? k : cur));
                              }}
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
                            <span className="stuWho">
                              <span className="stuName">{r.student.name}</span>
                            </span>
                            <span className="stuTags">
                              <span className={`tag ${CLS[stOf(r)]}`}>{LABEL[stOf(r)]}</span>
                            </span>
                            <span className="stuEnd">
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => reopen(r.student.id, r.extraClassId)}
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
                            </span>
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
          // 그 반 id 를 실어 둔다 — 「열기」 가 반도 같이 열어야 줄이 그려진다
          .flatMap(({ klass, rows }) => rows.map((r) => ({ ...r, klassId: klass.id })))
          .filter((r) => (r.stay || []).some((t) => t.status === "todo"));
        if (stuck.length === 0) return null;
        return (
          <div
            className="card"
            style={{ marginTop: 12, borderLeft: "3px solid var(--amber, #e0a33e)" }}
          >
            <b style={{ fontSize: 15 }}>수업이 끝났는데 늦귀가 과제가 남아 있어요</b>
            <p className="hint" style={{ margin: "4px 0 8px" }}>
              {/* 앞 문장은 상태 판단이라 늘 보이고, 뒤 조작법만 설명 스위치를 탄다 (계획서 v2 §3 B3) */}
              아직 안 갔거나, 처리를 못 하신 겁니다.
              {help && (
                <>
                  {" "}<b>끝냈으면 완료로, 집에서 하게 하려면
                  숙제로 넘겨주세요.</b> 그래야 학생 화면도 하원으로 바뀝니다.
                </>
              )}
            </p>
            <div className="stack" style={{ gap: 3 }}>
              {stuck.map((r) => (
                <div className="unitrow" key={optKey(r.student.id, r.extraClassId)}>
                  <b style={{ fontSize: 15, minWidth: 62 }}>{r.student.name}</b>
                  <span className="tag tag-amber">
                    {(r.stay || []).filter((t) => t.status === "todo").length}개 남음
                  </span>
                  <span className="hint" style={{ flex: 1, fontSize: 13 }}>
                    {(r.stay || [])
                      .filter((t) => t.status === "todo")
                      .map((t) => t.body)
                      .join(", ")}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      // 그 반이 접혀 있으면 줄 자체가 안 그려져 아무 일도 안 났다
                      // (원장님이 「열기」 를 눌러도 반응 없던 까닭, 2026-08-24)
                      if (r.klassId) setOpenClass(r.klassId);
                      setRowTab("lesson"); // 늦귀가 과제는 ② 수업 때 소속 — 그 자리로 연다
                      setOpenId(optKey(r.student.id, r.extraClassId));
                    }}
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
        // 참조 줄은 세지 않는다 (0164 — 정규 줄에서 이미 센 학생)
        const all = groups.flatMap((g) => g.rows).filter((r) => !r.refOnly);
        const ready = all.filter((r) => r.reportWritten).length;
        const left = all.filter((r) => stOf(r) && !isDone(r)).length;
        if (ready === 0) return null;
        return (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>기록 끝난 학생 {ready}명</b>
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
