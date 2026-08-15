"use client";

import { useState, useTransition } from "react";
import PickOrType from "@/components/PickOrType";
import { useRouter } from "next/navigation";
import {
  updateUnit,
  deleteUnits,
  moveUnits,
  moveUnitsToTextbook,
  moveUnitsUnder,
} from "./actions";
import { flattenTree } from "@/lib/unitTree";
import { DEFAULT_ACTIVITIES } from "@/lib/activities";
import BookPicker from "@/components/BookPicker";
import { sortRows } from "@/lib/listSort";

const LEVEL = ["대", "중", "소"];

export default function UnitList({
  units = [],
  textbookId,
  textbooks = [],
  activities = DEFAULT_ACTIVITIES,
  book = null,
}) {
  // 단어 교재만 단어 개수를 묻는다. 문법 교재에 단어 칸이 있으면 헷갈린다.
  const isWord = book?.area === "단어";
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [onlyBare, setOnlyBare] = useState(false);
  /**
   * **늘어세우는 기준은 나무를 접었을 때만 고른다.**
   *
   * 평소에는 대·중·소로 겹쳐 보여주므로 차례가 이미 정해져 있다 (원장님이
   * 매겨두신 순서). 거기서 이름순으로 다시 세우면 아래 단원이 제 위 단원을
   * 떠나 버려서 목록이 무너진다.
   * 검색하거나 「범위 없는 것만」 을 켜면 어차피 한 줄씩 늘어놓으므로,
   * 그때는 무엇으로 세울지 고를 수 있어야 한다.
   */
  const [sortKey, setSortKey] = useState("sort");
  const router = useRouter();

  /**
   * **찾을 때는 나무를 접는다.**
   *
   * 단원은 대·중·소로 겹쳐 있어서 보통은 그 모양대로 보여준다. 그런데
   * 「Lesson 7 이 어디 있지」 를 찾을 때는 그 겹침이 오히려 방해다 — 위
   * 단원을 하나씩 펴 가며 내려가야 한다. 그래서 **검색 중에는 걸린 것만
   * 한 줄씩** 늘어놓는다 (겹침은 잠깐 접어둔다).
   */
  const kw = q.trim().toLowerCase();
  /** 이 단원에 범위가 적혀 있나 — 쪽수도 문제번호도 없으면 숙제로 낼 수가 없다 */
  const bare = (u) =>
    !String(u.page_start ?? "").trim() &&
    !String(u.page_end ?? "").trim() &&
    !String(u.question_no ?? "").trim();
  const all = flattenTree(units);
  // 위 단원(대·중단원)은 범위가 없어도 된다 — 아래 것을 묶는 이름일 뿐이다
  const parentIds = new Set(units.map((u) => u.parent_id).filter(Boolean));
  const bareCount = units.filter((u) => !parentIds.has(u.id) && bare(u)).length;
  const flat = !!kw || onlyBare;      // 나무를 접었나
  const picked = all.filter(({ unit: u }) => {
    if (onlyBare && (parentIds.has(u.id) || !bare(u))) return false;
    if (!kw) return true;
    return [u.name, u.label, u.question_no].some((v) =>
      (v ?? "").toString().toLowerCase().includes(kw)
    );
  });
  // 접었을 때만 다시 세운다 — 나무일 때는 적어두신 차례 그대로
  const rows =
    flat && sortKey !== "sort"
      ? sortRows(picked.map((r) => ({ ...r, ...r.unit })), { key: sortKey, dir: "asc" }, "name")
          .map((r) => ({ unit: r.unit, depth: r.depth }))
      : picked;
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
    setDraft({
      name: u.name || "",
      sort: u.sort ?? "",
      activity: u.label || "",
      question_no: u.question_no || "",
      word_count: u.word_count ?? "",
      page_start: u.page_start ?? "",
      page_end: u.page_end ?? "",
    });
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
      <p className="muted" style={{ fontSize: 15 }}>
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
            /* 옮길 교재도 **검색·영역으로 좁혀서** 고른다 — 교재가 쉰 권이면
               맨 목록에서는 눈으로 찾아야 했다 (다른 교재 고르는 자리와 같은 한 벌) */
            <BookPicker
              books={others}
              value=""
              placeholder="다른 교재로 이동…"
              width={170}
              disabled={pending}
              onChange={(tb) => {
                if (!tb) return;
                run(async () => {
                  const r = await moveUnitsToTextbook([...sel], tb);
                  setSel(new Set());
                  return r;
                });
              }}
            />
          )}
          <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      {/* 목록이면 **찾을 수 있어야 한다** — 단원이 백 줄이 넘는 교재가 있다 */}
      <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 8 }}>
        <input
          className="input input-sm"
          style={{ width: 180 }}
          placeholder="단원명 · 문제번호 검색"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(new Set()); }}
        />
        <span className="hint">
          {rows.length}개{(kw || onlyBare) && ` / 전체 ${all.length}개`}
        </span>
        {/* 쪽수도 문제번호도 없으면 그 단원은 **숙제 범위로 못 고른다** —
            목록에서는 「—」 라 눈에 안 띈다 */}
        {bareCount > 0 && (
          <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onlyBare}
              onChange={(e) => { setOnlyBare(e.target.checked); setSel(new Set()); }}
            />
            범위 없는 것만 ({bareCount})
          </label>
        )}
        {/* 접었을 때만 — 나무일 때는 고를 수 있게 해두면 눌러도 아무 일이 안 난다 */}
        {flat && (
          <select
            className="input input-sm"
            style={{ width: 96 }}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            title="목록 정렬"
          >
            <option value="sort">원래 순서</option>
            <option value="name">이름순</option>
            <option value="page_start">쪽수순</option>
          </select>
        )}
        {kw && (
          <span className="hint">찾는 중에는 대·중단원 겹침을 접어둡니다.</span>
        )}
      </div>

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
            <th style={{ width: 78 }}>페이지</th>
            <th style={{ width: 84 }}>활동</th>
            {isWord && <th style={{ width: 64 }}>단어</th>}
            <th style={{ width: 52 }}></th>
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
                      <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                        <input
                          className="input input-sm"
                          style={{ flex: 1 }}
                          value={draft.name}
                          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        />
                        <input
                          className="input input-sm"
                          style={{ width: 52, padding: "5px 4px" }}
                          placeholder="문제"
                          title="문제번호 — 모의고사처럼 단원이 없을 때 씁니다"
                          value={draft.question_no}
                          onChange={(e) => setDraft({ ...draft, question_no: e.target.value })}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                        <input
                          className="input input-sm"
                          style={{ width: 34, padding: "5px 4px" }}
                          value={draft.page_start}
                          onChange={(e) => setDraft({ ...draft, page_start: e.target.value })}
                        />
                        <input
                          className="input input-sm"
                          style={{ width: 34, padding: "5px 4px" }}
                          value={draft.page_end}
                          onChange={(e) => setDraft({ ...draft, page_end: e.target.value })}
                        />
                      </div>
                    </td>
                    <td>
                      {/* 교재마다 활동이 다르다 — 골라도 되고 직접 적어도 된다 */}
                      {/* datalist 는 아이폰에서 안 보인다 (C6) */}
                      <PickOrType
                        options={activities}
                        placeholder="없음"
                        value={draft.activity}
                        onChange={(e) => setDraft({ ...draft, activity: e.target.value })}
                      />
                    </td>
                    {isWord && (
                      <td>
                        <input
                          className="input input-sm"
                          style={{ width: 52, padding: "5px 4px" }}
                          inputMode="numeric"
                          placeholder={book?.word_range || "개수"}
                          title="이 소단원의 단어 개수. 비우면 교재 기본값을 씁니다"
                          value={draft.word_count}
                          onChange={(e) => setDraft({ ...draft, word_count: e.target.value })}
                        />
                      </td>
                    )}
                    <td>
                      <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                        <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending} style={{ padding: "4px 7px" }}>
                          저장
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)} style={{ padding: "4px 6px" }}>
                          취소
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ paddingLeft: 12 + depth * 20, fontWeight: depth === 0 ? 700 : 500 }}>
                      {u.name}
                      {u.question_no && (
                        <span className="tag tag-muted" style={{ marginLeft: 6, fontSize: 12 }}>
                          {u.question_no}번
                        </span>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>
                      {u.page_start
                        ? `${u.page_start}${u.page_end ? `–${u.page_end}` : ""}p`
                        : "—"}
                    </td>
                    <td className="muted">{u.label || "—"}</td>
                    {isWord && (
                      <td className="muted" style={{ fontSize: 13 }}>
                        {u.word_count
                          ? `${u.word_count}개`
                          : book?.word_range && !book?.words_irregular
                          ? <span className="hint">{book.word_range}개</span>
                          : "—"}
                      </td>
                    )}
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
      {rows.length === 0 && all.length > 0 && (
        <p className="hint" style={{ padding: "10px 2px", margin: 0 }}>
          조건에 맞는 단원이 없어요. {onlyBare ? "범위가 빠진 단원이 없습니다." : "검색어를 지워보세요."}
        </p>
      )}
    </>
  );
}
