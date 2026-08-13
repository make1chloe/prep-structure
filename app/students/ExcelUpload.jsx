"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseAoA, FIELD_LABEL, TEMPLATE_HEADERS } from "@/lib/importParse";
import { bulkAddStudents } from "./actions";

const STATUS_LABEL = {
  prospect: "예비",
  enrolled: "재원",
  paused: "휴원",
  withdrawn: "퇴원",
};

const SHOW = [
  "name",
  "school",
  "grade",
  "birth_year",
  "student_phone",
  "parent_phone",
  "status",
  "gender",
  "enrolled_on",
];

export default function ExcelUpload() {
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
    const example = [
      "홍길동", "신정중", "중2", "2011-03-15", "010-1234-5678",
      "010-9999-8888", "재원", "남", "2024-03-02", "고2 1학기 화작/기하", "메모",
    ];
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, example]);
    ws["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "재원생");
    XLSX.writeFile(wb, "클로이영어_재원생_양식.xlsx");
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
    const aoa = XLSX.utils.sheet_to_json(ws, {
      header: 1, raw: false, dateNF: "yyyy-mm-dd", defval: "",
    });
    setParsed(parseAoA(aoa));
  }

  function handleSave() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await bulkAddStudents(parsed.rows);
      setResult(res);
      if (res.inserted > 0) {
        setParsed(null);
        setFileName("");
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    });
  }

  const unknown = parsed
    ? parsed.headers.filter((h, i) => parsed.fields[i] === null && h)
    : [];

  if (!open) {
    // **접힌 단추는 맨몸으로** — 여백 붙은 껍데기로 감싸면 옆 단추들과 어긋난다
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ＋ 엑셀로 추가
      </button>
    );
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>엑셀로 추가</h2>
        <button
          className="btn btn-ghost"
          onClick={() => { reset(); setOpen(false); }}
          style={{ padding: "6px 10px" }}
        >
          닫기
        </button>
      </div>

      <p className="muted" style={{ margin: "8px 0 14px", fontSize: 13 }}>
        양식을 받아 채운 뒤 파일을 올리면 한 번에 등록돼요. 로그인 아이디도 자동
        생성됩니다.
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
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800 }}>
              미리보기{" "}
              <span className="muted" style={{ fontWeight: 600 }}>
                {parsed.rows.length}명
              </span>
            </h3>
            {unknown.length > 0 && (
              <span className="hint">무시된 열: {unknown.join(", ")}</span>
            )}
          </div>

          {parsed.rows.length === 0 ? (
            <div className="err" style={{ marginTop: 10 }}>
              인식된 학생이 없어요. 첫 줄이 열 이름인지, 양식대로 채웠는지
              확인해주세요.
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table className="tbl">
                  <thead>
                    <tr>{SHOW.map((f) => <th key={f}>{FIELD_LABEL[f]}</th>)}</tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 30).map((r, i) => (
                      <tr key={i}>
                        {SHOW.map((f) => (
                          <td key={f} className={f === "name" ? "" : "muted"}>
                            {f === "status" ? STATUS_LABEL[r.status] || r.status : r[f] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > 30 && (
                <p className="hint" style={{ marginTop: 6 }}>
                  … 외 {parsed.rows.length - 30}명 (저장은 전체 다 됩니다)
                </p>
              )}
              <button
                className="btn btn-primary btn-block"
                onClick={handleSave}
                disabled={pending}
                style={{ marginTop: 12 }}
              >
                {pending ? "저장 중…" : `${parsed.rows.length}명 저장`}
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
            <div className="notice">✅ {result.inserted}명 저장 완료! 아래 목록에서 확인하세요.</div>
          )}
        </div>
      )}
    </div>
  );
}
