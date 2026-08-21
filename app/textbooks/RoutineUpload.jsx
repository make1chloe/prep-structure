"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readSheet } from "@/lib/readSheet";
import { RT_HEADERS, parseRoutineAoA } from "@/lib/importRoutine";
import { bulkAddRoutines, exportRoutines } from "./routineActions";
import { ROUTINE_TEMPLATES } from "@/lib/routineTemplates";

/**
 * 루틴 엑셀 올리기 (원장님, 2026-08-14). 한 줄 = 한 수업 회차.
 *
 * **이미 루틴이 있는 교재는 건너뛰고 알려준다** — 덮어쓰면 그 루틴을 돌고
 * 있는 학생들의 단계(0120 id)가 끊긴다.
 * 양식의 예시는 본보기 루틴(문법)에서 그대로 가져온다 — 예시와 실제 항목
 * 이름이 어긋나면 양식이 거짓말이 된다 (원칙 1).
 */
export default function RoutineUpload() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  // 덮어쓰기 — 기본은 꺼짐. 화면에서 고친 루틴을 자동이 덮으면 대전제 2 위반이라,
  // 원장님이 이 칸을 직접 켰을 때만 덮는다 (2026-08-21)
  const [force, setForce] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef(null);
  const router = useRouter();

  function reset() {
    setParsed(null); setFileName(""); setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const steps = ROUTINE_TEMPLATES["문법"] || [];
    const examples = steps.slice(0, 4).map((st, i) => [
      i === 0 ? "(예시) 중2 문법 워크북" : "",
      i + 1,
      st.label || "",
      (st.inclass || []).join(" · "),
      (st.home || []).join(" · "),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([RT_HEADERS, ...examples]);
    ws["!cols"] = [{ wch: 24 }, { wch: 6 }, { wch: 22 }, { wch: 40 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "진도루틴");
    XLSX.writeFile(wb, "클로이영어_진도루틴_양식.xlsx");
  }

  async function downloadCurrent() {
    const res = await exportRoutines();
    if (res?.error) { alert(res.error); return; }
    if (!res.rows?.length) { alert("아직 진도루틴이 없어요."); return; }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([RT_HEADERS, ...res.rows]);
    ws["!cols"] = [{ wch: 24 }, { wch: 6 }, { wch: 22 }, { wch: 40 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "진도루틴");
    XLSX.writeFile(wb, `클로이영어_루틴_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleFile(e) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsed(parseRoutineAoA(await readSheet(file)));
  }

  function save() {
    if (!parsed || parsed.rows.length === 0) return;
    // 덮어쓰기는 돌이킬 수 없다 — 누르기 전에 한 번 더 묻는다
    if (force && !confirm("이미 진도루틴이 있는 교재·영역도 덮어씁니다.\n화면에서 고친 것까지 전부 덮어요. 계속할까요?")) return;
    startTransition(async () => {
      const res = await bulkAddRoutines(parsed.rows, force);
      setResult(res);
      if (!res.error) { setParsed(null); setFileName(""); router.refresh(); }
    });
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 진도루틴 엑셀로 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>진도루틴 엑셀로 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(false); }}>닫기</button>
      </div>
      <p className="hint" style={{ margin: "8px 0 10px", lineHeight: 1.7 }}>
        한 줄이 <b>한 수업 회차</b>입니다. 등원·숙제 칸에는 <b>학습항목 이름</b>을 · 로 이어 적으세요
        (학습항목에 없는 이름은 <b>새로 만들어서</b> 잇고, 무엇을 만들었는지 알려드립니다).
        회독 칸에 숫자를 넣으면 <b>그 회독부터</b> 그 줄이 적용됩니다 (비우면 모든 회독).
        같은 교재는 교재명을 첫 줄에만 적으면 됩니다.
        <b> 이미 진도루틴이 있는 교재는 건너뜁니다</b> — 화면에서 고친 루틴을 덮으면 안 되니까요.
        덮어쓰려면 아래 「덮어쓰기」 를 직접 켜세요.
      </p>
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>빈 양식 받기</button>
        <button className="btn btn-ghost btn-sm" onClick={downloadCurrent}>지금 진도루틴 내려받기</button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="input input-sm" style={{ width: 230 }} />
      </div>
      {parsed && (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <b>{fileName}</b> — 읽은 줄 {parsed.rows.length}개
            {parsed.problems.length > 0 && <span className="tag tag-amber" style={{ marginLeft: 6 }}>문제 {parsed.problems.length}</span>}
          </p>
          {parsed.problems.length > 0 && (
            <ul className="hint" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
              {parsed.problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          <label className="row" style={{ gap: 6, alignItems: "center", marginTop: 8, fontSize: 14 }}>
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            이미 루틴이 있는 교재·영역도 덮어쓰기
            {force && <span className="tag tag-amber">화면에서 고친 것까지 전부 덮습니다</span>}
          </label>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={save} disabled={pending || parsed.rows.length === 0}>
            {pending ? "올리는 중…" : "올리기"}
          </button>
        </div>
      )}
      {result && !result.error && (
        <div className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
          교재 {result.bookCount}권에 {result.addedSteps}단계 들어갔어요.
          {result.replaced?.length > 0 && (
            <><br />덮어씀 (기존 진도루틴 삭제 후 새로 심음): {result.replaced.join(" · ")}</>
          )}
          {result.skippedHasRoutine?.length > 0 && (
            <><br />이미 진도루틴이 있어 건너뜀: {result.skippedHasRoutine.join(" · ")}</>
          )}
          {result.missingBooks?.length > 0 && (
            <><br />교재를 못 찾음: {result.missingBooks.join(" · ")} (교재 이름 그대로인지 확인)</>
          )}
          {result.createdItems?.length > 0 && (
            <><br />새로 만든 학습항목: {result.createdItems.join(" · ")} (갈래는 학습항목에서 고칠 수 있어요)</>
          )}
          {result.missingItems?.length > 0 && (
            <><br />학습항목에 없는 이름: {result.missingItems.join(" · ")}</>
          )}
        </div>
      )}
      {result?.error && <div className="err" style={{ marginTop: 8 }}>{result.error}</div>}
    </div>
  );
}
