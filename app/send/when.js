"use client";
/** ⏰ 예약 때 고르기 — 발송 10 · 월간 리포트 · 수강료가 같은 한 벌(확정-㉕: 오늘 21:00 · 내일 09:00 · 직접 — 시각은 규칙 send.evening·send.morning). 값은 부모가 든다((어) 2026-09-09) */
import { whenChoices } from "@/lib/send-plan";
export const customOf = (when, cDate, cTime) => (when === "custom" ? { date: cDate, time: cTime } : null);
export default function When({ rules = {}, date, when, setWhen, cDate, setCDate, cTime, setCTime }) {
  return (<>
    <div className="seg sm" data-g="when">{whenChoices(rules).map(([k, name]) => <button key={k} type="button" aria-pressed={when === k} onClick={() => setWhen(k)}>{name}</button>)}</div>
    {when === "custom" && <><input type="date" value={cDate} min={date} onChange={(e) => setCDate(e.target.value)} style={{ width: "auto" }} aria-label="예약 날짜" /><input type="time" value={cTime} onChange={(e) => setCTime(e.target.value)} style={{ width: "auto" }} aria-label="예약 시각" /></>}
  </>);
}
