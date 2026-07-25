"use client";

import { useState } from "react";
import { addClass } from "./actions";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export default function AddClassForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 반 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>반 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <form action={addClass} className="stack" style={{ gap: 8, marginTop: 10 }}>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label className="label">반 이름 *</label>
            <input className="input input-sm" name="name" required placeholder="월수 7:30" />
          </div>
          <div className="field">
            <label className="label">요일</label>
            <div className="row" style={{ gap: 3 }}>
              {DAYS.map((d) => (
                <label key={d} className="daychip">
                  <input type="checkbox" name={`day_${d}`} />
                  <span>{d}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="editgrid">
          <div className="field">
            <label className="label">시작</label>
            <input className="input input-sm" name="start_time" type="time" />
          </div>
          <div className="field">
            <label className="label">종료</label>
            <input className="input input-sm" name="end_time" type="time" />
          </div>
          <div className="field">
            <label className="label">분류</label>
            <select className="input input-sm" name="category" defaultValue="정규반">
              <option value="정규반">정규반</option>
              <option value="특강">특강</option>
            </select>
          </div>
          <div className="field">
            <label className="label">레벨</label>
            <select className="input input-sm" name="level" defaultValue="">
              <option value="">선택</option>
              <option value="기본반">기본반</option>
              <option value="심화반">심화반</option>
            </select>
          </div>
          <div className="field">
            <label className="label">초중고</label>
            <select className="input input-sm" name="school_level" defaultValue="">
              <option value="">선택</option>
              <option value="초">초</option>
              <option value="중">중</option>
              <option value="고">고</option>
            </select>
          </div>
          <div className="field">
            <label className="label">강의실</label>
            <input className="input input-sm" name="room" placeholder="1강의실" />
          </div>
          <div className="field">
            <label className="label">정원</label>
            <input className="input input-sm" name="capacity" inputMode="numeric" placeholder="5" />
          </div>
        </div>
        <button className="btn btn-primary btn-sm" type="submit" style={{ alignSelf: "flex-start" }}>
          저장
        </button>
      </form>
    </div>
  );
}
