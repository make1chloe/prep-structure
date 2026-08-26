"use client";

import { useState } from "react";
import { addClass } from "./actions";
import { WEEK_ORDER as DAYS } from "@/lib/day";

export default function AddClassForm() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("정규반");
  const [name, setName] = useState("");
  // 특강은 이제 반이 아니다 (0164 — 재원생 속성, 0173 — 옛 특강반 하강).
  // 여기서 특강을 만들려는 낌새가 보이면 제자리(재원생 → 특강 탭)를 알려준다.
  const looksExtra = /특강|캠프|단기/.test(name) || category !== "정규반";

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
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>반 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <form
        /* 서버 답을 보여준다 (전수 검사 2026-08-21) — 직결이면 실패가 조용히 사라졌다 */
        action={async (fd) => {
          const res = await addClass(fd);
          if (res?.error) { alert(res.error); return; }
          if (res?.id) window.location.href = `/classes?c=${res.id}`;
        }} className="stack" style={{ gap: 8, marginTop: 10 }}>
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

        {/* 특강을 반으로 만들면 같은 날 판이 둘로 갈라지고 출결이 이중이
            된다 — 그래서 모델을 바꿨다 (0164). 옛 특강반은 일괄 내렸다 (0173).
            여기서 또 반으로 만들면 그 병이 되살아나니, 적는 자리에서 짚어준다. */}
        {looksExtra && (
          <p className="hint" style={{ margin: 0, color: "var(--amber)" }}>
            <b>특강은 이제 반으로 만들지 않아요.</b> 재원생 화면에서 학생을 열고
            <b> 「특강 (추가 등원)」 탭</b>에 시간·기간·금액을 넣어주세요 —
            오늘 수업·수강료·공지에 알아서 섭니다. 반 추가는 정규반만.
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
            <p className="hint" style={{ fontSize: 13, margin: "0 0 6px" }}>
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
