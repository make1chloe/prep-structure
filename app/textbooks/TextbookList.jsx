"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTextbook, deleteTextbooks, updateTextbooksArea } from "./actions";

const AREAS = ["독해", "듣기", "영작", "문법", "단어", "내신"];

export default function TextbookList({ textbooks = [], selectedId }) {
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const allChecked = textbooks.length > 0 && sel.size === textbooks.length;
  const someChecked = sel.size > 0 && !allChecked;

  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(textbooks.map((t) => t.id)));
  }
  function toggleOne(id) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  }

  function startEdit(t) {
    setEditId(t.id);
    setDraft({
      name: t.name || "",
      area: t.area || "",
      target_grade: t.target_grade || "",
      total_pages: t.total_pages ?? "",
    });
  }

  function saveEdit() {
    const id = editId;
    startTransition(async () => {
      await updateTextbook(id, draft);
      setEditId(null);
      router.refresh();
    });
  }

  function runDelete() {
    const ids = [...sel];
    if (ids.length === 0) return;
    if (!confirm(`선택한 교재 ${ids.length}권을 삭제할까요? 단원도 함께 삭제됩니다.`)) return;
    startTransition(async () => {
      await deleteTextbooks(ids);
      setSel(new Set());
      router.refresh();
    });
  }

  function runArea(area) {
    const ids = [...sel];
    if (ids.length === 0 || !area) return;
    startTransition(async () => {
      await updateTextbooksArea(ids, area);
      setSel(new Set());
      router.refresh();
    });
  }

  if (textbooks.length === 0) {
    return (
      <div style={{ padding: 18 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          아직 교재가 없습니다. 위에서 첫 교재를 추가해보세요.
        </p>
      </div>
    );
  }

  return (
    <>
      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}권 선택</b>
          <select
            className="input"
            style={{ width: 110, padding: "6px 8px" }}
            defaultValue=""
            onChange={(e) => { runArea(e.target.value); e.target.value = ""; }}
            disabled={pending}
          >
            <option value="">영역 변경…</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => el && (el.indeterminate = someChecked)}
                  onChange={toggleAll}
                />
              </th>
              <th>교재</th>
              <th style={{ width: 60 }}>페이지</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {textbooks.map((t) => {
              const editing = editId === t.id;
              return (
                <tr
                  key={t.id}
                  style={t.id === selectedId ? { background: "var(--surface-2)" } : undefined}
                >
                  <td>
                    <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleOne(t.id)} />
                  </td>
                  {editing ? (
                    <>
                      <td>
                        <div className="stack" style={{ gap: 4 }}>
                          <input
                            className="input input-sm"
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          />
                          <div className="row" style={{ gap: 4 }}>
                            <select
                              className="input input-sm"
                              style={{ width: 80 }}
                              value={draft.area}
                              onChange={(e) => setDraft({ ...draft, area: e.target.value })}
                            >
                              <option value="">영역</option>
                              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                            <input
                              className="input input-sm"
                              style={{ width: 80 }}
                              placeholder="레벨"
                              value={draft.target_grade}
                              onChange={(e) => setDraft({ ...draft, target_grade: e.target.value })}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <input
                          className="input input-sm"
                          style={{ width: 52 }}
                          value={draft.total_pages}
                          onChange={(e) => setDraft({ ...draft, total_pages: e.target.value })}
                        />
                      </td>
                      <td>
                        <div className="stack" style={{ gap: 4 }}>
                          <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>
                            저장
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                            취소
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <a
                          href={`/textbooks?tb=${t.id}`}
                          style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}
                        >
                          {t.name}
                        </a>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {[t.area, t.target_grade].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {t.total_pages ? `${t.total_pages}p` : "—"}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}>
                          수정
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
