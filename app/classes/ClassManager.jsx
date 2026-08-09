"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateClass, deleteClasses, setClassStudents, archiveClass } from "./actions";
import { isArchived, termLabel } from "@/lib/classTerm";
import { WEEK_ORDER as DAYS } from "@/lib/day";

function timeLabel(s, e) {
  const cut = (t) => (t ? t.slice(0, 5) : "");
  if (!s && !e) return "";
  return `${cut(s)}${e ? `-${cut(e)}` : ""}`;
}

export default function ClassManager({
  classes = [],
  students = [],
  members = [],
  selectedId,
  today,
}) {
  const [showPast, setShowPast] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [q, setQ] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const selected = classes.find((c) => c.id === selectedId) || null;
  const assigned = new Set(
    members.filter((m) => m.class_id === selectedId).map((m) => m.student_id)
  );
  const [picked, setPicked] = useState(assigned);
  const [pickedFor, setPickedFor] = useState(selectedId);
  if (pickedFor !== selectedId) {
    setPickedFor(selectedId);
    setPicked(assigned);
  }

  // 학생이 이미 배정된 반 (중복 배정 확인용)
  const classOf = new Map();
  members.forEach((m) => {
    if (!classOf.has(m.student_id)) classOf.set(m.student_id, []);
    classOf.get(m.student_id).push(m.class_id);
  });

  function toggleOne(id) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  }
  // 끝난 특강은 아래로 접는다. 지금 열어둔 반은 끝났어도 계속 보인다.
  const pastList = classes.filter((c) => isArchived(c, today) && c.id !== selectedId);
  const pastIds = new Set(pastList.map((c) => c.id));
  const liveList = classes.filter((c) => !pastIds.has(c.id));
  const shown = showPast ? [...liveList, ...pastList] : liveList;

  const allClassesChecked = liveList.length > 0 && liveList.every((c) => sel.has(c.id));
  function toggleAllClasses() {
    setSel(allClassesChecked ? new Set() : new Set(liveList.map((c) => c.id)));
  }

  function runArchive(c) {
    const on = !c.archived_at;
    startTransition(async () => {
      const res = await archiveClass(c.id, on);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function startEdit(c) {
    setEditId(c.id);
    setDraft({
      name: c.name || "",
      days: c.days || [],
      start_time: (c.start_time || "").slice(0, 5),
      end_time: (c.end_time || "").slice(0, 5),
      level: c.level || "",
      category: c.category || "정규반",
      school_level: c.school_level || "",
      room: c.room || "",
      capacity: c.capacity ?? 5,
      starts_on: c.starts_on || "",
      ends_on: c.ends_on || "",
    });
  }

  function saveEdit() {
    const id = editId;
    startTransition(async () => {
      const res = await updateClass(id, draft);
      if (res?.error) alert(res.error);
      setEditId(null);
      router.refresh();
    });
  }

  function runDelete() {
    const ids = [...sel];
    if (ids.length === 0) return;
    if (!confirm(`선택한 반 ${ids.length}개를 삭제할까요? 학생 배정도 함께 지워집니다.`)) return;
    startTransition(async () => {
      await deleteClasses(ids);
      setSel(new Set());
      router.refresh();
    });
  }

  function saveMembers() {
    startTransition(async () => {
      const res = await setClassStudents(selectedId, [...picked]);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function toggleDay(d) {
    const days = draft.days || [];
    setDraft({
      ...draft,
      days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d],
    });
  }

  const dirty =
    picked.size !== assigned.size || [...picked].some((id) => !assigned.has(id));

  const kw = q.trim().toLowerCase();
  const visibleStudents = students.filter((s) => {
    if (onlyPicked && !picked.has(s.id)) return false;
    if (!kw) return true;
    return [s.name, s.school, s.grade]
      .filter(Boolean)
      .some((v) => v.toString().toLowerCase().includes(kw));
  });

  return (
    <div className="grid-side" style={{ marginTop: 14 }}>
      {/* 반 목록 */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 0" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={allClassesChecked}
              ref={(el) => el && (el.indeterminate = sel.size > 0 && !allClassesChecked)}
              onChange={toggleAllClasses}
              title="전체 선택"
            />
            반 목록{" "}
            <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
              {liveList.length}개
            </span>
          </h2>
        </div>

        {sel.size > 0 && (
          <div className="bulkbar">
            <b>{sel.size}개 선택</b>
            <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>
              삭제
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>
              선택 해제
            </button>
          </div>
        )}

        {classes.length === 0 ? (
          <p className="muted" style={{ padding: 16, margin: 0, fontSize: 13.5 }}>
            아직 반이 없습니다. 위에서 반을 추가해보세요.
          </p>
        ) : (
          <table className="tbl" style={{ marginTop: 10 }}>
            <tbody>
              {shown.map((c) => {
                const editing = editId === c.id;
                const count = members.filter((m) => m.class_id === c.id).length;
                if (editing) {
                  return (
                    <tr key={c.id}>
                      <td colSpan={3}>
                        <div className="stack" style={{ gap: 8 }}>
                          <input
                            className="input input-sm"
                            value={draft.name}
                            placeholder="반 이름"
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          />
                          <div className="row" style={{ gap: 4 }}>
                            {DAYS.map((d) => (
                              <button
                                key={d}
                                type="button"
                                className={`btn btn-sm ${(draft.days || []).includes(d) ? "btn-primary" : "btn-ghost"}`}
                                style={{ padding: "4px 8px" }}
                                onClick={() => toggleDay(d)}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                          <div className="row" style={{ gap: 6 }}>
                            <input
                              className="input input-sm"
                              type="time"
                              style={{ width: 108 }}
                              value={draft.start_time}
                              onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
                            />
                            <input
                              className="input input-sm"
                              type="time"
                              style={{ width: 108 }}
                              value={draft.end_time}
                              onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
                            />
                          </div>
                          <div className="editgrid">
                            <select
                              className="input input-sm"
                              value={draft.category}
                              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                            >
                              <option value="정규반">정규반</option>
                              <option value="특강">특강</option>
                            </select>
                            <select
                              className="input input-sm"
                              value={draft.level}
                              onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                            >
                              <option value="">레벨</option>
                              <option value="기본반">기본반</option>
                              <option value="심화반">심화반</option>
                            </select>
                            <select
                              className="input input-sm"
                              value={draft.school_level}
                              onChange={(e) => setDraft({ ...draft, school_level: e.target.value })}
                            >
                              <option value="">초중고</option>
                              <option value="초">초</option>
                              <option value="중">중</option>
                              <option value="고">고</option>
                            </select>
                            <input
                              className="input input-sm"
                              placeholder="강의실"
                              value={draft.room}
                              onChange={(e) => setDraft({ ...draft, room: e.target.value })}
                            />
                            <input
                              className="input input-sm"
                              placeholder="정원"
                              inputMode="numeric"
                              value={draft.capacity}
                              onChange={(e) => setDraft({ ...draft, capacity: e.target.value })}
                            />
                          </div>
                          {/* 기간 — 종강일을 넣으면 그날 지나서 알아서 내려간다 */}
                          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span className="hint" style={{ fontSize: 12 }}>기간</span>
                            <input
                              className="input input-sm"
                              type="date"
                              style={{ width: 148 }}
                              value={draft.starts_on || ""}
                              onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
                            />
                            <span className="muted" style={{ fontSize: 12 }}>~</span>
                            <input
                              className="input input-sm"
                              type="date"
                              style={{ width: 148 }}
                              value={draft.ends_on || ""}
                              onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })}
                            />
                            <span className="hint" style={{ fontSize: 11.5 }}>
                              정규반은 비워두세요 (무기한)
                            </span>
                          </div>
                          <div className="row" style={{ gap: 6 }}>
                            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>
                              저장
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                              취소
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const term = termLabel(c, today);
                const done = isArchived(c, today);
                return (
                  <tr
                    key={c.id}
                    style={{
                      ...(c.id === selectedId ? { background: "var(--surface-2)" } : null),
                      ...(done ? { opacity: 0.55 } : null),
                    }}
                  >
                    <td style={{ width: 30 }}>
                      <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </td>
                    <td>
                      <a
                        href={`/classes?c=${c.id}`}
                        style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}
                      >
                        {c.name}
                      </a>
                      {term && (
                        <span
                          className={`tag ${term.tone === "amber" ? "tag-amber" : ""}`}
                          style={{ marginLeft: 6, fontSize: 11 }}
                        >
                          {term.text}
                        </span>
                      )}
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {[
                          (c.days || []).join("·"),
                          timeLabel(c.start_time, c.end_time),
                          c.room,
                          c.level,
                          c.category !== "정규반" ? c.category : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </td>
                    <td style={{ width: 86, textAlign: "right" }}>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {count}/{c.capacity ?? "-"}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginLeft: 4 }}
                        onClick={() => startEdit(c)}
                      >
                        수정
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginLeft: 2 }}
                        disabled={pending}
                        title={
                          c.archived_at
                            ? "다시 목록에 올립니다"
                            : "목록에서만 내립니다. 기록은 그대로 남습니다."
                        }
                        onClick={() => runArchive(c)}
                      >
                        {c.archived_at ? "되살리기" : "보관"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* 끝난 특강 — 지우지 않고 접어둔다 */}
        {pastList.length > 0 && (
          <div style={{ padding: "8px 16px 14px" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPast(!showPast)}>
              {showPast ? "지난 특강 접기" : `지난 특강 ${pastList.length}개 보기`}
            </button>
          </div>
        )}
      </div>

      {/* 학생 배정 */}
      <div className="card">
        {selected ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                {selected.name} · 학생 배정{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
                  {picked.size}/{selected.capacity ?? "-"}명
                </span>
              </h2>
              <button
                className="btn btn-primary btn-sm"
                onClick={saveMembers}
                disabled={pending || !dirty}
              >
                {dirty ? "배정 저장" : "저장됨"}
              </button>
            </div>
            <p className="muted" style={{ margin: "6px 0 10px", fontSize: 12.5 }}>
              체크한 학생이 이 반의 명단이 됩니다. 다른 반에 이미 있는 학생은 반 이름이 함께 표시돼요.
            </p>

            <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 8 }}>
              <input
                className="input input-sm"
                style={{ width: 150 }}
                placeholder="학생 검색"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPicked(new Set([...picked, ...visibleStudents.map((s) => s.id)]))}
              >
                보이는 학생 전체 선택
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const n = new Set(picked);
                  visibleStudents.forEach((s) => n.delete(s.id));
                  setPicked(n);
                }}
              >
                전체 해제
              </button>
              <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={onlyPicked}
                  onChange={(e) => setOnlyPicked(e.target.checked)}
                />
                배정된 학생만
              </label>
            </div>

            <div style={{ maxHeight: 460, overflowY: "auto" }}>
              <table className="tbl">
                <tbody>
                  {visibleStudents.map((s) => {
                    const inOther = (classOf.get(s.id) || []).filter((cid) => cid !== selectedId);
                    const otherNames = inOther
                      .map((cid) => classes.find((c) => c.id === cid)?.name)
                      .filter(Boolean);
                    return (
                      <tr key={s.id}>
                        <td style={{ width: 30 }}>
                          <input
                            type="checkbox"
                            checked={picked.has(s.id)}
                            onChange={() => {
                              const next = new Set(picked);
                              next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                              setPicked(next);
                            }}
                          />
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>{" "}
                          <span className="muted" style={{ fontSize: 12 }}>
                            {[s.school, s.grade].filter(Boolean).join(" ")}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {otherNames.length > 0 && (
                            <span className="tag tag-muted">{otherNames.join(", ")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            왼쪽에서 반을 선택하면 학생을 배정할 수 있어요.
          </p>
        )}

      </div>
    </div>
  );
}
