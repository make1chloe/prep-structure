"use client";
/**
 * 아이가 여는 화면 — **그리기만 한다.**
 *
 * ⚠️ 판단은 여기 없다. 셈은 `./derive.js`, 쓰기는 `./actions.js`(서버 동작),
 *    마감 가리기 글은 `lib/close.js` 가 준 것을 그대로 받는다.
 *    여기서 새 규칙을 하나라도 만들면 그날부터 규칙이 두 벌이다.
 *
 * ⚠️ 안 쓰는 것 (대전제 목록) — `position:fixed` 스크롤 잠금 · `history.pushState` ·
 *    `createPortal` · `alert`/`confirm` · **탭**. 접기로 줄이되 다시 조회하지 않는다.
 *
 * ⚠️ **누른 그 단추만 바뀐다.** ○ 을 누르면 그 자리에서 바로 바뀌고 서버로는 뒤에서 보낸다.
 *    실패하면 **그 단추만** 되돌리고 알린다.
 *    ⚠️ 단 **되돌릴 수 없는 것은 서버 답을 기다린다** — 숙제 ○ 이 그렇다
 *    (접근 규칙이 `status='done'` 만 허용해서 아이 손으로는 못 내린다).
 *
 * ⚠️ **타이머·오답노트를 안 만든다.** 아이가 스스로 눌러야 쌓이는 것이라 시켜서 켜면
 *    숫자만 늘고 뜻이 없다. 그리고 클로이영어의 오답노트는 종이에 이유까지 쓰는 것이라
 *    앱에 또 두면 이중 부담이다 (계획 「아이 화면에서 지킬 것」).
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import LogoutButton from "../logout-button";
import { DOW_NAME, monthRange, countDates } from "@/lib/session";
import { css } from "./style";
import { 다했어요, 진도찍기, 이의달기, 카드차례저장 } from "./actions";
import {
  차례대로, 끝난줄, 센다, 카드어떻게, 카드들, 순서입히기, 한칸옮기기, 끌어옮기기,
  대단원묶기, 아이가덮을수있나, 확인기다리는중, 누가찍었나, 표시들,
  언제끝나나, 다닌날수, 달력칸, 달옮기기, 요일, 칸이름, 아이가_찍는_칸, 학원_칸,
} from "./derive";

const 키 = (unitId, round) => `${unitId}#${round}`;

export default function Screen(props) {
  const {
    오늘, 학생, 오늘판, 오늘줄 = [], 빈카드숨김,
    교재들 = [], 진도줄 = [], 이의들 = [], 진도체크열림, 달력, 글, 왜들 = [],
  } = props;

  const [순서, set순서] = useState(() => 순서입히기(props.카드순서, 카드들));
  const [덮개숙제, set덮개숙제] = useState({});   // itemId → 'done'
  const [덮개진도, set덮개진도] = useState({});   // unit#round → 진도 줄
  const [알림, set알림] = useState(null);
  const [끄는것, set끄는것] = useState(null);
  const [저장중, 시작] = useTransition();

  const 마감됐나 = !!오늘판?.closed_at;

  /** 오늘이 수업 있는 날인가 — ⚠️ 없으면 「아직 정리 중」이라고 하면 안 된다. 없는 날이다 */
  const 오늘수업날 = useMemo(() => countDates({
    schedules: 달력?.수업이력 ?? [], holidays: [], first: 오늘, last: 오늘, today: 오늘,
  }).dates.length > 0, [달력, 오늘]);

  /* ── 카드 차례 ─────────────────────────────────────────────────
   * ⚠️ 끌기 **와** ▲▼ 를 같이 둔다 — 폰에서 끌기는 스크롤과 부딪혀 자주 실패한다.
   * ⚠️ 사람마다 따로 저장되므로 안내 글에서 「세 번째 칸을 보세요」를 못 쓴다. */
  const 차례바꾸기 = (새) => {
    const 앞 = 순서;
    set순서(새);                                    // 그 자리에서 바로 바뀐다
    시작(async () => {
      const r = await 카드차례저장(새);
      if (!r?.ok) { set순서(앞); set알림(r?.why ?? "차례를 저장하지 못했습니다."); }
    });
  };

  /* ── 오늘 할 것 ───────────────────────────────────────────────── */
  const 입힌줄 = 오늘줄.map((r) => (덮개숙제[r.id] ? { ...r, status: 덮개숙제[r.id] } : r));
  const 학원것 = 차례대로(입힌줄.filter((r) => r.slot === 학원_칸));
  // ⚠️ 아이가 ○ 을 누를 수 있는 칸은 `아이가_찍는_칸` **한 벌**이 정한다(접근 규칙과 맞대어 본다).
  //    여기서 slot 글자를 직접 적으면 그 목록이 바뀌는 날 화면만 옛 목록으로 남는다.
  const 내가찍는것 = 아이가_찍는_칸.map((칸) => ({ 칸, 줄들: 입힌줄.filter((r) => r.slot === 칸) }));
  const 검사것 = 입힌줄.filter((r) => r.slot === "check");

  const 숙제찍기 = (item) => {
    // ⚠️ 되돌릴 수 없다 → **서버 답을 기다린다.** 낙관 갱신을 하지 않는다
    시작(async () => {
      const r = await 다했어요(item.id);
      if (r?.ok) set덮개숙제((m) => ({ ...m, [item.id]: "done" }));
      else set알림(r?.why ?? "저장하지 못했습니다.");
    });
  };

  /* ── 진도 ───────────────────────────────────────────────────────
   * ⚠️ `useCallback` 이 없으면 그릴 때마다 **함수가 새 것**이 되어 아래 교재 카드의
   *    `useMemo(진도맵)` 이 매번 다시 돈다 — 교재 4권 × 단원 수백 줄이면 눈에 띈다. */
  const 진도찾기 = useCallback((unitId, round) =>
    덮개진도[키(unitId, round)] ??
    진도줄.find((p) => p.unit_id === unitId && Number(p.round) === Number(round)) ?? null,
  [덮개진도, 진도줄]);

  const 진도누르기 = (unitId, round, 표시) => {
    const k = 키(unitId, round);
    const 앞 = 덮개진도[k];
    // 되돌릴 수 있는 자리다(아이가 찍은 줄은 아이가 다시 고친다) → **그 자리에서 바로** 바꾼다
    set덮개진도((m) => ({
      ...m,
      [k]: { unit_id: unitId, round, status: 표시, last_by: "student", confirmed: false,
             done_on: 표시 === "done" ? 오늘 : null },
    }));
    시작(async () => {
      const r = await 진도찍기({ unitId, round, 표시 });
      if (!r?.ok) {
        set덮개진도((m) => { const n = { ...m }; if (앞) n[k] = 앞; else delete n[k]; return n; });
        set알림(r?.why ?? "저장하지 못했습니다.");
      }
    });
  };

  /* ── 카드 하나하나 ────────────────────────────────────────────── */
  const 카드그리기 = {
    today: () => (
      <오늘카드
        글={글} 마감됐나={마감됐나} 오늘수업날={오늘수업날} 빈카드숨김={빈카드숨김}
        학원것={학원것} 내가찍는것={내가찍는것} 검사것={검사것} 오늘판={오늘판}
        찍기={숙제찍기} 저장중={저장중}
      />
    ),
    books: () => (
      <교재카드
        오늘={오늘} 교재들={교재들} 진도찾기={진도찾기} 진도체크열림={진도체크열림}
        수업이력={달력?.수업이력 ?? []} 누르기={진도누르기} 저장중={저장중}
        알림={set알림} 이의들={이의들}
      />
    ),
    // ⚠️ 비면 아예 안 띄운다 — 아이 화면이라 숨긴다(원장 화면에서는 빈 것도 보인다)
    flags: () => (이의들.length ? <이의카드 이의들={이의들} 교재들={교재들} /> : null),
  };

  return (
    <main className="wrap">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <header className="me-head">
        <h1>{학생?.name ? `${학생.name}님, 안녕하세요` : "안녕하세요"}</h1>
        <span className="me-when num">{날짜글(오늘)}</span>
      </header>

      {왜들.length > 0 && (
        <div className="me-why" role="status">
          <b>화면이 비어 보이면 아래 까닭입니다.</b>
          <ul>{왜들.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      {알림 && (
        <p className="me-toast" role="alert">
          {알림}{" "}
          <button type="button" className="me-sq" onClick={() => set알림(null)}>닫기</button>
        </p>
      )}

      <div className="me-cards">
        {순서.map((key, i) => {
          const 속 = 카드그리기[key]?.();
          if (!속) return null;
          return (
            <div
              key={key}
              className={"card" + (끄는것 === key ? " is-drag" : "")}
              draggable
              onDragStart={() => set끄는것(key)}
              onDragEnd={() => set끄는것(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (끄는것 && 끄는것 !== key) 차례바꾸기(끌어옮기기(순서, 끄는것, key));
                set끄는것(null);
              }}
            >
              <div className="me-tool me-right">
                <span className="me-sub me-grip">⠿ 끌어서 옮기기</span>
                <button type="button" className="me-sq" disabled={i === 0 || 저장중}
                  onClick={() => 차례바꾸기(한칸옮기기(순서, key, "up"))} aria-label="이 칸을 위로">▲</button>
                <button type="button" className="me-sq" disabled={i === 순서.length - 1 || 저장중}
                  onClick={() => 차례바꾸기(한칸옮기기(순서, key, "down"))} aria-label="이 칸을 아래로">▼</button>
              </div>
              {속}
            </div>
          );
        })}
      </div>

      {/* ⚠️ 달력은 **언제나 맨 밑**이다 — 차례를 바꿔도 안 올라온다(절 ⑯) */}
      <달력카드 오늘={오늘} 달력={달력} 글={글} />

      <LogoutButton />
    </main>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * 오늘 할 것
 * ════════════════════════════════════════════════════════════════ */
function 오늘카드({ 글, 마감됐나, 오늘수업날, 빈카드숨김, 학원것, 내가찍는것, 검사것, 오늘판, 찍기, 저장중 }) {
  const 할것 = [...학원것, ...내가찍는것.flatMap((g) => g.줄들)];
  const 셈 = 센다(할것);
  const 있나 = 할것.length + 검사것.length > 0;
  const 어떻게 = 카드어떻게(있나, 마감됐나);

  // ⚠️ 마감한 뒤에 정말 아무것도 없으면 **아예 안 띄운다** — 아이 화면에서만 그렇다(절 ⑮-3)
  if (어떻게 === "hide" && 빈카드숨김 && 오늘수업날) return null;

  return (
    <>
      <div className="me-cardhd">
        <span className="me-ttl">오늘 할 것</span>
        {/* ⚠️ 접힌 것도 **분자에 그대로 든다** — 접기는 보이는 것만 바꾼다 */}
        {셈.전체 > 0 && <span className="pill pillinfo num">{셈.끝} / {셈.전체}</span>}
        {오늘판?.attend && <span className="chip">{출결글(오늘판.attend)}</span>}
      </div>

      {어떻게 !== "show" ? (
        <p className="sunk">
          {!오늘수업날
            ? "오늘은 수업이 없는 날이에요."
            : 어떻게 === "preparing"
              ? (글?.PREPARING ?? "아직 정리 중이에요")
              : (글?.NOTHING ?? "없음")}
          <br />
          <span className="me-sub">
            {!오늘수업날
              ? "반 요일로 셌어요. 보강이 잡혔다면 이 화면에는 안 나옵니다."
              : 어떻게 === "preparing"
                ? "쌤이 오늘 수업을 정리하면 여기에 뜹니다. 「없는 날」이 아니에요."
                : "오늘은 낼 것이 없습니다."}
          </span>
        </p>
      ) : (
        <>
          {오늘판?.comment && <p className="sunk">{오늘판.comment}</p>}

          <할일묶음
            제목={칸이름[학원_칸]} 줄들={학원것} 차례있음
            도움="위에서부터 하나씩 해요. 앞엣것을 끝내야 다음 것이 열립니다. 여기 있는 것은 쌤이 확인해서 찍어 줍니다."
            찍기={null} 저장중={저장중} 못찍는까닭="쌤이 확인"
          />
          {내가찍는것.map(({ 칸, 줄들 }) => (
            <할일묶음
              key={칸} 제목={칸이름[칸] ?? 칸} 줄들={줄들} 찍기={찍기} 저장중={저장중}
              도움={칸 === "next"
                ? "다음 시간에 배울 것을 미리 봐 두는 자리예요. 다 한 것은 ○ 을 눌러 주세요."
                : "다 한 것은 ○ 을 눌러 주세요. ⚠️ 한 번 누르면 되돌릴 수 없어요."}
            />
          ))}

          {검사것.length > 0 && (
            <details className="me-fold">
              <summary>쌤이 검사한 것 {검사것.length}개 — 눌러서 보기</summary>
              <ul className="me-list me-mt">
                {검사것.map((r) => (
                  <li key={r.id} className="me-item">
                    <span className="me-body"><span className="me-name">{줄이름(r)}</span><단원글 r={r} /></span>
                    <span className={"pill " + 검사색(r.status)}>{검사글(r.status)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {!마감됐나 && 어떻게 === "show" && (
        <p className="me-sub">⚠️ 아직 쌤이 오늘을 정리하는 중이라 더 늘어날 수 있어요.</p>
      )}
    </>
  );
}

/** 한 묶음 — 끝낸 것은 **아래로 접고 개수만.** 펴면 그대로 다시 보인다(절 ⑮-2) */
function 할일묶음({ 제목, 줄들, 도움, 찍기, 저장중, 차례있음 = false, 못찍는까닭 = null }) {
  if (!줄들.length) return null;
  const 남은 = 줄들.filter((r) => !끝난줄(r));
  const 끝난 = 줄들.filter(끝난줄);
  return (
    <section className="me-group">
      <div className="me-cardhd">
        <span className="me-ttl me-ttl2">{제목}</span>
        <span className="pill pilloff num">{끝난.length} / {줄들.length}</span>
      </div>
      {도움 && <p className="me-sub">{도움}</p>}
      <ul className="me-list">
        {남은.map((r) => (
          <할일줄 key={r.id} r={r} 차례있음={차례있음} 찍기={찍기} 저장중={저장중} 못찍는까닭={못찍는까닭} />
        ))}
      </ul>
      {끝난.length > 0 && (
        <details className="me-fold">
          <summary>다 한 것 {끝난.length}개 — 눌러서 보기</summary>
          <ul className="me-list me-mt">
            {끝난.map((r) => <할일줄 key={r.id} r={r} 차례있음={차례있음} 찍기={null} 저장중={저장중} />)}
          </ul>
        </details>
      )}
    </section>
  );
}

function 할일줄({ r, 차례있음, 찍기, 저장중, 못찍는까닭 }) {
  const 끝 = 끝난줄(r);
  const 잠김 = 차례있음 && !끝 && r.열림 === false;
  return (
    <li className={"me-item" + (끝 ? " is-done" : 잠김 ? " is-later" : "")}>
      {차례있음 && <span className="me-seq num">{r.차례}</span>}
      <span className="me-body">
        <span className="me-name">{줄이름(r)}</span>
        <단원글 r={r} />
        {r.range_note && <span className="me-sub">이번 범위 · {r.range_note}</span>}
        {r.memo && <span className="me-sub">{r.memo}</span>}
        {잠김 && <span className="me-sub">앞엣것을 끝내면 열려요.</span>}
      </span>
      <span className="me-act">
        {끝 ? (
          <span className="pill pillok">다 함</span>
        ) : 찍기 ? (
          <button type="button" className="me-sq" disabled={저장중 || 잠김}
            onClick={() => 찍기(r)}>○ 다 했어요</button>
        ) : (
          <span className="pill pilloff">{못찍는까닭 ?? "아직"}</span>
        )}
      </span>
    </li>
  );
}

/**
 * ⚠️ 단원 이름을 **한 줄로 붙여 만들지 않는다** — 붙인 글자는 `v2.unit_label` 한 벌뿐이다(원칙 1).
 *    화면은 대단원·소단원·활동을 **따로** 그린다.
 * ⚠️ 그리고 **제목은 소단원 하나씩**이다 — 중·대단원으로 묶으면 이름이 이어 붙어
 *    카드 하나가 화면 세 줄을 먹는다(패파에서 실제로 그랬다).
 */
function 단원글({ r }) {
  const u = r?.units;
  if (!u) return null;
  const 쪽 = u.page_start
    ? (u.page_end && u.page_end !== u.page_start ? `p.${u.page_start}~${u.page_end}` : `p.${u.page_start}`)
    : null;
  return (
    <span className="me-sub">
      {u.books?.name && <b>{u.books.name}</b>}
      {u.sub ? ` · ${u.sub}` : u.chapter ? ` · ${u.chapter}` : ""}
      {u.activity ? ` · ${u.activity}` : ""}
      {쪽 ? ` · ${쪽}` : ""}
    </span>
  );
}

const 줄이름 = (r) => r?.learn_items?.name ?? r?.units?.activity ?? "할 것";
const 검사글 = (s) => ({ done: "○ 잘함", weak: "△ 조금 더", missing: "✕ 다시", inclass: "수업 중" }[s] ?? "아직");
const 검사색 = (s) => ({ done: "pillok", weak: "pillwarn", missing: "pillbad" }[s] ?? "pilloff");
const 출결글 = (a) => ({ present: "왔음", late: "늦음", absent: "결석", makeup: "보강", off: "휴강" }[a] ?? a);

/* ══════════════════════════════════════════════════════════════════
 * 내 교재 로드맵 (보드 C) + 진도 체크 (절 ㊶)
 * ════════════════════════════════════════════════════════════════ */
function 교재카드({ 오늘, 교재들, 진도찾기, 진도체크열림, 수업이력, 누르기, 저장중, 알림, 이의들 }) {
  const 다닌날 = useMemo(() => 다닌날수(교재들.map((t) => t.배정), 오늘), [교재들, 오늘]);
  return (
    <>
      <div className="me-cardhd">
        <span className="me-ttl">내 교재</span>
        {진도체크열림
          ? <span className="pill pillwarn">진도 체크가 열려 있어요</span>
          : <span className="pill pilloff">진도 체크는 지금 닫혀 있어요</span>}
      </div>

      <p className="me-sub">
        {진도체크열림
          ? "내가 한 데까지 ○ ◐ 로 찍어 주세요. 쌤이 확인하면 노란 테두리가 없어져요. 쌤이 찍은 줄은 못 바꿔요 — 틀렸으면 ❗ 를 눌러 알려 주세요."
          : "지금은 보기만 할 수 있어요. 진도 체크는 쌤이 설정에서 열어 줘야 합니다."}
      </p>

      {교재들.length === 0 ? (
        <p className="me-why">
          내 교재가 하나도 안 보입니다 — 아직 교재가 배정되지 않았거나 앱 설정이 덜 됐습니다. 원장님께 여쭤보세요.
        </p>
      ) : 교재들.map((t) => (
        <교재하나 key={t.배정.id} t={t} 오늘={오늘} 다닌날={다닌날} 수업이력={수업이력}
          진도찾기={진도찾기} 진도체크열림={진도체크열림} 누르기={누르기} 저장중={저장중}
          알림={알림} 이의들={이의들} />
      ))}
    </>
  );
}

function 교재하나({ t, 오늘, 다닌날, 수업이력, 진도찾기, 진도체크열림, 누르기, 저장중, 알림, 이의들 }) {
  // ⚠️ 회독을 지어내지 않는다 — 배정 줄의 값이 먼저고, 없으면 커서가 준 값이다
  const round = Number(t.배정?.round ?? t.커서?.round ?? 1);

  const 진도맵 = useMemo(() => {
    const m = new Map();
    for (const u of t.단원) {
      const p = 진도찾기(u.id, round);
      if (p) m.set(u.id, p);
    }
    return m;
  }, [t.단원, round, 진도찾기]);

  const 묶음 = useMemo(() => 대단원묶기(t.단원, 진도맵), [t.단원, 진도맵]);
  const 지금 = t.커서?.chapter ?? null;              // ⚠️ 커서는 `v2.cursor_of` 한 벌이 정한다
  const [펼친, set펼친] = useState(지금);            // **지금 것만 펼침**(오류 54)

  const 끝 = Number(t.진도율?.done ?? 0);
  const 전체 = Number(t.진도율?.total ?? 0);
  const 완료날들 = useMemo(
    () => t.단원.map((u) => 진도맵.get(u.id)?.done_on).filter(Boolean).map((d) => String(d).slice(0, 10)),
    [t.단원, 진도맵]);

  const 예상 = useMemo(
    () => 언제끝나나({ 오늘, 남은단원: Math.max(0, 전체 - 끝), 완료날들, 다닌날, 수업이력 }),
    [오늘, 전체, 끝, 완료날들, 다닌날, 수업이력]);

  return (
    <div className="me-book">
      <div className="me-cardhd">
        <span className="me-ttl me-ttl2">{t.책?.name ?? "교재"}</span>
        <span className="chip num">{round}회독</span>
        {전체 > 0 && <span className="pill pillinfo num">{끝} / {전체}</span>}
        {t.배정?.stop_mode && t.배정.stop_mode !== "running" && <span className="pill pillwarn">지금은 쉬는 중</span>}
      </div>

      {전체 > 0 ? (
        <div className="me-bar"><span style={{ width: `${Math.round((끝 / 전체) * 100)}%` }} /></div>
      ) : (
        <p className="me-sub">⚠️ 이 교재의 단원이 앱에 아직 안 들어와 있어요.</p>
      )}

      {/* ⚠️ 「언제쯤 끝나나」 — **세어서** 말하고 저장하지 않는다. 못 세면 못 센다고 적는다 */}
      <p className="sunk">
        {예상.state === "ok" ? (
          <>이대로면 <b className="num">{날짜글(예상.on)}</b>쯤 끝나요 <span className="me-sub">(예상이에요 · {예상.why})</span></>
        ) : (
          <span>{예상.why}</span>
        )}
        <br />
        <span className="me-sub">⚠️ 휴강은 아이 화면에 안 내려와서 셈에 못 넣었어요 — 실제로는 조금 더 걸릴 수 있어요.</span>
      </p>

      {지금 && <p className="me-sub">지금 하는 데 · <b>{지금}</b>{t.커서?.is_workbook ? " (워크북)" : ""}</p>}

      {/* 전 대단원 아코디언 — **지금 것만 펼친다**(오류 54) */}
      {묶음.map((g) => {
        const 열림 = 펼친 === g.chapter;
        return (
          <div key={g.chapter || "(이름 없음)"} className={"me-chap" + (열림 ? " is-open" : "")}>
            <button type="button" className="me-chaphd" aria-expanded={열림}
              onClick={() => set펼친(열림 ? null : g.chapter)}>
              <span className="me-chapnm">{g.chapter || "(대단원 이름 없음)"}</span>
              {g.chapter === 지금 && <span className="pill pillinfo">지금 여기</span>}
              <span className="pill pilloff num">{g.끝} / {g.전체}</span>
              {g.건너뜀 > 0 && <span className="pill pillinfo num">건너뜀 {g.건너뜀}</span>}
              <span>{열림 ? "▾" : "▸"}</span>
            </button>
            {열림 && (
              <div className="me-chapbd">
                {g.units.map((u) => (
                  <단원줄 key={u.id} u={u} round={round} 진도={진도맵.get(u.id) ?? null}
                    열려있나={진도체크열림} 누르기={누르기} 저장중={저장중} 알림={알림}
                    이의있나={이의들.some((f) => f.unit_id === u.id)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 소단원 한 줄 — ⚠️ **소단원마다** 찍는다(오류 101). 대단원만 찍으면 채우려던 값이 안 채워진다 */
function 단원줄({ u, round, 진도, 열려있나, 누르기, 저장중, 알림, 이의있나 }) {
  const 덮을수있나 = 아이가덮을수있나(진도, 열려있나);
  const 기다림 = 확인기다리는중(진도);
  const 누가 = 누가찍었나(진도);
  const [이의폼, set이의폼] = useState(false);

  return (
    <>
      <div className={"me-unit" + (기다림 ? " is-wait" : "") + (열려있나 && !덮을수있나 ? " is-locked" : "")}>
        <span className="me-body">
          <span className="me-name">{u.sub || u.mid || u.activity}</span>
          <span className="me-sub">
            {u.sub && u.activity ? u.activity : ""}{u.is_workbook ? " · 워크북" : ""}
          </span>
        </span>
        {누가 && <span className="chip">{누가}</span>}
        {기다림 && <span className="pill pillwarn">확인 기다리는 중</span>}

        <span className="me-mark">
          {표시들.map((m) => (
            <button key={m.key} type="button"
              className={"me-mk" + ((진도?.status ?? "none") === m.key ? " is-sel" : "")}
              disabled={!덮을수있나 || 저장중}
              onClick={() => 누르기(u.id, round, m.key)}
              title={m.이름} aria-label={`${u.sub || u.activity} ${m.이름}`}>{m.글자}</button>
          ))}
        </span>

        {/* ⚠️ ❗ 는 **진도를 안 바꾼다** — 쌤에게 말만 건다(오류 102) */}
        <button type="button" className="me-sq" onClick={() => set이의폼((v) => !v)}
          aria-expanded={이의폼} aria-label="이거 잘못됐어요">❗</button>
        {이의있나 && <span className="pill pillinfo">알림 보냄</span>}
      </div>

      {이의폼 && <이의폼틀 unitId={u.id} round={round} 저장중={저장중} 닫기={() => set이의폼(false)} 알림={알림} />}
    </>
  );
}

/** ⚠️ 덮개 판(모달)을 안 띄운다 — **그 자리에서 펼친다**(대전제 8) */
function 이의폼틀({ unitId, round, 닫기, 알림, 저장중 }) {
  const [kind, setKind] = useState("not_done");
  const [said, setSaid] = useState("");
  const [보냄, set보냄] = useState(false);
  const [진행, 시작] = useTransition();

  if (보냄)
    return (
      <p className="me-flag">
        쌤에게 알렸어요. <b>진도는 아직 그대로예요</b> — 쌤이 보고 고쳐 줍니다.{" "}
        <button type="button" className="me-sq" onClick={닫기}>닫기</button>
      </p>
    );

  const 갈래 = [
    ["not_done", "안 했는데 「했음」으로 돼 있어요"],
    ["already_done", "했는데 「안 함」으로 돼 있어요"],
    ["other", "그 밖에"],
  ];

  return (
    <div className="me-flag">
      <p className="me-sub">무엇이 잘못됐나요? ⚠️ 여기서 알려도 <b>진도는 바로 안 바뀌어요.</b></p>
      {갈래.map(([k, 글]) => (
        <label key={k} className="me-radio">
          <input type="radio" name={`k-${unitId}`} checked={kind === k} onChange={() => setKind(k)} />
          {글}
        </label>
      ))}
      <label className="lbl" htmlFor={`say-${unitId}`}>하고 싶은 말 (안 써도 돼요)</label>
      <textarea id={`say-${unitId}`} value={said} onChange={(e) => setSaid(e.target.value)}
        maxLength={500} placeholder="예: 1~5번만 했어요" />
      <div className="row me-right me-mt">
        <button type="button" className="btn btnghost" onClick={닫기}>그만두기</button>
        <button type="button" className="btn btnmain" disabled={진행 || 저장중}
          onClick={() => 시작(async () => {
            const r = await 이의달기({ unitId, round, kind, said });
            if (r?.ok) set보냄(true); else 알림(r?.why ?? "보내지 못했습니다.");
          })}>쌤에게 알리기</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * 내가 알린 것 (❗)
 * ════════════════════════════════════════════════════════════════ */
function 이의카드({ 이의들, 교재들 }) {
  const 단원맵 = useMemo(() => {
    const m = new Map();
    for (const t of 교재들) for (const u of t.단원) m.set(u.id, { u, 책: t.책?.name ?? "" });
    return m;
  }, [교재들]);
  const 갈래글 = { not_done: "안 했는데 「했음」", already_done: "했는데 「안 함」", other: "그 밖에" };

  return (
    <>
      <div className="me-cardhd">
        <span className="me-ttl">내가 알린 것</span>
        <span className="pill pillinfo num">{이의들.length}</span>
      </div>
      <p className="me-sub">쌤이 아직 안 본 것들이에요. ⚠️ 이것 때문에 진도가 바뀌지는 않아요.</p>
      <ul className="me-list">
        {이의들.map((f) => {
          const 짝 = 단원맵.get(f.unit_id);
          return (
            <li key={f.id} className="me-item">
              <span className="me-body">
                <span className="me-name">{짝 ? (짝.u.sub || 짝.u.chapter || 짝.u.activity) : "다른 교재의 단원"}</span>
                <span className="me-sub">{짝?.책 ? `${짝.책} · ` : ""}{갈래글[f.kind] ?? f.kind}</span>
                {f.said && <span className="me-sub">“{f.said}”</span>}
              </span>
              <span className="pill pillwarn">쌤 확인 기다리는 중</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * 달력 (절 ⑯) — **맨 밑**
 * ════════════════════════════════════════════════════════════════ */
function 달력카드({ 오늘, 달력, 글 }) {
  const [ym, setYm] = useState(달력?.이달 ?? 오늘.slice(0, 7));
  const 칸들 = useMemo(() => {
    if (!달력) return [];
    const { first, last } = monthRange(ym);
    return 달력칸({
      오늘, first, last,
      판들: (달력.판들 ?? []).filter((s) => String(s.date).slice(0, 7) === ym),
      수업이력: 달력.수업이력 ?? [],
      시험들: 달력.시험들 ?? [],
      재원시작: 달력.재원시작 ?? null,
    });
  }, [ym, 오늘, 달력]);

  if (!달력) return null;

  return (
    <section className="card me-mt4">
      <div className="me-calhd">
        {/* ⚠️ 달을 넘겨도 **다시 조회하지 않는다** — 석 달치를 이미 받아 뒀다(탭 금지와 같은 까닭) */}
        <button type="button" className="me-sq" disabled={ym <= 달력.앞달}
          onClick={() => setYm(달옮기기(ym, -1))} aria-label="지난 달">◀</button>
        <span className="me-calnm num">{ym.slice(0, 4)}년 {Number(ym.slice(5, 7))}월</span>
        <button type="button" className="me-sq" disabled={ym >= 달력.뒷달}
          onClick={() => setYm(달옮기기(ym, 1))} aria-label="다음 달">▶</button>
      </div>

      <div className="calwrap">
        <div className="me-dow">{DOW_NAME.map((d) => <span key={d}>{d}</span>)}</div>
        <div className="cal">
          {칸들.map((c, i) =>
            c == null ? (
              <div key={`x${i}`} className="calday me-cell-none" />
            ) : (
              <div key={c.date} className="calday">
                <span className="me-dnum num">{Number(c.date.slice(8))}</span>
                {c.date === 오늘 && <span className="pill pillinfo">오늘</span>}
                <span className="me-dot">{칸글(c, 글)}</span>
                {c.시험들.map((e) => <span key={e.id} className="pill pillbad">{e.name}</span>)}
              </div>
            )
          )}
        </div>
      </div>

      <details className="me-fold">
        <summary>달력에 안 나오는 것 {달력.못싣는것.length}가지 — 눌러서 보기</summary>
        <ul className="me-list me-mt">
          {달력.못싣는것.map((w, i) => (
            <li key={i} className="me-item"><span className="me-body"><span className="me-sub">{w}</span></span></li>
          ))}
        </ul>
      </details>
      <p className="me-sub">⚠️ 앞날에 보이는 것은 <b>「할 예정」</b>이에요. 아직 안 한 것이 아니라 아직 안 온 날이에요.</p>
    </section>
  );
}

/** ⚠️ 마감 안 한 날을 **빈 칸으로 두지 않는다** — 빈 칸이면 「수업이 없던 날」과 같아 보인다(절 ⑯ 1번) */
function 칸글(c, 글) {
  if (c.상태 === "before") return "";
  if (c.상태 === "closed") {
    const 숙제 = (c.판?.day_item ?? []).filter((i) => i.slot === "home" || i.slot === "next").length;
    return `${출결글(c.판.attend)}${숙제 ? ` · 숙제 ${숙제}` : ""}`;
  }
  if (c.상태 === "open") return 글?.DAY_OPEN ?? "수업함 · 정리 중";
  if (c.상태 === "plan") return "수업 예정";
  return "";
}

function 날짜글(d) {
  if (!d) return "";
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return `${y}년 ${m}월 ${day}일 (${DOW_NAME[요일(d)]})`;
}
