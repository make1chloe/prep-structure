"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveText, resetText, resend } from "@/app/resend/actions";
import { unsendLate } from "@/app/today/lateActions";
import { clearLate } from "./actions";
import Mark from "@/components/Mark";
import { sentMark } from "@/lib/reportMark";

/**
 * 하원 안내 모아보기.
 *
 * 보통은 오늘 수업에서 그 자리에서 보낸다 (데리러 오시니까 미룰 수 없다).
 * 여기는 **누가 남았는지 한눈에 보고 빠뜨린 것을 챙기는** 자리다.
 */
export default function LateSender({ date, rows = [], mode = "copy", chans = {} }) {
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
      if (!confirm(`${list.length}건을 앱으로 보낼까요?\n학부모 화면 공지에 올라가고 폰으로 알림이 갑니다.`)) return;
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
          <b style={{ fontSize: 15 }}>{r.name}</b>
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
          {/* 「보냄」 은 lib/reportMark 한 벌 — 리포트·숙제 안내·월간과 같은 아이콘 */}
          {r.lateSentAt && <Mark mark={sentMark(r.lateSentAt, { what: "하원 안내" })} />}
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

      </div>
    );
  }

  /** 오른쪽(폰은 위) — 열린 학생의 문구. 미리보기이자 편집 칸이다 (B2) */
  function panel() {
    const r = targets.find((x) => x.id === openId);
    if (!r) return null;
    return (
      <aside className="card split-panel">
        <div className="row split-head" style={{ gap: 6, alignItems: "center" }}>
          <b style={{ fontSize: 15 }}>{r.name}</b>
          <span className="hint">{r.who}</span>
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>닫기</button>
        </div>
        <div className="split-body">
          <textarea
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: "100%", height: 160, fontSize: 14 }}
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
      </aside>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <p className="hint" style={{ margin: 0 }}>
          단어 재시험·숙제 마무리가 있으면 <b>사유가 자동으로</b> 잡힙니다. 하원 시간은{" "}
          <b>오늘 수업</b> 학생 칸에서 넣으시면 됩니다. 여기는 빠뜨린 학생을 챙기는 자리입니다.
        </p>
        {/* 나가고 나서 「어 이거 문자로 갔네」 를 알면 늦다. 보내기 전에 여기서 말해준다. */}
        <p className="hint" style={{ margin: "8px 0 0" }}>
          이 안내는 <b>앱</b>으로 나갑니다 — 학부모 화면 공지에 올라가고, 그 집 폰으로
          알림이 갑니다. 문자·알림톡은 쓰지 않습니다 (원장님, 2026-08-06).
          어머니께 알림이 뜨려면 <b>앱을 홈 화면에 담고 알림 받기를 켜두셔야</b> 합니다.
        </p>
      </div>

      {targets.length === 0 && (
        <p className="hint">오늘은 늦게 가는 학생이 없습니다.</p>
      )}

      {/* PC(≥1100px)는 좌 대상 목록 / 우 열린 문구 판 (B2, 원장 승인 2026-08-27).
          좁으면 세로 그대로 — 미디어쿼리는 .splitview 가 처리한다. */}
      <div className="splitview">
      <div>
      {todo.length > 0 && (
        <>
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <b style={{ fontSize: 15 }}>보낼 것 {todo.length}</b>
            {/* 하나씩 누르지 않아도 되게 — 대개는 전부 보낸다 */}
            <label className="row" style={{ gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={todo.length > 0 && todo.every((r) => sel.has(r.id))}
                ref={(el) => {
                  if (el) el.indeterminate = sel.size > 0 && !todo.every((r) => sel.has(r.id));
                }}
                onChange={() => {
                  const allOn = todo.every((r) => sel.has(r.id));
                  const n = new Set(sel);
                  todo.forEach((r) => (allOn ? n.delete(r.id) : n.add(r.id)));
                  setSel(n);
                }}
              />
              <span style={{ fontSize: 14, fontWeight: 700 }}>전체</span>
            </label>
            <span className="spacer" />
            {/* 늦게 갈 것 같아 사유가 잡혔는데 제때 간 학생 — 목록에서 뺀다.
                안 보내기만 하면 목록에 그대로 남아 다음에 또 확인하게 된다. */}
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending || sel.size === 0}
              onClick={() => {
                if (!confirm(
                  `고른 ${sel.size}명을 하원 안내 목록에서 뺄까요?\n` +
                  `하원 시간·사유·문구만 지웁니다. 수업 기록은 그대로예요.`
                )) return;
                startTransition(async () => {
                  const r = await clearLate([...sel].filter((id) => todo.some((t) => t.id === id)));
                  if (r?.error) alert(r.error);
                  setSel(new Set());
                  router.refresh();
                });
              }}
            >
              고른 {sel.size}건 빼기
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || sel.size === 0}
              onClick={() => send(todo.filter((r) => sel.has(r.id)))}
            >
              고른 {sel.size}건 보내기
            </button>
          </div>
          {/* 호출식 — <Row/> 태그면 글자마다 리마운트로 커서가 풀린다
              (설정 문구 화면과 같은 처방, 2026-08-21) */}
          {todo.map((r) => Row({ r }))}
        </>
      )}

      {sent.length > 0 && (
        <>
          <b style={{ fontSize: 15, display: "block", margin: "16px 0 8px" }}>
            보낸 것 {sent.length}
          </b>
          {sent.map((r) => Row({ r }))}
        </>
      )}
      </div>
      {panel()}
      </div>
    </div>
  );
}
