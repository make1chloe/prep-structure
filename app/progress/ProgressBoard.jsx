"use client";

import { useState } from "react";
import StudentBooksProgress from "./StudentBooksProgress";
import { sortRows } from "@/lib/listSort";

/**
 * 진도 명단 — 학생을 열면 그 아이 교재들의 **진도 판(BookProgress)** 이
 * 펴진다. 판은 오늘 수업·재원생과 같은 한 벌이다.
 *
 * **기본은 「오늘 수업」 학생만.** 이 화면은 수업 중에 죽 훑으며 적는
 * 자리라(유형 A), 오늘 안 오는 아이까지 늘어놓으면 훑는 길이만 는다.
 * 전체는 단추 하나로 편다.
 *
 * **PC(≥1101px)는 좌 학생 목록 / 우 열린 학생의 교재 판** (B2, 원장 승인
 * 2026-08-27). 줄 사이에 판이 끼면 아래 학생들이 화면 밖으로 밀려나서,
 * 다음 아이를 보려면 닫고 다시 찾아 내려가야 했다 — 재원생·발송과 같은
 * 전환이다. 판이 본문(넓은 쪽)인 것은 판 안 .bookgrid 2열이 서야 해서다.
 *
 * 폭은 **열 때 한 번만 본다** (components/useSheet 와 같은 원칙). 미디어쿼리로
 * 자리를 가르면 같은 판을 인라인·오른쪽 두 벌로 그려야 하고(단원 왕복도
 * 두 번, 한쪽에 적은 것이 다른 쪽에 안 보인다), 창 폭이 문턱을 넘나드는
 * 순간 적던 판이 자리를 잃는다. 폰(<1101px)은 지금처럼 줄 아래 인라인.
 */
export default function ProgressBoard({ rows = [], classes = [], allBooks = [] }) {
  const [q, setQ] = useState("");
  const [klass, setKlass] = useState("");
  const [todayOnly, setTodayOnly] = useState(() => rows.some((r) => r.todayClass));
  const [openId, setOpenId] = useState(null);
  const [wide, setWide] = useState(false);   // 연 순간의 화면 폭 — 판을 어디에 그릴지
  const [sortKey, setSortKey] = useState("name");

  const kw = q.trim().toLowerCase();
  const shown = sortRows(rows, { key: sortKey, dir: "asc" }).filter((r) => {
    if (todayOnly && !r.todayClass) return false;
    if (klass && !r.classIds.includes(klass)) return false;
    if (kw && ![r.name, r.school, r.grade].some((v) => (v || "").toLowerCase().includes(kw)))
      return false;
    return true;
  });

  // 열린 학생이 필터에 걸러지면 판도 같이 사라진다 (인라인 시절과 같은 결)
  const openRow = shown.find((r) => r.id === openId) || null;
  const split = !!openRow && wide;

  function toggle(r, open) {
    if (open) { setOpenId(null); return; }
    setOpenId(r.id);
    setWide(typeof window !== "undefined" && window.matchMedia("(min-width: 1101px)").matches);
  }

  const list = (
    <div className="card" style={{ padding: 0 }}>
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
              <button
                className="stuLine"
                /* 좌우 분할 중에는 판이 줄 밖(오른쪽)에 있어서, 이 줄이
                   열려 있다는 표시가 배경색뿐이다 */
                style={open && split ? { background: "var(--surface-2)" } : undefined}
                onClick={() => toggle(r, open)}
              >
                <span className="stuWho">
                  <span className="stuName">{r.name}</span>
                  <span className="stuSub">{[r.grade, r.school].filter(Boolean).join(" · ")}</span>
                </span>
                {/* 교재마다 ◐(오늘 위치)를 같이 — 순차로 안 나가는 교재는
                    이게 없으면 열어봐야만 오늘 어디인지 안다 (원장님, 2026-08-14) */}
                <span className="stuTags">
                  <span className="hint stuflow">
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
                </span>
                <span className="stuEnd">
                  <span className="stuOpen">{open ? "▾" : "▸"}</span>
                </span>
              </button>
              {open && !split && (
                <div className="stuPanel">
                  <StudentBooksProgress studentId={r.id} books={r.books} allBooks={allBooks} />
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
    </div>
  );

  return (
    <div className={split ? "splitview splitview-board" : undefined} style={{ marginTop: 12 }}>
      {list}
      {split && (
        <aside className="card split-panel">
          <div className="row split-head" style={{ gap: 6, alignItems: "center" }}>
            <b style={{ fontSize: 15 }}>{openRow.name}</b>
            <span className="hint">{[openRow.grade, openRow.school].filter(Boolean).join(" · ")}</span>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>닫기</button>
          </div>
          <div className="split-body">
            {/* key — 학생을 바꾸면 판을 새로 세운다. 같은 판을 이어 쓰면
                🧹 정리에서 골라둔 교재(sel)가 다음 학생까지 따라간다 */}
            <StudentBooksProgress
              key={openRow.id}
              studentId={openRow.id}
              books={openRow.books}
              allBooks={allBooks}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
