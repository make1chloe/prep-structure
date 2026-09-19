"use client";
/** (어78) 📌 퀵 메모 — 원장님 2026-09-17 「어느 페이지에서나 갑자기 할 일이 떠올랐을 때 … 할 일을 추가 할 수 있게 해줘」 ·
 *  「가장 중요한 기능은 어느 페이지에서나 갑자기 작성 가능하게. 할일 목록에 추가되게 하는 것. 사진 붙여넣기가 가능한 것. 3가지야」
 *
 *  ⚠️ 새 표를 안 만든다 — 퀵 메모는 **업무 한 줄**(v2.todo · kind='note')이고 손도 05 와 같은 noteAct 하나다(원칙-1).
 *  ⚠️ 마감을 **안 묻는다**. 떠오른 것을 적는 자리에서 날짜부터 물으면 적기를 멈춘다 · 마감 없는 줄은 05 에서 「마감 없음」으로 선다(대전제-0).
 *     날짜·아이·첨부는 「자세히」를 펴야 나온다 — 접힌 채가 기본이라 한 줄 적고 Enter 면 끝이다.
 *  ⚠️ 상단 띠에서는 **표를 안 읽는다**(속도-4) — 그래서 아이 고르개는 이미 명단을 읽은 05 에서만 준다(students).
 *  ⚠️ 사진은 **저장한 뒤에** 붙는다(붙을 줄이 있어야 붙는다) — 저장 단추가 Upload 의 send 를 부른다. 올리는 길은 그대로 한 곳(대전제-7). */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { noteAct, editNoteAct } from "../schedule/todo/actions.js";
import Upload from "./upload.js";
import { ACT } from "@/lib/emoji";
import { kindList } from "@/lib/todo-plan";
import { icon } from "./icon.js";
import { DateBox } from "./datebox.js";
const EMPTY = { title: "", kind: "note", dueOn: "", startOn: "", dueTime: "", studentId: "" };
/** (어80) `edit` 를 주면 **같은 양식이 고치기**가 된다 — 넣기와 고치기를 두 벌로 그리지 않는다(원칙-1 · 대전제-19) */
const formOf = (c) => (c ? { title: c.title ?? "", kind: c.kind ?? "note", dueOn: c.due ?? "", startOn: c.startOn ?? "", dueTime: c.dueTime ?? "", studentId: c.studentId ?? "" } : EMPTY);
/** (어88) `kinds` — 업무 종류 고르개(원장님 2026-09-18 「근데 업무종류를 고르는건 가능하게해야함」).
 *  ⚠️ **상단 띠 📌 는 어느 화면에서나 뜨므로 표를 읽지 않는다**(속도-4) — 화면이 읽은 것을 내려주고, 안 주면 씨앗(KINDS)으로 그린다.
 *  씨앗에는 원장님이 새로 만드신 분류가 없으니, 05 에서는 반드시 내려준다(05 는 이미 읽은 값이라 조회 0). */
export default function QuickMemo({ students = null, kinds = null, inline = false, edit = null, onSaved = null, onCancel = null }) {
  const router = useRouter(); const [open, setOpen] = useState(inline);
  const kindOpts = useMemo(() => kindList(kinds).filter((k) => k.state === "active" && k.showOn !== "schedule"), [kinds]);
  const [f, setF] = useState(() => formOf(edit)); const [more, setMore] = useState(Boolean(edit));
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [pending, start] = useTransition();
  const box = useRef(null), sendRef = useRef(null);
  useEffect(() => { if (open && box.current) box.current.focus(); }, [open]);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => start(async () => {
    setErr(""); setMsg("");
    const r = edit ? await editNoteAct(edit.todoId, f) : await noteAct(f); if (!r.ok) { setErr(r.msg); return; }
    const id = edit ? edit.todoId : r.id;
    const files = sendRef.current?.count ?? 0;
    if (files) await sendRef.current.send(id);             // 세운 줄에 붙인다(사진 · PDF)
    if (!edit) { setF(EMPTY); setMore(false); }
    setMsg(edit ? "수정했어요" : files ? `업무에 넣었어요 · 파일 ${files}개` : "업무에 넣었어요");
    onSaved?.(id); router.refresh();                        // 05 에 있으면 그 자리에서 줄이 선다
    if (!inline) setTimeout(() => setMsg(""), 4000);
  });
  const bar = (
    <div className="wv" data-g="quick-bar" style={{ margin: 0 }}>
      <input ref={box} type="text" value={f.title} placeholder="무엇을" aria-label="퀵 메모" data-g="quick-title" style={{ flex: "1 1 200px" }}
        onChange={up("title")} onKeyDown={(e) => { if (e.key === "Enter" && f.title.trim() && !pending) save(); }} />
      <button type="button" className={"btn sm" + (more ? " pri" : "")} data-act="quick-more" aria-pressed={more} onClick={() => setMore(!more)}>자세히</button>
      <button type="button" className="btn pri sm" data-act="quick-save" disabled={pending || !f.title.trim()} onClick={save}>{pending ? (edit ? "수정 중…" : "넣는 중…") : edit ? "수정" : "넣기"}</button>
      {edit && <button type="button" className="btn sm gho" data-act="quick-cancel" onClick={() => onCancel?.()}>취소</button>}
      {!inline && !edit && <button type="button" className="btn sm gho" data-act="quick-close" onClick={() => { setOpen(false); setMsg(""); }}>닫기</button>}
    </div>
  );
  const body = (
    <>
      {bar}
      {more && <div className="wv" data-g="quick-more" style={{ marginTop: 6 }}>
        <label className="fl" style={{ margin: 0 }}>종류</label><select value={f.kind} aria-label="업무 종류" data-g="quick-kind" onChange={up("kind")} style={{ width: "auto" }}>{kindOpts.map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}</select>
        <label className="fl" style={{ margin: 0 }}>시작일</label><DateBox type="date" className="dt" value={f.startOn} aria-label="시작일" onChange={up("startOn")} style={{ width: "auto" }} />
        <label className="fl" style={{ margin: 0 }}>마감</label><DateBox type="date" className="dt" value={f.dueOn} aria-label="마감" onChange={up("dueOn")} style={{ width: "auto" }} />
        <DateBox type="time" value={f.dueTime} aria-label="시각" onChange={up("dueTime")} style={{ width: "auto" }} />
        {students && <select value={f.studentId} aria-label="아이" onChange={up("studentId")} style={{ width: "auto" }}><option value="">아이 없음</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      </div>}
      {more && <Upload paste sendRef={sendRef} label="📷 사진 · 📄 파일" hint="붙여넣기(Ctrl+V)도 돼요" compact />}
      {err && <p className="note" role="alert" style={{ margin: "6px 0 0", color: "var(--miss)" }}>{err}</p>}
      {msg && <p className="note" data-g="quick-msg" style={{ margin: "6px 0 0", color: "var(--on-ok)" }}>{msg}</p>}
    </>
  );
  if (inline) return <div data-g="quickmemo" data-where="page">{body}</div>;
  return (
    <>
      <button type="button" className="btn sm" data-act="quick-open" aria-pressed={open} {...icon("퀵 메모")} onClick={() => setOpen(!open)}>{ACT.quick}</button>
      {open && <div className="quickbox" data-g="quickmemo" data-where="bar">{body}</div>}
    </>
  );
}
