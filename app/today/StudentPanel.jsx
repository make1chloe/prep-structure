"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStudentDay, listUnitOptions, setDelivered, bookMakeup } from "./actions";
import { quickAddUnits } from "@/app/textbooks/actions";
import { setClassAttendance } from "./classAttendance";
import SubmissionList from "./SubmissionList";
import MakeupHere, { MakeupMissed } from "./MakeupHere";
import { unitOptionText, volumeLabel, guessMinutes } from "@/lib/unitTree";
import BookProgress from "@/components/BookProgress";
import PickOrType from "@/components/PickOrType";
import WordTest from "./WordTest";
import StudentBooks from "./StudentBooks";
import Comments from "@/app/comments/Comments";
import StayBox from "./StayBox";
import { addStay } from "./stayActions";
import { CAT_CLS } from "@/app/homework/categories";
import WarnBox from "./WarnBox";
import LateBox from "./LateBox";
import ExamBox from "./ExamBox";
import { nextRoutine, advanceRoutine, saveStudentDefaults } from "./routineActions";
import { setArrival, setArrivalFor, setWordWhenDefault } from "./arrivalActions";
import { STAY_LABEL } from "@/lib/reportText";
import { isMemo, inHomework } from "@/lib/notices";
import { lateReasons } from "@/lib/lateNotice";
import { listLoad, overflowIds, minLabel } from "@/lib/pace";
import { skipWordRetest } from "./lateActions";
import { waitingChecks, waitingFor } from "@/lib/checkQueue";
import { draftNotices } from "@/app/ai/actions";
import { cutOf, verdict } from "@/lib/wordTest";
import { CC_ITEM_KIND, ccJudge } from "@/lib/classcard";
import { DOW as DOWN } from "@/lib/day";
import BookPicker from "@/components/BookPicker";

// 보강에 자주 쓰는 시간 — 정규 수업이 비는 때
const MAKEUP_TIMES = ["15:00", "16:00", "17:00", "18:00"];

/**
 * 다음 보강 요일.
 *
 * 보강은 대개 정해진 요일에 몰아서 한다 (설정에서 정한다. 기본 금요일).
 * 그 날짜를 미리 넣어두면 달력을 뒤질 일이 없다.
 */
function nextMakeupDay(from, days) {
    const want = new Set(days && days.length ? days : ["금"]);
  const t = new Date(`${from}T00:00:00Z`);
  for (let i = 1; i <= 14; i += 1) {
    t.setUTCDate(t.getUTCDate() + 1);
    if (want.has(DOWN[t.getUTCDay()])) return t.toISOString().slice(0, 10);
  }
  return "";
}

const ATT = [
  { key: "present", label: "정시" },
  { key: "late", label: "지각" },
  { key: "absent", label: "결석" },
  { key: "makeup", label: "보강" },
  { key: "early_leave", label: "조퇴" },
  { key: "online", label: "온라인" },
];

const ATTITUDE = [
  { key: "Excellent", label: "⭐⭐⭐⭐⭐" },
  { key: "Good", label: "⭐⭐⭐⭐" },
  { key: "Satisfactory", label: "⭐⭐⭐" },
  { key: "Needs improvement", label: "⭐⭐" },
  { key: "Area of Concern", label: "🚩" },
];

// 클릭할 때마다 순환: 없음 → 완료 → 미흡 → 미제출 → 없음

const CYCLE = { "": "done", done: "weak", weak: "missing", missing: "" };
const MARK = { done: "○", weak: "△", missing: "✕" };
const MARK_CLS = { done: "hw-done", weak: "hw-weak", missing: "hw-missing" };

/**
 * 테스트 점수 한 칸.
 *
 * 채점할 때 실제로 세는 것은 **틀린 개수**다 (노션에서도 -단어T 로 적어왔다).
 * 그래서 '틀린' 을 치면 맞은 개수를 계산해 넣는다.
 * 전체 개수는 학생마다 거의 안 바뀌므로 지난번 값이 미리 들어와 있다.
 */
/**
 * 점수 한 칸.
 *
 * `cut` 을 주면 **통과·미통과를 자동으로 붙인다.** 원장님이 매번 "10%면 두 개까지지"
 * 하고 암산하지 않아도 되게, 채점하는 자리에서 바로 답이 나와야 한다.
 * 아직 안 적었을 때는 "몇 개까지 통과" 를 미리 알려준다.
 */
function ScoreInput({ label, total, correct, onTotal, onCorrect, cut = null, source = "" }) {
  const t = parseInt(total, 10);
  const c = parseInt(correct, 10);
  const wrong = Number.isFinite(t) && Number.isFinite(c) ? Math.max(0, t - c) : "";
  const v = cut ? verdict(c, t, cut) : null;
  // 아직 안 적었어도 "몇 개까지 통과" 는 미리 보여준다
  const allowed =
    cut && Number.isFinite(t) && t > 0 ? Math.floor((t * (100 - cut)) / 100) : null;

  function setWrong(v) {
    const w = parseInt(v.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(t)) return;           // 전체를 모르면 못 구한다
    onCorrect(Number.isFinite(w) ? String(Math.max(0, t - w)) : "");
  }

  return (
    <span className="row" style={{ gap: 5, alignItems: "center" }}>
      <span className="hint">{label}</span>
      <input
        className="input input-sm"
        style={{ width: 46, textAlign: "center" }}
        inputMode="numeric"
        placeholder="틀린"
        title="틀린 개수를 적으면 맞은 개수가 계산됩니다"
        value={wrong === "" ? "" : String(wrong)}
        onChange={(e) => setWrong(e.target.value)}
      />
      <span className="hint">틀림 / 전체</span>
      <input
        className="input input-sm"
        style={{ width: 46, textAlign: "center" }}
        inputMode="numeric"
        value={total}
        onChange={(e) => onTotal(e.target.value)}
      />
      {Number.isFinite(t) && Number.isFinite(c) && (
        <span className={`tag ${wrong === 0 ? "tag-mint" : "tag-sky"}`}>
          {Math.round((c / t) * 100)}%
        </span>
      )}
      {/* 통과선이 있으면 자동으로 판정한다 — 암산할 일이 없다 */}
      {v && (
        <span className={`tag ${v.pass ? "tag-mint" : "tag-red"}`} title={`통과선 ${cut}%`}>
          {v.label}
        </span>
      )}
      {!v && allowed !== null && (
        <span className="hint" title={`통과선 ${cut}%`}>
          {allowed}개까지 통과
        </span>
      )}
      {/* 전체 개수를 어디서 가져왔는지 밝힌다 — 틀린 숫자가 미리 들어와 있으면
          그게 어디서 온 것인지 알아야 고칠 수 있다 */}
      {source && <span className="hint">{source}</span>}
    </span>
  );
}

export default function StudentPanel({
  row,
  date,
  items = [],
  textbooks = [],
  unitNames = {},
  rule = {},
  grammarCommon = [],
  onSaved,
}) {
  const r = row.report || {};
  // 오늘 단어 재시험 건너뛰기 (skip_kinds 'retest' — 원장님 2026-08-19)
  const [retestSkip, setRetestSkip] = useState(() =>
    (r.skip_kinds || []).includes("retest")
  );
  const [form, setForm] = useState({
    attendance: row.status || "present",
    // attitude 칸이 곧 **집중도**다 (0118 — 이름만 바뀌고 칸은 그대로)
    attitude: r.attitude || "",
    monthKeyword: row.monthKeyword || "",
    quickHomework: "",
    understanding: r.understanding || "",
    word_correct: r.word_correct ?? "",
    // 전체 개수는 미리 채워둔다.
    //   1) 재원생에 적어둔 개수  2) 지난 수업에 내준 범위 단원의 단어 수
    //   3) 지난번 값 (학생마다 거의 안 바뀐다)
    // 2) 는 0070 으로 단원마다 개수가 들어왔는데 여기와 안 이어져 있어서,
    // 원장님이 교재를 펴놓고 매번 세어 넣고 계셨다.
    word_total:
      r.word_total ??
      row.student?.word_test_count ??
      row.plannedWords?.total ??
      row.lastTotals?.word_total ??
      // 마지막 폴백 — 단어 교재의 한 단원 단어 수 × 몇 단원씩 (2026-08-19
      // 「단어 전체 갯수 안 뜸」)
      row.wordDefault ??
      "",
    sent_correct: r.sent_correct ?? "",
    sent_total: r.sent_total ?? row.lastTotals?.sent_total ?? "",
    // 단원평가 — 원장님: 「단원평가는 현재 오늘 수업에서 적는 그거랑 같은 거야」.
    // 단원명을 적으신 것만 성적으로 올라간다 (0099)
    sent_unit: r.sent_unit || "",
    sent_passed: r.sent_passed == null ? "" : r.sent_passed,
    own_progress: r.own_progress || "",
    notice: r.notice || "",
    notice_student: r.notice_student || "",
  });
  // 미리 채워둔 전체 개수가 **어디서 온 것인지** 한 마디로 밝힌다.
  // 이미 저장된 값이면 아무 말도 안 한다 — 그건 원장님이 적으신 것이다.
  const pw = row.plannedWords;
  const wordSource =
    r.word_total != null
      ? ""
      : row.student?.word_test_count
      ? "재원생에 적어둔 개수"
      : pw?.total
      ? pw.counted < pw.units
        ? `범위 ${pw.units}단원 중 ${pw.counted}개만 셌어요 — 확인해주세요`
        : `범위 ${pw.units}단원 합계`
      : row.lastTotals?.word_total
      ? "지난번과 같은 개수"
      : row.wordDefault
      ? "교재 기본 (한 단원 단어 수 × 몇 단원씩)"
      : "";

  const [marks, setMarks] = useState(() => ({ ...(row.items || {}) }));
  /**
   * **내가 만진 판정만 내 것이다** (2026-08-21). marks 는 열 때 한 번만
   * 서버값으로 초기화됐다 — 그 사이 검사 대기줄(CheckQueue)에서 찍은
   * 판정이 DB 에 들어와도 이 판은 모르고, 저장(전체 교체)이 그걸 옛값으로
   * 되돌렸다. 새로고침으로 서버값이 오면 **안 만진 항목만** 받아들인다.
   */
  const touchedMarks = useRef(new Set());
  useEffect(() => {
    setMarks((m) => {
      let changed = false;
      const n = { ...m };
      Object.entries(row.items || {}).forEach(([iid, st]) => {
        if (st && !touchedMarks.current.has(iid) && n[iid] !== st) { n[iid] = st; changed = true; }
      });
      return changed ? n : m;
    });
  }, [row.items]);
  // 1차 판단으로 미리 채운 값 — 화면에 「자동」 을 붙여 손 판정과 구분한다
  const [autoMarks, setAutoMarks] = useState({});

  /**
   * **클카 자동 판정** (원장님, 2026-08-17 — 단어 세트→단어(온라인),
   * 문장 세트→문장암기(온라인)). 그날 마감 세트가 전부 완료면 ○, 일부면
   * △, 하나도 안 했으면 ✕ 를 **미리 채워둔다** — 원장님은 뒤집을 것만
   * 뒤집으면 된다. 안 한 세트 이름은 저장 때 검사 메모(check_note)로
   * 같이 나가서 학생 화면(💬)과 데일리리포트에 병기된다.
   */
  const ccVerdictOf = (iid) => {
    const kind = CC_ITEM_KIND[itemOf(iid)?.name || ""];
    if (!kind || !row.classcard) return null;
    return ccJudge(row.classcard.sets || [], kind);
  };
  /**
   * **한 달 그림자 모드** (원장님, 2026-08-17 — 「자연어 기반이라 오류
   * 가능성이 높아. 시뮬레이션 한 달간 돌려봐」). 자동 판정을 미리
   * 채우지 않는다 — 태그로 보여주기만 하고, 저장할 때 원장님이 실제로
   * 찍은 것과 나란히 기록한다(0132).
   * → **채움을 켰다** (원장님 2026-08-20 「클카 자동화 일단 해놓고 수업
   *   중에 내가 확인하면서 오류를 알려주면 고치는 게 나을 것 같아.
   *   자동화 시급해」). 원장님이 저장해야 확정이고, 그림자 기록은 계속
   *   쌓여서 일치율을 잰다.
   */
  /**
   * 학생 체크리스트 신고 → 검사 1차 판단 (원장님 2026-08-21 — 「학생이
   * 누르면 숙제검사에 미리 반영. 좋아, 클카 우선」).
   * 전부 ○ → done · △나 일부 ✕ 섞임 → weak(근거 메모) · 전부 ✕ → 안 채움.
   * 자기 신고라 클카(기계 기록)보다 뒤 순위다.
   */
  const clVerdictOf = (iid) => {
    const subs = (row.subs || []).filter((x) => x.homework_item_id === iid);
    const cl = subs.find((x) => x.kind === "checklist");   // created_at 내림차순 — 첫 것이 최신
    if (cl) {
      try {
        const lines = JSON.parse(cl.body || "[]");
        if (Array.isArray(lines) && lines.length > 0) {
          const dn = lines.filter((l) => l.done).length;
          const dg = lines.filter((l) => !l.done && l.state === "doing").length;
          const ms = lines.length - dn - dg;
          if (dn === lines.length) return { status: "done", note: "" };
          if (dn + dg > 0)
            return {
              status: "weak",
              note: `체크리스트 ○${dn}${dg ? ` △${dg}` : ""}${ms ? ` ✕${ms}` : ""}`,
            };
          return null;   // 전부 ✕ — 신고만으로 ✕ 를 박진 않는다 (원장님이 눈으로)
        }
      } catch { /* 못 읽으면 다른 제출물 규칙으로 */ }
    }
    if (subs.some((x) => x.kind !== "checklist")) return { status: "done", note: "" };
    return null;
  };

  useEffect(() => {
    /**
     * **1차 판단 미리 채움** (원장님 2026-08-20 — 「학생이 먼저 과제
     * 제출하는 기능으로 숙제 완료 여부를 1차 판단하고, 수업 시작 →
     * 내가 확정. 이 흐름 어때」). 세 재료로 안 찍힌 검사 칸만 채운다:
     *   ① 클카 자동 판정 ② 학생 제출물 ③ (등원 학습은 다 했어요 버튼)
     * 저장해야 확정 — 원장님은 뒤집을 것만 뒤집으면 된다.
     */
    const auto = {};
    setMarks((m) => {
      const n = { ...m };
      (row.toCheck || []).forEach((iid) => {
        if (n[iid]) return;
        const v = ccVerdictOf(iid);
        if (v) { n[iid] = v.status; auto[iid] = v.status; return; }
        const item = items.find((x) => x.id === iid);
        if (item?.in_person) return;   // 직접검사는 눈으로
        // 클카 우선, 그다음 학생 신고(체크리스트 3단계·기타 제출물)
        const c = clVerdictOf(iid);
        if (c) { n[iid] = c.status; auto[iid] = c.status; }
      });
      return Object.keys(auto).length ? n : m;
    });
    setAutoMarks(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [next, setNext] = useState(() => new Set(row.nextHomework || []));
  // 배정한 숙제에 붙는 교재 단원 { [itemId]: { textbookId, unitIds: [], note } }
  //   textbookId 는 "지금 단원을 고를 교재"일 뿐, 고른 단원은 교재가 달라도 함께 쌓인다
  // 교재는 **학생별**이다 (반별 교재는 안 쓴다). 이 학생 것 중 첫 번째를 기본으로.
  const defaultBook = (row.books || [])[0]?.id || (textbooks.length === 1 ? textbooks[0].id : "");

  // 숙제 분류와 교재 영역이 같으면 그 교재를 자동으로 고른다
  //   독해 숙제 → 이 학생의 독해 교재 (예: 수능딥독3)
  const AREA_OF = { 단어: "단어", 독해: "독해", 문법: "문법", 내신: "내신", 듣기: "듣기", 영작: "영작" };
  const myBooks = row.books || [];
  function bookFor(itemId) {
    const item = items.find((i) => i.id === itemId);
    const area = AREA_OF[item?.category] || "";
    if (area) {
      // 이 학생에게 배정된 교재 중 같은 영역 우선
      const mine = myBooks.find((b) => b.area === area);
      if (mine) return mine.id;
      const any = textbooks.find((b) => b.area === area);
      if (any) return any.id;
    }
    return myBooks[0]?.id || defaultBook;
  }
  const [nextUnits, setNextUnits] = useState(() => {
    const seed = {};
    Object.entries(row.nextUnits || {}).forEach(([iid, v]) => {
      const ids = v.unitIds && v.unitIds.length ? v.unitIds : v.unitId ? [v.unitId] : [];
      seed[iid] = {
        textbookId: (ids[0] && unitNames[ids[0]]?.textbookId) || "",
        unitIds: ids,
        note: v.note || "",
      };
    });
    return seed;
  });
  const [unitsByBook, setUnitsByBook] = useState({});   // textbookId → options

  /**
   * **진도 판에서 숙제로 담기** (원장님, 2026-08-19 — 「오늘 숙제로 나갈
   * 부분을 따로 표시해서 숙제에 반영」). 저장소는 nextUnits 하나다 —
   * 여기서 담은 것과 아래 「다음 숙제 배정」 에서 고른 것이 같은 값이다
   * (원칙 1). 이미 담긴 단원을 다시 누르면 빠진다.
   */
  const hwPicked = new Set(
    Object.entries(nextUnits)
      .filter(([iid]) => next.has(iid))
      .flatMap(([, v]) => v.unitIds || [])
  );
  /** 고른 교재 것만 차린다 — 등원·숙제·범위·메모 (원장님 2026-08-20 「3」) */
  function applyRoutine(res, chosen) {
    const steps = res.steps.filter((st) => chosen.has(st.textbookId));
    const inc = steps.flatMap((st) => st.inclassItems || []);
    const homeItems = steps.flatMap((st) => st.homeItems || []);
    setRoutine({ ...res, steps });
    setRoutinePick(null);
    setInClass([...inClass, ...inc]);
    const n = new Set(next);
    homeItems.forEach((x) => n.add(x));
    setNext(n);
    // 루틴이 **범위까지** 채운다. 이미 범위를 고른 숙제는 안 건드린다.
    const u = {};
    Object.entries(res.itemUnits || {}).forEach(([iid, v]) => {
      if (chosen.has(v.textbookId) && homeItems.includes(iid)) u[iid] = v;
    });
    if (Object.keys(u).length) {
      setNextUnits((cur) => {
        const m = { ...cur };
        Object.entries(u).forEach(([iid, v]) => {
          if ((m[iid]?.unitIds || []).length) return;
          m[iid] = { ...v, note: m[iid]?.note || v.note || "" };
        });
        return m;
      });
      Object.values(u).forEach((v) => loadBook(v.textbookId));
    }
  }

  function pickHomework(book, u) {
    // 이미 담겨 있으면 뺀다 (어느 항목에 있든)
    for (const [iid, v] of Object.entries(nextUnits)) {
      if (next.has(iid) && (v.unitIds || []).includes(u.id)) {
        setNextUnits((m) => ({
          ...m,
          [iid]: { ...m[iid], unitIds: (m[iid].unitIds || []).filter((x) => x !== u.id) },
        }));
        return;
      }
    }
    // 담을 항목: ⓪ 이 단원 활동에 연결된 항목(0138 — 「개념설명에 학습
    // 배정, 문제풀이에 학습 배정」) ① 이미 이 교재로 단원을 고르는 항목
    // ② 영역이 맞는 항목
    const actItem =
      u.activity && book.actItems ? book.actItems[(u.activity || "").trim()] : null;
    const cand =
      (actItem && items.some((i) => i.id === actItem) ? actItem : null) ||
      toCheck.find((iid) => next.has(iid) && nextUnits[iid]?.textbookId === book.id) ||
      toCheck.find((iid) => nextUnits[iid]?.textbookId === book.id) ||
      toCheck.find((iid) => bookFor(iid) === book.id);
    if (!cand) {
      alert(`「${book.name}」 이 들어갈 숙제 종류를 못 찾았어요.\n아래 「다음 숙제 배정」 에서 항목을 켜고 교재를 골라 주세요.`);
      return;
    }
    setNext((s) => new Set(s).add(cand));
    setNextUnits((m) => {
      const cur = m[cand] || { textbookId: book.id, unitIds: [], note: "" };
      return {
        ...m,
        [cand]: {
          ...cur,
          textbookId: cur.textbookId || book.id,
          unitIds: [...new Set([...(cur.unitIds || []), u.id])],
        },
      };
    });
    // 담은 단원의 이름이 아래 배정 판에 바로 보이게 목록을 챙겨둔다
    if (!unitsByBook[book.id]) {
      listUnitOptions(book.id).then((res) =>
        setUnitsByBook((m2) => ({ ...m2, [book.id]: res.options || [] }))
      );
    }
  }
  const [loadingBook, setLoadingBook] = useState(null);

  const [cat, setCat] = useState("전체");
  const [methodOf, setMethodOf] = useState(null);
  // 검사 화면은 기본적으로 "검사해야 하는 것"만 보여준다
  const [showAllItems, setShowAllItems] = useState(false);
  const [delivered, setDeliveredMap] = useState(() =>
    Object.fromEntries((row.notices || []).map((n) => [n.id, n.delivered]))
  );
  // 검사하다 "그럼 목요일에 다시 보자" 가 되는 순간을 여기서 바로 처리한다
  const [mk, setMk] = useState({ open: false, date: "", time: "", reason: "" });
  // 오늘 학원에서 할 것 — 학생 화면에 순서대로 뜨고 타이머가 여기 붙는다
  /**
   * **오늘 학원에서 할 것 — 순서가 있는 목록** (0140, 원장님 2026-08-20
   * 「그날 공부할 순서를 설정하는 게 필요해」). 위에서부터 학생이 하나씩
   * 한다. 지난 수업에서 「다음 수업에 계속」 한 것(carriedIn)은 처음부터
   * 맨 위에 서 있다.
   */
  const [inClass, setInClassList] = useState(() => {
    const base = row.inClass || [];
    // 못 끝내 이월된 것이 맨 위, 그다음 지난 수업에 세워둔 계획(plan_next)
    const carried = (row.carriedIn || []).filter((x) => !base.includes(x));
    const planned = (row.plannedIn || []).filter(
      (x) => !base.includes(x) && !carried.includes(x)
    );
    return [...carried, ...planned, ...base];
  });
  const setInClass = (v) => setInClassList([...new Set(v)]);   // 중복만 걸러 순서 유지
  const [carryNext, setCarryNext] = useState(() => new Set(row.inClassCarry || []));
  const [openInClass, setOpenInClass] = useState(false);
  const [routine, setRoutine] = useState(null);   // 지금 차례인 루틴 단계
  // 교재 골라 차리기 (원장님 2026-08-20 「3」) — 루틴 다음을 누르면 먼저
  // 오늘 할 교재를 고른다. 교재가 하나면 바로 차린다.
  const [routinePick, setRoutinePick] = useState(null); // { res, chosen:Set }

  /**
   * **다음 수업 계획** (원장님 2026-08-20 — 「숙제를 낼 때 다음 수업
   * 내용까지 정하는 게 기억력 측면에서도 더 나아」). 오늘 저장에
   * plan_next 로 담기고, 다음 수업 판의 등원 목록에 「계획」 으로 선다.
   * 숙제 검사 뒤 고치고 저장하면 확정 — 바뀌면 학생에게 알림이 간다.
   */
  const [planNext, setPlanNext] = useState(() => row.planNextSaved || []);
  const [wordWhen, setWordWhen] = useState(row.wordWhen || "start");
  // 전달사항 한 줄 → 학생공지·부모님공지를 한 번에 (0050)
  const [hint, setHint] = useState("");
  const [emoji, setEmoji] = useState(false);
  const [ask, setAsk] = useState("");   // 이번 초안에만 부탁할 것
  const [drafting, setDrafting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savedDraftAt, setSavedDraftAt] = useState(null); // 임시저장 시각 (화면 표시용)
  const [saving, setSaving] = useState(false);            // 저장 진짜 잠금 (2026-08-21)
  // 「남아서」 누른 숙제 — 서버가 늦귀가 과제 행을 만들어 줄 때까지
  // 누르는 순간 올라간 것으로 보인다 (낙관 UI, 실패하면 되돌린다)
  const [stayedOpt, setStayedOpt] = useState(() => new Set());
  /**
   * **출결은 만졌을 때만 저장** (2026-08-21). 등원 전에 미리 숙제를 준비해
   * 두는 흐름(TodayBoard)이 있는데, 그 상태로 저장하면 오지도 않은 아이가
   * 「정시」 로 찍혔다 — 수강료·결석 집계까지 틀어진다.
   */
  const [attTouched, setAttTouched] = useState(!!row.status);
  /**
   * 등원 체크 낙관 상태 (2026-08-21) — 「출석」 대신 찍기가 전체 새로고침을
   * 불러 byArrived 재정렬로 열린 학생 줄이 위로 튀었다. 화면은 즉시 바꾸고
   * 저장은 뒤에서, 목록 정렬은 다음 자연 새로고침 때 따라온다.
   */
  const [arr, setArr] = useState({ phone: row.phoneAt, attend: row.attendAt, homework: row.homeworkAt });
  useEffect(() => {
    setArr({ phone: row.phoneAt, attend: row.attendAt, homework: row.homeworkAt });
  }, [row.phoneAt, row.attendAt, row.homeworkAt]);
  const router = useRouter();

  const toCheck = row.toCheck || [];          // 지난 수업에 배정한 숙제 = 오늘 검사 대상
  const toCheckSet = new Set(toCheck);
  const unchecked = toCheck.filter((id) => !marks[id]);
  const nameOf = (id) => items.find((i) => i.id === id)?.name || "";
  const itemOf = (id) => items.find((i) => i.id === id) || null;

  // △·✕ 로 찍은 숙제 — **배정된 것뿐 아니라 지금 찍은 것 전부**를 본다.
  // 예전에는 toCheck(지난 수업에 배정한 것)만 봐서, 배정 없이 그 자리에서 찍은
  // 숙제는 늦귀가 과제로도, 하원 안내 사유로도 안 잡혔다.
  // 검사를 지나쳐 간 것 — 학생은 아무것도 안 눌러도 여기 뜬다
  const waiting = waitingChecks(row.doneRows || [], items, marks);

  const weakOrMissing = Object.entries(marks)
    .filter(([, st]) => st === "weak" || st === "missing")
    .map(([iid, st]) => ({ iid, st }));
  /**
   * 늦귀가 과제 제안 한 줄 만들기 — 검사 줄의 「남아서」 버튼과 아래
   * StayBox 제안이 **같은 글**을 만들어야 한다. 글이 다르면 addStay 의
   * 겹침 걸러내기(body 로 비교)가 못 알아봐서 두 줄이 생긴다.
   */
  const staySugOf = (iid, st) => {
    const u = row.checkUnits?.[iid] || {};
    const uids = u.unitIds?.length ? u.unitIds : u.unitId ? [u.unitId] : [];
    const where = uids.map((x) => unitNames[x]?.path).filter(Boolean).join(", ");
    const detail = [where, u.note].filter(Boolean).join(" ");
    const name = nameOf(iid) || "숙제";
    return {
      itemId: iid,
      body: detail ? `${name} ${detail}` : name,
      why: st === "missing" ? "미제출" : "미흡",
    };
  };
  // 지난 수업에 낸 숙제의 교재 단원 (무엇을 검사해야 하는지 그대로 보여준다)
  const checkUnitList = Object.entries(row.checkUnits || {}).filter(
    ([, u]) => u.unitId || u.note
  );

  const cats = ["전체", "자주", ...new Set(items.map((i) => i.category).filter(Boolean))];
  const COMMON = ["단어(교재)", "단어(온라인)", "독해", "워크북", "문법", "영작", "듣기", "오답노트"];
  const shown =
    cat === "전체"
      ? items
      : cat === "자주"
      ? items.filter((i) => COMMON.includes(i.name) || marks[i.id] || toCheckSet.has(i.id) || next.has(i.id))
      : items.filter((i) => i.category === cat);

  // 분류별로 묶어 줄을 나눈다
  function grouped(list) {
    const m = new Map();
    list.forEach((i) => {
      const k = i.category || "기타";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    });
    return [...m.entries()];
  }

  /**
   * **단원평가 단원은 골라 넣는다** (전수검사 C4). 지금까지 맨 글자라
   * 「관계대명사」 「관계 대명사」 가 성적에서 다른 단원으로 갈라졌다.
   * 그 학생 문법 교재의 단원 이름을 골라 넣되, 목록에 없으면 직접 적는다
   * (PickOrType). 문법 교재 단원만 미리 불러온다 — 단원평가는 문법이다.
   */
  const grammarIds = myBooks.filter((b) => b.area === "문법").map((b) => b.id);
  useEffect(() => {
    grammarIds.forEach((id) => loadBook(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grammarIds.join("|")]);
  const grammarUnitNames = [
    ...new Set(
      grammarIds.flatMap((id) => (unitsByBook[id] || []).map((o) => o.name)).filter(Boolean)
    ),
  ];

  // 교재 단원 목록은 고를 때 한 번만 불러와 캐시한다
  async function loadBook(bookId) {
    if (!bookId || unitsByBook[bookId]) return;
    setLoadingBook(bookId);
    const res = await listUnitOptions(bookId);
    setUnitsByBook((m) => ({ ...m, [bookId]: res.options || [] }));
    setLoadingBook(null);
  }
  /**
   * **그 자리에서 단원 만들기** (원장님, 2026-08-14 — 「단원평가 배정할 때
   * 단원을 선택할 수가 없어」). 「이 교재에 단원이 없어요」 를 만나면 교재
   * 화면까지 갔다 와야 했다 — 이름만 적으면 여기서 만들어지고 바로 골라진다.
   */
  const [quickFor, setQuickFor] = useState(null);   // 지금 단원을 만드는 중인 항목 id
  const [quickText, setQuickText] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  async function reloadBook(bookId) {
    if (!bookId) return;
    setLoadingBook(bookId);
    const res = await listUnitOptions(bookId);
    setUnitsByBook((m) => ({ ...m, [bookId]: res.options || [] }));
    setLoadingBook(null);
  }
  async function quickMake(itemId, bookId) {
    if (!bookId || !quickText.trim()) return;
    setQuickBusy(true);
    const res = await quickAddUnits(bookId, quickText);
    setQuickBusy(false);
    if (res?.error) { alert(res.error); return; }
    await reloadBook(bookId);
    // 만든 단원을 바로 골라 넣는다 — 만들고 또 찾게 하지 않는다
    setNextUnits((m) => {
      const u = m[itemId] || { textbookId: bookId, unitIds: [], note: "" };
      const ids = [...new Set([...(u.unitIds || []), ...(res.ids || [])])];
      return { ...m, [itemId]: { ...u, unitIds: ids } };
    });
    setQuickText("");
    setQuickFor(null);
  }

  // 이미 저장된 배정이 가리키는 교재는 열자마자 단원을 불러온다
  useEffect(() => {
    const ids = new Set(
      Object.values(nextUnits).flatMap((v) => [
        v.textbookId,
        ...(v.unitIds || []).map((uid) => unitNames[uid]?.textbookId),
      ]).filter(Boolean)
    );
    // 검사 대상 숙제가 가리키는 교재도 함께
    Object.values(row.checkUnits || {}).forEach((u) =>
      (u.unitIds || []).forEach((uid) => {
        const b = unitNames[uid]?.textbookId;
        if (b) ids.add(b);
      })
    );
    if (defaultBook) ids.add(defaultBook);
    ids.forEach((id) => loadBook(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setUnitField(itemId, patch) {
    setNextUnits((m) => ({
      ...m,
      [itemId]: { textbookId: defaultBook, unitIds: [], note: "", ...(m[itemId] || {}), ...patch },
    }));
  }
  /**
   * **고른 단원을 다 해서 얼마나 되나.**
   *
   * 단원마다 「25문항」 을 보여줘도, 넷을 고르면 100문항이라는 것은 따로
   * 세어야 안다. 그러면 안 센다 — 그래서 합쳐서 적어준다.
   * 시간은 짐작이 섞이므로 「약」 을 붙인다.
   */
  function totalOf(unitIds = []) {
    let q = 0;
    let w = 0;
    let m = 0;
    let guessed = false;
    unitIds.forEach((uid) => {
      const o = unitMeta(uid);
      if (!o) return;
      q += Number(o.questionCount) || 0;
      w += Number(o.wordCount) || 0;
      const g = guessMinutes(o);
      if (g.minutes) { m += g.minutes; if (g.guessed) guessed = true; }
    });
    const bits = [];
    if (q) bits.push(`${q}문항`);
    if (w) bits.push(`단어 ${w}`);
    if (m) bits.push(`${guessed ? "약 " : ""}${m}분`);
    return { text: bits.join(" · "), minutes: m };
  }

  function addUnit(itemId, unitId) {
    if (!unitId) return;
    const cur = nextUnits[itemId]?.unitIds || [];
    if (cur.includes(unitId)) return;
    setUnitField(itemId, { unitIds: [...cur, unitId] });
  }
  function removeUnit(itemId, unitId) {
    const cur = nextUnits[itemId]?.unitIds || [];
    setUnitField(itemId, { unitIds: cur.filter((x) => x !== unitId) });
  }
  const bookName = (id) => textbooks.find((t) => t.id === id)?.name || "";

  // 단원 한 개의 표시 정보 — 불러온 교재 목록에서 먼저, 없으면 서버가 준 이름으로
  function unitMeta(unitId) {
    for (const opts of Object.values(unitsByBook)) {
      const hit = opts.find((o) => o.id === unitId);
      if (hit) return hit;
    }
    const n = unitNames[unitId];
    return n
      ? {
          id: unitId, big: n.path, mid: "", small: "",
          activity: n.activity || "", pages: "", amount: n.amount || "",
        }
      : null;
  }
  function unitText(unitId) {
    const m = unitMeta(unitId);
    if (!m) return "단원";
    const path = [m.big, m.mid, m.small].filter(Boolean).join(" › ");
    const tail = [m.activity, m.pages, m.amount && `분량 ${m.amount}`].filter(Boolean).join(" · ");
    return tail ? `${path} — ${tail}` : path;
  }

  function cycle(id) {
    if (saving) return;   // 저장 중 찍은 판정은 서버에 못 실린다 — 잠깐 막는다
    touchedMarks.current.add(id);
    setMarks((m) => ({ ...m, [id]: CYCLE[m[id] || ""] }));
  }

  /**
   * 지난번과 같게 — 다음 숙제를 지난번 배정 그대로 채운다.
   *
   * 대부분의 숙제는 "같은 교재의 다음 단원" 이다. 그런데 지금은 매번
   * 항목·교재·단원을 처음부터 다시 골라야 해서 여기서 탭이 가장 많이 든다.
   * 그래서 항목과 교재는 그대로 가져오고, 단원은 **지난번 다음 것**으로 옮겨준다.
   * 틀리면 ✕ 눌러 빼면 되므로, 맞히려 하기보다 손을 덜 쓰게 하는 쪽이 낫다.
   */
  async function copyLast() {
    const src = row.checkUnits || {};
    const ids = toCheck.filter((iid) => src[iid]);
    if (ids.length === 0) return;

    // 필요한 교재를 먼저 다 불러온다 (단원을 한 칸 밀려면 목록이 있어야 한다)
    const books = new Set();
    ids.forEach((iid) => {
      (src[iid].unitIds || []).forEach((uid) => {
        const b = unitNames[uid]?.textbookId;
        if (b) books.add(b);
      });
    });
    const loaded = {};
    for (const b of books) {
      if (unitsByBook[b]) { loaded[b] = unitsByBook[b]; continue; }
      const res = await listUnitOptions(b);
      loaded[b] = res.options || [];
    }
    setUnitsByBook((m) => ({ ...m, ...loaded }));

    const nextSet = new Set(next);
    const patch = {};
    ids.forEach((iid) => {
      nextSet.add(iid);
      const prevUnits = src[iid].unitIds || [];
      const bookId = prevUnits.length ? unitNames[prevUnits[0]]?.textbookId : bookFor(iid);
      let opts = (bookId && (loaded[bookId] || unitsByBook[bookId])) || [];
      /**
       * **빼는 활동은 다음 숙제로 안 나간다** (원장님, 2026-08-19 —
       * 「앞으로의 숙제 배정에는 워크북이 빠지게」, 0133 skip_acts).
       * 지난번에 낸 단원이 빠진 활동이어도 자리는 잡힌다 — 그 다음부터
       * 남은(빠지지 않은) 단원만 이어진다.
       */
      const skipTxt = myBooks.find((b) => b.id === bookId)?.skipActs || "";
      const skip = new Set(skipTxt.split(",").map((s) => s.trim()).filter(Boolean));
      if (skip.size) {
        const prevSet = new Set(prevUnits);
        opts = opts.filter(
          (o) => prevSet.has(o.id) || !(o.activity && skip.has((o.activity || "").trim()))
        );
      }

      // 지난번 단원 중 가장 뒤엣것 **다음부터, 지난번 낸 개수만큼** 고른다.
      // 단어 교재는 미리 정한 「한 번에 몇 단원씩」(0124)이 있으면 그 수가 먼저다.
      let picked = [];
      if (prevUnits.length && opts.length) {
        const lastIdx = Math.max(...prevUnits.map((u) => opts.findIndex((o) => o.id === u)));
        if (lastIdx >= 0 && lastIdx + 1 < opts.length) {
          const per =
            myBooks.find((b) => b.id === bookId)?.wordTest?.units_per ||
            prevUnits.length || 1;
          picked = opts.slice(lastIdx + 1, lastIdx + 1 + per).map((o) => o.id);
        }
      }
      patch[iid] = {
        textbookId: bookId || defaultBook,
        unitIds: picked,
        note: src[iid].note || "",
      };
    });
    setNext(nextSet);
    setNextUnits((m) => {
      const out = { ...m };
      Object.entries(patch).forEach(([iid, v]) => (out[iid] = { ...(out[iid] || {}), ...v }));
      return out;
    });
  }
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // ── 적다 만 것을 잃지 않는다 ─────────────────────────────
  //
  // 수업 중에 적다가 다른 학생을 누르거나 화면을 옮기면, 저장을 안 눌렀을 때
  // 적은 것이 통째로 날아갔다. 수업 중에는 그럴 일이 자주 생긴다.
  //
  // **이 브라우저에만** 임시로 담아둔다 — 서버에 보내면 「저장했다」 와
  // 구별이 안 되고, 반쯤 적은 기록이 리포트로 나갈 수 있다.
  // 저장을 누르면 지운다. 남은 것이 있으면 열 때 알려주고, 되살릴지 물어본다.
  const draftKey = `chloe.today.${date}.${row.student.id}`;
  const [draft, setDraft] = useState(null);

  /**
   * **판을 열면 진도루틴 차례가 이미 채워져 있다** (원장님 2026-08-21 —
   * 「진도가 있고 루틴이 있으면 숙제가 배정돼야 되는 거 아냐?」).
   * 빈 판일 때 한 번만 미리 채운다 — 저장해야 확정(대전제 3)이고,
   * ⟳ 단추는 다시 채우기·다른 교재 고르기용으로 남는다.
   * 여러 교재면 전부 차린다 (8/20 「여럿이면 고른다」 는 ⟳ 수동 때만).
   */
  const autoRoutined = useRef(false);
  useEffect(() => {
    if (autoRoutined.current) return;
    if (draft) return;                                  // 되살릴 초안이 먼저다
    if (next.size > 0 || inClass.length > 0) return;    // 이미 차려진 판은 안 덮는다
    autoRoutined.current = true;
    (async () => {
      try {
        const res = await nextRoutine(row.student.id);
        if (res?.error || !res?.steps?.length) return;
        applyRoutine(res, new Set(res.steps.map((st) => st.textbookId)));
      } catch { /* 못 채우면 ⟳ 로 하던 대로 */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
      // 되살릴 것이 있으면 여기

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setDraft(JSON.parse(raw));
    } catch { /* 깨졌으면 없는 것으로 */ }
  }, [draftKey]);

  useEffect(() => {
    // 처음 그린 그대로면 담지 않는다 — 안 건드린 것까지 「적다 만 것」 이 되면
    // 열 때마다 되살릴지 물어보게 된다
    const touched =
      form.attitude || form.understanding ||
      form.word_correct !== "" || form.sent_correct !== "" ||
      form.sent_unit || form.sent_passed !== "" ||
      form.own_progress || form.notice || form.notice_student ||
      Object.keys(marks).length > 0 || next.size > 0 || inClass.length > 0;
    if (!touched) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          at: new Date().toISOString(),
          form, marks, next: [...next], inClass: [...inClass],
        }));
      } catch { /* 사파리 비공개 */ }
    }, 800);   // 한 글자마다 쓰지 않는다
    return () => clearTimeout(t);
  }, [draftKey, form, marks, next, inClass]);

  function dropDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* 무시 */ }
    setDraft(null);
  }

  /**
   * @param asDraft **임시저장** (원장님, 2026-08-11 — 「임시저장 기능 필요해」).
   *   적은 것을 전부 서버에 두되 「기록 끝」 으로 안 넘긴다 — 학생이 완료
   *   묶음으로 접히지 않고, 다른 기기에서 열어도 이어서 적을 수 있다.
   *   루틴도 안 넘긴다 (진짜 저장 때 넘겨야 두 번 안 넘어간다).
   */
  /**
   * **진짜 잠금** (2026-08-21). startTransition 의 pending 은 async 콜백을
   * 안 기다려서 「저장 중…」 이 한 프레임 만에 풀렸다 — 수업 중 두 번
   * 탭하면 삭제와 삽입이 겹쳐 그날 항목이 날아갈 수 있다.
   */
  function save(asDraft = false) {
    if (saving) return;
    setSaving(true);
    startTransition(async () => {
      try {
      // 특강이면 출결은 그 반에만 남긴다.
      // 하루 출결(= 정규 기준)까지 같이 바꾸면 정규 결석·수강료가 틀어진다.
      if (row.extraClassId && form.attendance && (attTouched || arr.attend)) {
        const a = await setClassAttendance(
          row.extraClassId,
          row.student.id,
          date,
          form.attendance
        );
        if (a?.error) {
          alert(a.error);
          return;
        }
      }
      const res = await saveStudentDay(row.student.id, date, {
        ...form,
        draft: asDraft,
        attendance:
          row.extraClassId || (!attTouched && !arr.attend) ? null : form.attendance,
        items: marks,
        /**
         * 그림자 모드(0132): 자동 판정·미달 상세를 **기록만** 한다.
         * 검사 메모(학생·리포트 병기)도 일치율이 검증될 때까지 안 남긴다 —
         * 틀린 「미달」 이 학부모께 나가는 것이 제일 나쁘다.
         */
        checkNotes: Object.fromEntries(
          (row.toCheck || [])
            .map((iid) => {
              const v = ccVerdictOf(iid);
              if (v && marks[iid] === v.status && v.missed.length)
                return [iid, v.missed.join(" · ")];
              // 클카 근거가 없으면 학생 체크리스트 신고를 근거로 (클카 우선)
              const c = clVerdictOf(iid);
              if (c && c.note && marks[iid] === c.status) return [iid, c.note];
              return null;
            })
            .filter(Boolean)
        ),
        ccShadow: Object.fromEntries(
          (row.toCheck || [])
            .map((iid) => {
              const v = ccVerdictOf(iid);
              return v ? [iid, { status: v.status, note: v.missed.join(" · ") }] : null;
            })
            .filter(Boolean)
        ),
        inClass: [...inClass],
        carryNext: [...carryNext].filter((x) => inClass.includes(x)),
        planNext: [...planNext],
        toCheck,
        nextHomework: [...next],
        nextUnits: Object.fromEntries(
          [...next].map((iid) => [
            iid,
            {
              unitIds: nextUnits[iid]?.unitIds || [],
              note: nextUnits[iid]?.note || "",
            },
          ])
        ),
      });
      if (res?.error) {
        alert(res.error);
        return;
      }

      if (asDraft) {
        /**
         * 임시저장은 조용히 — 알림도, 완료 처리도, 루틴 넘기기도 없다.
         * **화면도 안 갈아엎는다** (router.refresh 를 안 부른다) — 새로
         * 그리면 열어둔 판이 접혀서, 이어서 적으려던 흐름이 끊긴다.
         * 서버에는 이미 들어갔으니 다음 새로고침 때 자연히 맞춰진다.
         */
        // 로컬 임시본은 **안 지운다** (2026-08-21) — 지우면 다른 학생을
        // 눌렀다 돌아왔을 때 서버 캐시가 옛것이라 적은 게 통째로 안 보였다
        setSavedDraftAt(new Date());
        return;
      }
      dropDraft();   // 진짜로 저장됐으니 임시본은 필요 없다

      // 루틴에서 가져왔으면 그 교재들의 단계를 하나 넘긴다
      if (routine?.steps?.length) {
        await advanceRoutine(
          row.student.id,
          routine.steps.map((x) => x.textbookId)
        );
        setRoutine(null);
      }
      const notYet = (row.notices || []).filter(
        (n) => isMemo(n.kind) && !delivered[n.id]
      );
      if (notYet.length > 0) {
        alert(`아직 전달하지 않은 사항이 ${notYet.length}건 있어요.\n하원 전에 꼭 전달해주세요.`);
      }
      if (res && res.complete === false) {
        alert(`저장했지만 아직 완료가 아니에요.\n지난 수업 숙제 ${res.unchecked}개가 검사되지 않았습니다.`);
      }
      onSaved?.();
      router.refresh();
      } finally {
        setSaving(false);
      }
    });
  }

  return (
    <div className="stuPanel">
      {/* 출결 */}
      <div className="prow">
        <span className="plabel">출결</span>
        <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
          {ATT.map((a) => (
            <button
              key={a.key}
              className={`btn btn-sm ${(attTouched || arr.attend) && form.attendance === a.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => { setAttTouched(true); set("attendance", a.key); }}
            >
              {a.label}
            </button>
          ))}
          {!attTouched && !arr.attend && (
            <span className="hint" style={{ fontSize: 12.5 }}>
              아직 미기록 — 누르거나 등원하면 기록돼요 (미리 준비만 하고 저장해도 출결은 안 찍힙니다)
            </span>
          )}
          {/* 특강은 이 반 것만 바뀐다 — 정규 출결은 그대로다 */}
          {row.extraClassId && (
            <span className="hint" style={{ fontSize: 13 }}>
              {row.className} 출결만 바뀝니다 (정규 출결은 그대로)
            </span>
          )}
        </div>
      </div>

      {/**
        * **특이사항은 수업 중에 보여야 특이사항이다** (값-지도 P1-2,
        * 2026-08-15). 알레르기·주의사항을 재원생에 적어두셔도 여기 안 떠서,
        * 정작 수업 중에는 아무도 몰랐다.
        */}
      {(row.student.note || "").trim() && (
        <div className="notice" style={{ margin: "6px 0", fontSize: 14, whiteSpace: "pre-wrap" }}>
          <b>특이사항</b> · {row.student.note.trim()}
        </div>
      )}

      {/**
        * 클카 플래너 — **어느 세트가 체크됐는지 여기서** (원장님, 2026-08-17
        * — 「어디에 숙제 체크된 건지 모르겠어」). 줄의 「클카 n/n」 태그는
        * 요약이고, 세트별 ✅❌ 는 여기 편다. 확장이 15분마다 갱신한다.
        */}
      {(row.classcard || row.ccGap) && (
        <div className="prow">
          <span className="plabel">클카</span>
          <div className="row" style={{ gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {(row.classcard?.sets || []).map((s, i) => (
              <span key={i} className={`tag ${s.complete ? "tag-mint" : "tag-amber"}`}>
                {s.complete ? "✅" : "❌"} {s.name}
              </span>
            ))}
            {row.classcard && (
              <span className="hint" style={{ fontSize: 12 }}>
                그날 마감 플래너 {row.classcard.done}/{row.classcard.total} 완료
              </span>
            )}
            {/* 감시③ 오늘 공백 (ccTodayGap, lib/classcard) — 클카 단어 배정인데
                오늘 마감 세트가 없다. 교재 단어가 나간 날은 애초에 안 잰다
                (2026-08-21 정정 — 「단어는 교재숙제가 나갈 경우 클카 숙제가
                없다는 뜻이었어」). 대시보드 🎯 카드와 같은 판정이다. */}
            {row.ccGap === "gap" && (
              <span className="tag tag-red"
                title="클카 방식 단어 숙제가 배정돼 있는데 플래너에 오늘 마감 세트가 없어요 — 플래너를 잡아주세요">
                클카 단어 배정인데 오늘 마감 없음
              </span>
            )}
            {row.ccGap === "nodata" && (
              <span className="tag tag-amber"
                title="클카 방식 단어 숙제가 배정돼 있는데 이 학생의 오늘치 클카 수신 자료가 없어요 — 확장이 이 학생을 못 읽었을 수 있어요">
                클카 단어 배정인데 수신 자료 없음
              </span>
            )}
            {row.ccGap === "stale" && (
              <span className="hint" style={{ fontSize: 12 }}>
                클카 수신 12시간 지남 — 오늘 공백 검사 쉼
              </span>
            )}
          </div>
        </div>
      )}

      {/* **결석을 찍은 자리에서 보강까지** (2026-08-07). 「결석」 을 누르는
          순간 이미 「언제 보강하지」 가 떠오르는데, 잡으려면 출결 화면으로
          옮겨 가 학생과 날짜를 다시 찾아야 했다 — 수업 중에는 그럴 짬이 없고,
          나중에 하기로 하면 나중은 오지 않는다 */}
      {["absent", "online"].includes(form.attendance) && !row.extraClassId && (
        row.isMakeup ? (
          /* 보강날의 결석은 보통 결석과 다르다 — 원 결석에 이어 다시 잡거나,
             보강 없음으로 접는다 (원장님 2026-08-21) */
          <MakeupMissed
            studentId={row.student.id}
            date={date}
            name={row.student.name}
            makeupOf={row.makeupOf || null}
          />
        ) : (
          <MakeupHere
            studentId={row.student.id}
            date={date}
            name={row.student.name}
            already={row.makeupOn || null}
          />
        )
      )}

      {/* 등원 체크(학생이 누른 것) · 단어시험 시점 */}
      <div className="prow" style={{ alignItems: "center" }}>
        <span className="plabel">등원</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", flex: 1 }}>
          {[
            ["phone", "핸드폰", arr.phone],
            ["attend", "출석", arr.attend],
            ["homework", "숙제", arr.homework],
          ].map(([kind, label, at]) => (
            <button
              key={kind}
              className={`btn btn-sm ${at ? "btn-primary" : "btn-ghost"}`}
              disabled={pending}
              title={at ? "다시 누르면 취소돼요" : "학생 대신 찍기"}
              onClick={() => {
                const prev = arr[kind];
                // 낙관 — 즉시 표시하고 저장은 뒤에서. refresh 없음 (2026-08-21):
                // 매번 목록이 재정렬되어 열린 학생 줄이 위로 튀었다
                setArr((a) => ({ ...a, [kind]: prev ? null : new Date().toISOString() }));
                startTransition(async () => {
                  const res = await setArrivalFor(row.student.id, date, kind, !at);
                  if (res?.error) { alert(res.error); setArr((a) => ({ ...a, [kind]: prev })); }
                });
              }}
            >
              {at ? "✓ " : ""}
              {label}
              {at
                ? ` ${new Date(at).toLocaleTimeString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
            </button>
          ))}
          <span className="spacer" />
          {/* 무엇을 고르는 칸인지 이름만 보고 알 수 있어야 한다.
              '수업 시작 / 다 끝내고' 만 있으면 무엇의 순서인지 알 수 없다. */}
          <span className="hint" style={{ fontSize: 13 }}>단어시험을 언제</span>
          {[
            ["start", "수업 시작에"],
            ["end", "다 끝내고"],
          ].map(([k, label]) => (
            <button
              key={k}
              className={`btn btn-sm ${wordWhen === k ? "btn-primary" : "btn-ghost"}`}
              disabled={pending}
              title="이 학생이 오늘 단어시험을 언제 보는지 — 학생 화면의 순서가 이걸 따라갑니다"
              style={{ padding: "3px 10px" }}
              onClick={() => {
                setWordWhen(k);
                startTransition(async () => {
                  const res = await setArrival(row.student.id, date, { wordWhen: k });
                  if (res?.error) alert(res.error);
                  // refresh 없음 (2026-08-21) — wordWhen 은 이미 로컬 state 다.
                  // 매번 페이지 전체를 다시 그려 목록이 튀던 순수 손해였다
                });
              }}
            >
              {label}
            </button>
          ))}
          {/* 수업 중에 "아 얘 학부모 번호 바뀌었댔지" 가 나온다.
              메뉴를 다시 타지 않고 **그 학생이 열린 채로** 넘어간다. */}
          <a
            className="btn btn-ghost btn-sm"
            href={`/students?s=${row.student.id}`}
            target="_blank"
            rel="noreferrer"
            title="이 학생의 재원생 정보 — 연락처·교재·단어시험·상담일지를 한 판에서 고칩니다"
            style={{ padding: "3px 8px", fontSize: 12.5 }}
          >
            재원생 정보
          </a>
          <a
            className="btn btn-ghost btn-sm"
            href={`/me?s=${row.student.id}`}
            target="_blank"
            rel="noreferrer"
            title="이 학생에게 보이는 화면을 그대로 봅니다"
            style={{ padding: "3px 8px", fontSize: 12.5 }}
          >
            학생 화면 보기
          </a>
          <a
            className="btn btn-ghost btn-sm"
            href={`/me?s=${row.student.id}&try=1`}
            target="_blank"
            rel="noreferrer"
            title="로그아웃하지 않고 이 학생인 척 직접 눌러봅니다. 누른 것은 진짜로 기록되고, 그 화면에서 지울 수 있습니다."
            style={{ padding: "3px 8px", fontSize: 12.5 }}
          >
            체험
          </a>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            title="이 학생은 앞으로 계속 이렇게 봅니다"
            style={{ padding: "3px 8px", fontSize: 12.5 }}
            onClick={() =>
              startTransition(async () => {
                const res = await setWordWhenDefault(row.student.id, wordWhen);
                if (res?.error) {
                  alert(res.error);
                  return;
                }
                alert("이 학생 기본값으로 저장했어요.");
              })
            }
          >
            기본값으로
          </button>
        </div>
      </div>


      {/* 학생이 집에서 낸 것 — 검사하기 전에 먼저 본다 */}
      <SubmissionList rows={row.subs || []} items={items} />

      {/* 전달할 내용 — 출결 바로 아래에 크게. 말하고 체크하면 흐려진다 */}
      {(row.notices || []).filter((n) => isMemo(n.kind)).length > 0 && (
        <div className="sayblock">
          <div className="sayhead">
            학생에게 말할 것
            <span className="hint" style={{ fontWeight: 600 }}>
              {" "}· 말한 뒤 눌러주세요
            </span>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {(row.notices || [])
              .filter((n) => isMemo(n.kind))
              .map((n) => {
                const done = !!delivered[n.id];
                return (
                  <label key={n.id} className={`sayitem ${done ? "done" : ""}`}>
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setDeliveredMap((m) => ({ ...m, [n.id]: v }));
                        startTransition(async () => {
                          const res = await setDelivered(n.id, row.student.id, v);
                          if (res?.error) alert(res.error);
                        });
                      }}
                    />
                    <span className="saybody">{n.body}</span>
                    <span className={`tag ${done ? "tag-muted" : "tag-amber"}`}>
                      {done ? "전달함" : "전달 전"}
                    </span>
                  </label>
                );
              })}
          </div>
        </div>
      )}

      {/* 적다 만 것이 남아 있으면 알려준다. 저장을 안 누른 채 화면을 옮기면
          예전에는 통째로 날아갔다 — 수업 중에는 자주 있는 일이다. */}
      {draft && (
        <div className="notice" style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.8 }}>
          <b>적다 만 것이 남아 있어요.</b>{" "}
          {new Date(draft.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          에 적으신 것입니다 — 저장은 안 눌리셨어요.
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                setForm(draft.form);
                setMarks(draft.marks || {});
                setNext(new Set(draft.next || []));
                setInClass(draft.inClass || []);
                setDraft(null);
              }}
            >
              되살리기
            </button>
            <button className="btn btn-ghost btn-sm" onClick={dropDraft}>버리기</button>
          </div>
        </div>
      )}

      {/* 테스트 점수 — 채점할 때 세는 건 '틀린 개수' 다.
          전체 개수는 지난번 것을 미리 채워두고, 틀린 개수만 치면 맞은 개수가 계산된다. */}
      <div className="prow">
        <span className="plabel">테스트</span>
        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <ScoreInput
            label="단어"
            total={form.word_total}
            correct={form.word_correct}
            onTotal={(v) => set("word_total", v)}
            onCorrect={(v) => set("word_correct", v)}
            cut={cutOf(row.student, Number(rule.wordPassPct) || 90)}
            source={wordSource}
          />
          <ScoreInput
            label="문법"
            total={form.sent_total}
            correct={form.sent_correct}
            onTotal={(v) => set("sent_total", v)}
            onCorrect={(v) => set("sent_correct", v)}
          />
          {/* **재시험 건너뛰기를 점수 칸 옆에** (원장님 2026-08-21 — 「단어재시험
              건너뛰기 버튼 필요」). 전에는 하원 사유 줄에만 있어서, 사유가 자동으로
              잡히기 전엔 버튼 자체가 안 보였다 — 점수를 적는 그 자리에서 누른다 */}
          <button
            className={`btn btn-sm ${retestSkip ? "btn-primary" : "btn-ghost"}`}
            disabled={pending}
            title={retestSkip ? "누르면 다시 재시험 대상이 됩니다" : "오늘은 단어 재시험을 안 봅니다 — 하원 사유·문자에서 빠져요. 점수 기록은 그대로예요"}
            onClick={() => {
              const on = !retestSkip;
              setRetestSkip(on);
              startTransition(async () => {
                const res = await skipWordRetest(row.student.id, date, on);
                if (res?.error) { alert(res.error); setRetestSkip(!on); }
              });
            }}
          >
            {retestSkip ? "재시험 건너뜀 ✓" : "재시험 건너뛰기"}
          </button>
        </div>
      </div>

      {/* **단원평가** — 원장님: 「단원평가는 현재 오늘 수업에서 적는 그거랑
          같은 거야」. 그래서 학생 화면에 따로 만들지 않고 여기에 붙였다.
          **단원명을 적으신 것만** 성적으로 올라간다 — 그냥 문장 확인은
          성적표에 줄이 서면 오히려 지저분해진다.
          통과/재시험이 핵심이다. 원장님이 보시는 것은 점수가 아니라
          **몇 번 만에 통과했나** 다 (왕희연은 문장의 형식을 다섯 번 봤다). */}
      <div className="prow">
        <span className="plabel">단원평가</span>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <PickOrType
              className="input input-sm"
              style={{ width: 170 }}
              options={[
                ...grammarCommon,
                ...grammarUnitNames.filter((n) => !grammarCommon.includes(n)),
              ]}
              placeholder="단원명 (관계대명사)"
              title="그 학생 문법 교재의 단원에서 고르거나, 없으면 직접 적습니다. 적으면 성적에 단원평가로 쌓입니다"
              value={form.sent_unit}
              onChange={(e) => set("sent_unit", e.target.value)}
            />
            <button
              type="button"
              className={`btn btn-sm ${form.sent_passed === true ? "btn-primary" : "btn-ghost"}`}
              onClick={() => set("sent_passed", form.sent_passed === true ? "" : true)}
            >
              통과
            </button>
            <button
              type="button"
              className={`btn btn-sm ${form.sent_passed === false ? "btn-primary" : "btn-ghost"}`}
              onClick={() => set("sent_passed", form.sent_passed === false ? "" : false)}
            >
              재시험
            </button>
            {form.sent_unit ? (
              <span className="hint" style={{ fontSize: 12 }}>성적에 쌓입니다</span>
            ) : (
              <span className="hint" style={{ fontSize: 12 }}>
                단원명을 적으면 성적에 쌓여요 (안 적으면 그날 확인으로만 남습니다)
              </span>
            )}
          </div>
      </div>

      {/**
        * 옛 「단원평가 상자」 (0031 · unit_exams) — **이제 적는 자리가 아니다**
        * (원장님, 2026-08-11 — 「중복정보, 중복입력이 있어」). 같은 시험을
        * 위 단원평가 줄과 여기 두 군데 적을 수 있었다. 적는 것은 위 한 곳으로
        * 모으고, 여기는 이미 적어둔 기록을 보여주고 지우는 것만 남는다.
        * 기록이 없으면 아예 안 그린다. 월간리포트는 두 쪽을 다 읽는다.
        */}
      {(row.exams || []).length > 0 && (
        <div className="prow" style={{ alignItems: "flex-start" }}>
          <span className="plabel" style={{ paddingTop: 5 }}>단원평가 기록</span>
          <ExamBox studentId={row.student.id} date={date} rows={row.exams || []} readOnly />
        </div>
      )}

      {/* 숙제 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>숙제</span>
        <div style={{ flex: 1 }}>
          {waiting.length > 0 && (
            <div
              className="notice"
              style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.8 }}
            >
              <b>검사 기다리는 중 — {waiting.length}건</b>
              <br />
              {waiting.map((w) => `${w.name} (${waitingFor(w.since)})`).join(" · ")}
              <br />
              바쁘시면 그냥 두셔도 됩니다. <b>검사 안 한 항목은 다음 수업으로 넘어갑니다.</b>
            </div>
          )}
          {toCheck.length > 0 && (
            <>
              <p className="hint" style={{ margin: "0 0 6px" }}>
                {row.assignedFrom
                  ? `${row.assignedFrom.slice(5).replace("-", "/")} 수업에 낸 숙제 `
                  : "지난 수업에 낸 숙제 "}
                {toCheck.length}개
                {unchecked.length > 0 ? (
                  <b style={{ color: "var(--amber)" }}> · 미검사 {unchecked.length}개</b>
                ) : (
                  <b style={{ color: "var(--mint)" }}> · 모두 검사함</b>
                )}
              </p>
              {/* 학생이 「다 했어요」 누른 것 한 번에 ○ (원장님 2026-08-20 —
                  「c도 좋아 … 팝업식으로 나에게 확인을」 → 버튼 확인식.
                  직접검사(in_person) 항목은 눈으로 봐야 하니 뺀다) */}
              {(() => {
                const fillable = toCheck.filter((iid) => {
                  if (marks[iid]) return false;
                  const item = items.find((x) => x.id === iid);
                  if (item?.in_person) return false;
                  return (row.doneRows || []).some(
                    (d) => d.homework_item_id === iid && d.student_done_at
                  );
                });
                if (fillable.length === 0) return null;
                return (
                  <button
                    className="btn btn-sm"
                    style={{ marginBottom: 6 }}
                    disabled={saving}
                    onClick={() =>
                      setMarks((m) => {
                        const n = { ...m };
                        fillable.forEach((iid) => { touchedMarks.current.add(iid); n[iid] = "done"; });
                        return n;
                      })
                    }
                  >
                    다 했어요 누른 {fillable.length}개 ○로 채우기
                  </button>
                );
              })()}
              {/* 배정할 때 적어둔 단원과 분량 — 무엇을 검사할지 여기서 바로 본다 */}
              <div className="stack" style={{ gap: 4, marginBottom: 8 }}>
                {toCheck.map((iid) => {
                  const u = row.checkUnits?.[iid] || {};
                  const uids = u.unitIds && u.unitIds.length ? u.unitIds : u.unitId ? [u.unitId] : [];
                  const st = marks[iid] || "";
                  const item = items.find((x) => x.id === iid);
                  // 이 숙제로 만든 늦귀가 과제가 이미 있는가 —
                  // 「남아서」 버튼(있으면 숨김)과 「늦귀가 ↓」 표가 같이 본다
                  const inStay =
                    stayedOpt.has(iid) ||
                    (row.stay || []).some((t) => t.homework_item_id === iid);
                  return (
                    <div className="unitrow" key={iid}>
                      {/* 세 가지를 한 번에 — 예전엔 칩을 돌려야 해서 미제출이 3탭이었다 */}
                      <span
                        className={`hwchip ${st ? MARK_CLS[st] : ""}`}
                        style={!st ? { borderColor: "var(--amber)", borderWidth: 2 } : undefined}
                      >
                        {st ? <b>{MARK[st]}</b> : <b>·</b>} {nameOf(iid) || "숙제"}
                      </span>
                      {autoMarks[iid] && marks[iid] === autoMarks[iid] && (
                        <span className="tag tag-sky" title="클카·제출물로 미리 채운 판정 — 저장해야 확정돼요. 다르면 옆에서 뒤집으세요">자동</span>
                      )}
                      <span className="markset">
                        {[["done", "○"], ["weak", "△"], ["missing", "✕"]].map(([k, sym]) => (
                          <button
                            key={k}
                            className={`markbtn ${st === k ? `on ${MARK_CLS[k]}` : ""}`}
                            title={k === "done" ? "완료" : k === "weak" ? "미흡" : "미제출"}
                            disabled={saving}
                            onClick={() => {
                              touchedMarks.current.add(iid);
                              setMarks((m) => ({ ...m, [iid]: m[iid] === k ? "" : k }));
                            }}
                          >
                            {sym}
                          </button>
                        ))}
                      </span>
                      {(() => {
                        const v = ccVerdictOf(iid);
                        if (!v) return null;
                        return (
                          <span
                            className={`tag ${v.status === "done" ? "tag-mint" : "tag-amber"}`}
                            title={v.missed.length ? v.missed.join("\n") : "그날 마감 세트 전부 완료"}
                          >
                            클카 {v.total - v.missed.length}/{v.total}
                            {v.missed.length > 0 && ` · ${v.missed[0]}${v.missed.length > 1 ? ` 외 ${v.missed.length - 1}` : ""}`}
                          </span>
                        );
                      })()}
                      {/* 안 해온 숙제의 처분 (원장님 2026-08-20 — 「숙제 다시
                          옆에 오늘수업으로도. 그렇게 하고도 못하면 다시
                          숙제로 나가도록」) */}
                      {(st === "missing" || st === "weak") && (
                        <>
                          {!inClass.includes(iid) && (
                            <button
                              className={`btn btn-sm ${item?.redo_default === "inclass" ? "btn-primary" : "btn-ghost"}`}
                              title="이 숙제를 오늘 학원에서 하게 — 등원 학습 맨 위에 섭니다"
                              onClick={() => setInClass([iid, ...inClass])}
                            >
                              오늘수업으로
                            </button>
                          )}
                          {!next.has(iid) && (
                            <button
                              className={`btn btn-sm ${item?.redo_default === "homework" ? "btn-primary" : "btn-ghost"}`}
                              title="다음 수업 숙제로 다시 냅니다"
                              onClick={() => setNext((s2) => new Set(s2).add(iid))}
                            >
                              숙제 다시
                            </button>
                          )}
                          {/* 세 번째 처분 (원장님 2026-08-21 — 「미제출 처분에
                              수업 후 남아서 항목도 필요해」). 늦귀가 과제와
                              같은 길(addStay)로 올라간다 — 하원 안내 사유·
                              학생 화면 「남을 것」 이 저절로 따라온다 */}
                          {!inStay && (
                            <button
                              className={`btn btn-sm ${item?.redo_default === "stay" ? "btn-primary" : "btn-ghost"}`}
                              title="수업 끝나고 남아서 마저 하고 갑니다 — 아래 늦귀가 과제에 올라가고, 하원 안내 사유로 잡힙니다"
                              onClick={() => {
                                // 누르는 순간 올라간 걸로 보인다 — 실패하면 되돌리고 알린다
                                setStayedOpt((s2) => new Set(s2).add(iid));
                                startTransition(async () => {
                                  const res = await addStay(
                                    row.student.id, date, staySugOf(iid, st).body, iid, true
                                  );
                                  if (res?.error) {
                                    setStayedOpt((s2) => {
                                      const n = new Set(s2); n.delete(iid); return n;
                                    });
                                    alert(res.error);
                                    return;
                                  }
                                  router.refresh();
                                });
                              }}
                            >
                              남아서
                            </button>
                          )}
                        </>
                      )}
                      {/* 이 숙제로 만든 늦귀가 과제 — 연결(homework_item_id)을
                          이제 읽는다 (값-지도 P1-15). 이미 늦귀가에 올라가
                          있으면 또 만들 필요가 없다는 것이 검사 중에 보인다 */}
                      {inStay && (
                        <span
                          className="tag tag-lav"
                          title="이 숙제로 만든 늦귀가 과제가 아래 「늦귀가」 줄에 있습니다"
                        >
                          늦귀가 ↓
                        </span>
                      )}
                      {item?.method && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setMethodOf(methodOf === iid ? null : iid)}
                          title="학습 방법 보기"
                        >
                          방법
                        </button>
                      )}
                      {uids.length === 0 && !u.note ? (
                        <span className="hint">단원 지정 없음</span>
                      ) : (
                        <span className="unitmeta">
                          {uids.map((uid) => {
                            const m = unitMeta(uid);
                            return (
                              <span className="tag tag-sky" key={uid}>
                                {m ? [m.big, m.mid, m.small].filter(Boolean).join(" › ") : "단원"}
                                {m?.activity ? ` · ${m.activity}` : ""}
                                {m?.amount ? ` · ${m.amount}` : m?.pages ? ` · ${m.pages}` : ""}
                              </span>
                            );
                          })}
                          {u.note && <span className="tag tag-muted">{u.note}</span>}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {methodOf && (
                <div className="notice" style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>
                  <b>{nameOf(methodOf)} 학습 방법</b>
                  {"\n"}
                  {items.find((x) => x.id === methodOf)?.method}
                </div>
              )}
            </>
          )}
          {!showAllItems ? (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 6 }}
              onClick={() => setShowAllItems(true)}
            >
              ＋ 다른 항목도 검사하기
            </button>
          ) : (
          <div className="row" style={{ gap: 3, marginBottom: 6 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: "3px 8px" }}
              onClick={() => setShowAllItems(false)}
            >
              접기
            </button>
            {cats.map((c) => (
              <button
                key={c}
                className={`btn btn-sm ${cat === c ? "btn-primary" : "btn-ghost"}`}
                style={{ padding: "3px 8px" }}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
          )}
          {showAllItems && (
            <div className="stack" style={{ gap: 6 }}>
              {grouped(shown.filter((i) => !toCheckSet.has(i.id))).map(([g, list]) => (
                <div className="hwgroup" key={g}>
                  <span className={`tag ${CAT_CLS[g] || "tag-muted"} hwcat`}>{g}</span>
                  <div className="row" style={{ gap: 4 }}>
                    {list.map((i) => {
                      const st = marks[i.id] || "";
                      return (
                        <button
                          key={i.id}
                          className={`hwchip ${st ? MARK_CLS[st] : ""}`}
                          onClick={() => cycle(i.id)}
                          title="클릭: 완료 → 미흡 → 미제출 → 없음"
                        >
                          {st && <b>{MARK[st]}</b>} {i.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {toCheck.length === 0 && !showAllItems && (
            <span className="hint">지난 수업에 낸 숙제가 없어요.</span>
          )}
        </div>
      </div>

      {/* 오늘 학원에서 할 것 — 학생 화면에 순서대로 뜬다 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>등원 학습</span>
        <div style={{ flex: 1 }}>
          {/* **소화량 게이지** (원장님 2026-08-20 — 일률 % 가 아니라 그
              학생의 실제 타이머 기록으로. 기록 없는 항목은 추정 안 함) */}
          {(() => {
            if (inClass.length === 0) return null;
            const { sec, unknownN } = listLoad(row.paceOf || {}, inClass);
            if (!sec) return null;
            const budget = row.classMinutes || 0;
            const over = budget > 0 && sec / 60 > budget * 0.9;
            const tail = over ? overflowIds(row.paceOf || {}, inClass, budget * 0.9) : [];
            return (
              <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                <span className={`tag ${over ? "tag-amber" : "tag-mint"}`}>
                  예상 {minLabel(sec)}{budget ? ` / 수업 ${budget}분` : ""}
                </span>
                {unknownN > 0 && (
                  <span className="hint">기록 없는 항목 {unknownN}개는 계산에서 뺌</span>
                )}
                {tail.length > 0 && (
                  <button
                    className="btn btn-sm"
                    title="이 학생 기록 기준으로 시간이 넘치는 아래 항목들을 다음 숙제로 돌립니다"
                    onClick={() => {
                      setInClass(inClass.filter((x) => !tail.includes(x)));
                      setNext((s2) => {
                        const n = new Set(s2);
                        tail.forEach((x) => n.add(x));
                        return n;
                      });
                    }}
                  >
                    시간 넘는 {tail.length}개 숙제로 돌리기
                  </button>
                )}
              </div>
            );
          })()}
          {/* 순서 목록 (0140) — 위에서부터 학생이 하는 차례. ↑↓ 로 조정,
              시간이 모자라면 ✕(오늘 뺌) · 숙제로 · 다음 수업에 중 하나 */}
          <div className="stack" style={{ gap: 3 }}>
            {inClass.map((iid, idx) => {
              const sec = (row.secOf || {})[iid] || 0;
              const doneAt = (row.doneRows || []).find(
                (d) => d.homework_item_id === iid
              )?.student_done_at;
              const carried = (row.carriedIn || []).includes(iid);
              const willCarry = carryNext.has(iid);
              return (
                <div className="row" key={iid} style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="hint" style={{ width: 16, textAlign: "right" }}>{idx + 1}</span>
                  <span
                    className={`tag ${doneAt ? (marks[iid] ? "tag-mint" : "tag-amber") : "tag-muted"}`}
                    title={doneAt ? (marks[iid] ? "검사함" : "검사 기다리는 중") : "아직 안 함"}
                  >
                    {nameOf(iid) || "학습"}
                    {sec > 0 ? ` ${Math.max(1, Math.round(sec / 60))}분` : ""}
                  </span>
                  {carried && <span className="tag tag-sky" title="지난 수업에서 「다음 수업에 계속」 한 것">이어서</span>}
                  {!carried && (row.plannedIn || []).includes(iid) && (
                    <span className="tag tag-lav" title="지난 수업 마무리 때 세워둔 계획 — 숙제 확인 후 고치고 저장하면 확정">계획</span>
                  )}
                  <button className="btn btn-ghost btn-sm" title="위로" disabled={idx === 0}
                    onClick={() => {
                      const n = [...inClass];
                      [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                      setInClass(n);
                    }}>↑</button>
                  <button className="btn btn-ghost btn-sm" title="아래로" disabled={idx === inClass.length - 1}
                    onClick={() => {
                      const n = [...inClass];
                      [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]];
                      setInClass(n);
                    }}>↓</button>
                  {!doneAt && (
                    <>
                      <button
                        className={`btn btn-sm ${willCarry ? "btn-primary" : "btn-ghost"}`}
                        title="오늘 못 끝냄 — 다음 수업의 목록에 자동으로 다시 섭니다"
                        onClick={() => {
                          const n = new Set(carryNext);
                          n.has(iid) ? n.delete(iid) : n.add(iid);
                          setCarryNext(n);
                        }}
                      >
                        다음수업
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="남은 것을 숙제로 — 아래 「다음 숙제 배정」 에 담깁니다"
                        onClick={() => {
                          setInClass(inClass.filter((x) => x !== iid));
                          setNext((s2) => new Set(s2).add(iid));
                        }}
                      >
                        숙제로
                      </button>
                    </>
                  )}
                  <button className="btn btn-ghost btn-sm" title="오늘 목록에서 뺌"
                    onClick={() => setInClass(inClass.filter((x) => x !== iid))}>✕</button>
                </div>
              );
            })}
            {inClass.length === 0 && (
              <span className="hint">아직 정하지 않았어요.</span>
            )}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <span className="spacer" />
            <button
              className="btn btn-sm"
              disabled={pending}
              title="교재에 정해둔 진도루틴에서 이 학생 차례를 그대로 채웁니다"
              onClick={() =>
                startTransition(async () => {
                  const res = await nextRoutine(row.student.id);
                  if (res?.error) {
                    alert(res.error);
                    return;
                  }
                  if (res.steps.length === 0) {
                    alert("이 학생 교재에는 아직 진도루틴이 없어요.\n교재 · 단원 화면에서 만들 수 있습니다.");
                    return;
                  }
                  // 교재가 하나면 바로, 여럿이면 먼저 고른다 (2026-08-20 「3」)
                  if (res.steps.length === 1) {
                    applyRoutine(res, new Set(res.steps.map((st) => st.textbookId)));
                  } else {
                    setRoutinePick({ res, chosen: new Set(res.steps.map((st) => st.textbookId)) });
                  }
                })
              }
            >
              ⟳ 진도루틴 다음
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpenInClass(!openInClass)}>
              {openInClass ? "접기" : "고르기"}
            </button>
          </div>

          {/* 오늘 할 교재 고르기 (2026-08-20 「3」) — 뺄 것만 눌러 끄고 차린다 */}
          {routinePick && (
            <div className="card card-tight" style={{ marginTop: 6 }}>
              <b style={{ fontSize: 13.5 }}>오늘 할 교재만 남기세요</b>
              <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {routinePick.res.steps.map((st) => {
                  const on = routinePick.chosen.has(st.textbookId);
                  return (
                    <button
                      key={st.textbookId}
                      className={`chip ${on ? "on" : ""}`}
                      onClick={() => {
                        const c = new Set(routinePick.chosen);
                        on ? c.delete(st.textbookId) : c.add(st.textbookId);
                        setRoutinePick({ ...routinePick, chosen: c });
                      }}
                    >
                      {on ? "☑" : "☐"} {st.book}
                      <span className="hint"> {st.label || st.unit}</span>
                    </button>
                  );
                })}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setRoutinePick(null)}>취소</button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={routinePick.chosen.size === 0}
                  onClick={() => applyRoutine(routinePick.res, routinePick.chosen)}
                >
                  이대로 차리기 ({routinePick.chosen.size}권)
                </button>
              </div>
            </div>
          )}

          {openInClass && (
            <div className="chips" style={{ marginTop: 8 }}>
              {items.map((i) => {
                const on = inClass.includes(i.id);
                return (
                  <button
                    key={i.id}
                    className={`chip ${on ? "on" : ""}`}
                    onClick={() =>
                      setInClass(on ? inClass.filter((x) => x !== i.id) : [...inClass, i.id])
                    }
                  >
                    {i.name}
                  </button>
                );
              })}
            </div>
          )}
          {routine && (
            <p className="hint" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
              진도루틴에서 가져왔습니다 —{" "}
              {routine.steps
                .map(
                  (s) =>
                    `${s.book} ${s.no}/${s.total}${s.label ? ` ${s.label}` : ""}` +
                    (s.unit ? ` · ${s.unit}` : s.unitDone ? " · 단원을 다 했어요" : "")
                )
                .join(" · ")}
              . <b>저장하면 다음 단계로 넘어갑니다.</b>
              {routine.steps.some((s) => s.unitDone) && (
                <>
                  {" "}
                  <b>단원이 다 끝난 교재</b>가 있어요 — 회독을 넘기거나 다음 교재로 바꿔주세요.
                </>
              )}
            </p>
          )}
          <p className="hint" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
            고른 순서가 아니라 <b>학습 항목 순서</b>대로 학생 화면에 뜹니다. 학생이{" "}
            <b>학습 완료</b>를 누르면 여기 노랗게 바뀌고, 검사하시면 초록이 됩니다.
          </p>
        </div>
      </div>


      {/* 사용중인 교재 · 단원 진도 (순서 무관 체크) */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 3 }}>진도</span>
        <div className="stack" style={{ gap: 6, flex: 1 }}>
          <div className="row" style={{ gap: 6 }}>
            {myBooks.map((b) => (
              <BookProgress
                key={b.id}
                studentId={row.student.id}
                book={b}
                onHomework={(u) => pickHomework(b, u)}
                hwPicked={hwPicked}
                extra={
                  b.wordTest !== undefined ? (
                    <WordTest studentId={row.student.id} book={b} />
                  ) : null
                }
              />
            ))}
            {myBooks.length === 0 && (
              <span className="hint" style={{ alignSelf: "center" }}>
                배정된 교재가 없어요.
              </span>
            )}
            <StudentBooks
              studentId={row.student.id}
              myBooks={myBooks}
              textbooks={textbooks}
            />
          </div>
          {/* 진도 **메모**도 여기 — 따로 「메모」 행으로 떨어져 있어서 무슨
              메모인지 몰랐다 (2026-08-11 「중복정보」 정리). 리포트의 {{진도}} 로 나간다 */}
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input input-sm" style={{ flex: 1, minWidth: 160 }}
              placeholder={row.lastProgress ? `지난 수업: ${row.lastProgress}` : "진도 메모 (예: Unit 3 뒷부분만)"}
              value={form.own_progress}
              onChange={(e) => set("own_progress", e.target.value)}
            />
            {/* 오늘 진도 판에 찍은 ○·◐ (0134) — 누르면 그대로 담긴다.
                비워두고 저장해도 서버가 이걸로 채운다 (원장님 2026-08-19
                「오늘 수업 한 부분을 데일리 리포트에 반영」) */}
            {row.todayDraft && !form.own_progress && (
              <button
                className="btn btn-primary btn-sm"
                title={row.todayDraft}
                onClick={() => set("own_progress", row.todayDraft.replace(/\n/g, " / "))}
              >
                오늘 찍은 진도 넣기
              </button>
            )}
            {row.lastProgress && !form.own_progress && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => set("own_progress", row.lastProgress)}
              >
                지난 진도 가져오기
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 다음 숙제 배정 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>다음</span>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 6 }}>
            <p className="hint" style={{ margin: 0, flex: 1 }}>
              다음 수업에 검사할 숙제를 골라두면, 그때 이 항목들이 검사 대상이 돼요.
              {next.size > 0 && <b> · {next.size}개 배정</b>}
            </p>
            {toCheck.length > 0 && (
              <button
                className="btn btn-sm"
                onClick={copyLast}
                title="지난번에 낸 항목·교재를 그대로 가져오고, 단원만 다음 것으로 옮깁니다"
              >
                ⟳ 지난번과 같게 (단원은 다음 것)
              </button>
            )}
          </div>
          {/* **급하면 글로** (원장님 2026-08-21 — 「급하면 텍스트로 직접
              숙제 적을 수 있도록」). 항목·단원 고를 짬이 없을 때 한 줄 —
              「직접 적은 숙제」 로 학생 화면·리포트·검사까지 여느 숙제처럼 */}
          <div className="row" style={{ gap: 6, alignItems: "center", margin: "6px 0" }}>
            <span className="hint" style={{ fontSize: 13, whiteSpace: "nowrap" }}>✍ 급한 숙제</span>
            <textarea
              className="input input-sm"
              rows={form.quickHomework.includes("\n") ? 3 : 1}
              style={{ flex: 1, minWidth: 160, resize: "vertical" }}
              placeholder="한 줄에 하나씩 — 줄마다 따로 숙제가 돼요 (예: 문법 프린트 3장)"
              value={form.quickHomework}
              onChange={(e) => set("quickHomework", e.target.value)}
            />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {grouped(shown).map(([g, list]) => (
              <div className="hwgroup" key={g}>
                <span className={`tag ${CAT_CLS[g] || "tag-muted"} hwcat`}>{g}</span>
                <div className="row" style={{ gap: 4 }}>
                  {list.map((i) => (
                    <button
                      key={i.id}
                      className={`hwchip ${next.has(i.id) ? "hw-next" : ""}`}
                      onClick={() => {
                        const n = new Set(next);
                        if (n.has(i.id)) {
                          n.delete(i.id);
                        } else {
                          n.add(i.id);
                          const b = bookFor(i.id);
                          setUnitField(i.id, { textbookId: b });
                          loadBook(b);
                        }
                        setNext(n);
                      }}
                    >
                      {next.has(i.id) && <b>＋</b>} {i.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 배정한 숙제별 교재 단원 — 교재DB의 단원명과 연동, 여러 단원 가능 */}
          {next.size > 0 && (
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {[...next].map((iid) => {
                const u = nextUnits[iid] || { textbookId: defaultBook, unitIds: [], note: "" };
                const bookId = u.textbookId || defaultBook;
                const opts = unitsByBook[bookId] || [];
                const chosen = u.unitIds || [];
                return (
                  <div className="unitrow" key={iid}>
                    <span className="tag tag-lav" style={{ fontWeight: 800 }}>
                      {nameOf(iid) || "숙제"}
                    </span>
                    {/* 준비물·직접검사 — 학생 화면에는 있는데 여기만 없었다 (P1-9) */}
                    {itemOf(iid)?.tool && (
                      <span className="tag tag-sky" style={{ fontSize: 12 }}>{itemOf(iid).tool}</span>
                    )}
                    {itemOf(iid)?.in_person && (
                      <span className="tag tag-amber" style={{ fontSize: 12 }} title="선생님이 직접 검사하는 숙제">직접검사</span>
                    )}
                    {/* 수업 중에 고르는 자리다 — 굴려 찾을 시간이 없다.
                        이 학생 교재가 맨 위에 서고, 나머지는 영역으로 좁힌다 */}
                    <BookPicker
                      books={textbooks}
                      mine={myBooks}
                      value={bookId}
                      width={160}
                      placeholder="교재 선택"
                      onChange={(v) => {
                        setUnitField(iid, { textbookId: v });
                        loadBook(v);
                      }}
                    />
                    <select
                      className="input input-sm"
                      style={{ flex: 1, minWidth: 200 }}
                      value=""
                      onChange={(e) => { addUnit(iid, e.target.value); e.target.value = ""; }}
                      disabled={!bookId}
                    >
                      <option value="">
                        {!bookId
                          ? "교재를 먼저 고르세요"
                          : loadingBook === bookId
                          ? "단원 불러오는 중…"
                          : opts.length === 0
                          ? "이 교재에 단원이 없어요 — 교재 › 교재·단원 에서 올려주세요"
                          : "단원 추가…"}
                      </option>
                      {opts.map((o) => (
                        <option key={o.id} value={o.id} disabled={chosen.includes(o.id)}>
                          {"\u00a0".repeat(o.depth * 3)}
                          {unitOptionText(o)}
                        </option>
                      ))}
                    </select>
                    {/* 「이 교재에 단원이 없어요」 의 답 — 그 자리에서 만든다.
                        (있는 교재에서도 하나 더 만들 일이 있어 늘 보인다) */}
                    {bookId && loadingBook !== bookId && (
                      quickFor === iid ? (
                        <>
                          <input
                            className="input input-sm"
                            style={{ width: 180 }}
                            autoFocus
                            placeholder="단원명 (·로 여러 개)"
                            value={quickText}
                            onChange={(e) => setQuickText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") quickMake(iid, bookId); }}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={quickBusy || !quickText.trim()}
                            onClick={() => quickMake(iid, bookId)}
                          >
                            {quickBusy ? "만드는 중…" : "만들기"}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setQuickFor(null)}>취소</button>
                        </>
                      ) : (
                        <button
                          className="btn btn-ghost btn-sm"
                          title="단원이 없거나 부족하면 여기서 바로 만듭니다. 이름·페이지 고치기는 교재 화면에서"
                          onClick={() => { setQuickFor(iid); setQuickText(""); }}
                        >
                          ＋ 단원 만들기
                        </button>
                      )
                    )}
                    <input
                      className="input input-sm"
                      style={{ width: 120 }}
                      placeholder="범위 메모"
                      value={u.note || ""}
                      onChange={(e) => setUnitField(iid, { note: e.target.value })}
                    />
                    {chosen.length > 0 && (
                      <span className="unitmeta" style={{ flexBasis: "100%" }}>
                        {chosen.map((uid) => {
                          const m = unitMeta(uid);
                          return (
                            <button
                              key={uid}
                              className="hwchip hw-next"
                              onClick={() => removeUnit(iid, uid)}
                              title="클릭하면 뺍니다"
                            >
                              {m ? [m.big, m.mid, m.small].filter(Boolean).join(" › ") : "단원"}
                              {m?.activity ? ` · ${m.activity}` : ""}
                              {/* **분량이 칩에 붙어야 한다** (0100). 고르고 나서
                                  「이거 몇 문항이었지」 를 다시 찾으면 안 낸다 */}
                              {m && volumeLabel(m) ? ` · ${volumeLabel(m)}` : ""} ✕
                            </button>
                          );
                        })}
                        {/* **오늘 낸 숙제가 다 해서 얼마나 되나** (0100).
                            원장님: 「단원의 실제 내용과 분량을 오늘 수업에서
                            확인하고 숙제를 주고 싶은 거야」 —
                            단원마다 따로 보면 합쳐서 두 시간짜리를 내고도 모른다 */}
                        {(() => {
                          const tot = totalOf(chosen);
                          if (!tot.text) return null;
                          return (
                            <span
                              className="hint"
                              style={{ marginLeft: 4, fontSize: 12.5, whiteSpace: "nowrap" }}
                            >
                              합계 {tot.text}
                            </span>
                          );
                        })()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/**
        * **집중도 · 이해도** (원장님, 2026-08-11 — 「태도를 집중도로 고치고
        * 이해도 추가해줘」). 「태도」 는 말이 넓어서 떠든 것과 못 알아들은
        * 것이 한 칸에 뭉개졌다. 집중도는 옛 attitude 칸 그대로(이름만 바뀜),
        * 이해도는 0118 의 새 칸이다.
        *
        * 리포트에는 **고른 것만** 나간다 — 둘 다 안 고르면 그 줄 자체가 없다.
        */}
      {[
        ["집중도", "attitude"],
        ["이해도", "understanding"],
      ].map(([label, key]) => (
        <div className="prow" key={key}>
          <span className="plabel">{label}</span>
          <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            {ATTITUDE.map((a) => (
              <button
                key={a.key}
                className={`btn btn-sm ${form[key] === a.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => set(key, form[key] === a.key ? "" : a.key)}
              >
                {a.label}
              </button>
            ))}
            {!form.attitude && !form.understanding && key === "understanding" && (
              <span className="hint" style={{ fontSize: 12.5 }}>
                안 고르면 리포트에 안 나갑니다
              </span>
            )}
          </div>
        </div>
      ))}

      {/**
        * **월간용 키워드 메모** (원장님, 2026-08-21 — 「키워드메모칸 필여해」).
        * 학부모·학생에게 절대 안 나간다 (원장만 읽는 표, 0146) — 월간
        * AI 브리핑만 이걸 종합한다. 리포트 댓글은 다는 즉시 나가서 이
        * 자리로 못 쓴다.
        */}
      <div className="prow">
        <span className="plabel">월간 키워드</span>
        <div className="row" style={{ gap: 6, alignItems: "center", flex: 1 }}>
          <input
            className="input input-sm"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="예) 관계대명사 감 잡음, 숙제 태도 좋아짐 (학부모에겐 안 보여요)"
            value={form.monthKeyword}
            onChange={(e) => set("monthKeyword", e.target.value)}
          />
          <span className="hint" style={{ fontSize: 12 }}>월간리포트 초안 재료</span>
        </div>
      </div>

      {/* 공지 — 받는 사람이 다르면 글도 달라야 한다.
          같은 일을 두 번 적지 않도록, 전달사항 한 줄로 둘 다 만든다. */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>공지</span>
        <div className="stack" style={{ gap: 6, flex: 1 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input input-sm"
              style={{ flex: 1, minWidth: 180 }}
              placeholder="전달사항 — 간단히 적으세요 (예: 워크북 안 해와서 남겨서 시킴)"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
            />
            {/* 이번에만 부탁할 것 — 늘 지킬 것은 설정 › AI 초안 에 적어둔다 */}
            <input
              className="input input-sm"
              style={{ width: 170 }}
              placeholder="이번만 요청 (예: 짧게)"
              title="이 초안에만 적용됩니다. 매번 지킬 것은 설정 › AI 초안 에 적어두세요"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
            />
            <label className="row" style={{ gap: 4, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={emoji}
                onChange={(e) => setEmoji(e.target.checked)}
              />
              이모티콘
            </label>
            <button
              className="btn btn-sm"
              disabled={drafting || hint.trim().length < 2}
              title="적으신 말을 학생용·학부모용으로 각각 고쳐 씁니다"
              onClick={() => {
                // 이미 적어두신 게 있으면 덮어쓰기 전에 묻는다.
                // AI 는 **누를 때만** 돈다 — 저장하거나 화면을 열 때는 부르지 않는다.
                if (
                  (form.notice_student || form.notice) &&
                  !confirm("이미 적어둔 공지가 있습니다. 새 초안으로 바꿀까요?")
                ) return;
                setDrafting(true);
                startTransition(async () => {
                  const res = await draftNotices({
                    hint,
                    emoji,
                    ask,
                    name: row.student.name,
                    attendance: ATT.find((a) => a.key === form.attendance)?.label,
                    word:
                      form.word_total && form.word_correct !== ""
                        ? `${form.word_total - form.word_correct}개 틀림 / ${form.word_total}`
                        : "",
                    homework: Object.entries(marks)
                      .filter(([, v]) => v)
                      .map(([id, v]) => `${nameOf(id)} ${MARK[v]}`),
                    inclass: [...inClass].map(nameOf).filter(Boolean),
                  });
                  setDrafting(false);
                  if (res?.error) { alert(res.error); return; }
                  setForm((f) => ({
                    ...f,
                    notice_student: res.student || f.notice_student,
                    notice: res.parent || f.notice,
                  }));
                });
              }}
            >
              {drafting ? "쓰는 중…" : "✎ 초안 만들기"}
            </button>
          </div>

          {/**
            * **맨 위에서 적은 것이 여기 같이 보인다** (원장님, 2026-08-07 —
            * 「오늘 수업 맨위 공지랑 학생별 검사 밑에 공지랑 내용이 연동
            *  되어야 해」).
            *
            * 둘 다 **같은 글에 실려 나간다** — 반 전체에 한 말과 이 아이에게만
            * 하는 말이 어머니께는 한 통으로 간다. 그런데 화면에서는 하나가
            * 판 맨 위에, 하나가 맨 아래에 떨어져 있어서 **같이 읽어볼 수가
            * 없었다.** 그러면 같은 말을 두 번 적거나, 앞에 적은 것을 잊는다.
            *
            * 전체 것은 여기서 못 고친다 — 고치면 그 반 모두의 글이 바뀐다.
            * 맨 위 칸에서 고치시라고 자리만 알려준다.
            */}
          {(() => {
            const all = row.notices || [];
            // 옛 「전달사항」(deliver) 은 숙제 안내에도 실렸다 — 숙제 공지 옆에 같이 보인다
            const line = (kind) =>
              all.filter((n) => n.body && (kind === "homework" ? inHomework(n.kind) : n.kind === kind));
            const Row = (label, kind, hint, value, key) => (
              <div className="row" style={{ gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                <span className="hint" style={{ fontSize: 13, minWidth: 64, paddingTop: 6 }}>
                  {label}
                </span>
                <div className="stack" style={{ gap: 4, flex: 1, minWidth: 200 }}>
                  {line(kind).map((n) => (
                    <span className="hint" key={n.id} style={{ fontSize: 12.5 }}>
                      <span className="tag tag-muted" style={{ fontSize: 12 }}>전체</span>{" "}
                      {n.body}
                    </span>
                  ))}
                  <textarea
                    className="input input-sm"
                    rows={2}
                    placeholder={hint}
                    value={value}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              </div>
            );
            return (
              <>
                {Row("숙제 공지", "homework",
                     "이 아이에게만 — 숙제 안내 맨 위에 들어갑니다",
                     form.notice_student, "notice_student")}
                {Row("리포트 공지", "notice",
                     "이 아이에게만 — 데일리리포트 맨 아래에 들어갑니다",
                     form.notice, "notice")}
              </>
            );
          })()}
          <p className="hint" style={{ margin: 0, fontSize: 12.5 }}>
            <span className="tag tag-muted" style={{ fontSize: 12 }}>전체</span> 로 적힌 줄은
            맨 위 <b>공지</b> 칸에서 반 전체에 적으신 것입니다 (여기서는 못 고칩니다 — 반 전체가 바뀝니다).
            <br />
            수업 중에 <b>말로</b> 전할 것은 위쪽 <b>학생에게 말할 것</b>(수업 메모)에 있습니다.
          </p>
        </div>
      </div>

      {/* 학생·학부모가 남긴 댓글 */}
      {r.id && (
        <div className="prow" style={{ alignItems: "flex-start" }}>
          <span className="plabel">댓글</span>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Comments
              reportId={r.id}
              studentId={row.student.id}
              me="staff"
              openBy={(row.unreadComments || 0) > 0}
            />
          </div>
        </div>
      )}

      {/* 늦귀가 과제 — 미흡·미제출을 찍으면 여기 자동으로 제안된다 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>{STAY_LABEL}</span>
        <StayBox
          studentId={row.student.id}
          date={date}
          rows={row.stay || []}
          suggestions={weakOrMissing.map(({ iid, st }) => staySugOf(iid, st))}
        />
      </div>

      {/* 다음 수업 계획 (원장님 2026-08-20) — 기억이 생생할 때 미리 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>다음 수업</span>
        <div style={{ flex: 1 }}>
          <div className="stack" style={{ gap: 3 }}>
            {planNext.map((iid, idx) => (
              <div className="row" key={iid} style={{ gap: 4, alignItems: "center" }}>
                <span className="hint" style={{ width: 16, textAlign: "right" }}>{idx + 1}</span>
                <span className="tag tag-sky">{nameOf(iid) || "학습"}</span>
                <button className="btn btn-ghost btn-sm" disabled={idx === 0}
                  onClick={() => {
                    const n = [...planNext];
                    [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                    setPlanNext(n);
                  }}>↑</button>
                <button className="btn btn-ghost btn-sm" disabled={idx === planNext.length - 1}
                  onClick={() => {
                    const n = [...planNext];
                    [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]];
                    setPlanNext(n);
                  }}>↓</button>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => setPlanNext(planNext.filter((x) => x !== iid))}>✕</button>
              </div>
            ))}
            {planNext.length === 0 && (
              <span className="hint">
                다음 수업에 학원에서 할 것 — 지금 정해두면 다음 수업 등원 목록에 미리 서요.
              </span>
            )}
            {planNext.length > 0 && (() => {
              const { sec, unknownN } = listLoad(row.paceOf || {}, planNext);
              if (!sec) return null;
              const budget = row.classMinutes || 0;
              const over = budget > 0 && sec / 60 > budget * 0.9;
              return (
                <span className={`tag ${over ? "tag-amber" : "tag-mint"}`} style={{ alignSelf: "flex-start" }}>
                  예상 {minLabel(sec)}{budget ? ` / 수업 ${budget}분` : ""}
                  {unknownN > 0 ? ` (기록 없음 ${unknownN})` : ""}
                </span>
              );
            })()}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-sm"
              disabled={pending}
              title="진도루틴의 다음 차례(오늘 저장으로 한 단계 넘어간 것)를 미리 담습니다"
              onClick={() =>
                startTransition(async () => {
                  const res = await nextRoutine(row.student.id, { peek: true });
                  if (res?.error) { alert(res.error); return; }
                  const inc = (res.steps || []).flatMap((st) => st.inclassItems || []);
                  if (inc.length === 0) { alert("진도루틴에서 담을 것이 없어요."); return; }
                  setPlanNext([...new Set([...planNext, ...inc])]);
                })
              }
            >
              ⟳ 다음 수업 루틴 미리 담기
            </button>
            <select
              className="input input-sm"
              style={{ width: 160 }}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v && !planNext.includes(v)) setPlanNext([...planNext, v]);
                e.target.value = "";
              }}
            >
              <option value="">＋ 항목 더하기…</option>
              {items.filter((i) => !planNext.includes(i.id)).map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 늦은 귀가 안내 — 재시험·미완료 숙제가 있으면 사유가 자동으로 잡힌다 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>하원 안내</span>
        <LateBox
          studentId={row.student.id}
          date={date}
          saved={row.late || {}}
          reasons={lateReasons(
            {
              report: {
                word_correct: form.word_correct === "" ? null : Number(form.word_correct),
                word_total: form.word_total === "" ? 0 : Number(form.word_total),
                skip_kinds: retestSkip ? ["retest"] : [],
              },
              checks: weakOrMissing.map(({ iid, st }) => ({
                name: nameOf(iid) || "숙제",
                status: st,
              })),
              stay: row.stay || [],
            },
            rule
          )}
          retestSkipped={retestSkip}
          onSkipRetest={(on) => {
            setRetestSkip(on);
            startTransition(async () => {
              const res = await skipWordRetest(row.student.id, date, on);
              if (res?.error) { alert(res.error); setRetestSkip(!on); }
            });
          }}
        />
      </div>

      {/* 경고 · 반성문 — 지난 리포트에서 계산된 것 */}
      {row.warn && row.warn.count > 0 && (
        <div className="prow" style={{ alignItems: "flex-start" }}>
          <span className="plabel" style={{ paddingTop: 5 }}>경고</span>
          <WarnBox studentId={row.student.id} warn={row.warn} date={date} />
        </div>
      )}

      {/* 재시험 · 보강 — 검사하다 정해지는 것이라 여기서 바로 잡는다 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>재시험 · 보강</span>
        <div style={{ flex: 1 }}>
          {!mk.open ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setMk({
                  open: true,
                  date: nextMakeupDay(date, rule.makeupDays),
                  time: "",
                  // 미제출·미흡이 있으면 무엇 때문인지 미리 적어둔다
                  reason: unchecked.length === 0
                    ? Object.entries(marks)
                        .filter(([, v]) => v === "missing" || v === "weak")
                        .map(([id]) => nameOf(id))
                        .filter(Boolean)
                        .join(", ")
                    : "",
                })
              }
            >
              ＋ 날짜 잡기
            </button>
          ) : (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <input
                className="input input-sm"
                type="date"
                style={{ width: 150 }}
                value={mk.date}
                onChange={(e) => setMk({ ...mk, date: e.target.value })}
              />
              {/* 보강은 비는 시간에 끼워 넣는 것이라 몇 시인지가 날짜만큼 중요하다.
                  학부모께도 "금요일에 오세요" 로는 안 되고 "금요일 5시" 라야 한다. */}
              <input
                className="input input-sm"
                type="time"
                style={{ width: 116 }}
                title="보강 시각"
                value={mk.time}
                onChange={(e) => setMk({ ...mk, time: e.target.value })}
              />
              {MAKEUP_TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn btn-sm ${mk.time === t ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "2px 8px", fontSize: 13 }}
                  onClick={() => setMk({ ...mk, time: t })}
                >
                  {t}
                </button>
              ))}
              <input
                className="input input-sm"
                style={{ flex: 1, minWidth: 140 }}
                placeholder="무엇 때문인지 (단어 재시험 / 결석 보강 …)"
                value={mk.reason}
                onChange={(e) => setMk({ ...mk, reason: e.target.value })}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || !mk.date}
                onClick={() =>
                  startTransition(async () => {
                    const res = await bookMakeup(
                      row.student.id,
                      mk.date,
                      mk.reason,
                      row.isMakeup ? row.makeupOf : null,
                      mk.time
                    );
                    if (res?.error) { alert(res.error); return; }
                    setMk({ open: false, date: "", time: "", reason: "" });
                    router.refresh();
                  })
                }
              >
                잡기
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setMk({ open: false, date: "", time: "", reason: "" })}>
                취소
              </button>
            </div>
          )}
          <p className="hint" style={{ margin: "4px 0 0" }}>
            그날 <b>오늘 수업</b> 화면에 이 학생이 보강으로 뜹니다. 일정 화면으로 안 나가도 돼요.
            {" "}날짜는 <b>다음 보강 요일</b>이 미리 들어가 있습니다 — 바꾸셔도 됩니다.
          </p>
        </div>
      </div>

      {/* 저장 줄 — 판이 길어서 저장하러 바닥까지 내려가야 했다
          (원장님 2026-08-20 교수자 흐름 점검). 화면 아래에 붙어 다닌다 */}
      <div className="row savebar" style={{ justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 8 }}>
        {savedDraftAt && (
          <span className="hint" style={{ fontSize: 13 }}>
            {savedDraftAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 임시저장됨
          </span>
        )}
        {/* **임시저장** — 적은 것을 서버에 두고 완료로는 안 넘긴다.
            수업 중간에 끊겨도, 다른 기기에서 열어도 그대로 이어진다 */}
        <button className="btn btn-ghost btn-sm" onClick={() => save(true)} disabled={pending || saving}>
          임시저장
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => save(false)} disabled={pending || saving}>
          {pending || saving ? "저장 중…" : unchecked.length > 0 ? `저장 (숙제 ${unchecked.length}개 미검사)` : "저장하고 완료"}
        </button>
      </div>
    </div>
  );
}
