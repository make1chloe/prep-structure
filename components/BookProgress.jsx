"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listStudentUnits,
  setUnitProgress,
  setCurrentPage,
  setStudentBookStatus,
  nextRound,
  setUnitNote,
} from "@/app/progress/actions";

/**
 * 교재 한 권의 **진도** — 단원을 순서와 상관없이 눌러서 기록한다.
 *
 * 원장님 (2026-08-14): 「학생별로 진도를 저장하는 화면이 오늘수업밖에 없고
 * 그마저도 조악함」.
 *
 * 그래서 **오늘 수업 밖으로 꺼냈다.** 진도를 적는 일이 수업 중에만 생기는 것이
 * 아니다 — 상담 전에 어디까지 했는지 보고, 결석한 아이 것을 나중에 채우고,
 * 회독을 넘긴다. 그때마다 오늘 수업 화면을 열어 그 날짜를 찾아 들어갈 수는 없다.
 * 이제 재원생 화면의 「교재」 탭에서도 같은 것을 쓴다 — **한 벌이라 어긋나지 않는다.**
 *
 * @param extra 오늘 수업에서만 붙는 것 (단어시험 방식). components 가
 *   app/today 를 가리키면 안 되므로 넣어주는 쪽에서 준다.
 * @param openFirst 재원생 화면처럼 **진도를 보러 들어온 자리**에서는 펴 둔다.
 */
export default function BookProgress({ studentId, book, extra = null, openFirst = false }) {
  const [open, setOpen] = useState(openFirst);
  const [units, setUnits] = useState(null);
  const [err, setErr] = useState(null);
  const [page, setPage] = useState(book.curPage || "");
  const [round, setRound] = useState(null);      // 지금 몇 회독째
  const [q, setQ] = useState("");                // 단원 검색
  const [noteFor, setNoteFor] = useState(null);  // 메모를 적는 중인 단원
  /**
   * **골라서 한 번에** (원장님, 2026-08-14 — 「체크박스를 이용한 완료
   * 여부를 일괄적으로 바꿀 수 있게 하면 안될까?」).
   *
   * 순차로 안 나가는 교재는 완료가 띄엄띄엄이다 — 하나씩 세 단계 사이클로
   * 맞추려면 손이 많이 간다. 목록은 전체선택 → 일괄처리 (원칙 5-3).
   */
  const [selMode, setSelMode] = useState(false);
  const [selUnits, setSelUnits] = useState(() => new Set());
  const [noteDraft, setNoteDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function load() {
    const res = await listStudentUnits(studentId, book.id);
    if (res.error) setErr(res.error);
    setUnits(res.units || []);
    if (res.round) setRound(res.round);
  }

  // 진도를 보러 들어온 자리는 펴 둔 채로 여니 처음부터 읽어온다
  useEffect(() => {
    if (open && units === null) load();
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && units === null) load();
  }

  /**
   * **안 함 → 하는 중 → 완료 → 안 함.**
   *
   * 표(student_unit_progress)에는 doing 이 처음부터 있었는데 화면에서 쓸 길이
   * 없었다. 그래서 한 단원을 여러 번에 걸쳐 하는 교재(문법 한 단원을 세 번
   * 수업)에서는 「아직 안 함」 과 「하다 말았음」 이 같은 얼굴이었다.
   * 다음 수업에 어디부터인지 다시 물어봐야 했다.
   */
  const NEXT = { "": "doing", doing: "done", done: "" };

  function mark(unitId, status) {
    // 화면을 먼저 바꾸고 저장한다 (수업 중 기다리지 않도록)
    setUnits((list) =>
      (list || []).map((u) => (u.id === unitId ? { ...u, status: status || "" } : u))
    );
    startTransition(async () => {
      const res = await setUnitProgress(studentId, [unitId], status || null);
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
  const noUnits = units !== null && leaves.length === 0;

  function saveNote(unitId) {
    startTransition(async () => {
      const res = await setUnitNote(studentId, unitId, noteDraft);
      if (res?.error) { alert(res.error); return; }
      setNoteFor(null);
      await load();
      router.refresh();
    });
  }

  function markMany(status) {
    const ids = [...selUnits];
    if (ids.length === 0) return;
    // 화면 먼저 (수업 중 기다리지 않게) — 실패하면 다시 읽어온다
    setUnits((list) =>
      (list || []).map((u) => (selUnits.has(u.id) ? { ...u, status: status || "" } : u))
    );
    setSelUnits(new Set());
    setSelMode(false);
    startTransition(async () => {
      const res = await setUnitProgress(studentId, ids, status || null);
      if (res?.error) {
        alert(res.error);
        load();
        return;
      }
      router.refresh();
    });
  }

  function savePage() {
    startTransition(async () => {
      const res = await setCurrentPage(studentId, book.id, page);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  return (
    <div className="bookprog">
      <button
        onClick={toggle}
        style={{
          all: "unset", cursor: "pointer", display: "block", width: "100%",
        }}
      >
        <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "nowrap" }}>
          <span className="muted" style={{ fontSize: 12 }}>{open ? "▾" : "▸"}</span>
          <b style={{ fontSize: 14 }}>{book.name}</b>
          <span className="spacer" />
          <span className="hint">
            {liveTotal > 0
              ? `${liveDone}/${liveTotal}단원`
              : book.bookPages
              ? `${book.curPage || 0}/${book.bookPages}p`
              : "진도 기록 전"}
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

      {/* 단어 교재는 시험 방식을 라벨로 붙인다 (오늘 수업에서만 넣어준다) */}
      {extra && <div style={{ marginTop: 4 }}>{extra}</div>}

      {open && (
        <div style={{ marginTop: 8 }}>
          {err && <div className="err">{err}</div>}
          {units === null && <span className="hint">단원 불러오는 중…</span>}
          {noUnits && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="hint">
                이 교재는 아직 단원이 없어요. 단원을 만들기 전까지는 페이지로 진도를 적을 수 있어요.
              </span>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <span className="hint">지금</span>
                <input
                  className="input input-sm"
                  style={{ width: 64, textAlign: "center" }}
                  inputMode="numeric"
                  value={page}
                  onChange={(e) => setPage(e.target.value)}
                  placeholder="0"
                />
                <span className="muted">/ {book.bookPages || "?"}p</span>
                <button className="btn btn-primary btn-sm" onClick={savePage} disabled={pending}>
                  저장
                </button>
                {!book.bookPages && (
                  <span className="hint">교재 페이지에서 총 페이지를 넣으면 %가 나와요</span>
                )}
              </div>
            </div>
          )}
          {leaves.length > 0 && (
            <>
              {/**
                * **지금 하는 곳** (원장님, 2026-08-14 — 「순차적으로 진도를
                * 안 나간 교재들도 있어서 그 부분 고려해 줘」).
                *
                * 순차로 나가는 교재는 마지막 ○ 다음이 오늘 자리지만, 건너뛰며
                * 나가는 교재는 ○ 가 흩어져 있어 **오늘 어디인지가 안 보인다.**
                * 그래서 ◐(하는 중)로 찍은 단원을 맨 위에 이름으로 박아준다 —
                * 오늘 시작할 때 ◐ 를 찍어두면, 다음에 열어도 바로 보인다.
                */}
              {leaves.some((u) => u.status === "doing") && (
                <div className="row" style={{ gap: 5, marginBottom: 6, alignItems: "center" }}>
                  <span className="tag tag-amber">◐ 지금 하는 곳</span>
                  <b style={{ fontSize: 13.5 }}>
                    {leaves.filter((u) => u.status === "doing").map((u) => u.name).join(" · ")}
                  </b>
                </div>
              )}
              <div className="row" style={{ gap: 4, marginBottom: 6, alignItems: "center" }}>
                {/**
                  * **회독을 넘기는 자리가 화면에 아예 없었다.**
                  * 표와 서버 액션(nextRound)은 처음부터 있었는데 누를 데가
                  * 없어서, 2회독을 돌리려면 단원 체크를 하나씩 지우는 수밖에
                  * 없었다 — 그러면 1회독을 언제 끝냈는지도 같이 사라진다.
                  */}
                {round > 1 && <span className="tag tag-lav">{round}회독</span>}
                {leaves.length > 0 && leaves.every((u) => u.status === "done") && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={pending}
                    title="지난 회독 진도는 그대로 남고, 새 회독이 빈 상태로 시작합니다"
                    onClick={() => {
                      if (!confirm(`${book.name} 을 다음 회독으로 넘길까요?\n\n지금까지의 진도는 ${round || 1}회독 기록으로 남고, 단원은 빈 상태가 됩니다.`)) return;
                      startTransition(async () => {
                        const res = await nextRound(studentId, book.id);
                        if (res?.error) { alert(res.error); return; }
                        await load();
                        router.refresh();
                      });
                    }}
                  >
                    ⟳ 다음 회독으로
                  </button>
                )}
                {/* 단원이 쉰 개 넘는 교재가 있다 — 눈으로 찾지 않게 */}
                {leaves.length > 12 && (
                  <input
                    className="input input-sm"
                    style={{ width: 120 }}
                    placeholder="단원 찾기"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                )}
                <button
                  className={`btn btn-sm ${selMode ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => { setSelMode(!selMode); setSelUnits(new Set()); }}
                  title="여러 단원을 골라 한 번에 바꿉니다"
                >
                  ☑ 골라서
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => markAll(true)} disabled={pending}>
                  전체 완료
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (!confirm(`${book.name} 을 다 끝낸 교재로 처리할까요?\n숙제·진도 화면에서 빠지고 학생 기록에만 남습니다.`)) return;
                    startTransition(async () => {
                      const res = await setStudentBookStatus(studentId, book.id, "done");
                      if (res?.error) alert(res.error);
                      router.refresh();
                    });
                  }}
                  disabled={pending}
                >
                  이 교재 끝냄
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => markAll(false)} disabled={pending}>
                  전체 해제
                </button>
                <span className="hint" style={{ alignSelf: "center" }}>
                  {selMode
                    ? "바꿀 단원을 누르고, 아래에서 한 번에 적으세요"
                    : "누를 때마다 안 함 → ◐ 하는 중 → ○ 완료. 여러 개면 ☑ 골라서"}
                </span>
              </div>
              {selMode && (
                <div className="bulkbar" style={{ margin: "0 0 8px" }}>
                  <b>{selUnits.size}개 골랐어요</b>
                  <button className="btn btn-primary btn-sm" disabled={pending || selUnits.size === 0} onClick={() => markMany("done")}>
                    ○ 완료로
                  </button>
                  <button className="btn btn-sm" disabled={pending || selUnits.size === 0} onClick={() => markMany("doing")}>
                    ◐ 하는 중으로
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={pending || selUnits.size === 0} onClick={() => markMany(null)}>
                    안 함으로
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setSelMode(false); setSelUnits(new Set()); }}>
                    취소
                  </button>
                </div>
              )}
              <div className="stack" style={{ gap: 4 }}>
                {groupByParent(units, q).map(([head, list]) => (
                  <div className="hwgroup" key={head || "_"}>
                    {head && <span className="tag tag-muted hwcat" style={{ width: "auto" }}>{head}</span>}
                    <div className="row" style={{ gap: 4 }}>
                      {list.map((u) => {
                        const done = u.status === "done";
                        const doing = u.status === "doing";
                        return (
                          <span key={u.id} className="unitchip-wrap">
                            <button
                              className={`hwchip ${
                                selMode && selUnits.has(u.id)
                                  ? "hw-next"
                                  : done ? "hw-done" : doing ? "hw-weak" : ""
                              }`}
                              onClick={() => {
                                if (!selMode) return mark(u.id, NEXT[u.status || ""]);
                                setSelUnits((prev) => {
                                  const n = new Set(prev);
                                  n.has(u.id) ? n.delete(u.id) : n.add(u.id);
                                  return n;
                                });
                              }}
                              title={
                                [u.activity, u.pages, u.amount && `분량 ${u.amount}`, u.note && `메모: ${u.note}`]
                                  .filter(Boolean)
                                  .join(" · ") || undefined
                              }
                            >
                              {selMode && <b>{selUnits.has(u.id) ? "☑" : "☐"}</b>}
                              {!selMode && done && <b>○</b>}
                              {!selMode && doing && <b>◐</b>} {u.name}
                              {u.activity ? <span className="hint"> · {u.activity}</span> : null}
                              {u.amount ? <span className="hint"> {u.amount}</span> : null}
                            </button>
                            {/**
                              * 단원 메모 — 「이 단원 어려워함」 「17번만 다시」.
                              * 수업 기록의 진도 메모와 다르다 — 그건 그날 이야기고,
                              * 이건 **이 단원**에 붙어 회독이 넘어가도 따라온다.
                              * 메모가 있으면 ✎ 가 색으로 차 있다.
                              */}
                            <button
                              className={`unitnote-btn ${u.note ? "has" : ""}`}
                              title={u.note ? `메모: ${u.note} (누르면 고치기)` : "이 단원에 메모"}
                              onClick={() => {
                                setNoteFor(noteFor === u.id ? null : u.id);
                                setNoteDraft(u.note || "");
                              }}
                            >
                              ✎
                            </button>
                            {noteFor === u.id && (
                              <span className="row" style={{ gap: 4, width: "100%", marginTop: 2 }}>
                                <input
                                  className="input input-sm"
                                  style={{ flex: 1, minWidth: 140 }}
                                  autoFocus
                                  placeholder="예: 17번만 다시 · 어려워함"
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && saveNote(u.id)}
                                />
                                <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => saveNote(u.id)}>
                                  저장
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setNoteFor(null)}>
                                  취소
                                </button>
                              </span>
                            )}
                          </span>
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

// 소단원을 그 위 단원(대/중) 이름으로 묶는다. kw 가 있으면 걸러서 묶는다
function groupByParent(units = [], kw = "") {
  const m = new Map();
  const q = (kw || "").trim().toLowerCase();
  units
    .filter((u) => u.leaf)
    .filter((u) =>
      !q ||
      [u.name, u.activity, u.big, u.mid].some((v) =>
        (v || "").toString().toLowerCase().includes(q)
      )
    )
    .forEach((u) => {
      const head = [u.big, u.mid].filter(Boolean).slice(0, 2).join(" › ");
      const key = head === u.name ? "" : head;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(u);
    });
  return [...m.entries()];
}
