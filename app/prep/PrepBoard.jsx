"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveExam, removeExam, saveScope, removeScope,
  addMaterial, updateMaterial, removeMaterial, markStage,
  setAssignees, markAssign,
  markStages, removeMaterials, removeScopes,
} from "./actions";
import { teacherText } from "@/lib/exams";
import { useBulk, BulkBar } from "@/components/Bulk";
import TypeBox from "./TypeBox";
import ScopePicker from "./ScopePicker";
import { stageOf } from "@/lib/prepRoutine";

const STAGES = [
  { key: "make", need: "need_make", at: "made_at", label: "만들기" },
  { key: "print", need: "need_print", at: "printed_at", label: "인쇄" },
  { key: "card", need: "need_card", at: "card_at", label: "클래스카드" },
];
const OWN = [
  { key: "hand", at: "handed_at", label: "배부" },
  { key: "solve", at: "solved_at", label: "풀이" },
  { key: "grade", at: "graded_at", label: "채점" },
];

function dLeft(examDate, today) {
  if (!examDate) return null;
  const ms = Date.parse(`${examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export default function PrepBoard({
  today, exams = [], scopes = [], materials = [], assigns = [], types = [],
  students = [], unitLabel = {}, pick = "",
}) {
  const [sel, setSel] = useState(pick || exams[0]?.id || "");
  const [openTypes, setOpenTypes] = useState(false);
  const [newExam, setNewExam] = useState(null);
  const [scopeFor, setScopeFor] = useState(null);   // 범위 고르는 중
  const [assignFor, setAssignFor] = useState(null); // 학생 배정 중
  const [addTo, setAddTo] = useState("");           // 자료 추가할 범위
  const [pickType, setPickType] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const typeName = (id) => {
    const t = typeById.get(id);
    if (!t) return "";
    const p = t.parent_id ? typeById.get(t.parent_id) : null;
    return p ? `${p.name} ${t.name}` : t.name;
  };
  const leafTypes = types.filter((t) => t.active !== false && !types.some((x) => x.parent_id === t.id));

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  const exam = exams.find((e) => e.id === sel) || null;
  const myScopes = scopes.filter((s) => s.exam_id === sel);
  const matsOf = (scopeId) => materials.filter((m) => m.scope_id === scopeId);

  // 두 층 모두에서 고른다.
  //   위층  범위를 골라 그 안의 자료 전부에 한꺼번에
  //   아래층 그 범위 안에서 자료만 골라서
  // 층마다 「전체」가 따로 있어야 한다 — 위층 전체가 아래층까지 다 켜버리면
  // 자료 하나만 빼고 싶을 때 다시 스무 개를 눌러야 한다.
  const scopeBulk = useBulk(myScopes);
  const matBulk = useBulk(materials.filter((m) => myScopes.some((s) => s.id === m.scope_id)));
  const scopeMatIds = scopeBulk.ids.flatMap((id) => matsOf(id).map((m) => m.id));
  const assignsOf = (matId) => assigns.filter((a) => a.material_id === matId);

  // ── 지금 할 것 — 숫자가 아니라 줄로 ──────────────────
  const todoRows = useMemo(() => {
    const out = [];
    materials.forEach((m) => {
      const sc = scopes.find((s) => s.id === m.scope_id);
      const ex = sc ? exams.find((e) => e.id === sc.exam_id) : null;
      const st = stageOf({ ...m, handed_at: 1, solved_at: 1, graded_at: 1 }); // 학생 단계는 뺀다
      if (!st) return;
      out.push({
        id: m.id, stage: st, label: typeName(m.type_id) || m.name || "자료",
        exam: ex ? `${ex.school} ${ex.term}` : "", date: ex?.exam_date || null,
      });
    });
    return out
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
      .slice(0, 12);
  }, [materials, scopes, exams, types]);

  return (
    <>
      {todoRows.length > 0 && (
        <div className="card" style={{ marginTop: 14, borderLeft: "3px solid var(--amber, #e0a33e)" }}>
          <b style={{ fontSize: 14 }}>지금 할 것</b>
          <p className="hint" style={{ margin: "4px 0 8px" }}>
            시험이 급한 순서입니다. 누르면 다음 단계로 넘어가고 이 줄은 사라집니다.
          </p>
          <div className="stack" style={{ gap: 3 }}>
            {todoRows.map((r) => {
              const d = dLeft(r.date, today);
              return (
                <div className="unitrow" key={`${r.id}-${r.stage.key}`}>
                  <span className={`tag ${d !== null && d <= 3 ? "tag-amber" : "tag-muted"}`}>
                    {d === null ? "날짜 없음" : d < 0 ? "지남" : `D-${d}`}
                  </span>
                  <span className="hint" style={{ fontSize: 12, minWidth: 130 }}>{r.exam}</span>
                  <b style={{ fontSize: 13, flex: 1 }}>{r.label}</b>
                  <span className="tag tag-sky">{r.stage.label}</span>
                  <button
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() => run(() => markStage(r.id, r.stage.key, true))}
                  >
                    했어요
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 6, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn btn-sm" onClick={() => setNewExam({ school: "", term: "", grade: "", exam_date: "", teachers: "", note: "" })}>
          ＋ 시험 추가
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpenTypes(!openTypes)}>
          {openTypes ? "자료 종류 닫기" : "자료 종류 관리"}
        </button>
      </div>

      {openTypes && <TypeBox types={types} />}

      {newExam && (
        <div className="card card-tight" style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input className="input input-sm" style={{ width: 130 }} placeholder="학교"
              value={newExam.school} onChange={(e) => setNewExam({ ...newExam, school: e.target.value })} />
            <input className="input input-sm" style={{ width: 150 }} placeholder="26' 1학기기말"
              value={newExam.term} onChange={(e) => setNewExam({ ...newExam, term: e.target.value })} />
            <input className="input input-sm" style={{ width: 80 }} placeholder="고1"
              value={newExam.grade} onChange={(e) => setNewExam({ ...newExam, grade: e.target.value })} />
            <input className="input input-sm" type="date" style={{ width: 150 }}
              title="영어 시험일 — 급한 순서를 이걸로 잡습니다"
              value={newExam.exam_date} onChange={(e) => setNewExam({ ...newExam, exam_date: e.target.value })} />
            <input className="input input-sm" style={{ width: 110 }} placeholder="출제 선생님 (여럿이면 쉼표)"
              title="누가 내는지에 따라 대비가 달라집니다. 학년별로 나눠 내면 「김선생, 박선생」 처럼"
              value={newExam.teachers} onChange={(e) => setNewExam({ ...newExam, teachers: e.target.value })} />
            <input className="input input-sm" style={{ flex: 1, minWidth: 160 }} placeholder="특이사항 (서술형 비중, 범위 밖 출제 …)"
              value={newExam.note} onChange={(e) => setNewExam({ ...newExam, note: e.target.value })} />
            <button className="btn btn-primary btn-sm" disabled={pending}
              onClick={() => run(async () => { const r = await saveExam(newExam); if (!r?.error) setNewExam(null); return r; })}>
              저장
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setNewExam(null)}>취소</button>
          </div>
        </div>
      )}

      <div className="grid-side" style={{ marginTop: 12 }}>
        {/* 시험 목록 */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <tbody>
              {exams.map((e) => {
                const d = dLeft(e.exam_date, today);
                return (
                  <tr key={e.id} style={sel === e.id ? { background: "var(--surface-2)" } : undefined}>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ width: "100%", textAlign: "left" }}
                        onClick={() => setSel(e.id)}>
                        <b>{e.school}</b>{" "}
                        <span className="hint" style={{ fontSize: 11.5 }}>
                          {[e.grade, e.term].filter(Boolean).join(" · ")}
                        </span>
                        {e.exam_date && (
                          <span className={`tag ${d !== null && d <= 7 ? "tag-amber" : "tag-muted"}`} style={{ marginLeft: 6, fontSize: 11 }}>
                            {d < 0 ? "지남" : `D-${d}`}
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {exams.length === 0 && (
                <tr><td><p className="hint" style={{ margin: 0, padding: 10 }}>시험을 추가해주세요.</p></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 범위 · 자료 */}
        <div className="card">
          {!exam ? (
            <p className="hint" style={{ margin: 0 }}>왼쪽에서 시험을 골라주세요.</p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <b style={{ fontSize: 15 }}>{exam.school} {exam.term}</b>
                {exam.exam_date && <span className="hint">영어 {exam.exam_date}</span>}
                {teacherText(exam) && <span className="tag tag-lav">{teacherText(exam)}</span>}
                {(exam.cuts || []).length > 0 && (
                  <span className="tag tag-sky">등급컷 {exam.cuts.join("·")}</span>
                )}
                <span className="spacer" />
                <button className="btn btn-sm" onClick={() => setScopeFor({ exam_id: exam.id, unit_ids: [], name: "" })}>
                  ＋ 범위 추가
                </button>
                <button className="btn btn-ghost btn-sm" disabled={pending}
                  onClick={() => {
                    if (!confirm(`${exam.school} ${exam.term} 을 지울까요?\n범위·자료·배정이 모두 사라집니다.`)) return;
                    run(async () => { const r = await removeExam(exam.id); setSel(""); return r; });
                  }}>
                  시험 삭제
                </button>
              </div>

              {/* 시험 하나에 딸린 것을 한자리에 — 학사일정과 **같은 시험**이다 */}
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                {exam.note && <span className="notice" style={{ flex: 1, fontSize: 12.5 }}>{exam.note}</span>}
                <span className="spacer" />
                <a className="hint sky" href="/schedule" target="_blank" rel="noreferrer">
                  기간 · 등급컷 고치기 — 학사일정 ›
                </a>
                <a className="hint sky" href={`/scores`} target="_blank" rel="noreferrer">
                  성적 보기 ›
                </a>
              </div>

              {scopeFor && (
                <ScopePicker
                  scope={scopeFor}
                  onClose={() => setScopeFor(null)}
                  onSaved={() => { setScopeFor(null); router.refresh(); }}
                />
              )}

              {myScopes.length === 0 && !scopeFor && (
                <p className="hint" style={{ margin: 0 }}>
                  범위를 추가하면 교재DB에서 단원·문제를 골라 담을 수 있습니다.
                </p>
              )}

              {myScopes.length > 0 && (
                <div className="card card-tight" style={{ background: "var(--surface-2)" }}>
                  {/* 위층 — 범위를 골라 그 안의 자료 전부에 한꺼번에 */}
                  <BulkBar bulk={scopeBulk} label="범위">
                    <span className="hint" style={{ fontSize: 11.5 }}>
                      자료 {scopeMatIds.length}개
                    </span>
                    {STAGES.map((st) => (
                      <button
                        key={st.key}
                        className="btn btn-ghost btn-sm"
                        disabled={pending || scopeMatIds.length === 0}
                        onClick={() => run(() => markStages(scopeMatIds, st.key, true))}
                      >
                        ✓ {st.label}
                      </button>
                    ))}
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(
                          `고른 범위 ${scopeBulk.count}개를 지울까요?\n\n` +
                          `그 범위의 자료 ${scopeMatIds.length}개와 학생 배정이 모두 사라집니다. 되돌릴 수 없습니다.`
                        )) return;
                        run(() => scopeBulk.run((ids) => removeScopes(ids)));
                      }}
                    >
                      범위 삭제
                    </button>
                  </BulkBar>

                  {/* 아래층 — 범위와 상관없이 자료만 골라서 */}
                  <BulkBar bulk={matBulk} label="자료" style={{ borderTop: "1px dashed var(--border)" }}>
                    {STAGES.map((st) => (
                      <button
                        key={st.key}
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => run(() => matBulk.run((ids) => markStages(ids, st.key, true)))}
                      >
                        ✓ {st.label}
                      </button>
                    ))}
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`고른 자료 ${matBulk.count}개를 지울까요?`)) return;
                        run(() => matBulk.run((ids) => removeMaterials(ids)));
                      }}
                    >
                      자료 삭제
                    </button>
                  </BulkBar>
                </div>
              )}

              {myScopes.map((sc) => (
                <div className="card card-tight" key={sc.id}>
                  <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <input
                      type="checkbox"
                      checked={scopeBulk.has(sc.id)}
                      onChange={() => scopeBulk.toggle(sc.id)}
                    />
                    <b style={{ fontSize: 13.5 }}>
                      {sc.name || (sc.unit_ids || []).map((u) => unitLabel[u]).filter(Boolean)[0] || "범위"}
                    </b>
                    <span className="hint" style={{ fontSize: 11.5 }}>
                      {(sc.unit_ids || []).length}개 단원·문제
                    </span>
                    <span className="spacer" />
                    <button className="btn btn-ghost btn-sm" onClick={() => setScopeFor(sc)}>고치기</button>
                    <button className="btn btn-ghost btn-sm" disabled={pending}
                      onClick={() => {
                        if (!confirm("이 범위를 지울까요?\n\n이 범위의 자료와 학생 배정이 모두 사라집니다. 되돌릴 수 없습니다.")) return;
                        run(() => removeScope(sc.id));
                      }}>
                      삭제
                    </button>
                  </div>

                  <div className="hint" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {(sc.unit_ids || []).map((u) => unitLabel[u]).filter(Boolean).join(" / ") || "—"}
                  </div>

                  {/* 자료 */}
                  <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                    {matsOf(sc.id).map((m) => {
                      const mine = assignsOf(m.id);
                      return (
                        <div key={m.id} className="stack" style={{ gap: 3 }}>
                          <div className="unitrow">
                            <input
                              type="checkbox"
                              checked={matBulk.has(m.id)}
                              onChange={() => matBulk.toggle(m.id)}
                            />
                            <b style={{ fontSize: 13, minWidth: 120 }}>
                              {typeName(m.type_id) || m.name || "자료"}
                            </b>
                            {STAGES.filter((s) => m[s.need]).map((s) => (
                              <button key={s.key}
                                className={`btn btn-sm ${m[s.at] ? "btn-primary" : "btn-ghost"}`}
                                style={{ padding: "2px 8px", fontSize: 11.5 }}
                                disabled={pending}
                                onClick={() => run(() => markStage(m.id, s.key, !m[s.at]))}>
                                {m[s.at] ? "✓ " : ""}{s.label}
                              </button>
                            ))}
                            <span className="spacer" />
                            <button className="btn btn-ghost btn-sm"
                              onClick={() => setAssignFor(assignFor === m.id ? null : m.id)}>
                              학생 {mine.length}
                            </button>
                            <button className="btn btn-ghost btn-sm" disabled={pending}
                              onClick={() => { if (!confirm("이 자료를 지울까요?")) return; run(() => removeMaterial(m.id)); }}>
                              ✕
                            </button>
                          </div>

                          {assignFor === m.id && (
                            <div className="card card-tight" style={{ background: "var(--surface-2)" }}>
                              <p className="hint" style={{ margin: "0 0 6px", fontSize: 12 }}>
                                이 자료를 낼 학생 — 눌러서 켜고 끕니다
                              </p>
                              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                                {students.map((st) => {
                                  const on = mine.some((a) => a.student_id === st.id);
                                  return (
                                    <button key={st.id}
                                      className={`btn btn-sm ${on ? "btn-primary" : "btn-ghost"}`}
                                      style={{ padding: "2px 8px", fontSize: 12 }}
                                      disabled={pending}
                                      onClick={() => {
                                        const next = on
                                          ? mine.filter((a) => a.student_id !== st.id).map((a) => a.student_id)
                                          : [...mine.map((a) => a.student_id), st.id];
                                        run(() => setAssignees(m.id, next));
                                      }}>
                                      {st.name}
                                    </button>
                                  );
                                })}
                              </div>

                              {mine.length > 0 && (
                                <div className="stack" style={{ gap: 3, marginTop: 8 }}>
                                  {mine.map((a) => {
                                    const st = students.find((x) => x.id === a.student_id);
                                    return (
                                      <div className="unitrow" key={a.id}>
                                        <b style={{ fontSize: 12.5, minWidth: 62 }}>{st?.name || "학생"}</b>
                                        {OWN.filter((o) => m[`need_${o.key === "hand" ? "hand" : o.key}`]).map((o) => (
                                          <button key={o.key}
                                            className={`btn btn-sm ${a[o.at] ? "btn-primary" : "btn-ghost"}`}
                                            style={{ padding: "2px 8px", fontSize: 11.5 }}
                                            disabled={pending}
                                            onClick={() => run(() => markAssign(a.id, o.key, !a[o.at]))}>
                                            {a[o.at] ? "✓ " : ""}{o.label}
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 자료 추가 */}
                    {addTo === sc.id ? (
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        <select className="input input-sm" style={{ minWidth: 180 }}
                          value={pickType} onChange={(e) => setPickType(e.target.value)}>
                          <option value="">종류 고르기</option>
                          {leafTypes.map((t) => (
                            <option key={t.id} value={t.id}>{typeName(t.id)}</option>
                          ))}
                        </select>
                        <button className="btn btn-primary btn-sm" disabled={pending || !pickType}
                          onClick={() => run(async () => {
                            const r = await addMaterial(sc.id, pickType);
                            if (!r?.error) { setAddTo(""); setPickType(""); }
                            return r;
                          })}>
                          넣기
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setAddTo("")}>취소</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}
                        onClick={() => setAddTo(sc.id)}>
                        ＋ 자료
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
