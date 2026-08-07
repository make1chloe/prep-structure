"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMakeup } from "./plan/actions";
import { dayLabel } from "@/lib/day";

/**
 * 잡아둔 보강 한 줄씩 — **무를 수 있게** (원장님, 2026-08-07 —
 * 「보강일정 잡았다가 취소하려면 어떻게 해야해?」).
 *
 * 취소하면 **원래 결석은 그대로 남는다.** 결석이 없던 일이 된 것이 아니라
 * 보강 날짜만 무른 것이라, 그 결석은 다시 「보강 잡을 것」 으로 올라온다.
 * 그게 맞다 — 아직 보강을 못 해드린 상태니까.
 *
 * **어머니께 알림이 간다.** 그날 아이를 보내실 참이셨다. 조용히 지우면
 * 헛걸음을 하시게 된다.
 */
export default function MakeupRows({ rows = [], nameOf = {}, hasAnswer = true }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function drop(r) {
    const who = nameOf[r.student_id] || "학생";
    const why = prompt(
      `${who} ${dayLabel(r.date)} 보강을 취소할까요?\n\n어머니께 알림이 갑니다. 한 줄 덧붙이실 말이 있으면 적어주세요 (없으면 그냥 확인).`,
      ""
    );
    if (why === null) return;                  // 취소 버튼을 누르신 것
    startTransition(async () => {
      const res = await cancelMakeup(r.student_id, r.date, why);
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  const changed = rows.filter((r) => r.makeup_change_req);
  const wait = rows.filter((r) => !r.makeup_change_req && !r.makeup_confirmed_at);
  const done = rows.filter((r) => r.makeup_confirmed_at);
  const sorted = [...changed, ...wait, ...done];

  const Row = (r) => (
    <div className="unitrow" key={`${r.student_id}-${r.date}`}>
      <b style={{ fontSize: 12.5, minWidth: 72 }}>{nameOf[r.student_id] || "학생"}</b>
      <span className="hint">{dayLabel(r.date)}</span>
      {r.makeup_time && <span className="hint">{r.makeup_time.slice(0, 5)}</span>}
      {r.makeup_of && <span className="hint">· {r.makeup_of.slice(5)} 결석분</span>}
      {hasAnswer && (
        r.makeup_change_req ? (
          <span className="tag tag-red">변경 요청</span>
        ) : r.makeup_confirmed_at ? (
          <span className="tag tag-mint">확정</span>
        ) : (
          <span className="tag tag-muted">답 없음</span>
        )
      )}
      {r.makeup_change_req && (
        <span className="hint" style={{ flex: 1 }}>{r.makeup_change_req}</span>
      )}
      <span className="spacer" />
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => drop(r)}
        disabled={pending}
        title="보강 날짜만 무릅니다. 결석 기록은 그대로 남고 「보강 잡을 것」 으로 돌아갑니다"
      >
        보강 취소
      </button>
    </div>
  );

  return (
    <div className={`card sect ${changed.length ? "sect-bad" : "sect-calm"}`}>
      <h2 className="secthead">
        잡아둔 보강{" "}
        {changed.length > 0 && <span className="tag tag-red">변경 요청 {changed.length}</span>}{" "}
        {hasAnswer && wait.length > 0 && (
          <span className="tag tag-muted">답 없음 {wait.length}</span>
        )}
      </h2>
      <div className="stack" style={{ gap: 3 }}>{sorted.map(Row)}</div>
    </div>
  );
}
