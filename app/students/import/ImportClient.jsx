"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { parseTable, FIELD_LABEL } from "@/lib/importParse";
import { bulkAddStudents } from "../actions";

const STATUS_LABEL = {
  prospect: "예비",
  enrolled: "재원",
  paused: "휴원",
  withdrawn: "퇴원",
};

const SHOW = ["name", "school", "grade", "birth_year", "student_phone", "parent_phone", "status", "gender", "enrolled_on"];

export default function ImportClient() {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();

  function handleParse() {
    setResult(null);
    setParsed(parseTable(text));
  }

  function handleSave() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await bulkAddStudents(parsed.rows);
      setResult(res);
      if (res.inserted > 0) {
        setText("");
        setParsed(null);
      }
    });
  }

  const unknown = parsed
    ? parsed.headers.filter((h, i) => parsed.fields[i] === null)
    : [];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800 }}>
          1. 붙여넣기
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
          노션이나 엑셀에서 학생 표를 복사(Ctrl+C)해서 아래에 붙여넣으세요.
          <b> 첫 줄은 열 이름(제목)</b>이어야 해요. 예: 이름 · 학교 · 학년 · 생년월일 ·
          학생전화 · 학부모전화 · 상태 · 성별 · 등원시작일
        </p>
        <textarea
          className="input"
          style={{ minHeight: 160, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"이름\t학교\t학년\t학생전화\n홍길동\t신정중\t중2\t010-1234-5678"}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={handleParse} disabled={!text.trim()}>
            미리보기
          </button>
          <Link href="/students" className="btn btn-ghost">
            학생 목록으로
          </Link>
        </div>
      </div>

      {parsed && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 0" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              2. 미리보기{" "}
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
                인식된 학생이 없어요. 첫 줄이 열 이름인지, 표를 통째로
                복사했는지 확인해주세요.
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
