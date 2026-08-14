"use client";

import { useRouter } from "next/navigation";
import { addDays, todaySeoul } from "@/lib/day";

/**
 * 오늘 수업의 **날짜 넘기기** (원장님, 2026-08-14 — 「숙제도 그렇고
 * 오늘 수업을 날짜별로 과거도 조회하면 어떨까?」).
 *
 * 화면은 원래부터 날짜로 열렸다 (?d=) — 출결의 「지난 수업 고치기」 가
 * 그 길로 들어온다. 다만 **화면 안에서 넘길 손잡이가 없어서**, 지난
 * 공지나 숙제를 고치려면 화면을 돌아 나가야 했다. 손잡이만 단다.
 *
 * 지난 날짜를 보고 있으면 위에 띠가 뜬다 — 지난 날을 오늘인 줄 알고
 * 출결을 찍으면 그날 기록이 조용히 덮인다.
 */
export default function DateNav({ date }) {
  const router = useRouter();
  const today = todaySeoul();
  const go = (d) => router.push(d === today ? "/today" : `/today?d=${d}`);

  return (
    <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
      <button className="btn btn-ghost btn-sm" onClick={() => go(addDays(date, -1))}>
        ‹ 하루 전
      </button>
      <input
        className="input input-sm"
        type="date"
        style={{ width: 150 }}
        value={date}
        max={today}
        onChange={(e) => e.target.value && go(e.target.value)}
      />
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => go(addDays(date, 1))}
        disabled={date >= today}
      >
        하루 뒤 ›
      </button>
      {date !== today && (
        <>
          <button className="btn btn-primary btn-sm" onClick={() => go(today)}>
            오늘로
          </button>
          <span className="tag tag-amber">지난 날짜를 보는 중 — 여기서 고치면 그날 기록이 바뀝니다</span>
        </>
      )}
    </div>
  );
}
