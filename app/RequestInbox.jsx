"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { handleRequest } from "./requests/actions";
import RequestPhotos from "@/components/RequestPhotos";

const KIND = { absence: "결석", makeup: "보강 요청", info: "전달", question: "문의" };

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
    <div className="card sect sect-warn">
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
        학부모 · 학생 알림{" "}
        {requests.length > 0 && <span className="tag tag-amber">{requests.length}</span>}
      </h2>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        결석 알림을 <b>확인</b>하면 그 기간이 자동으로 결석 예정으로 들어갑니다.
        학교에서 받은 종이(체험학습 신청서 · 시험 시간표 · 가정통신문)를 찍어 보내면 여기 함께 옵니다.
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
                {(r.photos || []).length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <RequestPhotos paths={r.photos} readOnly small />
                  </div>
                )}
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
