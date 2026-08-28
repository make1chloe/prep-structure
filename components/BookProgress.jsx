"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ProgressPickModal from "@/components/ProgressPickModal";
import { annotateBigs, groupByParent, bigStat } from "@/components/unitGroups";
import { useBigFold } from "@/components/useBigFold";
import {
  listStudentUnits,
  setUnitProgress,
  setCurrentPage,
  setStudentBookStatus,
  nextRound,
  prevRound,
  setUnitNote,
  setBookSkipActs,
  setBookPause,
} from "@/app/progress/actions";

/**
 * 교재 한 권의 **진도** — 단원을 순서와 상관없이 눌러서 기록한다.
 *
 * 원장님 (2026-08-14): 「학생별로 진도를 저장하는 화면이 오늘수업밖에 없고
 * 그마저도 조악함」.
 *
 * 그래서 **오늘 수업 밖으로 꺼냈다.** 진도를 적는 일이 수업 중에만 생기는 것이
 * 아니다 — 상담 전에 어디까지 했는지 보고, 결석한 아이 것을 나중에 채우고,
 * 회독을 넘긴다. 그때마다 오늘 수업 화면을 열어 그 날짜를 찾아 들어갈 수는 없다.
 * 이제 재원생 화면의 「교재」 탭에서도 같은 것을 쓴다 — **한 벌이라 어긋나지 않는다.**
 *
 * @param extra 오늘 수업에서만 붙는 것 (단어시험 방식). components 가
 *   app/today 를 가리키면 안 되므로 넣어주는 쪽에서 준다.
 * @param openFirst 재원생 화면처럼 **진도를 보러 들어온 자리**에서는 펴 둔다.
 */
export default function BookProgress({
  studentId,
  book,
  extra = null,
  openFirst = false,
  initialUnits = null,   // 부모가 한 왕복으로 받아 나눠준 것 (재원생·진도 화면)
  initialRound = null,
  /**
   * **숙제로 담기** (원장님, 2026-08-19 — 「오늘 숙제로 나갈 부분을 따로
   * 표시해서 숙제에 반영」). 오늘 수업에서만 넣어준다 — 단원을 누르면
   * 아래 「다음 숙제 배정」 에 담긴다 (저장소는 그 한 곳, 원칙 1).
   */
  onHomework = null,     // (unit) => void — 담기/빼기 토글
  hwPicked = null,       // Set<unitId> — 지금 담겨 있는 단원들
  /**
   * **교재멈춤 · 숙제멈춤** (0149, 원장님 2026-08-22 — 「교재멈춤은 내신
   * 대비할 때 아예 진도 스탑, 숙제멈춤은 숙제만 안 나감」). 내신 대비
   * 기간에 평소 교재를 잠시 세우는 단추다 — 거르는 판단은 서버 nextRoutine
   * 한 곳이고, 여기는 켜고 끄기만 한다.
   * 오늘 수업 판은 이미 차려진 항목을 즉시 걷어내야 해서 부모(StudentPanel)
   * 가 값·토글을 쥐고 내려준다 (pause + onPauseToggle). 재원생·진도
   * 화면에서는 안 내려주므로 이 판이 스스로 저장한다 (낙관, 실패 되돌림).
   */
  pause: pauseCtl = undefined,   // 부모가 쥔 멈춤 값 (오늘 수업)
  onPauseToggle = null,          // (kind) => void — 있으면 부모가 저장까지 한다
  /**
   * **수업 중에는 시계를 아예 안 돌린다** (원장님 2026-08-28 —
   * 「오늘학습에서 진도체크하면 새로고침됨」).
   *
   * 2026-08-19 에 「즉시 → 12초 뒤」 로 미뤄뒀는데, **12초는 원장님이 다음
   * 단원을 고르며 생각하는 시간보다 짧다.** 그래서 수업 중에 화면이 통째로
   * 다시 그려진다. 오늘 수업 판에는 이미 「화면을 안 갈아엎는다」 가 성문
   * 규칙으로 있는데(StudentPanel — router.refresh 를 안 부른다) 이 판만
   * 그 규칙 밖에 있었다.
   *
   * 켜면 **떠날 때·접을 때만** 다시 그린다. 그 둘을 지우면 2026-08-23
   * 시뮬에서 잡은 버그가 되살아난다 — 체크하고 다른 학생을 누르면 목록의
   * ◐·진도율이 옛날 그대로 남아 「저장이 안 됐나」 로 보인다.
   *
   * **기본값은 지금 그대로다** — 진도 화면·대시보드 팝오버는 안 바뀐다.
   * 특히 대시보드 팝오버는 닫을 때 숫자가 갱신되어야 하므로 그대로 둔다.
   */
  refreshOnLeaveOnly = false,
}) {
  const [open, setOpen] = useState(openFirst);
  const [units, setUnits] = useState(initialUnits);
  const [err, setErr] = useState(null);
  const [page, setPage] = useState(book.curPage || "");
  const [round, setRound] = useState(initialRound); // 지금 몇 회독째
  /**
   * **지난 회독 보기** (원장님, 2026-08-23 — 「진도 체크에서 몇 회독인지
   * 체크할 수가 없어」). 진도는 회독별로 쌓이고(학생·단원·회독이 한 줄)
   * 지난 회독 기록은 지우지 않는 규칙이라 기록은 다 있는데, 볼 창이
   * 없었다. viewRound 가 있으면 그 회독의 체크를 보여주고, **단건
   * 체크는 그 회독에 바로 고칠 수 있다** (원장님 2026-08-23 — 「체크
   * 안 한 게 안 한 걸로 기록되는 걸 모르고 넘어가버렸어. 과거 기록을
   * 수정할 수 있게」). 일괄 도구(구간·전체·숙제로)는 지난 회독에서
   * 계속 숨긴다 — 실수로 지난 기록을 쓸어버리지 않게.
   */
  const [viewRound, setViewRound] = useState(null); // null = 지금 회독
  const [pastUnits, setPastUnits] = useState(null); // 보는 회독의 단원들 (null = 불러오는 중)
  const viewReq = useRef(0);                        // 칩을 빨리 갈아눌러도 마지막 것만
  const [q, setQ] = useState("");                // 단원 검색
  // 대단원 접힘 — 규칙은 components/useBigFold 한 벌 (어느 화면에서 열든 같다)
  const bigFold = useBigFold(q);
  const [noteFor, setNoteFor] = useState(null);  // 메모를 적는 중인 단원
  /**
   * **골라서 한 번에** (원장님, 2026-08-14 — 「체크박스를 이용한 완료
   * 여부를 일괄적으로 바꿀 수 있게 하면 안될까?」).
   *
   * 순차로 안 나가는 교재는 완료가 띄엄띄엄이다 — 하나씩 세 단계 사이클로
   * 맞추려면 손이 많이 간다. 목록은 전체선택 → 일괄처리 (원칙 5-3).
   *
   * 2026-08-27 오후부터는 판 안 모드가 아니라 **팝오버**(ProgressPickModal)
   * 에서 고른다 (원장님 — 「진도는 상세 단원 선택할 때 모달을 활용하는 게
   * 낫지 않나」). 단원 수십 개짜리 교재에서 가로로 감긴 칩 바다를 판
   * 스크롤로 오가며 찾는 대신, 세로 목록 + 글자 필터에서 체크하고 한
   * 번에 찍는다. pick 이 있으면 열려 있는 것 — ids 는 미리 체크할 단원
   * (대단원 막대에서 열면 그 대단원), seq 는 막대를 연달아 눌러도 새로
   * 열리게 하는 열쇠다.
   */
  const [pick, setPick] = useState(null);   // null | { seq, ids: [unitId…] }

  function openPick(ids = []) {
    setUptoMode(false);
    setHwMode(false);
    setNoteFor(null);
    setPick((p) => ({ seq: (p?.seq || 0) + 1, ids }));
  }
  /**
   * **여기까지 완료** (원장님, 2026-08-14 — 「이미 100페이지 진도를
   * 나갔다고 치면 100페이지 내용을 다 일일이 선택해야 하니까 번거로워」).
   *
   * 이미 나간 진도를 처음 적을 때는 골라서(☑)로도 백 번을 눌러야 한다.
   * 지금 하는 단원 하나만 누르면 — 그 단원은 ◐, 그 앞은 전부 ○ 완료.
   */
  const [uptoMode, setUptoMode] = useState(false);
  const [hwMode, setHwMode] = useState(false);   // 📝 숙제로 담는 중
  const [noteDraft, setNoteDraft] = useState("");
  const [pending, startTransition] = useTransition();
  /**
   * **저장됐다는 표시** (원장님, 2026-08-17 — 「진도 다 표시했는데
   * 저장버튼도 없고 다 날아감」). 저장 단추가 없는 건 누르는 순간
   * 저장되기 때문인데, 그걸 화면이 말을 안 해줘서 저장됐는지 알 수가
   * 없었다. 마지막으로 저장된 시각을 보여준다.
   */
  const [savedAt, setSavedAt] = useState(null);
  /**
   * **빼는 활동** (원장님, 2026-08-19 — 「도저히 안 되겠다 싶으면
   * 워크북은 빼고 하게 된단 말이야」). 여기 담긴 활동의 단원은
   * 이 학생의 진도율·전체완료·여기까지·숙제 배정에서 빠진다.
   * 기록은 그대로다 — 칩이 흐려질 뿐 눌러서 고칠 수도 있다.
   */
  const [skipActs, setSkipActs] = useState(book.skipActs || "");
  // 멈춤 (0149) — 오늘 수업은 부모 값, 그 외 화면은 이 판이 스스로 쥔다
  const [pauseSelf, setPauseSelf] = useState(book.pause || null);
  const pause = onPauseToggle ? (pauseCtl ?? null) : pauseSelf;
  const skipSet = new Set(
    (skipActs || "").split(",").map((s) => s.trim()).filter(Boolean)
  );
  const isSkipped = (u) => !!(u.activity && skipSet.has((u.activity || "").trim()));
  const router = useRouter();

  /**
   * **찍는 동안은 화면을 다시 안 그린다** (원장님, 2026-08-19 — 「교재
   * 진도선택시 새로고침 자동으로 되지 않게 해줘. 아직 선택할게 남았는데
   * 자꾸 뭐가 바뀌어」). 저장은 누르는 순간 그대로 나가고, 주변 화면
   * (요약 줄·진도율 따위)의 새로고침만 **마지막 누름 12초 뒤 한 번**으로
   * 미룬다. 판을 접으면 그 자리에서 바로 새로고침한다.
   */
  const refreshT = useRef(null);
  /**
   * **「고친 것이 있나」 를 시계와 따로 쥔다.** 전에는 타이머가 걸려 있는지로
   * 그것을 대신 알았는데, 시계를 안 돌리는 판(refreshOnLeaveOnly)에서는
   * 그러면 떠날 때도 안 그려서 2026-08-23 버그가 되살아난다.
   */
  const dirty = useRef(false);
  function lazyRefresh() {
    dirty.current = true;
    if (refreshOnLeaveOnly) return;   // 수업 중에는 시계를 안 돌린다
    if (refreshT.current) clearTimeout(refreshT.current);
    refreshT.current = setTimeout(() => {
      refreshT.current = null;
      dirty.current = false;
      router.refresh();
    }, 12000);
  }
  function flushRefresh() {
    if (refreshT.current) { clearTimeout(refreshT.current); refreshT.current = null; }
    if (!dirty.current) return;
    dirty.current = false;
    router.refresh();
  }
  /**
   * 판을 떠날 때도 **미뤄둔 새로고침은 돌리고 간다** (2026-08-23 시뮬).
   * 전에는 타이머를 지우기만 해서, 체크하고 12초 안에 다른 학생을 누르면
   * 목록의 ◐·진도율이 옛날 그대로 남았다 — 「저장이 안 됐나」로 보인다.
   * (setUnitProgress 는 revalidate 를 일부러 안 한다. 새로고침 시점을
   * 화면이 정하기로 한 이상, 떠나는 것도 시점의 하나다.)
   */
  useEffect(() => () => {
    if (refreshT.current) { clearTimeout(refreshT.current); refreshT.current = null; }
    if (!dirty.current) return;
    dirty.current = false;
    router.refresh();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  function stampSaved() {
    const d = new Date();
    setSavedAt(
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    );
  }

  async function load() {
    const res = await listStudentUnits(studentId, book.id);
    if (res.error) setErr(res.error);
    setUnits(res.units || []);
    if (res.round) setRound(res.round);
  }

  // 진도를 보러 들어온 자리는 펴 둔 채로 여니 처음부터 읽어온다
  useEffect(() => {
    if (open && units === null) load();
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && units === null) load();
    if (!next) flushRefresh();   // 접으면 미뤄둔 새로고침을 그 자리에서
  }

  /**
   * 회독 칩을 눌러 그 회독의 기록을 본다. 회독 전환은 **조회**라 화면을
   * 먼저 「불러오는 중」 으로 갈아끼운다 (낙관 UI 와 같은 태도 — 누른 즉시
   * 반응). 읽기는 listStudentUnits 의 round 매개변수 하나로 끝난다 —
   * 판단(어느 회독을 읽나)이 서버 한 곳에 있으니 여기는 숫자만 넘긴다.
   */
  async function viewPast(r) {
    viewReq.current += 1;
    // 보기 전용으로 들어가며 고치는 모드는 다 끈다 — 지난 회독에 찍는 사고 방지
    setPick(null);
    setUptoMode(false);
    setHwMode(false);
    setNoteFor(null);
    if (!r || r === (round || 1)) {  // 지금 회독으로 돌아오기
      setViewRound(null);
      setPastUnits(null);
      return;
    }
    const seq = viewReq.current;
    setViewRound(r);
    setPastUnits(null);              // 즉시 「불러오는 중」
    const res = await listStudentUnits(studentId, book.id, r);
    if (seq !== viewReq.current) return;   // 그 사이 다른 칩을 눌렀다
    if (res.error) { setErr(res.error); return; }
    setPastUnits(res.units || []);
  }

  /**
   * **안 함 → 하는 중 → 완료 → 안 함.**
   *
   * 표(student_unit_progress)에는 doing 이 처음부터 있었는데 화면에서 쓸 길이
   * 없었다. 그래서 한 단원을 여러 번에 걸쳐 하는 교재(문법 한 단원을 세 번
   * 수업)에서는 「아직 안 함」 과 「하다 말았음」 이 같은 얼굴이었다.
   * 다음 수업에 어디부터인지 다시 물어봐야 했다.
   */
  const NEXT = { "": "doing", doing: "done", done: "" };

  function mark(unitId, status) {
    // 지난 회독 보기 중이면 **그 회독에** 쓴다 (2026-08-23 「과거 기록을
    // 수정할 수 있게」). 낙관 — 화면 먼저, 저장은 뒤에서.
    if (pastView) {
      const r = viewRound;
      setPastUnits((list) =>
        (list || []).map((u) => (u.id === unitId ? { ...u, status: status || "" } : u))
      );
      startTransition(async () => {
        const res = await setUnitProgress(studentId, [unitId], status || null, { round: r });
        if (res?.error) { alert(res.error); viewPast(r); return; }
        stampSaved();
      });
      return;
    }
    // 화면을 먼저 바꾸고 저장한다 (수업 중 기다리지 않도록)
    setUnits((list) =>
      (list || []).map((u) => (u.id === unitId ? { ...u, status: status || "" } : u))
    );
    startTransition(async () => {
      const res = await setUnitProgress(studentId, [unitId], status || null);
      if (res?.error) {
        alert(res.error);
        load();
        return;
      }
      stampSaved();
      lazyRefresh();
    });
  }

  function markAll(done) {
    // 빼는 활동(워크북 등)은 전체완료·전체해제에서도 빠진다
    const targets = (units || []).filter((u) => u.leaf && !isSkipped(u));
    const ids = targets.filter((u) => (u.status === "done") !== done).map((u) => u.id);
    if (ids.length === 0) return;
    setUnits((list) =>
      (list || []).map((u) =>
        u.leaf && !isSkipped(u) ? { ...u, status: done ? "done" : "" } : u
      )
    );
    startTransition(async () => {
      const res = await setUnitProgress(studentId, ids, done ? "done" : null);
      if (res?.error) { alert(res.error); load(); return; }
      stampSaved();
      lazyRefresh();
    });
  }

  /** 멈춤 켜고 끄기 — 부모가 안 쥐는 화면(재원생·진도)용. 낙관, 실패 되돌림 */
  function togglePauseSelf(kind) {
    const prev = pauseSelf;
    const nextP = prev === kind ? null : kind;   // 같은 것 다시 누르면 해제
    setPauseSelf(nextP);
    startTransition(async () => {
      const res = await setBookPause(studentId, book.id, nextP);
      if (res?.error) { alert(res.error); setPauseSelf(prev); return; }
      stampSaved();
      lazyRefresh();
    });
  }

  function toggleSkip(act) {
    const n = new Set(skipSet);
    if (n.has(act)) n.delete(act);
    else n.add(act);
    const txt = [...n].join(",");
    const prev = skipActs;
    setSkipActs(txt);
    startTransition(async () => {
      const res = await setBookSkipActs(studentId, book.id, txt);
      if (res?.error) { alert(res.error); setSkipActs(prev); return; }
      stampSaved();
      lazyRefresh();
    });
  }

  // 화면에 보이는 값 (막 누른 것도 바로 반영)
  const leaves = (units || []).filter((u) => u.leaf);
  // 이 교재에 있는 활동들 — 두 갈래 이상일 때만 「빼기」 를 보여준다
  // (활동이 하나뿐이면 빼기 = 교재를 안 하는 것이라 「끝냄」 이 맞다)
  const actList = [...new Set(leaves.map((u) => (u.activity || "").trim()).filter(Boolean))];
  // 진도율·순차 배정의 기준 — 빼는 활동은 분모에서도 빠진다
  const activeLeaves = leaves.filter((u) => !isSkipped(u));
  const liveDone = units ? activeLeaves.filter((u) => u.status === "done").length : book.doneUnits;
  const liveTotal = units ? activeLeaves.length : book.totalUnits;
  const livePercent =
    liveTotal > 0 ? Math.round((liveDone / liveTotal) * 100) : book.percent;
  const noUnits = units !== null && leaves.length === 0;
  // 지난 회독을 보는 중 — 단원 목록만 그 회독 것으로 바뀐다.
  // 판 머리의 진도율·요약은 지금 회독 그대로 (거긴 「지금 어디」 를 말하는 자리)
  const pastView = viewRound !== null;
  const shownUnits = pastView ? pastUnits || [] : units;

  function saveNote(unitId) {
    startTransition(async () => {
      const res = await setUnitNote(studentId, unitId, noteDraft);
      if (res?.error) { alert(res.error); return; }
      setNoteFor(null);
      await load();
      lazyRefresh();
    });
  }

  // 팝오버가 돌려준 단원들에 한 상태를 일괄로 — 저장 판단은 여기 한 곳
  function markMany(ids, status) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    // 화면 먼저 (수업 중 기다리지 않게) — 실패하면 다시 읽어온다
    setUnits((list) =>
      (list || []).map((u) => (idSet.has(u.id) ? { ...u, status: status || "" } : u))
    );
    startTransition(async () => {
      const res = await setUnitProgress(studentId, ids, status || null);
      if (res?.error) {
        alert(res.error);
        load();
        return;
      }
      stampSaved();
      lazyRefresh();
    });
  }

  function markUpto(unitId) {
    // 빼는 활동은 「여기까지」 로도 완료가 찍히지 않는다
    const idx = activeLeaves.findIndex((u) => u.id === unitId);
    if (idx < 0) return;
    const beforeIds = activeLeaves.slice(0, idx).map((u) => u.id);
    const beforeSet = new Set(beforeIds);
    setUptoMode(false);
    // 화면 먼저 — 실패하면 다시 읽어온다
    setUnits((list) =>
      (list || []).map((u) =>
        u.id === unitId
          ? { ...u, status: "doing" }
          : beforeSet.has(u.id)
          ? { ...u, status: "done" }
          : u
      )
    );
    startTransition(async () => {
      if (beforeIds.length) {
        const res = await setUnitProgress(studentId, beforeIds, "done");
        if (res?.error) { alert(res.error); load(); return; }
      }
      const res2 = await setUnitProgress(studentId, [unitId], "doing");
      if (res2?.error) { alert(res2.error); load(); return; }
      stampSaved();
      lazyRefresh();
    });
  }

  function savePage() {
    startTransition(async () => {
      const res = await setCurrentPage(studentId, book.id, page);
      if (res?.error) alert(res.error);
      // 이 판의 다른 저장은 전부 미뤄 두는데(2026-08-19 처방) 여기만 즉시
      // 새로고침이라 페이지를 적는 동안 화면이 다시 그려졌다 — 빠진 구멍
      lazyRefresh();
    });
  }

  return (
    <div className="bookprog">
      <button
        onClick={toggle}
        style={{
          all: "unset", cursor: "pointer", display: "block", width: "100%",
        }}
      >
        {/* 접히게 둔다 — nowrap 이면 교재 이름이 글자 단위로 끊긴다 (2026-08-24) */}
        <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12 }}>{open ? "▾" : "▸"}</span>
          <b style={{ fontSize: 14 }}>{book.name}</b>
          {/* 교재 자체가 절판·중단인데 배정만 남은 것 — 숨기지 않고 표시한다
              (숨기면 화면마다 다른 말을 하고, 끝냄 처리할 길도 없다) */}
          {book.dead && (
            <span className="tag tag-muted" title="교재가 절판·중단 상태예요. 안 쓰면 🧹 교재 정리로 끝내주세요">
              중단 교재
            </span>
          )}
          <span className="spacer" />
          <span className="hint">
            {liveTotal > 0
              ? `${liveDone}/${liveTotal}단원`
              : book.bookPages
              ? `${book.curPage || 0}/${book.bookPages}p`
              : "진도 기록 전"}
          </span>
          {livePercent !== null && liveTotal > 0 && (
            <span className={`tag ${livePercent >= 80 ? "tag-mint" : "tag-sky"}`}>
              {livePercent}%
            </span>
          )}
        </div>
        <div className="bar">
          <span style={{ width: `${livePercent ?? 0}%` }} />
        </div>
      </button>

      {/**
        * **판 머리의 멈춤 단추** (0149, 원장님 2026-08-22). 내신 대비 기간에
        * 쓴다 — ⏸ 교재멈춤은 이 교재를 통째로 세우고(자동 차림·숙제 전부),
        * 📴 숙제멈춤은 수업은 하되 숙제만 안 나간다. 해제해야 정상 수업
        * 숙제가 나간다. 접힌 채로도 보인다 — 멈춘 걸 모르는 게 제일 나쁘다.
        */}
      <div className="row" style={{ gap: 4, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
        {[["all", "⏸ 교재멈춤", "tag-red", "내신 대비 등으로 이 교재 진도를 아예 세웁니다 — 자동 차림·숙제에서 빠져요"],
          ["home", "📴 숙제멈춤", "tag-amber", "수업(등원 학습)은 그대로 하고 숙제만 안 나가요"]].map(
          ([kind, label, cls, tip]) => (
            <button
              key={kind}
              className={`tag ${pause === kind ? cls : "tag-muted"}`}
              style={{ cursor: "pointer", border: 0, fontFamily: "inherit" }}
              title={tip}
              disabled={pending}
              onClick={() => (onPauseToggle ? onPauseToggle(kind) : togglePauseSelf(kind))}
            >
              {pause === kind ? "●" : "○"} {label}
            </button>
          )
        )}
        {pause && (
          <span className="tag tag-amber">
            멈춤 — 해제해야 숙제 나감
          </span>
        )}
      </div>

      {/* 단어 교재는 시험 방식을 라벨로 붙인다 (오늘 수업에서만 넣어준다) */}
      {extra && <div style={{ marginTop: 4 }}>{extra}</div>}

      {open && (
        <div style={{ marginTop: 8 }}>
          {err && <div className="err">{err}</div>}
          {units === null && <span className="hint">단원 불러오는 중…</span>}
          {noUnits && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="hint">
                이 교재는 아직 단원이 없어요. 단원을 만들기 전까지는 페이지로 진도를 적을 수 있어요.{" "}
                {/* 원장님 (2026-08-14): 「교재 진도 입력하는 게 계속 페이지야」 —
                    페이지로만 나오는 이유와 벗어나는 길을 그 자리에서 알려준다 */}
                <a href={`/textbooks?tb=${book.id}`} style={{ fontWeight: 700 }}>
                  단원 만들러 가기 →
                </a>{" "}
                (「⚡ 단원 한 번에 만들기」 로 Unit 1~N 을 한 번에)
              </span>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <span className="hint">지금</span>
                <input
                  className="input input-sm"
                  style={{ width: 64, textAlign: "center" }}
                  inputMode="numeric"
                  value={page}
                  onChange={(e) => setPage(e.target.value)}
                  placeholder="0"
                />
                <span className="muted">/ {book.bookPages || "?"}p</span>
                <button className="btn btn-primary btn-sm" onClick={savePage} disabled={pending}>
                  저장
                </button>
                {!book.bookPages && (
                  <span className="hint">교재 페이지에서 총 페이지를 넣으면 %가 나와요</span>
                )}
                {/* **단원 없이도 끝낼 수 있다** (원장님, 2026-08-19 —
                    「단원입력없이 사용완료 처리도 가능하게해줘」). 끝냄
                    단추가 단원 도구 줄에만 있어서, 단원을 안 만든 교재는
                    끝낼 길이 없었다. */}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (!confirm(`${book.name} 을 다 끝낸 교재로 처리할까요?\n숙제·진도 화면에서 빠지고 학생 기록에만 남습니다.`)) return;
                    startTransition(async () => {
                      const res = await setStudentBookStatus(studentId, book.id, "done");
                      if (res?.error) alert(res.error);
                      router.refresh();
                    });
                  }}
                  disabled={pending}
                >
                  이 교재 끝냄
                </button>
              </div>
            </div>
          )}
          {leaves.length > 0 && (
            <>
              {/**
                * **지금 하는 곳** (원장님, 2026-08-14 — 「순차적으로 진도를
                * 안 나간 교재들도 있어서 그 부분 고려해 줘」).
                *
                * 순차로 나가는 교재는 마지막 ○ 다음이 오늘 자리지만, 건너뛰며
                * 나가는 교재는 ○ 가 흩어져 있어 **오늘 어디인지가 안 보인다.**
                * 그래서 ◐(하는 중)로 찍은 단원을 맨 위에 이름으로 박아준다 —
                * 오늘 시작할 때 ◐ 를 찍어두면, 다음에 열어도 바로 보인다.
                */}
              {!pastView && leaves.some((u) => u.status === "doing") && (
                <div className="row" style={{ gap: 5, marginBottom: 6, alignItems: "center" }}>
                  <span className="tag tag-amber">◐ 지금 하는 곳</span>
                  <b style={{ fontSize: 13.5 }}>
                    {leaves.filter((u) => u.status === "doing").map((u) => u.name).join(" · ")}
                  </b>
                </div>
              )}
              <div className="row" style={{ gap: 4, marginBottom: 6, alignItems: "center" }}>
                {/**
                  * **몇 회독인지 항상 보인다** (원장님, 2026-08-23 — 「진도
                  * 체크에서 몇 회독인지 체크할 수가 없어」). 전에는 2회독부터만
                  * 태그가 붙어서, 1회독 때는 회독이라는 것이 있는지도 화면에
                  * 안 나왔다. 2회독부터는 칩이 회독 수만큼 생긴다 — 지난
                  * 회독 칩을 누르면 그때의 체크 기록을 **보기만** 할 수 있다
                  * (기록은 회독별로 그대로 쌓여 있으니 읽기만 하면 된다).
                  */}
                {(round || 1) === 1 ? (
                  <span className="tag tag-lav">1회독</span>
                ) : (
                  Array.from({ length: round }, (_, i) => i + 1).map((r) => {
                    const cur = r === round;
                    const on = pastView ? viewRound === r : cur;
                    return (
                      <button
                        key={r}
                        className={`tag ${on ? "tag-lav" : "tag-muted"}`}
                        style={{ cursor: "pointer", border: 0, fontFamily: "inherit" }}
                        title={cur ? "지금 회독" : "이 회독의 기록 보기·고치기"}
                        onClick={() => viewPast(cur ? null : r)}
                      >
                        {r}회독
                      </button>
                    );
                  })
                )}
                {pastView && (
                  <span className="tag tag-amber">
                    {viewRound}회독 기록을 고치는 중 — 체크가 이 회독에 저장돼요
                  </span>
                )}
                {pastView && pastUnits === null && (
                  <span className="hint" style={{ alignSelf: "center" }}>불러오는 중…</span>
                )}
                {/**
                  * **다음 회독은 언제든 넘길 수 있다** (원장님, 2026-08-23).
                  * 전에는 전 단원 완료일 때만 단추가 나타났는데, 원장님
                  * 운영에서 회독(같은 책을 다시 도는 반복)은 독해 복습의
                  * 축이라 어디서 끊고 다시 돌지가 교재마다 자유다 — 다 못
                  * 채운 채 2회독을 시작하는 게 예외가 아니라 일상이다.
                  * 미완료가 있으면 확인창이 개수를 말해주고 넘어간다.
                  */}
                {activeLeaves.length > 0 && !pastView && (
                  <button
                    className={`btn btn-sm ${
                      activeLeaves.every((u) => u.status === "done") ? "btn-on" : "btn-ghost"
                    }`}
                    disabled={pending}
                    title="지난 회독 진도는 그대로 남고, 새 회독이 빈 상태로 시작합니다"
                    onClick={() => {
                      const left = activeLeaves.filter((u) => u.status !== "done").length;
                      const warn = left > 0
                        ? `\n\n아직 ○ 안 된 단원이 ${left}개 있어요 — 그래도 다음 회독으로 넘길까요?`
                        : "";
                      if (!confirm(`${book.name} 을 다음 회독으로 넘길까요?\n\n지금까지의 진도는 ${round || 1}회독 기록으로 남고, 단원은 빈 상태가 됩니다.${warn}`)) return;
                      startTransition(async () => {
                        const res = await nextRound(studentId, book.id);
                        if (res?.error) { alert(res.error); return; }
                        await load();
                        router.refresh();
                      });
                    }}
                  >
                    ⟳ 다음 회독으로
                  </button>
                )}
                {/**
                  * **회독 취소** (원장님, 2026-08-23 — 「잘 모르고
                  * 넘어가버렸어 … 회독을 취소할 수 있게 해줘」).
                  * 번호만 되돌린다 — 이번 회독에 찍은 기록은 표에 남아,
                  * 다시 넘기면 그대로 보인다 (기록은 지우지 않는 규칙).
                  */}
                {!pastView && (round || 1) > 1 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    title="회독 번호만 되돌립니다 — 이번 회독에 찍은 것은 지워지지 않고, 다시 넘기면 그대로 보여요"
                    onClick={() => {
                      if (!confirm(`${book.name} 을 ${(round || 1) - 1}회독으로 되돌릴까요?\n\n${round || 1}회독에 찍은 기록은 지워지지 않아요 — 다시 넘기면 그대로 보입니다.`)) return;
                      startTransition(async () => {
                        const res = await prevRound(studentId, book.id);
                        if (res?.error) { alert(res.error); return; }
                        setRound(res.round);
                        setViewRound(null);
                        setPastUnits(null);
                        await load();
                        router.refresh();
                      });
                    }}
                  >
                    ↩ 회독 취소
                  </button>
                )}
                {/* 단원이 쉰 개 넘는 교재가 있다 — 눈으로 찾지 않게 */}
                {leaves.length > 12 && (
                  <input
                    className="input input-sm"
                    style={{ width: 120 }}
                    placeholder="단원 찾기"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                )}
                {/* 지난 회독을 보는 중엔 고치는 단추를 전부 감춘다 — 보기 전용 */}
                {!pastView && (
                  <>
                    {onHomework && (
                      <button
                        className={`btn btn-sm ${hwMode ? "btn-on" : "btn-ghost"}`}
                        onClick={() => { setHwMode(!hwMode); setUptoMode(false); setPick(null); }}
                        title="단원을 누르면 아래 「다음 숙제 배정」 에 담깁니다. ◐ 하다 만 단원도 이어서 낼 수 있어요"
                      >
                        📝 숙제로
                      </button>
                    )}
                    <button
                      className={`btn btn-sm ${uptoMode ? "btn-on" : "btn-ghost"}`}
                      onClick={() => { setUptoMode(!uptoMode); setHwMode(false); setPick(null); }}
                      title="지금 하는 단원을 누르면 그 앞이 전부 완료로 찍힙니다"
                    >
                      ⏩ 여기까지
                    </button>
                    <button
                      className={`btn btn-sm ${pick ? "btn-on" : "btn-ghost"}`}
                      onClick={() => (pick ? setPick(null) : openPick())}
                      title="팝업에서 여러 단원을 체크해 완료·하는 중·안 함으로 한 번에 찍습니다"
                    >
                      ☑ 골라서
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => markAll(true)} disabled={pending}>
                      전체 완료
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        if (!confirm(`${book.name} 을 다 끝낸 교재로 처리할까요?\n숙제·진도 화면에서 빠지고 학생 기록에만 남습니다.`)) return;
                        startTransition(async () => {
                          const res = await setStudentBookStatus(studentId, book.id, "done");
                          if (res?.error) alert(res.error);
                          router.refresh();
                        });
                      }}
                      disabled={pending}
                    >
                      이 교재 끝냄
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => markAll(false)} disabled={pending}>
                      전체 해제
                    </button>
                  </>
                )}
                {(pending || savedAt) && (
                  <span
                    className={`tag ${pending ? "tag-amber" : "tag-mint"}`}
                    style={{ alignSelf: "center" }}
                  >
                    {pending ? "저장 중…" : `✓ ${savedAt} 저장됨`}
                  </span>
                )}
                <span className="hint" style={{ alignSelf: "center" }}>
                  {pastView
                    ? `${viewRound}회독 때의 기록이에요 — 체크하려면 ${round}회독 칩으로 돌아오세요`
                    : hwMode
                    ? "숙제로 낼 단원을 누르세요 — 아래 「다음 숙제 배정」 에 담겨요 (◐ 하다 만 것도 이어서)"
                    : uptoMode
                    ? "지금 하는 단원을 누르세요 — 그 단원은 ◐, 그 앞은 전부 ○ 완료"
                    : pick
                    ? "팝업에서 단원을 체크하고 한 번에 찍으세요"
                    : "누를 때마다 안 함 → ◐ 하는 중 → ○ 완료 — 누르는 순간 저장돼요"}
                </span>
              </div>
              {/**
                * **빼기** (원장님, 2026-08-19 — 「체크박스의 워크북 나중에
                * 누르면 그때까지 진도 기록은 유지가 된 상태에서 앞으로의
                * 숙제 배정에는 워크북이 빠지게 할 수 있어?」). ⛔ 누른
                * 활동은 이 학생의 배정·진도율·전체완료·여기까지에서 빠진다.
                */}
              {!pastView && (actList.length >= 2 || skipSet.size > 0) && (
                <div className="row" style={{ gap: 4, margin: "0 0 6px", alignItems: "center", flexWrap: "wrap" }}>
                  <span className="hint">이 학생은 빼기:</span>
                  {actList.map((a) => {
                    const on = skipSet.has(a);
                    return (
                      <button
                        key={a}
                        className={`tag ${on ? "tag-amber" : "tag-muted"}`}
                        style={{ cursor: "pointer", border: 0, fontFamily: "inherit" }}
                        title="누르면 이 활동 단원이 이 학생의 숙제 배정·진도율에서 빠져요. 기록은 남아요."
                        onClick={() => toggleSkip(a)}
                        disabled={pending}
                      >
                        {on ? "⛔" : "☐"} {a}
                      </button>
                    );
                  })}
                  {skipSet.size > 0 && (
                    <span className="hint">
                      ⛔ 활동은 앞으로의 배정·진도율에서 빠져요 — 지금까지 기록은 남아요
                    </span>
                  )}
                </div>
              )}
              <div className="stack unitscroll" style={{ gap: 4 }}>
                {annotateBigs(groupByParent(shownUnits, q)).map(({ head, mid, list, big, bigStart, bigIds }) => (
                  <Fragment key={head || "_"}>
                    {/**
                      * **대단원은 판을 가로지르는 막대** (원장님, 2026-08-17 —
                      * 「대중소단원 구별이 너무 안돼. 색깔이 다 비슷비슷해서
                      * 내용이 구조로 빨리 파악이 안돼」). 대=막대 · 중=하늘
                      * 라벨 · 소=알약, 세 층이 다른 얼굴을 갖는다.
                      * 고르기 모드에서는 막대가 「통째로」 단추다 (2026-08-14
                      * 「대단원 자체를 통째로 선택하는 게 안 돼」).
                      */}
                    {/**
                      * **막대의 두 일을 갈랐다** (원장님 2026-08-28 —
                      * 「대단원은 무조건 접힌 상태로 두고, 제목 클릭 시
                      *  열리게 해줘」).
                      *
                      * 여태 막대 전체가 「통째로 고르기」 단추였다. 거기에
                      * 펴기를 얹으면, 펴려고 누른 손이 진도를 통째로 찍는
                      * 팝업을 연다 — 원장님이 원한 것과 정반대다.
                      * 그래서 **이름은 펴기 · 오른쪽 작은 단추는 통째로
                      * 고르기**로 자리를 나눈다.
                      */}
                    {bigStart && (() => {
                      const st = bigStat(shownUnits, bigIds);
                      const shut = !bigFold.isOpen(big);
                      return (
                        <div className="unit-bigbar unit-bigrow">
                          <button
                            type="button"
                            className="unit-bigname"
                            aria-expanded={!shut}
                            title={shut ? "눌러서 펴기" : "눌러서 접기"}
                            onClick={() => bigFold.toggle(big)}
                          >
                            <span className="unit-bigcaret">{shut ? "▸" : "▾"}</span> {big}
                            {/* 접혀 있어도 무엇을 펼지 알 수 있게 — 판의 진도율과 같은 셈 */}
                            <span className="hint" style={{ fontWeight: 600, marginLeft: 6 }}>
                              {st.done}/{st.total}
                              {st.doing > 0 ? ` · ◐${st.doing}` : ""}
                            </span>
                          </button>
                          {!pastView && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: "2px 8px", whiteSpace: "nowrap" }}
                              title="이 대단원 전체가 체크된 팝업이 열려요 — 완료·하는 중·안 함으로 한 번에"
                              onClick={() => openPick(bigIds)}
                            >
                              통째로 고르기
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {!bigFold.isOpen(big) ? null : (
                    <div className="hwgroup" style={{ flexWrap: "wrap" }}>
                    {/* 중단원 묶음 토글은 팝오버 안에 있다 — 판에서는 라벨만 */}
                    {mid ? (
                      <span className="tag tag-sky hwcat" style={{ width: "auto" }}>{mid}</span>
                    ) : null}
                    <div className="row" style={{ gap: 4, flex: "1 1 300px", minWidth: 0 }}>
                      {list.map((u) => {
                        const done = u.status === "done";
                        const doing = u.status === "doing";
                        return (
                          <span key={u.id} className="unitchip-wrap">
                            <button
                              className={`hwchip ${
                                done ? "hw-done" : doing ? "hw-weak" : ""
                              } ${isSkipped(u) ? "hw-skipoff" : ""}`}
                              onClick={() => {
                                // 지난 회독도 단건 체크는 고친다 (2026-08-23) —
                                // mark 안에서 viewRound 로 저장된다
                                if (pastView) return mark(u.id, NEXT[u.status || ""]);
                                if (hwMode && onHomework) return onHomework(u);
                                if (uptoMode) return markUpto(u.id);
                                return mark(u.id, NEXT[u.status || ""]);
                              }}
                              title={
                                [
                                  pastView && `${viewRound}회독 기록 — 누르면 이 회독에 고쳐져요`,
                                  isSkipped(u) && "⛔ 빠짐 — 배정·진도율 제외 (기록은 남음)",
                                  u.activity, u.pages, u.amount && `분량 ${u.amount}`, u.note && `메모: ${u.note}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || undefined
                              }
                            >
                              {done && <b>○</b>}
                              {doing && <b>◐</b>}
                              {hwPicked?.has(u.id) && <b title="다음 숙제로 담김">📝</b>} {u.name}
                              {u.activity ? <span className="hint"> · {u.activity}</span> : null}
                              {u.amount ? <span className="hint"> {u.amount}</span> : null}
                              {/* 몇 페이지인지 (원장님 2026-08-23 「교재 진도에 몇
                                  페이지인지가 없어서 불편」) — 단원에 적힌 시작~끝 */}
                              {u.page_start ? (
                                <span className="hint">
                                  {" "}p{u.page_start}{u.page_end && u.page_end !== u.page_start ? `~${u.page_end}` : ""}
                                </span>
                              ) : null}
                            </button>
                            {/**
                              * 단원 메모 — 「이 단원 어려워함」 「17번만 다시」.
                              * 수업 기록의 진도 메모와 다르다 — 그건 그날 이야기고,
                              * 이건 **이 단원**에 붙어 회독이 넘어가도 따라온다.
                              * 메모가 있으면 ✎ 가 색으로 차 있다.
                              */}
                            {/* 지난 회독 보기에선 메모 단추도 감춘다 — 적으면
                                지금 회독에 붙어서, 보는 회독과 어긋난다 */}
                            {!pastView && (
                              <button
                                className={`unitnote-btn ${u.note ? "has" : ""}`}
                                title={u.note ? `메모: ${u.note} (누르면 고치기)` : "이 단원에 메모"}
                                onClick={() => {
                                  setNoteFor(noteFor === u.id ? null : u.id);
                                  setNoteDraft(u.note || "");
                                }}
                              >
                                ✎
                              </button>
                            )}
                            {noteFor === u.id && (
                              <span className="row" style={{ gap: 4, width: "100%", marginTop: 2 }}>
                                <input
                                  className="input input-sm"
                                  style={{ flex: 1, minWidth: 140 }}
                                  autoFocus
                                  placeholder="예: 17번만 다시 · 어려워함"
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && saveNote(u.id)}
                                />
                                <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => saveNote(u.id)}>
                                  저장
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setNoteFor(null)}>
                                  취소
                                </button>
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    </div>
                    )}
                  </Fragment>
                ))}
              </div>
              {/* 단원 골라 찍기 팝오버 — 순서 밖 사건과 같은 .sheetpop 자리.
                  판 위에 덧그리는 것이라 판의 입력 중 상태는 그대로 산다.
                  key=seq — 대단원 막대를 연달아 눌러도 새 체크로 다시 연다 */}
              {pick && !pastView && (
                <ProgressPickModal
                  key={pick.seq}
                  title={`${book.name} · 단원 골라 찍기`}
                  units={leaves}
                  preset={pick.ids}
                  isSkipped={isSkipped}
                  pending={pending}
                  onApply={markMany}
                  onClose={() => setPick(null)}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// 단원 묶기(groupByParent·annotateBigs)는 components/unitGroups 로 갔다 —
// 골라 찍기 팝오버(ProgressPickModal)와 같은 위계를 한 벌로 쓰기 위해
