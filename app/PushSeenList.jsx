"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReceipts, clearOpenedReceipts } from "./push/receiptActions";

/**
 * 보낸 알림 목록의 **접기·선택·치우기** (원장님, 2026-08-15 — 「선택/삭제/
 * 확인/접기가 필요하지 않나. 지금 실질적으로 사용 안 하고 테스트 중이라
 * 그래?」 — 테스트라서가 아니라 읽기 전용 영수증으로만 만들어서였다).
 *
 * · 기본은 **접혀** 있다 — 못 간 알림(오류)이 있으면 펴서 보여준다.
 *   처리 끝난 스무 줄이 늘 펼쳐져 있으면 대시보드에서 새 문제가 안 보인다.
 * · 확인(열어 본) 알림은 「확인한 것 치우기」 한 번으로 비운다.
 * · 남은 것(오류·미확인)은 ☑ 골라서 치운다 — 전화 드리고 나면 치우는 식.
 * · 치워도 공지·발송 기록은 그대로다 (이 목록의 영수증만 지운다).
 */
const fmt = (t) => {
  if (!t) return null;
  const d = new Date(t);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export default function PushSeenList({ rows = [] }) {
  const bad = rows.filter((r) => r.failedAt).length;
  const unseen = rows.filter((r) => !r.openedAt && !r.failedAt).length;
  const opened = rows.length - bad - unseen;

  const [open, setOpen] = useState(bad > 0);   // 못 간 것이 있으면 바로 보여야 한다
  const [sel, setSel] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { alert(res.error); return; }
      setSel(new Set());
      router.refresh();
    });
  }

  return (
    <div className="card sect sect-calm">
      <button
        onClick={() => setOpen(!open)}
        style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
      >
        <h2 className="secthead" style={{ marginBottom: open ? undefined : 0 }}>
          <span className="muted" style={{ fontSize: 12 }}>{open ? "▾" : "▸"}</span>{" "}
          보낸 알림 {rows.length}건{" "}
          {bad > 0 && <span className="tag tag-red">안 보내짐 {bad}</span>}{" "}
          {unseen > 0 && <span className="tag tag-muted">미확인 {unseen}</span>}{" "}
          {opened > 0 && <span className="tag tag-mint">확인 {opened}</span>}
        </h2>
      </button>

      {open && (
        <>
          {bad > 0 && (
            <div className="notice" style={{ margin: "8px 0", fontSize: 14 }}>
              <b>{bad}건이 폰까지 못 갔습니다.</b> 그 집은 알림이 꺼져 있거나 앱을 지운 상태예요.
            </div>
          )}
          <div className="row" style={{ gap: 6, margin: "6px 0 8px", alignItems: "center" }}>
            {opened > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                title="열어 본 알림을 목록에서 비웁니다 — 공지·발송 기록은 그대로예요"
                onClick={() => run(clearOpenedReceipts)}
              >
                확인한 것 치우기 ({opened})
              </button>
            )}
            {sel.size > 0 && (
              <button
                className="btn btn-primary btn-sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`${sel.size}건을 목록에서 치울까요?\n공지·발송 기록은 그대로 남습니다.`)) return;
                  run(() => deleteReceipts([...sel]));
                }}
              >
                {sel.size}건 치우기
              </button>
            )}
            <span className="hint">줄 앞 체크로 골라서 치울 수 있어요</span>
          </div>
          <div className="stack" style={{ gap: 3 }}>
            {rows.slice(0, 20).map((r) => (
              <div className="unitrow" key={r.id}>
                <input
                  type="checkbox"
                  checked={sel.has(r.id)}
                  onChange={() => {
                    const n = new Set(sel);
                    n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                    setSel(n);
                  }}
                />
                <b style={{ fontSize: 14, minWidth: 92 }}>{r.label}</b>
                <span className="hint" style={{ flex: 1, minWidth: 100 }}>{r.title}</span>
                <span className="hint">{fmt(r.sentAt)}</span>
                {/* 원장님 (2026-08-07): 확인이면 시간만 · 미확인 · 오류 — 세 가지로만 */}
                {r.failedAt ? (
                  <span className="tag tag-red" title={r.failWhy}>오류</span>
                ) : r.openedAt ? (
                  <span className="tag tag-mint">{fmt(r.openedAt)}</span>
                ) : (
                  <span className="tag tag-muted">미확인</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
