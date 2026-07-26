"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sheetToRows, parseReportRow, parseHomeworkRow } from "@/lib/importNotion";
import { importReports, importHomework } from "./actions";

const KINDS = [
  {
    key: "report",
    label: "데일리리포트",
    db: "3데일리리포트DB",
    hint: "출결 · 단어/문장 점수 · 숙제 검사 결과(완료O·미흡△·미제출X) · 공지가 들어옵니다.",
  },
  {
    key: "homework",
    label: "하원숙제",
    db: "하원숙제DB",
    hint: "단어·독해·문법·노트·듣기·영작·테스트·내신·시험대비·특강 숙제와 발송 여부가 들어옵니다.",
  },
];

export default function ImportBoard() {
  const [kind, setKind] = useState("report");
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const meta = KINDS.find((k) => k.key === kind);

  async function handleFile(e) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false, codepage: 65001 });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      raw: false,
      defval: "",
    });
    const objs = sheetToRows(aoa);
    const y = parseInt(year, 10) || new Date().getFullYear();
    setRows(objs.map((o) => (kind === "report" ? parseReportRow(o, y) : parseHomeworkRow(o, y))));
  }

  function save() {
    if (!rows || rows.length === 0) return;
    startTransition(async () => {
      const res = kind === "report" ? await importReports(rows) : await importHomework(rows);
      setResult(res);
      if (!res.error) router.refresh();
    });
  }

  const ok = (rows || []).filter((r) => r.name && r.date);
  const bad = (rows || []).filter((r) => !r.name || !r.date);

  return (
    <>
      <div className="row" style={{ gap: 4, marginTop: 12 }}>
        {KINDS.map((k) => (
          <button
            key={k.key}
            className={`btn btn-sm ${kind === k.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => { setKind(k.key); setRows(null); setResult(null); }}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
          {meta.label} 옮기기
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.7 }}>
          노션에서 <b>{meta.db}</b> 를 열고 → 오른쪽 위 <b>···</b> → <b>Export</b> →
          형식 <b>CSV</b> → 내려받은 파일을 아래에 올리세요.
          <br />
          {meta.hint} 같은 날짜·학생이 이미 있으면 덮어씁니다.
        </p>

        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 110 }}>
            <label className="label">연도</label>
            <input
              className="input input-sm"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFile}
            className="input"
            style={{ padding: 9, flex: 1, minWidth: 240 }}
          />
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          노션 제목이 <b>07/20/월 김서은 DP</b> 형태라 날짜에 연도가 없습니다. 위 연도를 맞춰주세요.
        </p>
        {fileName && <p className="hint">선택된 파일: {fileName}</p>}

        {rows && (
          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
              <b style={{ fontSize: 13.5 }}>미리보기</b>
              <span className="tag tag-mint">옮길 수 있음 {ok.length}</span>
              {bad.length > 0 && <span className="tag tag-amber">이름·날짜 못 읽음 {bad.length}</span>}
            </div>

            <div className="tblwrap" style={{ marginTop: 8 }}>
              <table className="tbl tbl-tight">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>학생</th>
                    {kind === "report" ? (
                      <>
                        <th>출결</th>
                        <th>단어</th>
                        <th>완료</th>
                        <th>미흡</th>
                        <th>미제출</th>
                        <th>공지</th>
                      </>
                    ) : (
                      <>
                        <th>숙제</th>
                        <th>발송</th>
                        <th>공지</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ok.slice(0, 25).map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      {kind === "report" ? (
                        <>
                          <td className="muted">{r.attendance || "—"}</td>
                          <td className="muted">
                            {r.wordTotal ? `${r.wordCorrect ?? 0}/${r.wordTotal}` : "—"}
                          </td>
                          <td className="muted">{r.done.join(", ") || "—"}</td>
                          <td className="muted">{r.weak.join(", ") || "—"}</td>
                          <td className="muted">{r.missing.join(", ") || "—"}</td>
                          <td className="muted" style={{ maxWidth: 240, whiteSpace: "normal" }}>
                            {(r.notice || "").slice(0, 40)}
                            {(r.notice || "").length > 40 ? "…" : ""}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="muted" style={{ maxWidth: 320, whiteSpace: "normal" }}>
                            {r.items.map((i2) => `${i2.name}: ${i2.detail}`).join(" / ").slice(0, 90)}
                          </td>
                          <td>{r.sent ? <span className="tag tag-mint">보냄</span> : "—"}</td>
                          <td className="muted" style={{ maxWidth: 200, whiteSpace: "normal" }}>
                            {(r.notice || "").slice(0, 30)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ok.length > 25 && (
              <p className="hint" style={{ marginTop: 6 }}>앞 25줄만 보여줍니다.</p>
            )}

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 12 }}
              onClick={save}
              disabled={pending || ok.length === 0}
            >
              {pending ? "옮기는 중…" : `${ok.length}줄 옮기기`}
            </button>
          </div>
        )}

        {result && (
          <div style={{ marginTop: 12 }}>
            {result.error ? (
              <div className="err">실패: {result.error}</div>
            ) : (
              <div className="notice">
                ✅ {result.saved}건 옮겼어요.
                {result.skipped?.length > 0 && (
                  <>
                    <br />
                    <b>건너뛴 {result.skipped.length}건</b> — 재원생 이름이 정확히 같아야 합니다.
                    <div className="hint" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                      {result.skipped.slice(0, 15).join("\n")}
                      {result.skipped.length > 15 ? "\n…" : ""}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
