"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudent, deleteStudents, updateStudentsStatus } from "./actions";
import StudentHistoryPanel from "./StudentHistory";

const STATUS = {
  prospect: { label: "예비", cls: "tag tag-sky" },
  enrolled: { label: "재원", cls: "tag tag-mint" },
  paused: { label: "휴원", cls: "tag tag-amber" },
  withdrawn: { label: "퇴원", cls: "tag tag-muted" },
};

// 표에 실제로 펼칠 열 (전 속성)
const COLS = [
  { key: "name", label: "이름", w: 84, strong: true },
  { key: "school", label: "학교", w: 84 },
  { key: "grade", label: "학년", w: 56 },
  { key: "birth_year", label: "생년월일", w: 118, type: "date" },
  { key: "gender", label: "성별", w: 62, type: "select", options: ["", "여", "남"] },
  { key: "student_phone", label: "학생 전화", w: 126 },
  { key: "parent_phone", label: "학부모 전화", w: 126 },
  { key: "status", label: "상태", w: 76, type: "status" },
  { key: "enrolled_on", label: "등원시작일", w: 118, type: "date" },
  { key: "electives", label: "선택과목", w: 130 },
  { key: "note", label: "특이사항", w: 140 },
  { key: "login_id", label: "아이디", w: 104, mono: true },
];

const STATUS_TABS = [
  ["enrolled", "재원"],
  ["all", "전체"],
  ["prospect", "예비"],
  ["paused", "휴원"],
  ["withdrawn", "퇴원"],
];

export default function StudentList({ students = [] }) {
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("enrolled");
  const [histId, setHistId] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const norm = (v) => (v || "").toString().toLowerCase();
  const kw = norm(q).trim();
  const shown = students.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (!kw) return true;
    return [s.name, s.school, s.grade, s.parent_phone, s.student_phone, s.login_id, s.note]
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
    const d = {};
    COLS.forEach(({ key }) => (d[key] = s[key] ?? ""));
    setDraft(d);
  }

  function saveEdit() {
    const id = editId;
    startTransition(async () => {
      const res = await updateStudent(id, draft);
      if (res?.error) alert(res.error);
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
      <p className="muted" style={{ padding: 18, margin: 0, fontSize: 13.5 }}>
        아직 학생이 없습니다. 위에서 학생을 추가하거나 엑셀로 올려보세요.
      </p>
    );
  }

  function cell(s, c) {
    const v = s[c.key];
    if (c.type === "status") {
      const st = STATUS[v] || STATUS.enrolled;
      return <span className={st.cls}>{st.label}</span>;
    }
    if (!v) return <span className="muted">—</span>;
    return v;
  }

  function editor(c) {
    if (c.type === "status") {
      return (
        <select
          className="input input-sm"
          value={draft.status || "enrolled"}
          onChange={(e) => setDraft({ ...draft, status: e.target.value })}
        >
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      );
    }
    if (c.type === "select") {
      return (
        <select
          className="input input-sm"
          value={draft[c.key] || ""}
          onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
        >
          {c.options.map((o) => (
            <option key={o} value={o}>{o || "—"}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        className="input input-sm"
        type={c.type === "date" ? "date" : "text"}
        value={draft[c.key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
      />
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 6, padding: "12px 16px 0", alignItems: "center" }}>
        <input
          className="input input-sm"
          style={{ width: 220 }}
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
        <span className="spacer" />
        <span className="hint">{shown.length}명 표시</span>
      </div>

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}명 선택</b>
          <select
            className="input input-sm"
            style={{ width: 120 }}
            defaultValue=""
            onChange={(e) => { runStatus(e.target.value); e.target.value = ""; }}
            disabled={pending}
          >
            <option value="">상태 변경…</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
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
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => el && (el.indeterminate = someChecked)}
                  onChange={toggleAll}
                />
              </th>
              {COLS.map((c) => (
                <th key={c.key} style={{ minWidth: c.w }}>{c.label}</th>
              ))}
              <th style={{ width: 86 }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const editing = editId === s.id;
              return (
                <Fragment key={s.id}>
                <tr>
                  <td>
                    <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggleOne(s.id)} />
                  </td>
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={!editing && c.mono ? "mono" : undefined}
                      style={!editing && c.strong ? { fontWeight: 700 } : undefined}
                    >
                      {editing ? editor(c) : cell(s, c)}
                    </td>
                  ))}
                  <td>
                    {editing ? (
                      <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                        <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>
                          저장
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(s)}>수정</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setHistId(histId === s.id ? null : s.id)}
                        >
                          {histId === s.id ? "기록 닫기" : "기록"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {histId === s.id && (
                  <tr>
                    <td colSpan={COLS.length + 2} style={{ background: "var(--surface-2)" }}>
                      <StudentHistoryPanel studentId={s.id} />
                    </td>
                  </tr>
                )}
                </Fragment>
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
