"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readSheet } from "@/lib/readSheet";
import { PG_HEADERS, parseProgressAoA } from "@/lib/importProgress";
import { bulkSetProgress, exportProgress } from "./actions";

/**
 * 진도 엑셀 올리기 (원장님, 2026-08-14 — 「진도 기록도 엑셀로 좀 하고 싶어」).
 * 순차로 안 나간 교재의 **처음 세팅**에 특히 쓸모 — 띄엄띄엄 완료된 것을
 * 화면에서 수십 번 누르는 대신 한 파일로 넣는다.
 * **적힌 단원만 바꾸고** 안 적은 것은 안 건드린다.
 */
export default function ProgressUpload() {
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

  async function downloadCurrent() {
    const res = await exportProgress();
    if (res?.error) { alert(res.error); return; }
    if (!res.rows?.length) { alert("아직 배정된 교재가 없어요."); return; }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([PG_HEADERS, ...res.rows]);
    ws["!cols"] = [{ wch: 10 }, { wch: 24 }, { wch: 44 }, { wch: 24 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "진도");
    XLSX.writeFile(wb, `클로이영어_진도_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleFile(e) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsed(parseProgressAoA(await readSheet(file)));
  }

  function save() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await bulkSetProgress(parsed.rows);
      setResult(res);
      if (!res.error) { setParsed(null); setFileName(""); router.refresh(); }
    });
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 엑셀로 진도 넣기
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>진도 엑셀로 넣기</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(false); }}>닫기</button>
      </div>
      <p className="hint" style={{ margin: "8px 0 10px", lineHeight: 1.7 }}>
        <b>「지금 진도 내려받기」 로 시작하세요</b> — 학생·교재·단원 이름이 전부 맞게
        채워져 나옵니다. 완료·하는 중 칸을 고쳐서 다시 올리면 <b>적힌 단원만</b> 바뀌고,
        안 적은 단원은 안 건드립니다. 기록은 그 학생의 지금 회독에 들어가요.
      </p>
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={downloadCurrent}>지금 진도 내려받기</button>
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
            {pending ? "넣는 중…" : "넣기"}
          </button>
        </div>
      )}
      {result && !result.error && (
        <div className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
          단원 표시 {result.marked}개 · 페이지 {result.pages}건 들어갔어요.
          {result.missing?.length > 0 && (
            <><br />못 찾은 이름: {result.missing.join(" · ")}</>
          )}
        </div>
      )}
      {result?.error && <div className="err" style={{ marginTop: 8 }}>{result.error}</div>}
    </div>
  );
}
