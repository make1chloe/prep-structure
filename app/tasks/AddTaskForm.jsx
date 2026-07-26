"use client";

import { useState } from "react";
import { addTask } from "./actions";

const CATEGORIES = ["학사일정", "수업", "행정", "상담", "교재", "기타"];

export default function AddTaskForm({ classes = [] }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("all");
  const [hasDeliver, setHasDeliver] = useState(false);

  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
    .toISOString()
    .slice(0, 10);

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 할일 · 일정 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>할일 · 일정 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>

      <form action={addTask} className="stack" style={{ gap: 8, marginTop: 10 }}>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label className="label">이름 *</label>
            <input className="input input-sm" name="title" required placeholder="예: 중간고사 대비 특강 안내" />
          </div>
          <div className="field" style={{ width: 100 }}>
            <label className="label">종류</label>
            <select className="input input-sm" name="kind" defaultValue="todo">
              <option value="todo">할일</option>
              <option value="schedule">일정</option>
            </select>
          </div>
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
              </select>
              {scope === "class" && (
                <select className="input input-sm" style={{ width: 170 }} name="deliver_class_id" defaultValue="">
                  <option value="">반 선택</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {scope === "grade" && (
                <>
                  <input className="input input-sm" style={{ width: 140 }} name="deliver_school" placeholder="학교 (비우면 전체)" />
                  <input className="input input-sm" style={{ width: 100 }} name="deliver_grade" placeholder="학년" />
                </>
              )}
            </div>
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
