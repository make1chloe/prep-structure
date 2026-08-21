"use client";

import { useState } from "react";
import PickOrType from "@/components/PickOrType";
import { addHomeworkItem } from "./actions";
import { CATEGORIES, toolList } from "./categories";

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
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>학습 항목 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <form
        action={async (fd) => {
          const res = await addHomeworkItem(fd);
          if (res?.error) alert(res.error);
        }} className="stack" style={{ gap: 8, marginTop: 10 }}>
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
          {/* 아이가 **무엇을 펴야 하는지** — 아이 화면 숙제 옆에 붙는다 (0116).
              고를 수도, 직접 적을 수도 있다 (못 박아 두면 언제나 모자란다) */}
          <div className="field" style={{ width: 150 }}>
            <label className="label">준비물 (아이에게 보임)</label>
            {/* datalist 는 아이폰에서 안 보인다 (C6) — 골라 넣기 한 벌 */}
            <PickOrType
              name="tool"
              options={toolList()}
              placeholder="교재 · 클래스카드 …"
              title="아이 화면 숙제 옆에 붙습니다. 비우면 표시 안 함"
            />
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
            placeholder="예: {학생}-단원평가-{단원}  ·  쓸 수 있는 자리: {학생} {단원} {교재} {숙제}"
          />
        </div>
        <button className="btn btn-primary btn-sm" type="submit" style={{ alignSelf: "flex-start" }}>추가</button>
      </form>
    </div>
  );
}
