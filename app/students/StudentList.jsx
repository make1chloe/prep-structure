"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudent, deleteStudents, updateStudentsStatus, linkSiblings, unlinkSibling } from "./actions";
import StudentHistoryPanel from "./StudentHistory";
import LinkBox from "./LinkBox";
import NoteBox from "./NoteBox";
import StudentBooks from "@/app/today/StudentBooks";
import WordTestBox from "./WordTestBox";

const STATUS = {
  prospect: { label: "예비", cls: "tag tag-sky" },
  enrolled: { label: "재원", cls: "tag tag-mint" },
  paused: { label: "휴원", cls: "tag tag-amber" },
  withdrawn: { label: "퇴원", cls: "tag tag-muted" },
};

// 표에 펼칠 수 있는 열 — **전부 켜면 가로로 1400px 이 넘는다.**
// 그래서 기본으로는 매일 보는 것만 켜두고, 나머지는 「열 고르기」로 켠다.
// 켠 목록은 이 브라우저에 남는다 (계정마다 다른 게 아니라 화면 습관이다).
const DEFAULT_ON = ["name", "school", "grade", "status", "parent_phone", "books", "wordTest"];

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
  { key: "initPw", label: "비번", w: 76, type: "pw" },
  { key: "books", label: "교재", w: 130, type: "books" },
  { key: "wordTest", label: "단어시험", w: 130, type: "wordTest" },
  { key: "family", label: "형제", w: 96, type: "family" },
];

const STATUS_TABS = [
  ["enrolled", "재원"],
  ["all", "전체"],
  ["prospect", "예비"],
  ["paused", "휴원"],
  ["withdrawn", "퇴원"],
];

const COL_KEY = "chloe.students.cols";

export default function StudentList({ students = [], textbooks = [], defaultPass = 90 }) {
  // 어떤 열을 볼지 — 기본은 매일 보는 것만
  const [on, setOn] = useState(() => new Set(DEFAULT_ON));
  const [colBox, setColBox] = useState(false);
  const [wordId, setWordId] = useState(null);   // 단어시험 설정을 연 학생

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_KEY) || "null");
      if (Array.isArray(saved) && saved.length) setOn(new Set(saved));
    } catch { /* 저장된 게 깨졌으면 기본값 그대로 */ }
  }, []);

  const cols = COLS.filter((c) => on.has(c.key));

  function toggleCol(k) {
    const n = new Set(on);
    n.has(k) ? n.delete(k) : n.add(k);
    if (n.size === 0) return;          // 전부 끄면 표가 사라진다
    setOn(n);
    try { localStorage.setItem(COL_KEY, JSON.stringify([...n])); } catch { /* 사파리 비공개 */ }
  }
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("enrolled");
  const [histId, setHistId] = useState(null);
  const [linkId, setLinkId] = useState(null);   // 계정 연결 코드를 펼친 학생
  const [noteId, setNoteId] = useState(null);   // 상담일지를 펼친 학생
  const [bookId, setBookId] = useState(null);   // 교재를 펼친 학생
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const cellPwStatic = <span className="muted">—</span>;
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

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) alert(res.error);
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
    // 아직 0000 그대로인 계정 — 아이디가 규칙적이라 남이 열 수 있다
    // 같은 반이어도 교재는 학생마다 다르다 — 목록에서 바로 보이게
    // 교재는 **전부 보여준다.** "외 3" 이라고 줄여두면 무엇을 쓰는지 알려고
    // 매번 펼쳐야 한다. 어차피 학생마다 다른 것이라 그게 이 열의 쓸모다.
    if (c.type === "books") {
      const list = s.books || [];
      if (list.length === 0) return <span className="hint">없음</span>;
      return (
        <span className="row" style={{ gap: 3, flexWrap: "wrap" }}>
          {list.map((b) => (
            <span key={b.id} className="tag tag-muted" style={{ fontSize: 10.5 }}>
              {b.name}
            </span>
          ))}
        </span>
      );
    }

    // 형제자매 — 같은 집이면 이름을 보여준다
    if (c.type === "family") {
      if (!s.family_id) return <span className="muted">—</span>;
      const kin = students.filter((x) => x.family_id === s.family_id && x.id !== s.id);
      if (kin.length === 0) return <span className="muted">—</span>;
      return (
        <span className="row" style={{ gap: 3, flexWrap: "wrap" }}>
          {kin.map((x) => (
            <span key={x.id} className="tag tag-lav" style={{ fontSize: 10.5 }}>{x.name}</span>
          ))}
        </span>
      );
    }

    // 단어시험 — 몇 개씩 · 몇 % 통과 · 언제
    if (c.type === "wordTest") {
      const n = s.word_test_count;
      const cut = s.word_cut_pct;
      return (
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, padding: "2px 6px" }}
          onClick={() => setWordId(wordId === s.id ? null : s.id)}
        >
          {n ? `${n}개` : "범위대로"} · {cut ? `${cut}%` : "기본"} ·{" "}
          {s.word_when === "end" ? "끝" : "시작"}
        </button>
      );
    }
    if (c.type === "pw") {
      if (!s.login_id) return <span className="muted">—</span>;
      return v ? (
        <span className="tag tag-amber" title="아직 0000 입니다. 학생이 로그인하면 바꾸게 됩니다">
          0000
        </span>
      ) : (
        <span className="tag tag-mint">바꿈</span>
      );
    }
    if (c.type === "status") {
      const st = STATUS[v] || STATUS.enrolled;
      return <span className={st.cls}>{st.label}</span>;
    }
    if (!v) return <span className="muted">—</span>;
    return v;
  }

  function editor(c) {
    if (c.type === "pw" || c.type === "books" || c.type === "wordTest" || c.type === "family") return cellPwStatic;
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
        {/* 전부 켜면 가로로 1400px 이 넘는다. 매일 보는 것만 켜두고 나머지는 여기서 */}
        <button className="btn btn-ghost btn-sm" onClick={() => setColBox(!colBox)}>
          열 고르기 {cols.length}/{COLS.length}
        </button>
      </div>

      {colBox && (
        <div className="card card-tight" style={{ marginTop: 8 }}>
          <p className="hint" style={{ margin: "0 0 8px" }}>
            볼 것만 켜두세요. <b>이 브라우저에 기억됩니다.</b>
            끈 것도 학생 줄을 펼치면 「수정」에서 그대로 고칠 수 있어요.
          </p>
          <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
            {COLS.map((c) => (
              <button
                key={c.key}
                className={`hwchip ${on.has(c.key) ? "hw-next" : ""}`}
                onClick={() => toggleCol(c.key)}
              >
                {on.has(c.key) && <b>＋</b>} {c.label}
              </button>
            ))}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOn(new Set(DEFAULT_ON));
                try { localStorage.setItem(COL_KEY, JSON.stringify(DEFAULT_ON)); } catch { /* 무시 */ }
              }}
            >
              처음 상태로
            </button>
          </div>
        </div>
      )}

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}명 선택</b>
          {/* 형제가 둘 다 다니면 학부모는 계정 하나로 둘 다 봐야 한다 */}
          {sel.size >= 2 && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                const names = students.filter((s) => sel.has(s.id)).map((s) => s.name).join(", ");
                if (!confirm(`${names}\n\n이 학생들을 형제자매로 묶을까요?`)) return;
                run(async () => {
                  const r = await linkSiblings([...sel]);
                  if (!r?.error) setSel(new Set());
                  return r;
                });
              }}
            >
              형제로 묶기
            </button>
          )}
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
              {cols.map((c) => (
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
                  {cols.map((c) => (
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
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setNoteId(noteId === s.id ? null : s.id)}
                          title="상담·통화 내용을 남깁니다 (받아쓰기 됩니다)"
                        >
                          상담
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setBookId(bookId === s.id ? null : s.id)}
                          title="이 학생이 쓰는 교재 — 같은 반이어도 학생마다 다릅니다"
                        >
                          교재
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setLinkId(linkId === s.id ? null : s.id)}
                          title="학생이 자기 계정으로 로그인할 수 있게 코드를 뽑습니다"
                        >
                          계정
                        </button>
                        <a
                          className="btn btn-ghost btn-sm"
                          href={`/me?s=${s.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="이 학생에게 보이는 화면을 그대로 봅니다"
                        >
                          학생 화면
                        </a>
                        <a
                          className="btn btn-ghost btn-sm"
                          href={`/parent?s=${s.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="이 학생 학부모님께 보이는 화면을 그대로 봅니다"
                        >
                          학부모 화면
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
                {bookId === s.id && (
                  <tr>
                    <td colSpan={cols.length + 2} style={{ background: "var(--surface-2)" }}>
                      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <b style={{ fontSize: 13 }}>{s.name} 교재</b>
                        <span className="hint" style={{ fontSize: 11.5 }}>
                          같은 반이어도 학생마다 다릅니다. 여기서 바꾸면 숙제 배정·진도가 이 교재로 갑니다.
                        </span>
                      </div>
                      <StudentBooks
                        studentId={s.id}
                        myBooks={s.books || []}
                        textbooks={textbooks}
                      />
                    </td>
                  </tr>
                )}
                {wordId === s.id && (
                  <tr>
                    <td colSpan={cols.length + 2} style={{ background: "var(--surface-2)" }}>
                      <WordTestBox student={s} defaultPass={defaultPass} />
                    </td>
                  </tr>
                )}
                {noteId === s.id && (
                  <tr>
                    <td colSpan={cols.length + 2} style={{ background: "var(--surface-2)" }}>
                      <NoteBox studentId={s.id} name={s.name} />
                    </td>
                  </tr>
                )}
                {linkId === s.id && (
                  <tr>
                    <td colSpan={cols.length + 2} style={{ background: "var(--surface-2)" }}>
                      <LinkBox studentId={s.id} name={s.name} />
                    </td>
                  </tr>
                )}
                {histId === s.id && (
                  <tr>
                    <td colSpan={cols.length + 2} style={{ background: "var(--surface-2)" }}>
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
