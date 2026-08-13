"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addTodo, updateTodo, setTodoStatus, moveTodos, deleteTodos,
  addCategory, deleteCategory,
} from "./actions";
import { addDays, dayLabel as fmtDay, todaySeoul } from "@/lib/day";
import { moveKind, toggleChecklistLine } from "@/app/tasks/actions";
import TodoKanban from "./TodoKanban";
import { PRIORITY } from "./priority";

const COLORS = ["sky", "lav", "mint", "amber", "muted"];

function today() {
  return todaySeoul();
}

const dayLabel = fmtDay;

export default function TodoBoard({ todos = [], categories = [], unavailable = false }) {
  // **여기 있으면 안 되는 것.**
  //   노션에서 옮겨올 때 학사일정 몇 줄이 할일로 들어왔다. 학사일정은
  //   「내가 처리할 것」 이 아니라 「그날 그런 일이 있다」 라서 일정이 맞다.
  //   지우고 새로 만들면 메모가 날아가니, 갈래만 바꿔서 옮긴다.
  const misplaced = todos.filter(
    (t) => t.status === "open" && /학사일정|학교행사|휴강/.test(t.category || "")
  );
  const [sel, setSel] = useState(() => new Set());
  const [filter, setFilter] = useState("open");
  // 스무 개가 넘는 목록이라 **목록이 기본**이다 — 칸반은 골라서 켠다
  const [view, setView] = useState("list");
  const [catId, setCatId] = useState("");
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [manageCat, setManageCat] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", parentId: "", color: "muted" });
  const [movePending, startMove] = useTransition();
  const [form, setForm] = useState({
    title: "", categoryId: "", dueOn: today(), dueTime: "", priority: 0, note: "", noDue: false,
    parentId: "",
  });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const now = today();
  const week = addDays(now, 7);

  const shown = todos.filter((t) => {
    if (catId && t.todo_category_id !== catId) return false;
    if (filter === "open") return t.status === "open";
    if (filter === "today") return t.status === "open" && !t.no_due && t.due_on <= now;
    if (filter === "week") return t.status === "open" && !t.no_due && t.due_on > now && t.due_on <= week;
    if (filter === "late") return t.status === "open" && !t.no_due && t.due_on < now;
    if (filter === "nodue") return t.status === "open" && t.no_due;
    if (filter === "done") return t.status === "done";
    return true;
  });

  const counts = {
    open: todos.filter((t) => t.status === "open").length,
    today: todos.filter((t) => t.status === "open" && !t.no_due && t.due_on <= now).length,
    late: todos.filter((t) => t.status === "open" && !t.no_due && t.due_on < now).length,
    nodue: todos.filter((t) => t.status === "open" && t.no_due).length,
    done: todos.filter((t) => t.status === "done").length,
  };

  const catById = new Map(categories.map((c) => [c.id, c]));
  const roots = categories.filter((c) => !c.parent_id);
  const childrenOf = (id) => categories.filter((c) => c.parent_id === id);
  const countOf = (id) =>
    todos.filter((t) => t.status === "open" && t.todo_category_id === id).length;

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }
  function toggleOne(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          할일을 쓰려면 Supabase에서 <b>0020 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  return (
    <>
      {misplaced.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="notice">
            <b>학사일정 {misplaced.length}건이 할일에 들어와 있어요.</b>{" "}
            학사일정은 「그날 그런 일이 있다」 이지 「내가 처리할 것」 이 아니라 일정이 맞습니다.
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={movePending}
                onClick={() => {
                  if (!confirm(`${misplaced.length}건을 일정으로 옮길까요?\n적어두신 메모는 그대로 남습니다.`)) return;
                  startMove(async () => {
                    const res = await moveKind(misplaced.map((t) => t.id), "schedule");
                    if (res?.error) alert(res.error);
                    router.refresh();
                  });
                }}
              >
                일정으로 옮기기
              </button>
              {/* **어디서 온 것인지 그대로 보여준다.**
                  제가 「노션에서 온 것」 이라고 단정했다가 원장님이 「그럼
                  나이스 자료가 아니야?」 라고 물으셨다. 짐작을 말하지 말고
                  줄에 적힌 것을 보여드리는 것이 맞다. */}
              <span className="hint" style={{ alignSelf: "center" }}>
                {misplaced.slice(0, 4).map((t) =>
                  `${t.title}${t.source ? ` (${t.source})` : ""}`
                ).join(" · ")}
                {misplaced.length > 4 && ` 외 ${misplaced.length - 4}건`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 빠른 추가 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label className="label">할 일</label>
            <input
              className="input input-sm"
              placeholder="예: 8월 특강 교재 주문"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && form.title.trim()) {
                  run(async () => {
                    const r = await addTodo(form);
                    setForm({ ...form, title: "", note: "" });
                    return r;
                  });
                }
              }}
            />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="label">분류</label>
            <select
              className="input input-sm"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">—</option>
              {roots.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name}</option>
                  {childrenOf(c.id).map((s) => (
                    <option key={s.id} value={s.id}>　{s.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 110 }}>
            <label className="label">중요도</label>
            <select
              className="input input-sm"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value, 10) })}
            >
              {PRIORITY.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 145 }}>
            <label className="label">마감</label>
            <input
              className="input input-sm"
              type="date"
              value={form.dueOn}
              disabled={form.noDue}
              onChange={(e) => setForm({ ...form, dueOn: e.target.value })}
            />
          </div>
          <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", paddingBottom: 6 }}>
            <input
              type="checkbox"
              checked={form.noDue}
              onChange={(e) => setForm({ ...form, noDue: e.target.checked })}
            />
            마감 없음
          </label>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginBottom: 1 }}
            disabled={pending || !form.title.trim()}
            onClick={() =>
              run(async () => {
                const r = await addTodo(form);
                setForm({ ...form, title: "", note: "" });
                return r;
              })
            }
          >
            추가
          </button>
        </div>
      </div>

      {/* 분류 */}
      <div className="row" style={{ gap: 4, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className={`btn btn-sm ${!catId ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setCatId("")}
        >
          전체
        </button>
        {roots.map((c) => (
          <span key={c.id} className="row" style={{ gap: 2 }}>
            <button
              className={`btn btn-sm ${catId === c.id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setCatId(c.id)}
            >
              {c.name} {countOf(c.id) > 0 && countOf(c.id)}
            </button>
            {childrenOf(c.id).map((s) => (
              <button
                key={s.id}
                className={`btn btn-sm ${catId === s.id ? "btn-primary" : "btn-ghost"}`}
                style={{ padding: "3px 8px", fontSize: 12.5 }}
                onClick={() => setCatId(s.id)}
              >
                {s.name} {countOf(s.id) > 0 && countOf(s.id)}
              </button>
            ))}
          </span>
        ))}
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setManageCat(!manageCat)}>
          분류 관리
        </button>
      </div>

      {manageCat && (
        <div className="card card-tight" style={{ marginTop: 8 }}>
          <div className="row" style={{ gap: 6, alignItems: "flex-end" }}>
            <div className="field" style={{ width: 160 }}>
              <label className="label">새 분류</label>
              <input
                className="input input-sm"
                value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              />
            </div>
            <div className="field" style={{ width: 160 }}>
              <label className="label">상위 분류</label>
              <select
                className="input input-sm"
                value={newCat.parentId}
                onChange={(e) => setNewCat({ ...newCat, parentId: e.target.value })}
              >
                <option value="">없음 (큰 분류)</option>
                {roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ width: 110 }}>
              <label className="label">색</label>
              <select
                className="input input-sm"
                value={newCat.color}
                onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
              >
                {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ marginBottom: 1 }}
              disabled={pending || !newCat.name.trim()}
              onClick={() =>
                run(async () => {
                  const r = await addCategory(newCat.name, newCat.parentId, newCat.color);
                  setNewCat({ name: "", parentId: "", color: "muted" });
                  return r;
                })
              }
            >
              분류 추가
            </button>
          </div>
          <div className="row" style={{ gap: 4, marginTop: 10 }}>
            {categories.map((c) => (
              <button
                key={c.id}
                className={`hwchip`}
                onClick={() => {
                  if (!confirm(`${c.name} 분류를 목록에서 숨길까요? (할일은 남습니다)`)) return;
                  run(() => deleteCategory(c.id));
                }}
              >
                {c.parent_id ? "└ " : ""}{c.name} ✕
              </button>
            ))}
          </div>
        </div>
      )}

      {/**
        * **목록이냐 칸반이냐** (원장님, 2026-08-09 — academy-video 벤치마킹).
        *
        * 둘 중 하나를 고르는 게 아니라 **둘 다 둔다.** 칸반은 「지금 뭘 하고
        * 있나」 를 보는 데 좋고, 목록은 스무 개 넘는 것을 훑고 골라서 한꺼번에
        * 처리하는 데 좋다. 원장님 할일은 스무 개가 넘으므로 목록이 기본이다.
        */}
      <div className="row" style={{ gap: 4, marginTop: 10 }}>
        {[["list", "목록"], ["kanban", "칸반"]].map(([k, label]) => (
          <button
            key={k}
            className={`btn btn-sm ${view === k ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView(k)}
          >
            {label}
          </button>
        ))}
        <span className="spacer" />
        {view === "kanban" && (
          <span className="hint" style={{ fontSize: 12.5 }}>
            끌어서 옮기거나, 카드의 단추를 누르세요.
          </span>
        )}
      </div>

      {view === "kanban" ? (
        <TodoKanban
          todos={todos}
          categories={categories}
          catId={catId}
          started={todos.some((t) => "started_at" in t)}
        />
      ) : (
      <>
      {/* 상태 필터 */}
      <div className="row" style={{ gap: 4, marginTop: 10 }}>
        {[
          ["open", `할 것 ${counts.open}`],
          ["today", `오늘까지 ${counts.today}`],
          ["late", `지남 ${counts.late}`],
          ["week", "이번 주"],
          ["nodue", `마감 없음 ${counts.nodue}`],
          ["done", `끝냄 ${counts.done}`],
          ["all", `전체 ${todos.length}`],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 골라서 한 번에 — 전체 선택은 **지금 보이는 것**만이다.
          걸러놓고 전체를 눌렀는데 안 보이던 것까지 처리되면 안 된다. */}
      <div className="bulkbar" style={{ marginTop: 10 }}>
        <label className="row" style={{ gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={shown.length > 0 && shown.every((t) => sel.has(t.id))}
            ref={(el) => {
              if (el) el.indeterminate = sel.size > 0 && !shown.every((t) => sel.has(t.id));
            }}
            disabled={shown.length === 0}
            onChange={() => {
              const allOn = shown.length > 0 && shown.every((t) => sel.has(t.id));
              const n = new Set(sel);
              shown.forEach((t) => (allOn ? n.delete(t.id) : n.add(t.id)));
              setSel(n);
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 700 }}>보이는 {shown.length}개 전체</span>
        </label>
        {sel.size === 0 && (
          <span className="hint" style={{ fontSize: 12.5 }}>
            왼쪽 칸을 눌러 고르면 한 번에 처리할 수 있어요.
          </span>
        )}
      </div>

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}개 선택</b>
          <button className="btn btn-ghost btn-sm" disabled={pending}
            onClick={() => run(async () => { const r = await setTodoStatus([...sel], "done"); setSel(new Set()); return r; })}>
            끝냄
          </button>
          <button className="btn btn-ghost btn-sm" disabled={pending}
            onClick={() => run(async () => { const r = await setTodoStatus([...sel], "open"); setSel(new Set()); return r; })}>
            다시 할 것
          </button>
          <button className="btn btn-ghost btn-sm" disabled={pending}
            onClick={() => run(async () => { const r = await moveTodos([...sel], now); setSel(new Set()); return r; })}>
            오늘로
          </button>
          <button className="btn btn-ghost btn-sm" disabled={pending}
            onClick={() => run(async () => { const r = await moveTodos([...sel], addDays(now, 1)); setSel(new Set()); return r; })}>
            내일로
          </button>
          <input className="input input-sm" type="date" style={{ width: 140 }}
            onChange={(e) => e.target.value && run(async () => {
              const r = await moveTodos([...sel], e.target.value); setSel(new Set()); return r;
            })} />
          <button className="btn btn-ghost btn-sm" disabled={pending}
            onClick={() => {
              if (!confirm(`${sel.size}개를 삭제할까요?`)) return;
              run(async () => { const r = await deleteTodos([...sel]); setSel(new Set()); return r; });
            }}>
            삭제
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
        {shown.length === 0 ? (
          <p className="muted" style={{ padding: 16, margin: 0, fontSize: 15 }}>
            해당하는 할 일이 없어요.
          </p>
        ) : (
          shown.map((t) => {
            const editing = editId === t.id;
            const late = t.status === "open" && !t.no_due && t.due_on < now;
            const cat = catById.get(t.todo_category_id);
            const pr = PRIORITY.find((p) => p.v === t.priority) || PRIORITY[0];
            return (
              <div className="stuRow" key={t.id}>
                <div className="row" style={{ gap: 8, alignItems: "center", padding: "10px 16px" }}>
                  <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleOne(t.id)} />
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    title="끝냄"
                    onChange={(e) => run(() => setTodoStatus([t.id], e.target.checked ? "done" : "open"))}
                  />
                  {t.no_due ? (
                    <span className="tag tag-muted" style={{ minWidth: 66, textAlign: "center" }}>마감 없음</span>
                  ) : (
                    <span className={`tag ${late ? "tag-amber" : "tag-muted"}`} style={{ minWidth: 66, textAlign: "center" }}>
                      {dayLabel(t.due_on)}
                    </span>
                  )}
                  {t.due_time && <span className="hint">{t.due_time.slice(0, 5)}</span>}
                  <b style={{
                    fontSize: 15,
                    textDecoration: t.status === "done" ? "line-through" : "none",
                    opacity: t.status === "done" ? 0.6 : 1,
                  }}>
                    {t.title}
                  </b>
                  {cat && <span className={`tag tag-${cat.color || "muted"}`}>{cat.name}</span>}
                  {t.priority > 0 && <span className={`tag ${pr.cls}`}>{pr.label}</span>}
                  {t.auto_key && (
                    <span className="tag tag-muted" title="숙제를 배정할 때 앱이 만든 할일입니다">
                      자동
                    </span>
                  )}
                  {/* 하위목록 진행 — 원장님, 2026-08-11 「할일의 하위목록을
                      만들 수 있어? 되풀이 할일 포함」 (0117) */}
                  {t.checklist && (() => {
                    const lines = t.checklist.split("\n").filter(Boolean);
                    const doneN = lines.filter((l) => (t.checklist_done || []).includes(l)).length;
                    return (
                      <span className={`tag ${doneN === lines.length ? "tag-mint" : "tag-muted"}`}>
                        {doneN}/{lines.length}
                      </span>
                    );
                  })()}
                  <span className="spacer" />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (editing) return setEditId(null);
                      setEditId(t.id);
                      setDraft({
                        title: t.title,
                        todo_category_id: t.todo_category_id || "",
                        priority: t.priority || 0,
                        due_on: t.due_on || now,
                        due_time: (t.due_time || "").slice(0, 5),
                        no_due: !!t.no_due,
                        note: t.note || "",
                        checklist: t.checklist || "",
                      });
                    }}
                  >
                    {editing ? "닫기" : "수정"}
                  </button>
                </div>

                {!editing && t.note && (
                  <div className="hint" style={{ padding: "0 16px 10px 78px" }}>{t.note}</div>
                )}

                {/* **하위목록 — 누르면 그 자리에서 체크된다** (0117).
                    담당자·마감일은 따로 없다, 목록을 적고 하나씩 체크만. */}
                {!editing && t.checklist && (
                  <div className="stack" style={{ gap: 3, padding: "0 16px 10px 78px" }}>
                    {t.checklist.split("\n").filter(Boolean).map((line) => {
                      const on = (t.checklist_done || []).includes(line);
                      return (
                        <label
                          key={line}
                          className="row"
                          style={{ gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14.5 }}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={pending}
                            onChange={(e) => run(() => toggleChecklistLine(t.id, line, e.target.checked))}
                          />
                          <span style={{ textDecoration: on ? "line-through" : "none", opacity: on ? 0.6 : 1 }}>
                            {line}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {editing && (
                  <div className="stuPanel">
                    <div className="editgrid">
                      <div className="field" style={{ gridColumn: "span 2" }}>
                        <label className="label">할 일</label>
                        <input className="input input-sm" value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">분류</label>
                        <select className="input input-sm" value={draft.todo_category_id}
                          onChange={(e) => setDraft({ ...draft, todo_category_id: e.target.value })}>
                          <option value="">—</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.parent_id ? "　" : ""}{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">중요도</label>
                        <select className="input input-sm" value={draft.priority}
                          onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value, 10) })}>
                          {PRIORITY.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">마감</label>
                        <input className="input input-sm" type="date" value={draft.due_on}
                          disabled={draft.no_due}
                          onChange={(e) => setDraft({ ...draft, due_on: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">시간</label>
                        <input className="input input-sm" type="time" value={draft.due_time}
                          onChange={(e) => setDraft({ ...draft, due_time: e.target.value })} />
                      </div>
                    </div>
                    <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={draft.no_due}
                        onChange={(e) => setDraft({ ...draft, no_due: e.target.checked })} />
                      마감 없음
                    </label>
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="label">메모</label>
                      <textarea className="input input-sm" rows={2} value={draft.note}
                        onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </div>
                    {/* 하위목록 — 한 줄에 하나, 담당자·마감일은 따로 없다 (0117) */}
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="label">하위목록 (한 줄에 하나)</label>
                      <textarea
                        className="input input-sm"
                        rows={3}
                        style={{ whiteSpace: "pre-wrap" }}
                        placeholder={"예)\n청구서 뽑기\n문자 발송\n미납자 확인"}
                        value={draft.checklist}
                        onChange={(e) => setDraft({ ...draft, checklist: e.target.value })}
                      />
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 10 }}>
                      <button className="btn btn-primary btn-sm" disabled={pending}
                        onClick={() => run(async () => {
                          const r = await updateTodo(t.id, draft);
                          setEditId(null);
                          return r;
                        })}>저장</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      </>
      )}
    </>
  );
}
