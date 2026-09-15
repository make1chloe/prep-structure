"use client";
/** 「+ 새 학교」 한 벌 · 학교 고르개 옆 어디서나(06c 줄 더하기 · 14 학생 · 12b 가져오기 · 06b 학교 카드). 넣으면 화면을 다시 읽고 고르개에 그 학교를 고른 채로 준다 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { schoolAddAct } from "./school-actions.js";
import { LEVELS, guessLevel } from "@/lib/schools-plan";
export default function SchoolAdd({ open: open0 = false, onAdded = null }) {
  const [open, setOpen] = useState(open0); const [name, setName] = useState(""); const [level, setLevel] = useState(""); const [err, setErr] = useState("");
  const [pending, start] = useTransition(); const router = useRouter();
  const lv = level || guessLevel(name) || "";
  const save = () => start(async () => { setErr(""); const r = await schoolAddAct({ name, level: lv }); if (!r?.ok) { setErr(r?.msg ?? "학교를 못 넣음"); return; } setName(""); setLevel(""); setOpen(false); router.refresh(); onAdded?.(r.id, r.name); });
  if (!open) return <button type="button" className="btn sm gho" data-act="school-new" onClick={() => setOpen(true)}>+ 새 학교</button>;
  return <span className="wv" data-g="school-add" style={{ gap: 4, margin: 0 }}>
    <input type="text" value={name} placeholder="학교 이름" aria-label="학교 이름" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} style={{ maxWidth: 160 }} />
    <span className="seg sm" data-g="school-level">{LEVELS.map(([k, n]) => <button key={k} type="button" aria-pressed={lv === k} onClick={() => setLevel(k)}>{n}</button>)}</span>
    <button type="button" className="btn sm pri" data-act="school-save" disabled={pending || !name.trim() || !lv} onClick={save}>넣기</button>
    <button type="button" className="btn sm gho" data-act="school-cancel" onClick={() => { setOpen(false); setErr(""); }}>닫기</button>
    {err && <span className="note" role="alert" style={{ margin: 0, color: "var(--miss)" }}>{err}</span>}
  </span>;
}
