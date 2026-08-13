"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pendingMakeups, answerMakeup } from "./makeupActions";
import { longLabel } from "@/lib/day";

/**
 * **보강 일정 — 확정하시거나, 어렵다고 알려주시거나.**
 *
 * 원장님 (2026-08-07) — 「보강 일정이 안내되었을 때 학부모가 확정 버튼까지
 * 누르게 만들어. 확정이 어려운 경우 일정 변경 요청을 클릭하게 해.
 * 둘 중 하나라도 누르지 않으면 계속 어플 사용할 때마다 첫 화면에서 경고메세지를 줘」
 *
 * ── 왜 성가시게 하나 ─────────────────────────────────────
 *
 * 지금은 날짜를 잡아 알림을 보내면 끝이다. 그런데 그날 안 오시면 **누구
 * 잘못인지 알 수가 없다** — 못 보신 것인지, 보시고도 안 된다고 생각만
 * 하신 것인지, 우리가 잘못 적은 것인지.
 *
 * 그 하루는 아이 자리를 비워두고 선생님 시간을 뺀 것이다. 그냥 넘어가면
 * 다음에 또 같은 일이 생긴다. 그래서 **답을 하실 때까지** 첫 화면에 있는다.
 *
 * 다만 **막지는 않는다.** 아래 화면은 그대로 보이신다 — 어머니를 막으면
 * 그 항의가 원장님께 간다. 눈에 크게 띄되, 쓰는 것을 막지는 않는다.
 */
export default function MakeupConfirm({ studentIds = [] }) {
  const [st, setSt] = useState(null);
  const [note, setNote] = useState({});
  const [open, setOpen] = useState({});     // 어느 줄에서 「변경 요청」 을 폈나
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    pendingMakeups(studentIds).then((r) => alive && setSt(r));
    return () => { alive = false; };
  }, [studentIds.join(",")]);

  function answer(r, ok) {
    startTransition(async () => {
      const res = await answerMakeup(r.student_id, r.date, ok, note[r.date]);
      if (res?.error) { alert(res.error); return; }
      setSt(await pendingMakeups(studentIds));
      router.refresh();
    });
  }

  // 0107 전이거나 답하실 것이 없으면 아무것도 안 그린다
  if (!st?.ready || st.rows.length === 0) return null;

  return (
    <div className="card sect sect-bad" style={{ marginTop: 10 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 17.5, fontWeight: 800 }}>
        📌 보강 일정을 확인해주세요
      </h2>
      <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.75 }}>
        아래 날짜로 보강을 잡아두었습니다. <b>오실 수 있으면 「확정」</b>을,
        <b> 어려우시면 「일정 변경 요청」</b>을 눌러주세요.
        <br />
        답을 주셔야 그 시간을 비워두거나 다른 날로 옮길 수 있습니다.
      </p>

      <div className="stack" style={{ gap: 10 }}>
        {st.rows.map((r) => (
          <div key={`${r.student_id}|${r.date}`} className="card card-tight">
            <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>{longLabel(r.date)}</b>
              {r.makeup_time && (
                <span className="tag tag-lav">{r.makeup_time.slice(0, 5)}</span>
              )}
              {r.makeup_of && <span className="hint">{r.makeup_of.slice(5)} 결석분</span>}
              {r.reason && <span className="hint">· {r.reason}</span>}
            </div>

            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => answer(r, true)}
                disabled={pending}
              >
                확정
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setOpen({ ...open, [r.date]: !open[r.date] })}
                disabled={pending}
              >
                일정 변경 요청
              </button>
            </div>

            {open[r.date] && (
              <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                {/* **언제가 되는지를 같이 받는다.** 「안 됩니다」 만 오면
                    다시 여쭤야 하고, 그러면 또 며칠이 간다 */}
                <textarea
                  className="input input-sm"
                  rows={2}
                  placeholder="언제가 괜찮으신지 적어주세요 (예: 다음 주 금요일 6시 이후)"
                  value={note[r.date] || ""}
                  onChange={(e) => setNote({ ...note, [r.date]: e.target.value })}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => answer(r, false)}
                  disabled={pending}
                >
                  변경 요청 보내기
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
