"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTextbook, deleteTextbooks, updateTextbooksArea } from "./actions";

const AREAS = ["독해", "듣기", "영작", "문법", "단어", "내신"];

const FIELDS = [
  { key: "name", label: "교재명", w: "1 1 100%" },
  { key: "area", label: "영역", type: "select" },
  { key: "target_grade", label: "레벨" },
  { key: "total_pages", label: "페이지" },
  { key: "price", label: "교재비" },
  { key: "word_range", label: "단어범위" },
  { key: "purchase_url", label: "구매링크", w: "1 1 100%" },
  { key: "feature", label: "비고", w: "1 1 100%" },
];

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
    const d = {};
    FIELDS.forEach(({ key }) => (d[key] = t[key] ?? ""));
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
      <p className="muted" style={{ margin: 0, padding: 14, fontSize: 13.5 }}>
        아직 교재가 없습니다. 위에서 교재를 추가하거나 엑셀로 올려보세요.
      </p>
    );
  }

  return (
    <>
      {sel.size > 0 && (
        <div className="bulkbar" style={{ margin: "0 0 10px" }}>
          <b>{sel.size}권 선택</b>
          <select
            className="input input-sm"
            style={{ width: 110 }}
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

      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 30 }}>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => el && (el.indeterminate = someChecked)}
                onChange={toggleAll}
              />
            </th>
            <th>교재</th>
            <th style={{ width: 52 }}></th>
          </tr>
        </thead>
        <tbody>
          {textbooks.map((t) => {
            const editing = editId === t.id;
            if (editing) {
              return (
                <tr key={t.id}>
                  <td></td>
                  <td colSpan={2}>
                    <div className="editgrid" style={{ marginBottom: 8 }}>
                      {FIELDS.map(({ key, label, type, w }) => (
                        <div className="field" key={key} style={w ? { gridColumn: "1 / -1" } : undefined}>
                          <label className="label">{label}</label>
                          {type === "select" ? (
                            <select
                              className="input input-sm"
                              value={draft[key] || ""}
                              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                            >
                              <option value="">선택</option>
                              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                          ) : (
                            <input
                              className="input input-sm"
                              value={draft[key] ?? ""}
                              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>
                        저장
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                        취소
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }
            return (
              <tr
                key={t.id}
                style={t.id === selectedId ? { background: "var(--surface-2)" } : undefined}
              >
                <td>
                  <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleOne(t.id)} />
                </td>
                <td>
                  <a
                    href={`/textbooks?tb=${t.id}`}
                    style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}
                  >
                    {t.name}
                  </a>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {[
                      t.area,
                      t.target_grade,
                      t.total_pages ? `${t.total_pages}p` : null,
                      t.price ? `${Number(t.price).toLocaleString()}원` : null,
                      t.word_range ? `단어 ${t.word_range}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}>수정</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
