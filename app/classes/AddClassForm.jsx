"use client";

import { useState } from "react";
import { addClass } from "./actions";
import { WEEK_ORDER as DAYS } from "@/lib/day";

export default function AddClassForm() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("정규반");
  const [name, setName] = useState("");
  // 이름에는 특강이라고 적어놓고 분류는 정규반으로 두면, 나중에 「왜 이 반만
  // 특강 표시가 안 되지」 가 된다. 적는 자리에서 짚어준다.
  const mismatched = /특강|캠프|단기/.test(name) && category === "정규반";

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
            <input
              className="input input-sm"
              name="name"
              required
              placeholder="월수 7:30"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
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
            <select
              className="input input-sm"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
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

        {/* 기간 — 종강일만 넣어두면 그날 지나서 알아서 내려간다.
            **분류로 감추지 않는다.** 전에는 「정규반」 이면 이 칸이 아예 안 나왔다.
            그런데 「화목1 특강」 처럼 이름에는 특강이라고 적고 분류는 정규반으로
            둔 반이 생기고, 그러면 기간을 넣을 데가 사라진다 — 왜 어떤 반은
            되고 어떤 반은 안 되는지 화면만 봐서는 알 수가 없다.
            비워두면 무기한이니, 늘 내놓고 설명만 붙인다. */}
        {mismatched && (
          <p className="hint" style={{ margin: 0, color: "var(--amber)" }}>
            이름은 <b>특강</b>인데 분류가 <b>정규반</b>이에요. 분류를 특강으로 두시면
            종강일이 지났을 때 알아서 내려갑니다.
          </p>
        )}
        {(
          <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field">
              <label className="label">개강일</label>
              <input className="input input-sm" name="starts_on" type="date" />
            </div>
            <div className="field">
              <label className="label">종강일</label>
              <input className="input input-sm" name="ends_on" type="date" />
            </div>
            <p className="hint" style={{ fontSize: 12, margin: "0 0 6px" }}>
              <b>비워두면 무기한</b>입니다 (정규반). 종강일을 넣으면 그날이 지나서
              반 목록·오늘 수업·수강료에서 자동으로 내려갑니다. 기록은 그대로 남습니다.
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
