"use client";
/** (머2) 오늘 수업의 날짜 고르개 — 원장님 2026-09-10: 「오늘 수업에 진짜 오늘 수업이 아니어도 캘린더에서 선택하면
 *  해당날짜 수업에 대한 부분 불러오게 해줘 과거내역 고치거나 미래내용 미리 임시저장하게」.
 *  주소 하나(`?d=YYYY-MM-DD`)로만 움직인다 — 이동은 go()(띠가 켜진다 · router.push 는 going.js 안에만, 검사-71). */
import { useGo } from "../_shell/going.js";
import { plusDays } from "@/lib/day-plan";
import { md } from "@/lib/dash-plan";
export default function DayPick({ date, today, weekday }) {
  const { go } = useGo(date);
  const at = (d) => go(d === today ? "/today" : `/today?d=${d}`, d);   // 오늘은 맨 주소로 — 즐겨찾기가 늘 오늘을 연다
  return (
    <div className="wv" style={{ marginBottom: 8 }} data-g="daypick">
      <button className="btn sm" type="button" data-act="day-prev" aria-label="어제" onClick={() => at(plusDays(date, -1))}>◂</button>
      <input className="dt" type="date" value={date} aria-label="날짜" onChange={(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) at(v); }} style={{ width: "auto" }} />
      <button className="btn sm" type="button" data-act="day-next" aria-label="내일" onClick={() => at(plusDays(date, 1))}>▸</button>
      <span className="pill" data-g="day">{md(date)}{weekday ? ` ${weekday}` : ""}</span>
      {date !== today && <button className="btn sm pri" type="button" data-act="day-today" onClick={() => at(today)}>오늘로</button>}
    </div>
  );
}
