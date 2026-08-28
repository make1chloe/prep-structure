"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ProgressPickModal from "@/components/ProgressPickModal";
import BookPickPanel from "@/components/BookPickPanel";
import RoutinePick from "@/app/students/RoutinePick";
import { useSheet } from "@/components/useSheet";
import { listStudentUnits, setUnitProgress, nextBookChoices, addStudentBookDated } from "@/app/progress/actions";
import { addClassHoliday, keepClassOn } from "@/app/schedule/actions";
import { todaySeoul } from "@/lib/day";

/**
 * **대시보드 칩 하나를 그 자리에서 끝내는 판** — 눌렀을 때만 내려온다
 * (DashFix 가 next/dynamic 으로 부른다).
 *
 * 여기에는 **새 판단이 하나도 없다.** 전부 이미 있는 부품과 서버 액션이다 —
 *   진도    ProgressPickModal + listStudentUnits + setUnitProgress
 *   루틴    RoutinePick (제 데이터는 스스로 불러온다)
 *   다음교재 BookPickPanel + nextBookChoices + addStudentBookDated
 *   휴강    addClassHoliday · keepClassOn
 * 이 파일이 하는 일은 「어느 칩이 어느 부품을 여는가」 뿐이다.
 *
 * 저장하면 router.refresh() — 대시보드 숫자가 그 자리에서 줄어야 한다.
 */
export default function DashFixBody({ kind, item, onClose }) {
  useSheet();
  if (kind === "progress") return <FixProgress item={item} onClose={onClose} />;
  if (kind === "routine") return <FixRoutine item={item} onClose={onClose} />;
  if (kind === "nextbook") return <FixNextBook item={item} onClose={onClose} />;
  if (kind === "holiday") return <FixHoliday item={item} onClose={onClose} />;
  return null;
}

/** 판 머리 — 「누구의 무엇인가」 를 늘 같은 자리에 */
function Head({ title, onClose }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <b style={{ fontSize: 15 }}>{title}</b>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
    </div>
  );
}

/**
 * ① **진도 시작 안 한 교재** — 기준 사례.
 * 「박윤찬 그래머인사이드가 진도 시작 안 했으면, 박윤찬 그래머인사이드
 *  진도가 새로 떠야지」 (원장님 2026-08-28). 그래서 그 학생 그 교재의
 * 단원 목록이 그대로 뜬다. ProgressPickModal 이 이미 .sheetpop 판이라
 * 껍데기를 덧씌우지 않는다.
 */
function FixProgress({ item, onClose }) {
  const router = useRouter();
  const [units, setUnits] = useState(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    listStudentUnits(item.studentId, item.textbookId).then((r) => {
      if (live) setUnits((r.units || []).filter((u) => u.leaf));
    });
    return () => { live = false; };
  }, [item.studentId, item.textbookId]);

  if (units === null) {
    return (
      <div className="dashfix-wait card" role="status">
        <span className="hint">{item.name} · {item.book} 단원 불러오는 중…</span>
      </div>
    );
  }

  return (
    <ProgressPickModal
      title={`${item.name} · ${item.book} 진도`}
      units={units}
      pending={pending}
      onApply={(ids, status) =>
        startTransition(async () => {
          // 화면 먼저 (원칙 6-3) — 저장은 뒤따른다
          setUnits((list) => list.map((u) => (ids.includes(u.id) ? { ...u, status: status || "" } : u)));
          const res = await setUnitProgress(item.studentId, ids, status);
          if (res?.error) { alert(res.error); return; }
          router.refresh();   // 대시보드에서 이 줄이 빠져야 한다
        })
      }
      onClose={onClose}
    />
  );
}

/** ② **루틴 안 정한 교재** — 그 학생 그 교재의 루틴을 그 자리에서 */
function FixRoutine({ item, onClose }) {
  const router = useRouter();
  return (
    <div className="sheetpop card" role="dialog" aria-label="루틴 정하기">
      <Head title={`${item.name} · ${item.book} 루틴`} onClose={onClose} />
      <RoutinePick
        studentId={item.studentId}
        book={{ id: item.textbookId, name: item.book }}
        onStamp={() => { router.refresh(); onClose(); }}
      />
    </div>
  );
}

/**
 * ③ **곧 끝나는 교재 → 다음 교재 배정** (원장님 2026-08-28 —
 * 「곧 끝나는 교재가 있으면 다음 교재 배정이 필요한 상황.
 *  그걸 위한 장치가 연결되어야 함」).
 *
 * 고르는 판은 재원생·신규 상담과 **같은 한 벌**(BookPickPanel)이다.
 * 넣는 규칙도 기존 addStudentBookDated 그대로 — 이미 있는 교재는 그쪽이 막는다.
 */
function FixNextBook({ item, onClose }) {
  const router = useRouter();
  const [books, setBooks] = useState(null);
  const [pick, setPick] = useState("");
  const [from, setFrom] = useState(todaySeoul());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    nextBookChoices(item.studentId).then((r) => { if (live) setBooks(r.books || []); });
    return () => { live = false; };
  }, [item.studentId]);

  return (
    <div className="sheetpop card" role="dialog" aria-label="다음 교재 배정">
      <Head title={`${item.name} · 다음 교재`} onClose={onClose} />
      <p className="hint" style={{ margin: "0 0 6px" }}>
        「{item.book}」 이(가) {item.left > 0 ? `${item.left}단원 남았어요` : "다 끝났어요"} — 이어서 쓸 교재를 골라주세요.
      </p>
      {books === null ? (
        <p className="hint" style={{ margin: 0 }}>교재 목록 불러오는 중…</p>
      ) : books.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>줄 수 있는 교재가 없어요 — 교재 › 교재·단원 에서 먼저 만들어주세요.</p>
      ) : (
        <BookPickPanel
          books={books}
          picked={new Set(pick ? [pick] : [])}
          disabled={pending}
          onToggle={(id) => setPick((cur) => (cur === id ? "" : id))}
        />
      )}
      <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center", justifyContent: "flex-end" }}>
        <input
          className="input input-sm" type="date" style={{ width: 145 }}
          value={from} onChange={(e) => setFrom(e.target.value)}
          title="언제부터 쓰나 — 오늘이면 그대로"
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={pending || !pick}
          onClick={() =>
            startTransition(async () => {
              const res = await addStudentBookDated(item.studentId, pick, from, null);
              if (res?.error) { alert(res.error); return; }
              router.refresh();
              onClose();
            })
          }
        >
          {pending ? "넣는 중…" : "이 교재로 배정"}
        </button>
      </div>
    </div>
  );
}

/**
 * ④ **공휴일 — 쉴지 정해주세요.** 「휴강으로 지정」 하러 스케줄 화면까지
 * 가서 그 날을 다시 찾을 일이 아니다. 두 갈래가 여기 다 있다 —
 * 쉰다(addClassHoliday) · 수업한다(keepClassOn). 판단은 그 두 액션 것.
 */
function FixHoliday({ item, onClose }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState("");

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { setSaid(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="sheetpop card" role="dialog" aria-label="공휴일 결정">
      <Head title={`${item.name} — 쉴까요?`} onClose={onClose} />
      {item.title && <p className="hint" style={{ margin: "0 0 6px" }}>{item.title}</p>}
      {said && <p className="hint" style={{ margin: "0 0 6px", color: "var(--red)" }}>{said}</p>}
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button
          className="btn btn-primary btn-sm" disabled={pending}
          onClick={() => run(() => addClassHoliday(item.date, item.raw || item.name, null))}
        >
          쉽니다 — 전체 휴강으로
        </button>
        <button
          className="btn btn-sm" disabled={pending}
          onClick={() => run(() => keepClassOn(item.date, item.raw || item.name))}
        >
          그날도 수업합니다
        </button>
      </div>
      <p className="hint" style={{ margin: "8px 0 0", fontSize: 12.5 }}>
        휴강으로 잡으면 그 달 회차와 수강료가 같이 줄고, 안내를 다시 보내야 함으로 표시됩니다.
      </p>
    </div>
  );
}
