"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseUnitAoA, UNIT_HEADERS, UNIT_FIELD_LABEL } from "@/lib/importUnit";
import { bulkAddUnits } from "./actions";

const SHOW = ["textbook", "big", "mid", "small", "name", "question_no", "activity", "page_start", "page_end", "total_pages"];

export default function UnitUpload() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef(null);
  const router = useRouter();

  function reset() {
    setParsed(null);
    setFileName("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const examples = [
      ["리딩튜터 입문", "2025", "Part 1", "Chapter 1", "", "Unit 1. 관계사", "설명", "8", "15", "8"],
      ["리딩튜터 입문", "2025", "Part 1", "Chapter 1", "Lesson 1", "", "워크북", "16", "19", "4"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([UNIT_HEADERS, ...examples]);
    ws["!cols"] = UNIT_HEADERS.map((h) => ({ wch: h === "교재명" ? 24 : 12 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "단원");
    XLSX.writeFile(wb, "클로이영어_단원_양식.xlsx");
  }

  async function handleFile(e) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1, raw: false, defval: "",
    });
    setParsed(parseUnitAoA(aoa));
  }

  function save() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await bulkAddUnits(parsed.rows);
      setResult(res);
      if (!res.error) {
        reset();
        router.refresh();
      }
    });
  }

  const unknown = parsed
    ? parsed.headers.filter((h, i) => parsed.fields[i] === null && h)
    : [];
  const bookCount = parsed
    ? new Set(parsed.rows.map((r) => r.textbook)).size
    : 0;

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 단원 엑셀로 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>단원 엑셀로 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(false); }}>닫기</button>
      </div>
      <p className="muted" style={{ margin: "8px 0 12px", fontSize: 13 }}>
        한 줄이 단원 하나입니다. <b>대·중·소단원</b>을 적으면 계층이 자동으로 만들어지고,
        같은 대단원은 한 번만 생성됩니다. 교재명이 없는 교재는 <b>자동으로 새로 만들어져요.</b>
        총분량을 비우면 시작·끝 페이지로 계산합니다.
      </p>

      <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={downloadTemplate}>⬇️ 양식 다운로드</button>
        <input
          ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
          onChange={handleFile} className="input"
          style={{ padding: 9, flex: 1, minWidth: 220 }}
        />
      </div>
      {fileName && <p className="hint" style={{ marginTop: 8 }}>선택된 파일: {fileName}</p>}

      {parsed && (
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800 }}>
              미리보기{" "}
              <span className="muted" style={{ fontWeight: 600 }}>
                {parsed.rows.length}줄 · 교재 {bookCount}권
              </span>
            </h3>
            {unknown.length > 0 && <span className="hint">무시된 열: {unknown.join(", ")}</span>}
          </div>

          {parsed.rows.length === 0 ? (
            <div className="err" style={{ marginTop: 10 }}>
              인식된 단원이 없어요. 첫 줄이 열 이름(교재명·대단원·단원명…)인지 확인해주세요.
            </div>
          ) : (
            <>
              <div className="tblwrap" style={{ marginTop: 10 }}>
                <table className="tbl tbl-tight">
                  <thead>
                    <tr>{SHOW.map((f) => <th key={f}>{UNIT_FIELD_LABEL[f]}</th>)}</tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 30).map((r, i) => (
                      <tr key={i}>
                        {SHOW.map((f) => (
                          <td key={f} className={f === "textbook" || f === "name" ? "" : "muted"}>
                            {r[f] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > 30 && (
                <p className="hint" style={{ marginTop: 6 }}>
                  … 외 {parsed.rows.length - 30}줄 (전체 저장됨)
                </p>
              )}
              <button
                className="btn btn-primary btn-block" onClick={save}
                disabled={pending} style={{ marginTop: 12 }}
              >
                {pending ? "저장 중…" : `${parsed.rows.length}줄 저장`}
              </button>
            </>
          )}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12 }}>
          {result.error ? (
            <div className="err">저장 실패: {result.error}</div>
          ) : (
            <>
              <div className="notice">
                ✅ {result.inserted}줄 저장 완료!
                {result.updated > 0 && ` 이미 있던 단원 ${result.updated}개는 파일 내용으로 고쳤어요.`}
                {result.createdBooks > 0 && ` 새 교재 ${result.createdBooks}권도 함께 만들었어요.`}
              </div>

              {/* 엑셀에서 지웠거나 이름을 바꾼 단원 — 자동으로 지우지 않는다.
                  학생 진도가 단원에 걸려 있어서, 지우면 그 기록도 함께 사라진다. */}
              {(result.leftover || []).length > 0 && (
                <div className="card card-tight" style={{ marginTop: 8, borderColor: "var(--amber)" }}>
                  <b style={{ fontSize: 13 }}>
                    파일에 없는 단원 {result.leftover.length}개
                  </b>
                  <p className="hint" style={{ margin: "4px 0 6px", fontSize: 11.5 }}>
                    엑셀에서 <b>지웠거나 이름을 바꾼</b> 단원이에요.
                    <b> 저절로 지우지 않았습니다</b> — 학생 진도가 단원에 걸려 있어서
                    지우면 그 기록도 함께 사라지거든요.
                    이름만 바꾸신 거라면, 교재 화면에서 <b>이름을 고치는 편</b>이 낫습니다
                    (진도가 그대로 따라옵니다).
                  </p>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {result.leftover.slice(0, 40).map((u) => (
                      <span key={u.id} className="tag tag-muted" style={{ fontSize: 10.5 }}>
                        {u.book ? `${u.book} · ` : ""}{u.name}
                      </span>
                    ))}
                    {result.leftover.length > 40 && (
                      <span className="hint">외 {result.leftover.length - 40}개</span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
