"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMakeup, moveMakeup } from "./plan/actions";
import { dayLabel } from "@/lib/day";

/**
 * 잡아둔 보강 한 줄씩 — **무를 수 있게** (원장님, 2026-08-07 —
 * 「보강일정 잡았다가 취소하려면 어떻게 해야해?」).
 *
 * 취소하면 **원래 결석은 그대로 남는다.** 결석이 없던 일이 된 것이 아니라
 * 보강 날짜만 무른 것이라, 그 결석은 다시 「보강 필요」 으로 올라온다.
 * 그게 맞다 — 아직 보강을 못 해드린 상태니까.
 *
 * **어머니께 알림이 간다.** 그날 아이를 보내실 참이셨다. 조용히 지우면
 * 헛걸음을 하시게 된다.
 */
/**
 * @param renderExtra  줄 오른쪽에 더 붙일 것 (보강 화면의 「완료 찍기」 처럼)
 *                     — 같은 줄을 두 벌로 만들지 않으려고 자리만 내준다
 */
export default function MakeupRows({ rows = [], nameOf = {}, hasAnswer = true, onlyChanged = false, renderExtra = null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // **일정 바꾸기** (원장님 2026-08-21 — 「보강 일정을 수정할 수가 없음」).
  // 취소했다 다시 잡는 게 아니라 그 줄을 옮긴다 — 원 결석 연결·사유가 따라간다
  const [edit, setEdit] = useState(null);   // { key, date, time }

  function move(r) {
    startTransition(async () => {
      const res = await moveMakeup(r.student_id, r.date, edit.date, edit.time);
      if (res?.error) { alert(res.error); return; }
      setEdit(null);
      router.refresh();
    });
  }

  function drop(r) {
    const who = nameOf[r.student_id] || "학생";
    const why = prompt(
      `${who} ${dayLabel(r.date)} 보강을 취소할까요?\n\n어머니께 알림이 갑니다. 한 줄 덧붙이실 말이 있으면 적어주세요 (없으면 그냥 확인).`,
      ""
    );
    if (why === null) return;                  // 취소 버튼을 누르신 것
    startTransition(async () => {
      const res = await cancelMakeup(r.student_id, r.date, why, true);
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  /**
   * **알리지 않고 지운다** (원장님, 2026-08-07 — 「보강 자체를 취소할 수도
   * 있게해줘. 이 경우 어머니 알림 없이」).
   *
   * 잘못 눌러 생긴 줄이나 아직 아무에게도 말하지 않은 보강은 알릴 것이 없다.
   * 그런데 알림이 나가면 **없던 일을 있었던 일로 만든다** — 어머니가
   * 「무슨 보강이요?」 하고 전화를 주시게 된다.
   */
  function dropQuiet(r) {
    const who = nameOf[r.student_id] || "학생";
    if (!confirm(`${who} ${dayLabel(r.date)} 보강을 지울까요?\n\n어머니께 알림이 가지 않습니다. 이미 안내하신 보강이면 [보강 취소] 를 쓰세요.`)) return;
    startTransition(async () => {
      const res = await cancelMakeup(r.student_id, r.date, null, false);
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  const changed = rows.filter((r) => r.makeup_change_req);
  const wait = rows.filter((r) => !r.makeup_change_req && !r.makeup_confirmed_at);
  const done = rows.filter((r) => r.makeup_confirmed_at);
  const sorted = [...changed, ...wait, ...done];

  const Row = (r) => {
    const key = `${r.student_id}-${r.date}`;
    return (
    <div key={key}>
    <div className="unitrow">
      <b style={{ fontSize: 14, minWidth: 72 }}>{nameOf[r.student_id] || "학생"}</b>
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
      {renderExtra ? renderExtra(r) : null}
      <button
        className={`btn btn-sm ${edit?.key === key ? "btn-on" : "btn-ghost"}`}
        disabled={pending}
        title="날짜·시간만 옮깁니다. 원래 결석 연결과 사유는 그대로 따라가요"
        onClick={() =>
          setEdit(edit?.key === key ? null : { key, date: r.date, time: (r.makeup_time || "").slice(0, 5) })
        }
      >
        일정 바꾸기
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => drop(r)}
        disabled={pending}
        title="보강 날짜만 무릅니다. 결석 기록은 그대로 남고 「보강 필요」 으로 돌아갑니다"
      >
        보강 취소
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => dropQuiet(r)}
        disabled={pending}
        title="알림 없이 그냥 지웁니다 (잘못 잡았거나 아직 안 알린 보강)"
        style={{ opacity: 0.75 }}
      >
        조용히 지우기
      </button>
    </div>
    {edit?.key === key && (
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center", margin: "2px 0 4px 72px" }}>
        <input
          className="input input-sm" type="date" style={{ width: 145 }}
          value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })}
        />
        <input
          className="input input-sm" type="time" style={{ width: 105 }}
          value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })}
        />
        <button className="btn btn-primary btn-sm" disabled={pending || !edit.date} onClick={() => move(r)}>
          이 날로 옮기기
        </button>
        <span className="hint" style={{ fontSize: 12.5 }}>
          어머니껜 다음 :00/:30 에 「보강 일정이 바뀌었습니다」 로 갑니다 — 그 전엔 발송에서 취소돼요
        </span>
      </div>
    )}
    </div>
    );
  };

  return (
    <div className={`card sect ${changed.length ? "sect-bad" : "sect-calm"}`}>
      <h2 className="secthead">
        {onlyChanged ? "보강 일정 변경 요청" : "잡아둔 보강"}{" "}
        {changed.length > 0 && <span className="tag tag-red">{changed.length}</span>}{" "}
        {!onlyChanged && hasAnswer && wait.length > 0 && (
          <span className="tag tag-muted">답 없음 {wait.length}</span>
        )}
        {onlyChanged && (
          <a className="hint" href="/plan" style={{ marginLeft: 6 }}>출결에서 전부 보기 ›</a>
        )}
      </h2>
      <div className="stack" style={{ gap: 3 }}>{sorted.map(Row)}</div>
    </div>
  );
}
