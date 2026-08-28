"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BookProgress from "@/components/BookProgress";
import StudentBooksProgress from "@/app/progress/StudentBooksProgress";
import RoutinePick from "@/app/students/RoutinePick";
import CheckBoard from "@/app/check/CheckBoard";
import AheadBoard from "@/app/check/AheadBoard";
import { useSheet } from "@/components/useSheet";
import { studentBookPanel } from "@/app/progress/actions";
import { addClassHoliday, keepClassOn, listClassChoices } from "@/app/schedule/actions";
import { checkRowFor, aheadOneStudent } from "@/app/check/oneActions";
import { ccAlignPreview, ccAlignApply } from "@/app/progress/ccAlignActions";

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
 *   숙제검사   app/check/CheckBoard               (원판 그대로, 그 아이 한 줄)
 *   숙제배정   app/check/AheadBoard               (원판 그대로, 그 아이만)
 *   진도어긋남 플래너에 맞추기 — 미리 보고 원장님이 누를 때만 바뀐다
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
  if (kind === "check") return <FixCheck item={item} onClose={onClose} />;
  if (kind === "ccalign") return <FixCcAlign item={item} onClose={onClose} />;
  if (kind === "assign") return <FixAssign item={item} onClose={onClose} />;
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

/**
 * ⑤ **검사 안 한 숙제** (원장님 2026-08-28 — 「첫 번째 꺼 왜 모달 안 붙어?」).
 *
 * 앞서 이 칩만 화면 이동으로 뒀다 — 「판이 커서 팝오버가 안 맞는다」는
 * 판정이었는데 원장님이 받지 않으셨다. **원판(CheckBoard)을 그대로**
 * 그 아이 한 줄만 넣어 띄운다. ○△✕ · 검사 메모 · 낸 것(사진·녹음·
 * 체크리스트) 열어보기 · 안 낸 것 미제출로 · 직접검사까지 원판과 같다.
 *
 * **다음 배정은 여기 없다 — 원판에도 없다.** 검사 화면(/check)에서도
 * 다음 배정은 CheckBoard 가 아니라 옆의 「미리 내기」(AheadBoard)가 맡는
 * 다른 판이다. 한 아이의 다음 숙제까지 한 자리에서 하시려면 오늘 수업
 * 판이라, 그 길만 한 줄로 둔다.
 */
function FixCheck({ item, onClose }) {
  const router = useRouter();
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    checkRowFor(item.studentId, item.date).then((r) => { if (live) setData(r); });
    return () => { live = false; };
  }, [item.studentId, item.date]);

  return (
    <Pop
      title={`${item.name} · ${item.date} 숙제 검사`}
      sub={`${item.days}일째 검사가 안 됐어요 — 아이 화면에는 아직 이 숙제가 떠 있습니다.`}
      /**
       * 닫을 때 한 번 새로 그린다 — 검사 저장(checkOne)은 /check·/today·/me
       * 만 되살리고 대시보드는 안 건드린다. 그래서 닫아도 「19명」이 그대로
       * 남아 있으면 원장님은 저장이 안 된 줄 아신다.
       */
      onClose={() => { router.refresh(); onClose(); }}
      wide
    >
      {data === null ? (
        <Waiting what="검사할 것" />
      ) : !data.row ? (
        <p className="hint" style={{ margin: 0 }}>이 학생을 찾지 못했어요 — 대시보드를 새로고침해 주세요.</p>
      ) : (
        <CheckBoard date={item.date} rows={[data.row]} items={data.items} classes={[]} />
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <Link className="btn btn-ghost btn-sm" href={`/today?d=${item.date}&open=${item.studentId}`}>
          다음 숙제까지 배정하기 (오늘 수업 판) →
        </Link>
      </div>
    </Pop>
  );
}

/**
 * ⑥ **클래스카드 진도 어긋남 → 플래너에 맞추기**
 * (원장님 2026-08-28: 「보고 맞추게 할 때 버튼 누르기」).
 *
 * **자동으로 맞추지 않는다.** 무엇이 바뀔지 이름까지 먼저 보여주고,
 * 원장님이 누른 그때만 바뀐다. 셈은 lib/ccAlign 한 벌 — 보여준 것과
 * 실제로 바뀌는 것이 같은 함수의 답이다.
 *
 * 갈래가 둘인 까닭: **완료 해제는 원장님이 찍어둔 기록을 지우는 일**이다
 * (앱이 플래너보다 앞선 경우 — 교재로 더 나갔는데 플래너가 안 따라온
 * 것일 수도 있다). 어느 쪽인지는 원장님만 아시니 고르시게 한다.
 */
function FixCcAlign({ item, onClose }) {
  const router = useRouter();
  const [pre, setPre] = useState(null);
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    let live = true;
    ccAlignPreview(item.studentId).then((r) => { if (live) setPre(r); });
    return () => { live = false; };
  }, [item.studentId]);

  function run(mode) {
    if (mode === "both") {
      const n = pre.toClear.length;
      if (!confirm(
        `완료 표시를 ${n}개 지웁니다.\n\n` +
        pre.toClear.map((u) => `· ${u.name}`).join("\n") +
        `\n\n앱이 플래너보다 앞서 있는 경우예요 — 교재로 더 나가신 것이라면 지우면 안 됩니다.\n계속할까요?`
      )) return;
    }
    startTransition(async () => {
      const res = await ccAlignApply(item.studentId, mode);
      if (res?.error) { setSaid(res.error); return; }
      setDone(res);
      router.refresh();
    });
  }

  return (
    <Pop title={`${item.name} · 플래너에 맞추기`} onClose={onClose} wide>
      {pre === null ? (
        <Waiting what="플래너와 진도" />
      ) : pre.error ? (
        <p className="hint" style={{ margin: 0 }}>{pre.error}</p>
      ) : done ? (
        <div className="stack" style={{ gap: 6 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <b>맞췄어요.</b> 완료로 {done.marked.length}개
            {done.cleared.length > 0 ? ` · 해제 ${done.cleared.length}개` : ""}
          </p>
          {done.marked.length > 0 && (
            <p className="hint" style={{ margin: 0 }}>완료: {done.marked.join(" · ")}</p>
          )}
          {done.cleared.length > 0 && (
            <p className="hint" style={{ margin: 0 }}>해제: {done.cleared.join(" · ")}</p>
          )}
          <p className="hint" style={{ margin: 0, fontSize: 12.5 }}>
            잘못 눌렀다면 진도 화면(학생 › 성장 또는 진도)에서 그 단원을 다시 찍으면 됩니다.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <p className="hint" style={{ margin: 0 }}>
            플래너는 <b>Day {pre.ccMax}</b>, 앱 진도는 <b>Day {pre.appMax}</b> 입니다.
            아래대로 바꿉니다 — <b>누르기 전에는 아무것도 안 바뀝니다.</b>
          </p>

          <div className="stack" style={{ gap: 2 }}>
            <span className="hint" style={{ fontWeight: 700 }}>
              완료(○)로 바꿀 단원 {pre.toDone.length}개
            </span>
            {pre.toDone.length === 0 ? (
              <span className="hint">없음</span>
            ) : (
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                {pre.toDone.map((u) => (
                  <span className="tag tag-mint" key={u.id} title={u.book}>{u.name}</span>
                ))}
              </div>
            )}
          </div>

          <div className="stack" style={{ gap: 2 }}>
            <span className="hint" style={{ fontWeight: 700, color: pre.toClear.length ? "var(--red)" : undefined }}>
              완료를 해제할 단원 {pre.toClear.length}개
            </span>
            {pre.toClear.length === 0 ? (
              <span className="hint">없음</span>
            ) : (
              <>
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  {pre.toClear.map((u) => (
                    <span className="tag tag-red" key={u.id} title={u.book}>{u.name}</span>
                  ))}
                </div>
                <p className="hint" style={{ margin: "2px 0 0", color: "var(--red)", fontSize: 12.5 }}>
                  ⚠️ 이건 <b>이미 찍어두신 완료 기록을 지우는 일</b>입니다. 앱이 플래너보다
                  앞서 있다는 뜻이라, <b>교재로 더 나가신 것이라면 지우면 안 됩니다</b> —
                  그때는 아래 「완료만 채우기」를 쓰세요.
                </p>
              </>
            )}
          </div>

          {pre.skipped.length > 0 && (
            <p className="hint" style={{ margin: 0, fontSize: 12.5 }}>
              이름에 Day 숫자가 없어 건드리지 않는 단원 {pre.skipped.length}개:{" "}
              {pre.skipped.slice(0, 6).join(" · ")}{pre.skipped.length > 6 ? " …" : ""}
            </p>
          )}
          {said && <p className="hint" style={{ margin: 0, color: "var(--red)" }}>{said}</p>}

          <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || pre.toDone.length === 0}
              title="플래너까지 끝낸 것으로 찍습니다 — 지우지 않습니다"
              onClick={() => run("fill")}
            >
              {pending ? "맞추는 중…" : `완료만 채우기 (${pre.toDone.length})`}
            </button>
            <button
              className="btn btn-sm"
              disabled={pending || (pre.toDone.length === 0 && pre.toClear.length === 0)}
              style={pre.toClear.length ? { borderColor: "var(--red)", color: "var(--red)" } : undefined}
              title="플래너와 정확히 같게 맞춥니다 — 앞서간 완료는 해제됩니다"
              onClick={() => run("both")}
            >
              플래너와 똑같이 맞추기{pre.toClear.length ? ` (해제 ${pre.toClear.length})` : ""}
            </button>
          </div>
        </div>
      )}
    </Pop>
  );
}

/**
 * ⑦ **다음 숙제가 안 나간 아이 → 그 자리에서 배정**
 * (원장님 2026-08-28 — 「숙제검사 안 한 아이와 숙제배정 안 된 아이 같이
 *  보여줘」 그리고 곧바로 「**최초 숙제배정 어디서 해야 해?**」).
 *
 * 뒷말이 진짜 요구다 — 배정하는 자리를 못 찾고 계셨다. 알리기만 하는
 * 카드였으면 문제가 그대로 남는다.
 *
 * ── 왜 「미리 내기」(AheadBoard)를 마운트하나 ─────────────
 *
 * 배정하는 원판은 둘이다. 오늘 수업 학생 판의 「다음 숙제」와 검사 화면의
 * 「미리 내기」. **미리 내기 쪽을 쓴다** —
 *   · 자기 완결적이다 — {classes, students, items, textbooks} 넷이면 서고,
 *     단원 목록은 스스로 받아온다. 오늘 수업 판은 그 거대한 row 하나를
 *     오늘 수업 화면 본문이 인라인으로 만들고 있어 떼어 올 수가 없다.
 *   · **날짜를 고를 수 있다.** 이 카드는 「다음 수업에 나갈 숙제」를 넣는
 *     일이라 그 칸이 꼭 필요하다.
 *   · 항목 · 교재 · 단원 범위 · 전달사항까지 원판 그대로다.
 *
 * 못 담는 것: **오늘 낸 숙제의 ○△✕ 검사**. 그건 배정이 아니라 검사라
 * 옆 카드(검사 안 한 숙제)가 맡는다 — 원판에서도 다른 판이다.
 */
function FixAssign({ item, onClose }) {
  const router = useRouter();
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    aheadOneStudent(item.studentId).then((r) => { if (live) setData(r); });
    return () => { live = false; };
  }, [item.studentId]);

  return (
    <Pop
      title={`${item.name} · 다음 숙제 배정`}
      sub={`${item.date} 판에 배정된 숙제가 하나도 없어요 — 아이 화면에 나갈 것이 없습니다.`}
      /* 배정(assignAhead)은 /check·/today·/me 만 되살린다 — 닫을 때 대시보드를
         다시 그려야 「배정 안 됨」 숫자가 줄어든다 (checkOne 전례) */
      onClose={() => { router.refresh(); onClose(); }}
      wide
    >
      {data === null ? (
        <Waiting what="배정 재료" />
      ) : data.students.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>이 학생을 찾지 못했어요 — 대시보드를 새로고침해 주세요.</p>
      ) : (
        <AheadBoard
          classes={[]}
          students={data.students}
          items={data.items}
          textbooks={data.textbooks}
          defaultOpen
        />
      )}
    </Pop>
  );
}
