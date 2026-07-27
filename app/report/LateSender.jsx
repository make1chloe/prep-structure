"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveText, resetText, resend } from "@/app/resend/actions";
import { unsendLate } from "@/app/today/lateActions";

/**
 * 하원 안내 모아보기.
 *
 * 보통은 오늘 수업에서 그 자리에서 보낸다 (데리러 오시니까 미룰 수 없다).
 * 여기는 **누가 남았는지 한눈에 보고 빠뜨린 것을 챙기는** 자리다.
 */
export default function LateSender({ date, rows = [], mode = "copy" }) {
  const [sel, setSel] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 사유가 잡혔거나 시간을 넣어둔 학생만 대상이다
  const targets = rows.filter(
    (r) => r.lateReasons?.length > 0 || r.lateUntil || r.lateReason || r.lateSentAt
  );
  const todo = targets.filter((r) => !r.lateSentAt);
  const sent = targets.filter((r) => r.lateSentAt);

  function toggle(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  function send(list) {
    if (list.length === 0) return;
    const noTime = list.filter((r) => !r.lateUntil);
    if (
      noTime.length > 0 &&
      !confirm(
        `${noTime.map((r) => r.name).join(", ")} — 하원 시간이 비어 있습니다.\n그래도 보낼까요?`
      )
    )
      return;

    startTransition(async () => {
      const res = await resend(
        list.map((r) => ({ id: r.id, phone: r.phone, name: r.name, body: r.lateText, date })),
        "late"
      );
      if (res?.error) {
        alert(res.error);
        return;
      }
      const failed = res.failed || [];
      alert(
        failed.length === 0
          ? `${res.count}건 보냈어요.`
          : `${res.count}건 보냈고, ${failed.length}건 실패했어요.\n` +
              failed.map((f) => `· ${f.name} — ${f.detail}`).join("\n")
      );
      setSel(new Set());
      router.refresh();
    });
  }

  function Row({ r }) {
    const isOpen = openId === r.id;
    return (
      <div className="card card-tight" style={{ marginBottom: 6 }}>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!r.lateSentAt && (
            <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
          )}
          <b style={{ fontSize: 13.5 }}>{r.name}</b>
          <span className="hint">{r.who}</span>
          {(r.lateReasons || []).map((x) => (
            <span className="tag tag-amber" key={x.key}>{x.label}</span>
          ))}
          {r.lateReason && <span className="tag tag-lav">{r.lateReason}</span>}
          <span className="spacer" />
          {r.lateUntil ? (
            <span className="tag tag-sky">{r.lateUntil} 하원</span>
          ) : (
            <span className="tag tag-muted">시간 미정</span>
          )}
          {!r.phone && <span className="tag tag-red">번호 없음</span>}
          {r.lateSentAt && (
            <span className="tag tag-mint">
              {new Date(r.lateSentAt).toLocaleTimeString("ko-KR", {
                timeZone: "Asia/Seoul",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              보냄
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setOpenId(isOpen ? null : r.id);
              setDraft(r.lateText);
            }}
          >
            {isOpen ? "접기" : "문구"}
          </button>
          {!r.lateSentAt ? (
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => send([r])}>
              보내기
            </button>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await unsendLate(r.id);
                  router.refresh();
                })
              }
            >
              보낸 표시 취소
            </button>
          )}
        </div>

        {isOpen && (
          <div style={{ marginTop: 8 }}>
            <textarea
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ width: "100%", height: 160, fontSize: 12.5 }}
            />
            <div className="row" style={{ gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
              {r.lateEdited && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await resetText(r.id, "late");
                      setOpenId(null);
                      router.refresh();
                    })
                  }
                >
                  자동 문구로 되돌리기
                </button>
              )}
              <button
                className="btn btn-sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await saveText(r.id, "late", draft);
                    if (res?.error) {
                      alert(res.error);
                      return;
                    }
                    setOpenId(null);
                    router.refresh();
                  })
                }
              >
                문구 저장
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <p className="hint" style={{ margin: 0 }}>
          단어 재시험·숙제 마무리가 있으면 <b>사유가 자동으로</b> 잡힙니다. 하원 시간은{" "}
          <b>오늘 수업</b> 학생 칸에서 넣으시면 됩니다. 여기는 빠뜨린 학생을 챙기는 자리입니다.
          {mode === "copy" && " (지금은 직접 발송 모드라 기록만 남습니다)"}
        </p>
      </div>

      {targets.length === 0 && (
        <p className="hint">오늘은 늦게 가는 학생이 없습니다.</p>
      )}

      {todo.length > 0 && (
        <>
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>보낼 것 {todo.length}</b>
            <span className="spacer" />
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || sel.size === 0}
              onClick={() => send(todo.filter((r) => sel.has(r.id)))}
            >
              고른 {sel.size}건 보내기
            </button>
          </div>
          {todo.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </>
      )}

      {sent.length > 0 && (
        <>
          <b style={{ fontSize: 14, display: "block", margin: "16px 0 8px" }}>
            보낸 것 {sent.length}
          </b>
          {sent.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </>
      )}
    </div>
  );
}
