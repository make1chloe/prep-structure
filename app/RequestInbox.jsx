"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { handleRequest } from "./requests/actions";

const KIND = { absence: "결석", makeup: "보강 요청", question: "문의" };

// 학생·학부모가 보낸 알림을 확인하고, 결석은 바로 결석 예정으로 반영한다
export default function RequestInbox({ requests = [] }) {
  const [reply, setReply] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function act(id, accept) {
    startTransition(async () => {
      const res = await handleRequest(id, accept, reply[id]);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
        학부모 · 학생 알림{" "}
        {requests.length > 0 && <span className="tag tag-amber">{requests.length}</span>}
      </h2>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        결석 알림을 <b>확인</b>하면 그 기간이 자동으로 결석 예정으로 들어갑니다.
      </p>

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
              </div>
              <input
                className="input input-sm"
                style={{ width: 120 }}
                placeholder="답장 (선택)"
                value={reply[r.id] || ""}
                onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })}
              />
              <button className="btn btn-primary btn-sm" onClick={() => act(r.id, true)} disabled={pending}>
                확인
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => act(r.id, false)} disabled={pending}>
                반영 안 함
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
