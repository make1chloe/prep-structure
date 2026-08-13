"use client";

/**
 * **영상 엑셀로 한 번에** (원장님, 2026-08-09 — 「영상 엑셀로 한 번에 넣을
 * 수 있게 해 줘」).
 *
 * 교재 엑셀(app/textbooks/TextbookUpload.jsx)과 **같은 모양**으로 둔다 —
 * 양식 받기 · 지금 것 내려받기 · 올리고 미리보기 · 저장. 화면마다 올리는
 * 방법이 다르면 그때그때 다시 배우셔야 한다.
 */

import { useState, useRef, useTransition } from "react";
import { readSheet } from "@/lib/readSheet";
import { useRouter } from "next/navigation";
import { parseVideoAoA, VIDEO_FIELD_LABEL, VIDEO_HEADERS } from "@/lib/importVideo";
import { bulkAddVideos, exportVideos } from "./actions";

const SHOW = ["title", "url", "folder", "note"];

export default function VideoUpload() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
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
    const example = ["", "https://youtu.be/abc12345678", "문법 - 관계대명사", ""];
    const ws = XLSX.utils.aoa_to_sheet([VIDEO_HEADERS, example]);
    ws["!cols"] = [{ wch: 34 }, { wch: 40 }, { wch: 18 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "영상");
    XLSX.writeFile(wb, "클로이영어_영상_양식.xlsx");
  }

  async function downloadCurrent() {
    setBusy(true);
    const res = await exportVideos();
    setBusy(false);
    if (res?.error) { alert(res.error); return; }
    if (!res.rows?.length) { alert("아직 들어 있는 영상이 없어요."); return; }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([VIDEO_HEADERS, ...res.rows]);
    ws["!cols"] = [{ wch: 34 }, { wch: 40 }, { wch: 18 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "영상");
    XLSX.writeFile(wb, `클로이영어_영상_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleFile(e) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsed(parseVideoAoA(await readSheet(file)));
  }

  /**
   * **결과는 화면 글로만 두면 안 된다** (2026-08-09에 찍어보고 알았다).
   *
   * 저장이 끝나면 목록을 새로 받아야 하는데(router.refresh), 그때 이 상자가
   * 통째로 다시 그려지면서 **열어둔 것도 결과 글도 같이 사라졌다.** 화면에는
   * 아무 말도 안 남고 목록만 늘어나 있어서, 몇 개가 들어갔는지 · 건너뛴 것이
   * 있는지 · 못 넣은 줄이 있는지를 알 길이 없었다.
   *
   * 그래서 **알림창으로도 한 번 말한다.** 다시 그려져도 알림은 남는다.
   */
  function handleSave() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await bulkAddVideos(parsed.rows);
      setResult(res);
      if (res.error) return;
      const lines = [`영상 ${res.inserted}개를 넣었어요.`];
      if (res.madeFolders > 0) lines.push(`폴더 ${res.madeFolders}개를 새로 만들었습니다.`);
      if (res.skipped > 0) lines.push(`${res.skipped}개는 이미 들어 있는 영상이라 넘어갔어요.`);
      if (res.titleNote) lines.push(res.titleNote);
      if (res.bad?.length) {
        lines.push("", `주소가 아니라 못 넣은 줄 ${res.bad.length}개 (유튜브·비메오만 됩니다) —`);
        res.bad.slice(0, 10).forEach((b) => lines.push(`  · ${b}`));
      }
      alert(lines.join("\n"));
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
          ＋ 엑셀로 한 번에 넣기
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>영상 엑셀로 추가</h2>
        <button
          className="btn btn-ghost"
          onClick={() => { reset(); setOpen(false); }}
          style={{ padding: "6px 10px" }}
        >
          닫기
        </button>
      </div>
      {/**
        * **주소만 있으면 된다.** 제목을 꼭 적어야 한다고 하면, 스무 개를
        * 넣으려고 스무 번 유튜브에 들어가 제목을 복사해 오셔야 한다.
        */}
      <p className="muted" style={{ margin: "8px 0 14px", fontSize: 14.5, lineHeight: 1.7 }}>
        <b>주소만 있으면 됩니다.</b> 제목은 유튜브에서 받아옵니다 (설정에 유튜브 키가 있을 때).
        <br />
        폴더 이름을 적으면 그 폴더에 들어가고, <b>없는 이름이면 폴더를 새로 만듭니다.</b>
        이미 들어 있는 영상은 건너뜁니다.
      </p>

      <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={handleDownloadTemplate}>
          ⬇️ 양식 다운로드
        </button>
        <button className="btn btn-ghost btn-sm" onClick={downloadCurrent} disabled={busy}>
          {busy ? "모으는 중…" : "⬇️ 지금 영상 내려받기"}
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
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              미리보기 <span className="muted" style={{ fontWeight: 600 }}>{parsed.rows.length}개</span>
            </h3>
            {unknown.length > 0 && <span className="hint">무시된 열: {unknown.join(", ")}</span>}
          </div>

          {parsed.rows.length === 0 ? (
            <div className="err" style={{ marginTop: 10 }}>
              인식된 영상이 없어요. 첫 줄이 열 이름(제목·주소·폴더·메모)인지,
              <b> 주소 칸이 채워져 있는지</b> 확인해주세요.
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table className="tbl">
                  <thead>
                    <tr>{SHOW.map((f) => <th key={f}>{VIDEO_FIELD_LABEL[f]}</th>)}</tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 30).map((r, i) => (
                      <tr key={i}>
                        {SHOW.map((f) => (
                          <td key={f} className={f === "url" ? "" : "muted"}>
                            {r[f] || (f === "title" ? "(유튜브에서 받아옴)" : "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > 30 && (
                <p className="hint" style={{ marginTop: 6 }}>… 외 {parsed.rows.length - 30}개 (전체 저장됨)</p>
              )}
              <button
                className="btn btn-primary btn-block"
                onClick={handleSave}
                disabled={pending}
                style={{ marginTop: 12 }}
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
            <div className="notice" style={{ lineHeight: 1.8 }}>
              ✅ {result.inserted}개 저장 완료!
              {result.madeFolders > 0 && <><br />폴더 {result.madeFolders}개를 새로 만들었어요.</>}
              {result.skipped > 0 && <><br />{result.skipped}개는 <b>이미 들어 있는 영상</b>이라 넘어갔어요.</>}
              {result.titleNote && <><br /><span className="hint">{result.titleNote}</span></>}
              {/* **틀린 줄은 몇 번째인지 말해준다** — 「안 들어갔어요」 로는 못 고친다 */}
              {result.bad?.length > 0 && (
                <>
                  <br />
                  <b>주소가 아닌 줄 {result.bad.length}개는 못 넣었어요</b> (유튜브·비메오만 됩니다) —
                  <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                    {result.bad.slice(0, 8).map((b, i) => (
                      <span key={i} className="hint" style={{ fontSize: 13 }}>· {b}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
