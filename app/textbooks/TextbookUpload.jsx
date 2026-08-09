"use client";

import { useState, useRef, useTransition } from "react";
import { readSheet } from "@/lib/readSheet";
import { useRouter } from "next/navigation";
import { parseTextbookAoA, TB_FIELD_LABEL, TEXTBOOK_HEADERS } from "@/lib/importTextbook";
import { bulkAddTextbooks, exportTextbooks } from "./actions";

const SHOW = ["name", "area", "target_grade", "total_pages", "price", "word_range"];

export default function TextbookUpload() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);   // 지금 교재 모으는 중
  const [pending, startTransition] = useTransition();
  const inputRef = useRef(null);
  const router = useRouter();

  /**
   * **저장한 뒤에는 결과를 지우지 않는다** (2026-08-09에 겪었다).
   *
   * 예전에는 저장이 끝나면 reset() 이 결과까지 지웠다. 그래서 잘 들어간
   * 경우에도 **화면에 아무 말이 안 남았고**, 몇 개가 들어갔는지 · 몇 개가
   * 건너뛰어졌는지 · 못 넣은 줄이 있었는지가 통째로 사라졌다.
   * 골라둔 파일만 비운다.
   */
  function reset(keepResult = false) {
    setParsed(null);
    setFileName("");
    if (!keepResult) setResult(null);
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

  /**
   * **지금 들어 있는 교재를 내려받는다.**
   *
   * 빈 양식만 있으면 「이미 앱에 뭐가 들어 있나」 를 화면에서 눈으로 세어
   * 옮겨 적어야 한다. 내려받아 고쳐 다시 올리면 **이름이 같은 교재는
   * 고쳐지고** 없는 것만 새로 생긴다.
   *
   * 비고에 단원 수가 같이 적혀 나온다 — 어느 교재에 아직 단원이 없는지가
   * 파일만 보고도 보인다.
   */
  async function downloadCurrent() {
    setBusy(true);
    const res = await exportTextbooks();
    setBusy(false);
    if (res?.error) { alert(res.error); return; }
    if (!res.rows?.length) { alert("아직 들어 있는 교재가 없어요."); return; }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([TEXTBOOK_HEADERS, ...res.rows]);
    ws["!cols"] = TEXTBOOK_HEADERS.map((h) => ({ wch: h === "교재명" ? 26 : h === "비고" ? 30 : 12 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "교재");
    XLSX.writeFile(wb, `클로이영어_교재_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleFile(e) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    // 적힌 그대로 읽는다 (`lib/readSheet`) — 단원 올리기와 같은 규칙
    setParsed(parseTextbookAoA(await readSheet(file)));
  }

  function handleSave() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await bulkAddTextbooks(parsed.rows);
      setResult(res);
      if (res.error) return;
      /**
       * **알림창으로도 한 번 말한다** (2026-08-09). 저장 뒤 목록을 새로 받으면
       * 이 상자가 다시 그려지면서 결과 글이 같이 사라진다 — 화면에는 아무
       * 말도 안 남고 목록만 늘어나 있다.
       */
      alert(
        `교재 ${res.inserted}권을 넣었어요.`
        + (res.skipped > 0 ? `\n${res.skipped}권은 이미 있는 교재라 넘어갔습니다.` : "")
      );
      if (res.inserted > 0) {
        reset(true);          // 방금 무슨 일이 있었는지는 남겨둔다
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
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
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
        <button className="btn btn-ghost btn-sm" onClick={downloadCurrent} disabled={busy}>
          {busy ? "모으는 중…" : "⬇️ 지금 교재 내려받기"}
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
            <div className="notice">
              ✅ {result.inserted}권 저장 완료!
              {result.skipped > 0 && (
                <>
                  <br />
                  {result.skipped}권은 <b>이미 있는 교재</b>라 넘어갔어요 — 띄어쓰기나
                  「2025 개정」 같은 표기만 다른 것도 같은 교재로 봅니다.
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
