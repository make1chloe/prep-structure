"use client";

import { useState } from "react";
import { addInquiry } from "./actions";
import { SchoolField, GradeField, PickField } from "@/components/PickField";
// 유입경로 목록은 **설문지와 한 벌**이다 (lib/applySlots). 두 벌이면
// 설문지가 남긴 값이 이 화면에서 목록에 없는 값이 되고, 그러면 지워진다.
import { SOURCES } from "@/lib/applySlots";

export default function AddInquiryForm({ schools = [] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 상담 접수
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>상담 접수</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <p className="muted" style={{ margin: "8px 0 10px", fontSize: 13 }}>
        전화 받으면서 <b>이름과 번호만</b> 먼저 넣어도 됩니다. 나머지는 나중에 채우세요.
      </p>
      <form action={addInquiry} className="stack" style={{ gap: 8 }}>
        <div className="editgrid">
          <div className="field">
            <label className="label">이름 *</label>
            <input className="input input-sm" name="name" required placeholder="학생 이름" />
          </div>
          <div className="field">
            <label className="label">학부모 번호</label>
            <input className="input input-sm" name="phone" placeholder="01012345678" />
          </div>
          <div className="field">
            <label className="label">학생 번호</label>
            <input className="input input-sm" name="student_phone" />
          </div>
          <div className="field">
            <label className="label">학교</label>
            <SchoolField schools={schools} />
          </div>
          <div className="field">
            <label className="label">학년</label>
            <GradeField />
          </div>
          <div className="field">
            <label className="label">유입경로</label>
            <PickField name="source" options={SOURCES.map((x) => x.key)} />
          </div>
          <div className="field">
            <label className="label">희망 시간</label>
            <input className="input input-sm" name="want_time" placeholder="월수 7시 이후" />
          </div>
          <div className="field">
            <label className="label">상담 날짜</label>
            <input className="input input-sm" type="date" name="consult_on" />
          </div>
          <div className="field">
            <label className="label">상담 시간</label>
            <input className="input input-sm" type="time" name="consult_at" />
          </div>
        </div>
        <div className="field">
          <label className="label">상담 내용</label>
          <textarea className="input input-sm" name="memo" rows={2} placeholder="문의 내용, 특이사항" />
        </div>
        <button className="btn btn-primary btn-sm" type="submit" style={{ alignSelf: "flex-start" }}>
          접수
        </button>
      </form>
    </div>
  );
}
