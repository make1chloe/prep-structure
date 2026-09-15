"use client";
/** 🏫 학교 카드(06b) · 학교마다 이름·급 고치기 · 닫기(지우지 않는다 · 선택 목록에서 빠진다) · 「+ 새 학교」. 대전제-19 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Sure, { useSure } from "./sure.js";
import SchoolAdd from "./schooladd.js";
import { usePick, PickAll, PickBox, PickBar } from "./pick.js";   /* 고르기 한 벌((어28)-④ · 대전제-20) */
import { schoolSetAct, schoolCloseAct, schoolCloseManyAct } from "./school-actions.js";
import { LEVELS, levelName } from "@/lib/schools-plan";
export default function SchoolsCard({ schools = [] }) {
  const [edit, setEdit] = useState(null); const [f, setF] = useState({ name: "", level: "" }); const [err, setErr] = useState("");
  const [pending, start] = useTransition(); const router = useRouter(); const sure = useSure();
  const pk = usePick(schools.map((s) => s.id));   // 학교 줄 고르기 · 고른 것은 화면 안에만
  const run = (fn) => start(async () => { setErr(""); const r = await fn(); if (!r?.ok) { setErr(r?.msg ?? "못 함"); return; } setEdit(null); sure.off(); pk.clear(); router.refresh(); });
  return <div className="exr" style={{ marginTop: 8 }} data-g="schools-card">
    <div className="exh"><span className="ai">🏫</span><b>학교</b><span className="pill" data-g="schools-count">{schools.length}곳</span><PickAll pick={pk} disabled={!schools.length} /><span className="spacer" /><SchoolAdd open={!schools.length} /></div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 6px", color: "var(--miss)" }}>{err}</p>}
    <PickBar pick={pk} unit="곳">{/* (어28)-④ 고른 학교에 한 번에 · 줄의 「닫기」 손과 같다(묻고 · 지우지 않는다) */}
      <button type="button" className="btn sm" disabled={pending} data-act="close-picked" onClick={() => sure.ask("many")}>닫기 {pk.count}</button>
      <Sure on={sure.is("many")} text={`고른 ${pk.count}곳을 닫을까요? 선택 목록에서 빠지고, 이미 붙은 아이·시험은 그대로 둡니다. 같은 이름을 다시 넣으면 복구됩니다`} pending={pending} onYes={() => run(() => schoolCloseManyAct(pk.ids))} onNo={() => sure.off()} style={{ flexBasis: "100%" }} />
    </PickBar>
    <div className="left">
      {schools.map((s) => <div className="lf" key={s.id} data-g="school-row">
        <PickBox pick={pk} id={s.id} label={`${s.name} 고르기`} /><span className="ln">{s.level === "high" ? "🎓" : s.level === "middle" ? "🏫" : "🏠"}</span>
        {edit === s.id
          ? <span className="wv" style={{ gap: 4, margin: 0, flex: 1 }} data-g="school-edit"><input type="text" value={f.name} aria-label="학교 이름" onChange={(e) => setF({ ...f, name: e.target.value })} style={{ maxWidth: 180 }} />
            <span className="seg sm">{LEVELS.map(([k, n]) => <button key={k} type="button" aria-pressed={f.level === k} onClick={() => setF({ ...f, level: k })}>{n}</button>)}</span>
            <button type="button" className="btn sm pri" data-act="school-set" disabled={pending || !f.name.trim()} onClick={() => run(() => schoolSetAct(s.id, f))}>저장</button>
            <button type="button" className="btn sm gho" onClick={() => setEdit(null)}>닫기</button></span>
          : <><div><b>{s.name}</b><small>{levelName(s.level)}{s.neis_code ? ` · 나이스 ${s.neis_code}` : ""}</small></div>
            <button type="button" className="btn sm gho" data-act="school-edit" onClick={() => { setEdit(s.id); setF({ name: s.name, level: s.level }); }}>✎</button>
            <button type="button" className="btn sm gho" data-act="school-close" disabled={pending} onClick={() => sure.ask(s.id)}>닫기</button></>}
        <Sure on={sure.is(s.id)} text={`${s.name} 을(를) 닫을까요? 선택 목록에서 빠지고, 이미 붙은 아이·시험은 그대로 둡니다. 같은 이름을 다시 넣으면 복구됩니다`} pending={pending} onYes={() => run(() => schoolCloseAct(s.id))} onNo={() => sure.off()} />
      </div>)}
      {!schools.length && <p className="note" data-g="schools-empty" style={{ margin: 0 }}>학교 없음 · 위에 넣으면 학생 14 · 학교 시험 · 학교별 표에서 고를 수 있습니다</p>}
    </div>
  </div>;
}
