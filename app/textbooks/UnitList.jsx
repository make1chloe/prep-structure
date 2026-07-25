"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUnit, deleteUnits, moveUnits, moveUnitsToTextbook } from "./actions";

const ACTIVITIES = ["설명", "실전모의고사", "워크북"];

export default function UnitList({ units = [], textbookId, textbooks = [] }) {
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const allChecked = units.length > 0 && sel.size === units.length;
  const someChecked = sel.size > 0 && !allChecked;

  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(units.map((u) => u.id)));
  }
  function toggleOne(id) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  }

  function startEdit(u) {
    setEditId(u.id);
    setDraft({ name: u.name || "", sort: u.sort ?? "", activity: u.activity || "" });
  }

  function saveEdit() {
    const id = editId;
    startTransition(async () => {
      await updateUnit(id, draft);
      setEditId(null);
      router.refresh();
    });
  }

  function run(fn) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function runDelete() {
    const ids = [...sel];
    if (ids.length === 0) return;
    if (!confirm(`선택한 단원 ${ids.length}개를 삭제할까요?`)) return;
    run(async () => {
      await deleteUnits(ids);
      setSel(new Set());
    });
  }

  const others = textbooks.filter((t) => t.id !== textbookId);

  if (units.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 13.5 }}>
        아직 단원이 없습니다. 위에서 단원을 추가해보세요.
      </p>
    );
  }

  return (
    <>
      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}개 선택</b>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => run(() => moveUnits([...sel], "up", textbookId))}
            disabled={pending}
          >
            ↑ 위로
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => run(() => moveUnits([...sel], "down", textbookId))}
            disabled={pending}
          >
            ↓ 아래로
          </button>
          {others.length > 0 && (
            <select
              className="input"
              style={{ width: 150, padding: "6px 8px" }}
              defaultValue=""
              onChange={(e) => {
                const tb = e.target.value;
                e.target.value = "";
                if (!tb) return;
                run(async () => {
                  await moveUnitsToTextbook([...sel], tb);
                  setSel(new Set());
                });
              }}
              disabled={pending}
            >
              <option value="">다른 교재로 이동…</option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <table className="tbl">
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
            <th style={{ width: 46 }}>순서</th>
            <th>단원명</th>
            <th style={{ width: 90 }}>활동</th>
            <th style={{ width: 56 }}></th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const editing = editId === u.id;
            return (
              <tr key={u.id}>
                <td>
                  <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggleOne(u.id)} />
                </td>
                {editing ? (
                  <>
                    <td>
                      <input
                        className="input input-sm"
                        style={{ width: 42 }}
                        value={draft.sort}
                        onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input input-sm"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="input input-sm"
                        value={draft.activity}
                        onChange={(e) => setDraft({ ...draft, activity: e.target.value })}
                      >
                        <option value="">없음</option>
                        {ACTIVITIES.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
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
                    <td className="muted">{u.sort}</td>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="muted">{u.activity || "—"}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(u)}>
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
    </>
  );
}
