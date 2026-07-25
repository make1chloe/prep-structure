"use client";

import { useState } from "react";
import { addStudent } from "./actions";

export default function AddStudentForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 학생 직접 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>학생 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <form action={addStudent} className="stack" style={{ gap: 8, marginTop: 10 }}>
        <div className="editgrid">
          <div className="field">
            <label className="label">이름 *</label>
            <input className="input input-sm" name="name" required placeholder="홍길동" />
          </div>
          <div className="field">
            <label className="label">학교</label>
            <input className="input input-sm" name="school" placeholder="신정중" />
          </div>
          <div className="field">
            <label className="label">학년</label>
            <input className="input input-sm" name="grade" placeholder="중2" />
          </div>
          <div className="field">
            <label className="label">생년월일</label>
            <input className="input input-sm" name="birth_year" type="date" />
          </div>
          <div className="field">
            <label className="label">성별</label>
            <select className="input input-sm" name="gender" defaultValue="">
              <option value="">선택</option>
              <option value="여">여</option>
              <option value="남">남</option>
            </select>
          </div>
          <div className="field">
            <label className="label">학생 전화</label>
            <input className="input input-sm" name="student_phone" placeholder="010-0000-0000" />
          </div>
          <div className="field">
            <label className="label">학부모 전화</label>
            <input className="input input-sm" name="parent_phone" placeholder="010-0000-0000" />
          </div>
          <div className="field">
            <label className="label">재원 상태</label>
            <select className="input input-sm" name="status" defaultValue="enrolled">
              <option value="prospect">예비</option>
              <option value="enrolled">재원</option>
              <option value="paused">휴원</option>
              <option value="withdrawn">퇴원</option>
            </select>
          </div>
          <div className="field">
            <label className="label">등원시작일</label>
            <input className="input input-sm" name="enrolled_on" type="date" />
          </div>
          <div className="field">
            <label className="label">선택과목</label>
            <input className="input input-sm" name="electives" placeholder="고2 1학기 화작/기하" />
          </div>
          <div className="field">
            <label className="label">특이사항</label>
            <input className="input input-sm" name="note" placeholder="메모" />
          </div>
        </div>
        <button className="btn btn-primary btn-sm" type="submit" style={{ alignSelf: "flex-start" }}>
          저장
        </button>
      </form>
    </div>
  );
}
