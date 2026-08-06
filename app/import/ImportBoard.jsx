"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sheetToRows, parseReportRow, parseHomeworkRow, parseTaskRow, parseAbsenceRow,
} from "@/lib/importNotion";
import { parsePaymentRow } from "@/lib/importPayment";
import { parseNoteAoA } from "@/lib/importNote";
import {
  importReports, importHomework, importTasks, importAbsences, importPayments, importNotes,
} from "./actions";

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
  {
    key: "task",
    label: "일정 · 할일",
    db: "학사일정DB",
    hint:
      "제목에 시험·방학·휴업·행사가 들어가면 일정으로, 나머지는 할일로 들어갑니다. " +
      "직접 만든 엑셀도 됩니다 — 열 이름을 제목 / 종류 / 분류 / 날짜 / 끝날 / 메모 로 두세요.",
  },
  {
    key: "absence",
    label: "결석 · 보강",
    db: "보강문자DB",
    hint:
      "결석은 결석으로, 보강날짜가 있으면 그 날에 보강으로 들어갑니다. " +
      "재시험·추가학습처럼 결석이 아닌 것은 보강만 기록합니다.",
  },
  {
    key: "note",
    label: "상담일지",
    db: "재원생상담일지DB",
    hint:
      "노션에서 내린 CSV 를 그대로 올리시면 됩니다. " +
      "날짜는 내용 머리에 「10/1)」 처럼 적어두신 것이 있으면 그것을 쓰고(있었던 날), " +
      "없으면 상담일을 씁니다(적어둔 날). " +
      "한 줄에 형제가 같이 걸린 상담은 학생별로 나눠서 들어갑니다. " +
      "같은 학생·날짜·제목은 한 건이라 다시 올리셔도 안 늘어납니다.",
    // 이 탭만 **한 장을 통째로** 읽는다 (형제 상담을 나누려면 줄 하나가
    // 여러 줄이 되어야 하는데, 줄 단위 파서로는 그것을 못 한다)
    whole: true,
  },
  {
    key: "payment",
    label: "수납",
    db: "결제선생 등",
    hint:
      "받았는지만 들어옵니다 (금액 계산은 앱이 이미 합니다). " +
      "열 이름을 맞출 필요 없어요 — 학생명 · 결제일 · 상태 · 금액 비슷한 이름이면 알아서 읽습니다. " +
      "미납·실패·취소로 적힌 줄은 '안 받음'으로 들어갑니다.",
  },
];

const PARSE = {
  report: parseReportRow,
  homework: parseHomeworkRow,
  task: parseTaskRow,
  absence: parseAbsenceRow,
  payment: parsePaymentRow,
};
/** 한 장을 통째로 읽는 것 — 줄 하나가 여러 줄이 될 수 있다 */
const WHOLE = {
  note: parseNoteAoA,
};
const SAVE = {
  report: importReports,
  homework: importHomework,
  task: importTasks,
  absence: importAbsences,
  payment: importPayments,
  note: importNotes,
};

export default function ImportBoard() {
  const [kind, setKind] = useState("report");
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  // 노션 CSV 에는 지난 해까지 다 들어 있다. 필요한 기간만 골라 옮긴다
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
    const y = parseInt(year, 10) || new Date().getFullYear();
    // 상담일지는 **한 장을 통째로** 읽는다 — 형제가 같이 걸린 상담 한 줄이
    // 학생 수만큼의 줄이 되어야 해서, 줄 단위 파서로는 안 된다
    if (WHOLE[kind]) {
      setRows(WHOLE[kind](aoa).rows);
      return;
    }
    const objs = sheetToRows(aoa);
    setRows(objs.map((o) => PARSE[kind](o, y)));
  }

  function save() {
    if (ok.length === 0) return;
    startTransition(async () => {
      const res = await SAVE[kind](ok);
      setResult(res);
      if (!res.error) router.refresh();
    });
  }

  // 옮길 수 있는 줄의 조건은 종류마다 다르다
  const usable = (r) =>
    kind === "task" ? !!(r.title && r.due_on)
    : kind === "absence" ? !!(r.name && (r.absentOn || r.makeupOn))
    : kind === "payment" ? !!(r.name && r.ym)
    : !!(r.name && r.date);

  // 그 줄이 가리키는 날짜 (기간으로 거를 때 쓴다)
  const dateOf = (r) =>
    kind === "task" ? r.due_on
    : kind === "absence" ? r.absentOn || r.makeupOn
    : kind === "payment" ? r.paidOn        // 미납은 날짜가 없다 → 기간에 안 걸린다
    : r.date;
  const inRange = (r) => {
    const d = dateOf(r);
    if (!d) return true;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const all = (rows || []).filter(usable);
  const ok = all.filter(inRange);
  const outOfRange = all.length - ok.length;
  const bad = (rows || []).filter((r) => !usable(r));

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
          {kind === "payment" ? (
            <>
              <b>결제선생</b>(또는 쓰시는 수납 서비스)에서 <b>내보내기 · 엑셀 다운로드</b> 로
              받은 파일을 그대로 올리세요.
            </>
          ) : (
            <>
              노션에서 <b>{meta.db}</b> 를 열고 → 오른쪽 위 <b>···</b> → <b>Export</b> →
              형식 <b>CSV</b> → 내려받은 파일을 아래에 올리세요.
            </>
          )}
          <br />
          {meta.hint}{" "}
          {kind === "payment"
            ? "같은 학생·달이 이미 있으면 덮어씁니다."
            : kind === "note"
            ? ""
            : "같은 날짜·학생이 이미 있으면 덮어씁니다."}
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
          <div className="field" style={{ width: 150 }}>
            <label className="label">이 날짜부터</label>
            <input
              className="input input-sm"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="label">이 날짜까지</label>
            <input
              className="input input-sm"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: "flex-end" }}
            onClick={() => {
              const y = parseInt(year, 10) || new Date().getFullYear();
              setFrom(`${y}-01-01`);
              setTo(`${y}-12-31`);
            }}
          >
            {year}년만
          </button>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFile}
            className="input"
            style={{ padding: 9, flex: 1, minWidth: 240 }}
          />
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          노션 CSV 에는 지난 해까지 다 들어 있습니다. <b>기간을 정하면 그 안의 줄만</b> 옮깁니다.
          비워두면 전부 옮깁니다.
        </p>
        <p className="hint" style={{ marginTop: 6 }}>
          노션 제목이 <b>07/20/월 김서은 DP</b> 형태라 날짜에 연도가 없습니다. 위 연도를 맞춰주세요.
        </p>
        {fileName && <p className="hint">선택된 파일: {fileName}</p>}

        {rows && (
          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
              <b style={{ fontSize: 13.5 }}>미리보기</b>
              <span className="tag tag-mint">옮길 수 있음 {ok.length}</span>
              {outOfRange > 0 && (
                <span className="tag tag-muted" title="정해둔 기간 밖이라 안 옮깁니다">
                  기간 밖 {outOfRange}
                </span>
              )}
              {bad.length > 0 && (
                <span className="tag tag-amber">
                  {kind === "task" ? "제목·날짜" : "이름·날짜"} 못 읽음 {bad.length}
                </span>
              )}
            </div>

            <div className="tblwrap" style={{ marginTop: 8 }}>
              <table className="tbl tbl-tight">
                <thead>
                  <tr>
                    {kind === "task" ? (
                      <>
                        <th>날짜</th>
                        <th>제목</th>
                        <th>종류</th>
                        <th>분류</th>
                        <th>메모</th>
                      </>
                    ) : kind === "absence" ? (
                      <>
                        <th>결석일</th>
                        <th>학생</th>
                        <th>보강일</th>
                        <th>사유</th>
                        <th>상태</th>
                      </>
                    ) : kind === "note" ? (
                      <>
                        <th>날짜</th>
                        <th>학생</th>
                        <th>제목</th>
                        <th>상담 내용</th>
                        <th></th>
                      </>
                    ) : kind === "payment" ? (
                      <>
                        <th>달</th>
                        <th>학생</th>
                        <th>금액</th>
                        <th>받은 날</th>
                        <th>수단</th>
                        <th>상태</th>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {kind === "task" && ok.slice(0, 25).map((r, i) => (
                    <tr key={i}>
                      <td>{r.due_on}{r.end_on ? ` ~ ${r.end_on.slice(5)}` : ""}</td>
                      <td style={{ fontWeight: 600 }}>{r.title}</td>
                      <td>
                        <span className={`tag ${r.kind === "todo" ? "tag-amber" : "tag-sky"}`}>
                          {r.kind === "todo" ? "할일" : "일정"}
                        </span>
                      </td>
                      <td className="muted">{r.category || "—"}</td>
                      <td className="muted" style={{ maxWidth: 240, whiteSpace: "normal" }}>
                        {(r.note || "").slice(0, 40) || "—"}
                      </td>
                    </tr>
                  ))}
                  {kind === "absence" && ok.slice(0, 25).map((r, i) => (
                    <tr key={i}>
                      <td>
                        {r.isAbsence ? r.absentOn || "—" : "—"}
                        {r.isAbsence && r.absentGuessed && (
                          <span className="tag tag-amber" style={{ marginLeft: 4 }}>추정</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td className="muted">{r.makeupOn || "—"}</td>
                      <td className="muted" style={{ maxWidth: 200, whiteSpace: "normal" }}>
                        {r.reason || "—"}
                      </td>
                      <td>
                        {r.none ? <span className="tag tag-muted">보강 없음</span>
                          : r.done ? <span className="tag tag-mint">완료</span>
                          : <span className="tag tag-amber">미완료</span>}
                      </td>
                    </tr>
                  ))}
                  {kind === "note" && ok.slice(0, 25).map((r, i) => (
                    <tr key={i}>
                      <td>
                        {r.date}
                        {/* 내용 머리에 적어두신 날짜를 쓴 줄 — 상담일과 다르다.
                            어느 쪽을 썼는지 안 보이면 「날짜가 왜 다르지」 가 된다 */}
                        {r.dateFrom === "body" && (
                          <span className="tag tag-sky" style={{ marginLeft: 4 }}>내용 날짜</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {r.name}
                        {r.split && (
                          <span className="tag tag-lav" style={{ marginLeft: 4 }}>형제 나눔</span>
                        )}
                      </td>
                      <td className="muted">{r.title || "—"}</td>
                      <td className="muted" style={{ maxWidth: 380, whiteSpace: "normal" }}>
                        {(r.body || "").slice(0, 90) || "—"}
                      </td>
                      <td>
                        {!r.body && <span className="tag tag-muted">내용 없음</span>}
                      </td>
                    </tr>
                  ))}
                  {kind === "payment" && ok.slice(0, 25).map((r, i) => (
                    <tr key={i}>
                      <td>{r.ym}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td className="muted">{r.amount === null ? "—" : r.amount.toLocaleString()}</td>
                      <td className="muted">{r.paidOn || "—"}</td>
                      <td className="muted">{r.method || "—"}</td>
                      <td>
                        {r.paid
                          ? <span className="tag tag-mint">받음</span>
                          : <span className="tag tag-red">{r.status || "안 받음"}</span>}
                      </td>
                    </tr>
                  ))}
                  {(kind === "report" || kind === "homework") && ok.slice(0, 25).map((r, i) => (
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
                    <b>건너뛴 {result.skipped.length}건</b>
                    {kind === "task"
                      ? " — 같은 날짜·같은 제목이 이미 있는 줄입니다."
                      : " — 재원생 이름이 정확히 같아야 합니다."}
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
