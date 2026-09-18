"use client";
/** (어83) 「누구에게」 고르개 한 벌 — 원장님 2026-09-18:
 *  「보강도 반이 아니라 학생별로 잡아야해. 학교별(버튼), 반별(버튼), 학생별(목록)에서 체크박스 선택가능하게 해줘」
 *  「결석예정과 보강잡을 때 학생별로 체크박스 선택하게」
 *
 *  결석 예정과 보강이 **같은 부품**을 쓴다(원칙-1 — 두 벌이면 한쪽만 고쳐져 어긋난다).
 *  학교·반 단추는 **고르개일 뿐** 저장하는 값이 아니다 — 저장되는 것은 언제나 **아이 목록**이다.
 *  그래서 반이 나중에 바뀌어도 이미 넣은 결석·보강은 안 흔들린다.
 *  ⚠️ 단추는 **토글**이다 — 그 학교(반) 아이가 다 골라져 있으면 누를 때 도로 빠진다(대전제-19 와 같은 결). */
import { useMemo } from "react";
import { classText } from "@/lib/schedule-plan";
import { FACE } from "@/lib/emoji";   // 그림은 표에서 온다(대전제-25) — 학교 🏛️ · 반 🏫

export default function WhoPick({ students = [], classes = [], value = [], onChange, label = "누구에게" }) {
  const on = new Set(value ?? []);
  const set = (ids) => onChange([...new Set(ids)]);
  const schools = useMemo(() => {
    const m = new Map();
    for (const s of students) { const k = s.schoolId ?? "", n = s.school ?? "학교 없음"; if (!m.has(k)) m.set(k, { key: k, name: n, ids: [] }); m.get(k).ids.push(s.id); }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);
  const byClass = useMemo(() => (classes ?? []).map((c) => ({ ...c, ids: students.filter((s) => (s.classIds ?? []).includes(c.id)).map((s) => s.id) })).filter((c) => c.ids.length), [classes, students]);
  const allOn = (ids) => ids.length > 0 && ids.every((id) => on.has(id));
  const toggle = (ids) => set(allOn(ids) ? value.filter((id) => !ids.includes(id)) : [...value, ...ids]);

  return <div className="wpk" data-g="whopick">
    <div className="wv" style={{ marginBottom: 4 }}>
      <span className="fl" style={{ margin: 0 }}>{label}</span>
      <span className="pill" data-g="who-n">고른 {on.size}명</span>
      <button type="button" className="btn sm gho" data-act="who-all" onClick={() => set(students.map((s) => s.id))}>전체</button>
      <button type="button" className="btn sm gho" data-act="who-none" onClick={() => set([])}>비우기</button>
    </div>
    {schools.length > 1 && <div className="wv" style={{ marginBottom: 4 }} data-g="who-schools">
      {schools.map((sc) => <button key={sc.key || "none"} type="button" className="btn sm" data-act="who-school" data-school={sc.key} aria-pressed={allOn(sc.ids)} onClick={() => toggle(sc.ids)}>{FACE.school} {sc.name} {sc.ids.length}</button>)}
    </div>}
    {byClass.length > 0 && <div className="wv" style={{ marginBottom: 4 }} data-g="who-classes">
      {byClass.map((c) => <button key={c.id} type="button" className="btn sm" data-act="who-class" data-class={c.id} aria-pressed={allOn(c.ids)} onClick={() => toggle(c.ids)}>{FACE.classes} {classText(c)} {c.ids.length}</button>)}
    </div>}
    <div className="wpl" data-g="who-list">
      {students.map((s) => <label key={s.id} className="ckl" data-g="who-row" data-student={s.id}>
        <input type="checkbox" className="ck" checked={on.has(s.id)} onChange={(e) => set(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))} />{s.name}
      </label>)}
      {!students.length && <span className="note">다니는 아이 없음</span>}
    </div>
  </div>;
}
