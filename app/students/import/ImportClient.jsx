"use client";

import { useState, useRef, useTransition } from "react";
import Link from "next/link";
import { parseAoA, FIELD_LABEL, TEMPLATE_HEADERS } from "@/lib/importParse";
import { bulkAddStudents } from "../actions";

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

export default function ImportClient() {
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef(null);

  async function handleDownloadTemplate() {
    const XLSX = await import("xlsx");
    const example = [
      "홍길동",
      "신정중",
      "중2",
      "2011-03-15",
      "010-1234-5678",
      "010-9999-8888",
      "재원",
      "남",
      "2024-03-02",
      "고2 1학기 화작/기하",
      "메모",
    ];
    const aoa = [TEMPLATE_HEADERS, example];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
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
      header: 1,
      raw: false,
      dateNF: "yyyy-mm-dd",
      defval: "",
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
      }
    });
  }

  const unknown = parsed
    ? parsed.headers.filter((h, i) => parsed.fields[i] === null && h)
    : [];

  return (
    <div className="stack" style={{ gap: 18 }}>
      {/* 1. 양식 내려받기 */}
      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800 }}>
          1. 양식 내려받기
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
          아래 버튼으로 엑셀 양식을 받아, 열 이름은 그대로 두고 학생 정보만
          채워주세요. (예시 줄은 지우고 입력)
        </p>
        <button className="btn btn-ghost" onClick={handleDownloadTemplate}>
          ⬇️ 엑셀 양식 다운로드 (.xlsx)
        </button>
      </div>

      {/* 2. 파일 업로드 */}
      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800 }}>
          2. 파일 업로드
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
          채운 엑셀 파일(.xlsx / .csv)을 선택하면 미리보기가 나와요.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFile}
          className="input"
          style={{ padding: 10 }}
        />
        {fileName && (
          <p className="hint" style={{ marginTop: 8 }}>
            선택된 파일: {fileName}
          </p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <Link href="/students" className="btn btn-ghost">
            학생 목록으로
          </Link>
        </div>
      </div>

      {/* 3. 미리보기 */}
      {parsed && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 0" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              3. 미리보기{" "}
              <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
                {parsed.rows.length}명 인식됨
              </span>
            </h2>
            {unknown.length > 0 && (
              <p className="hint" style={{ marginTop: 8 }}>
                인식 못한 열은 무시돼요: {unknown.join(", ")}
              </p>
            )}
          </div>

          {parsed.rows.length === 0 ? (
            <div style={{ padding: 18 }}>
              <div className="err">
                인식된 학생이 없어요. 첫 줄이 열 이름(이름·학교…)인지, 양식대로
                채웠는지 확인해주세요.
              </div>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      {SHOW.map((f) => (
                        <th key={f}>{FIELD_LABEL[f]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        {SHOW.map((f) => (
                          <td key={f} className={f === "name" ? "" : "muted"}>
                            {f === "status"
                              ? STATUS_LABEL[r.status] || r.status
                              : r[f] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > 50 && (
                <p className="hint" style={{ padding: "0 18px" }}>
                  … 외 {parsed.rows.length - 50}명 (저장은 전체 다 됩니다)
                </p>
              )}
              <div style={{ padding: 18 }}>
                <button
                  className="btn btn-primary btn-block"
                  onClick={handleSave}
                  disabled={pending}
                >
                  {pending ? "저장 중…" : `${parsed.rows.length}명 저장하기`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {result && (
        <div className="card">
          {result.error ? (
            <div className="err">저장 실패: {result.error}</div>
          ) : (
            <div className="notice">
              ✅ {result.inserted}명 저장 완료!{" "}
              <Link href="/students" style={{ fontWeight: 700 }}>
                학생 목록에서 확인하기
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
