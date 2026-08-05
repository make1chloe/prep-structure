"use client";

import { useState } from "react";
import { addTask } from "./actions";
import { todaySeoul } from "@/lib/day";

const CATEGORIES = ["학사일정", "수업", "행정", "상담", "교재", "기타"];

export default function AddTaskForm({ classes = [], schools = [], grades = [], students = [] }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("all");
  const [hasDeliver, setHasDeliver] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [find, setFind] = useState("");

  const today = todaySeoul();
  const shown = students.filter(
    (s) => !find.trim() || `${s.name} ${s.school || ""} ${s.grade || ""}`.includes(find.trim())
  );

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 일정 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>일정 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>

      <form action={addTask} className="stack" style={{ gap: 8, marginTop: 10 }}>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label className="label">이름 *</label>
            <input className="input input-sm" name="title" required placeholder="예: 중간고사 대비 특강 안내" />
          </div>
          <input type="hidden" name="kind" value="schedule" />
          <div className="field" style={{ width: 120 }}>
            <label className="label">분류</label>
            <select className="input input-sm" name="category" defaultValue="기타">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="label">날짜 *</label>
            <input className="input input-sm" type="date" name="due_on" defaultValue={today} required />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label className="label">시간</label>
            <input className="input input-sm" type="time" name="start_time" />
          </div>
        </div>

        <div className="field">
          <label className="label">메모</label>
          <input className="input input-sm" name="note" placeholder="선생님만 보는 메모" />
        </div>

        <label className="hint" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={hasDeliver} onChange={(e) => setHasDeliver(e.target.checked)} />
          이 일정에서 학생에게 전달할 내용이 있어요
        </label>

        {hasDeliver && (
          <div className="card card-tight" style={{ background: "var(--surface-2)" }}>
            <div className="field">
              <label className="label">학생에게 전달할 내용</label>
              <input
                className="input input-sm"
                name="deliver_body"
                placeholder="예) 다음 주 월요일은 학교 행사로 6시에 시작합니다"
              />
            </div>
            <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center" }}>
              <select
                className="input input-sm"
                style={{ width: 130 }}
                name="deliver_scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="all">전체</option>
                <option value="class">반별</option>
                <option value="grade">학교·학년별</option>
                <option value="student">학생 고르기</option>
              </select>
              {scope === "class" && (
                <select className="input input-sm" style={{ width: 170 }} name="deliver_class_id" defaultValue="">
                  <option value="">반 선택</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {/* 학교·학년은 **고르는 것**이다 (0077).
                  글자로 치면 「신송중」과 「신송중학교」가 갈려서 아무에게도 안 갔다.
                  그것도 조용히 — 화면에는 저장됐다고 떴다. */}
              {scope === "grade" && (
                <>
                  <select className="input input-sm" style={{ width: 160 }} name="deliver_school_id" defaultValue="">
                    <option value="">학교 (비우면 전체)</option>
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select className="input input-sm" style={{ width: 110 }} name="deliver_grade" defaultValue="">
                    <option value="">학년 전체</option>
                    {grades.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </>
              )}
            </div>

            {scope === "student" && (
              <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                <input type="hidden" name="deliver_student_ids" value={[...picked].join(",")} />
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <input
                    className="input input-sm"
                    style={{ width: 150 }}
                    placeholder="이름 · 학교로 찾기"
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                  />
                  <span className="hint">{picked.size}명 골랐어요</span>
                  {picked.size > 0 && (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPicked(new Set())}>
                      비우기
                    </button>
                  )}
                </div>
                <div className="chips" style={{ maxHeight: 150, overflowY: "auto" }}>
                  {shown.map((s) => {
                    const on = picked.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`chip ${on ? "on" : ""}`}
                        onClick={() => {
                          const n = new Set(picked);
                          on ? n.delete(s.id) : n.add(s.id);
                          setPicked(n);
                        }}
                      >
                        {s.name}
                        {s.grade ? ` ${s.grade}` : ""}
                      </button>
                    );
                  })}
                  {shown.length === 0 && <span className="hint">찾는 학생이 없어요.</span>}
                </div>
              </div>
            )}
            <p className="hint" style={{ margin: "8px 0 0" }}>
              그 날짜의 <b>오늘 수업</b> 화면에 전달사항으로 깔리고, 하원 전 전달 체크로 확인합니다.
            </p>
          </div>
        )}

        <button className="btn btn-primary btn-sm" type="submit" style={{ alignSelf: "flex-start" }}>
          저장
        </button>
      </form>
    </div>
  );
}
