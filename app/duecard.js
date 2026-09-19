"use client";
/** (어84) ⏰ 마감 필요 — 대시보드 맨 위. 원장님 2026-09-18:
 *  「대시보드에 최상단에 새로운 목록 만들어서 알려줘. 이름은 마감 필요. 당일 처리할 업무
 *   (일지작성후발송, 숙제검사발송 출결처리등)이 안된 것을 모달로 바로바로 처리할 수 있게 목록화해놔」
 *  「b로 하되 서로 구별되게 두파트로 나눠서 제시 페이지여백없게」
 *
 *  두 파트다 — **🧑 아이**(출결·검사·마감·발송) 와 **📋 업무**(오늘까지가 마감인 05 업무).
 *  줄은 한 줄씩 촘촘히 붙인다(.duel — 여백 없이 · 원장님 9/16 「여백 낭비가 심함」과 같은 결).
 *  무엇이 남았나는 lib/dash-plan dueOf 한 곳이 정한다(원칙-1) · 재료는 dash_ops.due(0181). */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doneAct } from "./schedule/todo/actions.js";   // (어88) 05 의 그 손 그대로
import { dueRows, dueTodos, dueStepName } from "@/lib/dash-plan";
import { kindName } from "@/lib/todo-plan";
import { FACE, ACT } from "@/lib/emoji";   // 그림은 표에서 온다(대전제-25)
import DueModal from "./_shell/duemodal.js";

export default function DueCard({ due, date }) {
  const router = useRouter();
  const [open, setOpen] = useState(null);
  const [busy, start] = useTransition();   // (어88) 업무 줄을 그 자리에서 끝낸다 — 05 와 **같은 손**(doneAct · 새 손 0 · 원칙-1)
  const finish = (todoId) => start(async () => { const r = await doneAct(todoId); if (r?.ok !== false) router.refresh(); });
  if (!due) return <p className="note" data-g="due-none" style={{ margin: 0 }}>아직 못 셈 · <code>docs/sql-paste/0181.sql</code> 을 넣으신 뒤</p>;
  const rows = dueRows(due), todos = dueTodos(due);
  if (!rows.length && !todos.length) return <p className="note" data-g="due-clear" style={{ margin: 0 }}>오늘 마감할 것 없음</p>;
  return <>
    {rows.length > 0 && <div data-g="due-students">
      <div className="duehead"><b>{FACE.mine} 아이 {rows.length}</b><span className="spacer" /><Link prefetch={false} className="btn sm gho goto" href="/today">오늘 수업</Link></div>
      <div className="duel">{rows.map((r) => <button key={r.sheet_id} type="button" className="duer" data-g="due-row" data-student={r.student_id} onClick={() => setOpen(r)}>
        <b>{r.name}</b><span className="spacer" />{r.steps.map((k) => <i key={k} className={"tag" + (k === "attend" ? " now" : "")}>{dueStepName(k)}{k === "check" ? ` ${r.left}` : ""}</i>)}
      </button>)}</div>
    </div>}
    {todos.length > 0 && <div data-g="due-todos" style={{ marginTop: rows.length ? 6 : 0 }}>
      <div className="duehead"><b>{FACE.todo} 업무 {todos.length}</b><span className="spacer" /><Link prefetch={false} className="btn sm gho goto" href="/schedule/todo">업무</Link></div>
      {/* (어88) ① 분류 이름은 **판이 실어 준 것**을 먼저 쓴다(0182 kind_name) — 원장님이 05 에서 만드신 분류는
                씨앗에 없어 `u3f9a2b1c` 로 보였다. ② 업무 줄도 **그 자리에서** 끝낸다 —
                원장님 「모달로 바로바로 처리」가 아이 줄에만 지켜져 있었다(업무는 화면 이동뿐이었다) */}
      <div className="duel">{todos.map((t) => <div key={t.id} className="duer" data-g="due-todo">
        <Link prefetch={false} href="/schedule/todo" style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}><b>{t.title}</b></Link>
        <span className="spacer" /><i className="tag">{t.kind_name ?? kindName(t.kind)}</i>{t.due_on < date && <i className="tag now">지남</i>}
        <button type="button" className="btn sm" disabled={busy} data-act="due-todo-done" onClick={() => finish(t.id)}>완료</button>
      </div>)}</div>
    </div>}
    {open && <DueModal row={open} onClose={() => setOpen(null)} onDone={() => router.refresh()} />}
  </>;
}
