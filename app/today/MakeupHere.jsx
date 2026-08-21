"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMakeup, waiveMakeup } from "@/app/plan/actions";
import { dayLabel } from "@/lib/day";

/**
 * **결석을 찍은 자리에서 보강까지** (원장님, 2026-08-07 — 수업 중 동선).
 *
 * 「결석」 을 누르는 순간 원장님 머릿속에는 이미 「언제 보강하지」 가 있다.
 * 그런데 보강을 잡으려면 출결 화면으로 옮겨 가서 학생을 다시 찾고 그 결석이
 * 며칠이었는지 다시 떠올려야 했다. **수업 중에는 그럴 짬이 없다** — 그래서
 * 나중에 하기로 하고, 나중은 오지 않는다.
 *
 * 결석·온라인을 고르면 여기 한 줄이 열린다. 날짜와 시간만 넣으면 끝이고,
 * 어느 결석의 보강인지는 **이 화면의 날짜**라 물어볼 것이 없다.
 *
 * 이미 잡혀 있으면 잡힌 날짜를 보여준다 — 두 번 잡으면 그날 오지도 않을
 * 아이가 「오늘 수업」 에 뜬다.
 */
/**
 * **보강날에 또 결석** (원장님, 2026-08-21 — 「보강을 결석한 경우 다시
 * 보강을 할지 보강 없음 처리 할지 표시 필요함」).
 *
 * 보통 결석과 다른 점: 이 날짜 자체가 보강이라, 새로 잡는 보강도 **원래
 * 결석**(makeupOf)에 이어져야 한다. 그래야 「보강 필요」 목록이
 * 이중으로 안 생긴다. 「보강 없음」 은 원래 결석에 보강 안 함 표시를
 * 남긴다 — 목록에서 내려가되, 결석 기록은 그대로다.
 */
export function MakeupMissed({ studentId, date, name = "학생", makeupOf = null }) {
  const [on, setOn] = useState("");
  const [at, setAt] = useState("");
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const origin = makeupOf || null;

  function act(fn, okText) {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
        setMsg({ bad: false, text: okText });
        router.refresh();
      } catch (e) {
        setMsg({ bad: true, text: `안 됐어요: ${e?.message || e}` });
      }
    });
  }

  return (
    <div className="prow">
      <span className="plabel">보강 결석</span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input input-sm" type="date" style={{ width: 145 }}
          value={on} onChange={(e) => setOn(e.target.value)} title="다시 잡을 보강 날짜"
        />
        <input
          className="input input-sm" type="time" style={{ width: 105 }}
          value={at} onChange={(e) => setAt(e.target.value)} title="보강 시각"
        />
        <button
          className="btn btn-sm"
          disabled={pending || !on}
          onClick={() =>
            act(() => setMakeup(studentId, on, origin || date, at), `${dayLabel(on)} 로 다시 잡았어요.`)
          }
        >
          다시 보강 잡기
        </button>
        {origin && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            title="원래 결석에 「보강 안 함」 표시를 남깁니다. 결석 기록은 그대로예요"
            onClick={() => {
              if (!confirm(`${name} ${dayLabel(origin)} 결석분을 보강 없음으로 둘까요?`)) return;
              act(() => waiveMakeup(studentId, origin, true), "보강 없음으로 표시했어요.");
            }}
          >
            보강 없음 처리
          </button>
        )}
        {msg && <span className={msg.bad ? "err" : "hint"}>{msg.text}</span>}
        {!msg && (
          <span className="hint" style={{ fontSize: 12.5 }}>
            {origin
              ? `원래 ${dayLabel(origin)} 결석분 보강이었어요 — 다시 잡으면 그 결석에 이어집니다`
              : "결석분이 아닌 추가 보강이었어요 — 안 잡고 그냥 두셔도 돼요"}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MakeupHere({ studentId, date, name = "학생", already = null }) {
  const [on, setOn] = useState("");
  const [at, setAt] = useState("");
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (already) {
    return (
      <div className="prow">
        <span className="plabel">보강</span>
        <span className="tag tag-mint">{dayLabel(already)} 로 잡혀 있음</span>
        <span className="hint" style={{ fontSize: 12.5 }}>
          바꾸거나 무르는 것은 <a href="/plan">출결</a> 에서
        </span>
      </div>
    );
  }

  return (
    <div className="prow">
      <span className="plabel">보강</span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input input-sm" type="date" style={{ width: 145 }}
          value={on} onChange={(e) => setOn(e.target.value)}
        />
        <input
          className="input input-sm" type="time" style={{ width: 105 }}
          value={at} onChange={(e) => setAt(e.target.value)}
        />
        <button
          className="btn btn-sm"
          disabled={pending || !on}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              try {
                const res = await setMakeup(studentId, on, date, at);
                if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
                setMsg({ bad: false, text: `${dayLabel(on)} 로 잡았어요.` });
                router.refresh();
              } catch (e) {
                setMsg({ bad: true, text: `잡지 못했어요: ${e?.message || e}` });
              }
            });
          }}
        >
          {pending ? "잡는 중…" : "보강 잡기"}
        </button>
        {msg && (
          <span className={msg.bad ? "err" : "hint"}>{msg.text}</span>
        )}
        {!msg && (
          <span className="hint" style={{ fontSize: 12.5 }}>
            {name} · {dayLabel(date)} 결석분
          </span>
        )}
      </div>
    </div>
  );
}
