"use client";

import { useState } from "react";
import { addTextbook } from "./actions";
import { AREA_ORDER as AREAS } from "@/lib/bookSort";

export default function AddTextbookForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 교재 직접 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>교재 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <form action={addTextbook} className="stack" style={{ gap: 8, marginTop: 10 }}>
        <div className="editgrid">
          <div className="field">
            <label className="label">교재명 *</label>
            <input className="input input-sm" name="name" required placeholder="리딩튜터 입문" />
          </div>
          <div className="field">
            <label className="label">영역</label>
            <select className="input input-sm" name="area" defaultValue="">
              <option value="">선택</option>
              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">레벨</label>
            <input className="input input-sm" name="target_grade" placeholder="중2" />
          </div>
          <div className="field">
            <label className="label">전체 페이지</label>
            <input className="input input-sm" name="total_pages" inputMode="numeric" placeholder="120" />
          </div>
          <div className="field">
            <label className="label">교재비(원)</label>
            <input className="input input-sm" name="price" inputMode="numeric" placeholder="15000" />
          </div>
          <div className="field">
            <label className="label">단어범위</label>
            <input className="input input-sm" name="word_range" inputMode="numeric" placeholder="800" />
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label">구매링크</label>
            <input className="input input-sm" name="purchase_url" placeholder="https://..." />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label">비고</label>
            <input className="input input-sm" name="feature" placeholder="교재 특징" />
          </div>
        </div>
        <button className="btn btn-primary btn-sm" type="submit" style={{ alignSelf: "flex-start" }}>
          저장
        </button>
      </form>
    </div>
  );
}
