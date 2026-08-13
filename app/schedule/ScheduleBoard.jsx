"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { shortName } from "@/lib/schoolName";
import { useRouter } from "next/navigation";
import {
  addExam, setEnglishDate, updateExam, deleteExam, hideExam, setExamCuts,
  applyNeis, detachNeis,
  markExamAbsence, makeExamEveSession, addClassHoliday, keepClassOn, removeHoliday, removeHolidays,
} from "./actions";
import { shortLabel, monthDay, todaySeoul } from "@/lib/day";
import MonthGrid from "./MonthGrid";
import MonthNav from "@/components/MonthNav";
import { useBulk, BulkBar } from "@/components/Bulk";
import { neisDiff, diffText, examState, STATE_LABEL, STATE_CLS, teacherText } from "@/lib/exams";
import { cleanNote } from "@/lib/note";
import { takesExam, sameSchool } from "@/lib/who";
import { GRADES, normalizeGrade } from "@/lib/grades";
import { mergeMockExams } from "./actions";
import {
  sortExams, groupExams, filterExams, facetsOf, termLabel, isMockExam, examKind,
  EXAM_SORTS, EXAM_SORT_DEFAULT, mockMess,
} from "@/lib/examList";

const ALERT_CLS = {
  over: "tag-sky",
  short: "tag-amber",
  off: "tag-muted",
  exam: "tag-amber",
  engEve: "tag-lav",
};

function ymLabel(ym) {
  const [y, m] = ym.split("-");
  return `${Number(m)}월`;
}
const dayShort = shortLabel;

// 3개월을 합쳐서 보면 결국 몇 회를 더 하고 덜 하는지
function Totals({ months }) {
  const live = months.reduce((s, m) => s + m.live.length, 0);
  const base = months.reduce((s, m) => s + (m.base || 0), 0);
  const diff = live - base;

  return (
    <span className={`tag ${diff === 0 ? "tag-mint" : diff > 0 ? "tag-sky" : "tag-amber"}`}>
      3개월 합계 {live}회 / 기준 {base}회
      {diff === 0 ? " — 딱 맞음" : diff > 0 ? ` — ${diff}회 많음` : ` — ${-diff}회 부족`}
    </span>
  );
}

export default function ScheduleBoard({
  months = [],
  reviews = [],
  exams = [],
  roster = [],              // 재원생 — 어느 시험을 누가 보는지 적어드리려고
  schools = [],
  grades = [],
  classes = [],
  unavailable = false,
  holidayNotes = [],
  makeupDays = [],
  holidays = [],
  show = "schedule",        // schedule(휴강·회차) | exams(학교 시험)
}) {
  const hBulk = useBulk(holidays);
  const [form, setForm] = useState({ school: "", grade: "", name: "", from: "", to: "" });
  const [eng, setEng] = useState({});
  const [cutOpen, setCutOpen] = useState(null);   // 등급컷을 적는 중인 회차
  const [cuts, setCuts] = useState({});
  const [infoOpen, setInfoOpen] = useState(null); // 선생님·특이사항을 적는 중인 회차
  const [whoOpen, setWhoOpen] = useState({});     // 이름을 펴 놓은 회차
  const [teach, setTeach] = useState({});
  const [memo, setMemo] = useState({});
  const [off, setOff] = useState({ date: "", name: "", classId: "" });
  const [showHidden, setShowHidden] = useState(false);   // 숨긴 시험도 볼까
  /**
   * **시험 목록 정돈** (원장님, 2026-08-06 — 「이름별 정렬, 학교별 필터 등」).
   *
   * 나이스에서 받으면 학교 × 학년 × 회차만큼 쏟아지는데 날짜순 한 줄이라
   * 학교를 찾으려면 눈으로 훑어야 했다. 거르는 칸과 차례를 붙인다.
   */
  // 지난 시험은 **기본으로 안 보인다** — 나이스에서 한 해치를 받으면 지난
  // 시험이 통째로 쌓여서 앞으로의 시험이 그 아래로 묻힌다
  const [eFilter, setEFilter] = useState({ school: "", year: "", kind: "all", q: "", past: false });
  const [eSort, setESort] = useState(EXAM_SORT_DEFAULT);

  // 숨긴 시험은 기본으로 접어둔다 — 나이스에서 받으면 안 쓰는 것까지 다 들어온다
  const hiddenExams = exams.filter((e) => e.hidden);
  const examFacets = facetsOf(exams);
  // 지난 시험이 몇 건인가 — 체크박스 옆에 적어준다 (숨긴 것은 세지 않는다)
  const pastCount = (showHidden ? exams : exams.filter((e) => !e.hidden)).filter(
    (e) => (e.to_date || e.from_date || "") < todaySeoul()
  ).length;
  const shownExams = sortExams(
    filterExams(showHidden ? exams : exams.filter((e) => !e.hidden), { ...eFilter, today: todaySeoul() }),
    eSort
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn, msg) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (msg) alert(msg);
      router.refresh();
    });
  }

  /**
   * **시험 한 줄.** 묶음으로 볼 때도 한 줄로 볼 때도 **같은 줄**이어야 한다 —
   * 두 벌로 적어두면 언젠가 한쪽만 고치게 된다 (2026-08-09 전수검사에서
   * 겪은 그대로다).
   *
   * `inGroup` 은 묶음 머리 아래에 있다는 뜻이다 — 그때는 「26년 2학기 중간」
   * 표를 줄마다 또 붙이지 않는다. 머리에 이미 적혀 있어서, 붙이면 같은 말이
   * 세 줄에 세 번 나온다.
   */
  /**
   * **이 시험을 누가 보나** (원장님, 2026-08-09 — 「학사 일정 옆에 해당하는
   * 학생 이름과 몇 명인지를 써 줘」).
   *
   * 시험 목록만 봐서는 그 회차가 우리 아이 몇을 건드리는지 알 수 없다.
   * 아무도 안 보는 회차라면 자료를 만들 까닭이 없고, 여덟이 보는 회차라면
   * 그 주 수업을 통째로 비워야 한다. **판단은 인원에서 시작한다.**
   *
   * 누가 보는지는 lib/who 의 takesExam 한 곳에서만 정한다 — 예전에 이 규칙이
   * 세 벌이었을 때, 학교 이름 표기가 조금 달랐던 아이가 시험 목록에서 통째로
   * 빠졌다.
   */
  const takers = useMemo(() => {
    const m = new Map();
    exams.forEach((e) => m.set(e.id, roster.filter((s) => takesExam(s, e))));
    return m;
  }, [exams, roster]);

  /**
   * **회차가 하나도 없는 학교** (원장님, 2026-08-09 — 「시험 있어야 하는
   * 학교가 없어」).
   *
   * 목록에 있는 것은 눈에 보이는데 **없는 것은 안 보인다.** 학교 이름
   * 표기가 조금 달라도 같은 학교로 봐야 한다 (해송고 ↔ 인천해송고등학교) —
   * 그래서 sameSchool 한 곳에서만 견준다.
   */
  const missingSchools = useMemo(() => {
    const mine = exams.filter((e) => examKind(e) === "school");
    return (schools || []).filter((s) => !mine.some((e) => sameSchool(e.school, s)));
  }, [exams, schools]);

  /**
   * **이름은 다 보여야 한다** (원장님, 2026-08-09 — 「외 1명 안 돼, 이름 다
   * 보여야 해. 너무 많으면 토글식으로라도」).
   *
   * 「외 16명」 은 아무것도 안 알려준다 — 그 열여섯이 누구인지가 정확히
   * 알고 싶은 것이다. 그래서 자르지 않고, 길면 접어두고 눌러서 편다.
   *
   * **학년으로 묶어서 적는다** (원장님 — 「학생 이름 맨 앞에 학년으로
   * 구분시켜줘」). 한 회차를 중2와 중3이 같이 보는 일이 흔하고, 그때
   * 이름만 늘어놓으면 누가 몇 학년인지 알 수가 없다.
   */
  const WHO_FOLD = 6;      // 이보다 많으면 접어둔다

  function WhoTakes({ e }) {
    const who = takers.get(e.id) || [];
    const open = whoOpen[e.id];
    if (!who.length) {
      // **빈칸으로 두지 않는다.** 「아직 안 세어봤다」 와 「정말 없다」 는 다르다
      return <span className="tag tag-muted" title="이 학교·학년에 재원생이 없습니다">보는 학생 없음</span>;
    }
    const byGrade = new Map();
    who.forEach((s) => {
      const g = normalizeGrade(s.grade) || "학년 없음";
      if (!byGrade.has(g)) byGrade.set(g, []);
      byGrade.get(g).push(s.name || "이름 없음");
    });
    const order = [...byGrade.keys()].sort(
      (a, b) => (GRADES.indexOf(a) + 1 || 99) - (GRADES.indexOf(b) + 1 || 99)
    );
    const folded = who.length > WHO_FOLD && !open;
    return (
      <span className="hint" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
        <b>{who.length}명</b>
        {!folded && order.map((g) => (
          <span key={g}>
            <b style={{ color: "var(--sky)" }}>{g}</b> {byGrade.get(g).join(" · ")}
          </span>
        ))}
        {who.length > WHO_FOLD && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: "0 6px", height: 20, fontSize: 11.5 }}
            onClick={() => setWhoOpen({ ...whoOpen, [e.id]: !open })}
          >
            {open ? "이름 접기" : `이름 보기 (${who.length}명)`}
          </button>
        )}
      </span>
    );
  }

  function ExamRow({ e, inGroup = false }) {
    return (
      <div key={e.id} className="stack" style={{ gap: 0 }}>
      {/* 학교가 날짜를 바꿨을 때 — **조용히 안 바꾼다.** 알려주고 누르게 한다.
          자료 만드는 일정이 이 날짜에 매달려 있어서, 모르게 바뀌면
          시험 사흘 전에 어긋나 있어도 모른다. */}
      {neisDiff(e)?.any && (
        <div className="unitrow" style={{ borderColor: "var(--amber)", borderBottom: 0, borderRadius: "9px 9px 0 0" }}>
          <span className="tag tag-amber">학교 일정 바뀜</span>
          <span className="hint" style={{ flex: 1 }}>{diffText(neisDiff(e))}</span>
          <button
            className="btn btn-sm"
            disabled={pending}
            title="내 시험 기간을 학교 일정에 맞춥니다"
            onClick={() => run(() => applyNeis(e.id), "학교 일정에 맞췄어요.")}
          >
            내 것에 반영
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            title="학교 일정을 떼어냅니다. 내 시험은 그대로 남아요"
            onClick={() => run(() => detachNeis(e.id))}
          >
            떼기
          </button>
        </div>
      )}
      <div className="unitrow examrow" style={e.hidden ? { opacity: 0.55 } : undefined}>
        <div className="exam-head">
        {e.hidden && <span className="tag tag-muted">숨김</span>}
        {/* **「전체」 를 안 적는다** (원장님, 2026-08-07 — 「학년별로
            다른 일정이 있어서 그런거면 학년이 다를 때만 그 학년을
            표시하고 전체를 빼」). 학년이 안 적혀 있으면 그 학교 전부라는
            뜻이고, 그건 대부분이다 — 대부분에 붙는 말은 알려주는 것이 없다 */}
        {/**
          * **모의고사는 이름이 곧 전부다** (원장님, 2026-08-08 —
          * 「전국 고1이 아니고, 26년 10월 고1 모의고사 이런 양식으로」).
          *
          * 「전국 고1」 로 적으면 어느 달 시험인지가 안 보인다.
          * 이름에 이미 연도 · 월 · 학년이 다 들어 있다.
          */}
        <b style={{ fontSize: 12.5 }}>
          {examKind(e) !== "school" ? (
            e.name || "모의고사"
          ) : (
            <>
              <span title={`${e.school}${e.name ? ` · 학교 표기: ${e.name}` : ""}`}>
                {shortName(e.school)}
              </span>
              {e.grade ? ` ${e.grade}` : ""}
            </>
          )}
        </b>
        </div>
        <div className="exam-meta">
        {/* **몇 년 몇 학기인지**를 이름 앞에 (2026-08-06).
            작년 2학기와 올해 2학기가 같은 얼굴이었다 */}
        {!inGroup && termLabel(e) && <span className="tag tag-sky">{termLabel(e)}</span>}
        {/**
          * **「일정만」 태그를 뗐다** (원장님, 2026-08-09 — 「일정만
          * 태그 빼줘」).
          *
          * 모의고사는 대비를 안 하니 범위를 안 물어본다는 뜻으로 붙였는데,
          * 회차 이름이 이미 「26년 10월 고1 모의고사」 라 모의고사인 것이
          * 한눈에 보인다. 같은 말을 두 번 하는 태그는 줄만 길게 한다.
          */}
        {/**
          * **원래 이름은 안 적는다** (원장님, 2026-08-08 —
          * 「파란 라벨 26년 2학기 기말 이거 하나면 끝나는데 뒤에
          *  기말고사 붙고」).
          *
          * 파란 뱃지가 이미 「26년 2학기 기말」 이다. 옆에 「기말고사」
          * 를 또 붙이면 같은 말이 두 번이고, 학교마다 「2차시험」
          * 「제2차 지필평가」 로 달라서 목록이 들쭉날쭉해 보인다.
          *
          * 학교가 뭐라고 적었는지는 마우스를 올리면 나온다.
          */}
        {!termLabel(e) && examKind(e) === "school" && e.name && (
          <span className="tag tag-muted">{e.name}</span>
        )}
        {teacherText(e) && <span className="tag tag-lav">{teacherText(e)}</span>}
        {cleanNote(e.note) && (
          <span className="hint" title={cleanNote(e.note)}>{cleanNote(e.note)}</span>
        )}
        {/* 이 시험은 **내 것**이다. 학교 일정은 붙어 있는 참고다 (0075).
            내가 적은 것에는 아무것도 안 붙인다 — 목록의 거의 전부가 그것이다 */}
        {STATE_LABEL[examState(e)] && (
          <span className={`tag ${STATE_CLS[examState(e)]}`}>
            {STATE_LABEL[examState(e)]}
          </span>
        )}
        {/* 시험 목록은 석 달치가 섞여 나온다 — 달이 없으면 몇 월인지 모른다 */}
        <span className="hint exam-date">
          {monthDay(e.from_date)} ~ {monthDay(e.to_date)}
        </span>
        {/**
          * **내신이 하루짜리면 무언가 빠진 것이다** (원장님, 2026-08-09 —
          * 「시험을 하루만 보는 건 모의고사가 그런 거야, 내신은 아니야」).
          *
          * 학년 때문에 날마다 쪼개졌던 시절의 줄이 그대로 남아 있으면
          * 이렇게 보인다. 조용히 두면 「이 학교는 원래 하루인가 보다」 로
          * 넘어가므로, 눈에 띄게 적어둔다.
          */}
        {examKind(e) === "school" && e.from_date === e.to_date && (
          <span className="tag tag-amber" title="학교 일정을 다시 받아오시면 사흘짜리 한 줄로 모입니다">
            하루짜리?
          </span>
        )}
        <WhoTakes e={e} />
        </div>
        <div className="exam-act">
        {e.english_on ? (
          <>
            <span className="tag tag-lav">영어 {monthDay(e.english_on)}</span>
            <span className="tag tag-sky">
              전날 등원 {monthDay(e.eveDate)}
            </span>
          </>
        ) : (
          <>
            <span className="tag tag-amber">영어 시험일 미정</span>
            <input
              className="input input-sm"
              type="date"
              style={{ width: 145 }}
              value={eng[e.id] || ""}
              onChange={(ev) => setEng({ ...eng, [e.id]: ev.target.value })}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || !eng[e.id]}
              onClick={() => run(() => setEnglishDate(e.id, eng[e.id]))}
            >
              영어 시험일 저장
            </button>
          </>
        )}
        {/* 등급컷은 **이 회차** 것이다. 여기 한 번 적으면 이 시험을 본
            학생 전부의 등급이 같은 기준으로 매겨진다.

            **모의고사·대수능에는 안 붙인다** (원장님, 2026-08-09 —
            「모의고사는 등급컷·선생님 정보가 있을 수가 없어. 특이사항은
            남겨 둬」). 등급컷도 출제 선생님도 학교가 정하는 것이라
            학교 시험에만 있다. 있을 수 없는 칸이 줄마다 두 개씩 붙어 있으면
            정말 채워야 하는 「영어 시험일」 이 그 사이에 묻힌다. */}
        {examKind(e) === "school" && (cutOpen === e.id ? (
          <>
            <input
              className="input input-sm"
              style={{ width: 170 }}
              placeholder="90, 84, 77, 70"
              title="1등급컷부터 높은 순서로"
              value={cuts[e.id] ?? (e.cuts || []).join(", ")}
              onChange={(ev) => setCuts({ ...cuts, [e.id]: ev.target.value })}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await setExamCuts(
                    e.id,
                    cuts[e.id] ?? (e.cuts || []).join(", ")
                  );
                  if (!r?.error) setCutOpen(null);
                  return r;
                })
              }
            >
              컷 저장
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCutOpen(null)}>
              취소
            </button>
          </>
        ) : (
          <button
            className={`btn btn-ghost btn-sm ${(e.cuts || []).length ? "" : "muted"}`}
            onClick={() => setCutOpen(e.id)}
            title="이 시험의 등급컷 — 이 시험을 본 학생 모두에게 쓰입니다"
          >
            {(e.cuts || []).length ? `등급컷 ${e.cuts.join("·")}` : "등급컷 적기"}
          </button>
        ))}
        {/* 출제 선생님 · 특이사항 — **이 회차** 것이다.
            같은 학교라도 회차마다 출제 선생님이 바뀐다.
            모의고사·대수능에는 출제 선생님 칸을 안 내고 **특이사항만** 낸다. */}
        {infoOpen === e.id ? (
          <>
            {examKind(e) === "school" && (
              <input
                className="input input-sm"
                style={{ width: 150 }}
                placeholder="김선생, 박선생"
                title="여러 명이면 쉼표로 나눠 적으세요"
                value={teach[e.id] ?? (e.teachers?.length ? e.teachers.join(", ") : e.teacher || "")}
                onChange={(ev) => setTeach({ ...teach, [e.id]: ev.target.value })}
              />
            )}
            <input
              className="input input-sm"
              style={{ width: 190 }}
              placeholder="특이사항 (서술형 비중 등)"
              value={memo[e.id] ?? (e.note || "")}
              onChange={(ev) => setMemo({ ...memo, [e.id]: ev.target.value })}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await updateExam(e.id, {
                    teachers: teach[e.id] ?? (e.teachers?.length ? e.teachers.join(", ") : e.teacher || ""),
                    note: memo[e.id] ?? (e.note || ""),
                  });
                  if (!r?.error) setInfoOpen(null);
                  return r;
                })
              }
            >
              저장
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setInfoOpen(null)}>
              취소
            </button>
          </>
        ) : (
          <button
            className={`btn btn-ghost btn-sm ${teacherText(e) || e.note ? "" : "muted"}`}
            onClick={() => setInfoOpen(e.id)}
            title="이 회차의 출제 선생님과 특이사항"
          >
            {examKind(e) === "school"
              ? (teacherText(e) || e.note ? "선생님 · 특이사항 고치기" : "선생님 · 특이사항 적기")
              : (e.note ? "특이사항 고치기" : "특이사항 적기")}
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          disabled={pending}
          title={
            e.hidden
              ? "다시 쓰겠습니다"
              : "필요 없는 시험입니다. 알림·결석 예상에서 뺍니다 (기록은 남습니다)"
          }
          onClick={() => run(() => hideExam(e.id, !e.hidden))}
        >
          {e.hidden ? "다시 쓰기" : "숨기기"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (!confirm("이 시험 일정을 지울까요?\n\n나이스에서 받아온 것이면 다시 받을 때 또 들어옵니다. 그럴 땐 「숨기기」 를 쓰세요.")) return;
            run(() => deleteExam(e.id));
          }}
        >
          삭제
        </button>
        </div>
      </div>
      </div>
    );
  }

  const [openDay, setOpenDay] = useState(null);
  const [pickAbs, setPickAbs] = useState(null);      // 결석을 골라 넣는 중인 (반:달)
  const [absSel, setAbsSel] = useState(() => new Set());

  // 지나간 달과 앞으로의 달을 가른다 (지난 달은 아래로 접어 둔다)
  const nowYM = todaySeoul().slice(0, 7);
  const monthList = months.filter((ym) => ym >= nowYM);
  const pastList = months.filter((ym) => ym < nowYM);

  /**
   * **한 번에 한 달만, 넘겨 가며 본다** (원장님, 2026-08-09 — 「달력의 세부
   * 내용을 보려면 스크롤을 끝까지 내려서 보고 다시 위로 올라와야 해.
   * 오늘이 포함된 월부터 한 칸만 보여주고 양옆으로 버튼 눌러 넘겨서 보는
   * 방식으로 바꿔줘. 전체 페이지에 있는 모든 달력들 다 그렇게 바꿔줘」).
   *
   * 석 달을 쌓아 두면 아래 달을 보려고 끝까지 내렸다가 다시 올라와야 한다.
   * 지난 달도 여기서 같이 넘긴다 — 따로 접어두면 「지난 달 보기」 를 누르고
   * 또 그 안에서 찾아야 한다.
   */
  const allMonths = [...pastList, ...monthList];
  const [calYM, setCalYM] = useState("");
  const shownYM = allMonths.includes(calYM)
    ? calYM
    : (monthList[0] || allMonths[allMonths.length - 1] || nowYM);

  /** 그 달에 이 반이 어떤가 — reviews 안에서 찾아온다 */
  function monthOf(review, ym) {
    return (review.months || []).find((m) => m.ym === ym) || null;
  }

  function AlertRow({ klass, m, a, i }) {
    return (
      <div className="unitrow" key={i} style={{ alignItems: "flex-start" }}>
        <span
          className={`tag ${
            a.settled ? "tag-mint" : ALERT_CLS[a.kind] || "tag-muted"
          }`}
        >
          {a.kind === "over" ? (a.settled ? "회차 맞음" : "회차 많음")
            : a.kind === "short" ? (a.settled ? "회차 맞음" : "회차 부족")
            : a.kind === "off" ? "휴강"
            : a.kind === "exam" ? "시험 기간"
            : "영어 시험 전날"}
        </span>
        <span style={{ fontSize: 12.5, flex: 1 }}>
          {a.text}
          {a.advice && (
            <>
              <br />
              <span
                className="muted"
                style={{ fontSize: 12, lineHeight: 1.6 }}
              >
                {a.advice}
              </span>
            </>
          )}
          {/* 누구 이야기인지 — 이름이 없으면 결국 명단을 다시 찾아본다.
              한 반에 학교가 섞여 있으면 반 전체가 아니라 그 학교 아이들만이다 */}
          {a.who?.length > 0 && (
            <>
              <br />
              <span style={{ fontSize: 12, lineHeight: 1.7 }}>
                {a.school && (
                  <b>{[a.school, a.grade].filter(Boolean).join(" ")} — </b>
                )}
                {a.who.map((x) => x.name).join(", ")}{" "}
                <span className="muted">({a.who.length}명)</span>
              </span>
            </>
          )}
        </span>

        {a.kind === "over" && !a.settled && (
          <select
            className="input input-sm"
            style={{ width: 150 }}
            defaultValue=""
            onChange={(ev) => {
              const d = ev.target.value;
              ev.target.value = "";
              if (!d) return;
              if (!confirm(`${dayShort(d)} 을 휴강으로 지정할까요?`)) return;
              run(
                () => addClassHoliday(d, "회차 조정 휴강", klass.id),
                "휴강으로 지정했어요."
              );
            }}
            disabled={pending}
          >
            <option value="">휴강으로 지정…</option>
            {m.live.map((d) => (
              <option key={d} value={d}>{dayShort(d)}</option>
            ))}
          </select>
        )}

        {a.kind === "exam" && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending || !(a.pairs || []).length}
            onClick={() => {
              // **시험을 보는 아이에게, 그 아이 시험 날짜에만** 넣는다.
              // 한 반에 학교가 섞여 있어도 나머지 아이는 안 건드린다.
              const pairs = a.pairs || [];
              if (pairs.length === 0) return;
              const byName = new Map();
              pairs.forEach((p) => {
                if (!byName.has(p.name)) byName.set(p.name, []);
                byName.get(p.name).push(p.date);
              });
              const lines = [...byName.entries()].map(
                ([n, ds]) => `· ${n} — ${ds.map(dayShort).join(", ")}`
              );
              if (
                !confirm(
                  `시험을 보는 학생만 결석 예정으로 넣습니다.\n\n` +
                    `${lines.join("\n")}\n\n` +
                    `학생 ${byName.size}명 · 모두 ${pairs.length}건\n` +
                    `${klass.name} 의 나머지 학생은 건드리지 않습니다.`
                )
              )
                return;
              run(
                () => markExamAbsence(pairs, "시험 기간"),
                `결석 예정 ${pairs.length}건을 넣었어요.`
              );
            }}
          >
            결석 예정 일괄 등록
          </button>
        )}

        {/* **학생을 골라서** 넣을 수도 있어야 한다.
            일괄은 「시험 보는 아이 × 시험 있는 날」 을 통째로 찍는다. 대개는
            그게 맞지만, 그중 하루는 오기로 한 아이가 있다. 넣고 나서 하나씩
            지우는 것보다 넣기 전에 빼는 편이 낫다. 일괄은 그대로 둔다. */}
        {a.kind === "exam" && (a.pairs || []).length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              const key = `${klass.id}:${m.ym}`;
              setPickAbs(pickAbs === key ? null : key);
              setAbsSel(new Set((a.pairs || []).map((p) => `${p.student_id}|${p.date}`)));
            }}
          >
            {pickAbs === `${klass.id}:${m.ym}` ? "닫기" : "학생 골라서 넣기"}
          </button>
        )}

        {a.kind === "engEve" && (
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => {
              const e = m.engEve.find((x) => x.date === a.date);
              const names = (a.who || []).map((x) => x.name);
              if (
                names.length &&
                !confirm(
                  `${dayShort(a.date)} 등원 일정을 만들까요?\n\n` +
                    `${a.school || ""} ${a.grade || ""} — ${names.join(", ")} (${names.length}명)\n` +
                    "그날 전달사항으로 이 학생들에게 안내됩니다."
                )
              )
                return;
              run(
                () =>
                  makeExamEveSession({
                    date: a.date,
                    school: e?.school,
                    grade: e?.grade,
                    classId: klass.id,
                    englishOn: e?.english_on,
                  }),
                "등원 일정을 만들었어요. 그날 전달사항으로 학생에게 안내됩니다."
              );
            }}
          >
            등원 일정 만들기
          </button>
        )}
      </div>
    );
  }

  /**
   * 시험 기간 결석을 **한 사람씩 골라서** 넣는 판.
   *
   * 처음에는 일괄 등록과 같은 것(시험 보는 아이 × 시험 있는 날)이 다 켜져
   * 있고, 안 넣을 것을 눌러서 뺀다. 대개는 그대로가 맞기 때문이다.
   */
  function AbsPicker({ klass, m, pairs }) {
    if (pickAbs !== `${klass.id}:${m.ym}`) return null;
    const byName = new Map();
    pairs.forEach((p) => {
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name).push(p);
    });
    const toggle = (k) => {
      const n = new Set(absSel);
      n.has(k) ? n.delete(k) : n.add(k);
      setAbsSel(n);
    };
    const chosen = pairs.filter((p) => absSel.has(`${p.student_id}|${p.date}`));

    return (
      <div className="card card-tight" style={{ marginTop: 6, background: "var(--surface-2)" }}>
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          <b style={{ fontSize: 12.5 }}>넣을 것 고르기</b>
          <span className="hint">눌러서 빼거나 다시 넣습니다</span>
          <span className="spacer" />
          <span className="tag tag-sky">{chosen.length}건</span>
        </div>
        <div className="stack" style={{ gap: 4, marginTop: 6 }}>
          {[...byName.entries()].map(([name, ps]) => (
            <div className="row" key={name} style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 12.5, minWidth: 56 }}>{name}</b>
              {ps.map((p) => {
                const k = `${p.student_id}|${p.date}`;
                const on = absSel.has(k);
                return (
                  <button
                    key={k}
                    className={`btn btn-sm ${on ? "btn-primary" : "btn-ghost"}`}
                    style={{ padding: "3px 7px", fontSize: 11.5 }}
                    onClick={() => toggle(k)}
                  >
                    {dayShort(p.date)}
                  </button>
                );
              })}
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: "3px 7px", fontSize: 11.5 }}
                onClick={() => {
                  const ks = ps.map((p) => `${p.student_id}|${p.date}`);
                  const every = ks.every((k) => absSel.has(k));
                  const n = new Set(absSel);
                  ks.forEach((k) => (every ? n.delete(k) : n.add(k)));
                  setAbsSel(n);
                }}
              >
                {ps.every((p) => absSel.has(`${p.student_id}|${p.date}`)) ? "이 학생 빼기" : "이 학생 전부"}
              </button>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || chosen.length === 0}
            onClick={() => {
              if (!confirm(`고른 ${chosen.length}건을 결석 예정으로 넣을까요?`)) return;
              run(
                () => markExamAbsence(chosen, "시험 기간"),
                `결석 예정 ${chosen.length}건을 넣었어요.`
              );
              setPickAbs(null);
            }}
          >
            고른 것만 넣기
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPickAbs(null)}>닫기</button>
        </div>
      </div>
    );
  }

  /**
   * 한 달 — **달력 하나**와, 그 아래 반별 설명.
   *
   * 반마다 달력을 놓으면 같은 달이 반 수만큼 되풀이된다. 원장님이 보고 싶은
   * 것은 「9월에 무슨 일이 있나」 이지 「월수반의 9월」 이 아니다.
   */
  function MonthCard({ ym, past = false }) {
    // 이 달에 수업이 있는 반만
    const mine = reviews
      .map((r) => ({ ...r, m: monthOf(r, ym) }))
      .filter((r) => r.m && (r.m.all || []).length > 0);
    // **챙길 것이 있는 반만 적는다** (원장님, 2026-08-05).
    //   「특이사항 없음」 을 반마다 한 줄씩 적으면, 한 해 열두 달에 반이 여섯이면
    //   아무 일도 없다는 말이 일흔 번 나온다. 없는 것은 안 적는 것이 없다는 뜻이다.
    const noted = mine.filter((r) => (r.m.alerts || []).length > 0);
    const alertCount = noted.reduce((n, r) => n + r.m.alerts.length, 0);

    return (
      <div className="card" style={past ? { opacity: 0.9 } : undefined}>
        {/* **달 이름은 한 번만** — 넘김 머리가 곧 달 제목이다 (components/MonthNav) */}
        <MonthNav
          month={ym}
          onChange={(m) => { setCalYM(m); setOpenDay(null); }}
          home={monthList[0] || nowYM}
          bounds={{ min: allMonths[0], max: allMonths[allMonths.length - 1] }}
        >
          <span className="hint">반 {mine.length}</span>
          {alertCount > 0 && <span className="tag tag-amber">챙길 것 {alertCount}</span>}
          {past && <span className="tag tag-muted">지난 달</span>}
        </MonthNav>

        <MonthGrid
          ym={ym}
          classes={mine.map((r) => ({
            id: r.klass.id,
            name: r.klass.name,
            month: r.m,
            absents: (r.absents || []).filter((a) => a.date.startsWith(ym)),
          }))}
          openDay={openDay}
          onPick={(d) => setOpenDay(openDay === d ? null : d)}
        />

        {/* 챙길 것이 있는 반만 — 아무 일도 없는 반은 아예 안 적는다 */}
        {noted.length > 0 && (
          <div className="stack" style={{ gap: 10, marginTop: 12 }}>
            {noted.map((r) => (
              <div key={r.klass.id} style={{ borderTop: "1px dashed var(--border)", paddingTop: 8 }}>
                <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                  <b style={{ fontSize: 13.5 }}>{r.klass.name}</b>
                  <span className="hint">
                    {(r.klass.days || []).join("·")} · 수업 {r.m.live.length}회
                    {r.m.off.length > 0 && ` (휴강 ${r.m.off.length}회 제외)`}
                    {r.klass.base_sessions ? ` · 기준 ${r.klass.base_sessions}회` : ""}
                  </span>
                </div>
                <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                  {r.m.alerts.map((a, i) => (
                    <Fragment key={i}>
                      <AlertRow klass={r.klass} m={r.m} a={a} i={i} />
                      {a.kind === "exam" && (
                        <AbsPicker klass={r.klass} m={r.m} pairs={a.pairs || []} />
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          시험 일정을 쓰려면 Supabase에서 <b>0021 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  return (
    <>
      {show === "schedule" && (
      <>
      {/* 휴강 — 공휴일이 아닌 날도 쉰다 (원장님 사정, 학교 행사, 가족 일) */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>휴강</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.7 }}>
          공휴일이 아닌 날도 쉴 수 있습니다. 여기 넣으면 <b>그날은 회차에서 빠지고</b>,
          수강료는 깎지 않고 보강으로 채우도록 계산됩니다.
        </p>

        <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 160 }}>
            <label className="label">날짜 *</label>
            <input
              className="input input-sm"
              type="date"
              value={off.date}
              onChange={(e) => setOff({ ...off, date: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 170 }}>
            <label className="label">이유</label>
            <input
              className="input input-sm"
              placeholder="원장 개인사정"
              value={off.name}
              onChange={(e) => setOff({ ...off, name: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 170 }}>
            <label className="label">어느 반</label>
            <select
              className="input input-sm"
              value={off.classId}
              onChange={(e) => setOff({ ...off, classId: e.target.value })}
            >
              <option value="">전체 휴강 (모든 반)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}만</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || !off.date}
            style={{ marginBottom: 1 }}
            onClick={() =>
              run(async () => {
                const res = await addClassHoliday(off.date, off.name, off.classId || null);
                if (!res?.error) setOff({ date: "", name: "", classId: "" });
                return res;
              }, "휴강으로 지정했어요.")
            }
          >
            휴강 추가
          </button>
        </div>

        {holidays.length > 0 ? (
          <div className="stack" style={{ gap: 3, marginTop: 10 }}>
            {/* 시험 기간 휴강을 통째로 걷을 때 하나씩 누르는 것이 일이다 */}
            <BulkBar bulk={hBulk} label="휴강">
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`고른 휴강 ${hBulk.count}건을 지울까요?\n회차와 수강료가 다시 계산됩니다.`)) return;
                  run(() => hBulk.run((ids) => removeHolidays(ids)));
                }}
              >
                삭제
              </button>
            </BulkBar>
            {holidays.map((h) => (
              <div className="unitrow" key={h.id}>
                <input type="checkbox" checked={hBulk.has(h.id)} onChange={() => hBulk.toggle(h.id)} />
                <b style={{ fontSize: 12.5, minWidth: 96 }}>{dayShort(h.date)}</b>
                <span className={`tag ${h.class_id ? "tag-sky" : "tag-muted"}`}>
                  {h.class_id ? `${classes.find((c) => c.id === h.class_id)?.name || "반"}만` : "전체"}
                </span>
                <span style={{ fontSize: 12.5, flex: 1 }}>{h.name || "휴강"}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`${dayShort(h.date)} 휴강을 지울까요?\n회차와 수강료가 다시 계산됩니다.`)) return;
                    run(() => removeHoliday(h.id));
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint" style={{ margin: "10px 0 0" }}>아직 지정한 휴강이 없습니다.</p>
        )}
      </div>

      {/* 공휴일 · 대체공휴일 · 낀 날 */}
      {holidayNotes.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
            공휴일 — 쉴지 정해주세요
          </h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.7 }}>
            자동으로 휴강 처리하지 않습니다. 학원마다 다르고 낀 날은 더 그렇기 때문에,
            <b> 수업이 잡혀 있는 공휴일만 골라서 알려드립니다.</b>
            <br />
            <b>그냥 수업함</b> 을 누르면 회차·수강료는 그대로 두고 일정에 기록만 남기고,
            알림은 사라집니다. <b>쉬기</b> 를 고르면 휴강으로 잡혀 회차에서 빠집니다.
          </p>
          <div className="stack" style={{ gap: 4 }}>
            {holidayNotes.map((h) => (
              <div className="unitrow" key={h.date} style={{ alignItems: "flex-start" }}>
                <span
                  className={`tag ${
                    h.kind === "bridge" ? "tag-lav"
                    : h.kind === "substitute" ? "tag-amber"
                    : "tag-red"
                  }`}
                >
                  {h.kind === "bridge" ? "낀 날" : h.kind === "substitute" ? "대체공휴일" : "공휴일"}
                </span>
                <b style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {dayShort(h.date)} {h.name}
                </b>
                <span className="muted" style={{ fontSize: 12, flex: 1, lineHeight: 1.6 }}>
                  {h.why}
                </span>
                {/* 답이 두 개다 — 쉬거나, 그냥 수업하거나 */}
                <button
                  className="btn btn-sm"
                  disabled={pending}
                  title="회차·수강료는 그대로 두고, 일정에 '정상 수업' 으로 기록만 남깁니다"
                  onClick={() =>
                    run(
                      () => keepClassOn(h.date, h.name),
                      "그냥 수업하는 것으로 정했어요. 일정에 남겨뒀습니다."
                    )
                  }
                >
                  그냥 수업함
                </button>
                <select
                  className="input input-sm"
                  style={{ width: 150 }}
                  defaultValue=""
                  disabled={pending}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    ev.target.value = "";
                    if (v === "all") {
                      run(() => addClassHoliday(h.date, h.name, null), "전체 휴강으로 지정했어요.");
                    } else if (v) {
                      run(() => addClassHoliday(h.date, h.name, v), "휴강으로 지정했어요.");
                    }
                  }}
                >
                  <option value="">쉬기 (휴강 지정)…</option>
                  <option value="all">전체 휴강</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}만</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      </>
      )}

      {/* 시험 일정 — **학교 화면**에서만 보여준다 (show="exams").
          휴강·회차와 성격이 달라서 한 화면에 다 있으면 무엇을 보러 왔는지
          잊게 된다. 같은 코드를 두 번 적지 않으려고 prop 하나로 가른다. */}
      {show === "exams" && (
      <>
      {/* 시험 일정 */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>학교 시험 일정</h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.7 }}>
          <b>1차</b> — 학교에서 시험 기간만 알려주면 먼저 기간을 넣습니다.
          그 기간 정규수업은 <b>타과목 시험 때문에 결석 예상</b>으로 표시됩니다.
          <br />
          <b>2차</b> — 영어 시험일이 확정되면 채워 넣습니다.
          그 <b>전날</b>은 정규수업이 아니어도 등원해야 하므로 알림이 뜹니다.
        </p>

        {/**
          * **시험이 있어야 하는데 없는 학교** (원장님, 2026-08-09 —
          * 「시험 있어야 하는 학교가 없어」).
          *
          * 목록에 있는 것은 눈에 보이는데, **없는 것은 안 보인다.** 아홉
          * 학교 중 세 곳이 통째로 안 들어왔어도 목록만 봐서는 모른다 —
          * 남은 여섯 곳이 그럴듯하게 차 있기 때문이다.
          *
          * 그래서 재원생이 다니는 학교 가운데 회차가 하나도 없는 곳을 세어
          * 이름을 적어둔다. 대개 나이스 코드가 없거나(손으로 넣은 학교),
          * 그 학교만 받아오기가 실패한 것이다.
          */}
        {missingSchools.length > 0 && (
          <div className="notice" style={{ marginBottom: 10, fontSize: 12.5, lineHeight: 1.7 }}>
            <b>시험 회차가 하나도 없는 학교가 {missingSchools.length}곳 있습니다</b> —{" "}
            {missingSchools.join(" · ")}
            <br />
            <span className="hint">
              위 <b>학교 명단</b>에서 그 학교에 <b>나이스 코드</b>가 있는지 보시고,
              없으면 이름으로 찾아 넣은 뒤 <b>학사일정 받아오기</b> 를 다시 눌러주세요.
              코드가 있는데도 비어 있으면 <b>이 학교만 받아오기</b> 를 누르면 나이스가 뭐라고
              하는지 그 자리에 나옵니다.
            </span>
          </div>
        )}

        {/* **모의고사는 전국이 같은 날이다 — 한 줄이면 된다** (원장님, 2026-08-07).
            학교마다 한 줄씩 있으면 아홉 줄이 같은 시험이고, 시험 목록을 열면
            그것만으로 화면이 찬다. 내신은 학교마다 날짜가 다르니 그대로 둔다.

            **세는 눈이 좁으면 단추가 안 나온다** (2026-08-09). 전에는 「학교마다
            한 줄」 만 셌는데, 원장님 화면에 남아 있던 것은 이미 「전국」 이면서
            학년만 없는 옛 「전국연합학력평가」 줄이었다 — 안 세니 안내가 안 뜨고,
            안내가 없으니 치울 단추도 없었다. 이제 mockMess 가 둘 다 센다 */}
        {mockMess(exams).any && (
          <div className="notice" style={{ marginBottom: 10, fontSize: 12.5, lineHeight: 1.7 }}>
            {mockMess(exams).perSchool > 0 ? (
              <>
                <b>모의고사가 학교마다 한 줄씩 있습니다.</b> 전국이 같은 날이라 한 줄이면
                됩니다 — 합치면 목록이 훨씬 짧아집니다.
              </>
            ) : (
              <>
                <b>학년 없는 옛 「전국연합학력평가」 줄이 {mockMess(exams).stale}개 있습니다.</b>{" "}
                모의고사는 고1~고3 회차로 따로 들어와 있어서, 이 줄은 같은 날에
                겹쳐 보이기만 합니다 — 눌러서 치워주세요.
              </>
            )}
            <button
              className="btn btn-primary btn-sm"
              style={{ marginLeft: 8 }}
              disabled={pending}
              onClick={() => {
                if (!confirm("모의고사를 날짜별·학년별로 「전국」 한 줄씩으로 정리할까요?\n\n같은 날에 고1~고3 회차가 이미 있으면, 학년 없는 옛 줄은 치웁니다.\n성적·범위가 붙어 있는 것은 그대로 둡니다.")) return;
                startTransition(async () => {
                  const r = await mergeMockExams();
                  alert(r?.error ? r.error : r.note || "합쳤어요.");
                  router.refresh();
                });
              }}
            >
              {mockMess(exams).perSchool > 0 ? "하나로 합치기" : "옛 줄 치우기"}
            </button>
          </div>
        )}

        <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 150 }}>
            <label className="label">학교 *</label>
            <input
              className="input input-sm"
              list="schools"
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
            />
            <datalist id="schools">
              {schools.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="field" style={{ width: 110 }}>
            <label className="label">학년</label>
            <input
              className="input input-sm"
              list="grades"
              placeholder="비우면 전체"
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: e.target.value })}
            />
            <datalist id="grades">
              {grades.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="label">시험 이름</label>
            <input
              className="input input-sm"
              placeholder="2학기 중간고사"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 145 }}>
            <label className="label">시작 *</label>
            <input
              className="input input-sm"
              type="date"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to || e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 145 }}>
            <label className="label">끝</label>
            <input
              className="input input-sm"
              type="date"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginBottom: 1 }}
            disabled={pending || !form.school || !form.from}
            onClick={() =>
              run(async () => {
                const r = await addExam(form);
                setForm({ school: "", grade: "", name: "", from: "", to: "" });
                return r;
              })
            }
          >
            기간 추가
          </button>
        </div>

        {hiddenExams.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHidden(!showHidden)}>
              {showHidden ? "숨긴 것 접기" : `숨긴 시험 ${hiddenExams.length}건 보기`}
            </button>
            <span className="hint" style={{ fontSize: 11.5 }}>
              숨긴 시험은 알림·결석 예상에서 빠집니다. 다시 받아와도 숨긴 채로 있습니다.
            </span>
          </div>
        )}

        {/* ---- 거르기 · 차례 (2026-08-06) ----
            나이스에서 받으면 학교 × 학년 × 회차만큼 쏟아진다. 날짜순 한 줄로는
            「우리 신송중 2학년 것」 을 눈으로 훑어 찾아야 했다 */}
        {exams.length > 3 && (
          <div className="row" style={{ gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input input-sm" style={{ width: 140 }} placeholder="시험 검색"
              value={eFilter.q} onChange={(ev) => setEFilter({ ...eFilter, q: ev.target.value })}
            />
            <select
              className="input input-sm" style={{ width: 120 }} value={eFilter.school}
              onChange={(ev) => setEFilter({ ...eFilter, school: ev.target.value })}
            >
              <option value="">전체 학교</option>
              {examFacets.schools.map((x) => <option key={x} value={x}>{shortName(x)}</option>)}
            </select>
            <select
              className="input input-sm" style={{ width: 92 }} value={eFilter.year}
              onChange={(ev) => setEFilter({ ...eFilter, year: ev.target.value })}
            >
              <option value="">전체 연도</option>
              {examFacets.years.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            {/* 전국연합은 대비하는 시험이 아니라 성격이 아예 다르다 — 갈라 본다 */}
            <select
              className="input input-sm" style={{ width: 110 }} value={eFilter.kind}
              onChange={(ev) => setEFilter({ ...eFilter, kind: ev.target.value })}
            >
              <option value="all">내신 · 모의</option>
              <option value="school">학교 내신만</option>
              <option value="mock">전국연합만</option>
            </select>
            <select
              className="input input-sm" style={{ width: 118 }} value={eSort.key}
              onChange={(ev) => setESort({ key: ev.target.value, dir: "asc" })}
            >
              {EXAM_SORTS.map((x) => <option key={x.key} value={x.key}>{x.label}순</option>)}
            </select>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setESort({ ...eSort, dir: eSort.dir === "asc" ? "desc" : "asc" })}
            >
              {eSort.dir === "asc" ? "▲" : "▼"}
            </button>
            <span className="spacer" />
            <span className="hint">{shownExams.length}건</span>
            {/* 지난 시험 — 세어서 보여준다. 몇 건인지 모르면 켜볼 이유가 없다 */}
            {pastCount > 0 && (
              <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!eFilter.past}
                  onChange={(ev) => setEFilter({ ...eFilter, past: ev.target.checked })}
                />
                지난 시험도 ({pastCount})
              </label>
            )}
          </div>
        )}

        {shownExams.length > 0 && (
          <div className="stack" style={{ gap: 4, marginTop: 12 }}>
            {/**
              * **묶음 머리** (원장님, 2026-08-09 — 「1학기 기말 - 학교별
              * 날짜순 나열, 2학기 중간 - 학교별 날짜순 나열 이렇게」).
              *
              * 원장님이 챙기시는 단위는 「이번 기말」 이고, 그 안에서 어느
              * 학교가 먼저인지를 보신다. 다른 차례(날짜·학교·이름)로 바꾸시면
              * 머리는 안 붙는다 — 그때는 한 줄로 죽 늘어놓는 것이 맞다.
              */}
            {eSort.key === "term" && groupExams(shownExams).map((g) => (
              <div key={g.key} className="stack" style={{ gap: 4 }}>
                {/**
                  * **묶음 이름이 제일 크게** (원장님, 2026-08-09 — 「맨 앞에
                  * 시험명이 너무 눈에 안 띄어. 2학기 기말 이런 거 제목은 잘
                  * 보이게 해줘」).
                  *
                  * 줄들이 다 네모 칸이라 그 사이에 낀 작은 글씨는 그냥
                  * 묻힌다. 글씨를 키우고 밑줄을 그어 **여기서부터 다른
                  * 묶음**이라는 것이 눈으로 먼저 보이게 한다.
                  */}
                <div
                  className="row"
                  style={{
                    gap: 8, alignItems: "center", marginTop: 18, marginBottom: 2,
                    paddingBottom: 6, borderBottom: "2px solid var(--border-strong)",
                  }}
                >
                  <b style={{ fontSize: 17, letterSpacing: "-0.02em" }}>{g.label}</b>
                  <span className="tag tag-sky">{g.rows.length}건</span>
                </div>
                {g.rows.map((e) => <ExamRow key={e.id} e={e} inGroup />)}
              </div>
            ))}
            {eSort.key !== "term" && shownExams.map((e) => <ExamRow key={e.id} e={e} />)}
          </div>
        )}
        {exams.length === 0 && (
          <p className="hint" style={{ marginTop: 8 }}>등록된 시험 일정이 없습니다.</p>
        )}
        {/* **「없다」 와 「걸러졌다」 는 다르다** (A25). 지난 시험을 기본으로
            가리므로, 지난 것만 있는 학교는 화면이 통째로 비어 보인다 —
            아무 말도 없으면 「시험이 하나도 없나」 로 읽힌다 */}
        {exams.length > 0 && shownExams.length === 0 && (
          <p className="hint" style={{ marginTop: 8 }}>
            조건에 맞는 시험이 없습니다.
            {!eFilter.past && pastCount > 0 && ` 지난 시험 ${pastCount}건은 가려져 있어요 — 위의 「지난 시험도」 를 켜보세요.`}
          </p>
        )}
      </div>
      </>
      )}

      {show === "schedule" && (
      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        {/* **달력은 달마다 하나.** 반마다 따로 놓으니 같은 달이 반 수만큼
            되풀이됐고, 「9월에 무슨 일이 있나」 를 보려면 여섯 판을 훑어야 했다.
            달력 하나에 모아 칠하고, 무슨 일인지는 **아래에 반별로** 적는다. */}
        {reviews.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              반이 없습니다. <b>반</b> 메뉴에서 먼저 만들어주세요.
            </p>
          </div>
        ) : (
          <>
            {/* **한 달씩 넘겨 본다** (원장님, 2026-08-09). 넘기는 머리는
                MonthCard 안에 있다 — 달 이름을 두 번 적지 않으려고 */}
            <MonthCard key={shownYM} ym={shownYM} past={shownYM < nowYM} />
          </>
        )}
      </div>
      )}
    </>
  );
}
