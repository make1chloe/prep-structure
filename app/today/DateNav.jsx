"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, todaySeoul, dayLabel as fmtDay } from "@/lib/day";
import { recentClasses } from "@/app/plan/actions";

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
export default function DateNav({ date, students = [] }) {
  const router = useRouter();
  const today = todaySeoul();
  const go = (d) => router.push(d === today ? "/today" : `/today?d=${d}`);

  /**
   * **아이폰에서는 다 고른 뒤에 옮긴다** (원장님, 2026-08-15 — 「모바일에서
   * 오늘수업 날짜선택이 안돼」). 아이폰의 날짜 바퀴는 돌리는 동안에도
   * change 가 계속 오는데, 그때마다 화면을 옮기면 고르기 창이 닫혀서
   * 선택이 안 되는 것처럼 보인다. 아이폰은 창이 닫힐 때(blur) 옮기고,
   * 안드로이드(확인을 눌러야 change 가 한 번 온다)와 마우스(달력에서
   * 누르는 순간)는 지금처럼 바로 옮긴다.
   */
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [draft, setDraft] = useState(date);
  useEffect(() => setDraft(date), [date]);
  const commit = (v) => { if (v && v !== date) go(v); };

  /**
   * **학생으로 찾기** — 출결의 「지난 수업 고치기」 탭이 하던 일을 여기로
   * (원장님, 2026-08-14 — 「동선·레이아웃 효율성이 많이 떨어져」).
   * 「지수 지난주 것 고치자」 는 날짜가 아니라 **학생**으로 시작한다.
   * 학생을 고르면 최근 수업 날짜들이 나오고, 고르면 그 날짜의 이 화면이
   * 그 학생 판이 열린 채로 뜬다.
   */
  const [findId, setFindId] = useState("");
  const [lessons, setLessons] = useState(null);
  const [pending, startTransition] = useTransition();
  function pickStudent(id) {
    setFindId(id);
    setLessons(null);
    if (!id) return;
    startTransition(async () => {
      const res = await recentClasses([id]);
      setLessons(res?.rows || []);
    });
  }

  return (
    <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
      <button className="btn btn-ghost btn-sm" onClick={() => go(addDays(date, -1))}>
        ‹ 하루 전
      </button>
      <input
        className="input input-sm"
        type="date"
        style={{ width: 150 }}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (!isIOS) commit(e.target.value);
        }}
        onBlur={() => commit(draft)}
      />
      {/* 미래도 연다 (원장님, 2026-08-17 — 「하루 뒤 버튼이 안 먹어」).
          미리 내주기·클카 확인용. 출결을 미래에 찍는 사고는 띠가 막는다 */}
      <button className="btn btn-ghost btn-sm" onClick={() => go(addDays(date, 1))}>
        하루 뒤 ›
      </button>
      {date !== today && (
        <>
          <button className="btn btn-primary btn-sm" onClick={() => go(today)}>
            오늘로
          </button>
          <span className="tag tag-amber">
            {date < today
              ? "지난 날짜를 보는 중 — 여기서 고치면 그날 기록이 바뀝니다"
              : "미래 날짜 — 미리 보는 중입니다. 출결은 그날 찍어주세요"}
          </span>
        </>
      )}
      <span className="spacer" />
      {/* 학생으로 찾기 — 고르면 그 아이 최근 수업 날짜가 나온다 */}
      <select
        className="input input-sm"
        style={{ width: 128 }}
        value={findId}
        onChange={(e) => pickStudent(e.target.value)}
        title="학생을 고르면 그 아이의 최근 수업 날짜가 나옵니다"
      >
        <option value="">학생으로 찾기…</option>
        {students.map((st) => (
          <option key={st.id} value={st.id}>{st.name}</option>
        ))}
      </select>
      {findId && (
        <select
          className="input input-sm"
          style={{ width: 190 }}
          defaultValue=""
          disabled={pending || lessons === null}
          onChange={(e) => {
            const d = e.target.value;
            if (d) router.push(`/today?d=${d}&open=${findId}`);
          }}
        >
          <option value="">
            {pending || lessons === null
              ? "불러오는 중…"
              : lessons.length === 0
              ? "최근 두 달 기록 없음"
              : `수업 ${lessons.length}번 — 날짜 고르기`}
          </option>
          {(lessons || []).map((p) => (
            <option key={p.id || p.date} value={p.date}>
              {fmtDay(p.date)}{p.written === false ? " · 리포트 미작성" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
