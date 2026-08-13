"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseUnitAoA, UNIT_HEADERS, UNIT_FIELD_LABEL, rangeMangled } from "@/lib/importUnit";
import { UNIT_PROMPT } from "@/lib/unitPrompt";
import { readSheet } from "@/lib/readSheet";
import { bulkAddUnits, exportUnits } from "./actions";

const SHOW = ["textbook", "big", "mid", "small", "name", "question_no", "activity", "page_start", "page_end", "total_pages"];

export default function UnitUpload() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const router = useRouter();

  /**
   * **교재를 통째로 옮기는 가장 빠른 길** (2026-08-06).
   *
   * 30단원짜리 교재를 손으로 치면 한 권에 한 시간이 넘는다. 교재 PDF 를
   * 챗GPT·클로드에 올리고 이 글을 같이 붙이면 표가 나온다.
   *
   * 프롬프트 글은 `lib/unitPrompt` 에 있다 — **파서 옆**이다. 열 이름이나
   * 숫자 읽는 방식이 바뀌면 같이 고쳐야 하는 글이라, 문서 폴더에 두면 어긋난다.
   */
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(UNIT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // 클립보드를 막아둔 브라우저 — 창에 띄워서 직접 고르시게 한다
      window.prompt("아래 글을 복사해서 교재 PDF 와 함께 붙여넣으세요", UNIT_PROMPT);
    }
  }

  function reset() {
    setParsed(null);
    setFileName("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    /**
     * **원장님이 실제로 쓰시는 교재 세 권을 그대로 예시로 넣는다.**
     *
     * 「리딩튜터 입문 / Part 1 / Chapter 1」 같은 지어낸 예시는 보고 나서도
     * 내 교재를 어떻게 적을지 모른다. 올려주신 세 권이 **분량을 말하는
     * 방식이 서로 다르므로**, 그 셋을 다 보여드리면 어느 교재든 대응된다.
     *
     *   1) 중2 문법 워크북 — 한 쪽인데 문제가 25개 (**문항수가 분량**)
     *   2) 그 단원을 나눠 내는 줄 (**문항범위**만 적으면 개수는 앱이 센다)
     *   3) 수능 어법 교재 — 네 쪽짜리 (**쪽수가 분량**)
     *   4) 교과서 워크북 — Practice 4문항
     *   5) 단어책 — **단어수가 분량**
     */
    const examples = [
      ["중2 문법 워크북", "2026", "A 문장의 형식과 종류", "", "", "Unit 02 1형식·2형식",
       "", "", "3", "3", "1", "25", "1-25", "", "보어 자리에 형용사가 오는지 부사가 오는지 고르기", "25"],
      ["중2 문법 워크북", "2026", "A 문장의 형식과 종류", "", "", "Unit 02 1형식·2형식",
       "", "어휘 복습", "3", "3", "1", "", "16-25", "", "핵심 어휘 영↔한", ""],
      ["어법끝", "2025", "Part 1 Structure & Verbals", "UNIT 01 문장 구조", "",
       "Testing Point 01 동사 자리인가, 준동사 자리인가", "", "", "14", "17", "4", "", "", "",
       "본동사와 준동사를 가려내기", ""],
      ["Grammar Build Up 중2 동아(이병민)", "2026", "Lesson 5", "", "", "가주어 it",
       "", "Practice", "", "", "1", "4", "1-4", "", "It ~ to부정사 배열하기", "10"],
      ["워드마스터 중등실력", "2025", "", "", "", "DAY 01", "", "", "10", "13", "4", "", "", "40",
       "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet([UNIT_HEADERS, ...examples]);
    ws["!cols"] = UNIT_HEADERS.map((h) =>
      ({ wch: h === "교재명" ? 26 : h === "단원명" ? 26 : h === "핵심내용" ? 34 : 11 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "단원");
    XLSX.writeFile(wb, "클로이영어_단원_양식.xlsx");
  }

  /**
   * **지금 들어 있는 단원을 내려받는다.**
   *
   * 빈 양식에서 시작하면, 이미 200줄을 넣어둔 교재의 층을 바꾸려고 할 때
   * 그 200줄을 처음부터 다시 쳐야 한다. 내려받아 고쳐서 다시 올리면
   * **이름이 같은 것은 고쳐지고** 없는 것만 새로 생긴다.
   */
  async function downloadCurrent() {
    setBusy(true);
    const res = await exportUnits();
    setBusy(false);
    if (res?.error) { alert(res.error); return; }
    if (!res.rows?.length) { alert("아직 들어 있는 단원이 없어요."); return; }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([UNIT_HEADERS, ...res.rows]);
    ws["!cols"] = UNIT_HEADERS.map((h) =>
      ({ wch: h === "교재명" ? 26 : h === "단원명" ? 26 : h === "핵심내용" ? 34 : 11 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "단원");
    XLSX.writeFile(wb, `클로이영어_단원_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleFile(e) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    // **적힌 그대로 읽는다** (`lib/readSheet`). 예전에는 raw:false 로 읽어서
    // 엑셀 라이브러리가 「보기 좋게」 고친 값을 받았다 — 상담일지 193줄 중
    // 52줄이 그렇게 조용히 사라진 적이 있다. 단원 엑셀에서는 「1-25」 같은
    // 문항범위가 특히 위험하다
    setParsed(parseUnitAoA(await readSheet(file)));
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
  // 엑셀이 「1-25」 를 1월 25일로 고쳐놓은 줄 — 오류가 안 나서 안 짚어주면 모른다
  const mangled = parsed
    ? parsed.rows.filter((r) => rangeMangled(r.question_range))
    : [];

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
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>단원 엑셀로 추가</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(false); }}>닫기</button>
      </div>
      <p className="muted" style={{ margin: "8px 0 12px", fontSize: 14.5 }}>
        한 줄이 단원 하나입니다. <b>대·중·소단원</b>을 적으면 계층이 자동으로 만들어지고,
        같은 대단원은 한 번만 생성됩니다. 교재명이 없는 교재는 <b>자동으로 새로 만들어져요.</b>
        총분량을 비우면 시작·끝 페이지로 계산합니다.
      </p>
      <p className="hint" style={{ margin: "0 0 12px", lineHeight: 1.7 }}>
        <b>이미 넣어둔 단원을 고칠 때</b>는 「지금 단원 내려받기」 로 받아서 고친 뒤 다시 올리세요.
        빈 양식에서 다시 치지 않아도 됩니다 — 이름이 같은 단원은 <b>덮어써지고</b>,
        파일에서 지운 단원은 <b>자동으로 안 지웁니다</b> (학생 진도가 거기 걸려 있어요).
      </p>

      {/* **손으로 치지 않는 길.** 30단원짜리 교재는 한 권에 한 시간이 넘는다 */}
      <p className="hint" style={{ margin: "0 0 12px", lineHeight: 1.7 }}>
        <b>교재 PDF 가 있으시면</b> 「AI 프롬프트 복사」 를 눌러 챗GPT·클로드에
        교재와 함께 붙여넣으세요. 이 표 모양 그대로, <b>이 앱의 규칙에 맞게</b>
        채워줍니다 (문항 범위·핵심내용·분량까지). 나온 표를 엑셀로 저장해 올리시면 됩니다.
      </p>

      <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={copyPrompt}>
          {copied ? "✅ 복사됐어요" : "📋 AI 프롬프트 복사"}
        </button>
        <button className="btn btn-ghost" onClick={downloadTemplate}>⬇️ 빈 양식</button>
        <button className="btn" disabled={busy} onClick={downloadCurrent}>
          {busy ? "모으는 중…" : "⬇️ 지금 단원 내려받기"}
        </button>
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
              미리보기{" "}
              <span className="muted" style={{ fontWeight: 600 }}>
                {parsed.rows.length}줄 · 교재 {bookCount}권
              </span>
            </h3>
            {unknown.length > 0 && <span className="hint">무시된 열: {unknown.join(", ")}</span>}
          </div>

          {/* **엑셀이 「1-25」 를 1월 25일로 고쳐놓은 것.** 오류가 안 나므로
              짚어주지 않으면 그 단원의 분량이 영영 틀린 채로 남는다 */}
          {mangled.length > 0 && (
            <div className="err" style={{ marginTop: 10, lineHeight: 1.7 }}>
              <b>문항범위 {mangled.length}줄이 날짜로 바뀌어 있어요.</b>
              {" "}엑셀은 「1-25」 를 <b>1월 25일</b>로 알아듣고 고쳐 씁니다 — 오류가 안 나서
              그냥 두면 그 단원의 분량이 계속 틀립니다.
              <br />
              엑셀에서 <b>그 칸을 「텍스트」 서식으로 바꾸고</b> 다시 적어주세요.
              (또는 앞에 작은따옴표를 붙여 <code>&apos;1-25</code> 로 적으셔도 됩니다.)
              <br />
              <span className="hint">
                {mangled.slice(0, 4).map((r) => `${r.name || r.small || r.mid || r.big} → ${r.question_range}`).join(" · ")}
                {mangled.length > 4 ? ` … 그 밖 ${mangled.length - 4}줄` : ""}
              </span>
            </div>
          )}

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
                  <b style={{ fontSize: 14.5 }}>
                    파일에 없는 단원 {result.leftover.length}개
                  </b>
                  <p className="hint" style={{ margin: "4px 0 6px", fontSize: 12.5 }}>
                    엑셀에서 <b>지웠거나 이름을 바꾼</b> 단원이에요.
                    <b> 저절로 지우지 않았습니다</b> — 학생 진도가 단원에 걸려 있어서
                    지우면 그 기록도 함께 사라지거든요.
                    이름만 바꾸신 거라면, 교재 화면에서 <b>이름을 고치는 편</b>이 낫습니다
                    (진도가 그대로 따라옵니다).
                  </p>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {result.leftover.slice(0, 40).map((u) => (
                      <span key={u.id} className="tag tag-muted" style={{ fontSize: 12 }}>
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
