"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateUnit,
  deleteUnits,
  moveUnits,
  moveUnitsToTextbook,
  moveUnitsUnder,
} from "./actions";

const ACTIVITIES = ["설명", "실전모의고사", "워크북"];
const LEVEL = ["대", "중", "소"];

// parent_id 로 트리를 만들어 [{unit, depth}] 평면 목록으로 펼친다
export function flattenTree(units) {
  const byParent = new Map();
  units.forEach((u) => {
    const k = u.parent_id || "root";
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(u);
  });
  byParent.forEach((list) => list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)));

  const out = [];
  const walk = (key, depth) => {
    (byParent.get(key) || []).forEach((u) => {
      out.push({ unit: u, depth });
      walk(u.id, depth + 1);
    });
  };
  walk("root", 0);
  return out;
}

export default function UnitList({ units = [], textbookId, textbooks = [] }) {
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const rows = flattenTree(units);
  const allChecked = rows.length > 0 && sel.size === rows.length;
  const someChecked = sel.size > 0 && !allChecked;

  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(rows.map((r) => r.unit.id)));
  }
  function toggleOne(id) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  }

  function startEdit(u) {
    setEditId(u.id);
    setDraft({ name: u.name || "", sort: u.sort ?? "", activity: u.label || "" });
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
      const res = await fn();
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function runDelete() {
    const ids = [...sel];
    if (ids.length === 0) return;
    if (!confirm(`선택한 단원 ${ids.length}개를 삭제할까요? 하위 단원도 함께 삭제됩니다.`)) return;
    run(async () => {
      const r = await deleteUnits(ids);
      setSel(new Set());
      return r;
    });
  }

  const others = textbooks.filter((t) => t.id !== textbookId);
  // 상위로 지정 가능한 단원 = 선택되지 않은 것 (소단원 밑으로는 안 넣음)
  const parentOptions = rows.filter((r) => r.depth < 2 && !sel.has(r.unit.id));

  if (rows.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 13.5 }}>
        아직 단원이 없습니다. 위에서 단원을 추가해보세요.
      </p>
    );
  }

  return (
    <>
      {sel.size > 0 && (
        <div className="bulkbar" style={{ margin: "0 0 12px" }}>
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
          <select
            className="input"
            style={{ width: 160, padding: "6px 8px" }}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (!v) return;
              run(async () => {
                const r = await moveUnitsUnder([...sel], v === "root" ? null : v, textbookId);
                setSel(new Set());
                return r;
              });
            }}
            disabled={pending}
          >
            <option value="">상위 단원 바꾸기…</option>
            <option value="root">대단원으로 (최상위)</option>
            {parentOptions.map((r) => (
              <option key={r.unit.id} value={r.unit.id}>
                {"— ".repeat(r.depth)}
                {r.unit.name} 아래로
              </option>
            ))}
          </select>
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
                  const r = await moveUnitsToTextbook([...sel], tb);
                  setSel(new Set());
                  return r;
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
            <th style={{ width: 40 }}>구분</th>
            <th>단원명</th>
            <th style={{ width: 90 }}>활동</th>
            <th style={{ width: 56 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ unit: u, depth }) => {
            const editing = editId === u.id;
            return (
              <tr key={u.id}>
                <td>
                  <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggleOne(u.id)} />
                </td>
                <td>
                  <span className={`tag ${depth === 0 ? "tag-lav" : depth === 1 ? "tag-sky" : "tag-muted"}`}>
                    {LEVEL[Math.min(depth, 2)]}
                  </span>
                </td>
                {editing ? (
                  <>
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
                    <td style={{ paddingLeft: 12 + depth * 20, fontWeight: depth === 0 ? 700 : 500 }}>
                      {u.name}
                    </td>
                    <td className="muted">{u.label || "—"}</td>
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
