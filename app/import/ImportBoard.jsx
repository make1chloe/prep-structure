"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sheetToRows, parseReportRow, parseHomeworkRow, parseTaskRow, parseAbsenceRow,
} from "@/lib/importNotion";
import { parsePaymentRow } from "@/lib/importPayment";
import { parseNoteAoA } from "@/lib/importNote";
import { parseInquiryAoA } from "@/lib/importInquiry";
import { parseUnitAoA, parseWrongAoA } from "@/lib/importExam";
import { parseBookGuideAoA } from "@/lib/importBookGuide";
import { readSheet } from "@/lib/readSheet";
import { MOCK_SPEC, byTopic } from "@/lib/examSpec";
import { STATUS } from "@/app/consult/status";
import {
  importReports, importHomework, importTasks, importAbsences, importPayments, importNotes,
  importInquiries, importUnitScores, importWrongAnswers, importBookGuide,
} from "./actions";

const INQ_LABEL = Object.fromEntries(STATUS.map((s) => [s.key, s.label]));
const INQ_CLS = Object.fromEntries(STATUS.map((s) => [s.key, s.cls]));

/** 미리보기에 몇 줄까지 보여줄까 — 자료가 짧으면 다 보여드리는 편이 낫다 */
const SHOW = { inquiry: 60, unit: 40, wrong: 40, bookGuide: 40 };
const showOf = (k) => SHOW[k] || 25;

/**
 * 틀린 번호만 보고 **어느 영역이 약한지** 미리 알려준다.
 * 넣기 전에 「이 아이는 빈칸추론이구나」 가 보이면, 잘못 올렸을 때 바로 안다.
 */
function weakOf(nos = []) {
  const t = byTopic(MOCK_SPEC, nos)
    .filter((x) => x.wrong > 0)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total);
  if (t.length === 0) return "—";
  return t.slice(0, 3).map((x) => `${x.topic} ${x.wrong}/${x.total}`).join(" · ");
}

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
      "노션에서 내린 CSV 를 그대로 올리시면 됩니다 — 한 번만 하시면 끝이고, " +
      "그다음부터는 상담일지를 앱에서 쓰십니다. " +
      "날짜는 내용 머리에 「10/1)」 처럼 적어두신 것이 있으면 그것을 쓰고(있었던 날), " +
      "없으면 상담일을 씁니다(적어둔 날). " +
      "한 줄에 형제가 같이 걸린 상담은 학생별로 나눠서 들어갑니다. " +
      "같은 학생·날짜·제목은 한 건이라 다시 올리셔도 안 늘어납니다. " +
      "재원생 목록에 없는 이름은 「퇴원」 으로 새로 만들어서 그 학생 앞으로 넣습니다 — " +
      "그만둔 아이의 상담 이력이 제일 아깝기 때문입니다.",
    // 이 탭만 **한 장을 통째로** 읽는다 (형제 상담을 나누려면 줄 하나가
    // 여러 줄이 되어야 하는데, 줄 단위 파서로는 그것을 못 한다)
    whole: true,
  },
  {
    key: "inquiry",
    label: "신규 문의",
    db: "방문상담목록DB",
    hint:
      "문의 → 방문상담 → 레벨테스트 → 등록까지가 「신규 상담」 화면으로 들어옵니다. " +
      "노션의 자동화 칸(등록작성 · 예약안내완료 · 티오연락 · 응답자)과 " +
      "메이크용으로 겹쳐 적힌 칸은 안 옮깁니다 — 그 일은 이제 앱이 합니다. " +
      "등원시작일 · 수강료 · 생일 · 주소 · 교재는 따로 칸이 없어서 메모 밑에 한 줄로 붙습니다. " +
      "「입학결정」 은 등록으로, 「방문취소」 와 문의종료된 줄은 미등록으로 들어갑니다. " +
      "레벨테스트와 방문상담은 따로 진행하시는 다른 약속이라 날짜도 따로 들어갑니다. " +
      "번호가 같은 줄은 한 사람으로 합치고, 이름만 같고 번호가 다르면 " +
      "「이민재A · 이민재B」 로 나눠 적습니다 — 목록에 같은 이름이 둘이면 어느 쪽에 " +
      "적는 것인지 알 수 없기 때문입니다. " +
      "이름을 못 여쭌 문의는 「이름 없음」 으로 두고 적혀 있던 글자는 메모에 남깁니다. " +
      "같은 이름·번호가 이미 있으면 덮어쓰니 다시 올리셔도 안 늘어납니다.",
    whole: true,
  },
  {
    key: "unit",
    label: "단원평가",
    db: "3단원평가DB",
    hint:
      "문법 단원평가가 성적으로 들어옵니다 — 단원명 · 통과/재시험 · 점수. " +
      "같은 학생·같은 단원이 여러 번 있는 것은 중복이 아니라 기록입니다 (재시험 → 통과). " +
      "그래서 날짜까지 같아야 한 건으로 봅니다 — 몇 번 만에 통과했는지가 그대로 남습니다. " +
      "날짜 칸이 빈 줄은 적어두신 날(생성 일시)로 넣습니다.",
    whole: true,
  },
  {
    key: "wrong",
    label: "모의고사 오답",
    db: "모의고사 오답분석DB",
    hint:
      "점수뿐 아니라 문항별 오답까지 들어옵니다 — 몇 번을 틀렸고 왜 틀렸는지. " +
      "모의고사 45문항의 유형은 앱이 알고 있어서(듣기 1~17 · 어법 29 · 빈칸추론 31~34 …) " +
      "틀린 번호만 있으면 영역별 정답률이 계산됩니다. " +
      "틀린 번호 칸이 비어 있어도 「N번 틀린 이유」 가 적혀 있으면 그 번호도 틀린 것으로 봅니다. " +
      "아이가 적어 낸 점수와 실제 점수가 다르면 실제 점수를 쓰고 메모에 남깁니다.",
    whole: true,
  },
  {
    key: "bookGuide",
    label: "교재안내 기록",
    db: "교재구매DB",
    hint:
      "교재안내를 보낸 날짜가 교재 시작일(사용예정일)로 들어갑니다 — 재원생 정보의 " +
      "「📅 날짜 지정해서 추가」 와 같은 규칙입니다. " +
      "한 통에 교재가 여러 권이면 각각 따로 배정됩니다. " +
      "교재 이름이 교재 목록의 이름과 정확히 같아야 합니다 — " +
      "다르면(또는 그 교재가 아직 없으면) 그 줄은 건너뛰고 알려드립니다. " +
      "교재 화면에서 먼저 만드신 뒤 다시 올리시면 그때 들어갑니다.",
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
  inquiry: parseInquiryAoA,
  unit: parseUnitAoA,
  wrong: parseWrongAoA,
  bookGuide: parseBookGuideAoA,
};
const SAVE = {
  report: importReports,
  homework: importHomework,
  task: importTasks,
  absence: importAbsences,
  payment: importPayments,
  note: importNotes,
  inquiry: importInquiries,
  unit: importUnitScores,
  wrong: importWrongAnswers,
  bookGuide: importBookGuide,
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
    // 파일은 **적힌 그대로** 읽는다 (lib/readSheet).
    //   전에는 여기서 codepage 를 억지로 지정하고 raw:false 로 읽었는데,
    //   그러면 라이브러리가 「2025/03/14」 를 날짜로 알아보고 「3/14/25」 로
    //   고쳐 쓴다. 그 줄들은 「날짜 없음」 이 되어 **조용히 사라졌다** —
    //   상담일지 193줄 중 52줄이 그렇게 없어졌고 오류도 안 났다.
    const aoa = await readSheet(file);
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
    // 신규 문의는 **날짜가 없어도 옮긴다.** 아직 방문 약속을 안 잡은 문의가
    // 절반이고, 그것이야말로 챙겨야 할 줄이다
    : kind === "inquiry" ? !!(r.name && !r.skip)
    : kind === "unit" ? !!(r.name && r.date && r.unit)
    : kind === "wrong" ? !!(r.name && r.date)
    : !!(r.name && r.date);

  // 그 줄이 가리키는 날짜 (기간으로 거를 때 쓴다)
  const dateOf = (r) =>
    kind === "task" ? r.due_on
    : kind === "absence" ? r.absentOn || r.makeupOn
    : kind === "payment" ? r.paidOn        // 미납은 날짜가 없다 → 기간에 안 걸린다
    : kind === "inquiry" ? r.consult_on || r.test_on
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

  /**
   * **연도를 짐작한 줄** (원장님, 2026-08-06 — 「24,25,26년이 서로 구별되지
   * 않게 적혀서 혼용된 거 없나 싹 확인해줘」).
   *
   * 노션은 날짜를 「12/30」 처럼 연도 없이 적어둔 것이 많다 — 특히 제목이
   * 그렇다. 그런 줄은 위 **연도 칸**의 값을 붙인다. 그러니까 2024년 자료를
   * 올리면서 연도 칸이 2026 이면 **2024년 수업이 통째로 2026년이 된다.**
   * 오류도 안 나고, 화면에는 「옮길 수 있음 141줄」 이라고 멀쩡히 뜬다.
   *
   * 그래서 **몇 줄이 짐작인지 세어서 보여준다.** 짐작을 없앨 수는 없다 —
   * 파일에 없는 것을 만들어낼 수는 없으니까. 대신 원장님이 아셔야 한다.
   */
  const guessedRows = ok.filter((r) => r.yearGuessed);
  const guessedYears = [...new Set(
    guessedRows.map((r) => (dateOf(r) || "").slice(0, 4)).filter(Boolean)
  )];
  // 옮길 줄에 **연도가 여럿 섞여 있나** — 한 파일에 24·25·26년이 다 들어 있는 일이 흔하다
  const yearsInFile = [...new Set(
    ok.map((r) => (dateOf(r) || "").slice(0, 4)).filter(Boolean)
  )].sort();

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
        <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>
          {meta.label} 옮기기
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.7 }}>
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
            : kind === "bookGuide"
            ? "이미 배정된 교재는 건드리지 않고 건너뜁니다."
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
        {/* 이 표들만 제목에서 날짜를 뽑는다. 신규 문의·상담일지·수납은 날짜에
            연도가 적혀 있어서 위 「연도」 를 안 본다 */}
        {["report", "homework", "task", "absence"].includes(kind) && (
          <p className="hint" style={{ marginTop: 6 }}>
            노션 제목이 <b>07/20/월 김서은 DP</b> 형태라 날짜에 연도가 없습니다. 위 연도를 맞춰주세요.
          </p>
        )}
        {fileName && <p className="hint">선택된 파일: {fileName}</p>}

        {rows && (
          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
              <b style={{ fontSize: 15 }}>미리보기</b>
              <span className="tag tag-mint">옮길 수 있음 {ok.length}</span>
              {outOfRange > 0 && (
                <span className="tag tag-muted" title="정해둔 기간 밖이라 안 옮깁니다">
                  기간 밖 {outOfRange}
                </span>
              )}
              {bad.length > 0 && (
                <span className="tag tag-amber">
                  {kind === "inquiry"
                    ? `안 옮기는 줄 ${bad.length}`
                    : `${kind === "task" ? "제목·날짜" : "이름·날짜"} 못 읽음 ${bad.length}`}
                </span>
              )}
              {yearsInFile.length > 1 && (
                <span className="tag tag-sky" title="한 파일에 여러 해가 섞여 있습니다">
                  {yearsInFile.join(" · ")}년
                </span>
              )}
            </div>

            {/* **연도를 짐작한 줄** — 오류가 안 나서 짚어주지 않으면 아무도 모른다.
                2024년 수업이 2026년으로 통째로 들어가도 화면은 멀쩡하다 */}
            {guessedRows.length > 0 && (
              <div className="err" style={{ marginTop: 10, lineHeight: 1.7 }}>
                <b>연도를 짐작한 줄이 {guessedRows.length}줄 있어요
                  {guessedYears.length > 0 ? ` (${guessedYears.join(" · ")}년으로 붙였습니다)` : ""}.</b>
                <br />
                파일에 <b>「12/30」 처럼 연도 없이</b> 적힌 날짜라, 위의 <b>연도 칸</b>
                값을 붙였습니다. <b>지난 해 자료를 올리시는 거라면 연도 칸을 그 해로
                고치고 파일을 다시 골라주세요</b> — 안 그러면 그 수업이 {year}년 것으로 들어갑니다.
                <br />
                <span className="hint">
                  연도가 적힌 줄은 파일에 적힌 그대로 들어갑니다. 한 파일에 여러 해가
                  섞여 있으면 <b>「이 날짜부터·까지」 로 한 해씩 나눠 올리시는 편</b>이 안전합니다.
                </span>
              </div>
            )}

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
                    ) : kind === "inquiry" ? (
                      <>
                        <th>학생</th>
                        <th>학교 · 학년</th>
                        <th>단계</th>
                        <th>방문상담</th>
                        <th>레벨테스트</th>
                        <th>연락처</th>
                        <th>메모</th>
                      </>
                    ) : kind === "unit" ? (
                      <>
                        <th>날짜</th>
                        <th>학생</th>
                        <th>단원</th>
                        <th>결과</th>
                        <th>점수</th>
                        <th>틀린 개수</th>
                      </>
                    ) : kind === "wrong" ? (
                      <>
                        <th>날짜</th>
                        <th>학생</th>
                        <th>시험</th>
                        <th>점수</th>
                        <th>틀린 문항</th>
                        <th>영역별로 본 약점</th>
                      </>
                    ) : kind === "bookGuide" ? (
                      <>
                        <th>안내한 날</th>
                        <th>학생</th>
                        <th>교재</th>
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
                  {kind === "inquiry" && ok.slice(0, showOf('inquiry')).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>
                        {r.noName ? <span className="muted">{r.name}</span> : r.name}
                        {/* 두 줄이 한 사람이라 합친 것 — 줄 수가 줄어든 까닭 */}
                        {r.merged > 1 && (
                          <span className="tag tag-lav" style={{ marginLeft: 4 }}>{r.merged}줄 합침</span>
                        )}
                        {/* 이름은 같은데 남남이라 A·B 로 나눠 적은 것 */}
                        {r.sameName && (
                          <span className="tag tag-sky" style={{ marginLeft: 4 }}>동명이인</span>
                        )}
                        {r.noName && (
                          <span className="tag tag-amber" style={{ marginLeft: 4 }}>이름 못 여쭘</span>
                        )}
                      </td>
                      <td className="muted">
                        {[r.school, r.grade].filter(Boolean).join(" ") || "—"}
                        {/* 학년 칸과 어긋나서 **학교 칸을 쓴** 줄 */}
                        {r.gradeConflict && (
                          <span className="tag tag-muted" style={{ marginLeft: 4 }}>학교 칸을 씀</span>
                        )}
                        {r.fixed && (
                          <span className="tag tag-mint" style={{ marginLeft: 4 }}>정정</span>
                        )}
                      </td>
                      <td>
                        <span className={`tag ${INQ_CLS[r.status] || "tag-muted"}`}>
                          {INQ_LABEL[r.status] || r.status}
                        </span>
                        {r.stage && r.stage !== "방문전" && (
                          <span className="hint" style={{ marginLeft: 4, fontSize: 12 }}>{r.stage}</span>
                        )}
                      </td>
                      <td className="muted">
                        {r.consult_on ? `${r.consult_on.slice(5)} ${r.consult_at || ""}` : "—"}
                        {/* 시간을 옮긴 줄은 뒤엣것을 썼다 */}
                        {r.consultMoved && (
                          <span className="tag tag-sky" style={{ marginLeft: 4 }}>변경</span>
                        )}
                      </td>
                      <td className="muted">
                        {r.test_on ? `${r.test_on.slice(5)} ${r.test_at || ""}` : "—"}
                      </td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {r.phone || "—"}
                        {r.badPhone && (
                          <span className="tag tag-amber" style={{ marginLeft: 4 }}>학생번호 이상</span>
                        )}
                      </td>
                      <td className="muted" style={{ maxWidth: 300, whiteSpace: "normal" }}>
                        {(r.memo || "").slice(0, 70) || "—"}
                      </td>
                    </tr>
                  ))}
                  {kind === "unit" && ok.slice(0, 40).map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td>{r.unit}</td>
                      <td>
                        <span className={`tag ${r.passed ? "tag-mint" : "tag-amber"}`}>
                          {r.state || "—"}
                        </span>
                      </td>
                      <td className="muted">{r.point == null ? "—" : `${r.point}점`}</td>
                      <td className="muted">
                        {r.wrongCount == null ? "—" : `${r.wrongCount}${r.total ? ` / ${r.total}` : ""}`}
                      </td>
                    </tr>
                  ))}
                  {kind === "wrong" && ok.slice(0, 40).map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td className="muted">{r.term}</td>
                      <td>
                        {r.point == null ? "—" : `${r.point}점`}
                        {/* 아이가 적어 낸 점수와 다른 줄 — 실제 점수를 쓴다 */}
                        {r.mismatch && (
                          <span className="tag tag-amber" style={{ marginLeft: 4 }}>
                            적어 낸 건 {r.said}
                          </span>
                        )}
                      </td>
                      <td className="muted">
                        {r.nos.length}문항
                        {/* 번호 칸이 비었는데 「N번 틀린 이유」 로 알아낸 줄 */}
                        {r.fromReasons && (
                          <span className="tag tag-sky" style={{ marginLeft: 4 }}>이유에서 찾음</span>
                        )}
                        {/* **아이가 이유를 옆 칸에 적은 줄.** 번호 칸을 쓰되
                            어긋났다는 것은 알려드린다 — 물어보실 수 있게 */}
                        {r.orphan?.length > 0 && (
                          <span
                            className="tag tag-amber"
                            style={{ marginLeft: 4 }}
                            title={`이유는 ${r.orphan.join(",")}번에 적혀 있는데 틀린 번호에는 없어요`}
                          >
                            이유 어긋남 {r.orphan.join(",")}
                          </span>
                        )}
                        <span className="hint" style={{ marginLeft: 6, fontSize: 12 }}>
                          {r.nos.slice(0, 10).join(",")}{r.nos.length > 10 ? "…" : ""}
                        </span>
                      </td>
                      <td className="muted" style={{ maxWidth: 220, whiteSpace: "normal" }}>
                        {weakOf(r.nos)}
                      </td>
                    </tr>
                  ))}
                  {kind === "bookGuide" && ok.slice(0, 40).map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td className="muted">{r.book}</td>
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
            {ok.length > showOf(kind) && (
              <p className="hint" style={{ marginTop: 6 }}>앞 {showOf(kind)}줄만 보여줍니다.</p>
            )}

            {/* **안 옮기는 줄을 감추지 않는다.** 「56줄인데 왜 52줄이지」 를
                혼자 알아내시게 두면 안 된다 */}
            {kind === "inquiry" && bad.length > 0 && (
              <div className="notice" style={{ marginTop: 8, fontSize: 14 }}>
                <b>안 옮기는 줄 {bad.length}개</b>
                <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                  {bad.slice(0, 10).map((r, i) => (
                    <div key={i}>· {r.name || "(이름 없음)"} — {r.skipWhy || "이름이 없어요"}</div>
                  ))}
                  {bad.length > 10 && <div>· … 그 밖 {bad.length - 10}개</div>}
                </div>
              </div>
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
                {result.updated > 0 && ` (이미 있던 ${result.updated}건은 덮어썼어요)`}
                {kind === "wrong" && (result.items || 0) > 0 && (
                  <div className="hint" style={{ marginTop: 6 }}>
                    문항별 오답 {result.items}개까지 같이 들어갔어요 —{" "}
                    <a className="sky" href="/scores">성적 화면</a> 에서 영역별 정답률로 보입니다.
                  </div>
                )}
                {kind === "inquiry" && (
                  <div className="hint" style={{ marginTop: 6 }}>
                    반을 찾아 이어준 것 {result.linkedClass || 0}건 ·
                    {" "}재원생과 이어준 것 {result.linkedStudent || 0}건.{" "}
                    <a className="sky" href="/consult">신규 상담 화면</a> 에서 보실 수 있어요.
                  </div>
                )}
                {/* **새로 만든 학생은 반드시 보여준다.** 이름 오타도 그대로
                    학생이 되기 때문이다 — 조용히 만들면 유령 학생이 쌓인다 */}
                {result.made?.length > 0 && (
                  <div className="notice" style={{ marginTop: 8, fontSize: 14 }}>
                    <b>재원생 목록에 없던 {result.made.length}명을 「퇴원」 으로 새로 만들었어요.</b>
                    <br />
                    {result.made.join(" · ")}
                    <br />
                    이름이 잘못 적힌 것이 있으면 <a className="sky" href="/students?status=withdrawn">재원생 → 퇴원</a>
                    {" "}에서 고치거나 지워주세요.
                  </div>
                )}
                {/**
                  * **교재안내 이관 — 못 찾은 것은 줄이 아니라 이름으로 모아 보여준다.**
                  * 교재 하나가 학생 여럿에게 안내됐으면 같은 「교재 목록에 없어요」 가
                  * 몇 번이고 반복된다 — 줄 그대로 보여주면 몇 권을 만들어야 하는지
                  * 세어야 한다. 이름별로 한 번씩만, 몇 건이었는지만 붙인다.
                  */}
                {kind === "bookGuide" && result.missingBooks?.length > 0 && (
                  <div className="notice" style={{ marginTop: 8, fontSize: 14 }}>
                    <b>교재 목록에 없는 교재 {result.missingBooks.length}권</b>
                    <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                      {result.missingBooks.map((b) => (
                        <div key={b.name}>· {b.name} ({b.count}건)</div>
                      ))}
                    </div>
                    <a className="sky" href="/textbooks">교재 화면</a>에서 만드신 뒤 CSV 를 다시 올리시면
                    그때 들어가요.
                  </div>
                )}
                {kind === "bookGuide" && result.missingStudents?.length > 0 && (
                  <div className="notice" style={{ marginTop: 8, fontSize: 14 }}>
                    <b>재원생 목록에 없는 이름 {result.missingStudents.length}명</b>
                    <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                      {result.missingStudents.map((s) => (
                        <div key={s.name}>· {s.name} ({s.count}건)</div>
                      ))}
                    </div>
                    이름이 다르거나(띄어쓰기·별칭) 이미 퇴원한 학생이면 그대로 두셔도 됩니다.
                  </div>
                )}
                {result.skipped?.length > 0 && (
                  <>
                    <br />
                    <b>
                      {kind === "bookGuide" ? "이미 배정돼 건드리지 않은 것" : "건너뛴"} {result.skipped.length}건
                    </b>
                    {kind === "task"
                      ? " — 같은 날짜·같은 제목이 이미 있는 줄입니다."
                      : kind === "bookGuide"
                      ? ""
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
