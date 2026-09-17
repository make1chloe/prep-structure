"use client";
/** (어72) 설정 › 🧑‍🎓 아이가 채울 칸 — 원장님 2026-09-17 「모두 내가 설정페이지에서 켰을때 그리고 칸이 비어있을때만」.
 *  여기서 켠 칸만 아이 화면 07 에 뜨고, 그것도 **비어 있을 때만** 뜬다. 기본은 전부 꺼짐.
 *  칩은 누르면 먼저 바뀌고 실패하면 되돌린다(속도-3). 값은 v2.rule 한 줄(코드에 안 박는다 · 뼈대-5). */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FILL, isOn } from "@/lib/mine-plan";
import { FACE } from "@/lib/emoji";   // (어67)-② 카드 얼굴은 그림 표 한 곳에서
import { fillRuleAct } from "./actions.js";

export default function Fill({ rules = {} }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [opt, setOpt] = useState({});   // 누른 즉시(속도-3)
  const on = (rk) => (rk in opt ? opt[rk] : isOn(rules, rk));
  const flip = (rk) => { const next = !on(rk); setOpt((o) => ({ ...o, [rk]: next }));
    start(async () => { setErr(""); const r = await fillRuleAct(rk, next);
      if (!r?.ok) { setErr(r?.msg ?? "안 됨"); setOpt((o) => ({ ...o, [rk]: !next })); return; } router.refresh(); }); };
  return (<div className="card" data-card="fill">
    <div className="ctitle"><span className="cemo">{FACE.students}</span>아이가 채울 칸</div>
    {err && <p className="note" role="alert" data-g="fill-err" style={{ color: "var(--miss)" }}>{err}</p>}
    <div className="tags" data-g="fill-chips">
      {FILL.map(([key, rk, name]) => (
        <button key={key} type="button" className={"tag" + (on(rk) ? " on" : "")} data-act="fill-rule" data-k={key}
          aria-pressed={on(rk)} disabled={pending} onClick={() => flip(rk)}>{name}</button>))}
    </div>
    <p className="note" data-g="fill-note">켠 칸 · 빈 칸일 때만 아이 화면에 뜸</p>
  </div>);
}
