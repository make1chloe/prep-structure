"use client";

import { useMemo, useState, useTransition } from "react";
import { shortName } from "@/lib/schoolName";
import { useRouter } from "next/navigation";
import {
  saveExam, removeExam, saveScope, removeScope,
  addMaterial, updateMaterial, removeMaterial, markStage,
  setAssignees, markAssign,
  markStages, removeMaterials, removeScopes,
  splitExamByGrade,
} from "./actions";
import { teacherText } from "@/lib/exams";
import { EXAM_TERMS, examTerm, termRank } from "@/lib/examKind";
import { cleanNote } from "@/lib/note";
import { sameSchool } from "@/lib/who";
import { useBulk, BulkBar } from "@/components/Bulk";
import TypeBox from "./TypeBox";
import ScopePicker from "./ScopePicker";
import { stageOf } from "@/lib/prepRoutine";
import { SchoolField, GradeField } from "@/components/PickField";

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
  students = [], unitLabel = {}, pick = "", schools = [],
}) {
  /**
   * **지난 시험은 접어 둔다 · 시험날 순으로 세운다** (원장님 2026-08-23 —
   * 「내신대비 페이지에서 시험목록이 일단 정렬이 엉망이야. 지난 시험은
   * 안 보이는 걸 디폴트로 하고 필터링해서 보게 해줘」).
   *
   * 정렬이 엉망이던 까닭: 서버가 english_on(영어 시험일) 하나로만 세웠는데,
   * 그 날짜가 아직 안 잡힌 시험이 많아 **날짜 없는 것들이 뒤엉켰다.**
   * 여기서 기간(from_date)까지 이어 붙여 세운다 — 영어 시험일이 없으면
   * 시험 기간 시작일로, 그것도 없으면 맨 뒤로.
   */
  const [showPast, setShowPast] = useState(false);
  const keyOf = (e) => e.exam_date || e.from_date || "9999-99-99";
  const isPast = (e) => {
    const end = e.to_date || e.exam_date || e.from_date;
    return !!end && end < today;
  };
  /**
   * **표로 세우고, 골라 본다** (원장님 2026-08-24 — 「시험목록도 표 방식으로
   * 정렬, 필터 등등 가능하게 만들어줘. 시험종류는 1학기중간, 1학기기말,
   * 2학기중간, 2학기기말, 수행평가」).
   *
   * 학교가 열 곳이 넘고 학년까지 나뉘면 시험 줄이 수십 개다. 한 줄짜리 목록
   * 으로는 「해송고 것만」 이나 「기말만」 을 볼 수가 없어서 눈으로 훑었다.
   * 회차는 이름에서 읽어낸다 (lib/examKind examTerm) — 칸을 새로 만들지 않아
   * 지금 있는 줄도 오늘부터 묶인다.
   */
  const [fSchool, setFSchool] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fTerm, setFTerm] = useState("");
  const [sortBy, setSortBy] = useState("date");     // date · school · term
  const [asc, setAsc] = useState(true);

  const withTerm = exams.map((e) => ({ ...e, _term: examTerm(e.term) }));
  const filtered = withTerm.filter((e) => {
    if (fSchool && e.school !== fSchool) return false;
    if (fGrade && (e.grade || "") !== fGrade) return false;
    if (fTerm === "__none__" ? !!e._term : fTerm && e._term !== fTerm) return false;
    return true;
  });
  const cmp = (a, b) => {
    if (sortBy === "school") {
      return (a.school || "").localeCompare(b.school || "", "ko")
        || keyOf(a).localeCompare(keyOf(b));
    }
    if (sortBy === "term") {
      return termRank(a._term) - termRank(b._term)
        || keyOf(a).localeCompare(keyOf(b))
        || (a.school || "").localeCompare(b.school || "", "ko");
    }
    return keyOf(a).localeCompare(keyOf(b))
      || (a.school || "").localeCompare(b.school || "", "ko");
  };
  const sortedExams = [...filtered].sort((a, b) => (asc ? cmp(a, b) : -cmp(a, b)));
  const pastCount = sortedExams.filter(isPast).length;
  const shownExams = showPast ? sortedExams : sortedExams.filter((e) => !isPast(e));
  const schoolsIn = [...new Set(exams.map((e) => e.school).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const gradesIn = [...new Set(exams.map((e) => e.grade || "").filter(Boolean))].sort();
  const 거르는중 = !!(fSchool || fGrade || fTerm);
  function head(key, label) {
    const on = sortBy === key;
    return (
      <th
        style={{ cursor: "pointer", whiteSpace: "nowrap" }}
        title="눌러서 이 기준으로 세웁니다"
        onClick={() => { if (on) setAsc(!asc); else { setSortBy(key); setAsc(true); } }}
      >
        {label}{on ? (asc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  const [sel, setSel] = useState(pick || shownExams[0]?.id || exams[0]?.id || "");
  const [openTypes, setOpenTypes] = useState(false);
  const [newExam, setNewExam] = useState(null);
  const [scopeFor, setScopeFor] = useState(null);   // 범위 고르는 중
  const [assignFor, setAssignFor] = useState(null); // 학생 배정 중
  const [addTo, setAddTo] = useState("");           // 자료 추가할 범위
  /**
   * 배정 낙관 상태 (2026-08-21) — 학생 칩을 누를 때마다 router.refresh 로
   * 페이지 전체(시험·범위·자료·배정)를 다시 그리던 것을, 화면은 즉시
   * 바꾸고 저장은 뒤에서 하게. 15명 배정 = 15번 왕복이던 자리.
   */
  const [assignLocal, setAssignLocal] = useState({});   // material_id → [student_id]
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
  const assignsOf = (matId) =>
    assignLocal[matId]
      ? assignLocal[matId].map((sid) => ({ material_id: matId, student_id: sid }))
      : assigns.filter((a) => a.material_id === matId);

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
          <b style={{ fontSize: 15 }}>지금 할 것</b>
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
                  <span className="hint" style={{ fontSize: 13, minWidth: 130 }}>{r.exam}</span>
                  <b style={{ fontSize: 14.5, flex: 1 }}>{r.label}</b>
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
            {/* 학교는 골라 넣는다 (0114) — 손으로 적으면 이 회차만 다른
                학교 것이 되어 시험범위도 성적도 따로 논다 */}
            <SchoolField className="input input-sm" style={{ width: 130 }} schools={schools}
              value={newExam.school} onChange={(e) => setNewExam({ ...newExam, school: e.target.value })} />
            {/**
              * **회차는 골라 넣는다** (원장님 2026-08-24 — 「시험종류는
              * 1학기중간, 1학기기말, 2학기중간, 2학기기말, 수행평가」).
              * 손으로 적으면 「26' 1학기기말」 과 「1학기 기말고사」 가 다른
              * 글자가 되어 목록에서 묶이지도 걸러지지도 않는다.
              * 수행평가는 학기에 여러 번이라 뒤에 번호를 덧붙일 수 있게 둔다.
              */}
            <select className="input input-sm" style={{ width: 130 }}
              value={EXAM_TERMS.includes(newExam.term.replace(/\s*\d+$/, "")) ? newExam.term.replace(/\s*\d+$/, "") : ""}
              onChange={(e) => setNewExam({ ...newExam, term: e.target.value })}>
              <option value="">회차 고르기</option>
              {EXAM_TERMS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            {newExam.term.startsWith("수행평가") && (
              <input className="input input-sm" style={{ width: 90 }} placeholder="몇 번째"
                title="수행평가는 학기에 여러 번이라 번호로 가릅니다"
                value={newExam.term.replace(/^수행평가\s*/, "")}
                onChange={(e) =>
                  setNewExam({ ...newExam, term: `수행평가${e.target.value.replace(/[^\d]/g, "")}` })
                } />
            )}
            <GradeField className="input input-sm" style={{ width: 80 }}
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
          {/* 골라 보기 — 학교 · 학년 · 회차 */}
          <div className="row" style={{ gap: 4, padding: "8px 10px", flexWrap: "wrap", alignItems: "center" }}>
            <select className="input input-sm" style={{ width: 110 }} value={fSchool}
              onChange={(ev) => setFSchool(ev.target.value)}>
              <option value="">학교 전체</option>
              {schoolsIn.map((x) => <option key={x} value={x}>{shortName(x)}</option>)}
            </select>
            <select className="input input-sm" style={{ width: 80 }} value={fGrade}
              onChange={(ev) => setFGrade(ev.target.value)}>
              <option value="">학년 전체</option>
              {gradesIn.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select className="input input-sm" style={{ width: 120 }} value={fTerm}
              onChange={(ev) => setFTerm(ev.target.value)}>
              <option value="">회차 전체</option>
              {EXAM_TERMS.map((x) => <option key={x} value={x}>{x}</option>)}
              <option value="__none__">그 밖 (회차를 못 읽은 것)</option>
            </select>
            {거르는중 && (
              <button className="btn btn-ghost btn-sm"
                onClick={() => { setFSchool(""); setFGrade(""); setFTerm(""); }}>
                거르기 지우기
              </button>
            )}
          </div>
          <table className="tbl tbl-tight">
            <thead>
              <tr>
                {head("school", "학교")}
                <th style={{ whiteSpace: "nowrap" }}>학년</th>
                {head("term", "회차")}
                {head("date", "영어 시험일")}
              </tr>
            </thead>
            <tbody>
              {shownExams.map((e) => {
                const d = dLeft(e.exam_date, today);
                return (
                  <tr key={e.id}
                      onClick={() => setSel(e.id)}
                      style={{ cursor: "pointer", ...(sel === e.id ? { background: "var(--surface-2)" } : {}) }}>
                    <td><b title={e.school}>{shortName(e.school)}</b></td>
                    <td><span className="hint">{e.grade || "전체"}</span></td>
                    <td>
                      <span className="hint">{e._term || e.term || "—"}</span>
                      {/* 회차를 못 읽은 이름은 적힌 그대로 (지어내지 않는다) */}
                      {!e._term && e.term && <span className="hint"> </span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {e.exam_date ? (
                        <>
                          <span className="hint">{e.exam_date.slice(2).replace(/-/g, ".")}</span>{" "}
                          <span className={`tag ${d !== null && d >= 0 && d <= 7 ? "tag-amber" : "tag-muted"}`}
                                style={{ fontSize: 12 }}>
                            {d < 0 ? "지남" : `D-${d}`}
                          </span>
                        </>
                      ) : (
                        <span className="hint">아직</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shownExams.length === 0 && (
                <tr><td colSpan={4}><p className="hint" style={{ margin: 0, padding: 10 }}>
                  {exams.length === 0
                    ? "시험을 추가해주세요."
                    : 거르는중
                    ? "고른 조건에 맞는 시험이 없어요."
                    : "다가오는 시험이 없어요."}
                </p></td></tr>
              )}
              {pastCount > 0 && (
                <tr>
                  <td colSpan={4}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ width: "100%", textAlign: "left" }}
                      onClick={() => setShowPast(!showPast)}
                    >
                      {showPast ? "지난 시험 접기" : `지난 시험 보기 (${pastCount})`}
                    </button>
                  </td>
                </tr>
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
                <b style={{ fontSize: 16 }} title={exam.school}>{shortName(exam.school)} {exam.term}</b>
                {exam.exam_date && <span className="hint">영어 {exam.exam_date}</span>}
                {teacherText(exam) && <span className="tag tag-lav">{teacherText(exam)}</span>}
                {(exam.cuts || []).length > 0 && (
                  <span className="tag tag-sky">등급컷 {exam.cuts.join("·")}</span>
                )}
                <span className="spacer" />
                <button className="btn btn-sm" onClick={() => setScopeFor({ exam_id: exam.id, unit_ids: [], name: "" })}>
                  ＋ 범위 추가
                </button>
                {/**
                  * **학년별로 나누기** (원장님 2026-08-23 — 「내신대비 범위를
                  * 학년별로 구분해야 하는데 그게 없어. 날짜도 아주 드문 경우
                  * 달라」). 나이스 시험은 학교 한 줄로 들어와 학년 칸이 빈다.
                  */}
                {!exam.grade && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    title="이 학교에 다니는 재원생 학년만큼 줄을 나눕니다 — 학년마다 범위·날짜를 따로 잡을 수 있어요"
                    onClick={() => {
                      const gs = [...new Set(
                        students
                          .filter((st) => sameSchool(st.school, exam.school))
                          .map((st) => (st.grade || "").trim())
                          .filter(Boolean)
                      )].sort();
                      if (gs.length === 0) {
                        alert("이 학교에 다니는 재원생이 없어요.");
                        return;
                      }
                      if (gs.length === 1) {
                        if (!confirm(`재원생 학년이 「${gs[0]}」 하나예요. 이 시험을 ${gs[0]} 시험으로 둘까요?`)) return;
                      } else if (!confirm(`${gs.join(" · ")} — ${gs.length}개 학년으로 나눌까요?\n\n지금 담아둔 범위·자료는 「${gs[0]}」 쪽에 남습니다.`)) {
                        return;
                      }
                      run(() => splitExamByGrade(exam.id, gs));
                    }}
                  >
                    학년별로 나누기
                  </button>
                )}
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
                {cleanNote(exam.note) && (
                  <span className="notice" style={{ flex: 1, fontSize: 14 }}>{cleanNote(exam.note)}</span>
                )}
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
                    <span className="hint" style={{ fontSize: 12.5 }}>
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
                    <b style={{ fontSize: 15 }}>
                      {sc.name || (sc.unit_ids || []).map((u) => unitLabel[u]).filter(Boolean)[0] || "범위"}
                    </b>
                    <span className="hint" style={{ fontSize: 12.5 }}>
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

                  <div className="hint" style={{ fontSize: 12.5, marginTop: 2 }}>
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
                            <b style={{ fontSize: 14.5, minWidth: 120 }}>
                              {typeName(m.type_id) || m.name || "자료"}
                            </b>
                            {STAGES.filter((s) => m[s.need]).map((s) => (
                              <button key={s.key}
                                className={`btn btn-sm ${m[s.at] ? "btn-on" : "btn-ghost"}`}
                                style={{ padding: "2px 8px", fontSize: 12.5 }}
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
                              <p className="hint" style={{ margin: "0 0 6px", fontSize: 13 }}>
                                이 자료를 낼 학생 — 눌러서 켜고 끕니다
                              </p>
                              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                                {students.map((st) => {
                                  const on = mine.some((a) => a.student_id === st.id);
                                  return (
                                    <button key={st.id}
                                      className={`btn btn-sm ${on ? "btn-on" : "btn-ghost"}`}
                                      style={{ padding: "2px 8px", fontSize: 13 }}
                                      onClick={() => {
                                        const next = on
                                          ? mine.filter((a) => a.student_id !== st.id).map((a) => a.student_id)
                                          : [...mine.map((a) => a.student_id), st.id];
                                        setAssignLocal((x) => ({ ...x, [m.id]: next }));
                                        startTransition(async () => {
                                          const res = await setAssignees(m.id, next);
                                          if (res?.error) {
                                            alert(res.error);
                                            setAssignLocal((x) => ({ ...x, [m.id]: mine.map((a) => a.student_id) }));
                                          }
                                        });
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
                                        <b style={{ fontSize: 14, minWidth: 62 }}>{st?.name || "학생"}</b>
                                        {OWN.filter((o) => m[`need_${o.key === "hand" ? "hand" : o.key}`]).map((o) => (
                                          <button key={o.key}
                                            className={`btn btn-sm ${a[o.at] ? "btn-on" : "btn-ghost"}`}
                                            style={{ padding: "2px 8px", fontSize: 12.5 }}
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
