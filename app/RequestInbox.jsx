"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { handleRequest } from "./requests/actions";
import RequestPhotos from "@/components/RequestPhotos";

const KIND = { absence: "결석", makeup: "보강가능시간", info: "전달", question: "질문" };

// 학생·학부모가 보낸 알림을 확인하고, 결석은 바로 결석 예정으로 반영한다
export default function RequestInbox({ requests = [] }) {
  const [reply, setReply] = useState({});
  const [mk, setMk] = useState({});      // { [id]: { on, at } } — 보강일
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /**
   * **받아주면서 보강까지 그 자리에서** (원장님, 2026-08-07 —
   * 「결석알림이 오면 보강을 바로 잡을 수 있게 해줘」).
   *
   * 지금까지는 「확인」 → 결석 예정으로 깔림 → 아래 「보강 잡을 것」 에
   * 다시 나타남 → 거기서 또 날짜를 고름, 이렇게 두 번 손이 갔다.
   * 어차피 어머니께 답을 드릴 때 「금요일 5시에 오세요」 까지 정하시므로
   * 여기서 한 번에 끝내는 것이 맞다.
   */
  function act(id, accept) {
    startTransition(async () => {
      const m = mk[id];
      const res = await handleRequest(id, accept, reply[id], accept ? m : null);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  const setM = (id, patch) => setMk({ ...mk, [id]: { ...(mk[id] || {}), ...patch } });

  return (
    <div className="card sect sect-warn">
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
        학부모 · 학생 알림{" "}
        {requests.length > 0 && <span className="tag tag-amber">{requests.length}</span>}
      </h2>

      {requests.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>새로 온 알림이 없습니다.</p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {requests.map((r) => (
            <div className="unitrow" key={r.id} style={{ alignItems: "flex-start" }}>
              <span className="tag tag-lav">{KIND[r.kind] || r.kind}</span>
              <div style={{ flex: 1, minWidth: 120 }}>
                <b style={{ fontSize: 12.5 }}>{r.studentName}</b>{" "}
                {r.from_date && (
                  <span className="hint">
                    {r.from_date.slice(5)}
                    {r.to_date && r.to_date !== r.from_date ? `~${r.to_date.slice(5)}` : ""}
                  </span>
                )}
                {r.body && <div className="hint" style={{ marginTop: 2 }}>{r.body}</div>}
                {(r.photos || []).length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <RequestPhotos paths={r.photos} readOnly small />
                  </div>
                )}
              </div>
              {/* **결석이면 보강까지 여기서** — 어차피 답장에 「금요일 5시에
                  오세요」 를 적으시게 된다 (원장님, 2026-08-07) */}
              {(r.kind === "absence" || r.kind === "makeup") && (
                <>
                  <span className="hint">보강</span>
                  <input
                    className="input input-sm"
                    type="date"
                    style={{ width: 140 }}
                    value={mk[r.id]?.on || ""}
                    onChange={(e) => setM(r.id, { on: e.target.value })}
                  />
                  <input
                    className="input input-sm"
                    type="time"
                    style={{ width: 105 }}
                    value={mk[r.id]?.at || ""}
                    onChange={(e) => setM(r.id, { at: e.target.value })}
                  />
                </>
              )}
              <input
                className="input input-sm"
                style={{ width: 120 }}
                placeholder="답장"
                value={reply[r.id] || ""}
                onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })}
              />
              <button className="btn btn-primary btn-sm" onClick={() => act(r.id, true)} disabled={pending}>
                확인
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => act(r.id, false)} disabled={pending}>
                {/* 결석은 '반영' 이라는 말이 맞지만, 그냥 알려주신 것에는 안 맞는다 */}
                {r.kind === "absence" ? "반영 안 함" : "봤어요"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
