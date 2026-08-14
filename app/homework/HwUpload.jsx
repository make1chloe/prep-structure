"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readSheet } from "@/lib/readSheet";
import { HW_HEADERS, parseHomeworkAoA } from "@/lib/importHomework";
import { bulkAddHomeworkItems, exportHomeworkItems } from "./actions";

/**
 * 학습항목 엑셀 올리기 (원장님, 2026-08-14 — 「교재 학습항목이랑 루틴
 * 엑셀로 업로드 할 수 있게 해줘」). 단원 업로드와 같은 왕복:
 * 양식(또는 지금 것) 내려받기 → 고치기 → 올리기. 이름이 같으면 덮어쓴다.
 */
export default function HwUpload() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef(null);
  const router = useRouter();

  function reset() {
    setParsed(null); setFileName(""); setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const examples = [
      ["문법 개념 정독 + 형광펜", "문법", "10", "교재"],
      ["문법 문제풀기", "문법", "20", "교재"],
      ["단어 외우기", "단어", "30", "클래스카드"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([HW_HEADERS, ...examples]);
    ws["!cols"] = HW_HEADERS.map((h) => ({ wch: h === "이름" ? 28 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "학습항목");
    XLSX.writeFile(wb, "클로이영어_학습항목_양식.xlsx");
  }

  async function downloadCurrent() {
    const res = await exportHomeworkItems();
    if (res?.error) { alert(res.error); return; }
    if (!res.rows?.length) { alert("아직 학습항목이 없어요."); return; }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([HW_HEADERS, ...res.rows]);
    ws["!cols"] = HW_HEADERS.map((h) => ({ wch: h === "이름" ? 28 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "학습항목");
    XLSX.writeFile(wb, `클로이영어_학습항목_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleFile(e) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsed(parseHomeworkAoA(await readSheet(file)));
  }

  function save() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await bulkAddHomeworkItems(parsed.rows);
      setResult(res);
      if (!res.error) { reset(); router.refresh(); }
    });
  }

  if (!open) {
    // 접힌 단추는 맨몸으로 — 껍데기에 여백을 붙이면 툴바 줄이 어긋난다
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 엑셀로 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>학습항목 엑셀로 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(false); }}>닫기</button>
      </div>
      <p className="hint" style={{ margin: "8px 0 10px", lineHeight: 1.7 }}>
        한 줄이 학습항목 하나입니다. <b>이름이 같으면 덮어써지고</b>, 없는 이름은 새로 생겨요.
        파일에서 지운 항목은 안 지웁니다 (루틴·리포트가 그 항목을 쓰고 있어요).
      </p>
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>빈 양식 받기</button>
        <button className="btn btn-ghost btn-sm" onClick={downloadCurrent}>지금 항목 내려받기</button>
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
          <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={save} disabled={pending || parsed.rows.length === 0}>
            {pending ? "올리는 중…" : `${parsed.rows.length}개 올리기`}
          </button>
        </div>
      )}
      {result && !result.error && (
        <p className="hint" style={{ marginTop: 8 }}>새로 {result.added}개 · 덮어씀 {result.updated}개.</p>
      )}
      {result?.error && <div className="err" style={{ marginTop: 8 }}>{result.error}</div>}
    </div>
  );
}
