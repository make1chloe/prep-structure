"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudent, deleteStudents, updateStudentsStatus } from "./actions";

const STATUS = {
  prospect: { label: "예비", cls: "tag tag-sky" },
  enrolled: { label: "재원", cls: "tag tag-mint" },
  paused: { label: "휴원", cls: "tag tag-amber" },
  withdrawn: { label: "퇴원", cls: "tag tag-muted" },
};

export default function StudentList({ students = [] }) {
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("enrolled");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const norm = (v) => (v || "").toString().toLowerCase();
  const kw = norm(q).trim();
  const shown = students.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (!kw) return true;
    return [s.name, s.school, s.grade, s.parent_phone, s.student_phone, s.login_id]
      .some((v) => norm(v).includes(kw));
  });

  const allChecked = shown.length > 0 && sel.size === shown.length;
  const someChecked = sel.size > 0 && !allChecked;

  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(shown.map((s) => s.id)));
  }
  function toggleOne(id) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  }

  function startEdit(s) {
    setEditId(s.id);
    setDraft({
      name: s.name || "",
      school: s.school || "",
      grade: s.grade || "",
      student_phone: s.student_phone || "",
      parent_phone: s.parent_phone || "",
      status: s.status || "enrolled",
      login_id: s.login_id || "",
    });
  }

  function saveEdit() {
    const id = editId;
    startTransition(async () => {
      await updateStudent(id, draft);
      setEditId(null);
      router.refresh();
    });
  }

  function runDelete() {
    const ids = [...sel];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}명을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    startTransition(async () => {
      await deleteStudents(ids);
      setSel(new Set());
      router.refresh();
    });
  }

  function runStatus(status) {
    const ids = [...sel];
    if (ids.length === 0 || !status) return;
    startTransition(async () => {
      await updateStudentsStatus(ids, status);
      setSel(new Set());
      router.refresh();
    });
  }

  if (students.length === 0) {
    return (
      <div style={{ padding: 18 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          아직 학생이 없습니다. 왼쪽에서 첫 학생을 추가해보세요.
        </p>
      </div>
    );
  }

  const STATUS_TABS = [
    ["enrolled", "재원"],
    ["all", "전체"],
    ["prospect", "예비"],
    ["paused", "휴원"],
    ["withdrawn", "퇴원"],
  ];

  return (
    <>
      <div className="row" style={{ gap: 6, padding: "10px 18px 0", alignItems: "center" }}>
        <input
          className="input input-sm"
          style={{ flex: 1, minWidth: 140 }}
          placeholder="이름 · 학교 · 연락처 검색"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(new Set()); }}
        />
        {STATUS_TABS.map(([k, label]) => {
          const n = k === "all" ? students.length : students.filter((s) => s.status === k).length;
          if (n === 0 && k !== "enrolled" && k !== "all") return null;
          return (
            <button
              key={k}
              className={`btn btn-sm ${statusFilter === k ? "btn-primary" : "btn-ghost"}`}
              onClick={() => { setStatusFilter(k); setSel(new Set()); }}
            >
              {label} {n}
            </button>
          );
        })}
      </div>

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}명 선택</b>
          <select
            className="input"
            style={{ width: 120, padding: "6px 8px" }}
            defaultValue=""
            onChange={(e) => {
              runStatus(e.target.value);
              e.target.value = "";
            }}
            disabled={pending}
          >
            <option value="">상태 변경…</option>
            <option value="prospect">예비</option>
            <option value="enrolled">재원</option>
            <option value="paused">휴원</option>
            <option value="withdrawn">퇴원</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>
            삭제
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>
            선택 해제
          </button>
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
              <th>이름</th>
              <th>학교·학년</th>
              <th>상태</th>
              <th>학부모</th>
              <th>로그인 아이디</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const st = STATUS[s.status] || STATUS.enrolled;
              const editing = editId === s.id;
              return (
                <tr key={s.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={sel.has(s.id)}
                      onChange={() => toggleOne(s.id)}
                    />
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
                        <div className="row" style={{ gap: 4 }}>
                          <input
                            className="input input-sm"
                            style={{ width: 80 }}
                            value={draft.school}
                            onChange={(e) => setDraft({ ...draft, school: e.target.value })}
                          />
                          <input
                            className="input input-sm"
                            style={{ width: 52 }}
                            value={draft.grade}
                            onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
                          />
                        </div>
                      </td>
                      <td>
                        <select
                          className="input input-sm"
                          value={draft.status}
                          onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                        >
                          <option value="prospect">예비</option>
                          <option value="enrolled">재원</option>
                          <option value="paused">휴원</option>
                          <option value="withdrawn">퇴원</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="input input-sm"
                          value={draft.parent_phone}
                          onChange={(e) => setDraft({ ...draft, parent_phone: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="input input-sm"
                          value={draft.login_id}
                          onChange={(e) => setDraft({ ...draft, login_id: e.target.value })}
                        />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={saveEdit}
                            disabled={pending}
                          >
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
                      <td style={{ fontWeight: 700 }}>{s.name}</td>
                      <td className="muted">
                        {[s.school, s.grade].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td>
                        <span className={st.cls}>{st.label}</span>
                      </td>
                      <td className="muted">{s.parent_phone || "—"}</td>
                      <td className="mono">{s.login_id || "—"}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(s)}>
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
        {shown.length === 0 && (
          <p className="muted" style={{ padding: 16, margin: 0, fontSize: 13.5 }}>
            조건에 맞는 학생이 없어요.
          </p>
        )}
      </div>
    </>
  );
}
