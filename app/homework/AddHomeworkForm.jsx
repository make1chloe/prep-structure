"use client";

import { useState } from "react";
import { addHomeworkItem } from "./actions";

const CATEGORIES = ["단어", "독해", "문법", "노트", "내신", "기타"];

export default function AddHomeworkForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 항목 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>학습 항목 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <form action={addHomeworkItem} className="stack" style={{ gap: 8, marginTop: 10 }}>
        <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label className="label">항목명 *</label>
            <input className="input input-sm" name="name" required placeholder="예: 문장암기(온라인)" />
          </div>
          <div className="field" style={{ width: 130 }}>
            <label className="label">분류</label>
            <select className="input input-sm" name="category" defaultValue="기타">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="label">학습 방법 (학생 페이지에서 숙제를 누르면 보여요)</label>
          <textarea
            className="input input-sm"
            name="method"
            rows={3}
            placeholder={"예)\n1. 단어를 소리 내어 읽으며 3번 쓰기\n2. 뜻을 가리고 셀프테스트\n3. 틀린 단어만 단어노트에 정리"}
          />
        </div>
        <div className="field">
          <label className="label">내 할일 자동 생성 (이 숙제를 배정하면 할일이 생깁니다)</label>
          <input
            className="input input-sm"
            name="prep_task"
            placeholder="예: {학생} 단원평가 출제 — 비워두면 안 만듭니다"
          />
        </div>
        <button className="btn btn-primary btn-sm" type="submit" style={{ alignSelf: "flex-start" }}>추가</button>
      </form>
    </div>
  );
}
