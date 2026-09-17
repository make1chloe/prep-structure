"use client";
/** (어72) 아이 화면 07 · 🧑 내 정보 — 원장님 2026-09-17 「학생어플에서 학생이 직접 재원생정보의 비어있는 칸을 채울 수 있게 …
 *  모두 내가 설정페이지에서 켰을때 그리고 칸이 비어있을때만」.
 *  뜨는 칸은 lib/mine-plan 이 고른 것뿐이다(켠 칸 **그리고** 빈 칸) — 여기서 다시 안 고른다(원칙-1).
 *  한 번 넣으면 그 칸은 사라진다(이미 찬 칸은 아래에 보기만 · 고치는 것은 원장님 몫).
 *  ⚠️ 카드 틀(Card)은 **안 받는다** — 여기는 눌리는 조각이라 서버가 함수를 못 건넨다(건네면 07 이 통째로 안 열렸다).
 *     틀은 app/me/page.js 가 씌우고 여기는 속만 그린다. */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fillAct } from "./actions.js";
const TYPE = { tel: "tel", grade: "number", date: "date", text: "text" };
const HINT = { tel: "01012345678", grade: "3", date: "2015-03-21", text: "클래스카드 아이디" };

export default function Mine({ fields = [], filled = [], progress = "follow" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({});
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const save = (f) => start(async () => { setErr(""); setDone("");
    const r = await fillAct(f.key, v[f.key] ?? "");
    if (!r?.ok) { setErr(r?.msg ?? "안 됨"); return; }
    setDone(`${f.name} 넣음`); setV((o) => ({ ...o, [f.key]: "" })); router.refresh(); });
  return (<>
    {err && <p className="note" role="alert" data-g="mine-err" style={{ color: "var(--miss)" }}>{err}</p>}
    {done && <p className="note" data-g="mine-done" style={{ color: "var(--on-ok)" }}>{done}</p>}
    {fields.map((f) => (
      <div className="wv" key={f.key} data-g="mine-field" data-k={f.key} style={{ marginTop: 8 }}>
        <label className="fl" htmlFor={`mine-${f.key}`} style={{ margin: 0, minWidth: 100 }}>{f.name}</label>
        <input id={`mine-${f.key}`} name={`mine-${f.key}`} type={TYPE[f.kind] ?? "text"} inputMode={f.kind === "tel" || f.kind === "grade" ? "numeric" : undefined}
          placeholder={HINT[f.kind] ?? ""} autoComplete="off" value={v[f.key] ?? ""} onChange={(e) => setV((o) => ({ ...o, [f.key]: e.target.value }))}
          style={{ flex: "1 1 140px" }} />
        <button className="btn sm pri" type="button" data-act="mine-save" data-k={f.key}
          disabled={pending || !String(v[f.key] ?? "").trim()} onClick={() => save(f)}>입력</button>
      </div>))}
    {filled.length > 0 && <div className="left" data-g="mine-filled" style={{ marginTop: 8 }}>
      {filled.map((f) => <div className="lf" key={f.key}><span className="ln">✓</span><div><b>{f.name}</b><small>{f.text}</small></div></div>)}
    </div>}
    <p className="note" data-g="mine-progress">교재 진도 체크 · {progress === "on" ? "내가 찍기" : progress === "off" ? "쌤이 찍기" : "학원 설정 따라감"}</p>
  </>);
}
