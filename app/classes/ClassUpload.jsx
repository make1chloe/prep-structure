"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseClassAoA, CLASS_HEADERS, CLASS_FIELD_LABEL } from "@/lib/importClass";
import { bulkAddClasses } from "./actions";

const SHOW = ["name", "days", "start_time", "end_time", "category", "level", "school_level", "room", "capacity"];

export default function ClassUpload() {
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
    const example = ["월수 7:30", "월,수", "7:30-10:00", "정규반", "기본반", "중", "1강의실", "8"];
    const ws = XLSX.utils.aoa_to_sheet([CLASS_HEADERS, example]);
    ws["!cols"] = CLASS_HEADERS.map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "반");
    XLSX.writeFile(wb, "클로이영어_반_양식.xlsx");
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
    setParsed(parseClassAoA(aoa));
  }

  function save() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await bulkAddClasses(parsed.rows);
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
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 엑셀로 추가
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>반 엑셀로 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(false); }}>닫기</button>
      </div>
      <p className="muted" style={{ margin: "8px 0 12px", fontSize: 14.5 }}>
        요일은 <b>월,수</b> 처럼, 수업시간은 <b>7:30-10:00</b> 처럼 적으면 됩니다.
        오후 수업은 12시간제로 적어도 자동으로 오후로 인식해요.
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
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              미리보기 <span className="muted" style={{ fontWeight: 600 }}>{parsed.rows.length}개</span>
            </h3>
            {unknown.length > 0 && <span className="hint">무시된 열: {unknown.join(", ")}</span>}
          </div>

          {parsed.rows.length === 0 ? (
            <div className="err" style={{ marginTop: 10 }}>
              인식된 반이 없어요. 첫 줄이 열 이름(반이름·요일…)인지 확인해주세요.
            </div>
          ) : (
            <>
              <div className="tblwrap" style={{ marginTop: 10 }}>
                <table className="tbl tbl-tight">
                  <thead>
                    <tr>{SHOW.map((f) => <th key={f}>{CLASS_FIELD_LABEL[f]}</th>)}</tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 30).map((r, i) => (
                      <tr key={i}>
                        {SHOW.map((f) => (
                          <td key={f} className={f === "name" ? "" : "muted"}>
                            {f === "days" ? (r.days || []).join("·") : r[f] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="btn btn-primary btn-block" onClick={save}
                disabled={pending} style={{ marginTop: 12 }}
              >
                {pending ? "저장 중…" : `${parsed.rows.length}개 저장`}
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
            <div className="notice">✅ {result.inserted}개 저장 완료!</div>
          )}
        </div>
      )}
    </div>
  );
}
