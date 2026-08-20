"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTask } from "./actions";

/**
 * **날짜 안 나온 일정** (원장님, 2026-08-21 — 「일정이 정확히 나오지
 * 않았지만 공지가 나온 일정을 어떻게 처리하면 좋을까」 · 「아무거나
 * 날짜 미정을 붙이게 해줘」).
 *
 * 수행평가 안내처럼 **공지는 왔는데 날짜가 아직인 것**은 지금까지 적을
 * 데가 없었다 — 할일에 임시로 적으면 나중에 일정에 또 적어야 한다
 * (같은 값 두 번 입력, 원칙 1 위반). 그래서 일정 그 줄에 「날짜 미정」
 * 만 붙인다: 달력엔 안 박히고 여기 모여서, 날짜가 나오면 **같은 줄에**
 * 채우는 순간 보통 일정이 된다.
 *
 * 달month·오늘부터 거르기에 안 걸리고 늘 보인다 — 안 보이면 잊히고,
 * 잊히면 「갑자기 수행평가」 가 된다.
 */
export default function TbdList({ rows = [] }) {
  const [pick, setPick] = useState({});   // id → 고른 확정 날짜
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!rows.length) return null;

  function confirmDate(r) {
    const d = pick[r.id] ?? r.due_on;
    startTransition(async () => {
      const res = await updateTask(r.id, { due_on: d, date_tbd: false });
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="card sect sect-warn" style={{ marginBottom: 10 }}>
      <h2 className="secthead">
        날짜 안 나온 일정 <span className="tag tag-amber">{rows.length}</span>
      </h2>
      <p className="hint" style={{ margin: "0 0 6px", fontSize: 12.5 }}>
        공지는 나왔는데 날짜가 아직인 것 — 달력엔 안 박혀 있어요.
        날짜가 나오면 여기서 채우는 순간 보통 일정이 됩니다.
      </p>
      <div className="stack" style={{ gap: 3 }}>
        {rows.map((r) => (
          <div className="unitrow" key={r.id}>
            <b style={{ fontSize: 14 }}>{r.title}</b>
            {r.category && <span className="tag tag-muted">{r.category}</span>}
            {/* due_on 은 대략 시기 — 「그쯤」 이라고만 말한다 */}
            {r.due_on && <span className="hint">{r.due_on.slice(5).replace("-", ".")}쯤?</span>}
            {r.note && (
              <span
                className="hint"
                style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {r.note}
              </span>
            )}
            <span className="spacer" />
            <input
              className="input input-sm" type="date" style={{ width: 145 }}
              value={pick[r.id] ?? r.due_on ?? ""}
              onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })}
              title="확정된 날짜"
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || !(pick[r.id] ?? r.due_on)}
              onClick={() => confirmDate(r)}
            >
              날짜 확정
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
