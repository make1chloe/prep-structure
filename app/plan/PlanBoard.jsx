"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setPlannedAbsenceRange,
  clearPlannedAbsenceRange,
  setMakeup,
} from "./actions";
import { saveStudentDay } from "@/app/today/actions";
import AbsenceRows from "./AbsenceRows";
import { addDays, dayLabel as fmtDay, todaySeoul } from "@/lib/day";
import MakeupRows from "@/app/MakeupRows";

const REASONS = ["학교 행사", "시험 기간", "병원", "가족 일정", "여행", "기타"];

const dayLabel = (d) => (d ? fmtDay(d) : "");

/**
 * **출결 한 화면** — 결석 예정 · 보강 · 지난 수업.
 *
 * 넣는 자리와 무르는 자리를 붙여 놓는다. 예전에는 결석 예정을 넣는 칸만
 * 있고 **들어가 있는 것이 무엇인지는 어디에도 없었다** — 무르려면 학생과
 * 날짜를 기억해서 다시 골라야 했다.
 */
export default function PlanBoard({
  classes = [],
  students = [],
  planReady = true,
  absences = [],
  makeupOn = {},
  nameOf = {},
  scheduledMakeups = [],
  makeupInbox = null,
  makeupAnswers = null,
}) {
  const [tab, setTab] = useState("absence");
  // 그냥 보강 (결석과 무관한 추가 수업) — 잡는 문
  const [freeId, setFreeId] = useState("");
  const [freeDate, setFreeDate] = useState("");
  const [freeTime, setFreeTime] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [reason, setReason] = useState("학교 행사");
  const [absFrom, setAbsFrom] = useState("");
  const [absTo, setAbsTo] = useState("");

  // 낙관 반영 (원장님 2026-08-21 「버튼이 작동이 너무 늦어」) — 서버 답 +
  // router.refresh 를 기다리면 한 박자 늦다. 누르는 순간 화면부터 바꾸고,
  // 실패하면 되돌리고 alert. 성공 alert 은 없앤다 — 화면이 이미 바뀌었다.
  const [addedMk, setAddedMk] = useState([]);              // 방금 잡은 보강 (서버 답 전 미리 그린다)
  const [doneMk, setDoneMk] = useState(() => new Set());   // 방금 완료 찍은 보강 "학생|날짜"

  // 지난 수업 목록 — null 이면 아직 안 불러온 것

  const kw = q.trim().toLowerCase();
  const shown = students.filter(
    (s) =>
      !kw ||
      [s.name, s.school, s.grade].filter(Boolean).some((v) => v.toLowerCase().includes(kw))
  );

  function toggleStudent(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }
  function selectClass(cid) {
    const ids = students.filter((s) => (s.classIds || []).includes(cid)).map((s) => s.id);
    const every = ids.length > 0 && ids.every((id) => sel.has(id));
    const n = new Set(sel);
    ids.forEach((id) => (every ? n.delete(id) : n.add(id)));
    setSel(n);
  }

  function run(fn, undo) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        if (undo) undo();   // 실패 — 먼저 바꾼 화면을 되돌린다
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  // 잡힌 보강 = 서버가 준 것 + 방금 잡은 것 (refresh 가 오면 서버 것과 겹치므로 뺀다)
  const mkShown = [
    ...scheduledMakeups,
    ...addedMk.filter(
      (a) => !scheduledMakeups.some((m) => m.studentId === a.studentId && m.date === a.date)
    ),
  ];

  if (!planReady) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          출결을 쓰려면 Supabase에서 <b>0017 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  const TABS = [
    ["absence", "결석 예정"],
    ["makeup", "보강"],

  ];

  return (
    <div className="stack" style={{ gap: 10, marginTop: 12 }}>
      <div className="row" style={{ gap: 4 }}>
        {TABS.map(([k, l]) => (
          <button
            key={k}
            className={`btn btn-sm ${tab === k ? "btn-on" : "btn-ghost"}`}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* **보강은 학생을 고를 일이 없다.** 이미 결석이 있는 아이들 목록이라,
          왼쪽 고르기 칸을 띄우면 안 쓰는 칸이 화면 절반을 차지한다 */}
      {tab === "makeup" && (
        <div className="stack" style={{ gap: 10 }}>
          {/**
            * **그냥 보강** (원장님, 2026-08-14 — 「지금 그냥 보강은 잡을 수가
            * 없네」). 보강이 전부 결석에 묶여 있어서, 결석 없는 추가 수업을
            * 잡을 문이 없었다. 서버(setMakeup)는 원래 결석 없이도 받았다 —
            * 문만 단다. 결석에 묶인 보강은 아래 「보강 필요」 그대로.
            */}
          <div className="card card-tight">
            <b style={{ fontSize: 14.5 }}>그냥 보강 잡기</b>
            <span className="hint" style={{ marginLeft: 6 }}>
              결석과 상관없는 추가 수업 — 달력·오늘 수업에 보강으로 뜹니다
            </span>
            <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="input input-sm"
                style={{ width: 128 }}
                value={freeId}
                onChange={(e) => setFreeId(e.target.value)}
              >
                <option value="">학생 고르기…</option>
                {students.map((st) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
              <input
                className="input input-sm"
                type="date"
                value={freeDate}
                onChange={(e) => setFreeDate(e.target.value)}
              />
              <input
                className="input input-sm"
                type="time"
                value={freeTime}
                onChange={(e) => setFreeTime(e.target.value)}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || !freeId || !freeDate}
                onClick={() => {
                  // 누르는 순간 「잡힌 보강」 에 줄이 생기고 칸이 비워진다 —
                  // 저장은 뒤에서, 실패하면 줄을 거두고 alert (2026-08-21)
                  const added = { studentId: freeId, date: freeDate, time: freeTime || "", of: null, written: false };
                  setAddedMk((prev) => [...prev, added]);
                  setFreeId(""); setFreeDate(""); setFreeTime("");
                  startTransition(async () => {
                    const res = await setMakeup(added.studentId, added.date, null, added.time);
                    if (res?.error) {
                      setAddedMk((prev) =>
                        prev.filter((a) => !(a.studentId === added.studentId && a.date === added.date))
                      );
                      alert(res.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
              >
                보강 잡기
              </button>
            </div>
          </div>
          {/**
            * **잡힌 보강 — 여기서 완료까지** (원장님, 2026-08-14 — 「보강
            * 페이지에서는 출결을 못 찍네. 보강 완료 찍으면 될 것 같은데」).
            * 완료 = 그날 리포트 저장 (오늘 수업의 저장과 같은 한 벌 —
            * saveStudentDay). 숙제·점수까지 적을 거면 「자세히」 로.
            */}
          {mkShown.length > 0 && (
            <div className="card card-tight">
              <b style={{ fontSize: 14.5 }}>잡힌 보강</b>
              <span className="hint" style={{ marginLeft: 6 }}>지난 7일부터 — 끝났으면 완료를 찍으세요</span>
              {/**
                * **한 자리에서 다 한다** (원장님 2026-08-24 — 「잡힌 보강
                * 잡아둔 보강 따로 있고, 잡아둔 보강에서만 일정 바꿀 수 있는
                * 거 뭐야. 완전 비효율적임」).
                * 줄은 대시보드와 **같은 한 벌**(MakeupRows)을 쓴다 — 일정
                * 바꾸기·보강 취소가 그대로 따라온다. 이 화면에만 있는
                * 「완료 찍기·자세히」 는 자리를 내어 받아 붙인다.
                */}
              <div style={{ marginTop: 8 }}>
                <MakeupRows
                  rows={mkShown.map((m2) => ({
                    student_id: m2.studentId,
                    date: m2.date,
                    makeup_time: m2.time || null,
                    makeup_of: m2.of || null,
                  }))}
                  nameOf={nameOf}
                  hasAnswer={false}
                  renderExtra={(r) => {
                    const key = `${r.student_id}|${r.date}`;
                    const m2 = mkShown.find((x) => x.studentId === r.student_id && x.date === r.date);
                    return (
                      <>
                        {m2?.written || doneMk.has(key) ? (
                          <span className="tag tag-mint">완료</span>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={pending}
                            title="그날 리포트가 만들어집니다 — 숙제·점수는 자세히에서"
                            onClick={() => {
                              setDoneMk((prev) => new Set(prev).add(key));
                              startTransition(async () => {
                                const res = await saveStudentDay(r.student_id, r.date, {
                                  attendance: "makeup",
                                  notice: "",
                                  items: {},
                                  toCheck: [],
                                  nextHomework: [],
                                });
                                if (res?.error) {
                                  setDoneMk((prev) => { const n = new Set(prev); n.delete(key); return n; });
                                  alert(res.error);
                                  return;
                                }
                                router.refresh();
                              });
                            }}
                          >
                            ✓ 완료 찍기
                          </button>
                        )}
                        <a className="btn btn-ghost btn-sm" href={`/today?d=${r.date}&open=${r.student_id}`}>
                          자세히
                        </a>
                      </>
                    );
                  }}
                />
              </div>
            </div>
          )}
          {makeupInbox}
          {makeupAnswers}
        </div>
      )}

      {tab !== "makeup" && (
        <div className="grid-side">
          {/* 누구에게 */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 0" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                누구{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 14.5 }}>{sel.size}명</span>
              </h2>
              <div className="row" style={{ gap: 6, margin: "8px 0", alignItems: "center" }}>
                <input
                  className="input input-sm"
                  style={{ width: 150 }}
                  placeholder="학생 검색"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSel(new Set(shown.map((s) => s.id)))}
                >
                  보이는 학생 전체
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>해제</button>
              </div>
            </div>

            {classes.map((c) => {
              const list = shown.filter((s) => (s.classIds || []).includes(c.id));
              if (list.length === 0) return null;
              return (
                <div key={c.id}>
                  <button className="grouphead" onClick={() => selectClass(c.id)}>
                    <span style={{ fontWeight: 800 }}>
                      {c.name}{" "}
                      <span className="muted" style={{ fontWeight: 600 }}>
                        {(c.days || []).join("·")} · {list.length}명
                      </span>
                    </span>
                    <span className="hint">반 전체 선택</span>
                  </button>
                  <div className="row" style={{ gap: 4, padding: "8px 16px" }}>
                    {list.map((s) => (
                      <button
                        key={s.id}
                        className={`hwchip ${sel.has(s.id) ? "hw-next" : ""}`}
                        onClick={() => toggleStudent(s.id)}
                      >
                        {sel.has(s.id) && <b>＋</b>} {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {shown.filter((s) => (s.classIds || []).length === 0).length > 0 && (
              <div>
                <div className="grouphead" style={{ cursor: "default" }}>
                  <span style={{ fontWeight: 800 }}>반 미배정</span>
                </div>
                <div className="row" style={{ gap: 4, padding: "8px 16px" }}>
                  {shown
                    .filter((s) => (s.classIds || []).length === 0)
                    .map((s) => (
                      <button
                        key={s.id}
                        className={`hwchip ${sel.has(s.id) ? "hw-next" : ""}`}
                        onClick={() => toggleStudent(s.id)}
                      >
                        {sel.has(s.id) && <b>＋</b>} {s.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            {tab === "absence" && (
              <>
                <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>결석 예정 넣기</h2>
                <div
                  className="row"
                  style={{ gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}
                >
                  <span className="hint" style={{ minWidth: 34 }}>기간</span>
                  <input
                    className="input input-sm"
                    type="date"
                    style={{ width: 150 }}
                    value={absFrom}
                    onChange={(e) => {
                      setAbsFrom(e.target.value);
                      if (!absTo) setAbsTo(e.target.value);
                    }}
                  />
                  <span className="hint">~</span>
                  <input
                    className="input input-sm"
                    type="date"
                    style={{ width: 150 }}
                    value={absTo}
                    onChange={(e) => setAbsTo(e.target.value)}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={() => setAbsTo(absFrom)}>
                    하루만
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setAbsFrom(addDays(todaySeoul(), 1));
                      setAbsTo(addDays(todaySeoul(), 7));
                    }}
                  >
                    다음 한 주
                  </button>
                </div>
                <p className="hint" style={{ margin: "0 0 10px" }}>
                  기간 안에서 그 학생이 <b>실제로 수업 있는 날만</b> 들어갑니다.
                </p>
                <div className="row" style={{ gap: 4, marginBottom: 10 }}>
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      className={`btn btn-sm ${reason === r ? "btn-on" : "btn-ghost"}`}
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                  <input
                    className="input input-sm"
                    style={{ width: 150 }}
                    placeholder="직접 입력"
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={pending || sel.size === 0 || !absFrom}
                    onClick={() =>
                      // 성공 alert 은 없앴다 (2026-08-21) — 아래 「앞으로 잡혀 있는 결석」 에 바로 보인다
                      run(() => setPlannedAbsenceRange([...sel], absFrom, absTo || absFrom, reason))
                    }
                  >
                    결석 예정으로 남기기
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending || sel.size === 0 || !absFrom}
                    title="고른 학생의 이 기간 결석 예정을 한 번에 지웁니다"
                    onClick={() =>
                      run(() => clearPlannedAbsenceRange([...sel], absFrom, absTo || absFrom))
                    }
                  >
                    이 기간 한꺼번에 취소
                  </button>
                </div>

                {/* **들어가 있는 것** — 무르는 자리를 넣는 자리 바로 밑에 둔다 */}
                <h2 style={{ margin: "16px 0 0", fontSize: 16, fontWeight: 800 }}>
                  앞으로 잡혀 있는 결석{" "}
                  {absences.length > 0 && <span className="tag tag-amber">{absences.length}건</span>}
                </h2>
                <AbsenceRows rows={absences} nameOf={nameOf} makeupOn={makeupOn} />
              </>
            )}

            {/* 「지난 수업 고치기」 는 오늘 수업의 날짜 넘기기로 이사했다
                (원장님, 2026-08-14 — 「동선·레이아웃 효율성이 많이 떨어져」).
                같은 일이 두 동선에 있으면 하나로 (A20). */}
            {sel.size === 0 && (
              <div className="notice" style={{ marginTop: 10 }}>
                왼쪽에서 <b>반 이름</b>을 누르면 반 전체가, 학생 이름을 누르면 그 학생만 선택됩니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
