"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * **교재 고르기 — 검색하고, 영역으로 좁혀서 고른다.**
 *
 * 원장님 (2026-08-13): 「교재를 고르는 부분이 목록선택이 너무 비효율적인거
 * 같아. 검색도 필요하고, 분류가 되면서 그중에 선택하게 해줘야 의미가 있을듯」
 *
 * 맨 `<select>` 였다. 교재가 쉰 권이면 쉰 줄을 굴려 내려가며 눈으로 찾아야
 * 하고, 이름을 알아도 칠 데가 없다. 영역(문법·독해·단어…)이 붙어 있는데도
 * 그걸로 좁힐 수가 없었다.
 *
 * **세 군데가 저마다 다른 모양이었다** — 내신 대비는 맨 목록, 오늘 수업은
 * optgroup, 단원 옮기기는 또 맨 목록. 같은 일을 하는 자리가 화면마다 다르면
 * 손이 매번 다시 배워야 한다. 그래서 한 벌로 만들어 셋이 같이 쓴다.
 *
 * @param books  [{ id, name, area }]
 * @param value  고른 교재 id
 * @param mine   **먼저 보여줄 것** — 이 학생 교재처럼 「거의 이 중 하나」인 목록.
 *               맨 위에 따로 세운다. 나머지는 그 아래 영역별로.
 */
export default function BookPicker({
  books = [],
  value = "",
  onChange,
  mine = [],
  placeholder = "교재 고르기",
  width = 190,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const box = useRef(null);

  // 밖을 누르면 닫힌다 — 고르지 않고 빠져나갈 길이 있어야 한다
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const picked = books.find((b) => b.id === value) || null;
  const mineIds = useMemo(() => new Set(mine.map((b) => b.id)), [mine]);

  // 실제로 있는 영역만 단추로 만든다 — 없는 영역을 눌러보게 하면 안 된다
  const areas = useMemo(
    () => [...new Set(books.map((b) => b.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
    [books]
  );

  const kw = q.trim().toLowerCase();
  const match = (b) =>
    (!area || b.area === area) &&
    (!kw || [b.name, b.area].filter(Boolean).some((v) => v.toLowerCase().includes(kw)));

  const mineShown = mine.filter(match);
  // 「이 학생 교재」에 이미 있는 것은 아래에서 또 보여주지 않는다 (두 번 세면 헷갈린다)
  const rest = books.filter((b) => match(b) && !mineIds.has(b.id));
  const groups = areas
    .map((a) => ({ area: a, rows: rest.filter((b) => b.area === a) }))
    .concat([{ area: "영역 없음", rows: rest.filter((b) => !b.area) }])
    .filter((g) => g.rows.length > 0);

  function pick(id) {
    onChange?.(id);
    setOpen(false);
    setQ("");
  }

  return (
    <div className="bookpick" ref={box} style={{ width }}>
      <button
        type="button"
        className="input input-sm bookpick-btn"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={picked ? picked.name : placeholder}
      >
        <span className="bookpick-cur">
          {picked ? (
            <>
              {picked.area && <span className="tag tag-muted">{picked.area}</span>} {picked.name}
            </>
          ) : (
            <span className="muted">{placeholder}</span>
          )}
        </span>
        <span className="hint">▾</span>
      </button>

      {open && (
        <div className="bookpick-pop">
          <input
            className="input input-sm"
            autoFocus
            placeholder="교재 이름 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {areas.length > 1 && (
            <div className="chips" style={{ marginTop: 6 }}>
              <button className={`chip ${area === "" ? "on" : ""}`} onClick={() => setArea("")}>
                전체
              </button>
              {areas.map((a) => (
                <button
                  key={a}
                  className={`chip ${area === a ? "on" : ""}`}
                  onClick={() => setArea(area === a ? "" : a)}
                >
                  {a}
                </button>
              ))}
            </div>
          )}

          <div className="bookpick-list">
            {value && (
              <button className="bookpick-row" onClick={() => pick("")}>
                <span className="muted">고르지 않음</span>
              </button>
            )}
            {mineShown.length > 0 && (
              <>
                <div className="bookpick-cat">이 학생 교재</div>
                {mineShown.map((b) => (
                  <button
                    key={b.id}
                    className={`bookpick-row ${b.id === value ? "on" : ""}`}
                    onClick={() => pick(b.id)}
                  >
                    {b.area && <span className="tag tag-muted">{b.area}</span>} {b.name}
                  </button>
                ))}
              </>
            )}
            {groups.map((g) => (
              <div key={g.area}>
                <div className="bookpick-cat">{g.area}</div>
                {g.rows.map((b) => (
                  <button
                    key={b.id}
                    className={`bookpick-row ${b.id === value ? "on" : ""}`}
                    onClick={() => pick(b.id)}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            ))}
            {mineShown.length === 0 && groups.length === 0 && (
              <p className="hint" style={{ margin: "8px 4px" }}>맞는 교재가 없어요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
