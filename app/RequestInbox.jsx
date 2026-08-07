"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { handleRequest } from "./requests/actions";
import { quickFor } from "./requests/quick";
import RequestPhotos from "@/components/RequestPhotos";

const KIND = { absence: "결석", makeup: "보강가능시간", info: "전달", question: "질문" };

const when = (t) =>
  t
    ? new Date(t).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

/**
 * 학생·학부모가 보낸 알림.
 *
 * ── 2026-08-07 에 세 가지가 바뀌었다 (원장님) ─────────────
 *
 * **1. 처리한 것도 남는다.** 「제출 후에 나한테는 다 보이게 해줘」.
 *    예전에는 「확인」 을 누르는 순간 사라져서, 무슨 말을 주고받았는지
 *    다시 볼 수가 없었다. 안 본 것이 위, 본 것은 아래에 접어둔다.
 *
 * **2. 답장을 여러 번.** 「금요일 5시에 오세요」 뒤에 「아 그날 시험이네요,
 *    월요일로」 를 적을 수 있어야 한다. 오간 말이 줄줄이 쌓인다.
 *
 * **3. 빨리 누르는 문구.** 매번 손으로 적으면 결국 안 적게 되고, 그러면
 *    어머니 화면에는 「제출 완료」 만 남는다. 받는 사람에 따라 말투가 다르다.
 */
export default function RequestInbox({ requests = [] }) {
  const [reply, setReply] = useState({});
  const [mk, setMk] = useState({});      // { [id]: { on, at } } — 보강일
  const [seen, setSeen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function act(id, accept, text) {
    startTransition(async () => {
      const m = mk[id];
      const res = await handleRequest(id, accept, text ?? reply[id], accept ? m : null);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setReply({ ...reply, [id]: "" });
      router.refresh();
    });
  }

  const setM = (id, patch) => setMk({ ...mk, [id]: { ...(mk[id] || {}), ...patch } });

  const live = requests.filter((r) => !r.canceled_at && !r.handled_at);
  const past = requests.filter((r) => r.canceled_at || r.handled_at);

  function Row(r, done) {
    const role = r.author_role === "parent" ? "parent" : "student";
    const thread = Array.isArray(r.thread) ? r.thread : [];
    return (
      <div className="card card-tight" key={r.id}>
        <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
          <span className="tag tag-lav">{KIND[r.kind] || r.kind}</span>
          <b style={{ fontSize: 12.5 }}>{r.studentName}</b>
          <span className="hint">{role === "parent" ? "학부모" : "학생"}</span>
          {r.from_date && (
            <span className="hint">
              {r.from_date.slice(5)}
              {r.to_date && r.to_date !== r.from_date ? `~${r.to_date.slice(5)}` : ""}
            </span>
          )}
          <span className="spacer" />
          {r.canceled_at && <span className="tag tag-muted">보낸 쪽에서 취소</span>}
          {!r.canceled_at && r.handled_at && (
            <span className="tag tag-mint">
              {r.status === "accepted" ? "확인" : "조정"} · {when(r.handled_at)}
            </span>
          )}
        </div>

        {r.body && <div className="hint" style={{ marginTop: 4 }}>{r.body}</div>}
        {(r.photos || []).length > 0 && (
          <div style={{ marginTop: 4 }}>
            <RequestPhotos paths={r.photos} readOnly small />
          </div>
        )}

        {/* 오간 말 — 누가 언제 뭐라고 했는지 그대로 (0108) */}
        {thread.length > 0 && (
          <div className="stack" style={{ gap: 2, marginTop: 6 }}>
            {thread.map((t, i) => (
              <div className="hint" key={i}>
                <b>선생님</b> {when(t.at)} — {t.text}
              </div>
            ))}
          </div>
        )}
        {thread.length === 0 && r.reply && (
          <div className="hint" style={{ marginTop: 6 }}>
            <b>선생님</b> — {r.reply}
          </div>
        )}

        {/* **취소한 것에는 답하지 않는다** — 없던 일로 하자는 뜻이다 */}
        {!r.canceled_at && (
          <>
            {(r.kind === "absence" || r.kind === "makeup") && !done && (
              <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span className="hint">보강</span>
                <input
                  className="input input-sm" type="date" style={{ width: 140 }}
                  value={mk[r.id]?.on || ""}
                  onChange={(e) => setM(r.id, { on: e.target.value })}
                />
                <input
                  className="input input-sm" type="time" style={{ width: 105 }}
                  value={mk[r.id]?.at || ""}
                  onChange={(e) => setM(r.id, { at: e.target.value })}
                />
              </div>
            )}

            <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input
                className="input input-sm"
                style={{ flex: 1, minWidth: 140 }}
                placeholder={done ? "한 번 더 답장하기" : "답장"}
                value={reply[r.id] || ""}
                onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })}
              />
              {/* **빨리 누르는 문구** — 받는 사람에 따라 말투가 다르다 */}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => act(r.id, true, reply[r.id]?.trim() || quickFor(role, true))}
                disabled={pending}
                title={quickFor(role, true)}
              >
                {quickFor(role, true).slice(0, 8)}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => act(r.id, false, reply[r.id]?.trim() || quickFor(role, false))}
                disabled={pending}
                title={quickFor(role, false)}
              >
                조정필요
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="card sect sect-warn">
      <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800 }}>
        학부모 · 학생 알림{" "}
        {live.length > 0 && <span className="tag tag-amber">{live.length}</span>}
      </h2>

      {live.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>새로 온 알림이 없습니다.</p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>{live.map((r) => Row(r, false))}</div>
      )}

      {/* 처리한 것 — 지운 것이 아니다. 무슨 말을 했는지 다시 볼 수 있어야 하고,
          한 번 더 답장할 수도 있어야 한다 */}
      {past.length > 0 && (
        <>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setSeen(!seen)}
          >
            {seen ? "지난 것 접기" : `지난 것 ${past.length}건 보기`}
          </button>
          {seen && (
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {past.map((r) => Row(r, true))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
