"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMakeup } from "./plan/actions";
import { addTask } from "./tasks/actions";
import { todaySeoul } from "@/lib/day";

/**
 * **읽은 자리에서 바로 처리한다** (원장님, 2026-08-07 —
 * 「대시보드에서 액션으로 이어지는 것도 고려해야해. 읽고 다른 화면 가면
 * 내용을 잊어버려. 보강추가, 할일추가 그런거 있어야해」).
 *
 * 지금까지 대시보드는 **읽는 자리**였다. 「이 아이 보강 잡아야겠다」 하고
 * 출결 화면으로 넘어가면, 거기서 학생을 다시 찾고 날짜를 다시 떠올려야 한다.
 * 그 사이에 방금 읽은 것이 흐려진다 — 어느 아이였는지, 왜였는지.
 *
 * 그래서 여기서 끝낸다. 접어두었다가 누르면 펴진다 —
 * 늘 펴져 있으면 매일 여는 화면 맨 위를 입력칸이 차지한다.
 *
 * **화면을 옮기지 않는다.** 저장하면 그 자리에 「됐어요」 한 줄만 뜬다.
 * 대시보드를 읽던 중이었으니, 읽던 자리로 돌아와야 한다.
 */
export default function QuickBar({ students = [] }) {
  const [open, setOpen] = useState(null);   // "makeup" | "todo" | null
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 보강
  const [who, setWho] = useState("");
  const [on, setOn] = useState("");
  const [at, setAt] = useState("");
  const [ofDate, setOfDate] = useState("");
  const [why, setWhy] = useState("");   // 결석 보강이 아닐 때의 까닭 (2026-08-21)

  // 할일
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(todaySeoul());

  function done(text) {
    setMsg({ bad: false, text });
    router.refresh();
  }

  function saveMakeup() {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await setMakeup(who, on, ofDate || null, at, why);
        if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
        const name = students.find((s) => s.id === who)?.name || "학생";
        setWho(""); setOn(""); setAt(""); setOfDate(""); setWhy("");
        done(`${name} 보강을 잡았어요.`);
      } catch (e) {
        setMsg({ bad: true, text: `저장하지 못했어요: ${e?.message || e}` });
      }
    });
  }

  function saveTodo() {
    setMsg(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("title", title.trim());
        fd.set("kind", "todo");
        fd.set("due_on", due);
        await addTask(fd);
        setTitle("");
        done("할일에 넣었어요.");
      } catch (e) {
        setMsg({ bad: true, text: `저장하지 못했어요: ${e?.message || e}` });
      }
    });
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button
          className={`btn btn-sm ${open === "makeup" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => { setMsg(null); setOpen(open === "makeup" ? null : "makeup"); }}
        >
          ＋ 보강 잡기
        </button>
        <button
          className={`btn btn-sm ${open === "todo" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => { setMsg(null); setOpen(open === "todo" ? null : "todo"); }}
        >
          ＋ 할일
        </button>
        {msg && !open && (
          <span className={msg.bad ? "err" : "hint"} style={{ alignSelf: "center" }}>{msg.text}</span>
        )}
      </div>

      {open === "makeup" && (
        <div className="card card-tight" style={{ marginTop: 6 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="input input-sm"
              style={{ width: 150 }}
              value={who}
              onChange={(e) => setWho(e.target.value)}
            >
              <option value="">학생…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              className="input input-sm" type="date" style={{ width: 145 }}
              value={on} onChange={(e) => setOn(e.target.value)} title="보강 날짜"
            />
            <input
              className="input input-sm" type="time" style={{ width: 105 }}
              value={at} onChange={(e) => setAt(e.target.value)} title="보강 시간"
            />
            {/* **어느 결석의 보강인가** — 안 적어도 잡힌다. 적어두면 그 결석이
                「보강 잡을 것」 목록에서 내려간다 */}
            <input
              className="input input-sm" type="date" style={{ width: 145 }}
              value={ofDate} onChange={(e) => setOfDate(e.target.value)}
              title="어느 날 결석의 보강인가 (안 적어도 됩니다)"
            />
            {/* **왜 하는 보강인지** (원장님 2026-08-21 — 「결석이 아닌
                추가 보강에 사유를 적는 칸 필요함」). 결석분이면 비워둔다 */}
            <input
              className="input input-sm"
              style={{ flex: 1, minWidth: 150 }}
              placeholder="왜 (단어 재시험 · 시험 대비 …)"
              value={why} onChange={(e) => setWhy(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || !who || !on}
              onClick={saveMakeup}
            >
              {pending ? "저장 중…" : "잡기"}
            </button>
          </div>
          <p className="hint" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
            뒤쪽 날짜는 <b>어느 날 결석의 보강인지</b>입니다 (안 적어도 잡혀요).
            적으면 그 결석이 「보강 잡을 것」 에서 내려갑니다.
          </p>
          {msg && (
            <p className={msg.bad ? "err" : "hint"} style={{ margin: "6px 0 0" }}>{msg.text}</p>
          )}
        </div>
      )}

      {open === "todo" && (
        <div className="card card-tight" style={{ marginTop: 6 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input input-sm"
              style={{ flex: 1, minWidth: 200 }}
              placeholder="예) 해송고 시험범위 받아두기"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) saveTodo(); }}
            />
            <input
              className="input input-sm" type="date" style={{ width: 145 }}
              value={due} onChange={(e) => setDue(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || !title.trim()}
              onClick={saveTodo}
            >
              {pending ? "저장 중…" : "넣기"}
            </button>
          </div>
          {msg && (
            <p className={msg.bad ? "err" : "hint"} style={{ margin: "6px 0 0" }}>{msg.text}</p>
          )}
        </div>
      )}
    </div>
  );
}
