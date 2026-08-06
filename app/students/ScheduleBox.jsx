"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStudentTask, listStudentTasks, removeStudentTask } from "./scheduleActions";
import { todaySeoul, longLabel } from "@/lib/day";

/**
 * **이 아이 일정** — 재원생 정보 안에서 바로 넣는다 (원장님, 2026-08-06).
 *
 * 보강, 개인 상담, 학교 행사로 빠지는 날 … 아이 하나에게만 해당하는 일정을
 * 넣으려고 할일 화면으로 나갔다 오면 흐름이 끊긴다. 끊기면 나중에 하게 되고,
 * 그 나중은 안 온다.
 *
 * 여기서 넣은 것은 **할일 화면 달력과 같은 줄**이다 (tasks). 그래서 아이와
 * 어머니 달력에도 그대로 뜨고, 구글 캘린더 구독에도 같이 나간다.
 */
const KINDS = ["보강", "상담", "결석", "시험", "특강", "수업"];

export default function ScheduleBox({ studentId, name }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState(todaySeoul());
  const [endOn, setEndOn] = useState("");
  const [category, setCategory] = useState("보강");
  const [note, setNote] = useState("");
  const [priv, setPriv] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reload() {
    listStudentTasks(studentId).then((r) => {
      setRows(r.rows || []);
      setErr(r.error || null);
    });
  }
  useEffect(() => {
    let alive = true;
    listStudentTasks(studentId).then((r) => {
      if (!alive) return;
      setRows(r.rows || []);
      setErr(r.error || null);
    });
    return () => { alive = false; };
  }, [studentId]);

  function save() {
    startTransition(async () => {
      const res = await addStudentTask([studentId], {
        title, due_on: dueOn, end_on: endOn, category, note, private: priv,
      });
      if (res?.error) { alert(res.error); return; }
      setTitle(""); setNote(""); setEndOn(""); setPriv(false);
      setOpen(false);
      reload();
      router.refresh();
    });
  }

  const today = todaySeoul();

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>{name} 학생 일정</b>
        {rows && <span className="tag tag-sky">{rows.length}</span>}
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(!open)}>
          {open ? "닫기" : "＋ 일정 넣기"}
        </button>
      </div>

      <p className="hint" style={{ margin: 0, lineHeight: 1.7 }}>
        여기 넣은 일정은 <b>이 아이와 어머니 달력에만</b> 뜹니다. 할일 화면 달력에도
        같이 보이고, 구글 캘린더 구독에도 나갑니다 — 따로 적으실 필요 없어요.
      </p>

      {err && <div className="notice" style={{ fontSize: 12.5 }}>{err}</div>}

      {open && (
        <div className="card card-tight stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {KINDS.map((k) => (
              <button
                key={k}
                className={`btn btn-sm ${category === k ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  setCategory(k);
                  // 제목을 안 적으셨으면 종류를 그대로 제목으로 — 대부분 이걸로 충분하다
                  if (!title.trim()) setTitle(k);
                }}
              >
                {k}
              </button>
            ))}
          </div>

          <div className="field">
            <label className="label">일정 이름</label>
            <input
              className="input input-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 단어 재시험 보강"
            />
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field">
              <label className="label">날짜</label>
              <input className="input input-sm" type="date" style={{ width: 150 }}
                value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">끝나는 날 (여러 날이면)</label>
              <input className="input input-sm" type="date" style={{ width: 150 }}
                value={endOn} onChange={(e) => setEndOn(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label className="label">메모 (안 적어도 됩니다)</label>
            <input className="input input-sm" value={note}
              onChange={(e) => setNote(e.target.value)} placeholder="어머니께도 보입니다" />
          </div>

          {/* 상담 약속처럼 아이가 몰라도 되는 것. **비공개가 곧 나만 보기다** —
              이름을 둘로 두면 「그 둘이 뭐가 다르지」 를 매번 떠올려야 한다 */}
          <label className="row" style={{ gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
            <span style={{ fontSize: 13 }}>
              비공개 <span className="hint">(선생님만 봅니다 — 아이·어머니 달력에 안 뜹니다)</span>
            </span>
          </label>

          <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !title.trim()}>
            {pending ? "넣는 중…" : "넣기"}
          </button>
        </div>
      )}

      {rows === null ? (
        <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>이 학생에게 이어둔 일정이 없어요.</p>
      ) : (
        <div className="stack" style={{ gap: 3 }}>
          {rows.map((t) => (
            <div className="unitrow" key={t.id}>
              <span className="hint" style={{ minWidth: 76 }}>{longLabel(t.due_on)}</span>
              <span style={{ fontSize: 13, flex: 1 }}>
                {t.title}
                {t.end_on && t.end_on !== t.due_on && (
                  <span className="hint"> ~ {longLabel(t.end_on)}</span>
                )}
                {t.note && <span className="hint"> · {t.note}</span>}
              </span>
              {t.due_on < today && <span className="tag tag-muted">지남</span>}
              {t.private && <span className="tag tag-muted">비공개</span>}
              {/* 여럿이 걸린 일정이면 이 아이만 빠진다 — 남의 아이 일정까지
                  사라지면 지운 사람이 그것을 모른다 */}
              {(t.deliver_student_ids || []).length > 1 && (
                <span className="tag tag-sky">{t.deliver_student_ids.length}명</span>
              )}
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  const many = (t.deliver_student_ids || []).length > 1;
                  if (!confirm(
                    many
                      ? `이 일정에서 ${name} 학생만 뺄까요?\n다른 학생 것은 그대로 남습니다.`
                      : `「${t.title}」 일정을 지울까요?`
                  )) return;
                  startTransition(async () => {
                    const res = await removeStudentTask(t.id, studentId);
                    if (res?.error) { alert(res.error); return; }
                    reload();
                    router.refresh();
                  });
                }}
              >
                빼기
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
