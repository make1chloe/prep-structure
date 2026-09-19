"use client";
/** (어83) 「누구에게」 고르개 한 벌 — 원장님 2026-09-18:
 *  「보강도 반이 아니라 학생별로 잡아야해. 학교별(버튼), 반별(버튼), 학생별(목록)에서 체크박스 선택가능하게 해줘」
 *  「결석예정과 보강잡을 때 학생별로 체크박스 선택하게」
 *
 *  결석 예정과 보강이 **같은 부품**을 쓴다(원칙-1 — 두 벌이면 한쪽만 고쳐져 어긋난다).
 *  학교·반 단추는 **고르개일 뿐** 저장하는 값이 아니다 — 저장되는 것은 언제나 **아이 목록**이다.
 *  그래서 반이 나중에 바뀌어도 이미 넣은 결석·보강은 안 흔들린다.
 *  ⚠️ 단추는 **토글**이다 — 그 학교(반) 아이가 다 골라져 있으면 누를 때 도로 빠진다(대전제-19 와 같은 결).
 *
 *  (어95) 원장님 2026-09-19(여쭌 55 의 답): 「**b** + 체크박스」 — 「거르개로 줄이고 이름으로 찾는다」.
 *  ⚠️ 학교·반 단추는 **고르개 그대로** 둔다((어83) 원장님 말씀) — 거르개는 **찾기 한 줄**이 따로 한다.
 *     찾기는 **이름과 학교**를 같이 본다(「한밭」도 「지훈」도 같은 칸에 적으신다).
 *  ⚠️ 찾는 중에는 **보이는 아이**가 곧 손이 닿는 아이다 — 학교·반 단추도 「전체」도 보이는 것만 집는다.
 *     그리고 「전체」는 이미 고른 아이에 **더한다** — 거르고 전체를 눌렀다고 딴 학교에서 고른 아이가 조용히 빠지지 않는다(대전제-0). */
import { useMemo, useState } from "react";
import { classText } from "@/lib/schedule-plan";
import { FACE } from "@/lib/emoji";   // 그림은 표에서 온다(대전제-25) — 학교 🏛️ · 반 🏫
import { icon } from "./icon.js";

export default function WhoPick({ students = [], classes = [], value = [], onChange, label = "누구에게" }) {
  const on = new Set(value ?? []);
  const set = (ids) => onChange([...new Set(ids)]);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase(); if (!k) return students;
    return students.filter((s) => `${s.name ?? ""} ${s.school ?? ""}`.toLowerCase().includes(k));
  }, [students, q]);
  const schools = useMemo(() => {
    const m = new Map();
    for (const s of shown) { const k = s.schoolId ?? "", n = s.school ?? "학교 없음"; if (!m.has(k)) m.set(k, { key: k, name: n, ids: [] }); m.get(k).ids.push(s.id); }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [shown]);
  const byClass = useMemo(() => (classes ?? []).map((c) => ({ ...c, ids: shown.filter((s) => (s.classIds ?? []).includes(c.id)).map((s) => s.id) })).filter((c) => c.ids.length), [classes, shown]);
  const allOn = (ids) => ids.length > 0 && ids.every((id) => on.has(id));
  const toggle = (ids) => set(allOn(ids) ? value.filter((id) => !ids.includes(id)) : [...value, ...ids]);

  return <div className="wpk" data-g="whopick">
    <div className="wv" style={{ marginBottom: 4 }}>
      <span className="fl" style={{ margin: 0 }}>{label}</span>
      <span className="pill" data-g="who-n">고른 {on.size}명</span>
      <button type="button" className="btn sm gho" data-act="who-all" onClick={() => set([...value, ...shown.map((s) => s.id)])}>전체 {shown.length}</button>
      <button type="button" className="btn sm gho" data-act="who-none" onClick={() => set([])}>비우기</button>
      <input type="text" value={q} aria-label="아이 찾기" placeholder="이름·학교" data-g="who-find" onChange={(e) => setQ(e.target.value)} style={{ flex: "0 1 140px", minWidth: 90 }} />
      {q !== "" && <button type="button" className="btn sm gho" data-act="who-unfind" {...icon("찾기 비우기")} onClick={() => setQ("")}>✕</button>}
    </div>
    {schools.length > 1 && <div className="wv" style={{ marginBottom: 4 }} data-g="who-schools">
      {schools.map((sc) => <button key={sc.key || "none"} type="button" className="btn sm" data-act="who-school" data-school={sc.key} aria-pressed={allOn(sc.ids)} onClick={() => toggle(sc.ids)}>{FACE.school} {sc.name} {sc.ids.length}</button>)}
    </div>}
    {byClass.length > 0 && <div className="wv" style={{ marginBottom: 4 }} data-g="who-classes">
      {byClass.map((c) => <button key={c.id} type="button" className="btn sm" data-act="who-class" data-class={c.id} aria-pressed={allOn(c.ids)} onClick={() => toggle(c.ids)}>{FACE.classes} {classText(c)} {c.ids.length}</button>)}
    </div>}
    <div className="wpl" data-g="who-list">
      {shown.map((s) => <label key={s.id} className="ckl" data-g="who-row" data-student={s.id}>
        <input type="checkbox" className="ck" checked={on.has(s.id)} onChange={(e) => set(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))} />{s.name}
      </label>)}
      {!shown.length && <span className="note">{students.length ? "찾는 아이 없음" : "다니는 아이 없음"}</span>}
    </div>
  </div>;
}
