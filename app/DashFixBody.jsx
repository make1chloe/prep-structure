"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BookProgress from "@/components/BookProgress";
import StudentBooksProgress from "@/app/progress/StudentBooksProgress";
import RoutinePick from "@/app/students/RoutinePick";
import { useSheet } from "@/components/useSheet";
import { studentBookPanel } from "@/app/progress/actions";
import { addClassHoliday, keepClassOn, listClassChoices } from "@/app/schedule/actions";

/**
 * **대시보드 칩 하나를 그 자리에서 끝내는 판** — 눌렀을 때만 내려온다
 * (DashFix 가 next/dynamic 으로 부른다).
 *
 * ── 축약판을 그리지 않는다 (원장님 2026-08-28) ─────────────
 * 「원판에 비해 너무 기능이 제한적임. **그대로 재현할 것.**」
 *
 * 처음 판은 원판의 **일부만** 담았다 — 진도는 단원 찍기만(회독·현재 페이지·
 * 멈춤·건너뛸 활동·메모·전체완료·여기까지가 없었다), 다음 교재는 고르기만
 * (끝냄 정리·시작일 소급·권별 진도가 없었다). 그래서 원장님은 여기서
 * 시작해 결국 원판으로 다시 가셔야 했다.
 *
 * 이제 **원판 부품을 그대로 마운트한다.** 축약판을 따로 그리면 두 벌이
 * 되어 언젠가 갈라진다 — 그게 이 지적의 뿌리다 (원칙 1·2).
 *
 *   진도      components/BookProgress            (원판 그대로, 그 교재만)
 *   다음교재   app/progress/StudentBooksProgress  (원판 그대로 통째)
 *   루틴      app/students/RoutinePick           (원판 그대로 — 원래도 이것)
 *   휴강      스케줄 화면의 「그냥 수업함 / 쉬기」 두 갈래를 같은 모양으로
 *
 * 재료는 진도 화면이 전교생에게 주는 것과 **같은 모양**을 한 아이만
 * 받아온다 (studentBookPanel → lib/bookPanel 한 벌).
 */
export default function DashFixBody({ kind, item, onClose }) {
  useSheet();
  if (kind === "progress") return <FixProgress item={item} onClose={onClose} />;
  if (kind === "routine") return <FixRoutine item={item} onClose={onClose} />;
  if (kind === "nextbook") return <FixNextBook item={item} onClose={onClose} />;
  if (kind === "holiday") return <FixHoliday item={item} onClose={onClose} />;
  return null;
}

/**
 * 판 껍데기 — 자리 이름은 `.dashfix-pop`.
 *
 * **`.sheetpop` 이면 안 된다.** 안에 마운트한 원판(BookProgress)이 「골라서」
 * 를 누르면 제 팝오버(.sheetpop)를 띄우는데, 껍데기까지 같은 이름·같은
 * z 면 어느 것이 위인지가 DOM 순서 운에 달린다. 껍데기는 한 칸 아래(58)에
 * 넓게 서고, 그 위에 원판의 팝오버(59)가 뜬다.
 */
function Pop({ title, sub, onClose, wide = false, children }) {
  return (
    <div className={`dashfix-pop card${wide ? " dashfix-wide" : ""}`} role="dialog" aria-label={title}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <b style={{ fontSize: 15 }}>{title}</b>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
      </div>
      {sub && <p className="hint" style={{ margin: "0 0 6px" }}>{sub}</p>}
      {children}
    </div>
  );
}

/** 재료를 받아오는 동안 — 판 자리를 그대로 지킨다 */
function Waiting({ what }) {
  return <p className="hint" style={{ margin: 0 }}>{what} 불러오는 중…</p>;
}

/** 한 학생의 교재 재료 한 벌 (진도 · 다음 교재가 같이 쓴다) */
function useBookPanel(studentId) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    studentBookPanel(studentId).then((r) => { if (live) setData(r); });
    return () => { live = false; };
  }, [studentId]);
  return data;
}

/**
 * ① **진도 시작 안 한 교재** — 기준 사례.
 * 「박윤찬 그래머인사이드가 진도 시작 안 했으면, 박윤찬 그래머인사이드
 *  진도가 새로 떠야지」 (원장님 2026-08-28).
 *
 * **원판(BookProgress)을 그대로** 편 채로 띄운다 — 그러므로 단원 찍기뿐
 * 아니라 회독 넘기기·지난 회독 보기·현재 페이지·교재/숙제 멈춤·건너뛸
 * 활동·단원 메모·전체 완료/해제·여기까지·골라서·단원 찾기·이 교재 끝냄이
 * 전부 원판과 같이 있다.
 */
function FixProgress({ item, onClose }) {
  const data = useBookPanel(item.studentId);
  const book = data?.books?.find((b) => b.id === item.textbookId) || null;

  return (
    <Pop
      title={`${item.name} · ${item.book} 진도`}
      onClose={onClose}
      wide
    >
      {data === null ? (
        <Waiting what="진도" />
      ) : book ? (
        <BookProgress studentId={item.studentId} book={book} openFirst />
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          이 교재가 지금은 이 학생에게 배정돼 있지 않아요 — 대시보드를 새로고침해 주세요.
        </p>
      )}
    </Pop>
  );
}

/**
 * ② **루틴 안 정한 교재** — RoutinePick 은 처음부터 원판 그 부품이다
 * (재원생 화면이 쓰는 것과 같은 조각, 자기 데이터도 스스로 받아온다).
 *
 * **여기 없는 것 하나**: 영역 차례·교재 차례(RoutineAssign 의 setAreaOrder·
 * setBookSort). 그건 「이 교재의 루틴」이 아니라 **그 학생의 교재 전체를
 * 어떤 차례로 세울까**라 이 카드(교재 한 권)와 대상이 다르다 — 한 권짜리
 * 팝오버에서 전체 차례를 흔들면 다른 교재의 차례가 말없이 바뀐다.
 * 그래서 그것만 원판으로 나가는 길을 한 줄 둔다.
 */
function FixRoutine({ item, onClose }) {
  const router = useRouter();
  return (
    <Pop title={`${item.name} · ${item.book} 루틴`} onClose={onClose}>
      <RoutinePick
        studentId={item.studentId}
        book={{ id: item.textbookId, name: item.book }}
        onStamp={() => { router.refresh(); onClose(); }}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <Link className="btn btn-ghost btn-sm" href={`/students?s=${item.studentId}`}>
          교재 차례 · 영역 차례까지 고치기 →
        </Link>
      </div>
    </Pop>
  );
}

/**
 * ③ **곧 끝나는 교재 → 다음 교재 배정** (원장님 2026-08-28 —
 * 「곧 끝나는 교재가 있으면 다음 교재 배정이 필요한 상황.
 *  그걸 위한 장치가 연결되어야 함」).
 *
 * **원판(StudentBooksProgress)을 통째로** 띄운다 — ＋교재 추가(검색 ·
 * 영역 묶음 · 시작일 · 이미 준 책 제외)뿐 아니라 🧹 교재 정리(여러 권
 * 한 번에 끝냄)와 권별 진도 판까지 원판과 같다. 끝나가는 책을 끝냄
 * 처리하고 새 책을 넣는 일이 **한 자리에서** 끝나야 하기 때문이다.
 */
function FixNextBook({ item, onClose }) {
  const data = useBookPanel(item.studentId);
  return (
    <Pop
      title={`${item.name} · 교재`}
      sub={`「${item.book}」 이(가) ${item.left > 0 ? `${item.left}단원 남았어요` : "다 끝났어요"} — 이어서 쓸 교재를 넣어주세요.`}
      onClose={onClose}
      wide
    >
      {data === null ? (
        <Waiting what="교재" />
      ) : (
        <StudentBooksProgress
          studentId={item.studentId}
          books={data.books || []}
          allBooks={data.allBooks || []}
        />
      )}
    </Pop>
  );
}

/**
 * ④ **공휴일 — 쉴지 정해주세요.**
 *
 * 스케줄 화면의 그 자리와 **같은 두 갈래**다 — 「그냥 수업함」(keepClassOn:
 * 회차·수강료 그대로, 일정에 기록만) 과 「쉬기」(addClassHoliday). 쉬기에는
 * **전체 휴강과 반 하나만 쉬기**가 다 있다 (원판에 있는 길이라 여기에도
 * 있어야 한다 — 처음 판에는 전체 휴강뿐이었다).
 *
 * 반 목록은 열 때 받아온다 — 첫 로드에 실을 값이 아니다.
 */
function FixHoliday({ item, onClose }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState("");
  const [classes, setClasses] = useState(null);

  useEffect(() => {
    let live = true;
    listClassChoices().then((r) => { if (live) setClasses(r.classes || []); });
    return () => { live = false; };
  }, []);

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { setSaid(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  const name = item.raw || item.name;

  return (
    <Pop title={`${item.name} — 쉴까요?`} sub={item.title} onClose={onClose}>
      {said && <p className="hint" style={{ margin: "0 0 6px", color: "var(--red)" }}>{said}</p>}
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn btn-sm" disabled={pending}
          title="회차·수강료는 그대로 두고, 일정에 '정상 수업' 으로 기록만 남깁니다"
          onClick={() => run(() => keepClassOn(item.date, name))}
        >
          그냥 수업함
        </button>
        <select
          className="input input-sm"
          style={{ width: 170 }}
          defaultValue=""
          disabled={pending || classes === null}
          onChange={(ev) => {
            const v = ev.target.value;
            ev.target.value = "";
            if (v === "all") run(() => addClassHoliday(item.date, name, null));
            else if (v) run(() => addClassHoliday(item.date, name, v));
          }}
        >
          <option value="">{classes === null ? "반 불러오는 중…" : "쉬기 (휴강 지정)…"}</option>
          <option value="all">전체 휴강</option>
          {(classes || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}만</option>
          ))}
        </select>
      </div>
      <p className="hint" style={{ margin: "8px 0 0", fontSize: 12.5 }}>
        휴강으로 잡으면 그 달 회차와 수강료가 같이 줄고, 안내를 다시 보내야 함으로 표시됩니다.
      </p>
      <div className="row" style={{ marginTop: 8 }}>
        <Link className="btn btn-ghost btn-sm" href="/schedule">
          잡아둔 휴강 보기 · 취소하기 →
        </Link>
      </div>
    </Pop>
  );
}
