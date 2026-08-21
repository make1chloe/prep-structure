"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMakeup, waiveMakeup, cancelAbsence } from "./plan/actions";
import { dayLabel as fmtDay, DOW as DOWN } from "@/lib/day";
import { cleanNote } from "@/lib/note";

const dayLabel = fmtDay;

/**
 * 결석했는데 보강일이 안 잡힌 학생 목록.
 * 여기서 바로 보강 날짜를 정할 수 있다.
 */
export default function MakeupInbox({ rows = [] }) {
  const [pick, setPick] = useState({});
  const [at, setAt] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /**
   * **보강 없음** (2026-08-06, 0103).
   *
   * 원장님 — 「아직 결석 안 했고 사전연락 없는데 뭐지. 보강 없음 버튼도 만들어줘」
   *
   * 결석 줄이 있는데 보강 줄이 없으면 여기 뜬다. 그래서 보강을 안 하기로 한
   * 결석은 **영원히 남았다** — 치우려면 없는 보강을 억지로 잡아야 했고,
   * 그러면 출결 기록이 거짓이 된다. 결석은 그대로 두고 목록에서만 내린다.
   */
  function waive(r) {
    startTransition(async () => {
      const res = await waiveMakeup(r.studentId, r.date, true);
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  function schedule(r) {
    const key = `${r.studentId}|${r.date}`;
    const d = pick[key];
    if (!d) return;
    startTransition(async () => {
      const res = await setMakeup(r.studentId, d, r.date, at[key]);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  /**
   * **결석 취소** (원장님, 2026-08-07).
   *
   * 「보강 없음」 과 다르다 — 그쪽은 결석은 있었고 보강만 안 하는 것이다.
   * 이쪽은 **그 결석이 없던 일**이 됐을 때다 (미리 못 온다고 하셨다가
   * 그냥 오시는 경우). 줄을 그대로 두면 회차와 수강료가 오지도 않은
   * 결석을 계속 센다.
   */
  function cancel(r) {
    if (!confirm(`${r.name} ${dayLabel(r.date)} 결석을 없던 것으로 할까요?`)) return;
    startTransition(async () => {
      const res = await cancelAbsence(r.studentId, r.date);
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="card sect sect-warn">
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>
        보강 필요{" "}
        {rows.length > 0 && <span className="tag tag-amber">{rows.length}</span>}
      </h2>

      {rows.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>보강 잡을 학생이 없습니다 👍</p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {rows.map((r) => {
            const key = `${r.studentId}|${r.date}`;
            return (
              <div className="unitrow" key={key}>
                {/* **아직 오지 않은 날은 「결석」 이 아니라 「예정」 이다.**
                    「아직 결석 안 했는데」 가 여기서 갈린다 */}
                <span className={`tag ${r.future ? "tag-muted" : r.planned ? "tag-amber" : "tag-muted"}`}>
                  {r.future ? "결석 예정" : r.planned ? "사전 연락" : "결석"}
                </span>
                <b style={{ fontSize: 14 }}>{r.name}</b>
                <span className="hint">{dayLabel(r.date)}{r.future ? "" : " 결석"}</span>
                {r.reason && <span className="hint">· {r.reason}</span>}
                {cleanNote(r.note) && <span className="hint">· {cleanNote(r.note)}</span>}
                {r.classDays?.length > 0 && (
                  <span className="hint">· 수업 {r.classDays.join("·")}</span>
                )}
                <span className="spacer" />
                <input
                  className="input input-sm"
                  type="date"
                  style={{ width: 140 }}
                  value={pick[key] || ""}
                  onChange={(e) => setPick({ ...pick, [key]: e.target.value })}
                />
                {/* **몇 시인지가 날짜만큼 중요하다** — 보강은 비는 틈에
                    끼워 넣는 것이다 (원장님, 2026-08-07) */}
                <input
                  className="input input-sm"
                  type="time"
                  style={{ width: 105 }}
                  value={at[key] || ""}
                  onChange={(e) => setAt({ ...at, [key]: e.target.value })}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => schedule(r)}
                  disabled={pending || !pick[key]}
                >
                  보강 잡기
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => waive(r)}
                  disabled={pending}
                  title="결석 기록은 남기고 이 목록에서만 내립니다"
                >
                  보강 없음
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => cancel(r)}
                  disabled={pending}
                  title="결석 자체를 없던 것으로 합니다 (회차·수강료에서도 빠집니다)"
                >
                  결석 취소
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
