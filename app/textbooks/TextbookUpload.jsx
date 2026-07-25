"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseTextbookAoA, TB_FIELD_LABEL, TEXTBOOK_HEADERS } from "@/lib/importTextbook";
import { bulkAddTextbooks } from "./actions";

const SHOW = ["name", "area", "target_grade", "total_pages", "price", "word_range"];

export default function TextbookUpload() {
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

  async function handleDownloadTemplate() {
    const XLSX = await import("xlsx");
    const example = ["리딩튜터 입문", "독해", "중2", "120", "15000", "", "https://...", "특징 메모"];
    const ws = XLSX.utils.aoa_to_sheet([TEXTBOOK_HEADERS, example]);
    ws["!cols"] = TEXTBOOK_HEADERS.map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "교재");
    XLSX.writeFile(wb, "클로이영어_교재_양식.xlsx");
  }

  async function handleFile(e) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    setParsed(parseTextbookAoA(aoa));
  }

  function handleSave() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await bulkAddTextbooks(parsed.rows);
      setResult(res);
      if (res.inserted > 0) {
        reset();
        router.refresh();
      }
    });
  }

  const unknown = parsed
    ? parsed.headers.filter((h, i) => parsed.fields[i] === null && h)
    : [];

  if (!open) {
    return (
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={() => setOpen(true)}>
          ＋ 엑셀로 추가
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>교재 엑셀로 추가</h2>
        <button
          className="btn btn-ghost"
          onClick={() => { reset(); setOpen(false); }}
          style={{ padding: "6px 10px" }}
        >
          닫기
        </button>
      </div>
      <p className="muted" style={{ margin: "8px 0 14px", fontSize: 13 }}>
        양식을 받아 채운 뒤 파일을 올리면 한 번에 등록돼요.
      </p>

      <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={handleDownloadTemplate}>
          ⬇️ 양식 다운로드
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFile}
          className="input"
          style={{ padding: 9, flex: 1, minWidth: 220 }}
        />
      </div>
      {fileName && <p className="hint" style={{ marginTop: 8 }}>선택된 파일: {fileName}</p>}

      {parsed && (
        <div style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800 }}>
              미리보기 <span className="muted" style={{ fontWeight: 600 }}>{parsed.rows.length}권</span>
            </h3>
            {unknown.length > 0 && <span className="hint">무시된 열: {unknown.join(", ")}</span>}
          </div>

          {parsed.rows.length === 0 ? (
            <div className="err" style={{ marginTop: 10 }}>
              인식된 교재가 없어요. 첫 줄이 열 이름(교재명·영역…)인지 확인해주세요.
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table className="tbl">
                  <thead>
                    <tr>{SHOW.map((f) => <th key={f}>{TB_FIELD_LABEL[f]}</th>)}</tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 30).map((r, i) => (
                      <tr key={i}>
                        {SHOW.map((f) => (
                          <td key={f} className={f === "name" ? "" : "muted"}>{r[f] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > 30 && (
                <p className="hint" style={{ marginTop: 6 }}>… 외 {parsed.rows.length - 30}권 (전체 저장됨)</p>
              )}
              <button
                className="btn btn-primary btn-block"
                onClick={handleSave}
                disabled={pending}
                style={{ marginTop: 12 }}
              >
                {pending ? "저장 중…" : `${parsed.rows.length}권 저장`}
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
            <div className="notice">✅ {result.inserted}권 저장 완료!</div>
          )}
        </div>
      )}
    </div>
  );
}
