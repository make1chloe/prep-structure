"use client";

import { useState } from "react";
import BookProgress from "@/components/BookProgress";
import { sortRows } from "@/lib/listSort";

/**
 * 진도 명단 — 학생을 열면 그 아이 교재들의 **진도 판(BookProgress)** 이
 * 펴진다. 판은 오늘 수업·재원생과 같은 한 벌이다.
 *
 * **기본은 「오늘 수업」 학생만.** 이 화면은 수업 중에 죽 훑으며 적는
 * 자리라(유형 A), 오늘 안 오는 아이까지 늘어놓으면 훑는 길이만 는다.
 * 전체는 단추 하나로 편다.
 */
export default function ProgressBoard({ rows = [], classes = [] }) {
  const [q, setQ] = useState("");
  const [klass, setKlass] = useState("");
  const [todayOnly, setTodayOnly] = useState(() => rows.some((r) => r.todayClass));
  const [openId, setOpenId] = useState(null);
  const [sortKey, setSortKey] = useState("name");

  const kw = q.trim().toLowerCase();
  const shown = sortRows(rows, { key: sortKey, dir: "asc" }).filter((r) => {
    if (todayOnly && !r.todayClass) return false;
    if (klass && !r.classIds.includes(klass)) return false;
    if (kw && ![r.name, r.school, r.grade].some((v) => (v || "").toLowerCase().includes(kw)))
      return false;
    return true;
  });

  return (
    <>
      <div className="row" style={{ gap: 6, padding: "12px 16px 0", alignItems: "center" }}>
        <input
          className="input input-sm"
          style={{ width: 180 }}
          placeholder="이름 · 학교 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input input-sm"
          style={{ width: 130 }}
          value={klass}
          onChange={(e) => setKlass(e.target.value)}
        >
          <option value="">반 전체</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={todayOnly}
            onChange={(e) => setTodayOnly(e.target.checked)}
          />
          오늘 수업만
        </label>
        <select
          className="input input-sm"
          style={{ width: 96 }}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          title="목록 정렬"
        >
          <option value="name">이름순</option>
          <option value="school">학교순</option>
          <option value="grade">학년순</option>
        </select>
        <span className="spacer" />
        <span className="hint">{shown.length}명</span>
      </div>

      <div className="stack" style={{ gap: 0, marginTop: 10 }}>
        {shown.map((r) => {
          const open = openId === r.id;
          return (
            <div key={r.id} className="stuRow">
              {/* 이름 줄 — 교재 이름을 접힌 채로도 보여준다. 몇 권인지만 있으면
                  「무슨 책이더라」 하고 열어봐야 한다 */}
              <button className="stuLine" onClick={() => setOpenId(open ? null : r.id)}>
                <span className="muted" style={{ fontSize: 13 }}>{open ? "▾" : "▸"}</span>
                <b style={{ fontSize: 15 }}>{r.name}</b>
                <span className="hint">{[r.grade, r.school].filter(Boolean).join(" · ")}</span>
                <span className="spacer" />
                {/* 교재마다 ◐(오늘 위치)를 같이 — 순차로 안 나가는 교재는
                    이게 없으면 열어봐야만 오늘 어디인지 안다 (원장님, 2026-08-14) */}
                <span className="hint" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.books.length > 0
                    ? r.books
                        .map((b) =>
                          b.doing?.length
                            ? `${b.name} ◐${b.doing.join("·")}`
                            : b.curPage
                            ? `${b.name} ${b.curPage}p`
                            : b.name
                        )
                        .join("  ·  ")
                    : "배정된 교재 없음"}
                </span>
              </button>
              {open && (
                <div className="stuPanel">
                  {r.books.length === 0 ? (
                    <p className="hint" style={{ margin: 0 }}>
                      배정된 교재가 없어요. 재원생 → 교재 탭이나 학습 → 교재에서 배정하세요.
                    </p>
                  ) : (
                    <div className="bookgrid">
                      {r.books.map((b) => (
                        <BookProgress key={b.id} studentId={r.id} book={b} openFirst />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {shown.length === 0 && (
          <p className="muted" style={{ padding: 16, margin: 0, fontSize: 14.5 }}>
            조건에 맞는 학생이 없어요.
            {todayOnly && " 「오늘 수업만」 을 꺼보세요."}
          </p>
        )}
      </div>
    </>
  );
}
