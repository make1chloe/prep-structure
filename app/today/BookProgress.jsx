"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listStudentUnits, setUnitProgress } from "@/app/progress/actions";

// 교재 한 권의 진도 — 단원을 순서와 상관없이 눌러서 완료/미완료를 기록한다
export default function BookProgress({ studentId, book }) {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState(null);
  const [err, setErr] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function load() {
    const res = await listStudentUnits(studentId, book.id);
    if (res.error) setErr(res.error);
    setUnits(res.units || []);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && units === null) load();
  }

  function mark(unitId, done) {
    // 화면을 먼저 바꾸고 저장한다 (수업 중 기다리지 않도록)
    setUnits((list) =>
      (list || []).map((u) => (u.id === unitId ? { ...u, status: done ? "done" : "" } : u))
    );
    startTransition(async () => {
      const res = await setUnitProgress(studentId, [unitId], done ? "done" : null);
      if (res?.error) {
        alert(res.error);
        load();
        return;
      }
      router.refresh();
    });
  }

  function markAll(done) {
    const leaves = (units || []).filter((u) => u.leaf);
    const ids = leaves.filter((u) => (u.status === "done") !== done).map((u) => u.id);
    if (ids.length === 0) return;
    setUnits((list) =>
      (list || []).map((u) => (u.leaf ? { ...u, status: done ? "done" : "" } : u))
    );
    startTransition(async () => {
      const res = await setUnitProgress(studentId, ids, done ? "done" : null);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  // 화면에 보이는 값 (막 누른 것도 바로 반영)
  const leaves = (units || []).filter((u) => u.leaf);
  const liveDone = units ? leaves.filter((u) => u.status === "done").length : book.doneUnits;
  const liveTotal = units ? leaves.length : book.totalUnits;
  const livePercent =
    liveTotal > 0 ? Math.round((liveDone / liveTotal) * 100) : book.percent;

  return (
    <div className="bookprog">
      <button
        onClick={toggle}
        style={{
          all: "unset", cursor: "pointer", display: "block", width: "100%",
        }}
      >
        <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "nowrap" }}>
          <span className="muted" style={{ fontSize: 11 }}>{open ? "▾" : "▸"}</span>
          <b style={{ fontSize: 12.5 }}>{book.name}</b>
          <span className="spacer" />
          <span className="hint">
            {liveTotal > 0 ? `${liveDone}/${liveTotal}단원` : "단원 없음"}
          </span>
          {livePercent !== null && liveTotal > 0 && (
            <span className={`tag ${livePercent >= 80 ? "tag-mint" : "tag-sky"}`}>
              {livePercent}%
            </span>
          )}
        </div>
        <div className="bar">
          <span style={{ width: `${livePercent ?? 0}%` }} />
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {err && <div className="err">{err}</div>}
          {units === null && <span className="hint">단원 불러오는 중…</span>}
          {units !== null && leaves.length === 0 && (
            <span className="hint">
              등록된 단원이 없어요. 교재 페이지에서 단원을 올리면 여기서 체크할 수 있어요.
            </span>
          )}
          {leaves.length > 0 && (
            <>
              <div className="row" style={{ gap: 4, marginBottom: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => markAll(true)} disabled={pending}>
                  전체 완료
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => markAll(false)} disabled={pending}>
                  전체 해제
                </button>
                <span className="hint" style={{ alignSelf: "center" }}>
                  순서와 상관없이 끝낸 단원만 누르세요
                </span>
              </div>
              <div className="stack" style={{ gap: 4 }}>
                {groupByParent(units).map(([head, list]) => (
                  <div className="hwgroup" key={head || "_"}>
                    {head && <span className="tag tag-muted hwcat" style={{ width: "auto" }}>{head}</span>}
                    <div className="row" style={{ gap: 4 }}>
                      {list.map((u) => {
                        const done = u.status === "done";
                        return (
                          <button
                            key={u.id}
                            className={`hwchip ${done ? "hw-done" : ""}`}
                            onClick={() => mark(u.id, !done)}
                            title={
                              [u.activity, u.pages, u.amount && `분량 ${u.amount}`]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                          >
                            {done && <b>○</b>} {u.name}
                            {u.amount ? <span className="hint"> {u.amount}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// 소단원을 그 위 단원(대/중) 이름으로 묶는다
function groupByParent(units = []) {
  const m = new Map();
  units
    .filter((u) => u.leaf)
    .forEach((u) => {
      const head = [u.big, u.mid].filter(Boolean).slice(0, 2).join(" › ");
      const key = head === u.name ? "" : head;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(u);
    });
  return [...m.entries()];
}
