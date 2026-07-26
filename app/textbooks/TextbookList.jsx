"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateTextbook,
  deleteTextbooks,
  updateTextbooksArea,
  updateTextbooksStatus,
} from "./actions";

const AREAS = ["독해", "듣기", "영작", "문법", "단어", "내신"];
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
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const norm = (v) => (v || "").toString().toLowerCase();
  const kw = norm(q).trim();
  const shown = textbooks.filter((t) => {
    const st = t.status || "active";
    if (!showHidden && st !== "active") return false;
    if (areaFilter && t.area !== areaFilter) return false;
    if (noUnitsOnly && (unitCount[t.id] || 0) > 0) return false;
    if (!kw) return true;
    return [t.name, t.area, t.target_grade, t.feature].some((v) => norm(v).includes(kw));
  });
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
              <th style={{ width: 62 }}>단원</th>
              {COLS.map((c) => <th key={c.key} style={{ minWidth: c.w }}>{c.label}</th>)}
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
