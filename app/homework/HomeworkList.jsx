"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateHomeworkItem,
  setHomeworkItemsActive,
  setHomeworkItemsCategory,
  deleteHomeworkItems,
} from "./actions";

const CATEGORIES = ["단어", "독해", "문법", "노트", "내신", "기타"];
export const CAT_CLS = {
  단어: "tag-amber",
  독해: "tag-sky",
  문법: "tag-lav",
  노트: "tag-mint",
  내신: "tag-muted",
  기타: "tag-muted",
};

export default function HomeworkList({ items = [] }) {
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("전체");
  const [showOff, setShowOff] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const kw = q.trim().toLowerCase();
  const shown = items.filter((i) => {
    if (!showOff && !i.active) return false;
    if (catFilter !== "전체" && (i.category || "기타") !== catFilter) return false;
    if (kw && !i.name.toLowerCase().includes(kw)) return false;
    return true;
  });

  const allChecked = shown.length > 0 && shown.every((i) => sel.has(i.id));
  const someChecked = sel.size > 0 && !allChecked;

  function toggleAll() {
    if (allChecked) {
      const n = new Set(sel);
      shown.forEach((i) => n.delete(i.id));
      setSel(n);
    } else {
      setSel(new Set([...sel, ...shown.map((i) => i.id)]));
    }
  }
  function toggleOne(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function startEdit(i) {
    setEditId(i.id);
    setDraft({
      name: i.name,
      category: i.category || "",
      sort: i.sort ?? "",
      method: i.method || "",
      prep_task: i.prep_task || "",
    });
  }
  function saveEdit() {
    const id = editId;
    run(async () => {
      const r = await updateHomeworkItem(id, draft);
      setEditId(null);
      return r;
    });
  }

  function runDelete() {
    const ids = [...sel];
    if (ids.length === 0) return;
    if (!confirm(
      `선택한 항목 ${ids.length}개를 삭제할까요?\n` +
      `이미 기록에 쓰인 항목이면 삭제 대신 '숨김'을 권합니다.`
    )) return;
    run(async () => {
      const r = await deleteHomeworkItems(ids);
      setSel(new Set());
      return r;
    });
  }

  return (
    <>
      <div className="row" style={{ gap: 6, padding: "12px 16px 0", alignItems: "center" }}>
        <input
          className="input input-sm"
          style={{ width: 200 }}
          placeholder="항목 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {["전체", ...CATEGORIES].map((c) => {
          const n = c === "전체"
            ? items.filter((i) => showOff || i.active).length
            : items.filter((i) => (showOff || i.active) && (i.category || "기타") === c).length;
          return (
            <button
              key={c}
              className={`btn btn-sm ${catFilter === c ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setCatFilter(c)}
            >
              {c} {n}
            </button>
          );
        })}
        <span className="spacer" />
        <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />
          숨긴 항목도 보기
        </label>
      </div>

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}개 선택</b>
          <select
            className="input input-sm"
            style={{ width: 120 }}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (!v) return;
              run(async () => {
                const r = await setHomeworkItemsCategory([...sel], v);
                setSel(new Set());
                return r;
              });
            }}
            disabled={pending}
          >
            <option value="">분류 변경…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => run(async () => {
              const r = await setHomeworkItemsActive([...sel], false);
              setSel(new Set());
              return r;
            })}
            disabled={pending}
          >
            숨기기
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => run(async () => {
              const r = await setHomeworkItemsActive([...sel], true);
              setSel(new Set());
              return r;
            })}
            disabled={pending}
          >
            다시 쓰기
          </button>
          <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="tblwrap">
        <table className="tbl tbl-tight">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => el && (el.indeterminate = someChecked)}
                  onChange={toggleAll}
                />
              </th>
              <th style={{ minWidth: 180 }}>항목명</th>
              <th style={{ width: 90 }}>분류</th>
              <th style={{ width: 70 }}>순서</th>
              <th style={{ width: 70 }}>사용</th>
              <th style={{ minWidth: 220 }}>학습 방법 (학생에게 보여줄 설명)</th>
              <th style={{ minWidth: 150 }}>내 할일 자동 생성</th>
              <th style={{ width: 86 }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => {
              const editing = editId === i.id;
              const cat = i.category || "기타";
              return (
                <tr key={i.id} style={!i.active ? { opacity: 0.5 } : undefined}>
                  <td>
                    <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleOne(i.id)} />
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
                          value={draft.category}
                          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                        >
                          <option value="">—</option>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          className="input input-sm"
                          style={{ width: 56 }}
                          value={draft.sort}
                          onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
                        />
                      </td>
                      <td />
                      <td>
                        <textarea
                          className="input input-sm"
                          rows={3}
                          style={{ minWidth: 260, whiteSpace: "pre-wrap" }}
                          placeholder={"학생이 숙제를 눌렀을 때 볼 설명\n예) 1. 단어를 3번 쓰고 2. 뜻을 가리고 셀프테스트"}
                          value={draft.method}
                          onChange={(e) => setDraft({ ...draft, method: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="input input-sm"
                          style={{ minWidth: 150 }}
                          placeholder="{학생} 단원평가 출제"
                          title="이 숙제를 배정하면 이 제목으로 내 할일이 생깁니다. {학생} 은 이름으로 바뀝니다. 비우면 안 만듭니다"
                          value={draft.prep_task}
                          onChange={(e) => setDraft({ ...draft, prep_task: e.target.value })}
                        />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                          <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>저장</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>취소</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ fontWeight: 600 }}>{i.name}</td>
                      <td><span className={`tag ${CAT_CLS[cat] || "tag-muted"}`}>{cat}</span></td>
                      <td className="muted">{i.sort}</td>
                      <td>
                        {i.active ? (
                          <span className="tag tag-mint">사용</span>
                        ) : (
                          <span className="tag tag-muted">숨김</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "normal", maxWidth: 420 }}>
                        {i.method ? (
                          <span className="muted" style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>
                            {i.method}
                          </span>
                        ) : (
                          <span className="hint">— 아직 없음</span>
                        )}
                      </td>
                      <td>
                        {i.prep_task ? (
                          <span className="tag tag-sky" title="배정하면 이 할일이 생깁니다">
                            {i.prep_task}
                          </span>
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(i)}>수정</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="muted" style={{ padding: 16, margin: 0, fontSize: 13.5 }}>
            조건에 맞는 항목이 없어요.
          </p>
        )}
      </div>
    </>
  );
}
