"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseScoreAoA } from "@/lib/importScore";
import { KIND_LABEL } from "@/lib/scores";
import { importScores } from "./importActions";
import { readSheet } from "@/lib/readSheet";

/**
 * **성적 한 번에 올리기** — 내신 · 문법 단원평가 · 모의고사를 한 장으로.
 *
 * 원장님 (2026-08-06)
 *   「성적은 내신, 문법단원평가, 모의고사 한번에 정리하고 싶은데 가능할까」
 *
 * 셋은 이미 한 표에 들어간다 — 종류만 다르다. 그래서 **한 장에 섞어 적으셔도**
 * 된다. 종류를 안 적은 줄은 앱이 짐작하고, **짐작한 것은 짐작했다고 표시한다** —
 * 조용히 정해버리면 모의고사가 내신에 섞여 있는 것을 아무도 모른다.
 *
 * 열 이름은 맞추라고 하지 않는다. 비슷하면 읽고, 못 읽은 열은 화면에 적어준다
 * (뭘 버렸는지 안 알려주면 「점수가 왜 안 들어갔지」 를 혼자 알아내셔야 한다).
 */
const HEADERS = [
  "학생명", "종류", "시험명", "응시일", "원점수", "만점",
  "등급", "백분위", "석차", "전체인원", "학교", "등급컷", "메모",
];

export default function ScoreUpload() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
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
    // **세 가지를 섞어서 보여준다.** 한 장에 같이 적어도 된다는 것을
    // 말로 설명하는 것보다 예시 세 줄이 빠르다
    const examples = [
      ["김서은", "내신", "1학기 중간고사", "2026-04-28", 92, 100, 2, "", 8, 210, "신송중", "90,84,77", ""],
      ["김서은", "단원평가", "Unit 5 관계대명사", "2026-05-12", 18, 20, "", "", "", "", "", "", "관계사 약함"],
      ["박지호", "모의고사", "3월 학력평가", "2026-03-26", 84, 100, 3, 78, "", "", "", "", ""],
      ["박지호", "", "1학기 기말고사", "2026-07-08", 88, 100, "", "", "", "", "", "", "종류를 비우면 앱이 짐작합니다"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...examples]);
    ws["!cols"] = HEADERS.map((h) => ({ wch: h === "시험명" ? 20 : 10 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "성적");
    XLSX.writeFile(wb, "클로이영어_성적_양식.xlsx");
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      // 적힌 그대로 읽는다 — 라이브러리가 날짜를 고쳐 쓰면 「2026-04-28」 이
      // 「4/28/26」 이 되어 엉뚱한 날로 들어간다 (lib/readSheet)
      const aoa = await readSheet(file);
      setParsed(parseScoreAoA(aoa, year));
      setFileName(file.name);
    } catch (err) {
      alert(`파일을 읽지 못했어요: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const rows = parsed?.rows || [];
  const good = rows.filter((r) => !r.empty);
  const guessed = good.filter((r) => r.guessed);
  const count = (k) => good.filter((r) => r.kind === k).length;

  if (!open) {
    return (
      <div className="card card-tight" style={{ marginTop: 10 }}>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>성적 한 번에 올리기</b>
          <span className="hint">내신 · 단원평가 · 모의고사를 한 장으로</span>
          <span className="spacer" />
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>열기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>성적 한 번에 올리기</b>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => { reset(); setOpen(false); }}>닫기</button>
      </div>

      <p className="hint" style={{ margin: "8px 0 10px", lineHeight: 1.8 }}>
        <b>내신 · 문법 단원평가 · 모의고사를 한 장에 섞어 적으셔도 됩니다.</b>{" "}
        셋은 앱 안에서 원래 한 표에 들어갑니다 — 종류만 다릅니다.
        <br />
        <b>열 이름을 맞추실 필요 없어요.</b> 학생명 · 시험명 · 점수처럼 비슷하면 읽습니다.
        <b> 종류를 비워두시면</b> 앱이 짐작하고, 짐작한 줄은 아래에 <b>「짐작」</b> 으로 표시합니다.
        <br />
        같은 <b>학생 · 종류 · 시험명 · 날짜</b> 는 한 건으로 봅니다 — 고쳐서 다시 올리셔도 안 늘어납니다.
      </p>

      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>양식 받기</button>
        <span className="hint">날짜에 연도가 없으면</span>
        <input
          className="input input-sm"
          style={{ width: 84 }}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <span className="hint">년으로 봅니다</span>
      </div>

      <div style={{ marginTop: 10 }}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onFile}
          disabled={busy}
          style={{ fontSize: 13 }}
        />
        {busy && <span className="hint" style={{ marginLeft: 8 }}>읽는 중…</span>}
      </div>

      {parsed && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 13.5 }}>{fileName}</b>
            <span className="tag tag-sky">{good.length}줄</span>
            {count("school") > 0 && <span className="tag tag-mint">내신 {count("school")}</span>}
            {count("unit") > 0 && <span className="tag tag-lav">단원평가 {count("unit")}</span>}
            {count("mock") > 0 && <span className="tag tag-amber">모의고사 {count("mock")}</span>}
            {rows.length - good.length > 0 && (
              <span className="tag tag-muted">점수 없는 줄 {rows.length - good.length}</span>
            )}
          </div>

          {/* 못 읽은 열 — 뭘 버렸는지 알려주지 않으면 혼자 알아내셔야 한다 */}
          {parsed.unknown.length > 0 && (
            <div className="notice" style={{ fontSize: 12.5 }}>
              <b>못 읽은 열이 있어요:</b> {parsed.unknown.join(" · ")}
              <br />
              이 열은 안 들어갑니다. 필요하시면 열 이름을 <b>{HEADERS.join(" · ")}</b> 중 하나로 바꿔주세요.
            </div>
          )}

          {guessed.length > 0 && (
            <div className="notice" style={{ fontSize: 12.5 }}>
              <b>종류를 안 적으신 줄이 {guessed.length}개</b> 있어서 앱이 짐작했습니다.
              아래 <b>「짐작」</b> 이 붙은 줄을 한 번 봐주세요 — 틀렸으면 엑셀의 「종류」 칸을
              채워서 다시 올리시면 됩니다.
            </div>
          )}

          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="tbl tbl-tight">
              <thead>
                <tr>
                  <th>학생</th><th>종류</th><th>시험</th><th>날짜</th><th>점수</th><th>등급</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ opacity: r.empty ? 0.45 : 1 }}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>
                      <span className="tag tag-muted">{KIND_LABEL[r.kind]}</span>
                      {r.guessed && <span className="tag tag-amber" style={{ marginLeft: 3 }}>짐작</span>}
                    </td>
                    <td className="muted">{r.term || ""}</td>
                    <td className="muted">{r.taken_on || ""}</td>
                    <td>
                      {r.raw_score != null
                        ? `${r.raw_score}${r.full_score ? ` / ${r.full_score}` : ""}`
                        : ""}
                    </td>
                    <td>{r.grade ?? ""}{r.percentile != null ? ` (${r.percentile})` : ""}</td>
                    <td className="hint">{r.empty ? "점수 없음 — 안 들어감" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || good.length === 0}
              onClick={() =>
                startTransition(async () => {
                  const res = await importScores(good);
                  if (res?.error) { alert(res.error); return; }
                  setResult(res);
                  router.refresh();
                })
              }
            >
              {pending ? "넣는 중…" : `${good.length}줄 넣기`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={reset} disabled={pending}>
              다시 고르기
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="tag tag-mint">새로 {result.saved}건</span>
            {result.updated > 0 && <span className="tag tag-sky">덮어씀 {result.updated}건</span>}
            {result.skipped?.length > 0 && (
              <span className="tag tag-amber">못 넣음 {result.skipped.length}건</span>
            )}
          </div>
          {result.skipped?.length > 0 && (
            <div className="notice" style={{ fontSize: 12.5 }}>
              <b>못 넣은 것</b>
              <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                {result.skipped.slice(0, 20).map((x, i) => (
                  <div key={i}>· {x.name} {x.term && `(${x.term})`} — {x.why}</div>
                ))}
                {result.skipped.length > 20 && <div>· … 그 밖 {result.skipped.length - 20}건</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
