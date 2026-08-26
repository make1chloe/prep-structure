"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExtra, listExtras, removeExtra } from "./extraActions";
import { todaySeoul, shortLabel, WEEK_ORDER } from "@/lib/day";

/**
 * **특강 (추가 등원)** — 재원생 정보 안에서 넣는다 (이행계획서 v2 §2-2).
 *
 * 특강은 반이 아니라 「이 학생이 이 기간, 이 요일·시간에 더 온다」다
 * (원장님 확정 2026-08-26). 반으로 만들던 시절의 병(판 두 쪽·출결 이중·
 * 학년 요금표가 특강비 덮음)이 이 모델에서 원인째 사라진다.
 * 특강비는 학생별 정액 — 결석해도 안 깎는다.
 */
export default function ExtraBox({ studentId, name }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState([]);
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("");
  const [from, setFrom] = useState(todaySeoul());
  const [to, setTo] = useState("");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reload() {
    listExtras(studentId).then((r) => {
      setRows(r.rows || []);
      setErr(r.error || null);
    });
  }
  useEffect(() => {
    let alive = true;
    listExtras(studentId).then((r) => {
      if (!alive) return;
      setRows(r.rows || []);
      setErr(r.error || null);
    });
    return () => { alive = false; };
  }, [studentId]);

  function save() {
    startTransition(async () => {
      const r = await addExtra(studentId, {
        label, days, start_time: startTime, end_time: endTime,
        from_date: from, to_date: to, fee, note,
      });
      if (r?.error) { setErr(r.error); return; }
      setErr(null);
      setOpen(false);
      setLabel(""); setDays([]); setTo(""); setFee(""); setNote("");
      reload();
      router.refresh();
    });
  }

  function drop(r) {
    if (!confirm(`「${r.label}」 특강을 지울까요? (지난 결석 기록도 같이 지워져요)`)) return;
    startTransition(async () => {
      const res = await removeExtra(r.id);
      if (res?.error) { setErr(res.error); return; }
      reload();
      router.refresh();
    });
  }

  const today = todaySeoul();

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 14.5 }}>{name} 특강 (추가 등원)</b>
        <button className="btn btn-sm btn-primary" onClick={() => setOpen(!open)} disabled={pending}>
          {open ? "닫기" : "＋ 특강"}
        </button>
      </div>
      {err && <div className="notice notice-bad">{err}</div>}

      {open && (
        <div className="stack" style={{ gap: 8 }}>
          <input className="input input-sm" placeholder="특강 이름 (예: 여름 내신 특강)"
            value={label} onChange={(e) => setLabel(e.target.value)} />
          <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
            {WEEK_ORDER.map((d) => (
              <button key={d}
                className={`btn btn-sm ${days.includes(d) ? "btn-on" : "btn-ghost"}`}
                onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>
                {d}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input className="input input-sm" type="time" style={{ width: 110 }}
              value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <span className="hint">~</span>
            <input className="input input-sm" type="time" style={{ width: 110 }}
              value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            <span className="hint">끝 시간은 안 적어도 돼요</span>
          </div>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input className="input input-sm" type="date" style={{ width: 150 }}
              value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="hint">~</span>
            <input className="input input-sm" type="date" style={{ width: 150 }}
              value={to} onChange={(e) => setTo(e.target.value)} />
            <span className="hint">특강은 끝나는 날이 꼭 있어야 해요</span>
          </div>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <input className="input input-sm" type="number" style={{ width: 130 }}
              placeholder="특강비 (원)" value={fee} onChange={(e) => setFee(e.target.value)} />
            <span className="hint">이 학생의 정액 — 결석해도 안 깎아요. 비우면 별도 청구 없음</span>
          </div>
          <input className="input input-sm" placeholder="메모"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-sm btn-primary" onClick={save} disabled={pending}>
            {pending ? "넣는 중…" : "넣기"}
          </button>
        </div>
      )}

      {rows === null ? (
        <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          특강이 없어요. 내신 대비처럼 기간을 정해 더 나오는 날을 여기에 넣어요.
        </p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {rows.map((r) => (
            <div key={r.id} className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 14 }}>{r.label}</b>
              {r.to_date < today && <span className="tag">끝남</span>}
              <span className="hint">
                {(r.days || []).join("")} {String(r.start_time).slice(0, 5)}
                {r.end_time ? `~${String(r.end_time).slice(0, 5)}` : ""}
                {" · "}{shortLabel(r.from_date)}~{shortLabel(r.to_date)}
                {r.fee != null ? ` · ${Number(r.fee).toLocaleString()}원` : ""}
              </span>
              {r.note && <span className="hint">{r.note}</span>}
              <button className="btn btn-ghost btn-sm" onClick={() => drop(r)} disabled={pending}>
                지우기
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
