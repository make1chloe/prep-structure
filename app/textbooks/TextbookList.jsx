"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateTextbook,
  deleteTextbooks,
  updateTextbooksArea,
  updateTextbooksStatus,
} from "./actions";
import { sortBooks, BOOK_SORTS, DEFAULT_SORT } from "@/lib/bookSort";
import { AREA_ORDER as AREAS } from "@/lib/bookSort";

const TB_STATUS = {
  active: { label: "사용중", cls: "tag tag-mint" },
  discontinued: { label: "절판", cls: "tag tag-muted" },
  paused: { label: "중단", cls: "tag tag-amber" },
};

const COLS = [
  { key: "name", label: "교재명", w: 220, strong: true },
  { key: "area", label: "영역", w: 74, type: "area" },
  { key: "target_grade", label: "레벨", w: 92 },
  { key: "total_pages", label: "페이지", w: 62 },
  { key: "price", label: "교재비", w: 78 },
  { key: "word_range", label: "단어범위", w: 78 },
  { key: "status", label: "상태", w: 76, type: "status" },
  { key: "purchase_url", label: "구매링크", w: 120, type: "url" },
  { key: "feature", label: "비고", w: 140 },
];

export default function TextbookList({ textbooks = [], unitCount = {}, selectedId }) {
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [q, setQ] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [noUnitsOnly, setNoUnitsOnly] = useState(false);
  /**
   * **차례 (원장님, 2026-08-06 — 「교재정렬이 기준이 없어」).**
   *
   * 지금까지는 넣은 순서의 거꾸로였다. 기계에는 기준이지만 사람에게는 아무
   * 기준이 아니다 — 문법책과 단어책이 뒤섞이고 같은 시리즈가 흩어진다.
   * 기본을 **영역 › 이름**으로 둔다. 교재를 찾을 때 먼저 떠오르는 것이 영역이다.
   *
   * **고르신 차례는 기억한다.** 매번 다시 고르게 하면 안 쓰신다.
   */
  const [sort, setSort] = useState(DEFAULT_SORT);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("tbSort") || "null");
      if (saved?.key) setSort(saved);
    } catch {}
  }, []);
  function pickSort(next) {
    setSort(next);
    try { localStorage.setItem("tbSort", JSON.stringify(next)); } catch {}
  }
  /** 열 이름을 누르면 그 기준으로 · 같은 것을 또 누르면 뒤집는다 */
  function clickCol(key) {
    pickSort(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const norm = (v) => (v || "").toString().toLowerCase();
  const kw = norm(q).trim();
  const shown = useMemo(() => {
    const kept = textbooks.filter((t) => {
      const st = t.status || "active";
      if (!showHidden && st !== "active") return false;
      if (areaFilter && t.area !== areaFilter) return false;
      if (noUnitsOnly && (unitCount[t.id] || 0) > 0) return false;
      if (!kw) return true;
      return [t.name, t.area, t.target_grade, t.feature].some((v) => norm(v).includes(kw));
    });
    return sortBooks(kept, sort, unitCount);
  }, [textbooks, showHidden, areaFilter, noUnitsOnly, kw, sort, unitCount]);
  const hiddenCount = textbooks.filter((t) => (t.status || "active") !== "active").length;
  const noUnitCount = textbooks.filter(
    (t) => (t.status || "active") === "active" && !(unitCount[t.id] || 0)
  ).length;

  const allChecked = shown.length > 0 && sel.size === shown.length;
  const someChecked = sel.size > 0 && !allChecked;

  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(shown.map((t) => t.id)));
  }
  function toggleOne(id) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  }

  function startEdit(t) {
    setEditId(t.id);
    const d = {};
    COLS.forEach(({ key }) => (d[key] = t[key] ?? ""));
    d.status = t.status || "active";
    setDraft(d);
  }
  function saveEdit() {
    const id = editId;
    startTransition(async () => {
      const res = await updateTextbook(id, draft);
      if (res?.error) alert(res.error);
      setEditId(null);
      router.refresh();
    });
  }

  function run(fn, clear = true) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) alert(res.error);
      if (clear) setSel(new Set());
      router.refresh();
    });
  }

  function runDelete() {
    if (sel.size === 0) return;
    if (!confirm(`선택한 교재 ${sel.size}권을 삭제할까요? 단원도 함께 삭제됩니다.`)) return;
    run(() => deleteTextbooks([...sel]));
  }

  if (textbooks.length === 0) {
    return (
      <p className="muted" style={{ padding: 16, margin: 0, fontSize: 13.5 }}>
        아직 교재가 없습니다. 위에서 추가하거나 엑셀로 올려보세요.
      </p>
    );
  }

  function cell(t, c) {
    const v = t[c.key];
    if (c.type === "status") {
      const st = TB_STATUS[t.status || "active"];
      return <span className={st.cls}>{st.label}</span>;
    }
    if (c.type === "url") {
      return v ? (
        <a href={v} target="_blank" rel="noreferrer" className="sky">링크</a>
      ) : <span className="muted">—</span>;
    }
    if (c.key === "price") return v ? `${Number(v).toLocaleString()}` : <span className="muted">—</span>;
    if (!v) return <span className="muted">—</span>;
    if (c.key === "name") {
      return (
        <a href={`/textbooks?tb=${t.id}`} style={{ fontWeight: 700, color: "inherit", textDecoration: "none" }}>
          {v}
        </a>
      );
    }
    return v;
  }

  function editor(c) {
    if (c.type === "status") {
      return (
        <select className="input input-sm" value={draft.status || "active"}
          onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          {Object.entries(TB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      );
    }
    if (c.type === "area") {
      return (
        <select className="input input-sm" value={draft.area || ""}
          onChange={(e) => setDraft({ ...draft, area: e.target.value })}>
          <option value="">—</option>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      );
    }
    return (
      <input className="input input-sm" value={draft[c.key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })} />
    );
  }

  /**
   * 열 이름을 **누를 수 있는 것**으로. 지금 기준에는 화살표를 붙인다 —
   * 무엇으로 늘어서 있는지 보이지 않으면 정렬이 있어도 없는 것과 같다.
   */
  function sortableTh(key, label) {
    const on = sort.key === key;
    return (
      <button
        onClick={() => clickCol(key)}
        title={`${label}(으)로 정렬`}
        style={{
          background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer",
          color: on ? "var(--ink)" : "inherit", fontWeight: on ? 800 : "inherit",
        }}
      >
        {label}
        <span className="hint" style={{ marginLeft: 3, fontSize: 10 }}>
          {on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 6, padding: "12px 16px 0", alignItems: "center" }}>
        <input className="input input-sm" style={{ width: 200 }} placeholder="교재명 검색"
          value={q} onChange={(e) => { setQ(e.target.value); setSel(new Set()); }} />
        <select className="input input-sm" style={{ width: 90 }} value={areaFilter}
          onChange={(e) => { setAreaFilter(e.target.value); setSel(new Set()); }}>
          <option value="">전 영역</option>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {hiddenCount > 0 && (
          <button className={`btn btn-sm ${showHidden ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setShowHidden((v) => !v)}>
            절판·중단 {hiddenCount} {showHidden ? "숨기기" : "보기"}
          </button>
        )}
        {/* 폰에서는 열 이름을 누르기가 어렵다 — 고르는 칸도 같이 둔다 */}
        <select
          className="input input-sm"
          style={{ width: 128 }}
          value={sort.key}
          onChange={(e) => pickSort({ key: e.target.value, dir: "asc" })}
          title={BOOK_SORTS.find((s) => s.key === sort.key)?.hint || ""}
        >
          {BOOK_SORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}순</option>
          ))}
        </select>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => pickSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
          title={sort.dir === "asc" ? "오름차순 (누르면 뒤집기)" : "내림차순 (누르면 뒤집기)"}
        >
          {sort.dir === "asc" ? "▲" : "▼"}
        </button>
        <span className="spacer" />
        <span className="hint">{shown.length}권</span>
        <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={noUnitsOnly}
            onChange={(e) => setNoUnitsOnly(e.target.checked)}
          />
          단원 없는 교재만 ({noUnitCount})
        </label>
      </div>

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}권 선택</b>
          <select className="input input-sm" style={{ width: 110 }} defaultValue=""
            onChange={(e) => { run(() => updateTextbooksStatus([...sel], e.target.value)); e.target.value = ""; }}
            disabled={pending}>
            <option value="">상태 변경…</option>
            {Object.entries(TB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input input-sm" style={{ width: 100 }} defaultValue=""
            onChange={(e) => { run(() => updateTextbooksArea([...sel], e.target.value)); e.target.value = ""; }}
            disabled={pending}>
            <option value="">영역 변경…</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="tblwrap">
        <table className="tbl tbl-tight">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allChecked}
                  ref={(el) => el && (el.indeterminate = someChecked)} onChange={toggleAll} />
              </th>
              <th style={{ width: 62 }}>{sortableTh("units", "단원")}</th>
              {COLS.map((c) => (
                <th key={c.key} style={{ minWidth: c.w }}>
                  {/* 구매링크·비고는 늘어세울 기준이 못 된다 (링크가 있고 없고 뿐) */}
                  {["purchase_url", "feature", "word_range"].includes(c.key)
                    ? c.label
                    : sortableTh(c.key, c.label)}
                </th>
              ))}
              <th style={{ width: 86 }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const editing = editId === t.id;
              const dim = (t.status || "active") !== "active";
              return (
                <tr key={t.id} style={{
                  ...(t.id === selectedId ? { background: "var(--surface-2)" } : {}),
                  ...(dim && !editing ? { opacity: 0.55 } : {}),
                }}>
                  <td>
                    <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleOne(t.id)} />
                  </td>
                  <td>
                    {unitCount[t.id] ? (
                      <span className="tag tag-mint">{unitCount[t.id]}</span>
                    ) : (
                      <span className="tag tag-muted">없음</span>
                    )}
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} style={!editing && c.strong ? { fontWeight: 700 } : undefined}>
                      {editing ? editor(c) : cell(t, c)}
                    </td>
                  ))}
                  <td>
                    {editing ? (
                      <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                        <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>저장</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>취소</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}>수정</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="muted" style={{ padding: 16, margin: 0, fontSize: 13.5 }}>
            조건에 맞는 교재가 없어요.
          </p>
        )}
      </div>
    </>
  );
}
